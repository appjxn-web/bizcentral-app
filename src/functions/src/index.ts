
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

// Prevent double initialization
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

// Helper function to find a ledger by name if it exists
const getLedgerIdByName = async (name: string): Promise<string | null> => {
    const query = db.collection('coa_ledgers').where('name', '==', name).limit(1);
    const snapshot = await query.get();
    if (snapshot.empty) {
        console.warn(`Ledger not found by name: ${name}`);
        return null;
    }
    return snapshot.docs[0].id;
};

// Helper function to find or create a party and its ledger
const findOrCreatePartyAndLedger = async (transaction: admin.firestore.Transaction, order: Order): Promise<string> => {
    const partyRef = db.collection('parties').doc(order.userId);
    const partySnap = await transaction.get(partyRef);
    const partyData = partySnap.data() as Party | undefined;

    if (partyData?.coaLedgerId) {
        const ledgerSnap = await transaction.get(db.collection('coa_ledgers').doc(partyData.coaLedgerId));
        if (ledgerSnap.exists) {
            return partyData.coaLedgerId;
        }
    }

    const ledgerName = order.customerName;
    const existingLedgerIdByName = await getLedgerIdByName(ledgerName);
    if(existingLedgerIdByName) {
        if(!partySnap.exists) {
            transaction.set(partyRef, { name: ledgerName, type: 'Customer', coaLedgerId: existingLedgerIdByName, id: order.userId });
        } else if (!partyData?.coaLedgerId) {
            transaction.update(partyRef, { coaLedgerId: existingLedgerIdByName });
        }
        return existingLedgerIdByName;
    }

    const newLedgerRef = db.collection('coa_ledgers').doc();
    transaction.set(newLedgerRef, {
        name: ledgerName,
        groupId: '1.1.2', // Trade Receivables
        nature: 'ASSET',
        type: 'RECEIVABLE',
        posting: { isPosting: true, normalBalance: 'DEBIT' },
        status: 'ACTIVE',
    });

    transaction.set(partyRef, { 
        name: ledgerName, 
        type: 'Customer', 
        coaLedgerId: newLedgerRef.id,
        email: order.customerEmail,
        id: order.userId,
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
 * Generates the next sequential document number based on month/year prefix.
 * @param {string} prefix The string prefix (e.g., SO).
 * @return {Promise<string>} The generated document ID.
 */
async function getNextDocNumber(prefix: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const datePrefix = `${prefix}-${year}${month}-`;

  let nextNumber = 1;
  const lastDocQuery = await db.collection("orders")
    .where("orderNumber", ">=", datePrefix)
    .where("orderNumber", "<", `${datePrefix}\uf8ff`)
    .orderBy("orderNumber", "desc")
    .limit(1)
    .get();

  if (!lastDocQuery.empty) {
    const lastNumStr = lastDocQuery.docs[0].data().orderNumber;
    const lastNum = parseInt(lastNumStr.split("-")[2], 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }
  const paddedNum = nextNumber.toString().padStart(4, "0");
  return `${datePrefix}${paddedNum}`;
}

/**
 * Handles the creation of Sales Orders and associated accounting entries.
 */
export const handleOrderCreation = onDocumentCreated("orders/{orderId}",
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined>) => {
    const snap = event.data;
    if (!snap) {
      return;
    }

    const orderNumber = await getNextDocNumber("SO");
    await snap.ref.update({orderNumber: orderNumber});

    const updatedSnap = await snap.ref.get();
    const order = updatedSnap.data() as Order;

    const pR = order.paymentReceived;
    if (!pR || pR <= 0) {
      return;
    }

    try {
        return db.runTransaction(async (transaction) => {
            const customerLedgerId = await findOrCreatePartyAndLedger(transaction, order);
            let bankAccountId = "bank---current-account"; // Fallback
            const companySnap = await db.doc("company/info").get();
            const primaryUpi = companySnap.data()?.primaryUpiId;

            if (primaryUpi) {
                const ledgerSearch = await db.collection("coa_ledgers").where("bank.upiId", "==", primaryUpi).limit(1).get();
                if (!ledgerSearch.empty) {
                    bankAccountId = ledgerSearch.docs[0].id;
                }
            }
        
            const jvRef = db.collection("journalVouchers").doc();
            const jvData = {
                id: jvRef.id,
                date: new Date().toISOString().split("T")[0],
                narration: `Advance for Order #${orderNumber} via UPI`,
                voucherType: "Receipt Voucher",
                entries: [
                    {accountId: bankAccountId, debit: pR, credit: 0},
                    // Credit the specific customer's ledger, not the generic "Customer Advances"
                    {accountId: customerLedgerId, debit: 0, credit: pR},
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            transaction.set(jvRef, jvData);
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
        // --- 1. Main Sales Journal Voucher ---
        const jvRef = db.collection("journalVouchers").doc();
        
        const customerLedgerId = (await transaction.get(db.doc(`parties/${invoice.customerId}`))).data()?.coaLedgerId || await getLedgerIdByName(invoice.customerName) || await getLedgerIdByName("Trade Debtors – Domestic");
        if (!customerLedgerId) throw new Error("Customer ledger not found.");

        const salesLedgerId = await getLedgerIdByName("Sales – Domestic");
        if (!salesLedgerId) throw new Error("Sales ledger not found.");
        
        const salesEntries = [
          { accountId: customerLedgerId, debit: invoice.grandTotal, credit: 0 },
          { accountId: salesLedgerId, credit: invoice.taxableAmount, debit: 0 },
        ];

        if(invoice.igst && invoice.igst > 0) {
            const igstLedgerId = await getLedgerIdByName("Output GST – IGST");
            if(igstLedgerId) salesEntries.push({ accountId: igstLedgerId, credit: invoice.igst, debit: 0 });
        } else {
            const cgstLedgerId = await getLedgerIdByName("Output GST – CGST");
            const sgstLedgerId = await getLedgerIdByName("Output GST – SGST");
            if(cgstLedgerId) salesEntries.push({ accountId: cgstLedgerId, credit: invoice.cgst || 0, debit: 0 });
            if(sgstLedgerId) salesEntries.push({ accountId: sgstLedgerId, credit: invoice.sgst || 0, debit: 0 });
        }

        const jvData = {
          date: invoice.date,
          narration: `Sales Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
          entries: salesEntries,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          voucherType: "Sales Voucher"
        };
        transaction.set(jvRef, jvData);
        
        // --- 3. Handle Cost of Goods Sold (COGS) ---
        let cogsAmount = 0;
        const cogsEntries = [];

        for (const item of invoice.items) {
          const productSnap = await transaction.get(db.doc(`products/${item.productId}`));
          const product = productSnap.data() as Product;
          if (product && product.cost) {
            const itemCost = product.cost * item.quantity;
            cogsAmount += itemCost;
            
            const inventoryLedgerId = product.coaAccountId || await getLedgerIdByName("Stock-in-Hand – Finished Goods");
            if (!inventoryLedgerId) throw new Error(`Inventory ledger for product ${product.name} not found.`);
            
            cogsEntries.push({ accountId: inventoryLedgerId, credit: itemCost, debit: 0 });
          }
        }

        if (cogsAmount > 0) {
            const cogsJvRef = db.collection("journalVouchers").doc();
            const cogsLedgerId = await getLedgerIdByName("COST OF GOODS SOLD (COGS)");
            if (!cogsLedgerId) throw new Error("COGS ledger not found.");

            cogsEntries.unshift({ accountId: cogsLedgerId, debit: cogsAmount, credit: 0 });

            const cogsJvData = {
                date: invoice.date,
                narration: `COGS for Invoice ${invoice.invoiceNumber}`,
                entries: cogsEntries,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                voucherType: "Journal Voucher"
            };
            transaction.set(cogsJvRef, cogsJvData);
        }
      });
    } catch (e) {
      console.error("Invoice JV creation failed: ", e);
    }
  });
