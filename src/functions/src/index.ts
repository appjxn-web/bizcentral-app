
'use server';
/**
 * @fileoverview Cloud Functions for Firebase.
 *
 * This file contains the backend logic that triggers on certain Firestore
 * events, such as document creation or updates. It is responsible for
 * automating tasks like generating sequential document numbers, creating
 * accounting entries, and calculating commissions.
 */

import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
  FirestoreEvent,
  QueryDocumentSnapshot,
  Change,
  DocumentSnapshot,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import type {Order, SalesInvoice, Product, Party, Goal, UserProfile} from "./types";

// Prevent double initialization in a deployed environment
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

/**
 * Robust helper to ensure every customer has their OWN specific ledger.
 * It strictly ignores the generic "customer-advances" account.
 */
const findOrCreateSpecificCustomerLedger = async (transaction: admin.firestore.Transaction, order: Order | SalesInvoice): Promise<string> => {
    const userId = 'userId' in order ? order.userId : order.customerId;
    const customerName = order.customerName;
    const customerEmail = 'customerEmail' in order ? ('customerEmail' in order ? order.customerEmail : '') : '';


    const partyRef = db.collection('parties').doc(userId);
    const partySnap = await transaction.get(partyRef);
    const partyData = partySnap.data() as Party | undefined;

    // Check if linked ledger is valid AND not the generic one
    if (partyData?.coaLedgerId && partyData.coaLedgerId !== "customer-advances") {
        const ledgerSnap = await transaction.get(db.collection('coa_ledgers').doc(partyData.coaLedgerId));
        if (ledgerSnap.exists) return partyData.coaLedgerId;
    }

    // Try finding by name (e.g. "Kartik Kumawat")
    const existingLedgerQuery = db.collection('coa_ledgers').where('name', '==', customerName).limit(1);
    const existingLedgerSnapshot = await transaction.get(existingLedgerQuery);
    
    if (!existingLedgerSnapshot.empty) {
        const existingId = existingLedgerSnapshot.docs[0].id;
        transaction.set(partyRef, { coaLedgerId: existingId, name: customerName, id: userId, type: 'Customer', email: customerEmail }, { merge: true });
        return existingId;
    }

    // Create a brand new specific ledger
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


/**
 * Handles the generation of unique quotation numbers.
 * @param {object} event The Cloud Firestore event.
 * @return {Promise<any>|null} A promise that resolves on completion.
 */
export const handleQuotationCreation = onDocumentCreated("quotations/{docId}",
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined>) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }
    const data = snapshot.data();
    if (data.quotationNumber) {
      return;
    }

    try {
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, "0");
      const prefix = `QU-${year}${month}-`;

      const lastQuotationQuery = await db.collection("quotations")
        .where("quotationNumber", ">=", prefix)
        .where("quotationNumber", "<", prefix + "\uf8ff")
        .orderBy("quotationNumber", "desc")
        .limit(1)
        .get();

      let nextNumber = 1;
      if (!lastQuotationQuery.empty) {
        const lastNo = lastQuotationQuery.docs[0].data().quotationNumber;
        const lastSequence = parseInt(lastNo.split("-")[2], 10);
        if (!isNaN(lastSequence)) {
          nextNumber = lastSequence + 1;
        }
      }

      const nextNumStr = nextNumber.toString().padStart(4, "0");
      const finalQuotationNumber = `${prefix}${nextNumStr}`;

      return snapshot.ref.update({
        quotationNumber: finalQuotationNumber,
        id: FieldValue.delete(),
      });
    } catch (error) {
      console.error("Error generating quotation number:", error);
      return null;
    }
  });

/**
 * Handles the creation of Sales Orders and associated accounting entries.
 */
export const handleOrderCreation = onDocumentCreated("orders/{orderId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    // 1. Generate SO Number
    const now = new Date();
    const datePrefix = `SO-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, "0")}-`;
    let orderNumber;
    try {
        const lastDocQuery = await db.collection("orders").where("orderNumber", ">=", datePrefix).orderBy("orderNumber", "desc").limit(1).get();
        let nextNum = 1;
        if (!lastDoc.empty) {
            const lastNumStr = lastDoc.docs[0].data().orderNumber;
            const lastNumFromDb = parseInt(lastNumStr.split("-")[2], 10);
            if (!isNaN(lastNumFromDb)) {
                nextNum = lastNumFromDb + 1;
            }
        }
        orderNumber = `${datePrefix}${nextNum.toString().padStart(4, "0")}`;
    } catch (e) {
        // Fallback for initial creation or query error
        orderNumber = `${datePrefix}0001`;
    }
    await snap.ref.update({ orderNumber });

    const order = (await snap.ref.get()).data() as Order;
    const pR = order.paymentReceived;
    if (!pR || pR <= 0) return;

    try {
        await db.runTransaction(async (transaction) => {
            const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, order);
            
            // Find Bank Ledger
            let bankAccountId = "L-1.1.1-2"; // Default Bank
            const companySnap = await transaction.get(db.doc("company/info"));
            const primaryUpi = companySnap.data()?.primaryUpiId;
            if (primaryUpi) {
                const ledgerSearchQuery = db.collection("coa_ledgers").where("bank.upiId", "==", primaryUpi).limit(1);
                const ledgerSearch = await transaction.get(ledgerSearchQuery);
                if (!ledgerSearch.empty) bankAccountId = ledgerSearch.docs[0].id;
            }
        
            const jvRef = db.collection("journalVouchers").doc();
            transaction.set(jvRef, {
                id: jvRef.id,
                date: new Date().toISOString().split("T")[0],
                narration: `Advance for Order #${orderNumber} via UPI`,
                voucherType: "Receipt Voucher",
                entries: [
                    { accountId: bankAccountId, debit: pR, credit: 0 },
                    { accountId: customerLedgerId, debit: 0, credit: pR }, // Credit Customer specific ledger
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
    } catch (error) {
      console.error("Accounting Automation Failed:", error);
    }
  });


export const handleWorkOrderCreation = onDocumentCreated(
  "workOrders/{id}",
  () => {
    // Empty function to satisfy schema
  });

export const handleVoucherCreation = onDocumentCreated(
  "journalVouchers/{id}",
  () => {
    // Empty function to satisfy schema
  });

/**
 * Calculates partner commissions upon order delivery.
 */
export const handleOrderUpdates = onDocumentUpdated("orders/{orderId}",
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined>) => {
    if (!event.data) {
      return;
    }
    const after = event.data.after.data() as Order;
    if (after.status !== "Delivered" || !after.assignedToUid) {
      return;
    }

    return db.runTransaction(async (transaction) => {
      const uid = after.assignedToUid as string;
      const uRef = db.doc(`users/${uid}`);
      const pSnap = await transaction.get(uRef);
      const pData = pSnap.data() as UserProfile;
      if (!pData?.partnerMatrix) {
        return;
      }

      let comm = 0;
      after.items.forEach((item) => {
        const m = pData.partnerMatrix;
        const rule = m?.find((x) => x.category === item.category);
        if (rule) {
          const subTot = item.price * item.quantity;
          comm += (subTot * (rule.commissionRate / 100));
        }
      });

      if (comm > 0) {
        const wRef = db.doc(`users/${uid}/wallet/main`);
        transaction.set(wRef, {
          commissionPayable: admin.firestore.FieldValue.increment(comm),
        }, {merge: true});
        const oRef = db.doc(`orders/${event.params.orderId}`);
        transaction.update(oRef, {commission: comm});
      }
    });
  });

export const onMilestoneUpdate = onDocumentWritten(
  "goals/{goalId}/milestones/{milestoneId}", async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined>) => {
    const goalId = event.params.goalId;
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
      const completedMilestones = milestonesSnapshot.docs
        .filter((doc) => doc.data().status === "Done").length;

      const progressPct = totalMilestones > 0 ?
        Math.round((completedMilestones / totalMilestones) * 100) :
        0;
      const currentValue = totalMilestones > 0 ?
        (progressPct / 100) * goal.targetValue :
        0;

      // Determine health status
      const now = new Date();
      const startDate = new Date(goal.startDate);
      const endDate = new Date(goal.endDate);

      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsedDuration = now.getTime() - startDate.getTime();
      const timeElapsedPct = totalDuration > 0 ?
        (elapsedDuration / totalDuration) * 100 :
        0;

      let health: Goal["health"] = "On Track";
      const progressBehindTime = timeElapsedPct - progressPct;

      if (progressBehindTime > 25) {
        health = "Off Track";
      } else if (progressBehindTime > 10) {
        health = "At Risk";
      }

      transaction.update(goalRef, {
        progressPct: progressPct,
        currentValue: currentValue,
        health: health,
      });
    });
  });

export const onGoalUpdate = onDocumentCreated("goalUpdates/{updateId}",
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined>) => {
    // Placeholder for goal update logic
    console.log("Goal update recorded...");
    return null;
  });

// New Function to handle Invoice Creation
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

    