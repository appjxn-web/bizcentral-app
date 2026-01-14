

import type {Timestamp} from "firebase/firestore";

export type DocPrefixConfig = {
    id: string;
    type: string;
    prefix: string;
    useDate: boolean;
    startNumber: number;
    digits: number;
};

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
  | "Awaiting Payment Confirmation"
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
  payoutStatus?: 'Awaiting Delivery' | 'Payable' | 'Paid' | 'No Commission';
  paymentDetails?: string; 
}

export interface SalesOrder extends Order {
  orderNumber: string;
  quotationId?: string;
}


export interface UserProfile {
  uid: string;
  name: string;
  role: string;
  partnerMatrix?: {
    category: string;
    commissionRate: number;
  }[];
  referredBy?: string;
  mobile?: string;
  walletBalance?: number;
  commissionPayable?: number;
  coaLedgerId?: string;
}

export interface Product {
  id: string;
  name: string;
  source: "Bought" | "Made";
  category: string;
  cost?: number;
  coaAccountId?: string;
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
  createdByUid?: string;
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

export interface SalesInvoice {
    id: string;
    invoiceNumber: string;
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    date: string;
    items: OrderItem[];
    subtotal: number;
    discount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst?: number;
    grandTotal: number;
    amountPaid: number;
    balanceDue: number;
    status: 'Paid' | 'Unpaid' | 'Overdue';
    dueDate?: string;
}

export interface DebitNote {
    id: string;
    debitNoteNumber: string;
    partyId: string;
    partyName: string;
    date: string;
    originalInvoiceId?: string;
    amount: number;
    reason: string;
    status: 'Draft' | 'Issued' | 'Settled';
    createdAt: any;
}

export interface CreditNote {
    id: string;
    creditNoteNumber: string;
    partyId: string;
    partyName: string;
    date: string;
    originalInvoiceId?: string;
    amount: number;
    reason: string;
    status: 'Draft' | 'Issued' | 'Settled';
    createdAt: any;
}

export interface RefundRequest {
    id: string;
    orderId: string;
    orderNumber?: string;
    customerId: string;
    customerName: string;
    refundAmount: number;
    requestDate: string;
    status: 'Pending' | 'Paid' | 'Rejected';
    transactionRef?: string;
    transactionDate?: string;
}


export interface Party {
    id: string;
    name: string;
    type: 'Customer' | 'Supplier' | 'Vendor' | 'Partner';
    coaLedgerId?: string;
    email?: string;
    // other party fields
}

export interface StockTransferRequest {
  id: string;
  requestingUserId: string;
  requestingUserName: string;
  partnerId: string;
  partnerName: string;
  items: {
      productId: string;
      productName: string;
      quantity: number;
  }[];
  status: 'Pending Approval' | 'Approved' | 'Rejected' | 'Shipped';
  createdAt: any; // Using `any` for Timestamp compatibility
  approvedAt?: any;
  shippedAt?: any;
  notes?: string;
}

export interface PaymentSubmission {
  id: string;
  userId: string;
  customerName: string;
  customerEmail?: string;
  orderId: string;
  amount: number;
  paymentMethod: string;
  transactionDetails: string;
  proofUrl?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: Timestamp;
}
    

    
