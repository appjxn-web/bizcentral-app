

import type { Timestamp } from 'firebase/firestore';

export type CoaNature = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export type CoaGroup = {
  id: string;
  name: string;
  code?: string;
  nature: CoaNature;
  parentId: string | null;
  level: number;
  sortOrder: number;
  path: string;
  isSystem: boolean;
  isActive: boolean;
  reporting: {
    statement: "BS" | "PL";
    section?: string;
    cashFlowTag?: "OPERATING" | "INVESTING" | "FINANCING";
  };
  allowLedgerPosting: boolean;
  createdAt: any;
  updatedAt: any;
};

export type CoaLedger = {
  id: string;
  name: string;
  ledgerCode?: string;
  groupId: string;
  nature: CoaNature;
  type:
    | "CASH"
    | "BANK"
    | "RECEIVABLE"
    | "PAYABLE"
    | "INVENTORY"
    | "FIXED_ASSET"
    | "DEPRECIATION"
    | "GST_INPUT"
    | "GST_OUTPUT"
    | "TDS"
    | "TCS"
    | "EXPENSE"
    | "INCOME"
    | "CAPITAL"
    | "LOAN"
    | "ROUND_OFF"
    | "SUSPENSE"
    | "OTHER";

  posting: {
    isPosting: boolean;
    normalBalance: "DEBIT" | "CREDIT";
    isSystem: boolean;
    allowManualJournal: boolean;
  };

  bank?: {
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    accountNumberMasked?: string;
    ifscCode?: string;
    upiId?: string;
    adCode?: string;
    accountType?: "CURRENT" | "SAVINGS" | "OD_CC";
  };

  inventory?: {
    valuationMethod?: "FIFO" | "WEIGHTED_AVG";
    isStockLedger?: boolean;
    cogsLedgerId?: string;
  };

  fixedAsset?: {
    assetCategory?: string;
    depreciationMethod?: "SLM" | "WDV";
    depreciationRate?: number;
    accumulatedDepLedgerId?: string;
  };

  openingBalance?: {
    amount: number;
    drCr: "DR" | "CR";
    asOf: string; // ISO date
  };

  status: "ACTIVE" | "INACTIVE";
  tags?: string[];
  createdAt: any;
  updatedAt: any;
};


export type JournalVoucher = {
  id: string;
  date: string;
  narration: string;
  voucherType?: string;
  entries: {
    accountId: string;
    debit?: number;
    credit?: number;
  }[];
  lines?: {
    ledgerId: string;
    dr: number;
    cr: number;
    narration?: string;
  }[];
  isReversal?: boolean;
  reversedVoucherId?: string;
  createdAt: any;
  createdByUid?: string;
};

    