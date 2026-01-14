
import { z } from "zod";

export const salesInvoiceItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive(),
  rate: z.number().min(0),
  gstRate: z.number().min(0).max(28).default(18),
});

export const salesInvoiceSchema = z.object({
  invoiceDate: z.string().min(8), // "2026-01-14"
  invoiceNo: z.string().min(1),
  customerId: z.string().min(1),
  warehouseId: z.string().min(1),
  items: z.array(salesInvoiceItemSchema).min(1),
  discount: z.number().min(0).default(0),
  shipping: z.number().min(0).default(0),
  note: z.string().optional(),
});

export type SalesInvoiceInput = z.infer<typeof salesInvoiceSchema>;
