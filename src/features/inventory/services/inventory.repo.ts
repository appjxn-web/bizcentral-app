
'use server';

import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { initializeFirebase } from "@/firebase"; 
import { inventoryPaths } from "@/firebase/paths";
import {
  productSchema,
  warehouseSchema,
  stockMovementSchema,
  type ProductInput,
  type WarehouseInput,
  type StockMovementInput,
} from "../schemas/inventory.schema";

const { firestore: db } = initializeFirebase();

const outTypes = new Set([
  "SALES_OUT",
  "TRANSFER_OUT",
  "ADJUSTMENT_OUT",
  "PROD_ISSUE",
  "RETURN_OUT",
]);

export const inventoryRepo = {
  async createWarehouse(companyId: string, input: WarehouseInput, actorUid: string) {
    const data = warehouseSchema.parse(input);
    const ref = collection(db, inventoryPaths.warehouses(companyId));
    const res = await addDoc(ref, {
      ...data,
      companyId,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return res.id;
  },

  async createProduct(companyId: string, input: ProductInput, actorUid: string) {
    const data = productSchema.parse(input);
    const ref = collection(db, inventoryPaths.products(companyId));
    const res = await addDoc(ref, {
      ...data,
      companyId,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return res.id;
  },

  async addMovement(companyId: string, input: StockMovementInput, actorUid: string) {
    const mv = stockMovementSchema.parse(input);
    const ref = collection(db, inventoryPaths.stockMovements(companyId));

    // store signedQty for easy aggregation later
    const signedQty = outTypes.has(mv.type) ? -mv.qty : mv.qty;

    const res = await addDoc(ref, {
      ...mv,
      signedQty,
      companyId,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
    });

    // If TRANSFER, create the second movement automatically (IN)
    if (mv.type === "TRANSFER_OUT" && mv.toWarehouseId) {
      await addDoc(ref, {
        type: "TRANSFER_IN",
        productId: mv.productId,
        warehouseId: mv.toWarehouseId,
        qty: mv.qty,
        signedQty: mv.qty,
        unitCost: mv.unitCost ?? 0,
        refType: mv.refType ?? "TRANSFER",
        refId: mv.refId ?? res.id,
        note: mv.note ?? "",
        companyId,
        createdBy: actorUid,
        createdAt: serverTimestamp(),
      });
    }

    return res.id;
  },

  async listMovements(companyId: string, opts: { productId?: string; warehouseId?: string; take?: number } = {}) {
    const ref = collection(db, inventoryPaths.stockMovements(companyId));
    const constraints: any[] = [orderBy("createdAt", "desc"), limit(opts.take ?? 200)];
    if (opts.productId) constraints.unshift(where("productId", "==", opts.productId));
    if (opts.warehouseId) constraints.unshift(where("warehouseId", "==", opts.warehouseId));
    const q = query(ref, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  // Simple stock calc (OK for small data; later we cache monthly)
  async getStockOnHand(companyId: string, productId: string, warehouseId: string) {
    const ref = collection(db, inventoryPaths.stockMovements(companyId));
    const q = query(ref, where("productId", "==", productId), where("warehouseId", "==", warehouseId), limit(5000));
    const snap = await getDocs(q);
    let total = 0;
    snap.forEach((d) => {
      total += Number((d.data() as any).signedQty ?? 0);
    });
    return total;
  },
};
