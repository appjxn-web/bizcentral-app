
export type UserRole = 'Admin' | 'Manager' | 'Employee' | 'Customer' | 'CEO' | 'Sales Manager' | 'Production Manager' | 'Purchase Manager' | 'Service Manager' | 'Accounts Manager' | 'HR Manager' | 'Gate Keeper' | 'Inventory Manager' | 'Partner' | 'Dealer' | 'Franchisee' | 'Accountant' | 'Staff';

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

export interface UserProfile extends User {
    wishlist?: string[];
    businessName?: string;
    displayName: string;
    contactPerson?: string;
    mobile?: string;
    pan?: string;
    gstin?: string;
    addresses?: Address[];
    bankAccounts?: BankAccount[];
    referredBy?: string;
    partnerMatrix?: CommissionRule[];
    coaLedgerId?: string;
    walletBalance?: number;
    commissionPayable?: number;
}
