"use server";
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onGoalUpdate = exports.onMilestoneUpdate = exports.handleOrderUpdates = exports.handleVoucherCreation = exports.handleWorkOrderCreation = exports.handleOrderCreation = exports.handleQuotationCreation = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const firestore_2 = require("firebase-admin/firestore");
// Prevent double initialization
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = (0, firestore_2.getFirestore)();
/**
 * Handles the generation of unique quotation numbers.
 * @param {object} event The Cloud Firestore event.
 * @return {Promise<any>|null} A promise that resolves on completion.
 */
exports.handleQuotationCreation = (0, firestore_1.onDocumentCreated)("quotations/{docId}", async (event) => {
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
        // FIX: Set quotationNumber AND delete the bad 'id' data field
        return snapshot.ref.update({
            quotationNumber: finalQuotationNumber,
            id: firestore_2.FieldValue.delete(),
        });
    }
    catch (error) {
        console.error("Error generating quotation number:", error);
        return null;
    }
});
/**
 * Generates the next sequential document number based on month/year prefix.
 * @param {string} prefix The string prefix (e.g., SO).
 * @return {Promise<string>} The generated document ID.
 */
async function getNextDocNumber(prefix) {
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
exports.handleOrderCreation = (0, firestore_1.onDocumentCreated)("orders/{orderId}", async (event) => {
    const snap = event.data;
    if (!snap) {
        return;
    }
    const orderNumber = await getNextDocNumber("SO");
    await snap.ref.update({ orderNumber: orderNumber });
    const updatedSnap = await snap.ref.get();
    const order = updatedSnap.data();
    const pR = order.paymentReceived;
    if (!pR || pR <= 0) {
        return;
    }
    try {
        let bankAccountId = "bank---current-account";
        const companySnap = await db.doc("company/info").get();
        const primaryUpi = companySnap.data()?.primaryUpiId;
        if (primaryUpi) {
            const ledgerSearch = await db.collection("coa_ledgers")
                .where("bank.upiId", "==", primaryUpi)
                .limit(1)
                .get();
            if (!ledgerSearch.empty) {
                bankAccountId = ledgerSearch.docs[0].id;
            }
        }
        return db.runTransaction(async (transaction) => {
            const jvRef = db.collection("journalVouchers").doc();
            const jvData = {
                id: jvRef.id,
                date: new Date().toISOString().split("T")[0],
                narration: `Advance for Order #${orderNumber} via UPI`,
                voucherType: "Receipt Voucher",
                entries: [
                    { accountId: bankAccountId, debit: pR, credit: 0 },
                    { accountId: "customer-advances", debit: 0, credit: pR },
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            transaction.set(jvRef, jvData);
        });
    }
    catch (error) {
        console.error("Accounting Automation Failed:", error);
    }
});
exports.handleWorkOrderCreation = (0, firestore_1.onDocumentCreated)("workOrders/{id}", () => {
    // Empty function to satisfy schema
});
exports.handleVoucherCreation = (0, firestore_1.onDocumentCreated)("journalVouchers/{id}", () => {
    // Empty function to satisfy schema
});
/**
 * Calculates partner commissions upon order delivery.
 */
exports.handleOrderUpdates = (0, firestore_1.onDocumentUpdated)("orders/{orderId}", async (event) => {
    if (!event.data) {
        return;
    }
    const after = event.data.after.data();
    if (after.status !== "Delivered" || !after.assignedToUid) {
        return;
    }
    return db.runTransaction(async (transaction) => {
        const uid = after.assignedToUid;
        const uRef = db.doc(`users/${uid}`);
        const pSnap = await transaction.get(uRef);
        const pData = pSnap.data();
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
            }, { merge: true });
            const oRef = db.doc(`orders/${event.params.orderId}`);
            transaction.update(oRef, { commission: comm });
        }
    });
});
exports.onMilestoneUpdate = (0, firestore_1.onDocumentWritten)("goals/{goalId}/milestones/{milestoneId}", async (event) => {
    const goalId = event.params.goalId;
    const goalRef = db.collection("goals").doc(goalId);
    return db.runTransaction(async (transaction) => {
        const goalDoc = await transaction.get(goalRef);
        if (!goalDoc.exists) {
            console.log(`Goal ${goalId} not found.`);
            return;
        }
        const goal = goalDoc.data();
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
        let health = "On Track";
        const progressBehindTime = timeElapsedPct - progressPct;
        if (progressBehindTime > 25) {
            health = "Off Track";
        }
        else if (progressBehindTime > 10) {
            health = "At Risk";
        }
        transaction.update(goalRef, {
            progressPct: progressPct,
            currentValue: currentValue,
            health: health,
        });
    });
});
exports.onGoalUpdate = (0, firestore_1.onDocumentCreated)("goalUpdates/{updateId}", async (event) => {
    // Placeholder for goal update logic
    console.log("Goal update recorded...");
    return null;
});
//# sourceMappingURL=index.js.map
