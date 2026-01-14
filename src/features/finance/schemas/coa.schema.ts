// src/features/finance/schemas/coa.schema.ts
import { z } from "zod";

export const coaGroupSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  nature: z.enum(["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"]),
  isActive: z.boolean().default(true),
});

export type CoaGroupInput = z.infer<typeof coaGroupSchema>;

export const coaLedgerSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(1).optional(),
  groupId: z.string().min(1),
  type: z.enum(["LEDGER", "PARTY", "BANK", "CASH", "GST", "TDS", "TCS"]).default("LEDGER"),
  openingBalance: z.number().finite().default(0),
  openingBalanceType: z.enum(["DR", "CR"]).default("DR"),
  isActive: z.boolean().default(true),
});

export type CoaLedgerInput = z.infer<typeof coaLedgerSchema>;
