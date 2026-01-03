
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import {
  Banknote,
  Landmark,
  ArrowDownCircle,
  ArrowUpCircle,
  Scale,
  TrendingUp,
  AlertTriangle,
  FileText,
  BadgeCheck,
  Users,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ArrowLeftRight,
  CircleDollarSign,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JournalVoucher, CoaLedger, CoaGroup } from '@/lib/types';
import { startOfMonth, endOfMonth } from 'date-fns';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}


export default function AccountsManagerDashboardPage() {
  const firestore = useFirestore();
  const { data: coaGroups } = useCollection<CoaGroup>(collection(firestore, 'coa_groups'));
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: journalVouchers } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));

  const { liveBalances, cashAndBankBalances } = React.useMemo(() => {
    const balances = new Map<string, number>();
    const cashAndBank = new Map<string, number>();
    if (!coaLedgers || !journalVouchers) return { liveBalances: balances, cashAndBankBalances: cashAndBank };

    coaLedgers.forEach(acc => {
      const openingBal = acc.openingBalance?.amount || 0;
      const balance = acc.openingBalance?.drCr === 'CR' ? -openingBal : openingBal;
      balances.set(acc.id, balance);
    });
    
    const sortedVouchers = [...journalVouchers].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sortedVouchers.forEach(jv => {
      jv.entries.forEach(entry => {
        if (balances.has(entry.accountId)) {
          const currentBal = balances.get(entry.accountId)!;
          const newBal = currentBal + (entry.debit || 0) - (entry.credit || 0);
          balances.set(entry.accountId, newBal);
        }
      });
    });
    
    const cashAndBankGroup = coaGroups?.find(g => g.name === 'Cash & Bank');
    if (cashAndBankGroup) {
      coaLedgers.filter(l => l.groupId === cashAndBankGroup.id).forEach(l => {
        cashAndBank.set(l.name, balances.get(l.id) || 0);
      });
    }

    return { liveBalances: balances, cashAndBankBalances: cashAndBank };
  }, [coaLedgers, journalVouchers, coaGroups]);

  const kpis = React.useMemo(() => {
    if (!coaGroups || !coaLedgers || !liveBalances) return { cashBalance: 0, bankBalance: 0, totalReceivables: 0, totalPayables: 0, netWorkingCapital: 0, currentMonthProfit: 0 };
    
    const getGroupBalance = (groupName: string, nature: 'debit' | 'credit'): number => {
        const group = coaGroups.find(g => g.name === groupName);
        if (!group) return 0;
        let total = 0;
        const ledgers = coaLedgers.filter(l => l.groupId === group.id);
        ledgers.forEach(l => {
            const balance = liveBalances.get(l.id) || 0;
            total += balance;
        });
        return nature === 'credit' ? Math.abs(total) : total;
    };
    
    const cashBalance = cashAndBankBalances.get('Cash in Hand') || 0;
    const bankBalance = Array.from(cashAndBankBalances.entries()).filter(([name]) => name !== 'Cash in Hand').reduce((acc, [, bal]) => acc + bal, 0);

    const totalReceivables = getGroupBalance('Trade Receivables', 'debit');
    const totalPayables = getGroupBalance('Trade Payables', 'credit');
    const netWorkingCapital = totalReceivables - totalPayables;
    
    // Simplified P&L for dashboard KPI
    const incomeTotal = getGroupBalance('Operating Income', 'credit') + getGroupBalance('Other Income', 'credit');
    const expenseTotal = getGroupBalance('EXPENSES (INDIRECT)', 'debit');
    const currentMonthProfit = incomeTotal - expenseTotal; // Note: COGS is omitted for this simple view
    
    return { cashBalance, bankBalance, totalReceivables, totalPayables, netWorkingCapital, currentMonthProfit };
  }, [coaGroups, coaLedgers, liveBalances, cashAndBankBalances]);
  
  const { cashFlow, reconciliation, gstSummary, complianceStatus } = React.useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    let inflow = 0;
    let outflow = 0;

    (journalVouchers || []).forEach(jv => {
      if (jv.date === todayStr) {
        jv.entries.forEach(entry => {
          if (cashAndBankBalances.has(coaLedgers?.find(l => l.id === entry.accountId)?.name || '')) {
            inflow += entry.debit || 0;
            outflow += entry.credit || 0;
          }
        });
      }
    });

    const outputGst = Math.abs(liveBalances.get(coaLedgers?.find(l => l.name === 'Output GST – CGST')?.id || '') || 0) + Math.abs(liveBalances.get(coaLedgers?.find(l => l.name === 'Output GST – SGST')?.id || '') || 0);
    const inputGst = (liveBalances.get(coaLedgers?.find(l => l.name === 'Input GST – CGST')?.id || '') || 0) + (liveBalances.get(coaLedgers?.find(l => l.name === 'Input GST – SGST')?.id || '') || 0);

    return {
      cashFlow: { inflow, outflow },
      reconciliation: { unreconciled: 0 }, // Mock data
      gstSummary: { outputGst, inputGst, netPayable: outputGst - inputGst },
      complianceStatus: { gstr1: 'Filed', gstr3b: 'Pending' } // Mock data
    };
  }, [journalVouchers, cashAndBankBalances, liveBalances, coaLedgers]);


  return (
    <>
      <PageHeader title="Accounts Manager Dashboard" />
      
       <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild>
            <Link href="/dashboard/finance-accounting/day-book">
              <BookOpen className="mr-2 h-4 w-4" /> Day Book
            </Link>
          </Button>
           <Button asChild variant="outline">
            <Link href="/dashboard/finance-accounting/transactions">
              <ArrowLeftRight className="mr-2 h-4 w-4" /> Transactions
            </Link>
          </Button>
           <Button asChild variant="outline">
            <Link href="/dashboard/finance-accounting/reimbursement-process">
              <CircleDollarSign className="mr-2 h-4 w-4" /> Reimbursement Process
            </Link>
          </Button>
        </CardContent>
      </Card>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash Balance</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.cashBalance)}</div>
            <p className="text-xs text-muted-foreground">Cash-in-hand across all locations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bank Balance</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.bankBalance)}</div>
            <p className="text-xs text-muted-foreground">Total across all bank accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Receivables</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.totalReceivables)}</div>
            <p className="text-xs text-muted-foreground">Money to be collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payables</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.totalPayables)}</div>
            <p className="text-xs text-muted-foreground">Money to be paid out</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Working Capital</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.netWorkingCapital)}</div>
            <p className="text-xs text-muted-foreground">Liquidity health snapshot</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Month Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.currentMonthProfit)}</div>
            <p className="text-xs text-muted-foreground">P&L snapshot for this month</p>
          </CardContent>
        </Card>
      </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Cash Flow Summary (Today)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex justify-between items-center p-4 rounded-md bg-green-50 dark:bg-green-900/30">
                <div className="flex items-center gap-2">
                    <ArrowDown className="h-5 w-5 text-green-600"/>
                    <span className="font-semibold">Cash Inflow</span>
                </div>
                <span className="font-mono text-lg font-bold">{formatCurrency(cashFlow.inflow)}</span>
             </div>
             <div className="flex justify-between items-center p-4 rounded-md bg-red-50 dark:bg-red-900/30">
                 <div className="flex items-center gap-2">
                    <ArrowUp className="h-5 w-5 text-red-600"/>
                    <span className="font-semibold">Cash Outflow</span>
                </div>
                <span className="font-mono text-lg font-bold">{formatCurrency(cashFlow.outflow)}</span>
             </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Bank Reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center p-4 rounded-md bg-yellow-50 dark:bg-yellow-900/30">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600"/>
                    <span className="font-semibold">Unreconciled Transactions</span>
                </div>
                <span className="font-mono text-lg font-bold">{reconciliation.unreconciled}</span>
             </div>
             <p className="text-xs text-muted-foreground mt-2">Entries pending reconciliation against bank statements.</p>
          </CardContent>
        </Card>
         <Card className="col-span-1">
            <CardHeader>
                <CardTitle>Receivable vs Payable</CardTitle>
            </CardHeader>
            <CardContent>
                 <div className="flex justify-between items-center p-4 rounded-md bg-green-50 dark:bg-green-900/30">
                    <div className="flex items-center gap-2">
                        <ArrowDown className="h-5 w-5 text-green-600"/>
                        <span className="font-semibold">Total Receivables</span>
                    </div>
                    <span className="font-mono text-lg font-bold">{formatCurrency(kpis.totalReceivables)}</span>
                </div>
                <div className="flex justify-between items-center p-4 rounded-md bg-red-50 dark:bg-red-900/30 mt-4">
                    <div className="flex items-center gap-2">
                        <ArrowUp className="h-5 w-5 text-red-600"/>
                        <span className="font-semibold">Total Payables</span>
                    </div>
                    <span className="font-mono text-lg font-bold">{formatCurrency(kpis.totalPayables)}</span>
                </div>
            </CardContent>
        </Card>
      </div>

       <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>GST Summary (Monthly)</CardTitle>
                    <CardDescription>Key GST figures for the current filing period.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            <TableRow>
                                <TableCell className="font-medium">Output GST (on Sales)</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(gstSummary.outputGst)}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">Input GST (on Purchases)</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(gstSummary.inputGst)}</TableCell>
                            </TableRow>
                             <TableRow className="bg-muted">
                                <TableCell className="font-bold">Net GST Payable</TableCell>
                                <TableCell className="text-right font-bold text-lg font-mono">{formatCurrency(gstSummary.netPayable)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Compliance Status</CardTitle>
                    <CardDescription>Current status of your GST return filings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center p-4 rounded-md bg-green-50 dark:bg-green-900/30">
                        <div className="flex items-center gap-2">
                            <BadgeCheck className="h-5 w-5 text-green-600"/>
                            <span className="font-semibold">GSTR-1</span>
                        </div>
                        <Badge variant="outline" className="bg-green-100 text-green-800">{complianceStatus.gstr1}</Badge>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-md bg-yellow-50 dark:bg-yellow-900/30">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600"/>
                            <span className="font-semibold">GSTR-3B</span>
                        </div>
                         <Badge variant="outline" className="bg-yellow-100 text-yellow-800">{complianceStatus.gstr3b}</Badge>
                    </div>
                </CardContent>
            </Card>
       </div>

       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Receivable Aging</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Chart for invoice aging will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Payable Aging</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Chart for vendor due dates will be here.</p>
            </CardContent>
        </Card>
      </div>

       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Expense Control</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Expense vs Budget and other cost control KPIs will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Inventory Accounting</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">COGS and Inventory Valuation KPIs will be here.</p>
            </CardContent>
        </Card>
      </div>
       <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Payroll & Statutory</CardTitle>
                    <CardDescription>Coming Soon</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                    <p className="text-muted-foreground">Salary, PF, ESI, and TDS payment status will be here.</p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle>Alerts & Exceptions</CardTitle>
                    <CardDescription>Coming Soon</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                    <p className="text-muted-foreground">Critical financial alerts will appear here.</p>
                </CardContent>
            </Card>
       </div>
    </>
  );
}
