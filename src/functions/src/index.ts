
'use server';
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import type {Order, SalesInvoice, Party, PaymentSubmission} from "./types";
import { getNextDocNumber } from "./number-series";

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = getFirestore();

/**
 * Aggressive helper to ensure every customer has their OWN specific ledger.
 */
const findOrCreateSpecificCustomerLedger = async (transaction: admin.firestore.Transaction, order: Order | SalesInvoice | PaymentSubmission): Promise<string> => {
    // Explicitly determine ID based on which property exists
    let userId = '';
    if ('userId' in order) {
        userId = order.userId;
    } else if ('customerId' in order) {
        userId = order.customerId;
    }

    const customerName = order.customerName;
    // Safely get email if it exists
    const customerEmail = ('customerEmail' in order) ? (order as any).customerEmail : '';

    const partyRef = db.collection('parties').doc(userId);
    const partySnap = await transaction.get(partyRef);
    let partyData = partySnap.data() as Party | undefined;

    // If party doesn't exist, create it within the transaction
    if (!partySnap.exists) {
        partyData = { 
            id: userId,
            name: customerName, 
            type: 'Customer', 
            email: customerEmail 
        };
        transaction.set(partyRef, partyData, { merge: true });
    }

    // 1. If we have a valid ID that isn't the generic string, use it
    if (partyData?.coaLedgerId && partyData.coaLedgerId !== "customer-advances") {
        const ledgerSnap = await transaction.get(db.collection('coa_ledgers').doc(partyData.coaLedgerId));
        if (ledgerSnap.exists) return partyData.coaLedgerId;
    }

    // 2. Try to find an existing ledger by Name (e.g. "Kartik Kumawat")
    const ledgerSearchQuery = db.collection('coa_ledgers').where('name', '==', customerName).limit(1);
    const ledgerSearch = await transaction.get(ledgerSearchQuery);
    if (!ledgerSearch.empty) {
        const existingId = ledgerSearch.docs[0].id;
        transaction.set(partyRef, { coaLedgerId: existingId }, { merge: true });
        return existingId;
    }

    // 3. Create a NEW specific ledger for this customer
    const newLedgerRef = db.collection('coa_ledgers').doc();
    transaction.set(newLedgerRef, {
        name: customerName,
        groupId: '1.1.2', // Trade Receivables (Asset)
        nature: 'ASSET',
        type: 'RECEIVABLE',
        posting: { isPosting: true, normalBalance: 'DEBIT', allowManualJournal: true },
        status: 'ACTIVE',
        openingBalance: { amount: 0, drCr: 'DR', asOf: new Date().toISOString() }
    });

    // Also create/update the party document to link it.
    transaction.set(partyRef, { 
        ...partyData,
        coaLedgerId: newLedgerRef.id, 
    }, { merge: true });
    
    return newLedgerRef.id;
};

export const handleOrderCreation = onDocumentCreated("orders/{orderId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const prefixesSnap = await db.doc('company/settings').get();
    const prefixes = prefixesSnap.data()?.prefixes;
    const allOrders = await db.collection('orders').get();
    const allOrdersData = allOrders.docs.map(d => d.data());

    const orderNumber = getNextDocNumber('Sales Order', prefixes, allOrdersData as any[]);
    
    await snap.ref.update({ orderNumber });
});

export const onInvoiceCreated = onDocumentCreated("salesInvoices/{invoiceId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const invoice = snap.data() as SalesInvoice & { assignedToUid?: string | null, createdByUid?: string };
    
    const partnerId = invoice.assignedToUid;

    try {
      await db.runTransaction(async (transaction) => {
        // 1. ACCOUNTS: Get/Create Customer Ledger
        const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, invoice);
        
        const getLedgerIdByName = async (name: string): Promise<string | null> => {
            const ledgerQuery = db.collection('coa_ledgers').where('name', '==', name).limit(1);
            const res = await transaction.get(ledgerQuery);
            return res.empty ? null : res.docs[0].id;
        };

        const salesLedgerId = await getLedgerIdByName("Sales – Domestic") || "L-4.1-1";

        // 2. SALES JOURNAL VOUCHER
        const salesEntries = [
          { accountId: customerLedgerId, debit: invoice.grandTotal, credit: 0 },
          { accountId: salesLedgerId, credit: invoice.taxableAmount, debit: 0 },
        ];

        if(invoice.igst && invoice.igst > 0) {
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
          createdByUid: invoice.createdByUid || 'system',
        });

        // 3. STOCK DEDUCTION & COGS
        let totalCost = 0;
        const cogsLedgerId = await getLedgerIdByName("COST OF GOODS SOLD (COGS)");
        const finishedGoodsLedgerId = await getLedgerIdByName("Stock-in-Hand – Finished Goods");

        for (const item of invoice.items) {
            /**
             * CRITICAL LOGIC: 
             * If invoice has assignedToUid, deduct from Partner stock: users/{partnerId}/stock/{prodId}
             * Else, deduct from Warehouse: products/{prodId}
             */
            const isPartnerSale = !!partnerId;
            const stockRef = isPartnerSale
                ? db.doc(`users/${partnerId}/stock/${item.productId}`)
                : db.doc(`products/${item.productId}`);
                
            const fieldToDecrement = isPartnerSale ? 'quantity' : 'openingStock';
            
            transaction.set(stockRef, {
                [fieldToDecrement]: admin.firestore.FieldValue.increment(-item.quantity)
            }, { merge: true });
            
            // Calculate COGS based on original product cost
            const productRef = db.doc(`products/${item.productId}`);
            const productSnap = await transaction.get(productRef);
            if (productSnap.exists) {
                const product = productSnap.data() as any;
                totalCost += (product?.cost || 0) * item.quantity;
            }
        }

        // 4. COGS JOURNAL VOUCHER
        if (totalCost > 0 && cogsLedgerId && finishedGoodsLedgerId) {
            const cogsJvRef = db.collection("journalVouchers").doc();
            transaction.set(cogsJvRef, {
                id: cogsJvRef.id,
                date: invoice.date,
                narration: `COGS for Invoice ${invoice.invoiceNumber}`,
                entries: [
                    { accountId: cogsLedgerId, debit: totalCost, credit: 0 },
                    { accountId: finishedGoodsLedgerId, debit: 0, credit: totalCost }
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                voucherType: "Journal Voucher",
            });
        }
        
        // 5. UPDATE SOURCE ORDER STATUS
        if (invoice.orderId) {
            transaction.update(db.collection('orders').doc(invoice.orderId), { 
                status: 'Invoice Sent' 
            });
        }
      });
    } catch (e) { 
        console.error("Critical Invoice logic failed:", e); 
    }
});


export const onPaymentApproved = onDocumentUpdated("paymentSubmissions/{id}", async (event) => {
    if (!event.data) return;
    const after = event.data.after.data() as PaymentSubmission;
    const before = event.data.before.data() as PaymentSubmission;

    // Only run if status changes to 'Approved'
    if (before.status === 'Approved' || after.status !== 'Approved') {
        return;
    }
    
    const orderRef = db.collection('orders').doc(after.orderId);
    
    return db.runTransaction(async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) {
            console.error(`Order ${after.orderId} not found for payment submission ${after.id}`);
            return;
        }
        const orderData = orderDoc.data() as Order;

        // 1. Create Journal Voucher for this specific payment
        const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, after);
        let receivingAccountId: string | null = after.receivingAccountId || null;
        
        if (!receivingAccountId) {
            if (after.paymentMethod === 'Cash' && after.recordedByUid) {
                const recorderSnap = await transaction.get(db.doc(`users/${after.recordedByUid}`));
                const recorderProfile = recorderSnap.data() as any | undefined;
                receivingAccountId = recorderProfile?.coaLedgerId || "L-1.1.1-1"; 
            } else { 
                const companySnap = await transaction.get(db.doc("company/info"));
                const primaryUpi = companySnap.data()?.primaryUpiId;
                if (primaryUpi) {
                    const ledgerSearchQuery = db.collection("coa_ledgers").where("bank.upiId", "==", primaryUpi).limit(1);
                    const ledgerSearch = await transaction.get(ledgerSearchQuery);
                    if (!ledgerSearch.empty) {
                        receivingAccountId = ledgerSearch.docs[0].id;
                    }
                }
            }
        }
        
        if (receivingAccountId && customerLedgerId) {
            const jvRef = db.collection("journalVouchers").doc();
            transaction.set(jvRef, {
                id: jvRef.id,
                date: new Date().toISOString().split("T")[0],
                narration: `Payment for Order #${orderData.orderNumber || orderData.id}. Method: ${after.paymentMethod}. Ref: ${after.transactionDetails}`,
                voucherType: "Receipt Voucher",
                entries: [
                    { accountId: receivingAccountId, debit: after.amount, credit: 0 },
                    { accountId: customerLedgerId, debit: 0, credit: after.amount }, 
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdByUid: after.recordedByUid || after.userId,
            });
        } else {
             console.error("Could not determine receiving account. JV not created for payment:", after.id);
        }

        // 2. Update Order Totals and Status
        const newTotalPaid = (orderData.paymentReceived || 0) + after.amount;
        const newBalance = orderData.grandTotal - newTotalPaid;
        
        transaction.update(orderRef, {
            paymentReceived: newTotalPaid,
            balance: newBalance,
            status: newBalance <= 0 ? 'Ready for Dispatch' : 'Ordered'
        });
    });
});
    
