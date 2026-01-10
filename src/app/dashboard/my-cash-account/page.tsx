
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CircleDollarSign, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, query, where, doc, getDocs } from 'firebase/firestore';
import type { JournalVoucher, CoaLedger, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
};

function MyCashAccountPageContent() {
  const firestore = useFirestore();
  const { user: authUser } = useUser();
  
  const userProfileRef = authUser ? doc(firestore, 'users', authUser.uid) : null;
  const { data: userProfile, loading: userLoading } = useDoc<UserProfile>(userProfileRef);

  const [cashLedgerId, setCashLedgerId] = React.useState<string | null>(null);
  
  const { data: allLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: allJournalVouchers, loading: vouchersLoading } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));

  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  React.useEffect(() => {
    // Find the cash ledger linked to the current user
    if (authUser && allLedgers) {
      const linkedLedger = allLedgers.find(l => l.tags?.includes(authUser.uid));
      if (linkedLedger) {
        setCashLedgerId(linkedLedger.id);
      }
    }
  }, [authUser, allLedgers]);

  const { ledger, kpis } = React.useMemo(() => {
    const defaultResult = { ledger: [], kpis: { openingBalance: 0, totalCredit: 0, totalDebit: 0, closingBalance: 0 } };
    if (!cashLedgerId || !allJournalVouchers || !allLedgers) return defaultResult;

    const cashLedger = allLedgers.find(l => l.id === cashLedgerId);
    if (!cashLedger) return defaultResult;

    let openingBalance = cashLedger.openingBalance?.amount || 0;
    
    const sortedVouchers = [...allJournalVouchers].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const transactions = sortedVouchers.flatMap(jv => {
      const entry = jv.entries.find(e => e.accountId === cashLedgerId);
      if (!entry) return [];
      return {
        id: jv.id,
        date: jv.date,
        description: jv.narration,
        debit: entry.debit || 0,
        credit: entry.credit || 0,
      };
    });

    const filteredTransactions = transactions.filter(tx => {
        if (!dateFrom && !dateTo) return true;
        const txDate = new Date(tx.date);
        if (dateFrom && txDate < new Date(dateFrom)) return false;
        if (dateTo && txDate > new Date(dateTo)) return false;
        return true;
    });

    const transactionsBeforePeriod = transactions.filter(tx => dateFrom && new Date(tx.date) < new Date(dateFrom));
    let periodOpeningBalance = openingBalance;
    transactionsBeforePeriod.forEach(tx => {
        periodOpeningBalance += tx.debit - tx.credit;
    });

    let runningBalance = periodOpeningBalance;
    const ledgerWithBalance = filteredTransactions.map(tx => {
      runningBalance += tx.debit - tx.credit;
      return { ...tx, balance: runningBalance };
    });

    return {
        ledger: ledgerWithBalance.reverse(),
        kpis: {
            openingBalance: periodOpeningBalance,
            totalCredit: filteredTransactions.reduce((sum, tx) => sum + tx.credit, 0),
            totalDebit: filteredTransactions.reduce((sum, tx) => sum + tx.debit, 0),
            closingBalance: runningBalance,
        }
    };
  }, [cashLedgerId, allJournalVouchers, allLedgers, dateFrom, dateTo]);

  if (userLoading) {
      return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin h-8 w-8" /></div>
  }

  if (!userProfile) {
    return <PageHeader title="Profile not found." />
  }
  
  if (!cashLedgerId && !ledgersLoading) {
      return (
          <>
            <PageHeader title="My Cash Account" />
            <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                    No cash account has been assigned to you.
                </CardContent>
            </Card>
          </>
      )
  }

  return (
    <>
      <PageHeader title="My Cash Account" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Opening Balance</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatIndianCurrency(kpis.openingBalance)}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cash In (Debit)</CardTitle>
                <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatIndianCurrency(kpis.totalDebit)}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cash Out (Credit)</CardTitle>
                <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatIndianCurrency(kpis.totalCredit)}</div>
            </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closing Balance</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.closingBalance)}</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>
            A detailed statement of all transactions in your cash account.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex flex-wrap items-end gap-4 mb-4 p-4 border rounded-lg bg-muted/50">
                <div className="space-y-2">
                    <Label htmlFor="date-from">Date From</Label>
                    <Input id="date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="date-to">Date To</Label>
                    <Input id="date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <Button onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear Filters</Button>
            </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit (Dr.)</TableHead>
                <TableHead className="text-right">Credit (Cr.)</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchersLoading ? (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                </TableRow>
              ) : ledger.length > 0 ? (
                ledger.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>{format(new Date(tx.date), 'PPP')}</TableCell>
                      <TableCell className="font-medium">{tx.description}</TableCell>
                      <TableCell className="text-right font-mono text-green-600">
                        {tx.debit ? formatIndianCurrency(tx.debit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        {tx.credit ? formatIndianCurrency(tx.credit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatIndianCurrency(tx.balance)}</TableCell>
                    </TableRow>
                  ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No transactions found for the selected period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
             <TableFooter>
                <TableRow>
                    <TableCell colSpan={2} className="text-right font-bold">Period Total</TableCell>
                    <TableCell className="text-right font-bold font-mono text-green-600">{formatIndianCurrency(kpis.totalDebit)}</TableCell>
                    <TableCell className="text-right font-bold font-mono text-red-600">{formatIndianCurrency(kpis.totalCredit)}</TableCell>
                    <TableCell></TableCell>
                </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function MyCashAccountPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <MyCashAccountPageContent />;
}
