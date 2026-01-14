
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

type PostSalesInvoiceInput = {
  companyId: string;
  invoiceId: string;
};

const outTypes = new Set(["SALES_OUT"]);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function monthKey(dateISO: string) {
  // expects "YYYY-MM-DD"
  return (dateISO || "").slice(0, 7);
}

function incLedger(cache: any, ledgerId: string, dr: number, cr: number) {
  if (!cache.ledgers) cache.ledgers = {};
  if (!cache.ledgers[ledgerId]) cache.ledgers[ledgerId] = { dr: 0, cr: 0 };
  cache.ledgers[ledgerId].dr += dr;
  cache.ledgers[ledgerId].cr += cr;
}

function isLocked(postMonth: string, lockUntilMonth?: string) {
  if (!lockUntilMonth) return false;
  return postMonth <= lockUntilMonth; // string compare works for YYYY-MM
}


export const postSalesInvoice = onCall({ region: "asia-south1" }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");

  const { companyId, invoiceId } = (req.data ?? {}) as PostSalesInvoiceInput;
  if (!companyId || !invoiceId) throw new HttpsError("invalid-argument", "companyId and invoiceId required");

  const invoiceRef = db.doc(`companies/${companyId}/sales_invoices/${invoiceId}`);
  const settingsRef = db.doc(`companies/${companyId}/settings/finance`);

  // Transaction keeps the posting consistent and idempotent
  return await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(invoiceRef);
    if (!invSnap.exists) throw new HttpsError("not-found", "Invoice not found");

    const inv = invSnap.data() as any;

    // ✅ Idempotency: if already posted, just return success
    if (inv.status === "POSTED") {
      return { ok: true, invoiceId, voucherId: inv.voucherId ?? null, alreadyPosted: true };
    }

    // Prevent double posting
    if (inv.status === "POSTING") {
      throw new HttpsError("failed-precondition", "Invoice is already posting. Please retry after a few seconds.");
    }

    // Only allow DRAFT/FAILED re-post
    if (!["DRAFT", "FAILED"].includes(inv.status)) {
      throw new HttpsError("failed-precondition", `Invoice status must be DRAFT/FAILED to post. Current: ${inv.status}`);
    }

    // --- Load finance settings (default ledgers & locks) ---
    const settingsSnap = await tx.get(settingsRef);
    const settings = settingsSnap.exists ? (settingsSnap.data() as any) : null;
    if (!settings?.defaultSalesLedgerId || !settings?.defaultGstOutputLedgerId || !settings?.defaultSundryDebtorsGroupId) {
      throw new HttpsError(
        "failed-precondition",
        "Finance settings missing. Set: defaultSalesLedgerId, defaultGstOutputLedgerId, defaultSundryDebtorsGroupId."
      );
    }
    
    // ✅ Period Lock Check
    const postMonth = monthKey(inv.invoiceDate);
    const lockUntilMonth = settings.lockUntilMonth as string | undefined;

    if (isLocked(postMonth, lockUntilMonth)) {
      const allowOverride = !!settings.allowAdminOverrideLock;
      const userIsAdmin = false; // This requires fetching user role, which is complex in rules vs functions.
                                 // For now, we assume non-admin cannot override.
      if (!(allowOverride && userIsAdmin)) {
        throw new HttpsError("failed-precondition", `Period locked. Posting blocked for month ${postMonth}.`);
      }
    }

    // Mark POSTING
    tx.update(invoiceRef, {
      status: "POSTING",
      postError: FieldValue.delete(),
      postingStartedAt: FieldValue.serverTimestamp(),
      postingStartedBy: uid,
    });

    // --- Resolve customer party ledger id (create if missing) ---
    const customerRef = db.doc(`parties/${inv.customerId}`);
    const customerSnap = await tx.get(customerRef);
    if (!customerSnap.exists) throw new HttpsError("failed-precondition", "Customer not found");

    const customer = customerSnap.data() as any;
    let arLedgerId = customer.coaLedgerId as string | undefined;

    if (!arLedgerId) {
      const ledgerRef = db.collection(`coa_ledgers`).doc();
      arLedgerId = ledgerRef.id;

      tx.set(ledgerRef, {
        companyId,
        name: customer.name ?? customer.companyName ?? "Customer",
        groupId: settings.defaultSundryDebtorsGroupId,
        type: "PARTY",
        openingBalance: 0,
        openingBalanceType: "DR",
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.update(customerRef, {
        coaLedgerId: arLedgerId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      });
    }

    // --- Compute totals from invoice ---
    const items = Array.isArray(inv.items) ? inv.items : [];
    if (items.length < 1) throw new HttpsError("failed-precondition", "Invoice must contain items");

    const subTotal = round2(items.reduce((s: number, it: any) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0));
    const gstTotal = round2(
      items.reduce((s: number, it: any) => {
        const amt = (Number(it.qty) || 0) * (Number(it.rate) || 0);
        const gst = (Number(it.gstRate) || 0) / 100;
        return s + amt * gst;
      }, 0)
    );
    const discount = Number(inv.discount) || 0;
    const shipping = Number(inv.shipping) || 0;

    const taxablePlusCharges = round2(subTotal - discount + shipping);
    const grandTotal = round2(taxablePlusCharges + gstTotal);
    
    const salesLedgerId = settings.defaultSalesLedgerId;
    const gstOutputLedgerId = settings.defaultGstOutputLedgerId;
    const month = monthKey(inv.invoiceDate);
    
    // --- Create journal entries ---
    const jcol = db.collection(`companies/${companyId}/journal_entries`);
    const voucherRef = db.collection(`companies/${companyId}/vouchers`).doc();
    const voucherId = voucherRef.id;
    
    const journalLines = [
        { ledgerId: arLedgerId, dr: grandTotal, cr: 0, narration: "Sales Invoice" },
        { ledgerId: salesLedgerId, dr: 0, cr: taxablePlusCharges, narration: "Sales" },
        { ledgerId: gstOutputLedgerId, dr: 0, cr: gstTotal, narration: "GST Output" },
    ];

    journalLines.forEach((line, idx) => {
      const jRef = jcol.doc();
      tx.set(jRef, {
        companyId, voucherId, voucherType: "SALES_INVOICE", voucherDate: inv.invoiceDate, month,
        lineNo: idx + 1, ...line, createdAt: FieldValue.serverTimestamp(),
      });
    });

    // --- Create voucher ---
    tx.set(voucherRef, {
      companyId,
      voucherType: "SALES_INVOICE",
      voucherDate: inv.invoiceDate,
      refNo: inv.invoiceNo,
      narration: inv.note ?? "",
      totalDr: grandTotal,
      totalCr: grandTotal,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      lines: journalLines, // Store lines for easy reversal
    });

    // --- Stock movements (SALES_OUT) ---
    const mvCol = db.collection(`companies/${companyId}/stock_movements`);
    const warehouseId = inv.warehouseId;
    if (!warehouseId) throw new HttpsError("failed-precondition", "warehouseId missing in invoice");

    items.forEach((it: any, idx: number) => {
      const mvRef = mvCol.doc();
      const qty = Number(it.qty) || 0;
      if (qty <= 0) throw new HttpsError("failed-precondition", "Invalid qty in invoice items");
      const signedQty = outTypes.has("SALES_OUT") ? -qty : qty;
      tx.set(mvRef, {
        companyId, type: "SALES_OUT", productId: it.productId, warehouseId,
        qty, signedQty, refType: "SALES_INVOICE", refId: invoiceId, note: inv.invoiceNo ?? "",
        createdAt: FieldValue.serverTimestamp(), createdBy: uid, lineNo: idx + 1,
      });
    });
    
    // --- Update Monthly Report Cache ---
    if (!month || month.length !== 7) {
      throw new HttpsError("failed-precondition", "Invalid invoiceDate for month cache");
    }
    const cacheRef = db.doc(`companies/${companyId}/report_cache/${month}`);
    const cacheSnap = await tx.get(cacheRef);
    const cache = cacheSnap.exists ? (cacheSnap.data() as any) : { month, ledgers: {} };
    
    incLedger(cache, arLedgerId, grandTotal, 0);
    incLedger(cache, salesLedgerId, 0, taxablePlusCharges);
    incLedger(cache, gstOutputLedgerId, 0, gstTotal);

    tx.set(cacheRef, { ...cache, month, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // --- Finalize invoice status ---
    tx.update(invoiceRef, {
      status: "POSTED",
      voucherId,
      subTotal,
      gstTotal,
      grandTotal,
      postedAt: FieldValue.serverTimestamp(),
      postedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });

    return { ok: true, invoiceId, voucherId, alreadyPosted: false };
  }).catch(async (err: any) => {
    try {
      await invoiceRef.set(
        {
          status: "FAILED",
          postError: err?.message ?? String(err),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid ?? null,
        },
        { merge: true }
      );
    } catch {}
    throw err;
  });
});

    