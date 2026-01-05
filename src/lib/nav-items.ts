

import {
  Briefcase,
  Home,
  Package,
  ShoppingCart,
  Users,
  Settings,
  LifeBuoy,
  Box,
  Building,
  ChevronDown,
  Target,
  FileText,
  Factory,
  Wrench,
  ShieldCheck,
  Landmark,
  CreditCard,
  Banknote,
  Book,
  ClipboardList,
  PieChart,
  PackageCheck,
  CheckCircle,
  TrendingUp,
  UserPlus,
  UserMinus,
  CalendarCheck,
  Handshake,
  Store,
  Building2,
  UserCheck as UserCheckIcon,
  UserCog,
  Warehouse,
  UserSquare,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckCheck,
  AlertTriangle,
  Tag,
  Bell,
  Megaphone,
  Heart,
  FileDigit,
  BookOpen,
  ArrowLeftRight,
  GanttChartSquare,
  BookUser,
  BookText,
  BookKey,
  CalendarClock,
  LayoutDashboard,
  Wallet,
  Receipt,
  Scale,
  Columns3,
  TrendingDown,
  Shapes,
  Sheet as SheetIcon,
  ClipboardPaste,
  CircleDollarSign,
  User,
  Database,
  SlidersHorizontal,
  Goal,
  FilePlus,
  FileMinus,
} from 'lucide-react';
import type { UserRole } from './types';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  role?: UserRole;
  items?: NavItem[];
}


export const navItems: NavItem[] = [
  { id: 'dashboard', href: '/dashboard', icon: Home, label: 'Dashboard' },
  {
    id: 'command-center',
    label: 'Command Center',
    icon: Goal,
    items: [
      { id: 'command-center-goals', href: '/dashboard/command-center/goals', icon: Target, label: 'Goals' },
      { id: 'command-center-timeline', href: '/dashboard/command-center/timeline', icon: GanttChartSquare, label: 'Timeline' },
      { id: 'command-center-leaderboard', href: '/dashboard/command-center/leaderboard', icon: TrendingUp, label: 'Leaderboard' },
    ]
  },
  { id: 'notifications', href: '/dashboard/notifications', icon: Bell, label: 'Notifications' },
  { id: 'shop', href: '/', icon: ShoppingCart, label: 'E-Shop' },
  { id: 'my-orders', href: '/dashboard/my-orders', icon: Package, label: 'My Orders' },
  { id: 'wishlist', href: '/dashboard/wishlist', icon: Heart, label: 'Wishlist' },
  { id: 'my-products', href: '/dashboard/my-products', icon: Box, label: 'My Products' },
  { id: 'my-account', href: '/dashboard/my-account', icon: UserSquare, label: 'My Ledger' },
  { id: 'referrals', href: '/dashboard/referrals', icon: Handshake, label: 'Referrals' },
  { id: 'deals-offers', href: '/dashboard/deals-offers', icon: Tag, label: 'Deals & Offers' },
  { id: 'parties', href: '/dashboard/parties', icon: Briefcase, label: 'Parties' },
  { id: 'my-task', href: '/dashboard/my-task', icon: ClipboardList, label: 'My Task' },
  { id: 'create-task', href: '/dashboard/create-task', icon: ClipboardPaste, label: 'Create Task' },
  { id: 'create-post', href: '/dashboard/create-post', icon: Megaphone, label: 'Create Post' },
  { id: 'my-attendance', href: '/dashboard/my-attendance', icon: CalendarCheck, label: 'My Attendance' },
  { id: 'reimbursement', href: '/dashboard/reimbursement', icon: Wallet, label: 'Reimbursement' },
  { id: 'approvals', href: '/dashboard/approvals', icon: CheckCircle, label: 'Approvals' },
  { id: 'gate-keeper', href: '/dashboard/gate-keeper', icon: ShieldCheck, label: 'Gate Keeper' },
  {
    id: 'sales',
    label: 'Sales',
    icon: Users,
    items: [
        { id: 'sales-lead', href: '/dashboard/sales/lead', icon: Target, label: 'Lead' },
        { id: 'sales-quotation', href: '/dashboard/sales/quotation', icon: FileText, label: 'Quotation' },
        { id: 'sales-orders', href: '/dashboard/sales/orders', icon: Package, label: 'Orders' },
        { id: 'sales-commission-report', href: '/dashboard/sales/commission-report', icon: PieChart, label: 'Commission Report' },
    ]
  },
  {
    id: 'production',
    label: 'Production',
    icon: Factory,
    items: [
        { id: 'production-products', label: 'Products & Services', icon: Box, href: '/dashboard/products-services' },
        { id: 'production-categories', href: '/dashboard/production/categories', icon: Shapes, label: 'Product Categories' },
        { id: 'production-bom', href: '/dashboard/production/bills-of-material', icon: FileText, label: 'Bills of Material' },
        { id: 'production-work-orders', href: '/dashboard/production/work-orders', icon: Wrench, label: 'Work Orders' },
        { id: 'production-quality-control', href: '/dashboard/production/quality-control', icon: ShieldCheck, label: 'Quality Control' },
    ]
  },
  {
    id: 'finance',
    label: 'Finance & Accounting',
    icon: Landmark,
    items: [
        { id: 'finance-chart-of-accounts', href: '/dashboard/finance-accounting/chart-of-accounts', icon: SheetIcon, label: 'Chart of Accounts' },
        { id: 'finance-record-purchase', href: '/dashboard/procurement/record-purchase', icon: Receipt, label: 'Record Purchase' },
        { id: 'finance-transactions', href: '/dashboard/finance-accounting/transactions', icon: ArrowLeftRight, label: 'Transactions' },
        { id: 'finance-party-statement', href: '/dashboard/finance-accounting/party-statement', icon: BookUser, label: 'Party / Ledger Statement' },
        { id: 'finance-bank-cash', href: '/dashboard/finance-accounting/bank-cash', icon: Banknote, label: 'Bank & Cash' },
        { id: 'finance-invoice', href: '/dashboard/finance-accounting/invoice', icon: FileText, label: 'Invoice' },
        { id: 'finance-credit-note', href: '/dashboard/finance-accounting/credit-note', icon: FileMinus, label: 'Credit Note' },
        { id: 'finance-debit-note', href: '/dashboard/finance-accounting/debit-note', icon: FilePlus, label: 'Debit Note' },
        { id: 'finance-gst', href: '/dashboard/finance-accounting/gst', icon: FileText, label: 'GST' },
        { id: 'finance-day-book', href: '/dashboard/finance-accounting/day-book', icon: BookOpen, label: 'Day Book' },
        { id: 'finance-statutory-metrix', href: '/dashboard/finance-accounting/statutory-metrix', icon: PieChart, label: 'Statutory Metrix' },
        { id: 'finance-reimbursement-process', href: '/dashboard/finance-accounting/reimbursement-process', icon: CircleDollarSign, label: 'Reimbursement Process' },
        { id: 'finance-balance-sheet', href: '/dashboard/finance-accounting/balance-sheet', icon: Scale, label: 'Balance Sheet'},
        { id: 'finance-profit-and-loss', href: '/dashboard/finance-accounting/profit-and-loss', icon: TrendingUp, label: 'Profit & Loss'},
        { id: 'finance-trial-balance', href: '/dashboard/finance-accounting/trial-balance', icon: Columns3, label: 'Trial Balance'},
    ]
  },
  {
    id: 'procurement',
    label: 'Procurement',
    icon: ShoppingCart,
    items: [
        { id: 'procurement-record-purchase', href: '/dashboard/procurement/record-purchase', icon: Receipt, label: 'Record Purchase' },
        { id: 'procurement-requested', href: '/dashboard/procurement/purchase-requested', icon: ClipboardList, label: 'Purchase Requested' },
        { id: 'procurement-analysis', href: '/dashboard/procurement/vendor-analysis', icon: PieChart, label: 'Vendor Analysis' },
        { id: 'procurement-orders', href: '/dashboard/procurement/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders' },
        { id: 'procurement-notes', href: '/dashboard/procurement/goods-service-received-notes', icon: PackageCheck, label: 'Goods & Service Received Notes' },
        { id: 'procurement-approval', href: '/dashboard/procurement/payment-approval', icon: CheckCircle, label: 'Payment Approval' },
    ]
  },
    {
    id: 'inventories-reports',
    label: 'Inventories & Reports',
    icon: Warehouse,
    items: [
      { id: 'inventories-stocks', href: '/dashboard/inventories-reports/stocks', icon: Package, label: 'Stocks' },
      { id: 'inventories-inwards', href: '/dashboard/inventories-reports/inwards', icon: ArrowDownToLine, label: 'Inwards' },
      { id: 'inventories-outwards', href: '/dashboard/inventories-reports/outwards', icon: ArrowUpToLine, label: 'Outwards' },
      { id: 'inventories-reconciliation', href: '/dashboard/inventories-reports/stock-reconciliation', icon: CheckCheck, label: 'Stock Reconciliation' },
      { id: 'inventories-spares-request', href: '/dashboard/inventories-reports/spares-request', icon: Wrench, label: 'Spares Request (Advance)' },
    ]
  },
  {
    id: 'hr',
    label: 'HR',
    icon: Users,
    items: [
        { id: 'hr-vacancies', href: '/dashboard/hr/vacancies', icon: ClipboardList, label: 'Vacancies' },
        { id: 'hr-resumes', href: '/dashboard/hr/resumes', icon: FileText, label: 'Resumes' },
        { id: 'hr-on-board', href: '/dashboard/hr/on-board', icon: UserPlus, label: 'On-board' },
        { id: 'hr-off-board', href: '/dashboard/hr/off-board', icon: UserMinus, label: 'Off-board' },
        { id: 'hr-attendance', href: '/dashboard/hr/attendance', icon: CalendarCheck, label: 'Attendance' },
        { id: 'hr-payroll', href: '/dashboard/hr/payroll', icon: Banknote, label: 'Payroll' },
        { id: 'hr-settings', href: '/dashboard/hr/settings', icon: Settings, label: 'Settings' },
    ]
  },
  {
    id: 'service-warranty',
    label: 'Service & Warranty',
    icon: Wrench,
    items: [
        { id: 'service-warranty-warranty', href: '/dashboard/service-warranty/warranty-management', icon: ShieldCheck, label: 'Warranty Management' },
        { id: 'service-warranty-service', href: '/dashboard/service-warranty/service-management', icon: Wrench, label: 'Service Management' },
        { id: 'service-warranty-invoice', href: '/dashboard/service-warranty/invoice', icon: FileText, label: 'Service Invoice' },
    ]
  },
  {
    id: 'switch-dashboard',
    label: 'Switch to Dashboard',
    icon: Users,
    items: [
      { id: 'dashboard-ceo', href: '/dashboard/dashboards/ceo', icon: UserCog, label: 'CEO', role: 'CEO' },
      { id: 'dashboard-sales-manager', href: '/dashboard/dashboards/sales-manager', icon: UserCog, label: 'Sales Manager', role: 'Sales Manager' },
      { id: 'dashboard-partner', href: '/dashboard/dashboards/partner', icon: Handshake, label: 'Partner', role: 'Partner' },
      { id: 'dashboard-production-manager', href: '/dashboard/dashboards/production-manager', icon: UserCog, label: 'Production Manager', role: 'Production Manager' },
      { id: 'dashboard-purchase-manager', href: '/dashboard/dashboards/purchase-manager', icon: UserCog, label: 'Purchase Manager', role: 'Purchase Manager' },
      { id: 'dashboard-service-manager', href: '/dashboard/dashboards/service-manager', icon: UserCog, label: 'Service Manager', role: 'Service Manager' },
      { id: 'dashboard-accounts-manager', href: '/dashboard/dashboards/accounts-manager', icon: UserCog, label: 'Accounts Manager', role: 'Accounts Manager' },
      { id: 'dashboard-hr-manager', href: '/dashboard/dashboards/hr-manager', icon: UserCog, label: 'HR Manager', role: 'HR Manager' },
      { id: 'dashboard-gate-keeper', href: '/dashboard/dashboards/gate-keeper', icon: ShieldCheck, label: 'Gate Keeper', role: 'Gate Keeper' },
      { id: 'dashboard-inventory-manager', href: '/dashboard/dashboards/inventory-manager', icon: Warehouse, label: 'Inventory Manager', role: 'Inventory Manager' },
      { id: 'dashboard-employee', href: '/dashboard/dashboards/employee', icon: User, label: 'Employee', role: 'Employee' },
      { id: 'dashboard-customer', href: '/dashboard/dashboards/customer', icon: User, label: 'Customer', role: 'Customer' },
    ]
  },
  { id: 'sales-partners-management', href: '/dashboard/sales/partners-management', icon: Handshake, label: 'Partners Management' },
  {
    id: 'company-settings',
    label: 'Company & Settings',
    icon: Settings,
    items: [
        { id: 'company-settings-company', href: '/dashboard/company', icon: Building, label: 'Company' },
        { id: 'company-settings-users', href: '/dashboard/users', icon: Users, label: 'Users' },
        { id: 'create-deals-offer', href: '/dashboard/create-deals-offer', icon: Tag, label: 'Create Deals & Offer' },
        { id: 'company-settings-commission', href: '/dashboard/sales/commission-metrix', icon: TrendingUp, label: 'Commission & Discount' },
        { id: 'settings.prefixes', href: '/dashboard/settings/prefixes', icon: SlidersHorizontal, label: 'Prefixes & Numbering' },
        { id: 'settings.help', href: '/dashboard/settings/help', icon: LifeBuoy, label: 'Help Settings' },
        { id: 'company-settings-backup', href: '/dashboard/settings/backup', icon: Database, label: 'Backup & Restore' },
    ]
  }
];
