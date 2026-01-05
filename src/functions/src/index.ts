
'use server';
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
import type {Order, UserProfile, Goal, SalesInvoice, Product, Party} from "./types";

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
                // ADDED VERSION MARKER [V5] TO PROVE NEW CODE IS RUNNING
                narration: `[V5] Advance for Order #${orderNumber} via UPI`,
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
  
// Keep all other functions from the original file
export const onInvoiceCreated = onDocumentCreated("salesInvoices/{invoiceId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const invoice = snap.data() as SalesInvoice;

    try {
      await db.runTransaction(async (transaction) => {
        const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, invoice);
        
        const getLedgerId = async (name: string): Promise<string | null> => {
            const query = db.collection('coa_ledgers').where('name', '==', name).limit(1);
            const snapshot = await query.get();
            if (snapshot.empty) {
                console.error(`Ledger not found: ${name}`);
                return null;
            }
            return snapshot.docs[0].id;
        };

        const salesLedgerId = await getLedgerId("Sales – Domestic");
        if (!salesLedgerId) throw new Error("Sales ledger not found.");

        const salesEntries = [
          { accountId: customerLedgerId, debit: invoice.grandTotal, credit: 0 },
          { accountId: salesLedgerId, credit: invoice.taxableAmount, debit: 0 },
        ];

        // Handle GST
        if(invoice.igst && invoice.igst > 0) {
            const igstLedgerId = await getLedgerId("Output GST – IGST");
            if(igstLedgerId) salesEntries.push({ accountId: igstLedgerId, credit: invoice.igst, debit: 0 });
        } else {
            const cgstLedgerId = await getLedgerId("Output GST – CGST");
            const sgstLedgerId = await getLedgerId("Output GST – SGST");
            if(cgstLedgerId) salesEntries.push({ accountId: cgstLedgerId, credit: invoice.cgst || 0, debit: 0 });
            if(sgstLedgerId) salesEntries.push({ accountId: sgstLedgerId, credit: invoice.sgst || 0, debit: 0 });
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

export const handleQuotationCreation = onDocumentCreated("quotations/{docId}",
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined>) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }
    const data = snapshot.data();
    // Prevent infinite loops
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
    console.log("Goal update recorded...");
    return null;
  });
