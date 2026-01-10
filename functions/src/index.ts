

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
import type {Order, SalesInvoice, Party, Goal, UserProfile, CreditNote, DebitNote, RefundRequest, Product, StockTransferRequest} from "./types";
import { HttpsError, onCall } from "firebase-functions/v2/https";

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

    // Also create/update the party document to link it.
    transaction.set(partyRef, { 
        ...partyData,
        coaLedgerId: newLedgerRef.id, 
    }, { merge: true });
    
    return newLedgerRef.id;
};

export const verifyUpiPaymentAndCreateOrder = onCall(async (request) => {
    const { order, upiTransactionId } = request.data;
    const userId = order.userId;

    // --- 1. UPI Verification (Simulated) ---
    // In a real app, you would call your payment gateway's API here.
    // We'll simulate a successful check for demonstration.
    console.log(`Verifying UPI transaction ID: ${upiTransactionId}...`);
    const isPaymentValid = true; // Replace with actual API call result

    if (!isPaymentValid) {
        throw new HttpsError('invalid-argument', 'The UPI transaction ID is invalid or the payment was not received.');
    }

    // --- 2. Database Operations within a Transaction ---
    const orderRef = db.collection('orders').doc();
    let referralCommission = 0;
    
    try {
        await db.runTransaction(async (transaction) => {
            // a. Create Journal Voucher for the advance payment
            const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, order as Order);
            const companySnap = await transaction.get(db.doc("company/info"));
            const primaryUpi = companySnap.data()?.primaryUpiId;
            let bankAccountId = "L-1.1.1-2"; // Default Current Account
            
            if (primaryUpi) {
                const ledgerSearch = await db.collection("coa_ledgers").where("bank.upiId", "==", primaryUpi).limit(1).get();
                if (!ledgerSearch.empty) bankAccountId = ledgerSearch.docs[0].id;
            }
        
            const jvRef = db.collection("journalVouchers").doc();
            transaction.set(jvRef, {
                id: jvRef.id,
                date: new Date().toISOString().split("T")[0],
                narration: `Advance for new Order #${orderRef.id} via UPI`,
                voucherType: "Receipt Voucher",
                entries: [
                    { accountId: bankAccountId, debit: order.paymentReceived, credit: 0 },
                    { accountId: customerLedgerId, debit: 0, credit: order.paymentReceived }, 
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdByUid: userId,
            });

            // b. Handle Referral Logic
            const userProfileRef = db.doc(`users/${order.userId}`);
            const userProfileSnap = await transaction.get(userProfileRef);
            const userProfile = userProfileSnap.data() as UserProfile | undefined;

            if (userProfile?.referredBy) {
                const ordersQuery = db.collection('orders').where('userId', '==', order.userId).limit(1);
                const orderCountSnapshot = await transaction.get(ordersQuery);
                if (orderCountSnapshot.empty) { // This is their first order
                    const referralsQuery = db.collection('users').doc(userProfile.referredBy).collection('referrals').where('mobile', '==', userProfile.mobile).where('status', '==', 'Signed Up');
                    const referralsSnapshot = await transaction.get(referralsQuery);
                    if (!referralsSnapshot.empty) {
                        const referralDoc = referralsSnapshot.docs[0];
                        const commissionPercentage = referralDoc.data().commission || 0;
                        referralCommission = order.grandTotal * (commissionPercentage / 100);
                        transaction.update(referralDoc.ref, { status: 'First Purchased', commission: referralCommission });
                    }
                }
            }

            // c. Finally, create the order document
            const newOrderData = {
              ...order,
              id: orderRef.id, // Ensure ID is consistent
              commission: referralCommission,
            };
            transaction.set(orderRef, newOrderData);
        });

        return { success: true, message: "Order created successfully", orderId: orderRef.id };
    } catch (error: any) {
        console.error("Order creation transaction failed:", error);
        throw new HttpsError('internal', 'An error occurred while creating the order.', error.message);
    }
});


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
});

export const onInvoiceCreated = onDocumentCreated("salesInvoices/{invoiceId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const invoice = snap.data() as SalesInvoice & { assignedToUid?: string };

    try {
      await db.runTransaction(async (transaction) => {
        const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, invoice);
        
        const getLedgerIdByName = async (name: string): Promise<string | null> => {
            const query = db.collection('coa_ledgers').where('name', '==', name).limit(1);
            const res = await transaction.get(query);
            return res.empty ? null : res.docs[0].id;
        };

        const salesLedgerId = await getLedgerIdByName("Sales – Domestic") || "L-4.1-1";

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
          narration: `Sales Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
          entries: salesEntries,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          voucherType: "Sales Voucher",
          createdByUid: invoice.assignedToUid || invoice.customerId,
        });

        let totalCost = 0;
        const cogsLedgerId = await getLedgerIdByName("COST OF GOODS SOLD (COGS)");
        const finishedGoodsLedgerId = await getLedgerIdByName("Stock-in-Hand – Finished Goods");
        const partnerId = invoice.assignedToUid;

        if (cogsLedgerId && finishedGoodsLedgerId) {
            for (const item of invoice.items) {
                const stockRef = partnerId
                    ? db.doc(`users/${partnerId}/stock/${item.productId}`)
                    : db.doc(`products/${item.productId}`);
                    
                const productRef = db.doc(`products/${item.productId}`);
                const productSnap = await transaction.get(productRef);
                if (!productSnap.exists) continue;

                const product = productSnap.data() as Product;
                
                transaction.update(stockRef, {
                    quantity: admin.firestore.FieldValue.increment(-item.quantity)
                });
                
                const itemCost = (product?.cost || 0) * item.quantity;
                totalCost += itemCost;
            }

            if (totalCost > 0) {
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
                    createdByUid: invoice.assignedToUid || invoice.customerId,
                });
            }
        }
        
        if (partnerId) {
            const partnerRef = db.doc(`users/${partnerId}`);
            const partnerSnap = await transaction.get(partnerRef);
            const partnerData = partnerSnap.data() as UserProfile | undefined;
            
            if (partnerData && partnerData.partnerMatrix) {
                let commissionTotal = invoice.items.reduce((acc, item) => {
                    const rule = partnerData.partnerMatrix?.find(r => r.category === item.category);
                    if (rule) {
                        const itemTotal = item.price * item.quantity;
                        const discountAmount = itemTotal * ((invoice.discount / invoice.subtotal) || 0);
                        const commissionableValue = itemTotal - discountAmount;
                        return acc + (commissionableValue * (rule.commissionRate / 100));
                    }
                    return acc;
                }, 0);

                if (commissionTotal > 0) {
                    const walletRef = db.doc(`users/${partnerId}/wallet/main`);
                    transaction.set(walletRef, { 
                        commissionPayable: admin.firestore.FieldValue.increment(commissionTotal) 
                    }, { merge: true });
                }
            }
        }

        if (invoice.orderId) {
            const orderRef = db.collection('orders').doc(invoice.orderId);
            transaction.update(orderRef, { status: 'Ready for Dispatch' });
        }
      });
    } catch (e) { console.error(e); }
});

export const onCreditNoteCreated = onDocumentCreated("creditNotes/{noteId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const note = snap.data() as CreditNote;
    
    const batch = db.batch();

    // --- 1. Create Journal Voucher ---
    const jvRef = db.collection("journalVouchers").doc();
    const narration = `Credit Note ${note.creditNoteNumber} issued to ${note.partyName} for: ${note.reason}`;
    
    const partySnap = await db.collection('parties').doc(note.partyId).get();
    const partyData = partySnap.data() as Party | undefined;
    const customerLedgerId = partyData?.coaLedgerId;
    if (!customerLedgerId) {
      console.error(`Could not find ledger for party ${note.partyId}`);
      return;
    }
    
    const taxableAmount = note.amount / 1.18; // Reverse calculation assuming 18% GST
    const gstAmount = note.amount - taxableAmount;
    
    const entries = [
        { accountId: "L-4.1-1", debit: taxableAmount, credit: 0 }, // Debit Sales/Sales Return
        { accountId: "L-2.1.2-1", debit: gstAmount / 2, credit: 0 }, // Debit Output CGST
        { accountId: "L-2.1.2-2", debit: gstAmount / 2, credit: 0 }, // Debit Output SGST
        { accountId: customerLedgerId, debit: 0, credit: note.amount }, // Credit Customer
    ];

    const jvData = {
      date: note.date,
      narration: narration,
      entries,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      voucherType: 'Credit Note'
    };
    batch.set(jvRef, jvData);

    // --- 2. Create Refund Request for Accounts Team ---
    const refundRequestRef = db.collection("refundRequests").doc();
    const refundRequestData: Omit<RefundRequest, 'id'> = {
        orderId: note.originalInvoiceId || 'N/A',
        customerId: note.partyId,
        customerName: note.partyName,
        refundAmount: note.amount,
        requestDate: note.date,
        status: 'Pending',
    };
    batch.set(refundRequestRef, refundRequestData);

    await batch.commit();
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
    
    const taxableAmount = note.amount / 1.18; // Reverse calculation assuming 18% GST
    const gstAmount = note.amount - taxableAmount;

    const entries = [
        { accountId: supplierLedgerId, debit: note.amount, credit: 0 }, // Debit Supplier
        { accountId: "L-5-3", debit: 0, credit: taxableAmount }, // Credit Purchase/Purchase Return
        { accountId: "L-1.1.4-1", debit: 0, credit: gstAmount / 2 }, // Credit Input CGST
        { accountId: "L-1.1.4-2", debit: 0, credit: gstAmount / 2 }, // Credit Input SGST
    ];

    const jvData = {
      date: note.date,
      narration: narration,
      entries,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      voucherType: 'Debit Note'
    };

    await jvRef.set(jvData);
});

export const onStockTransfer = onDocumentUpdated("stockTransferRequests/{requestId}", async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, {requestId: string}>) => {
    if (!event.data?.after) return;

    const before = event.data.before.data() as StockTransferRequest;
    const after = event.data.after.data() as StockTransferRequest;

    // Trigger only when status changes to "Shipped" and was not "Shipped" before
    if (after.status !== 'Shipped' || before.status === 'Shipped') {
        console.log(`Stock transfer for ${event.params.requestId} not processed. Status: '${after.status}', Before: '${before.status}'.`);
        return;
    }

    const partnerId = after.partnerId;
    const itemsToTransfer = after.items;

    try {
        await db.runTransaction(async (transaction) => {
            for (const item of itemsToTransfer) {
                // 1. Decrement stock from main warehouse (products collection)
                const mainProductRef = db.doc(`products/${item.productId}`);
                transaction.update(mainProductRef, { 
                    openingStock: admin.firestore.FieldValue.increment(-item.quantity) 
                });

                // 2. Increment stock in partner's sub-collection
                const partnerStockRef = db.doc(`users/${partnerId}/stock/${item.productId}`);
                transaction.set(partnerStockRef, {
                    quantity: admin.firestore.FieldValue.increment(item.quantity)
                }, { merge: true });
            }
        });
        console.log(`Successfully transferred stock for request ${event.params.requestId} to partner ${partnerId}`);
    } catch (e) {
        console.error(`Stock transfer failed for request ${event.params.requestId}:`, e);
        // Optional: Revert status or log error to Firestore for admin review
    }
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
    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;
  
    // --- Commission Calculation on Delivery ---
    if (before.status !== 'Delivered' && after.status === 'Delivered') {
        const orderId = event.params.orderId;
        console.log(`Order ${orderId} delivered. Processing commissions...`);

        return db.runTransaction(async (transaction) => {
            // --- 1. Partner Commission ---
            if (after.assignedToUid) {
                const partnerId = after.assignedToUid!;
                const partnerRef = db.doc(`users/${partnerId}`);
                const partnerSnap = await transaction.get(partnerRef);
                const partnerData = partnerSnap.data() as UserProfile | undefined;
                
                if (partnerData && partnerData.partnerMatrix) {
                    let commissionTotal = after.commission || 0;
                    if (!commissionTotal) { // Recalculate if not already on the order
                        commissionTotal = after.items.reduce((acc, item) => {
                            const rule = partnerData.partnerMatrix?.find(r => r.category === item.category);
                            if (rule) {
                                const itemTotal = item.price * item.quantity;
                                return acc + (itemTotal * (rule.commissionRate / 100));
                            }
                            return acc;
                        }, 0);
                    }
    
                    if (commissionTotal > 0) {
                        const walletRef = db.doc(`users/${partnerId}/wallet/main`);
                        transaction.set(walletRef, { 
                            commissionPayable: admin.firestore.FieldValue.increment(commissionTotal) 
                        }, { merge: true });
                        transaction.update(event.data!.after.ref, { payoutStatus: 'Payable', commission: commissionTotal });
                    } else {
                         transaction.update(event.data!.after.ref, { payoutStatus: 'No Commission' });
                    }
                } else {
                     transaction.update(event.data!.after.ref, { payoutStatus: 'No Commission' });
                }
            }

            // --- 2. Referral Commission ---
            const userProfileRef = db.doc(`users/${after.userId}`);
            const userProfileSnap = await transaction.get(userProfileRef);
            const userProfile = userProfileSnap.data() as UserProfile | undefined;
    
            if (userProfile?.referredBy) {
                const referralsQuery = db.collection(`users/${userProfile.referredBy}/referrals`)
                    .where('mobile', '==', userProfile.mobile)
                    .where('status', '==', 'First Purchased')
                    .limit(1);
                
                const referralsSnapshot = await transaction.get(referralsQuery);
                if (!referralsSnapshot.empty) {
                    const referralDoc = referralsSnapshot.docs[0];
                    const firstPurchaseCommission = referralDoc.data().commission || 0;

                    if (firstPurchaseCommission > 0) {
                        const referrerWalletRef = db.doc(`users/${userProfile.referredBy}/wallet/main`);
                        transaction.set(referrerWalletRef, { 
                            commissionPayable: admin.firestore.FieldValue.increment(firstPurchaseCommission) 
                        }, { merge: true });
                        transaction.update(referralDoc.ref, { status: 'Completed' });
                    }
                }
            }
        });
    }
  
    // --- Accounting Entry on Payment Approval ---
    if (before.status === 'Awaiting Payment Confirmation' && after.status === 'Ordered') {
      if (after.paymentReceived && after.paymentReceived > 0) {
        await db.runTransaction(async (transaction) => {
            const customerLedgerId = await findOrCreateSpecificCustomerLedger(transaction, after);
            const companySnap = await transaction.get(db.doc("company/info"));
            const primaryUpi = companySnap.data()?.primaryUpiId;
            let bankAccountId = "L-1.1.1-2"; // Default Current Account
            
            if (primaryUpi) {
                const ledgerSearch = await db.collection("coa_ledgers").where("bank.upiId", "==", primaryUpi).limit(1).get();
                if (!ledgerSearch.empty) bankAccountId = ledgerSearch.docs[0].id;
            }
        
            const jvRef = db.collection("journalVouchers").doc();
            transaction.set(jvRef, {
                id: jvRef.id,
                date: new Date().toISOString().split("T")[0],
                narration: `Advance for Order #${after.orderNumber || after.id} via UPI`,
                voucherType: "Receipt Voucher",
                entries: [
                    { accountId: bankAccountId, debit: after.paymentReceived, credit: 0 },
                    { accountId: customerLedgerId, debit: 0, credit: after.paymentReceived }, 
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdByUid: after.userId,
            });
        });
      }
    }
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

    



    







    

    

      











    

    

  