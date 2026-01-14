

// ✅ Use this SAME file content for BOTH paths:
// 1) functions/src/index.ts
// 2) src/functions/src/index.ts
//
// IMPORTANT:
// - Removed: 'use server' (must not be in Cloud Functions)
// - Fixed: invoiceNumber is guaranteed inside onInvoiceCreated (so narration + UI won't break)
// - Kept: your existing features (UPI onCall, order number, JV posting, stock transfer, commissions, notes, milestones, payment approval)

import { onDocumentCreated, onDocumentUpdated, onDocumentWritten, Change, DocumentSnapshot, FirestoreEvent } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type {
  Order,
  SalesInvoice,
  Party,
  Goal,
  UserProfile,
  CreditNote,
  DebitNote,
  RefundRequest,
  Product,
  StockTransferRequest,
  PaymentSubmission,
} from "./types";
import { getNextDocNumber } from "./number-series";
import { createAuditLog } from "./audit";
export { postSalesInvoice } from "./post-sales-invoice";
export { reverseVoucher } from "./reverse-voucher";
export { closeFiscalYear } from "./close-fiscal-year";


if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

/**
 * Aggressive helper to ensure every customer has their OWN specific ledger.
 */
const findOrCreateSpecificCustomerLedger = async (
  transaction: admin.firestore.Transaction,
  order: Order | SalesInvoice | PaymentSubmission
): Promise<string> => {
  // Explicitly determine ID based on which property exists
  let userId = "";
  if ("userId" in order) {
    userId = order.userId;
  } else if ("customerId" in order) {
    userId = order.customerId;
  }

  const customerName = order.customerName;
  // Safely get email if it exists
  const customerEmail = "customerEmail" in order ? (order as any).customerEmail : "";

  const partyRef = db.collection("parties").doc(userId);
  const partySnap = await transaction.get(partyRef);
  let partyData = partySnap.data() as Party | undefined;

  // If party doesn't exist, create it within the transaction
  if (!partySnap.exists) {
    partyData = {
      id: userId,
      name: customerName,
      type: "Customer",
      email: customerEmail,
    } as any;
    transaction.set(partyRef, partyData, { merge: true });
  }

  // 1. If we have a valid ID that isn't the generic string, use it
  if (partyData?.coaLedgerId && partyData.coaLedgerId !== "customer-advances") {
    const ledgerSnap = await transaction.get(db.collection("coa_ledgers").doc(partyData.coaLedgerId));
    if (ledgerSnap.exists) return partyData.coaLedgerId;
  }

  // 2. Try to find an existing ledger by Name
  const ledgerSearchQuery = db.collection("coa_ledgers").where("name", "==", customerName).limit(1);
  const ledgerSearch = await transaction.get(ledgerSearchQuery);
  if (!ledgerSearch.empty) {
    const existingId = ledgerSearch.docs[0].id;
    transaction.set(partyRef, { coaLedgerId: existingId } as any, { merge: true });
    return existingId;
  }

  // 3. Create a NEW specific ledger for this customer
  const newLedgerRef = db.collection("coa_ledgers").doc();
  transaction.set(newLedgerRef, {
    name: customerName,
    groupId: "1.1.2", // Trade Receivables (Asset)
    nature: "ASSET",
    type: "RECEIVABLE",
    posting: { isPosting: true, normalBalance: "DEBIT", allowManualJournal: true },
    status: "ACTIVE",
    openingBalance: { amount: 0, drCr: "DR", asOf: new Date().toISOString() },
  });

  // Also create/update the party document to link it.
  transaction.set(
    partyRef,
    {
      ...(partyData || {}),
      coaLedgerId: newLedgerRef.id,
    } as any,
    { merge: true }
  );

  return newLedgerRef.id;
};

export const verifyUpiPaymentAndCreateOrder = onCall(
  { region: "asia-south1" },
  async (req) => {
    const { order, upiTransactionId } = req.data;

    if (!order?.userId || !upiTransactionId) {
      throw new HttpsError("invalid-argument", "Missing order/userId/upiTransactionId");
    }

    const db = admin.firestore();
    const settingsSnap = await db.doc("company/settings").get();
    const prefixes = settingsSnap.data()?.prefixes;

    // SIMPLIFIED: Using top-level 'orders' collection
    const orderRef = db.collection("orders").doc();
    const paymentRef = db.collection("paymentSubmissions").doc();

    try {
        await db.runTransaction(async (tx) => {
            const orderNumber = await getNextDocNumber(tx, "Sales Order", prefixes);

            tx.set(orderRef, {
                ...order,
                id: orderRef.id, 
                orderNumber,
                status: "Awaiting Payment Confirmation",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            tx.set(paymentRef, {
                userId: order.userId,
                orderId: orderRef.id,
                orderNumber,
                amount: order.paymentReceived,
                paymentMethod: "UPI / Online",
                transactionDetails: upiTransactionId,
                status: "Pending",
                submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                assignedToUid: order.assignedToUid ?? null,
                customerName: order.customerName ?? "",
            });
        });

        return { ok: true, orderId: orderRef.id };

    } catch (error: any) {
      console.error("Order creation transaction failed:", error);
      throw new HttpsError("internal", "An error occurred while creating the order.", {
        message: error?.message,
      });
    }
});


export const handleOrderCreation = onDocumentCreated({ document: "orders/{orderId}", region: "asia-south1" }, async (event) => {
  // This function is now completely empty. The logic has been centralized
  // in the `verifyUpiPaymentAndCreateOrder` callable function to prevent conflicts.
  // We keep the function definition here to avoid deployment errors if it's still
  // declared in Firebase, but it does nothing.
});

/**
 * ✅ UNIFIED INVOICE TRIGGER
 * - Assigns invoiceNumber if missing
 * - Customer ledger + Sales JV
 * - Stock deduction (Partner stock vs Warehouse stock)
 * - COGS JV
 * - Updates source order status
 */
export const onInvoiceCreated = onDocumentCreated({ document: "salesInvoices/{invoiceId}", region: "asia-south1" }, async (event) => {
  const snap = event.data;
  if (!snap) return;

  let invoice = snap.data() as SalesInvoice & { assignedToUid?: string | null; createdByUid?: string };

  const partnerId = invoice.assignedToUid;

  try {
    await db.runTransaction(async (transaction) => {
      // ✅ FIX: Ensure invoiceNumber exists BEFORE using it anywhere
      if (!invoice.invoiceNumber) {
        const settingsSnap = await transaction.get(db.doc("company/settings"));
        const prefixes = settingsSnap.data()?.prefixes;
        const newInvoiceNumber = await getNextDocNumber(transaction, "Sales Invoice", prefixes);
        transaction.update(snap.ref, { invoiceNumber: newInvoiceNumber });
        // Manually update the local object so subsequent logic has the number
        invoice = { ...invoice, invoiceNumber: newInvoiceNumber };
      }

      // 1) ACCOUNTS: Get/Create Customer Ledger
      const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, invoice);

      const getLedgerIdByName = async (name: string): Promise<string | null> => {
        const ledgerQuery = db.collection("coa_ledgers").where("name", "==", name).limit(1);
        const res = await transaction.get(ledgerQuery);
        return res.empty ? null : res.docs[0].id;
      };

      const salesLedgerId = (await getLedgerIdByName("Sales – Domestic")) || "L-4.1-1";

      // 2) SALES JOURNAL VOUCHER
      const salesEntries: any[] = [
        { accountId: customerLedgerId, debit: invoice.grandTotal, credit: 0 },
        { accountId: salesLedgerId, credit: invoice.taxableAmount, debit: 0 },
      ];

      if (invoice.igst && invoice.igst > 0) {
        salesEntries.push({ accountId: "L-2.1.2-3", credit: invoice.igst, debit: 0 });
      } else {
        salesEntries.push({ accountId: "L-2.1.2-1", credit: invoice.cgst || 0, debit: 0 });
        salesEntries.push({ accountId: "L-2.1.2-2", credit: invoice.sgst || 0, debit: 0 });
      }

      const salesJvRef = db.collection("journalVouchers").doc();
      transaction.set(salesJvRef, {
        id: salesJvRef.id,
        date: invoice.date,
        narration: `Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
        entries: salesEntries,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        voucherType: "Sales Voucher",
        createdByUid: invoice.createdByUid || "system",
        orderId: invoice.orderId,
        customerId: invoice.customerId,
      });

      // 3) STOCK DEDUCTION & COGS
      let totalCost = 0;
      const cogsLedgerId = await getLedgerIdByName("COST OF GOODS SOLD (COGS)");
      const finishedGoodsLedgerId = await getLedgerIdByName("Stock-in-Hand – Finished Goods");

      for (const item of invoice.items as any[]) {
        const isPartnerSale = !!partnerId;
        const stockCollectionPath = isPartnerSale ? `users/${partnerId}/stock` : 'products';
        const stockDocRef = db.doc(`${stockCollectionPath}/${item.productId}`);
        const fieldToDecrement = isPartnerSale ? "quantity" : "openingStock";

        // *** NEGATIVE STOCK CHECK ***
        const stockDoc = await transaction.get(stockDocRef);
        if (!stockDoc.exists) {
            throw new Error(`Stock record not found for product ${item.productId}`);
        }
        const currentStock = (stockDoc.data() as any)[fieldToDecrement] || 0;
        if (currentStock < item.quantity) {
            throw new Error(`Insufficient stock for ${item.name} (${item.productId}). Available: ${currentStock}, Required: ${item.quantity}`);
        }
        // *** END CHECK ***
        
        transaction.update(stockDocRef, {
            [fieldToDecrement]: admin.firestore.FieldValue.increment(-item.quantity)
        });

        // Calculate COGS based on original product cost (always from the main product doc)
        const productRef = db.doc(`products/${item.productId}`);
        const productSnap = await transaction.get(productRef);
        if (productSnap.exists) {
          const product = productSnap.data() as Product;
          totalCost += (product?.cost || 0) * item.quantity;
        }
      }

      // 4) COGS JOURNAL VOUCHER
      if (totalCost > 0 && cogsLedgerId && finishedGoodsLedgerId) {
        const cogsJvRef = db.collection("journalVouchers").doc();
        transaction.set(cogsJvRef, {
          id: cogsJvRef.id,
          date: invoice.date,
          narration: `COGS for Invoice ${invoice.invoiceNumber}`,
          entries: [
            { accountId: cogsLedgerId, debit: totalCost, credit: 0 },
            { accountId: finishedGoodsLedgerId, debit: 0, credit: totalCost },
          ],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          voucherType: "Journal Voucher",
          orderId: invoice.orderId,
        });
      }

      // 5) UPDATE SOURCE ORDER STATUS
      if ((invoice as any).orderId) {
        // SIMPLIFIED: Path is now top-level
        transaction.update(db.collection("orders").doc((invoice as any).orderId), { status: "Invoice Sent" });
      }
    });
  } catch (e: any) {
    console.error("Critical Invoice logic failed:", e.message);
    // Optional: Add a mechanism to notify admins of the failure
  }
});

export const onCreditNoteCreated = onDocumentCreated({ document: "creditNotes/{noteId}", region: "asia-south1" }, async (event) => {
  const snap = event.data;
  if (!snap) return;

  const note = snap.data() as CreditNote;
  const batch = db.batch();

  // 1) Create Journal Voucher
  const jvRef = db.collection("journalVouchers").doc();
  const narration = `Credit Note ${note.creditNoteNumber} issued to ${note.partyName} for: ${note.reason}`;

  const partySnap = await db.collection("parties").doc(note.partyId).get();
  const partyData = partySnap.data() as Party | undefined;
  const customerLedgerId = partyData?.coaLedgerId;

  if (!customerLedgerId) {
    console.error(`Could not find ledger for party ${note.partyId}`);
    return;
  }

  const taxableAmount = note.amount / 1.18;
  const gstAmount = note.amount - taxableAmount;

  const entries = [
    { accountId: "L-4.1-1", debit: taxableAmount, credit: 0 },
    { accountId: "L-2.1.2-1", debit: gstAmount / 2, credit: 0 },
    { accountId: "L-2.1.2-2", debit: gstAmount / 2, credit: 0 },
    { accountId: customerLedgerId, debit: 0, credit: note.amount },
  ];

  batch.set(jvRef, {
    date: note.date,
    narration,
    entries,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    voucherType: "Credit Note",
    createdByUid: (snap.data() as any).createdByUid,
  });

  // 2) Create Refund Request
  const refundRequestRef = db.collection("refundRequests").doc();
  const refundRequestData: Omit<RefundRequest, "id"> = {
    orderId: (note as any).originalInvoiceId || "N/A",
    customerId: note.partyId,
    customerName: note.partyName,
    refundAmount: note.amount,
    requestDate: note.date,
    status: "Pending",
  };
  batch.set(refundRequestRef, refundRequestData);

  await batch.commit();
});

export const onDebitNoteCreated = onDocumentCreated({ document: "debitNotes/{noteId}", region: "asia-south1" }, async (event) => {
  const snap = event.data;
  if (!snap) return;

  const note = snap.data() as DebitNote;
  const jvRef = db.collection("journalVouchers").doc();
  const narration = `Debit Note ${note.debitNoteNumber} issued to ${note.partyName} for: ${note.reason}`;

  const partySnap = await db.collection("parties").doc(note.partyId).get();
  const partyData = partySnap.data() as Party | undefined;
  const supplierLedgerId = partyData?.coaLedgerId;

  if (!supplierLedgerId) {
    console.error(`Could not find ledger for party ${note.partyId}`);
    return;
  }

  const taxableAmount = note.amount / 1.18;
  const gstAmount = note.amount - taxableAmount;

  const entries = [
    { accountId: supplierLedgerId, debit: note.amount, credit: 0 },
    { accountId: "L-5-3", debit: 0, credit: taxableAmount },
    { accountId: "L-1.1.4-1", debit: 0, credit: gstAmount / 2 },
    { accountId: "L-1.1.4-2", debit: 0, credit: gstAmount / 2 },
  ];

  await jvRef.set({
    date: note.date,
    narration,
    entries,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    voucherType: "Debit Note",
    createdByUid: (snap.data() as any).createdByUid,
  });
});

export const onStockTransfer = onDocumentUpdated(
  { document: "stockTransferRequests/{requestId}", region: "asia-south1" },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { requestId: string }>) => {
    if (!event.data?.after) return;

    const before = event.data.before.data() as StockTransferRequest;
    const after = event.data.after.data() as StockTransferRequest;

    // Trigger only when status changes to "Shipped"
    if (after.status !== "Shipped" || before.status === "Shipped") {
      console.log(
        `Stock transfer for ${event.params.requestId} not processed. Status: '${after.status}', Before: '${before.status}'.`
      );
      return;
    }

    const partnerId = after.partnerId;
    const itemsToTransfer = after.items as any[];

    try {
      await db.runTransaction(async (transaction) => {
        for (const item of itemsToTransfer) {
          // Decrement stock from main warehouse (products collection)
          const mainProductRef = db.doc(`products/${item.productId}`);
          transaction.update(mainProductRef, {
            openingStock: admin.firestore.FieldValue.increment(-item.quantity),
          });

          // Increment stock in partner's sub-collection
          const partnerStockRef = db.doc(`users/${partnerId}/stock/${item.productId}`);
          transaction.set(
            partnerStockRef,
            { quantity: admin.firestore.FieldValue.increment(item.quantity) },
            { merge: true }
          );
        }
      });

      console.log(`Successfully transferred stock for request ${event.params.requestId} to partner ${partnerId}`);
    } catch (e) {
      console.error(`Stock transfer failed for request ${event.params.requestId}:`, e);
    }
  }
);

export const handleQuotationCreation = onDocumentCreated({ document: "quotations/{docId}", region: "asia-south1" }, async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const data = snapshot.data() as any;
  if (data.quotationNumber) return;

  return db.runTransaction(async (tx) => {
    const settingsSnap = await tx.get(db.doc("company/settings"));
    const prefixes = settingsSnap.data()?.prefixes;
    const newId = await getNextDocNumber(tx, "Sales Quotation", prefixes);
    const createdByUid = data.createdBy;

    tx.update(snapshot.ref, {
      quotationNumber: newId,
      id: FieldValue.delete(),
      createdByUid,
    });
  });
});

export const handleWorkOrderCreation = onDocumentCreated({ document: "workOrders/{id}", region: "asia-south1" }, () => {});
export const handleVoucherCreation = onDocumentCreated({ document: "journalVouchers/{id}", region: "asia-south1" }, () => {});

export const handleOrderUpdates = onDocumentUpdated(
  { document: "orders/{orderId}", region: "asia-south1" },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { orderId: string }>) => {
    if (!event.data) return;

    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;

    // Commission Calculation on Delivery
    if (before.status !== "Delivered" && after.status === "Delivered") {
      const orderId = event.params.orderId;
      console.log(`Order ${orderId} delivered. Processing commissions...`);

      return db.runTransaction(async (transaction) => {
        const orderRef = db.doc(`orders/${orderId}`);

        // 1) Partner Commission
        if (after.assignedToUid) {
          const partnerId = after.assignedToUid!;
          const partnerRef = db.doc(`users/${partnerId}`);
          const partnerSnap = await transaction.get(partnerRef);
          const partnerData = partnerSnap.data() as UserProfile | undefined;

          if (partnerData && (partnerData as any).partnerMatrix) {
            let commissionTotal = (after as any).commission || 0;

            if (!commissionTotal) {
              commissionTotal = (after as any).items.reduce((acc: number, item: any) => {
                const rule = (partnerData as any).partnerMatrix?.find((r: any) => r.category === item.category);
                if (rule) {
                  const itemTotal = item.price * item.quantity;
                  return acc + itemTotal * (rule.commissionRate / 100);
                }
                return acc;
              }, 0);
            }

            if (commissionTotal > 0) {
              const walletRef = db.doc(`users/${partnerId}/wallet/main`);
              transaction.set(
                walletRef,
                { commissionPayable: admin.firestore.FieldValue.increment(commissionTotal) },
                { merge: true }
              );
              transaction.update(orderRef, { payoutStatus: "Payable", commission: commissionTotal } as any);
            } else {
              transaction.update(orderRef, { payoutStatus: "No Commission" } as any);
            }
          } else {
            transaction.update(orderRef, { payoutStatus: "No Commission" } as any);
          }
        }

        // 2) Referral Commission
        const userProfileRef = db.doc(`users/${after.userId}`);
        const userProfileSnap = await transaction.get(userProfileRef);
        const userProfile = userProfileSnap.data() as UserProfile | undefined;

        if (userProfile?.referredBy) {
          const referralsQuery = db
            .collection(`users/${userProfile.referredBy}/referrals`)
            .where("mobile", "==", (userProfile as any).mobile)
            .where("status", "==", "First Purchased")
            .limit(1);

          const referralsSnapshot = await transaction.get(referralsQuery);
          if (!referralsSnapshot.empty) {
            const referralDoc = referralsSnapshot.docs[0];
            const firstPurchaseCommission = (referralDoc.data() as any).commission || 0;

            if (firstPurchaseCommission > 0) {
              const referrerWalletRef = db.doc(`users/${userProfile.referredBy}/wallet/main`);
              transaction.set(
                referrerWalletRef,
                { commissionPayable: admin.firestore.FieldValue.increment(firstPurchaseCommission) },
                { merge: true }
              );
              transaction.update(referralDoc.ref, { status: "Completed" } as any);
            }
          }
        }
      });
    }

    return;
  }
);

export const onMilestoneUpdate = onDocumentWritten(
  { document: "goals/{goalId}/milestones/{milestoneId}", region: "asia-south1" },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined>) => {
    const goalId = (event.params as any).goalId;
    const goalRef = db.collection("goals").doc(goalId);

    return db.runTransaction(async (transaction) => {
      const goalDoc = await transaction.get(goalRef);
      if (!goalDoc.exists) {
        console.log(`Goal ${goalId} not found.`);
        return;
      }

      const goal = goalDoc.data() as Goal;

      const milestonesCollectionRef = goalRef.collection("milestones");
      const milestonesSnapshot = await transaction.get(milestonesCollectionRef);

      const totalMilestones = milestonesSnapshot.size;
      const completedMilestones = milestonesSnapshot.docs.filter((doc) => (doc.data() as any).status === "Done").length;

      const progressPct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
      const currentValue = totalMilestones > 0 ? (progressPct / 100) * (goal as any).targetValue : 0;

      // Determine health status
      const now = new Date();
      const startDate = new Date((goal as any).startDate);
      const endDate = new Date((goal as any).endDate);

      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsedDuration = now.getTime() - startDate.getTime();
      const timeElapsedPct = totalDuration > 0 ? (elapsedDuration / totalDuration) * 100 : 0;

      let health: any = "On Track";
      const progressBehindTime = timeElapsedPct - progressPct;

      if (progressBehindTime > 25) health = "Off Track";
      else if (progressBehindTime > 10) health = "At Risk";

      transaction.update(goalRef, {
        progressPct,
        currentValue,
        health,
      } as any);
    });
  }
);

export const onGoalUpdate = onDocumentCreated({ document: "goalUpdates/{updateId}", region: "asia-south1" }, async () => {});

export const onPaymentApproved = onDocumentUpdated({ document: "paymentSubmissions/{id}", region: "asia-south1" }, async (event) => {
  if (!event.data) return;

  const after = event.data.after.data() as PaymentSubmission;
  const before = event.data.before.data() as PaymentSubmission;

  if (before.status !== "Approved" && after.status === "Approved") {
    // Audit Log
    try {
        const recordedByUid = (after as any).recordedByUid as string | undefined;
        const actor = recordedByUid ? await admin.auth().getUser(recordedByUid) : null;

        await createAuditLog({
          companyId: (after as any).companyId || "default",
          entityType: "paymentSubmissions",
          entityId: event.data.after.id,
          action: "approve",
          actorUid: actor?.uid || "system",
          meta: {
            actorDisplayName: actor?.displayName || "System",
            changes: { before, after },
          },
        });
        
    } catch (auditError) {
        console.error("Failed to create audit log for payment approval:", auditError);
    }
      
    const orderId = (after as any).orderId as string | undefined;
    if (!orderId) {
      console.error("Payment submission approved but orderId is missing:", (after as any).id);
      return;
    }

    const orderRef = db.collection("orders").doc(orderId);

    return db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) {
        console.error(`Order ${orderId} not found for payment submission ${(after as any).id}`);
        return;
      }

      const orderData = orderDoc.data() as any; // keep as any for flexibility

      // CREDIT: Customer
      const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, after);

      // DEBIT: Receiving account (partner cash/bank or company UPI)
      let receivingAccountId: string | null = (after as any).receivingAccountId || null;

      if (!receivingAccountId) {
        // If manual cash and recorded by someone, try to debit their cash ledger
        if ((after as any).paymentMethod === "Cash" && (after as any).recordedByUid) {
          const recorderUid = (after as any).recordedByUid as string;
          const recorderSnap = await transaction.get(db.doc(`users/${recorderUid}`));
          const recorderProfile = recorderSnap.data() as UserProfile | undefined;

          if (recorderProfile?.coaLedgerId) {
            receivingAccountId = recorderProfile.coaLedgerId;
          } else {
            // fallback search by tag
            const ledgerSearch = await transaction.get(
              db.collection("coa_ledgers").where("tags", "array-contains", recorderUid).limit(1)
            );
            receivingAccountId = !ledgerSearch.empty ? ledgerSearch.docs[0].id : "L-1.1.1-1";
          }
        } else {
          // Online UPI: use company primary UPI ledger if available
          const companySnap = await transaction.get(db.doc("company/info"));
          const primaryUpi = (companySnap.data() as any)?.primaryUpiId;

          if (primaryUpi) {
            const ledgerSearchQuery = db.collection("coa_ledgers").where("bank.upiId", "==", primaryUpi).limit(1);
            const ledgerSearch = await transaction.get(ledgerSearchQuery);
            if (!ledgerSearch.empty) receivingAccountId = ledgerSearch.docs[0].id;
          }

          // final fallback if still null
          if (!receivingAccountId) receivingAccountId = "L-1.1.1-1";
        }
      }

      // ✅ Create JV with orderId stored (THIS FIXES MIXED PAYMENT HISTORY)
      if (receivingAccountId && customerLedgerId) {
        const jvRef = db.collection("journalVouchers").doc();
        const orderNumber = orderData?.orderNumber || orderData?.id || orderId;

        transaction.set(jvRef, {
          id: jvRef.id,
          date: new Date().toISOString().split("T")[0],

          narration: `Payment for Order #${orderNumber}. Method: ${(after as any).paymentMethod}. Ref: ${(after as any).transactionDetails}`,

          // ✅ IMPORTANT FIELDS (use these in UI filter)
          orderId: orderId,
          orderNumber: orderNumber,
          customerId: orderData?.userId || (after as any).userId || null,

          voucherType: "Receipt Voucher",
          entries: [
            { accountId: receivingAccountId, debit: (after as any).amount, credit: 0 },
            { accountId: customerLedgerId, debit: 0, credit: (after as any).amount },
          ],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: (after as any).recordedByUid || (after as any).userId || null,
        });
      } else {
        console.error("Could not determine receivingAccountId or customerLedgerId. JV not created for payment:", (after as any).id);
      }

      // Update Order totals + status
      const prevPaid = Number(orderData?.paymentReceived || 0);
      const paidNow = Number((after as any).amount || 0);

      const newTotalPaid = prevPaid + paidNow;
      const grandTotal = Number(orderData?.grandTotal || 0);
      const newBalance = grandTotal - newTotalPaid;

      transaction.update(orderRef, {
        paymentReceived: newTotalPaid,
        balance: newBalance,
        status: newBalance <= 0 ? "Ready for Dispatch" : "Ordered",
      } as any);
    });
  }

  return;
});


export const helloWorld = onCall({ region: "asia-south1" }, (request) => {
    console.log("Hello from Firebase!");
    return { message: "Hello from Firebase!" };
  });

    

    

    


    

    

    

    
