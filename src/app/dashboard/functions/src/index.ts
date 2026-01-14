
import {onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {getNextDistributedCounter} from "./distributed-counter";
import type {Order, UserProfile, BOM} from "./types";

// Initialize the Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

/**
 * Triggers when a new order is created to generate a sequential order number,
 * create a corresponding journal voucher for the payment, and create work
 * orders for any "Made" items in the order.
 */
export const onOrderCreated = onDocumentCreated("orders/{orderId}",
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.log("No data associated with the event");
      return;
    }
    const order = snap.data() as Order;
    const orderRef = snap.ref;

    return db.runTransaction(async (transaction) => {
      // 1. GENERATE SEQUENTIAL ORDER NUMBER
      const orderNumber = await getNextDistributedCounter(db, "sales_orders");
      const year = String(new Date().getFullYear()).slice(-2);
      const month = String(new Date().getMonth() + 1).padStart(2, "0");
      const num = String(orderNumber).padStart(4, "0");
      const formattedOrderNumber = `SO-${year}${month}-${num}`;

      transaction.update(orderRef, {orderNumber: formattedOrderNumber});
      console.log(`Generated Order Number: ${formattedOrderNumber}`);

      // 2. CREATE JOURNAL VOUCHER FOR ADVANCE PAYMENT
      if (order.paymentReceived && order.paymentReceived > 0) {
        const jvRef = db.collection("journalVouchers").doc();
        const jvNarration = `Advance for Order ${formattedOrderNumber}`;
        const jvData = {
          date: new Date().toISOString().split("T")[0],
          narration: jvNarration,
          entries: [
            {
              accountId: "L-1.1.1-2", // Assumes "Bank – Current Account"
              debit: order.paymentReceived || 0,
              credit: 0,
            },
            {
              // Credit Customer Advances (liability until order fulfilled)
              accountId: "L-2.1.3-4",
              debit: 0,
              credit: order.paymentReceived || 0,
            },
          ],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.set(jvRef, jvData);
      }

      // 3. AUTOMATICALLY CREATE WORK ORDERS for "Made" products
      for (const item of order.items) {
        const productSnap = await db.doc(`products/${item.productId}`).get();
        const productData = productSnap.data();

        if (productData && productData.source === "Made") {
          const woCounter = await getNextDistributedCounter(db, "work_orders");
          const woNum = String(woCounter).padStart(4, "0");
          const formattedWoNumber = `WO-${year}${month}-${woNum}`;

          const woRef = db.collection("workOrders").doc(formattedWoNumber);
          const bomQuery = db.collection("boms")
            .where("productId", "==", item.productId).limit(1);
          const bomSnap = await transaction.get(bomQuery);
          const bom = bomSnap.empty ? null : bomSnap.docs[0].data() as BOM;

          const newWorkOrder = {
            id: formattedWoNumber,
            productId: item.productId,
            productName: item.name,
            quantity: item.quantity,
            status: "Pending",
            createdAt: new Date().toISOString(),
            salesOrderId: orderRef.id,
            salesOrderNumber: formattedOrderNumber,
            productionTasks: bom?.productionTasks || [],
          };
          transaction.set(woRef, newWorkOrder);
          const woLog = `Created WO ${formattedWoNumber} for SO`;
          console.log(`${woLog} ${formattedOrderNumber}`);
        }
      }
    });
  });

/**
 * Triggers when an order is updated to "Delivered" to calculate and
 * assign commission to the responsible partner.
 */
export const onOrderUpdated = onDocumentUpdated("orders/{orderId}",
  async (event) => {
    if (!event.data) {
      console.log("No data associated with the event");
      return;
    }

    const before = event.data.before.data() as Order;
    const after = event.data.after.data() as Order;

    // Only proceed if status changed to "Delivered"
    if (before.status === after.status || after.status !== "Delivered") {
      return;
    }

    const orderId = event.params.orderId;
    const order = after;

    if (!order.assignedToUid) {
      const logMsg = `Order ${orderId} has no partner. No commission.`;
      console.log(logMsg);
      return;
    }

    const partnerId = order.assignedToUid;
    const logMsg = `Processing commission for Order ${orderId} for ${partnerId}`;
    console.log(logMsg);

    try {
      return db.runTransaction(async (transaction) => {
        const partnerRef = db.doc(`users/${partnerId}`);
        const partnerSnap = await transaction.get(partnerRef);

        if (!partnerSnap.exists) {
          console.error(`Partner profile ${partnerId} not found.`);
          return;
        }

        const partnerData = partnerSnap.data() as UserProfile;
        const partnerMatrix = partnerData?.partnerMatrix;

        if (!partnerMatrix || !Array.isArray(partnerMatrix)) {
          console.log(`Partner ${partnerId} has no commission matrix.`);
          return;
        }

        let calculatedCommission = 0;
        order.items.forEach((item) => {
          const rule = partnerMatrix.find((r) => r.category === item.category);
          if (rule && rule.commissionRate > 0) {
            const commissionableValue = item.price * item.quantity;
            calculatedCommission +=
              (commissionableValue * (rule.commissionRate / 100));
          }
        });

        if (calculatedCommission > 0) {
          const partnerWalletRef = db.doc(`users/${partnerId}/wallet/main`);
          const orderRef = db.doc(`orders/${orderId}`);

          transaction.set(partnerWalletRef, {
            commissionPayable: admin.firestore.FieldValue.increment(
              calculatedCommission
            ),
          }, {merge: true});

          transaction.update(orderRef, {commission: calculatedCommission});
        }
      });
    } catch (error: Error) {
      const errMsg = `Failed to process commission for ${orderId}:`;
      console.error(errMsg, error);
    }
  });
