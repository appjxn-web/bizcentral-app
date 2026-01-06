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
import type { CoaGroup, CoaLedger, JournalVoucher, Order, Product } from '@/lib/types';
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
      if (groupsLoading || ledgersLoading || vouchersLoading || !coaGroups || !coaLedgers || !journalVouchers || productsLoading || ordersLoading) {
        return { incomeGroups: [], expenseGroups: [], cogs: 0, totalIncome: 0, totalExpenses: 0, netProfit: 0 };
      }

      const ledgerBalances = new Map<string, number>();
      coaLedgers.forEach(l => ledgerBalances.set(l.id, 0));

      const sDate = startDate ? new Date(startDate) : null;
      if (sDate) sDate.setHours(0, 0, 0, 0);
      const eDate = endDate ? new Date(endDate) : null;
      if (eDate) eDate.setHours(23, 59, 59, 999);

      const periodVouchers = journalVouchers.filter(jv => {
          const jvDate = jv.date instanceof Timestamp ? jv.date.toDate() : new Date(jv.date);
          return (!sDate || jvDate >= sDate) && (!eDate || jvDate <= eDate);
      });
      
      const periodOrders = (allOrders || []).filter(order => {
          const orderDate = new Date(order.date);
          return (!sDate || orderDate >= sDate) && (!eDate || orderDate <= eDate);
      });

      periodVouchers.forEach(jv => {
        jv.entries.forEach(entry => {
          if (ledgerBalances.has(entry.accountId)) {
            const current = ledgerBalances.get(entry.accountId)!;
            ledgerBalances.set(entry.accountId, current + (entry.credit || 0) - (entry.debit || 0));
          }
        });
      });

      const getGroupData = (group: CoaGroup): any => {
          const subGroups = coaGroups.filter(g => g.parentId === group.id).map(g => getGroupData(g));
          const accounts = coaLedgers.filter(l => l.groupId === group.id).map(l => ({
              ...l,
              balance: ledgerBalances.get(l.id) || 0
          }));
          
          const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0) + 
                               subGroups.reduce((sum, sg) => sum + sg.balance, 0);

          return { ...group, balance: totalBalance, accounts, subGroups };
      };
        
      const buildHierarchy = (natureStr: string) => {
        const rootGroups = coaGroups.filter(g => 
            g.nature?.toUpperCase() === natureStr.toUpperCase() && 
            (!g.parentId || g.parentId === "" || g.level === 0) &&
            g.name.toUpperCase() !== 'COST OF GOODS SOLD (COGS)' // Exclude COGS from regular expenses
        );
        return rootGroups.map(group => getGroupData(group));
      };
      
      const deliveredOrders = periodOrders.filter(order => order.status === 'Delivered');

      const cogs = deliveredOrders.reduce((totalCost, order) => {
        return totalCost + order.items.reduce((itemCost, item) => {
            const product = allProducts?.find(p => p.id === item.productId);
            return itemCost + ((product?.cost || 0) * item.quantity);
        }, 0);
      }, 0);

      const incomeGroups = buildHierarchy("INCOME");
      const expenseGroups = buildHierarchy("EXPENSE");
      
      const totalIncome = incomeGroups.reduce((acc, g) => acc + g.balance, 0);
      const totalExpenses = Math.abs(expenseGroups.reduce((acc, g) => acc + g.balance, 0));
      
      const netProfit = totalIncome - totalExpenses - cogs;

      return { incomeGroups, expenseGroups, cogs, totalIncome, totalExpenses, netProfit };
    }, [coaGroups, coaLedgers, journalVouchers, allProducts, allOrders, groupsLoading, ledgersLoading, vouchersLoading, productsLoading, ordersLoading, startDate, endDate]);

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
        expenseData.push({ Indent: '', Particulars: 'Total Expenses', Amount: pnlData.totalExpenses + pnlData.cogs });

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
                <CardContent><div className="text-2xl font-bold">{formatCurrency(pnlData.totalExpenses + pnlData.cogs)}</div></CardContent>
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
             {(groupsLoading || ledgersLoading || vouchersLoading || productsLoading || ordersLoading) ? (
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
                        <TableFooter><TableRow className="bg-muted font-bold"><TableCell>Total Expenses</TableCell><TableCell className="text-right">{formatCurrency(pnlData.totalExpenses + pnlData.cogs)}</TableCell></TableRow></TableFooter>
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
