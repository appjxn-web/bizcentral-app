

'use server';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
  FirestoreEvent,
  Change,
  DocumentSnapshot,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import type {Order, SalesInvoice, Party, Goal, UserProfile, CreditNote, DebitNote} from "./types";

if (admin.apps.length === 0) { admin.initializeApp(); }
const db = getFirestore();

/**
 * Aggressive helper to ensure every customer has their OWN specific ledger.
 * It strictly ignores the generic "customer-advances" account.
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

    // 2. Try to find an existing ledger by Name (e.g. "Kartik Kumawat")
    const ledgerSearch = await db.collection('coa_ledgers').where('name', '==', customerName).limit(1).get();
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

    transaction.set(partyRef, { 
        coaLedgerId: newLedgerRef.id, 
        name: customerName, 
        id: userId, 
        type: 'Customer', 
        email: customerEmail 
    }, { merge: true });
    
    return newLedgerRef.id;
};

export const handleOrderCreation = onDocumentCreated("orders/{orderId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const now = new Date();
    const datePrefix = `SO-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, "0")}-`;
    let orderNumber;

    try {
        const lastDocSnapshot = await db.collection("orders")
            .where("orderNumber", ">=", datePrefix)
            .orderBy("orderNumber", "desc")
            .limit(1)
            .get();

        let nextNum = 1;
        if (!lastDocSnapshot.empty) {
            const lastNumStr = lastDocSnapshot.docs[0].data().orderNumber;
            const lastNumFromDb = parseInt(lastNumStr.split("-")[2], 10);
            if (!isNaN(lastNumFromDb)) nextNum = lastNumFromDb + 1;
        }
        orderNumber = `${datePrefix}${nextNum.toString().padStart(4, "0")}`;
    } catch (e) {
        orderNumber = `${datePrefix}0001`;
    }

    await snap.ref.update({ orderNumber });
    const orderDoc = await snap.ref.get();
    const order = orderDoc.data() as Order;
    const pR = order.paymentReceived;

    if (!pR || pR <= 0) return;

    try {
        await db.runTransaction(async (transaction) => {
            const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, order);
            let bankAccountId = "L-1.1.1-2"; // Default Current Account
            
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
                narration: `Advance for Order #${orderNumber} via UPI`,
                voucherType: "Receipt Voucher",
                entries: [
                    { accountId: bankAccountId, debit: pR, credit: 0 },
                    { accountId: customerLedgerId, debit: 0, credit: pR }, 
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
    } catch (error) {
      console.error("Accounting automation failed: ", error);
    }
});

export const onInvoiceCreated = onDocumentCreated("salesInvoices/{invoiceId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const invoice = snap.data() as SalesInvoice;

    try {
      await db.runTransaction(async (transaction) => {
        const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, invoice);
        
        const getLedgerIdByName = async (name: string): Promise<string | null> => {
            const query = db.collection('coa_ledgers').where('name', '==', name).limit(1).get();
            const res = await query;
            return res.empty ? null : res.docs[0].id;
        };

        const salesLedgerId = await getLedgerIdByName("Sales – Domestic") || "L-4.1-1";

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

        // Adjusted: Also use the specific customer ledger for the Advance adjustment
        if (invoice.amountPaid > 0) {
            const adjJvRef = db.collection("journalVouchers").doc();
            transaction.set(adjJvRef, {
                id: adjJvRef.id,
                date: invoice.date,
                narration: `Adjustment of advance for Invoice ${invoice.invoiceNumber}`,
                entries: [
                    { accountId: customerLedgerId, debit: invoice.amountPaid, credit: 0 },
                    { accountId: customerLedgerId, credit: invoice.amountPaid, debit: 0 } // This logic depends on your specific adjustment flow
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                voucherType: "Journal Voucher"
            });
        }
      });
    } catch (e) { console.error(e); }
});

export const onCreditNoteCreated = onDocumentCreated("creditNotes/{noteId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const note = snap.data() as CreditNote;

    const jvRef = db.collection("journalVouchers").doc();
    const narration = `Credit Note ${note.creditNoteNumber} issued to ${note.partyName} for: ${note.reason}`;
    
    // Assuming credit notes are mostly for sales returns.
    // This credits the customer and debits a sales returns account.
    const partySnap = await db.collection('parties').doc(note.partyId).get();
    const partyData = partySnap.data() as Party | undefined;
    const customerLedgerId = partyData?.coaLedgerId;
    if (!customerLedgerId) {
      console.error(`Could not find ledger for party ${note.partyId}`);
      return;
    }

    const jvData = {
      date: note.date,
      narration: narration,
      entries: [
        { accountId: "L-4.1-1", debit: note.amount, credit: 0 }, // Sales Domestic (or a specific Sales Return account)
        { accountId: customerLedgerId, debit: 0, credit: note.amount },
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      voucherType: 'Credit Note'
    };

    await jvRef.set(jvData);
});

export const onDebitNoteCreated = onDocumentCreated("debitNotes/{noteId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const note = snap.data() as DebitNote;

    const jvRef = db.collection("journalVouchers").doc();
    const narration = `Debit Note ${note.debitNoteNumber} issued to ${note.partyName} for: ${note.reason}`;

    // Assuming debit notes are mostly for purchase returns.
    // This debits the supplier and credits a purchase returns account.
    const partySnap = await db.collection('parties').doc(note.partyId).get();
    const partyData = partySnap.data() as Party | undefined;
    const supplierLedgerId = partyData?.coaLedgerId;
    if (!supplierLedgerId) {
      console.error(`Could not find ledger for party ${note.partyId}`);
      return;
    }

    const jvData = {
      date: note.date,
      narration: narration,
      entries: [
        { accountId: supplierLedgerId, debit: note.amount, credit: 0 },
        { accountId: "L-5-3", debit: 0, credit: note.amount }, // Purchase - Raw Material (or a specific Purchase Return account)
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      voucherType: 'Debit Note'
    };

    await jvRef.set(jvData);
});

// Quotation and other functions remain as standard...
export const handleQuotationCreation = onDocumentCreated("quotations/{docId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    if (data.quotationNumber) return;
    try {
      const now = new Date();
      const prefix = `QU-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, "0")}-`;
      const lastQ = await db.collection("quotations").where("quotationNumber", ">=", prefix).orderBy("quotationNumber", "desc").limit(1).get();
      let nextNum = 1;
      if (!lastQ.empty) {
        nextNum = parseInt(lastQ.docs[0].data().quotationNumber.split("-")[2], 10) + 1;
      }
      return snapshot.ref.update({ quotationNumber: `${prefix}${nextNum.toString().padStart(4, "0")}`, id: FieldValue.delete() });
    } catch (error) { return null; }
});

export const handleWorkOrderCreation = onDocumentCreated("workOrders/{id}", () => {});
export const handleVoucherCreation = onDocumentCreated("journalVouchers/{id}", () => {});
export const handleOrderUpdates = onDocumentUpdated("orders/{orderId}", async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined>) => { 
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
export const onMilestoneUpdate = onDocumentWritten("goals/{goalId}/milestones/{milestoneId}", async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined>) => { 
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
export const onGoalUpdate = onDocumentCreated("goalUpdates/{updateId}", async () => {});

    
