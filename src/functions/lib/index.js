
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
exports.onPaymentApproved = exports.onGoalUpdate = exports.onMilestoneUpdate = exports.handleOrderUpdates = exports.handleVoucherCreation = exports.handleWorkOrderCreation = exports.handleQuotationCreation = exports.onStockTransfer = exports.onDebitNoteCreated = exports.onCreditNoteCreated = exports.onInvoiceCreated = exports.handleOrderCreation = exports.verifyUpiPaymentAndCreateOrder = exports.helloWorld = void 0;
// ✅ Use this SAME file content for BOTH paths:
// 1) functions/src/index.ts
// 2) src/functions/src/index.ts
//
// IMPORTANT:
// - Removed: 'use server' (must not be in Cloud Functions)
// - Fixed: invoiceNumber is guaranteed inside onInvoiceCreated (so narration + UI won't break)
// - Kept: your existing features (UPI onCall, order number, JV posting, stock transfer, commissions, notes, milestones, payment approval)
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firestore_admin_1 = require("firebase-admin/firestore");
const number_series_1 = require("./number-series");
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = (0, firestore_admin_1.getFirestore)();
/**
 * Aggressive helper to ensure every customer has their OWN specific ledger.
 */
const findOrCreateSpecificCustomerLedger = async (transaction, order) => {
    // Explicitly determine ID based on which property exists
    let userId = "";
    if ("userId" in order) {
        userId = order.userId;
    }
    else if ("customerId" in order) {
        userId = order.customerId;
    }
    const customerName = order.customerName;
    // Safely get email if it exists
    const customerEmail = "customerEmail" in order ? order.customerEmail : "";
    const partyRef = db.collection("parties").doc(userId);
    const partySnap = await transaction.get(partyRef);
    let partyData = partySnap.data();
    // If party doesn't exist, create it within the transaction
    if (!partySnap.exists) {
        partyData = {
            id: userId,
            name: customerName,
            type: "Customer",
            email: customerEmail,
        };
        transaction.set(partyRef, partyData, { merge: true });
    }
    // 1. If we have a valid ID that isn't the generic string, use it
    if (partyData?.coaLedgerId && partyData.coaLedgerId !== "customer-advances") {
        const ledgerSnap = await transaction.get(db.collection("coa_ledgers").doc(partyData.coaLedgerId));
        if (ledgerSnap.exists)
            return partyData.coaLedgerId;
    }
    // 2. Try to find an existing ledger by Name
    const ledgerSearchQuery = db.collection("coa_ledgers").where("name", "==", customerName).limit(1);
    const ledgerSearch = await transaction.get(ledgerSearchQuery);
    if (!ledgerSearch.empty) {
        const existingId = ledgerSearch.docs[0].id;
        transaction.set(partyRef, { coaLedgerId: existingId }, { merge: true });
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
    transaction.set(partyRef, {
        ...(partyData || {}),
        coaLedgerId: newLedgerRef.id,
    }, { merge: true });
    return newLedgerRef.id;
};
exports.verifyUpiPaymentAndCreateOrder = (0, https_1.onCall)({ region: "asia-south1" }, async (req) => {
    const { order, upiTransactionId } = req.data;
    if (!order?.userId || !upiTransactionId) {
        throw new https_1.HttpsError("invalid-argument", "Missing order/userId/upiTransactionId");
    }
    const db = admin.firestore();
    const settingsSnap = await db.doc("company/settings").get();
    const prefixes = settingsSnap.data()?.prefixes;
    const orderRef = db.collection("orders").doc(); // ✅ NEW DOC ID
    const paymentRef = db.collection("paymentSubmissions").doc();
    try {
        await db.runTransaction(async (tx) => {
            const orderNumber = await (0, number_series_1.getNextDocNumber)(tx, "Sales Order", prefixes);
            tx.set(orderRef, {
                ...order,
                id: orderRef.id, // Storing the document ID within the document
                orderNumber,
                status: "Awaiting Payment Confirmation",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            tx.set(paymentRef, {
                userId: order.userId,
                orderId: orderRef.id, // ✅ LINK BY DOC ID (important)
                orderNumber, // optional for display
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
    }
    catch (error) {
        console.error("Order creation transaction failed:", error);
        throw new https_1.HttpsError("internal", "An error occurred while creating the order.", {
            message: error?.message,
        });
    }
});
exports.handleOrderCreation = (0, firestore_1.onDocumentCreated)({ document: "orders/{orderId}", region: "asia-south1" }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const order = snap.data();
    const orderRef = snap.ref;
    try {
        await db.runTransaction(async (transaction) => {
            // 1. GENERATE SEQUENTIAL ORDER NUMBER (if it doesn't exist)
            if (!order.orderNumber) {
                const settingsSnap = await transaction.get(db.doc("company/settings"));
                const prefixes = settingsSnap.data()?.prefixes;
                const allOrdersSnap = await transaction.get(db.collection("orders"));
                const allOrdersData = allOrdersSnap.docs.map(d => d.data());
                const formattedOrderNumber = await (0, number_series_1.getNextDocNumber)("Sales Order", prefixes, allOrdersData);
                transaction.update(orderRef, { orderNumber: formattedOrderNumber });
                // Update local object for subsequent logic
                order.orderNumber = formattedOrderNumber;
            }
            // 2. CREATE JOURNAL VOUCHER FOR ADVANCE PAYMENT
            if (order.paymentReceived && order.paymentReceived > 0) {
                const jvRef = db.collection("journalVouchers").doc();
                const jvNarration = `Advance for Order ${order.orderNumber}`;
                const jvData = {
                    date: new Date().toISOString().split("T")[0],
                    narration: jvNarration,
                    entries: [
                        {
                            accountId: "L-1.1.1-2",
                            debit: order.paymentReceived || 0,
                            credit: 0,
                        },
                        {
                            accountId: "L-2.1.3-4",
                            debit: 0,
                            credit: order.paymentReceived || 0,
                        },
                    ],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    voucherType: 'Receipt Voucher',
                    orderId: orderRef.id,
                };
                transaction.set(jvRef, jvData);
            }
            // 3. AUTOMATICALLY CREATE WORK ORDERS for "Made" products
            for (const item of order.items) {
                const productSnap = await transaction.get(db.doc(`products/${item.productId}`));
                const productData = productSnap.data();
                if (productData && productData.source === "Made") {
                    const settingsSnap = await transaction.get(db.doc("company/settings"));
                    const prefixes = settingsSnap.data()?.prefixes;
                    const allWoSnap = await transaction.get(db.collection("workOrders"));
                    const allWoData = allWoSnap.docs.map(d => d.data());
                    const formattedWoNumber = await (0, number_series_1.getNextDocNumber)("Work Order", prefixes, allWoData);
                    const woRef = db.collection("workOrders").doc(formattedWoNumber);
                    const bomQuery = db.collection("boms").where("productId", "==", item.productId).limit(1);
                    const bomSnap = await transaction.get(bomQuery);
                    const bom = bomSnap.empty ? null : bomSnap.docs[0].data();
                    const newWorkOrder = {
                        id: formattedWoNumber,
                        productId: item.productId,
                        productName: item.name,
                        quantity: item.quantity,
                        status: "Pending",
                        createdAt: new Date().toISOString(),
                        salesOrderId: orderRef.id,
                        salesOrderNumber: order.orderNumber,
                        productionTasks: bom?.productionTasks || [],
                    };
                    transaction.set(woRef, newWorkOrder);
                }
            }
        });
    }
    catch (e) {
        console.error("Critical order creation logic failed:", e);
    }
});
/**
 * ✅ UNIFIED INVOICE TRIGGER
 * - Assigns invoiceNumber if missing
 * - Customer ledger + Sales JV
 * - Stock deduction (Partner stock vs Warehouse stock)
 * - COGS JV
 * - Updates source order status
 */
exports.onInvoiceCreated = (0, firestore_1.onDocumentCreated)({ document: "salesInvoices/{invoiceId}", region: "asia-south1" }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    let invoice = snap.data();
    const partnerId = invoice.assignedToUid;
    try {
        await db.runTransaction(async (transaction) => {
            // ✅ FIX: Ensure invoiceNumber exists BEFORE using it anywhere
            if (!invoice.invoiceNumber) {
                const settingsSnap = await transaction.get(db.doc("company/settings"));
                const prefixes = settingsSnap.data()?.prefixes;
                const newInvoiceNumber = await (0, number_series_1.getNextDocNumber)(transaction, "Sales Invoice", prefixes);
                transaction.update(snap.ref, { invoiceNumber: newInvoiceNumber });
                // Manually update the local object so subsequent logic has the number
                invoice = { ...invoice, invoiceNumber: newInvoiceNumber };
            }
            // 1) ACCOUNTS: Get/Create Customer Ledger
            const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, invoice);
            const getLedgerIdByName = async (name) => {
                const ledgerQuery = db.collection("coa_ledgers").where("name", "==", name).limit(1);
                const res = await transaction.get(ledgerQuery);
                return res.empty ? null : res.docs[0].id;
            };
            const salesLedgerId = (await getLedgerIdByName("Sales – Domestic")) || "L-4.1-1";
            // 2) SALES JOURNAL VOUCHER
            const salesEntries = [
                { accountId: customerLedgerId, debit: invoice.grandTotal, credit: 0 },
                { accountId: salesLedgerId, credit: invoice.taxableAmount, debit: 0 },
            ];
            if (invoice.igst && invoice.igst > 0) {
                salesEntries.push({ accountId: "L-2.1.2-3", credit: invoice.igst, debit: 0 });
            }
            else {
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
            for (const item of invoice.items) {
                // If invoice has assignedToUid, deduct from Partner stock: users/{partnerId}/stock/{prodId}
                // Else, deduct from Warehouse: products/{prodId}
                const isPartnerSale = !!partnerId;
                const stockRef = isPartnerSale
                    ? db.doc(`users/${partnerId}/stock/${item.productId}`)
                    : db.doc(`products/${item.productId}`);
                const fieldToDecrement = isPartnerSale ? "quantity" : "openingStock";
                transaction.set(stockRef, { [fieldToDecrement]: admin.firestore.FieldValue.increment(-item.quantity) }, { merge: true });
                // Calculate COGS based on original product cost
                const productRef = db.doc(`products/${item.productId}`);
                const productSnap = await transaction.get(productRef);
                if (productSnap.exists) {
                    const product = productSnap.data();
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
            if (invoice.orderId) {
                transaction.update(db.collection("orders").doc(invoice.orderId), { status: "Invoice Sent" });
            }
        });
    }
    catch (e) {
        console.error("Critical Invoice logic failed:", e);
    }
});
exports.onCreditNoteCreated = (0, firestore_1.onDocumentCreated)({ document: "creditNotes/{noteId}", region: "asia-south1" }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const note = snap.data();
    const batch = db.batch();
    // 1) Create Journal Voucher
    const jvRef = db.collection("journalVouchers").doc();
    const narration = `Credit Note ${note.creditNoteNumber} issued to ${note.partyName} for: ${note.reason}`;
    const partySnap = await db.collection("parties").doc(note.partyId).get();
    const partyData = partySnap.data();
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
        createdByUid: snap.data().createdByUid,
    });
    // 2) Create Refund Request
    const refundRequestRef = db.collection("refundRequests").doc();
    const refundRequestData = {
        orderId: note.originalInvoiceId || "N/A",
        customerId: note.partyId,
        customerName: note.partyName,
        refundAmount: note.amount,
        requestDate: note.date,
        status: "Pending",
    };
    batch.set(refundRequestRef, refundRequestData);
    await batch.commit();
});
exports.onDebitNoteCreated = (0, firestore_1.onDocumentCreated)({ document: "debitNotes/{noteId}", region: "asia-south1" }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const note = snap.data();
    const jvRef = db.collection("journalVouchers").doc();
    const narration = `Debit Note ${note.debitNoteNumber} issued to ${note.partyName} for: ${note.reason}`;
    const partySnap = await db.collection("parties").doc(note.partyId).get();
    const partyData = partySnap.data();
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
        createdByUid: snap.data().createdByUid,
    });
});
exports.onStockTransfer = (0, firestore_1.onDocumentUpdated)({ document: "stockTransferRequests/{requestId}", region: "asia-south1" }, async (event) => {
    if (!event.data?.after)
        return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    // Trigger only when status changes to "Shipped"
    if (after.status !== "Shipped" || before.status === "Shipped") {
        console.log(`Stock transfer for ${event.params.requestId} not processed. Status: '${after.status}', Before: '${before.status}'.`);
        return;
    }
    const partnerId = after.partnerId;
    const itemsToTransfer = after.items;
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
                transaction.set(partnerStockRef, { quantity: admin.firestore.FieldValue.increment(item.quantity) }, { merge: true });
            }
        });
        console.log(`Successfully transferred stock for request ${event.params.requestId} to partner ${partnerId}`);
    }
    catch (e) {
        console.error(`Stock transfer failed for request ${event.params.requestId}:`, e);
    }
});
exports.handleQuotationCreation = (0, firestore_1.onDocumentCreated)({ document: "quotations/{docId}", region: "asia-south1" }, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const data = snapshot.data();
    if (data.quotationNumber)
        return;
    return db.runTransaction(async (tx) => {
        const settingsSnap = await tx.get(db.doc("company/settings"));
        const prefixes = settingsSnap.data()?.prefixes;
        const newId = await (0, number_series_1.getNextDocNumber)(tx, "Sales Quotation", prefixes);
        const createdByUid = data.createdBy;
        tx.update(snapshot.ref, {
            quotationNumber: newId,
            id: firestore_admin_1.FieldValue.delete(),
            createdByUid,
        });
    });
});
exports.handleWorkOrderCreation = (0, firestore_1.onDocumentCreated)({ document: "workOrders/{id}", region: "asia-south1" }, () => { });
exports.handleVoucherCreation = (0, firestore_1.onDocumentCreated)({ document: "journalVouchers/{id}", region: "asia-south1" }, () => { });
exports.handleOrderUpdates = (0, firestore_1.onDocumentUpdated)({ document: "orders/{orderId}", region: "asia-south1" }, async (event) => {
    if (!event.data)
        return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    // Commission Calculation on Delivery
    if (before.status !== "Delivered" && after.status === "Delivered") {
        const orderId = event.params.orderId;
        console.log(`Order ${orderId} delivered. Processing commissions...`);
        return db.runTransaction(async (transaction) => {
            const orderRef = db.doc(`orders/${orderId}`);
            // 1) Partner Commission
            if (after.assignedToUid) {
                const partnerId = after.assignedToUid;
                const partnerRef = db.doc(`users/${partnerId}`);
                const partnerSnap = await transaction.get(partnerRef);
                const partnerData = partnerSnap.data();
                if (partnerData && partnerData.partnerMatrix) {
                    let commissionTotal = after.commission || 0;
                    if (!commissionTotal) {
                        commissionTotal = after.items.reduce((acc, item) => {
                            const rule = partnerData.partnerMatrix?.find((r) => r.category === item.category);
                            if (rule) {
                                const itemTotal = item.price * item.quantity;
                                return acc + itemTotal * (rule.commissionRate / 100);
                            }
                            return acc;
                        }, 0);
                    }
                    if (commissionTotal > 0) {
                        const walletRef = db.doc(`users/${partnerId}/wallet/main`);
                        transaction.set(walletRef, { commissionPayable: admin.firestore.FieldValue.increment(commissionTotal) }, { merge: true });
                        transaction.update(orderRef, { payoutStatus: "Payable", commission: commissionTotal });
                    }
                    else {
                        transaction.update(orderRef, { payoutStatus: "No Commission" });
                    }
                }
                else {
                    transaction.update(orderRef, { payoutStatus: "No Commission" });
                }
            }
            // 2) Referral Commission
            const userProfileRef = db.doc(`users/${after.userId}`);
            const userProfileSnap = await transaction.get(userProfileRef);
            const userProfile = userProfileSnap.data();
            if (userProfile?.referredBy) {
                const referralsQuery = db
                    .collection(`users/${userProfile.referredBy}/referrals`)
                    .where("mobile", "==", userProfile.mobile)
                    .where("status", "==", "First Purchased")
                    .limit(1);
                const referralsSnapshot = await transaction.get(referralsQuery);
                if (!referralsSnapshot.empty) {
                    const referralDoc = referralsSnapshot.docs[0];
                    const firstPurchaseCommission = referralDoc.data().commission || 0;
                    if (firstPurchaseCommission > 0) {
                        const referrerWalletRef = db.doc(`users/${userProfile.referredBy}/wallet/main`);
                        transaction.set(referrerWalletRef, { commissionPayable: admin.firestore.FieldValue.increment(firstPurchaseCommission) }, { merge: true });
                        transaction.update(referralDoc.ref, { status: "Completed" });
                    }
                }
            }
        });
    }
    return;
});
exports.onMilestoneUpdate = (0, firestore_1.onDocumentWritten)({ document: "goals/{goalId}/milestones/{milestoneId}", region: "asia-south1" }, async (event) => {
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
        const completedMilestones = milestonesSnapshot.docs.filter((doc) => doc.data().status === "Done").length;
        const progressPct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
        const currentValue = totalMilestones > 0 ? (progressPct / 100) * goal.targetValue : 0;
        // Determine health status
        const now = new Date();
        const startDate = new Date(goal.startDate);
        const endDate = new Date(goal.endDate);
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsedDuration = now.getTime() - startDate.getTime();
        const timeElapsedPct = totalDuration > 0 ? (elapsedDuration / totalDuration) * 100 : 0;
        let health = "On Track";
        const progressBehindTime = timeElapsedPct - progressPct;
        if (progressBehindTime > 25)
            health = "Off Track";
        else if (progressBehindTime > 10)
            health = "At Risk";
        transaction.update(goalRef, {
            progressPct,
            currentValue,
            health,
        });
    });
});
exports.onGoalUpdate = (0, firestore_1.onDocumentCreated)({ document: "goalUpdates/{updateId}", region: "asia-south1" }, async () => { });
exports.onPaymentApproved = (0, firestore_1.onDocumentUpdated)({ document: "paymentSubmissions/{id}", region: "asia-south1" }, async (event) => {
    if (!event.data)
        return;
    const after = event.data.after.data();
    const before = event.data.before.data();
    // Run only when status changes to Approved
    if (before.status !== "Approved" && after.status === "Approved") {
        const orderId = after.orderId;
        if (!orderId) {
            console.error("Payment submission approved but orderId is missing:", after.id);
            return;
        }
        const orderRef = db.collection("orders").doc(orderId);
        return db.runTransaction(async (transaction) => {
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists) {
                console.error(`Order ${orderId} not found for payment submission ${after.id}`);
                return;
            }
            const orderData = orderDoc.data(); // keep as any for flexibility
            // CREDIT: Customer
            const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, after);
            // DEBIT: Receiving account (partner cash/bank or company UPI)
            let receivingAccountId = after.receivingAccountId || null;
            if (!receivingAccountId) {
                // If manual cash and recorded by someone, try to debit their cash ledger
                if (after.paymentMethod === "Cash" && after.recordedByUid) {
                    const recorderUid = after.recordedByUid;
                    const recorderSnap = await transaction.get(db.doc(`users/${recorderUid}`));
                    const recorderProfile = recorderSnap.data();
                    if (recorderProfile?.coaLedgerId) {
                        receivingAccountId = recorderProfile.coaLedgerId;
                    }
                    else {
                        // fallback search by tag
                        const ledgerSearch = await transaction.get(db.collection("coa_ledgers").where("tags", "array-contains", recorderUid).limit(1));
                        receivingAccountId = !ledgerSearch.empty ? ledgerSearch.docs[0].id : "L-1.1.1-1";
                    }
                }
                else {
                    // Online UPI: use company primary UPI ledger if available
                    const companySnap = await transaction.get(db.doc("company/info"));
                    const primaryUpi = companySnap.data()?.primaryUpiId;
                    if (primaryUpi) {
                        const ledgerSearchQuery = db.collection("coa_ledgers").where("bank.upiId", "==", primaryUpi).limit(1);
                        const ledgerSearch = await transaction.get(ledgerSearchQuery);
                        if (!ledgerSearch.empty)
                            receivingAccountId = ledgerSearch.docs[0].id;
                    }
                    // final fallback if still null
                    if (!receivingAccountId)
                        receivingAccountId = "L-1.1.1-1";
                }
            }
            // ✅ Create JV with orderId stored (THIS FIXES MIXED PAYMENT HISTORY)
            if (receivingAccountId && customerLedgerId) {
                const jvRef = db.collection("journalVouchers").doc();
                const orderNumber = orderData?.orderNumber || orderData?.id || orderId;
                transaction.set(jvRef, {
                    id: jvRef.id,
                    date: new Date().toISOString().split("T")[0],
                    narration: `Payment for Order #${orderNumber}. Method: ${after.paymentMethod}. Ref: ${after.transactionDetails}`,
                    // ✅ IMPORTANT FIELDS (use these in UI filter)
                    orderId: orderId,
                    orderNumber: orderNumber,
                    customerId: orderData?.userId || after.userId || null,
                    voucherType: "Receipt Voucher",
                    entries: [
                        { accountId: receivingAccountId, debit: after.amount, credit: 0 },
                        { accountId: customerLedgerId, debit: 0, credit: after.amount },
                    ],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdByUid: after.recordedByUid || after.userId || null,
                });
            }
            else {
                console.error("Could not determine receivingAccountId or customerLedgerId. JV not created for payment:", after.id);
            }
            // Update Order totals + status
            const prevPaid = Number(orderData?.paymentReceived || 0);
            const paidNow = Number(after.amount || 0);
            const newTotalPaid = prevPaid + paidNow;
            const grandTotal = Number(orderData?.grandTotal || 0);
            const newBalance = grandTotal - newTotalPaid;
            transaction.update(orderRef, {
                paymentReceived: newTotalPaid,
                balance: newBalance,
                status: newBalance <= 0 ? "Ready for Dispatch" : "Ordered",
            });
            // Optional: mark submission "processed" flag (not required, but can prevent double-jv if something weird happens)
            // const submissionRef = db.collection("paymentSubmissions").doc((after as any).id);
            // transaction.update(submissionRef, { processedAt: admin.firestore.FieldValue.serverTimestamp() } as any);
        });
    }
    return;
});
exports.helloWorld = (0, https_1.onCall)({ region: "asia-south1" }, (request) => {
    console.log("Hello from Firebase!");
    return { message: "Hello from Firebase!" };
});
