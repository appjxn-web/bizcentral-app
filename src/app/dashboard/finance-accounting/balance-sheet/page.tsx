
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Landmark, Loader2, PlusCircle, ChevronDown, ChevronRight, Download } from 'lucide-react';
import type { CoaGroup, CoaLedger, JournalVoucher, Product, WorkOrder, Order, SalesInvoice } from '@/lib/types';
import { AddLedgerAccountDialog } from './_components/add-ledger-account-dialog';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, orderBy, doc, Timestamp } from 'firebase/firestore';
import { useRole } from '../../_components/role-provider';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

const formatCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2,
  }).format(num || 0);
};

function BalanceSheetContent() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();
  const { currentRole } = useRole();

  const [isAddAccountDialogOpen, setIsAddAccountDialogOpen] = React.useState(false);
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
  
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [selectedFy, setSelectedFy] = React.useState('');

  const { data: coaGroups, loading: groupsLoading } = useCollection<CoaGroup>(query(collection(firestore, 'coa_groups'), orderBy('path')));
  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: products, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
  const { data: workOrders, loading: workOrdersLoading } = useCollection<WorkOrder>(collection(firestore, 'workOrders'));
  const { data: allOrders, loading: ordersLoading } = useCollection<Order>(collection(firestore, 'orders'));
  const { data: salesInvoices, loading: invoicesLoading } = useCollection<SalesInvoice>(collection(firestore, 'salesInvoices'));
  
  const jvQuery = React.useMemo(() => {
    if (!user || !currentRole) return null;
    const allowedRoles = ['Admin', 'CEO', 'Accounts Manager', 'Sales Manager', 'Manager'];
    if (!allowedRoles.includes(currentRole)) return null;
    return query(collection(firestore, 'journalVouchers'));
  }, [user, currentRole, firestore]);
  
  const { data: journalVouchers, loading: vouchersLoading } = useCollection<JournalVoucher>(jvQuery);
  
  const financialYears = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = -2; i <= 1; i++) {
        const year = currentYear + i;
        years.push(`FY ${year}-${(year + 1).toString().slice(-2)}`);
    }
    return years;
  }, []);

  const handleFyChange = (fy: string) => {
    setSelectedFy(fy);
    if (fy === 'custom') {
        setStartDate('');
        setEndDate('');
        return;
    }
    const yearMatch = fy.match(/(\d{4})/);
    if (yearMatch) {
      const startYear = parseInt(yearMatch[1], 10);
      setStartDate(`${startYear}-04-01`);
      setEndDate(`${startYear + 1}-03-31`);
    }
  };

  const { assets, liabilities, equity, pnl, loading, kpis } = React.useMemo(() => {
    if (groupsLoading || ledgersLoading || vouchersLoading || productsLoading || workOrdersLoading || ordersLoading || invoicesLoading || !coaGroups || !coaLedgers || !journalVouchers || !allProducts) {
        return { assets: [], liabilities: [], equity: [], pnl: 0, loading: true, kpis: { assets: 0, liabilities: 0, equity: 0, totalLiabilitiesAndEquity: 0 }};
    }

    const liveBalances = new Map<string, number>();
    const sDate = startDate ? new Date(startDate) : null;
    if (sDate) sDate.setHours(0, 0, 0, 0);
    const eDate = endDate ? new Date(endDate) : null;
    if (eDate) eDate.setHours(23, 59, 59, 999);


    coaLedgers.forEach(acc => {
      const openingBal = acc.openingBalance?.amount || 0;
      const signedOpeningBal = acc.openingBalance?.drCr === 'CR' ? -openingBal : openingBal;
      liveBalances.set(acc.id, signedOpeningBal);
    });

    if (salesInvoices) {
      salesInvoices.forEach(inv => {
          const invDate = new Date(inv.date);
          if (eDate && invDate > eDate) return;

          const customerLedgerId = inv.coaLedgerId;
          const cgstLedger = coaLedgers.find(l => l.name === 'Output GST – CGST');
          const sgstLedger = coaLedgers.find(l => l.name === 'Output GST – SGST');
          const igstLedger = coaLedgers.find(l => l.name === 'Output GST – IGST');
          const salesLedger = coaLedgers.find(l => l.name === 'Sales – Domestic');

          if (customerLedgerId && liveBalances.has(customerLedgerId)) {
              liveBalances.set(customerLedgerId, liveBalances.get(customerLedgerId)! + inv.grandTotal);
          }
          if(cgstLedger) liveBalances.set(cgstLedger.id, liveBalances.get(cgstLedger.id)! - (inv.cgst || 0));
          if(sgstLedger) liveBalances.set(sgstLedger.id, liveBalances.get(sgstLedger.id)! - (inv.sgst || 0));
          if(igstLedger) liveBalances.set(igstLedger.id, liveBalances.get(igstLedger.id)! - (inv.igst || 0));
          if(salesLedger) liveBalances.set(salesLedger.id, liveBalances.get(salesLedger.id)! - inv.taxableAmount);
      });
    }
    
    // WIP Calculation
    const activeWorkOrders = workOrders?.filter(wo => wo.status === 'In Progress' || wo.status === 'Under QC') || [];
    let totalWipValue = 0;
    const issuedRawMaterialValue = new Map<string, number>();

    for (const wo of activeWorkOrders) {
        for (const issuedItem of wo.issuedItems || []) {
            const product = products?.find(p => p.id === issuedItem.productId);
            if (product) {
                const itemValue = issuedItem.issuedQty * (product.cost || 0);
                totalWipValue += itemValue;
                
                const currentIssuedValue = issuedRawMaterialValue.get(product.coaAccountId!) || 0;
                issuedRawMaterialValue.set(product.coaAccountId!, currentIssuedValue + itemValue);
            }
        }
    }
    
    // Inventory calculation logic
    if (products && coaLedgers) {
        const inventoryValues = {
            'Stock-in-Hand – Finished Goods': products.filter(p => p.type === 'Finished Goods').reduce((sum, p) => sum + ((p.openingStock || 0) * (p.cost || 0)), 0),
            'Stock-in-Hand – Spares': products.filter(p => p.type === 'Components' || p.type === 'Consumables').reduce((sum, p) => sum + ((p.openingStock || 0) * (p.cost || 0)), 0),
        };

        for (const [ledgerName, value] of Object.entries(inventoryValues)) {
            const ledger = coaLedgers.find(l => l.name === ledgerName);
            if (ledger) liveBalances.set(ledger.id, value);
        }

        let rawMaterialValue = products.filter(p => p.type === 'Raw Materials').reduce((sum, p) => sum + ((p.openingStock || 0) * (p.cost || 0)), 0);
        for(const issuedValue of issuedRawMaterialValue.values()) {
            rawMaterialValue -= issuedValue;
        }
        const rmLedger = coaLedgers.find(l => l.name === 'Stock-in-Hand – Raw Material');
        if (rmLedger) liveBalances.set(rmLedger.id, rawMaterialValue);

        const wipLedger = coaLedgers.find(l => l.name === 'Stock-in-Hand – Work-in-Progress');
        if (wipLedger) liveBalances.set(wipLedger.id, totalWipValue);
    }
    
    const relevantVouchers = (journalVouchers || []).filter(jv => {
        const jvDate = jv.date instanceof Timestamp ? jv.date.toDate() : new Date(jv.date);
        return eDate ? jvDate <= eDate : true;
    });


    // Process Vouchers for payments etc.
    relevantVouchers.forEach(jv => {
        jv.entries.forEach(entry => {
            if (liveBalances.has(entry.accountId)) {
                const current = liveBalances.get(entry.accountId)!;
                liveBalances.set(entry.accountId, current + (entry.debit || 0) - (entry.credit || 0));
            }
        });
    });
    
    // --- P&L Calculation for Equity ---
    const periodVouchers = journalVouchers.filter(jv => {
      const jvDate = jv.date instanceof Timestamp ? jv.date.toDate() : new Date(jv.date);
      return (!sDate || jvDate >= sDate) && (!eDate || jvDate <= eDate);
    });
    
    const periodInvoices = (salesInvoices || []).filter(inv => {
        const invDate = new Date(inv.date);
        return (!sDate || invDate >= sDate) && (!eDate || invDate <= eDate);
    });

    const incomeFromJv = periodVouchers
      .flatMap(jv => jv.entries)
      .filter(e => coaLedgers.find(l => l.id === e.accountId)?.nature === 'INCOME')
      .reduce((sum, e) => sum + (e.credit || 0) - (e.debit || 0), 0);
      
    const incomeFromInvoices = periodInvoices.reduce((sum, inv) => sum + inv.taxableAmount, 0);
    const totalIncome = incomeFromJv + incomeFromInvoices;
      
    const expenseFromJv = periodVouchers
        .flatMap(jv => jv.entries)
        .filter(e => coaLedgers.find(l => l.id === e.accountId)?.nature === 'EXPENSE')
        .reduce((sum, e) => sum + (e.debit || 0) - (e.credit || 0), 0);

    const deliveredOrders = (allOrders || []).filter(order => {
        const orderDate = new Date(order.date);
        return order.status === 'Delivered' && (!sDate || orderDate >= sDate) && (!eDate || orderDate <= eDate);
    });

    const cogs = deliveredOrders.reduce((total, order) => {
        return total + order.items.reduce((itemCost, item) => {
            const product = allProducts?.find(p => p.id === item.productId);
            return itemCost + ((product?.cost || 0) * item.quantity);
        }, 0);
    }, 0);
    
    const totalExpenses = expenseFromJv + cogs;
    const currentPnl = totalIncome - totalExpenses;

    // --- End P&L Calculation ---

    const getGroupData = (group: CoaGroup): any => {
        const subGroups = coaGroups.filter(g => g.parentId === group.id).map(g => getGroupData(g));
        const ledgers = coaLedgers.filter(l => l.groupId === group.id).map(l => ({
            ...l, balance: liveBalances.get(l.id) || 0
        }));

        const totalBalance = ledgers.reduce((sum, l) => sum + l.balance, 0) + 
                           subGroups.reduce((sum, sg) => sum + sg.balance, 0);

        return { ...group, balance: totalBalance, accounts: ledgers, subGroups };
    };

    const buildHierarchy = (natureStr: string) => {
      return coaGroups.filter(g => 
        g.nature?.toUpperCase() === natureStr.toUpperCase() && (!g.parentId || g.parentId === "" || g.level === 0)
      ).map(group => getGroupData(group));
    };

    const assetsData = buildHierarchy("ASSET");
    const liabilitiesData = buildHierarchy("LIABILITY");
    const equityData = buildHierarchy("EQUITY");

    const totalAssets = assetsData.reduce((acc, g) => acc + g.balance, 0);
    const totalLiabilities = Math.abs(liabilitiesData.reduce((acc, g) => acc + g.balance, 0));
    const baseEquity = Math.abs(equityData.reduce((acc, g) => acc + g.balance, 0));
    const totalEquity = baseEquity + currentPnl;

    return { 
        assets: assetsData, liabilities: liabilitiesData, equity: equityData, pnl: currentPnl, loading: false,
        kpis: { assets: totalAssets, liabilities: totalLiabilities, equity: totalEquity, totalLiabilitiesAndEquity: totalLiabilities + totalEquity }
    };
  }, [coaGroups, coaLedgers, journalVouchers, products, workOrders, allOrders, salesInvoices, groupsLoading, ledgersLoading, vouchersLoading, productsLoading, workOrdersLoading, ordersLoading, invoicesLoading, startDate, endDate]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !(prev[groupId] ?? true) }));
  };

  const flattenHierarchyForExport = (groups: any[], level = 0, data: any[] = []) => {
    groups.forEach(group => {
        const absBalance = Math.abs(group.balance);
         if (absBalance < 0.01 && group.accounts.length === 0 && group.subGroups.length === 0) return;

        data.push({ Indent: '    '.repeat(level), Particulars: group.name, Amount: absBalance });
        
        group.accounts.forEach((acc: any) => {
             if (Math.abs(acc.balance) > 0.01) {
                data.push({ Indent: '    '.repeat(level + 1), Particulars: acc.name, Amount: Math.abs(acc.balance) });
            }
        });

        flattenHierarchyForExport(group.subGroups, level + 1, data);
    });
    return data;
  };

  const handleExport = () => {
    const assetsData = flattenHierarchyForExport(assets);
    const liabilitiesData = flattenHierarchyForExport(liabilities);
    const equityData = flattenHierarchyForExport(equity);

    assetsData.push({ Indent: '', Particulars: 'Total Assets', Amount: kpis.assets });
    liabilitiesData.push({ Indent: '', Particulars: 'Total Liabilities', Amount: kpis.liabilities });
    equityData.push({ Indent: '', Particulars: 'Profit / Loss (Current Period)', Amount: pnl });
    equityData.push({ Indent: '', Particulars: 'Total Equity', Amount: kpis.equity });


    const maxLength = Math.max(assetsData.length, liabilitiesData.length + equityData.length + 2);
    
    const combinedData = [];
    for (let i = 0; i < maxLength; i++) {
        const assetRow = assetsData[i] || { Indent: '', Particulars: '', Amount: '' };
        
        let liabilityRow;
        if (i < liabilitiesData.length) {
            liabilityRow = liabilitiesData[i];
        } else if (i === liabilitiesData.length) {
            liabilityRow = { Indent: '', Particulars: '', Amount: '' }; // Spacer
        } else if (i > liabilitiesData.length) {
             const equityIndex = i - liabilitiesData.length - 1;
             if (equityIndex < equityData.length) {
                liabilityRow = equityData[equityIndex];
             } else {
                liabilityRow = { Indent: '', Particulars: '', Amount: '' };
             }
        } else {
             liabilityRow = { Indent: '', Particulars: '', Amount: '' };
        }

        combinedData.push({
            'Assets': `${assetRow.Indent}${assetRow.Particulars}`,
            'Amount (Assets)': assetRow.Amount,
            'Liabilities & Equity': `${liabilityRow.Indent}${liabilityRow.Particulars}`,
            'Amount (Liabilities & Equity)': liabilityRow.Amount,
        });
    }

    const worksheet = XLSX.utils.json_to_sheet(combinedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Balance Sheet');
    XLSX.writeFile(workbook, 'BalanceSheet.xlsx');
  };

  const renderRow = (group: any, level = 0): React.ReactNode => {
    const absBalance = Math.abs(group.balance);
    if (absBalance < 0.01 && group.accounts.length === 0 && group.subGroups.length === 0) return null;
    
    const isOpen = openGroups[group.id] ?? true;
    const hasChildren = group.accounts.some((a: any) => Math.abs(a.balance) > 0.01) || group.subGroups.length > 0;

    return (
      <React.Fragment key={group.id}>
        <TableRow 
          className={cn(
            level === 0 ? "bg-muted/40 font-bold" : "font-semibold", 
            hasChildren && "cursor-pointer hover:bg-muted/60 transition-colors"
          )}
          onClick={hasChildren ? () => toggleGroup(group.id) : undefined}
        >
          <TableCell style={{ paddingLeft: `${level * 20 + 12}px` }}>
            <div className="flex items-center">
              {hasChildren ? (
                isOpen ? <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
              ) : (
                <div className="w-6 mr-2" />
              )}
              {group.name}
            </div>
          </TableCell>
          <TableCell className="text-right font-mono">
            {formatCurrency(absBalance)}
          </TableCell>
        </TableRow>
        
        {isOpen && (
          <>
            {group.accounts.map((acc: any) => Math.abs(acc.balance) > 0.01 && (
              <TableRow 
                key={acc.id} 
                className="text-sm italic hover:bg-muted/50 cursor-pointer" 
                onClick={() => router.push(`/dashboard/finance-accounting/party-statement?partyId=${acc.id}`)}
              >
                <TableCell style={{ paddingLeft: `${(level + 1) * 20 + 12}px` }}>
                  <div className="pl-6 border-l-2 border-muted-foreground/20 ml-2">
                    {acc.name}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {formatCurrency(Math.abs(acc.balance))}
                </TableCell>
              </TableRow>
            ))}
            {group.subGroups.map((sg: any) => renderRow(sg, level + 1))}
          </>
        )}
      </React.Fragment>
    );
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <>
      <PageHeader title="Balance Sheet">
         <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> Export to Excel
            </Button>
            <Button onClick={() => setIsAddAccountDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Add Ledger Account</Button>
         </div>
      </PageHeader>
      
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="border-l-4 border-l-emerald-500 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Assets</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{formatCurrency(kpis.assets)}</div></CardContent></Card>
        <Card className="border-l-4 border-l-rose-500 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Liabilities</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-600">{formatCurrency(kpis.liabilities)}</div></CardContent></Card>
        <Card className="border-l-4 border-l-blue-500 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Equity</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{formatCurrency(kpis.equity)}</div></CardContent></Card>
      </div>
      
      <Card className="shadow-lg border-none">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>Consolidated Statement</CardTitle>
          <div className="flex flex-wrap items-end gap-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="financial-year">Financial Year</Label>
                <Select value={selectedFy} onValueChange={handleFyChange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select Financial Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {financialYears.map(fy => <SelectItem key={fy} value={fy}>{fy}</SelectItem>)}
                    <SelectItem value="custom">Custom Dates</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                  <Label htmlFor="date-from">As of Date</Label>
                  <Input id="date-from" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <Button variant="outline" onClick={() => { setStartDate(''); setEndDate(''); setSelectedFy(''); }}>Clear Filters</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid md:grid-cols-2 gap-0 divide-x divide-muted-foreground/10">
            <Table>
              <TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Assets</TableHead><TableHead className="text-right pr-6">Balance</TableHead></TableRow></TableHeader>
              <TableBody>{assets.map(g => renderRow(g))}</TableBody>
              <TableFooter><TableRow className="text-lg font-bold bg-muted/80"><TableCell className="pl-6">Total Assets</TableCell><TableCell className="text-right pr-6">{formatCurrency(kpis.assets)}</TableCell></TableRow></TableFooter>
            </Table>
            <Table>
              <TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Liabilities &amp; Equity</TableHead><TableHead className="text-right pr-6">Balance</TableHead></TableRow></TableHeader>
              <TableBody>
                {liabilities.map(g => renderRow(g))}
                {equity.map(g => renderRow(g))}
                 <TableRow className="font-bold bg-blue-50/40">
                    <TableCell className="pl-12">Profit / Loss (Current Period)</TableCell>
                    <TableCell className="text-right pr-6 font-mono">{formatCurrency(pnl)}</TableCell>
                 </TableRow>
              </TableBody>
              <TableFooter><TableRow className="text-lg font-bold bg-muted/80"><TableCell className="pl-6">Total Liab. &amp; Equity</TableCell><TableCell className="text-right pr-6">{formatCurrency(kpis.totalLiabilitiesAndEquity)}</TableCell></TableRow></TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
       
      <AddLedgerAccountDialog 
        open={isAddAccountDialogOpen} onOpenChange={setIsAddAccountDialogOpen}
        coaGroups={coaGroups} coaLedgers={coaLedgers} loading={groupsLoading || ledgersLoading}
      />
    </>
  );
}

export default function BalanceSheetPage() {
    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => { setIsClient(true); }, []);
    return isClient ? <BalanceSheetContent /> : null;
}
