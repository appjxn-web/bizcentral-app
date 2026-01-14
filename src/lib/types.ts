

import type { UserProfile, UserRole } from '@/features/users/types/users.types';
import type { CoaGroup, CoaLedger, JournalVoucher } from '@/features/finance/types/finance.types';

export type { UserProfile, UserRole, CoaGroup, CoaLedger, JournalVoucher };


export interface CommissionRule {
    category: string;
    commissionRate: number; // percentage
    maxDiscount: number; // percentage
}

export interface BankAccount {
    id: string;
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    upiId?: string;
}

export interface Address {
    id: string;
    type: string;
    line1: string;
    line2?: string;
    city: string;
    district: string;
    state: string;
    country: string;
    pin: string;
    digitalPin?: string;
    isPickupPoint?: boolean;
    latitude?: number;
    longitude?: number;
    pickupContactName?: string;
    pickupContactPhone?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  photoURL?: string; // Corrected from avatar
  role: UserRole;
  status: 'Active' | 'Deactivated';
}

export interface UserWallet {
    balance: number;
    commissionPayable: number;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  rating: number;
  comment: string;
  createdAt: any;
}

export type OfferStatus = 'Active' | 'Expired' | 'Upcoming' | 'Draft';
export type OfferApplicableOn = 'First time purchase' | 'Target Achievement' | 'Performances Boost' | 'Goodwill & Relationship' | 'Referral';

export interface Offer {
  id: string;
  title: string;
  description: string;
  type: 'Discount' | 'Coupon' | 'Target Achievement' | 'Performance Boost';
  code?: string;
  status: OfferStatus;
  targetRoles: UserRole[];
  validFrom: string;
  validTo: string;
  used: number;
  limit: number | 'unlimited';
  value: number;
  valueType: 'percent' | 'amount';
  applicableOn: OfferApplicableOn;
  imageUrl?: string;
  previewText?: string;
  targetType?: 'purchase' | 'sales' | 'production';
  targetValue?: number;
  redeem?: 'purchase' | 'cash' | 'both';
};

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
  createdAt: any;
  approvedAt?: any;
  shippedAt?: any;
  notes?: string;
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

export interface PayoutRequest {
  id: string;
  partnerId: string;
  partnerName: string;
  amount: number;
  requestDate: string;
  status: 'Pending' | 'Paid' | 'Rejected';
  transactionRef?: string;
  transactionDate?: string;
  paymentAccountId?: string;
}

export interface PaymentSubmission {
  id: string;
  userId: string; // The customer who owns the order
  recordedByUid?: string; // The user (partner/admin) who recorded the manual payment
  customerName: string;
  orderId: string;
  orderNumber?: string;
  amount: number;
  paymentMethod: string;
  transactionDetails?: string;
  proofUrl?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: any;
  assignedToUid: string | null;
  receivingAccountId?: string;
}


export interface ProductCategory {
    id: string;
    name: string;
}

export type ProductUnit = 'Kgs' | 'Ltrs' | 'Nos' | 'Sets' | 'Pairs' | 'Mtr' | 'Fts' | 'Rmt' | 'Rft';

export interface Product {
  id: string;
  name: string;
  heroLine?: string;
  brand?: string;
  description: string;
  price: number;
  cost?: number;
  imageUrl: string;
  imageUrl2?: string;
  imageUrl3?: string;
  imageUrl4?: string;
  videoUrl?: string;
  imageHint: string;
  status: 'Active' | 'R & D' | 'Discontinued' | 'Pre Sale';
  type: 'Finished Goods' | 'Raw Materials' | 'Assembly' | 'Components' | 'Consumables';
  category: string;
  sku: string;
  hsn?: string;
  source: 'Bought' | 'Made';
  openingStock: number;
  unit: ProductUnit;
  minStockLevel?: number;
  version?: string;
  modelNumber?: string;
  saleable?: boolean;
  warranty?: {
    months: number;
    childParts?: {
      name: string;
      months: number;
    }[];
  };
  coaAccountId?: string;
  preferredSupplierIds?: string[];
  reviews?: Review[];
}

export interface ServiceLog {
  id: string;
  invoiceNo: string;
  date: string;
  requestNo: string;
  description: string;
  status: 'Completed' | 'In Progress' | 'Canceled';
}

export interface ChildPart {
  id: string;
  name: string;
  warrantyMonths: number;
  installDate: string;
}

export interface RegisteredProduct {
  id: string; // This will be the serial number
  productName: string;
  imageUrl: string;
  imageHint?: string;
  serialNumber: string;
  purchaseDate: string;
  warrantyEndDate: string;
  status: 'Active' | 'Expiring Soon' | 'Expired';
  availableFreeServices?: number;
  serviceLogs?: ServiceLog[];
  childParts?: ChildPart[];
  customerId: string;
  customerName: string;
}

export interface SparesRequestItem {
  productId: string;
  productName: string;
  quantity: number;
}

export interface SparesRequest {
    id: string;
    engineerId: string;
    engineerName: string;
    requestDate: string;
    items: SparesRequestItem[];
    status: 'Pending' | 'Issued' | 'Returned' | 'Approved' | 'Rejected';
    type: 'Service' | 'Advance';
    approvedBy?: string;
    approvedAt?: string;
    issuedBy?: string;
    issuedAt?: string;
}

export type ServicePartRequestStatus = 'Pending Approval' | 'Approved' | 'Rejected' | 'Issued';

export interface ServicePartRequest {
  id: string;
  serviceRequestId: string;
  requestDate: string;
  isWarranty: boolean;
  parts: {
    productId: string;
    productName: string;
    quantity: number;
  }[];
  status: ServicePartRequestStatus;
}


export type ServiceRequestStatus = 'Pending' | 'In Progress' | 'Completed' | 'Canceled' | 'Quotation Sent' | 'Work Complete' | 'Invoice Sent' | 'Paid' | 'Awaiting Parts';

export interface QuotationItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  gstRate: number; // Percentage
}

export interface ServiceRequest {
  id: string;
  productName: string;
  serialNumber: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  dateSubmitted: string;
  description: string;
  status: ServiceRequestStatus;
  assignedTo?: string;
  imageUrl?: string;
  videoUrl?: string;
  quotation?: {
    items: QuotationItem[];
  }
}

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
  | "Cancellation Requested"
  | "Invoice Sent";
  
export interface Order {
  id: string;
  userId: string;
  orderNumber?: string;
  customerName: string;
  customerEmail: string;
  date: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  grandTotal: number;
  paymentReceived?: number;
  balance?: number;
  items: OrderItem[];
  pickupPointId: string | null;
  assignedToUid: string | null;
  paymentDetails?: string;
  commission?: number;
  payoutStatus?: 'Awaiting Delivery' | 'Payable' | 'Paid' | 'No Commission';
  pickupPoint?: {
    name: string;
    type: 'Factory' | 'Partner';
  }
  createdAt: any;
  expectedDeliveryDate?: string | null;
  cancellationReason?: string;
}
export interface SalesOrder extends Order {
  orderNumber: string;
  quotationId?: string;
}

export interface Vacancy {
    id: string;
    title: string;
    department: string;
    location: string;
    description: string;
    type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
    status: 'Open' | 'Closed';
}

export interface Applicant {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    avatar: string;
    vacancyId: string;
    vacancyTitle: string;
    appliedDate: string;
    status: 'Pending Review' | 'Shortlisted' | 'Interviewing' | 'Offered' | 'Rejected' | 'Hired';
    resumeUrl?: string;
}

export type OnboardingStatus = 'Hired' | 'Documentation' | 'Training' | 'Completed';

export type DocumentStatus = 'Missing' | 'Uploaded' | 'Verified';

export interface OnboardingDocument {
  id: string;
  name: string;
  status: DocumentStatus;
  file?: File;
}

export interface OnboardingEmployee {
  id: string;
  name: string;
  avatar: string;
  position: string;
  status: OnboardingStatus;
  documents: OnboardingDocument[];
  completedAt?: string | null;
}

export type OffboardingStatus = 'Resigned' | 'Knowledge Transfer' | 'Exit Interview' | 'Separated';

export interface OffboardingTask {
  id: string;
  name: string;
  isCompleted: boolean;
}

export interface OffboardingEmployee {
  id: string;
  name: string;
  avatar: string;
  position: string;
  lastDay: string;
  status: OffboardingStatus;
  checklist: OffboardingTask[];
  completedAt?: string | null;
}

export type PartyType = 'Customer' | 'Supplier' | 'Vendor' | 'Partner';
export type PartyStatus = 'Active' | 'Inactive' | 'Blacklisted';

export interface Party {
  id: string;
  name: string;
  contactPerson?: string;
  type: PartyType;
  status: PartyStatus;
  email?: string;
  phone: string;
  address?: Partial<Address>;
  gstin?: string;
  pan?: string;
  createdAt: string;
  createdBy: string;
  reason?: string;
  openingBalance?: number;
  latitude?: number;
  longitude?: number;
  bankAccount?: Partial<BankAccount>;
  coaLedgerId?: string;
}

export interface GateEntry {
  id: string;
  personName: string;
  mobile: string;
  vehicleNo: string;
  purpose: string;
  linkedDoc?: string;
  inTime: string;
  outTime?: string | null;
  imageUrl?: string | null;
  remarks?: string;
}

export type TaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'On Hold' | 'Rejected';
export type TaskCategory = 'Service' | 'Production' | 'Office' | 'Other';

export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  status: TaskStatus;
  assignedBy: string;
  assigneeId: string;
  dueDate: string;
  attachmentUrl?: string;
  proofImageUrl?: string;
  duration?: number; // Standard duration in minutes
  actualDuration?: number; // Actual duration in minutes
  rating?: number; // 1-5 star rating
  startedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  completedAt?: string;
  rejectionHistory?: {
    timestamp: string;
    reason: string;
    rejectedBy: string;
  }[];
}

export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Proposal Sent' | 'Converted' | 'Lost';
export type LeadSource = 'Website' | 'Referral' | 'Cold Call' | 'Event' | 'Social media' | 'Other';

export interface Lead {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone: string;
  gstin?: string;
  note?: string;
  status: LeadStatus;
  source: LeadSource;
  createdAt: string;
  ownerId: string; // The ID of the User who owns this lead
}

export interface BomItem {
  id: string;
  productId: string;
  productName: string;
  partNumber?: string;
  quantity: number;
  unit: string;
  rate?: number;
  amount?: number;
  assigneeId?: string;
}

export interface QcCheckPoint {
    id: string;
    checkPoint: string;
    method: string;
    details: string;
}

export interface ProductionTask {
    id: string;
    taskName: string;
    assigneeId: string;
    duration: number; // in minutes
    attachmentUrl?: string;
    // New fields to be populated on task completion
    status?: TaskStatus;
    actualDuration?: number; // in minutes
    rating?: number; // 1-5 stars
    taskId?: string; // Link to the created task
}

export interface BillOfMaterial {
  id: string;
  productId: string; // The finished good this BOM is for
  productName: string;
  items: BomItem[];
  createdAt: string;
  qcCheckPoints?: QcCheckPoint[];
  productionTasks?: ProductionTask[];
}

export interface ProductionTaskStep {
  id: string;
  name: string;
  estimatedTime: number; // in minutes
}

export interface ProductionTaskTemplate {
  id: string;
  name: string;
  category: string;
  department?: string;
  unit?: string;
  workstation?: string;
  steps: ProductionTaskStep[];
}

export interface ProductionAssignment {
  id: string;
  productId: string;
  productName: string;
  templateId: string;
  templateName: string;
  assigneeId: string;
  assigneeName: string;
  standardDuration: number;
  status: 'Pending' | 'In Progress' | 'Completed';
}

export type WorkOrderStatus = 'Pending' | 'In Progress' | 'Under QC' | 'Completed' | 'Canceled';

export interface IssuedItem {
    productId: string;
    productName: string;
    issuedQty: number;
    issuedTo: string;
    issuedAt: string;
}

export interface WorkOrder {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  status: WorkOrderStatus;
  createdAt: string;
  issuedItems?: IssuedItem[];
  productionTasks?: ProductionTask[];
  qcStatus?: 'Pending' | 'Passed' | 'Failed';
  qcChecklist?: any[];
  completedAt?: string;
  salesOrderId?: string;
  salesOrderNumber?: string;
}

export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Ordered' | 'Completed';

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  rate: number;
  amount: number;
  unit: string;
}

export type PoStatus = 'Draft' | 'Sent' | 'Completed' | 'Canceled';

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  status: PoStatus;
  items: PurchaseOrderItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  createdAt: any;
  requestId?: string;
}

export interface PurchaseRequest {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  rate: number;
  requestDate: string;
  requestedBy: string;
  status: RequestStatus;
  supplierId?: string;
  supplierName?: string;
  subtotal?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  grandTotal?: number;
}

export type ReimbursementStatus = 'Pending Approval' | 'Approved' | 'Rejected' | 'Paid';
export interface ReimbursementRequest {
    id: string;
    date: string;
    description: string;
    requestAmount: number;
    approvedAmount?: number;
    requestedBy: string;
    createdByUid: string;
    status: ReimbursementStatus;
    category: string;
    receiptUrl?: string;
    transactionRef?: string;
    transactionDate?: string;
}


export interface PunchLog {
  inTime: any;
  outTime: any | null;
  type: 'Office' | 'Field';
  isApproved?: boolean;
  inLocation?: { lat: number; lon: number };
  outLocation?: { lat: number; lon: number };
}

export interface Attendance {
  id?: string;
  date: string; // YYYY-MM-DD
  punches: PunchLog[];
  totalHours?: number;
  standardHours?: number;
  otHours?: number;
  totalEarning?: number;
  withdrawal?: number;
}

export interface GrnItem {
  productId: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  rate: number;
  gstRate: number;
  remarks?: string;
}

export interface Grn {
  id: string;
  poId: string;
  supplierName: string;
  supplierId: string;
  grnDate: string;
  items: GrnItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grandTotal: number;
  createdAt: any;
  paymentStatus: 'Pending Approval' | 'Approved' | 'Rejected' | 'Paid';
}

export interface AdvanceRequest {
    id: string;
    poId: string;
    supplierName: string;
    supplierId: string;
    poAmount: number;
    advanceAmount: number;
    requestDate: string;
    status: 'Pending Approval' | 'Approved' | 'Rejected' | 'Paid';
    reason?: string;
}

export interface SalaryAdvanceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  requestDate: string;
  amount: number;
  remarks?: string;
  status: 'Pending Approval' | 'Approved' | 'Rejected' | 'Paid';
}

export type GrnPaymentRequest = {
  id: string;
  grnId: string;
  poId: string;
  supplierName: string;
  supplierId: string;
  invoiceAmount: number;
  grnDate: string;
  status: 'Pending Approval' | 'Approved' | 'Rejected' | 'Paid';
};

export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected';

export interface QuotationItem {
    productId: string;
    name: string;
    hsn: string;
    qty: number;
    unit: string;
    rate: number;
    discount: number;
    gstRate: number;
    amount: number;
}

export interface Quotation {
    id: string;
    quotationNumber?: string;
    customerId: string;
    customerName: string;
    date: string;
    total: number;
    items: QuotationItem[];
    status: QuotationStatus;
    terms: string;
    bookingAmount?: number;
    overallDiscount?: number;
    createdBy?: string;
    createdAt?: any;
}

export interface SalesInvoiceItem {
    productId: string;
    name: string;
    quantity: number;
    rate: number;
    gstRate: number;
    discount: number;
    amount: number;
}

export interface SalesInvoice {
    id: string;
    invoiceNumber: string;
    orderId: string; // This is the FIRESTORE DOCUMENT ID of the order
    orderNumber?: string; // Human-readable order number
    customerId: string;
    customerName: string;
    coaLedgerId: string;
    date: string;
    items: SalesInvoiceItem[];
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
    appliedCoupons?: Offer[];
    deliveryDetails?: {
      shippingMethod: string;
      shippingCost: number;
      vehicleNumber: string;
      driverName: string;
      driverPhone: string;
      remarks: string;
    };
    assignedToUid?: string;
    createdByUid?: string;
}

export interface CreditItem extends Omit<SalesInvoiceItem, 'discount' | 'amount'> {
  returnQty: number;
  revisedRate: number;
  discount: number; // This can be the per-item discount if applicable
  amount: number; // This will be the line item total for this credit note
}

export interface DebitItem extends Omit<SalesInvoiceItem, 'discount' | 'amount'> {
  adjustQty: number;
  revisedRate: number;
  discount: number;
  amount: number;
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
    items?: DebitItem[];
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
    items?: CreditItem[];
}

export interface ServiceInvoice {
  id: string;
  invoiceNumber: string;
  serviceRequestId: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: number;
  status: 'Unpaid' | 'Paid';
}

export interface TdsRate {
  id: string;
  section: string;
  nature: string;
  threshold: string;
  rateIndHuf: string;
  rateCo: string;
  remark: string;
}

// Command Center Types
export type GoalVisibility = 'Company' | 'Leadership' | 'Private';
export type GoalTargetType = 'Percentage' | 'Numeric' | 'Currency';
export type GoalHealth = 'On Track' | 'At Risk' | 'Off Track';

export interface Goal {
    id: string;
    title: string;
    description: string;
    ownerId: string;
    collaboratorIds?: string[];
    visibility: GoalVisibility;
    startDate: string;
    endDate: string;
    targetType: GoalTargetType;
    targetValue: number;
    currentValue: number;
    progressPct: number;
    health: GoalHealth;
    weight: number;
}

export type MilestoneStatus = "Todo" | "In Progress" | "Done" | "Blocked";

export interface Milestone {
    id: string;
    title: string;
    ownerId: string;
    dueDate: string;
    status: MilestoneStatus;
    points: number;
}

// Support & Help Types
export interface SupportSettings {
  phone: string;
  whatsapp: string;
  email: string;
  hours: string;
  address: string;
}

export interface HelpGuide {
  id: string;
  title: string;
  contentMd: string;
  category: string;
  sortOrder: number;
  isActive: boolean;
}

export interface HelpDownload {
  id: string;
  title: string;
  fileUrl: string;
  category: string;
  sortOrder: number;
  isActive: boolean;
}

export interface SupportCallbackRequest {
  id: string;
  name: string;
  mobile: string;
  topic: string;
  message?: string;
  status: 'NEW' | 'CALLED' | 'CLOSED';
  createdAt: any;
  createdByUid: string;
}
      
// -----------------------------
// Missing exports used by Checkout
// -----------------------------

export interface CompanyInfo {
  companyName: string;
  primaryUpiId?: string;
  addresses?: Address[];
  payrollConfig?: PayrollConfig;
  attendanceConfig?: AttendanceConfig;
  taxInfo?: {
    [key: string]: {
      id: string;
      value: string;
      fileUrl?: string;
    };
  };
  commissionMatrix?: {
    effectiveDate: string;
    matrix: CommissionRule[];
  };
}

export interface AttendanceConfig {
    autoPunchOutForLunch: boolean;
    punchInGracePeriod: number;
    lunchOutTime: string;
    lunchInTime: string;
}


export interface PayrollConfig {
    monthly: {
        basicPercent: number;
        hraPercent: number;
        pfContributionPercent: number;
        professionalTax: number;
    },
    hourly: {
        defaultRate: number;
    },
    overtime: {
        slot1Multiplier: number;
        slot2Multiplier: number;
        slot3Multiplier: number;
    }
}

export interface PickupPoint {
  id: string;
  name: string;
  ownerUid?: string | null;
  active: boolean;
  addressLine?: string;
  lat?: number;
  lng?: number;
}

export type StockMovementType = 'Inward' | 'Outward' | 'Transfer' | 'Adjustment' | 'ProductionIssue' | 'ProductionReceipt';

export interface StockMovement {
  id: string;
  type: StockMovementType;
  productId: string;
  quantity: number; // Can be negative for outward movements
  referenceId: string; // e.g., GRN ID, Invoice ID, WO ID
  referenceType: 'GRN' | 'Sales Invoice' | 'Work Order' | 'Stock Adjustment' | 'Stock Transfer';
  createdAt: any;
  createdBy: string;
}

export interface AuditLog {
  id?: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'login' | 'logout';
  actorUid: string;
  actorDisplayName: string;
  timestamp: any;
  changes?: {
    before: any;
    after: any;
  };
  context?: any;
}
