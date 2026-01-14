
import { z } from "zod";

export const journalLineSchema = z.object({
  ledgerId: z.string().min(1),
  dr: z.number().nonnegative().default(0),
  cr: z.number().nonnegative().default(0),
  narration: z.string().optional(),
});

export const voucherSchema = z.object({
  voucherType: z.enum(["SALES_INVOICE", "PURCHASE_INVOICE", "RECEIPT", "PAYMENT", "EXPENSE", "JOURNAL"]),
  voucherDate: z.string().min(8), // store ISO date "2026-01-14"
  refNo: z.string().optional(),
  narration: z.string().optional(),
  lines: z.array(journalLineSchema).min(2),
});
