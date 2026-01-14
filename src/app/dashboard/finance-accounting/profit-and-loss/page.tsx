
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
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
import type { CoaGroup, CoaLedger, JournalVoucher, Order, Product, SalesInvoice } from '@/lib/types';
import { TrendingUp, TrendingDown, CircleDollarSign, Loader2, Download } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { useRole } from '../../_components/role-provider';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

const formatCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

export default function ProfitAndLossPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { currentRole } = useRole();
    const [startDate, setStartDate] = React.useState('');
    const [endDate, setEndDate] = React.useState('');
    const [selectedFy, setSelectedFy] = React.useState('');
    
    // Fetch all required data
    const { data: coaGroups, loading: groupsLoading } = useCollection<CoaGroup>(query(collection(firestore, 'coa_groups'), orderBy('path')));
    const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
    const { data: allProducts, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
    const { data: allOrders, loading: ordersLoading } = useCollection<Order>(collection(firestore, 'orders'));
    const { data: salesInvoices, loading: invoicesLoading } = useCollection<SalesInvoice>(collection(firestore, 'salesInvoices'));
    
    const jvQuery = React.useMemo(() => {
        if (!user) return null;
        const allowedRoles = ['Admin', 'CEO', 'Accounts Manager', 'Sales Manager', 'Manager', 'Partner'];
        if (!allowedRoles.includes(currentRole || '')) return null;
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
    
    const pnlData = React.useMemo(() => {
      const sDate = startDate ? new Date(startDate) : null;
      if (sDate) sDate.setHours(0, 0, 0, 0);
      const eDate = endDate ? new Date(endDate) : null;
      if (eDate) eDate.setHours(23, 59, 59, 999);

      if (groupsLoading || ledgersLoading || vouchersLoading || productsLoading || ordersLoading || invoicesLoading || !coaGroups || !coaLedgers || !allProducts || !allOrders || !journalVouchers || !salesInvoices) {
        return { incomeGroups: [], expenseGroups: [], cogs: 0, totalIncome: 0, totalExpenses: 0, netProfit: 0, loading: true };
      }

      // Create a temporary balance map for the period
      const periodBalances = new Map<string, number>();

      // 1. Process Journal Vouchers for the period
      (journalVouchers || []).forEach(jv => {
          const jvDate = jv.createdAt instanceof Timestamp ? jv.createdAt.toDate() : new Date(jv.date);
          if ((!sDate || jvDate >= sDate) && (!eDate || jvDate <= eDate)) {
              jv.entries.forEach(entry => {
                  const current = periodBalances.get(entry.accountId) || 0;
                  periodBalances.set(entry.accountId, current + (entry.debit || 0) - (entry.credit || 0));
              });
          }
      });

      // 2. Process Sales Invoices for the period
      const periodInvoices = (salesInvoices || []).filter(inv => {
          const invDate = new Date(inv.date);
          return (!sDate || invDate >= sDate) && (!eDate || invDate <= eDate);
      });
      
      const incomeFromInvoices = periodInvoices.reduce((sum, inv) => {
          const netAmount = inv.taxableAmount || (inv.subtotal - (inv.discount || 0));
          return sum + netAmount;
      }, 0);

      // 3. Aggregate all income and expense balances from the period
      let totalIncome = incomeFromInvoices;
      let totalExpenses = 0;
      const incomeLedgerBalances = new Map<string, number>();
      const expenseLedgerBalances = new Map<string, number>();

      coaLedgers.forEach(l => {
          const periodBalance = periodBalances.get(l.id) || 0;
          if (l.nature === 'INCOME') {
              totalIncome += Math.abs(periodBalance); // Credits increase income
              incomeLedgerBalances.set(l.id, Math.abs(periodBalance));
          }
          if (l.nature === 'EXPENSE') {
              totalExpenses += periodBalance; // Debits increase expense
              expenseLedgerBalances.set(l.id, periodBalance);
          }
      });

      // 4. Calculate COGS for the period
      const cogs = (allOrders || [])
        .filter(o => {
          const deliveryDate = new Date(o.date); // Simplified: use order date as delivery date
          return o.status === 'Delivered' && (!sDate || deliveryDate >= sDate) && (!eDate || deliveryDate <= eDate);
        })
        .reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + ((allProducts.find(p => p.id === i.productId)?.cost || 0) * i.quantity), 0), 0);

      totalExpenses += cogs;
      
      const netProfit = totalIncome - totalExpenses;

      // 5. Build Group Hierarchy
      const getGroupData = (groups: CoaGroup[], parentId: string | null = null, balancesMap: Map<string, number>): any[] => {
          return groups
            .filter(g => g.parentId === parentId)
            .map(group => {
              const ledgers = coaLedgers.filter(l => l.groupId === group.id);
              const ledgerBalances = ledgers.map(l => ({...l, balance: balancesMap.get(l.id) || 0}));
              const subGroups = getGroupData(groups, group.id, balancesMap);
              const groupBalance = ledgerBalances.reduce((sum, l) => sum + l.balance, 0) + subGroups.reduce((sum, sg) => sum + sg.balance, 0);
              
              return { ...group, balance: groupBalance, accounts: ledgerBalances.filter(l => l.balance !== 0), subGroups };
            })
            .filter(g => g.balance !== 0 || g.accounts.length > 0 || g.subGroups.length > 0);
      };
      
      const incomeGroupsFromJv = getGroupData(coaGroups.filter(g => g.nature === 'INCOME'), null, incomeLedgerBalances);
      const incomeGroups = [{
          id: 'sales-revenue', name: 'Operating Income', balance: incomeFromInvoices, 
          accounts: [{ id: 'sales-summary', name: 'Sales Revenue (from Invoices)', balance: incomeFromInvoices }], 
          subGroups: []
      }, ...incomeGroupsFromJv];
      
      const expenseGroups = getGroupData(coaGroups.filter(g => g.nature === 'EXPENSE'), null, expenseLedgerBalances);
      
      return { incomeGroups, expenseGroups, cogs, totalIncome, totalExpenses, netProfit, loading: false };
    }, [coaGroups, coaLedgers, journalVouchers, allProducts, allOrders, salesInvoices, groupsLoading, ledgersLoading, vouchersLoading, productsLoading, ordersLoading, invoicesLoading, startDate, endDate]);

    const flattenForExport = (groups: any[], level = 0, data: any[] = []) => {
        groups.forEach(group => {
            const absBalance = Math.abs(group.balance);
            if (absBalance < 0.01 && group.accounts.length === 0 && group.subGroups.length === 0) return;

            data.push({ Indent: '    '.repeat(level), Particulars: group.name, Amount: absBalance });
            
            group.accounts.forEach((acc: any) => {
                if (Math.abs(acc.balance) > 0.01) {
                    data.push({ Indent: '    '.repeat(level + 1), Particulars: acc.name, Amount: Math.abs(acc.balance) });
                }
            });

            flattenForExport(group.subGroups, level + 1, data);
        });
        return data;
    };
    
    const handleExport = () => {
        const incomeData = flattenForExport(pnlData.incomeGroups);
        incomeData.push({ Indent: '', Particulars: 'Total Income', Amount: pnlData.totalIncome });

        const expenseData = flattenForExport(pnlData.expenseGroups);
        expenseData.unshift({ Indent: '', Particulars: 'COST OF GOODS SOLD (COGS)', Amount: pnlData.cogs });
        expenseData.push({ Indent: '', Particulars: 'Total Expenses', Amount: pnlData.totalExpenses });

        const combinedData = [];
        const maxLength = Math.max(incomeData.length, expenseData.length);
        
        for (let i = 0; i < maxLength; i++) {
            const incomeRow = incomeData[i] || { Indent: '', Particulars: '', Amount: '' };
            const expenseRow = expenseData[i] || { Indent: '', Particulars: '', Amount: '' };
            combinedData.push({
                'Income': `${incomeRow.Indent}${incomeRow.Particulars}`,
                'Amount (Income)': incomeRow.Amount,
                'Expenses': `${expenseRow.Indent}${expenseRow.Particulars}`,
                'Amount (Expenses)': expenseRow.Amount,
            });
        }
        
        combinedData.push({
            'Income': '', 'Amount (Income)': '',
            'Expenses': 'Net Profit / (Loss)', 'Amount (Expenses)': pnlData.netProfit,
        });

        const worksheet = XLSX.utils.json_to_sheet(combinedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Profit and Loss');
        XLSX.writeFile(workbook, 'ProfitAndLoss.xlsx');
    };

    const renderRows = (group: any, level = 0) => {
        const absBalance = Math.abs(group.balance);
        if (absBalance < 0.01 && group.accounts.length === 0 && group.subGroups.length === 0) return null;

        return (
            <React.Fragment key={group.id}>
                <TableRow className={level === 0 ? "bg-muted/40 font-bold" : "font-semibold"}>
                    <TableCell style={{ paddingLeft: `${level * 20 + 12}px` }}>{group.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(absBalance)}</TableCell>
                </TableRow>
                {group.accounts?.map((acc: any) => Math.abs(acc.balance) > 0.01 && (
                    <TableRow key={acc.id} className="text-sm italic hover:bg-muted/50">
                        <TableCell style={{ paddingLeft: `${(level + 1) * 20 + 12}px` }}>{acc.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Math.abs(acc.balance))}</TableCell>
                    </TableRow>
                ))}
                {group.subGroups?.map((sg: any) => renderRows(sg, level + 1))}
            </React.Fragment>
        );
    };

  return (
    <>
      <PageHeader title="Profit &amp; Loss Statement">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export to Excel
          </Button>
      </PageHeader>
      
        <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Total Income</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{formatCurrency(pnlData.totalIncome)}</div></CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Total Expenses</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{formatCurrency(pnlData.totalExpenses)}</div></CardContent>
            </Card>
            <Card className={`border-l-4 ${pnlData.netProfit >= 0 ? 'border-l-blue-500' : 'border-l-orange-500'}`}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Net Profit / Loss</CardTitle></CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${pnlData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(pnlData.netProfit)}
                    </div>
                </CardContent>
            </Card>
        </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Detailed Statement</CardTitle>
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
                  <Label htmlFor="date-from">From</Label>
                  <Input id="date-from" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="date-to">To</Label>
                  <Input id="date-to" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <Button variant="outline" onClick={() => { setStartDate(''); setEndDate(''); setSelectedFy(''); }}>Clear Filters</Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
             {pnlData.loading ? (
                <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin" /></div>
            ) : (
            <>
                <div className="grid md:grid-cols-2 gap-12">
                    <Table>
                        <TableHeader><TableRow><TableHead>Income</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                        <TableBody>{pnlData.incomeGroups.map(g => renderRows(g))}</TableBody>
                        <TableFooter><TableRow className="bg-muted font-bold"><TableCell>Total Income</TableCell><TableCell className="text-right">{formatCurrency(pnlData.totalIncome)}</TableCell></TableRow></TableFooter>
                    </Table>
                    <Table>
                        <TableHeader><TableRow><TableHead>Expenses</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                        <TableBody>
                            <TableRow className="font-bold bg-muted/40">
                                <TableCell style={{ paddingLeft: `12px` }}>COST OF GOODS SOLD (COGS)</TableCell>
                                <TableCell className="text-right">{formatCurrency(pnlData.cogs)}</TableCell>
                            </TableRow>
                            {pnlData.expenseGroups.map(g => renderRows(g))}
                        </TableBody>
                        <TableFooter><TableRow className="bg-muted font-bold"><TableCell>Total Expenses</TableCell><TableCell className="text-right">{formatCurrency(pnlData.totalExpenses)}</TableCell></TableRow></TableFooter>
                    </Table>
                </div>
                <Separator className="my-8"/>
                <div className="flex justify-end">
                    <div className={`flex justify-between items-center p-6 rounded-lg w-full md:w-1/2 border-2 ${pnlData.netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <span className="text-lg font-bold">Net Profit / (Loss)</span>
                        <span className="text-2xl font-black">{formatCurrency(pnlData.netProfit)}</span>
                    </div>
                </div>
            </>
            )}
        </CardContent>
      </Card>
    </>
  );
}

