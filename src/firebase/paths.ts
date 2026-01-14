
export function pathCoaGroups(companyId: string) {
    return `companies/${companyId}/coa_groups`;
}

export function pathCoaLedgers(companyId: string) {
    return `companies/${companyId}/coa_ledgers`;
}

export function pathJournalVouchers(companyId: string) {
    return `companies/${companyId}/journalVouchers`;
}

// Add other path builders as needed...
// e.g., pathProducts, pathOrders, etc.
