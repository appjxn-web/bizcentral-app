

'use server';
import { onDocumentCreated, onDocumentUpdated, FirestoreEvent, Change, DocumentSnapshot } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { Order, SalesInvoice, Party, UserProfile, Product, PaymentSubmission } from "./types";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getNextDocNumber } from "./number-series";

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = getFirestore();

/**
 * Helper to get/create Customer Ledger
 */
const findOrCreateSpecificCustomerLedger = async (transaction: admin.firestore.Transaction, order: Order | SalesInvoice | PaymentSubmission): Promise<string> => {
    let userId = '';
    if ('userId' in order) userId = order.userId;
    else if ('customerId' in order) userId = order.customerId;

    const partyRef = db.collection('parties').doc(userId);
    const partySnap = await transaction.get(partyRef);
    let partyData = partySnap.data() as Party | undefined;

    if (!partySnap.exists) {
        partyData = { id: userId, name: order.customerName, type: 'Customer', email: (order as any).customerEmail || '' };
        transaction.set(partyRef, partyData, { merge: true });
    }

    if (partyData?.coaLedgerId && partyData.coaLedgerId !== "customer-advances") return partyData.coaLedgerId;

    const ledgerSearch = await transaction.get(db.collection('coa_ledgers').where('name', '==', order.customerName).limit(1));
    if (!ledgerSearch.empty) {
        const existingId = ledgerSearch.docs[0].id;
        transaction.set(partyRef, { coaLedgerId: existingId }, { merge: true });
        return existingId;
    }

    const newLedgerRef = db.collection('coa_ledgers').doc();
    transaction.set(newLedgerRef, {
        name: order.customerName,
        groupId: '1.1.2',
        nature: 'ASSET',
        type: 'RECEIVABLE',
        posting: { isPosting: true, normalBalance: 'DEBIT', allowManualJournal: true },
        status: 'ACTIVE',
        openingBalance: { amount: 0, drCr: 'DR', asOf: new Date().toISOString() }
    });
    transaction.set(partyRef, { coaLedgerId: newLedgerRef.id }, { merge: true });
    return newLedgerRef.id;
};

/**
 * TRIGGER: Payment Approval
 * Handles Accounting Receipt and Auto-Invoice Generation
 */
export const onPaymentApproved = onDocumentUpdated("paymentSubmissions/{id}", async (event) => {
    if (!event.data) return;
    const after = event.data.after.data() as PaymentSubmission;
    const before = event.data.before.data() as PaymentSubmission;

    if (before.status !== 'Approved' && after.status === 'Approved') {
        const orderRef = db.collection('orders').doc(after.orderId);
        
        return db.runTransaction(async (transaction) => {
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists) return;
            const orderData = orderDoc.data() as Order;

            const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, after);
            const debitAccountId = after.receivingAccountId || "THgqiMNmVaXEg4yhtQ6a"; // Fallback to a default bank

            // 1. Create JV for THIS PAYMENT ONLY
            const jvRef = db.collection("journalVouchers").doc();
            transaction.set(jvRef, {
                id: jvRef.id,
                date: new Date().toISOString().split("T")[0],
                narration: `Receipt for Order #${orderData.orderNumber}. Ref: ${after.transactionDetails}`,
                voucherType: "Receipt Voucher",
                entries: [
                    { accountId: debitAccountId, debit: after.amount, credit: 0 },
                    { accountId: customerLedgerId, debit: 0, credit: after.amount }, 
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdByUid: after.recordedByUid || after.userId,
            });

            // 2. Update Order Totals
            const newTotalPaid = (orderData.paymentReceived || 0) + after.amount;
            const newBalance = orderData.grandTotal - newTotalPaid;
            
            transaction.update(orderRef, {
                paymentReceived: newTotalPaid,
                balance: newBalance,
                status: newBalance <= 0 ? 'Ready for Dispatch' : orderData.status
            });

            // 3. AUTOMATIC INVOICE GENERATION
            if (newBalance <= 0) {
                const invoiceRef = db.collection("salesInvoices").doc();
                const settingsSnap = await db.doc('company/settings').get();
                const prefixes = settingsSnap.data()?.prefixes;
                const allInvoices = await db.collection('salesInvoices').get();
                const invNumber = getNextDocNumber('Sales Invoice', prefixes, allInvoices.docs.map(d => d.data()) as any);

                transaction.set(invoiceRef, {
                    id: invoiceRef.id,
                    invoiceNumber: invNumber,
                    orderId: orderData.id,
                    orderNumber: orderData.orderNumber,
                    customerId: orderData.userId,
                    customerName: orderData.customerName,
                    date: new Date().toISOString().split('T')[0],
                    items: orderData.items,
                    subtotal: orderData.subtotal,
                    discount: orderData.discount,
                    taxableAmount: orderData.subtotal - orderData.discount,
                    cgst: orderData.cgst,
                    sgst: orderData.sgst,
                    grandTotal: orderData.grandTotal,
                    amountPaid: orderData.grandTotal,
                    balanceDue: 0,
                    status: 'Paid',
                    assignedToUid: orderData.assignedToUid, 
                    createdByUid: 'system_auto_generate'
                });
            }
        });
    }
});

/**
 * TRIGGER: Invoice Created
 * Handles Sales Accounting and Role-Based Stock Deduction
 */
export const onInvoiceCreated = onDocumentCreated("salesInvoices/{invoiceId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const invoice = snap.data() as SalesInvoice & { assignedToUid?: string | null, createdByUid?: string };
    
    try {
      await db.runTransaction(async (transaction) => {
        // 1. Sales Accounting Journal Voucher
        const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, invoice);
        const salesLedgerId = "L-4.1-1"; // Domestic Sales
        
        const salesEntries = [
          { accountId: customerLedgerId, debit: invoice.grandTotal, credit: 0 },
          { accountId: salesLedgerId, credit: invoice.taxableAmount, debit: 0 },
        ];

        if(invoice.igst && invoice.igst > 0) {
            salesEntries.push({ accountId: "L-2.1.2-3", credit: invoice.igst, debit: 0 }); // IGST Output
        } else {
            salesEntries.push({ accountId: "L-2.1.2-1", credit: invoice.cgst || 0, debit: 0 }); // CGST Output
            salesEntries.push({ accountId: "L-2.1.2-2", credit: invoice.sgst || 0, debit: 0 }); // SGST Output
        }

        const salesJvRef = db.collection("journalVouchers").doc();
        transaction.set(salesJvRef, {
          id: salesJvRef.id,
          date: invoice.date,
          narration: `Sales against Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
          entries: salesEntries,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          voucherType: "Sales Voucher",
          createdByUid: invoice.createdByUid || 'system',
        });
        
        // 2. Stock Deduction
        for (const item of invoice.items) {
            const stockRef = invoice.assignedToUid 
                ? db.doc(`users/${invoice.assignedToUid}/stock/${item.productId}`) 
                : db.doc(`products/${item.productId}`);
            const field = invoice.assignedToUid ? 'quantity' : 'openingStock';
            transaction.set(stockRef, { [field]: admin.firestore.FieldValue.increment(-item.quantity) }, { merge: true });
        }
        
        // 3. Update Order Status
        if (invoice.orderId) {
            transaction.update(db.collection('orders').doc(invoice.orderId), { status: 'Invoice Sent' });
        }
      });
    } catch (e) { console.error("Invoice Logic Failed:", e); }
});

export const handleOrderCreation = onDocumentCreated("orders/{orderId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const settingsSnap = await db.doc('company/settings').get();
    const allOrders = await db.collection('orders').get();
    const orderNumber = getNextDocNumber('Sales Order', settingsSnap.data()?.prefixes, allOrders.docs.map(d => d.data()) as any);
    await snap.ref.update({ orderNumber });
});
