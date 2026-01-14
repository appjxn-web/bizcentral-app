
import { z } from "zod";

export const warehouseSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(1).optional(),
  address: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(1).optional(),
  uom: z.enum(["NOS", "KG", "LTR", "MTR", "BOX", "SET"]).default("NOS"),
  hsn: z.string().optional(),
  gstRate: z.number().min(0).max(28).optional(),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productSchema>;

// qtySign: IN = +qty, OUT = -qty (we store qty as positive and sign by type)
export const stockMovementSchema = z.object({
  type: z.enum([
    "OPENING",
    "PURCHASE_IN",
    "SALES_OUT",
    "TRANSFER_OUT",
    "TRANSFER_IN",
    "ADJUSTMENT_IN",
    "ADJUSTMENT_OUT",
    "PROD_ISSUE",
    "PROD_RECEIPT",
    "RETURN_IN",
    "RETURN_OUT",
  ]),
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  qty: z.number().positive(),
  unitCost: z.number().min(0).optional(), // optional for costing later
  refType: z.string().optional(),         // e.g. "PO", "SI", "WO"
  refId: z.string().optional(),
  note: z.string().optional(),
  // for transfers:
  toWarehouseId: z.string().optional(),
});
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
