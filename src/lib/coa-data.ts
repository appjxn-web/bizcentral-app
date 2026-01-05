
import type { CoaGroup, CoaLedger, CoaNature } from './types';

// =================================================================================
// CHART OF ACCOUNTS - DEFAULT STRUCTURE
// =================================================================================
// This file contains the default Chart of Accounts structure for the application.
// It is used to seed the Firestore database with initial data.

const createGroup = (
  id: string,
  name: string,
  nature: CoaNature,
  parentId: string | null,
  level: number,
  sortOrder: number,
  isSystem = false
): Omit<CoaGroup, 'createdAt' | 'updatedAt' | 'path'> => ({
  id,
  name,
  nature,
  parentId,
  level,
  sortOrder,
  isSystem,
  isActive: true,
  reporting: {
    statement: nature === 'INCOME' || nature === 'EXPENSE' ? 'PL' : 'BS',
  },
  allowLedgerPosting: false,
});

const createLedger = (
  id: string,
  name: string,
  groupId: string,
  nature: CoaNature
): Omit<CoaLedger, 'id' | 'createdAt' | 'updatedAt'> => ({
    name,
    groupId,
    nature,
    type: 'OTHER', // Default type
    posting: {
        isPosting: true,
        normalBalance: nature === 'ASSET' || nature === 'EXPENSE' ? 'DEBIT' : 'CREDIT',
        isSystem: false,
        allowManualJournal: true,
    },
    openingBalance: {
        amount: 0,
        drCr: nature === 'ASSET' || nature === 'EXPENSE' ? 'DR' : 'CR',
        asOf: new Date().toISOString(),
    },
    status: 'ACTIVE',
});


export const defaultCoaGroups: Omit<CoaGroup, 'createdAt' | 'updatedAt' | 'path'>[] = [
  // ASSETS
  createGroup('1', 'ASSETS', 'ASSET', null, 0, 1),
    createGroup('1.1', 'Current Assets', 'ASSET', '1', 1, 1),
      createGroup('1.1.1', 'Cash & Bank', 'ASSET', '1.1', 2, 1),
      createGroup('1.1.2', 'Trade Receivables', 'ASSET', '1.1', 2, 2),
      createGroup('1.1.3', 'Inventory', 'ASSET', '1.1', 2, 3),
      createGroup('1.1.4', 'Other Current Assets', 'ASSET', '1.1', 2, 4),
    createGroup('1.2', 'Non-Current Assets', 'ASSET', '1', 1, 2),
      createGroup('1.2.1', 'Fixed Assets – Tangible', 'ASSET', '1.2', 2, 1),
      createGroup('1.2.2', 'Fixed Assets – Intangible', 'ASSET', '1.2', 2, 2),
      createGroup('1.2.3', 'Accumulated Depreciation (Contra Assets)', 'ASSET', '1.2', 2, 3),
      createGroup('1.2.4', 'Capital Work-in-Progress (CWIP)', 'ASSET', '1.2', 2, 4),

  // LIABILITIES
  createGroup('2', 'LIABILITIES', 'LIABILITY', null, 0, 2),
    createGroup('2.1', 'Current Liabilities', 'LIABILITY', '2', 1, 1),
      createGroup('2.1.1', 'Trade Payables', 'LIABILITY', '2.1', 2, 1),
      createGroup('2.1.2', 'Statutory Liabilities', 'LIABILITY', '2.1', 2, 2),
      createGroup('2.1.3', 'Other Current Liabilities', 'LIABILITY', '2.1', 2, 3),
    createGroup('2.2', 'Non-Current Liabilities', 'LIABILITY', '2', 1, 2),
      createGroup('2.2.1', 'Borrowings', 'LIABILITY', '2.2', 2, 1),
      createGroup('2.2.2', 'Provisions', 'LIABILITY', '2.2', 2, 2),

  // EQUITY
  createGroup('3', 'EQUITY', 'EQUITY', null, 0, 3),
    createGroup('3.1', 'Share Capital', 'EQUITY', '3', 1, 1),
    createGroup('3.2', 'Reserves & Surplus', 'EQUITY', '3', 1, 2),
    createGroup('3.3', 'Drawings', 'EQUITY', '3', 1, 3),

  // INCOME
  createGroup('4', 'INCOME', 'INCOME', null, 0, 4),
    createGroup('4.1', 'Operating Income', 'INCOME', '4', 1, 1),
    createGroup('4.2', 'Other Income', 'INCOME', '4', 1, 2),

  // COGS
  createGroup('5', 'COST OF GOODS SOLD (COGS)', 'EXPENSE', null, 0, 5),

  // EXPENSES
  createGroup('6', 'EXPENSES (INDIRECT)', 'EXPENSE', null, 0, 6),
    createGroup('6.1', 'Administrative Expenses', 'EXPENSE', '6', 1, 1),
    createGroup('6.2', 'Selling & Distribution Expenses', 'EXPENSE', '6', 1, 2),
    createGroup('6.3', 'Employee Expenses', 'EXPENSE', '6', 1, 3),
    createGroup('6.4', 'Finance Costs', 'EXPENSE', '6', 1, 4),
    createGroup('6.5', 'Depreciation', 'EXPENSE', '6', 1, 5),
    
  // SYSTEM / LOCKED GROUPS
  createGroup('8', 'SYSTEM / AUTO-CREATED GROUPS', 'ASSET', null, 0, 8, true),
];

export const defaultCoaLedgers: Omit<CoaLedger, 'createdAt' | 'updatedAt'>[] = [
  // ASSETS
  createLedger('L-1.1.1-1', 'Cash in Hand', '1.1.1', 'ASSET'),
  createLedger('L-1.1.1-2', 'Bank – Current Account', '1.1.1', 'ASSET'),
  createLedger('L-1.1.1-3', 'Bank – Savings Account', '1.1.1', 'ASSET'),
  createLedger('L-1.1.1-4', 'Bank - OD - CC Account', '1.1.1', 'ASSET'),
  
  createLedger('L-1.1.2-1', 'Trade Debtors – Domestic', '1.1.2', 'ASSET'),
  createLedger('L-1.1.2-2', 'Trade Debtors – Export', '1.1.2', 'ASSET'),
  createLedger('L-1.1.2-3', 'Provision for Doubtful Debts (Contra)', '1.1.2', 'ASSET'),

  createLedger('L-1.1.3-1', 'Stock-in-Hand – Raw Material', '1.1.3', 'ASSET'),
  createLedger('L-1.1.3-2', 'Stock-in-Hand – Work-in-Progress', '1.1.3', 'ASSET'),
  createLedger('L-1.1.3-3', 'Stock-in-Hand – Finished Goods', '1.1.3', 'ASSET'),
  createLedger('L-1.1.3-4', 'Stock-in-Hand – Spares', '1.1.3', 'ASSET'),
  
  createLedger('L-1.1.4-1', 'Input GST – CGST', '1.1.4', 'ASSET'),
  createLedger('L-1.1.4-2', 'Input GST – SGST', '1.1.4', 'ASSET'),
  createLedger('L-1.1.4-3', 'Input GST – IGST', '1.1.4', 'ASSET'),
  createLedger('L-1.1.4-4', 'TDS Receivable', '1.1.4', 'ASSET'),
  createLedger('L-1.1.4-5', 'TCS Receivable', '1.1.4', 'ASSET'),
  createLedger('L-1.1.4-6', 'Advance to Suppliers', '1.1.4', 'ASSET'),
  createLedger('L-1.1.4-7', 'Prepaid Expenses', '1.1.4', 'ASSET'),
  createLedger('L-1.1.4-8', 'Employee Advances', '1.1.4', 'ASSET'),
  createLedger('L-1.1.4-9', 'Deposits (Rent / Electricity / Security)', '1.1.4', 'ASSET'),

  createLedger('L-1.2.1-1', 'Land', '1.2.1', 'ASSET'),
  createLedger('L-1.2.1-2', 'Building', '1.2.1', 'ASSET'),
  createLedger('L-1.2.1-3', 'Plant & Machinery', '1.2.1', 'ASSET'),
  createLedger('L-1.2.1-4', 'Factory Equipment', '1.2.1', 'ASSET'),
  createLedger('L-1.2.1-5', 'Office Equipment', '1.2.1', 'ASSET'),
  createLedger('L-1.2.1-6', 'Furniture & Fixtures', '1.2.1', 'ASSET'),
  createLedger('L-1.2.1-7', 'Computers & IT Equipment', '1.2.1', 'ASSET'),
  createLedger('L-1.2.1-8', 'Vehicles', '1.2.1', 'ASSET'),

  createLedger('L-1.2.2-1', 'Software', '1.2.2', 'ASSET'),
  createLedger('L-1.2.2-2', 'Trademark', '1.2.2', 'ASSET'),
  createLedger('L-1.2.2-3', 'Goodwill', '1.2.2', 'ASSET'),

  createLedger('L-1.2.3-1', 'Accumulated Depreciation – Building', '1.2.3', 'ASSET'),
  createLedger('L-1.2.3-2', 'Accumulated Depreciation – Machinery', '1.2.3', 'ASSET'),
  createLedger('L-1.2.3-3', 'Accumulated Depreciation – Vehicles', '1.2.3', 'ASSET'),
  createLedger('L-1.2.3-4', 'Accumulated Depreciation – Computers', '1.2.3', 'ASSET'),

  createLedger('L-1.2.4-1', 'CWIP – Machinery', '1.2.4', 'ASSET'),
  createLedger('L-1.2.4-2', 'CWIP – Building', '1.2.4', 'ASSET'),

  // LIABILITIES
  createLedger('L-2.1.1-1', 'Trade Creditors – Domestic', '2.1.1', 'LIABILITY'),
  createLedger('L-2.1.1-2', 'Trade Creditors – Import', '2.1.1', 'LIABILITY'),
  
  createLedger('L-2.1.2-1', 'Output GST – CGST', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-2', 'Output GST – SGST', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-3', 'Output GST – IGST', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-4', 'GST Payable (Net)', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-5', 'TDS Payable', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-6', 'TCS Payable', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-7', 'PF Payable', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-8', 'ESI Payable', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-9', 'Professional Tax Payable', '2.1.2', 'LIABILITY'),
  createLedger('L-2.1.2-10', 'Advance Tax Payable', '2.1.2', 'LIABILITY'),
  
  createLedger('L-2.1.3-1', 'Outstanding Expenses', '2.1.3', 'LIABILITY'),
  createLedger('L-2.1.3-2', 'Salary Payable', '2.1.3', 'LIABILITY'),
  createLedger('L-2.1.3-3', 'Interest Payable', '2.1.3', 'LIABILITY'),
  createLedger('L-2.1.3-5', 'Unearned Revenue', '2.1.3', 'LIABILITY'),
  
  createLedger('L-2.2.1-1', 'Term Loan – Bank', '2.2.1', 'LIABILITY'),
  createLedger('L-2.2.1-2', 'Vehicle Loan', '2.2.1', 'LIABILITY'),
  createLedger('L-2.2.1-3', 'Machinery Loan', '2.2.1', 'LIABILITY'),
  createLedger('L-2.2.1-4', 'Unsecured Loan – Directors', '2.2.1', 'LIABILITY'),
  createLedger('L-2.2.1-5', 'Unsecured Loan – Others', '2.2.1', 'LIABILITY'),

  createLedger('L-2.2.2-1', 'Provision for Gratuity', '2.2.2', 'LIABILITY'),
  createLedger('L-2.2.2-2', 'Provision for Leave Encashment', '2.2.2', 'LIABILITY'),

  // EQUITY
  createLedger('L-3.1-1', 'Equity Share Capital', '3.1', 'EQUITY'),
  createLedger('L-3.1-2', 'Preference Share Capital', '3.1', 'EQUITY'),

  createLedger('L-3.2-1', 'Securities Premium', '3.2', 'EQUITY'),
  createLedger('L-3.2-2', 'General Reserve', '3.2', 'EQUITY'),
  createLedger('L-3.2-3', 'Retained Earnings / P&L Balance', '3.2', 'EQUITY'),
  createLedger('L-3.2-4', 'Current Year Profit / Loss', '3.2', 'EQUITY'),
  
  createLedger('L-3.3-1', 'Director Drawings', '3.3', 'EQUITY'),

  // INCOME
  createLedger('L-4.1-1', 'Sales – Domestic', '4.1', 'INCOME'),
  createLedger('L-4.1-2', 'Sales – Export', '4.1', 'INCOME'),
  createLedger('L-4.1-3', 'Service Income', '4.1', 'INCOME'),
  createLedger('L-4.1-4', 'Installation Charges', '4.1', 'INCOME'),
  createLedger('L-4.1-5', 'AMC / Maintenance Income', '4.1', 'INCOME'),

  createLedger('L-4.2-1', 'Interest Income', '4.2', 'INCOME'),
  createLedger('L-4.2-2', 'Discount Received', '4.2', 'INCOME'),
  createLedger('L-4.2-3', 'Commission Received', '4.2', 'INCOME'),
  createLedger('L-4.2-4', 'Rent Received', '4.2', 'INCOME'),
  createLedger('L-4.2-5', 'Miscellaneous Income', '4.2', 'INCOME'),
  
  // COGS
  createLedger('L-5-1', 'Opening Stock', '5', 'EXPENSE'),
  createLedger('L-5-2', 'Purchase – Raw Material', '5', 'EXPENSE'),
  createLedger('L-5-3', 'Purchase – Finished Goods', '5', 'EXPENSE'),
  createLedger('L-5-4', 'Direct Labour', '5', 'EXPENSE'),
  createLedger('L-5-5', 'Factory Wages', '5', 'EXPENSE'),
  createLedger('L-5-6', 'Power & Fuel', '5', 'EXPENSE'),
  createLedger('L-5-7', 'Freight Inward', '5', 'EXPENSE'),
  createLedger('L-5-8', 'Import Duty', '5', 'EXPENSE'),
  createLedger('L-5-9', 'Closing Stock (Credit)', '5', 'EXPENSE'),

  // EXPENSES
  createLedger('L-6.1-1', 'Office Rent', '6.1', 'EXPENSE'),
  createLedger('L-6.1-2', 'Office Electricity', '6.1', 'EXPENSE'),
  createLedger('L-6.1-3', 'Internet & Telephone', '6.1', 'EXPENSE'),
  createLedger('L-6.1-4', 'Printing & Stationery', '6.1', 'EXPENSE'),
  createLedger('L-6.1-5', 'Legal & Professional Fees', '6.1', 'EXPENSE'),
  createLedger('L-6.1-6', 'Audit Fees', '6.1', 'EXPENSE'),
  createLedger('L-6.1-7', 'Accounting Charges', '6.1', 'EXPENSE'),
  createLedger('L-6.1-8', 'ROC / MCA Fees', '6.1', 'EXPENSE'),
  createLedger('L-6.1-9', 'Software Subscription', '6.1', 'EXPENSE'),
  createLedger('L-6.1-10', 'Courier & Postage', '6.1', 'EXPENSE'),
  
  createLedger('L-6.2-1', 'Sales Commission', '6.2', 'EXPENSE'),
  createLedger('L-6.2-2', 'Dealer Commission', '6.2', 'EXPENSE'),
  createLedger('L-6.2-3', 'Advertisement & Marketing', '6.2', 'EXPENSE'),
  createLedger('L-6.2-4', 'Freight Outward', '6.2', 'EXPENSE'),
  createLedger('L-6.2-5', 'Packing Expenses', '6.2', 'EXPENSE'),
  createLedger('L-6.2-6', 'Sales Promotion', '6.2', 'EXPENSE'),
  createLedger('L-6.2-7', 'Exhibition Expenses', '6.2', 'EXPENSE'),

  createLedger('L-6.3-1', 'Salaries & Wages', '6.3', 'EXPENSE'),
  createLedger('L-6.3-2', 'Bonus', '6.3', 'EXPENSE'),
  createLedger('L-6.3-3', 'Employer PF Contribution', '6.3', 'EXPENSE'),
  createLedger('L-6.3-4', 'Employer ESI Contribution', '6.3', 'EXPENSE'),
  createLedger('L-6.3-5', 'Staff Welfare', '6.3', 'EXPENSE'),
  createLedger('L-6.3-6', 'Training Expenses', '6.3', 'EXPENSE'),

  createLedger('L-6.4-1', 'Bank Interest', '6.4', 'EXPENSE'),
  createLedger('L-6.4-2', 'Loan Interest', '6.4', 'EXPENSE'),
  createLedger('L-6.4-3', 'Bank Charges', '6.4', 'EXPENSE'),
  createLedger('L-6.4-4', 'Processing Fees', '6.4', 'EXPENSE'),

  createLedger('L-6.5-1', 'Depreciation – Building', '6.5', 'EXPENSE'),
  createLedger('L-6.5-2', 'Depreciation – Machinery', '6.5', 'EXPENSE'),
  createLedger('L-6.5-3', 'Depreciation – Vehicles', '6.5', 'EXPENSE'),
  createLedger('L-6.5-4', 'Depreciation – Computers', '6.5', 'EXPENSE'),

  // System Ledgers
  createLedger('SYS-1', 'Opening Balance Adjustment', '8', 'ASSET'),
  createLedger('SYS-2', 'Round-Off', '8', 'EXPENSE'),
  createLedger('SYS-3', 'Stock Adjustment', '8', 'EXPENSE'),
  createLedger('SYS-4', 'Exchange Rate Gain / Loss', '8', 'EXPENSE'),
  createLedger('SYS-5', 'Suspense Account', '8', 'ASSET'),
];
