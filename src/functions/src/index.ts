
'use server';
import {
  onDocumentCreated,
  onDocumentUpdated,
  FirestoreEvent,
  QueryDocumentSnapshot,
  Change,
  DocumentSnapshot,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import type {Order, SalesInvoice, Product, Party} from "./types";

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

/**
 * Robust helper to ensure every customer has their OWN specific ledger.
 */
const findOrCreateSpecificCustomerLedger = async (transaction: admin.firestore.Transaction, order: Order | SalesInvoice): Promise<string> => {
    const userId = 'userId' in order ? order.userId : order.customerId;
    const customerName = order.customerName;
    const customerEmail = 'customerEmail' in order ? order.customerEmail : '';

    const partyRef = db.collection('parties').doc(userId);
    const partySnap = await transaction.get(partyRef);
    const partyData = partySnap.data() as Party | undefined;

    // 1. If we have a valid ID that isn't the generic string, use it
    if (partyData?.coaLedgerId && partyData.coaLedgerId !== "customer-advances") {
        const ledgerSnap = await transaction.get(db.collection('coa_ledgers').doc(partyData.coaLedgerId));
        if (ledgerSnap.exists) return partyData.coaLedgerId;
    }

    // 2. Try to find an existing ledger by Name
    const ledgerSearch = await db.collection('coa_ledgers').where('name', '==', customerName).limit(1).get();
    if (!ledgerSearch.empty) {
        const existingId = ledgerSearch.docs[0].id;
        transaction.set(partyRef, { coaLedgerId: existingId }, { merge: true });
        return existingId;
    }

    // 3. Otherwise, create a NEW specific ledger
    const newLedgerRef = db.collection('coa_ledgers').doc();
    transaction.set(newLedgerRef, {
        name: customerName,
        groupId: '1.1.2', // Trade Receivables
        nature: 'ASSET',
        type: 'RECEIVABLE',
        posting: { isPosting: true, normalBalance: 'DEBIT', allowManualJournal: true },
        status: 'ACTIVE',
        openingBalance: { amount: 0, drCr: 'DR', asOf: new Date().toISOString() }
    });

    transaction.set(partyRef, { 
        coaLedgerId: newLedgerRef.id, 
        name: customerName, 
        id: userId, 
        type: 'Customer', 
        email: customerEmail 
    }, { merge: true });
    
    return newLedgerRef.id;
};

export const handleOrderCreation = onDocumentCreated("orders/{orderId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const now = new Date();
    const datePrefix = `SO-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, "0")}-`;
    let orderNumber;

    try {
        // FIXED: Using the correct variable name here
        const lastDocSnapshot = await db.collection("orders")
            .where("orderNumber", ">=", datePrefix)
            .orderBy("orderNumber", "desc")
            .limit(1)
            .get();

        let nextNum = 1;
        if (!lastDocSnapshot.empty) {
            const lastNumStr = lastDocSnapshot.docs[0].data().orderNumber;
            const lastNumFromDb = parseInt(lastNumStr.split("-")[2], 10);
            if (!isNaN(lastNumFromDb)) {
                nextNum = lastNumFromDb + 1;
            }
        }
        orderNumber = `${datePrefix}${nextNum.toString().padStart(4, "0")}`;
    } catch (e) {
        console.error("Order Number Generation Error:", e);
        orderNumber = `${datePrefix}0001`;
    }

    await snap.ref.update({ orderNumber });

    // Re-fetch data to get the updated order number
    const orderDoc = await snap.ref.get();
    const order = orderDoc.data() as Order;
    const pR = order.paymentReceived;

    if (!pR || pR <= 0) return;

    try {
        await db.runTransaction(async (transaction) => {
            const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, order);
            
            let bankAccountId = "L-1.1.1-2"; // Default HDFC Bank
            const companySnap = await transaction.get(db.doc("company/info"));
            const primaryUpi = companySnap.data()?.primaryUpiId;
            
            if (primaryUpi) {
                const ledgerSearch = await db.collection("coa_ledgers").where("bank.upiId", "==", primaryUpi).limit(1).get();
                if (!ledgerSearch.empty) bankAccountId = ledgerSearch.docs[0].id;
            }
        
            const jvRef = db.collection("journalVouchers").doc();
            transaction.set(jvRef, {
                id: jvRef.id,
                date: new Date().toISOString().split("T")[0],
                // ADDED VERSION MARKER [V3] TO PROVE NEW CODE IS RUNNING
                narration: `[V3] Advance for Order #${orderNumber} via UPI`,
                voucherType: "Receipt Voucher",
                entries: [
                    { accountId: bankAccountId, debit: pR, credit: 0 },
                    { accountId: customerLedgerId, debit: 0, credit: pR }, 
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
    } catch (error) {
      console.error("Accounting Automation Failed:", error);
    }
  });

export const onInvoiceCreated = onDocumentCreated("salesInvoices/{invoiceId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const invoice = snap.data() as SalesInvoice;

    try {
      await db.runTransaction(async (transaction) => {
        const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, invoice);
        const salesLedgerId = "L-4.1-1"; // Sales – Domestic

        const salesEntries = [
          { accountId: customerLedgerId, debit: invoice.grandTotal, credit: 0 },
          { accountId: salesLedgerId, credit: invoice.taxableAmount, debit: 0 },
        ];

        // Handle GST
        if(invoice.igst && invoice.igst > 0) {
            salesEntries.push({ accountId: "L-2.1.2-3", credit: invoice.igst, debit: 0 });
        } else {
            salesEntries.push({ accountId: "L-2.1.2-1", credit: invoice.cgst || 0, debit: 0 });
            salesEntries.push({ accountId: "L-2.1.2-2", credit: invoice.sgst || 0, debit: 0 });
        }

        const jvRef = db.collection("journalVouchers").doc();
        transaction.set(jvRef, {
          id: jvRef.id,
          date: invoice.date,
          narration: `Sales Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
          entries: salesEntries,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          voucherType: "Sales Voucher"
        });
      });
    } catch (e) { console.error(e); }
  });
