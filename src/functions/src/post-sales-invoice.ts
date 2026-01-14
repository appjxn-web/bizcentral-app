
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

    // Mark POSTING
    tx.update(invoiceRef, {
      status: "POSTING",
      postError: FieldValue.delete(),
      postingStartedAt: FieldValue.serverTimestamp(),
      postingStartedBy: uid,
    });

    // --- Load finance settings (default ledgers) ---
    const settingsSnap = await tx.get(settingsRef);
    const settings = settingsSnap.exists ? (settingsSnap.data() as any) : null;
    if (!settings?.defaultSalesLedgerId || !settings?.defaultGstOutputLedgerId || !settings?.defaultSundryDebtorsGroupId) {
      throw new HttpsError(
        "failed-precondition",
        "Finance settings missing. Set: defaultSalesLedgerId, defaultGstOutputLedgerId, defaultSundryDebtorsGroupId."
      );
    }

    // --- Resolve customer party ledger id (create if missing) ---
    const customerRef = db.doc(`parties/${inv.customerId}`);
    const customerSnap = await tx.get(customerRef);
    if (!customerSnap.exists) throw new HttpsError("failed-precondition", "Customer not found");

    const customer = customerSnap.data() as any;
    let arLedgerId = customer.coaLedgerId as string | undefined;

    if (!arLedgerId) {
      // Create party ledger
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

      // Save mapping
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

    // --- Create voucher + journal entries ---
    const voucherRef = db.collection(`companies/${companyId}/vouchers`).doc();
    const voucherId = voucherRef.id;

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
    });

    const jcol = db.collection(`companies/${companyId}/journal_entries`);

    const salesLedgerId = settings.defaultSalesLedgerId;
    const gstOutputLedgerId = settings.defaultGstOutputLedgerId;

    // 3 journal lines
    const j1 = jcol.doc();
    const j2 = jcol.doc();
    const j3 = jcol.doc();

    tx.set(j1, {
      companyId,
      voucherId,
      voucherType: "SALES_INVOICE",
      voucherDate: inv.invoiceDate,
      lineNo: 1,
      ledgerId: arLedgerId,
      dr: grandTotal,
      cr: 0,
      narration: "Sales Invoice",
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(j2, {
      companyId,
      voucherId,
      voucherType: "SALES_INVOICE",
      voucherDate: inv.invoiceDate,
      lineNo: 2,
      ledgerId: salesLedgerId,
      dr: 0,
      cr: taxablePlusCharges,
      narration: "Sales",
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(j3, {
      companyId,
      voucherId,
      voucherType: "SALES_INVOICE",
      voucherDate: inv.invoiceDate,
      lineNo: 3,
      ledgerId: gstOutputLedgerId,
      dr: 0,
      cr: gstTotal,
      narration: "GST Output",
      createdAt: FieldValue.serverTimestamp(),
    });

    // --- Stock movements (SALES_OUT) ---
    const mvCol = db.collection(`companies/${companyId}/stock_movements`);
    const warehouseId = inv.warehouseId;
    if (!warehouseId) throw new HttpsError("failed-precondition", "warehouseId missing in invoice");

    // ⚠️ Transaction write limit: 500 writes. This is fine for typical invoices.
    items.forEach((it: any, idx: number) => {
      const mvRef = mvCol.doc();
      const qty = Number(it.qty) || 0;
      if (qty <= 0) throw new HttpsError("failed-precondition", "Invalid qty in invoice items");

      const signedQty = outTypes.has("SALES_OUT") ? -qty : qty;

      tx.set(mvRef, {
        companyId,
        type: "SALES_OUT",
        productId: it.productId,
        warehouseId,
        qty,
        signedQty,
        refType: "SALES_INVOICE",
        refId: invoiceId,
        note: inv.invoiceNo ?? "",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
        lineNo: idx + 1,
      });
    });

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
    // If transaction throws, invoice might be left as POSTING only if update succeeded before error.
    // We try best-effort to mark FAILED (non-transactional fallback).
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
    } catch {
      // ignore
    }
    throw err;
  });
});
