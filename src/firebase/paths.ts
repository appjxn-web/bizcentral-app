// src/firebase/paths.ts
export const companyPath = (companyId: string) => `companies/${companyId}`;

export const financePaths = {
  coaGroups: (companyId: string) => `${companyPath(companyId)}/coa_groups`,
  coaLedgers: (companyId: string) => `${companyPath(companyId)}/coa_ledgers`,
  vouchers: (companyId: string) => `${companyPath(companyId)}/vouchers`,
  journalEntries: (companyId: string) => `${companyPath(companyId)}/journal_entries`,
};

export const inventoryPaths = {
  products: (companyId: string) => `companies/${companyId}/products`,
  warehouses: (companyId: string) => `companies/${companyId}/warehouses`,
  stockMovements: (companyId: string) => `companies/${companyId}/stock_movements`,
};
