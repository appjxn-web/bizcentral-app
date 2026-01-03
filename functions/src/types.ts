

import type {Timestamp} from "firebase/firestore";

export type CoaNature = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export type CoaLedger = {
  id: string;
  name: string;
  ledgerCode?: string;
  groupId: string;
  nature: CoaNature;
  type: string;
  openingBalance?: {
    amount: number;
    drCr: "DR" | "CR";
  };
  bank?: {
      upiId?: string;
  }
};

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  category?: string;
}

export type OrderStatus =
  | "Ordered"
  | "Manufacturing"
  | "Ready for Dispatch"
  | "Awaiting Payment"
  | "Shipped"
  | "Delivered"
  | "Canceled"
  | "Cancellation Requested";

export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  grandTotal: number;
  paymentReceived: number;
  balance: number;
  commission?: number;
  assignedToUid?: string;
}


export interface UserProfile {
  uid: string;
  name: string;
  role: string;
  partnerMatrix?: {
    category: string;
    commissionRate: number;
  }[];
}

export interface Product {
  id: string;
  name: string;
  source: "Bought" | "Made";
  category: string;
}

export interface BOM {
  productId: string;
  productionTasks: {
    taskName: string;
    duration: number;
    assigneeId: string;
  }[];
}

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
  createdAt: Timestamp;
};

export interface CompanyInfo {
    primaryUpiId?: string;
    companyName?: string;
}

export interface Goal {
  title: string;
  startDate: string; // or Date
  endDate: string;   // or Date
  targetValue: number;
  currentValue: number;
  progressPct: number;
  health: "On Track" | "At Risk" | "Off Track";
}

export interface Milestone {
  id: string;
  label: string;
  date: string;
  status: "Todo" | "In Progress" | "Done";
}
