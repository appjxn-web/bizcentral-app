

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CircleDollarSign, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useFirestore, useDoc, useCollection, useUser } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import type { CoaLedger, JournalVoucher, Party } from '@/lib/types';
import { cn } from '@/lib/utils';

type Transaction = {
  id: string;
  date: string;
  description: string;
  partyName?: string;
  debit?: number;
  credit?: number;
};


export default function AccountViewPage() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId');
  const firestore = useFirestore();
  const { user } = useUser();
  
  const accountRef = React.useMemo(() => {
    if (!accountId) return null;
    return doc(firestore, 'coa_ledgers', accountId);
  }, [firestore, accountId]);

  const { data: accountDetails, loading: accountLoading } = useDoc<CoaLedger>(accountRef);
  
  const { data: journalVouchers, loading: vouchersLoading } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));
  const { data: parties, loading: partiesLoading } = useCollection<Party>(collection(firestore, 'parties'));


  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const { ledger, kpis } = React.useMemo(() => {
    const defaultResult = { ledger: [], kpis: { openingBalance: 0, totalCredit: 0, totalDebit: 0, closingBalance: 0 } };
    if (!accountId || !journalVouchers || !accountDetails) return defaultResult;
    
    // Create a map for quick party lookup
    const partyMap = new Map(parties?.map(p => [p.id, p.name]));

    const openingBalanceAmount = accountDetails.openingBalance?.amount || 0;
    const isCreditOpening = accountDetails.openingBalance?.drCr === 'CR';
    const openingBalance = isCreditOpening ? -openingBalanceAmount : openingBalanceAmount;

    const relevantTransactions = journalVouchers.flatMap(jv => {
        const entry = jv.entries.find(e => e.accountId === accountId);
        if (!entry) return [];

        const partyName = (jv as any).partyId ? partyMap.get((jv as any).partyId) : undefined;
        return {
            id: jv.id,
            date: jv.date,
            description: jv.narration,
            partyName,
            debit: entry.debit || 0,
            credit: entry.credit || 0,
        };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let runningBalance = openingBalance;
    const ledgerWithBalance = relevantTransactions.map(tx => {
        runningBalance += tx.debit - tx.credit;
        return { ...tx, balance: runningBalance };
    });

    const totalDebit = relevantTransactions.reduce((sum, tx) => sum + (tx.debit || 0), 0);
    const totalCredit = relevantTransactions.reduce((sum, tx) => sum + (tx.credit || 0), 0);
    
    return {
        ledger: ledgerWithBalance.reverse(), // Show most recent first
        kpis: {
            openingBalance: openingBalanceAmount,
            totalCredit,
            totalDebit,
            closingBalance: runningBalance,
        }
    };

  }, [accountId, journalVouchers, accountDetails, parties]);
  
  const filteredTransactions = React.useMemo(() => {
    return ledger.filter(tx => {
        if (!dateFrom && !dateTo) return true;
        const txDate = new Date(tx.date);
        if (dateFrom && txDate < new Date(dateFrom)) return false;
        if (dateTo && txDate > new Date(dateTo)) return false;
        return true;
    });
  }, [ledger, dateFrom, dateTo]);
  
  if (accountLoading || partiesLoading) {
      return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  if (!accountDetails) {
    return <PageHeader title="Account not found" />;
  }

  const isAssetOrExpense = accountDetails.nature === 'ASSET' || accountDetails.nature === 'EXPENSE';

  return (
    <>
      <PageHeader title={`Ledger: ${accountDetails.name}`} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Opening Balance</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">₹{kpis.openingBalance.toFixed(2)}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
                <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className={cn("text-2xl font-bold", isAssetOrExpense ? 'text-red-600' : 'text-green-600')}>₹{kpis.totalCredit.toFixed(2)}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Debits</CardTitle>
                <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className={cn("text-2xl font-bold", isAssetOrExpense ? 'text-green-600' : 'text-red-600')}>₹{kpis.totalDebit.toFixed(2)}</div>
            </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closing Balance</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.closingBalance.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>
            A detailed statement of all financial transactions for this account.
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchersLoading ? (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                </TableRow>
              ) : filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>{format(new Date(tx.date), 'PPP')}</TableCell>
                      <TableCell className="font-medium">
                        {tx.description}
                        {tx.partyName && <span className="text-muted-foreground text-xs block">({tx.partyName})</span>}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono", isAssetOrExpense ? 'text-green-600' : 'text-red-600')}>
                        {tx.debit ? `₹${tx.debit.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono", isAssetOrExpense ? 'text-red-600' : 'text-green-600')}>
                        {tx.credit ? `₹${tx.credit.toFixed(2)}` : '-'}
                      </TableCell>
                    </TableRow>
                  ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No transactions found for the selected period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
             <TableFooter>
                <TableRow>
                    <TableCell colSpan={2} className="text-right font-bold">Period Total</TableCell>
                    <TableCell className={cn("text-right font-bold font-mono", isAssetOrExpense ? 'text-green-600' : 'text-red-600')}>₹{filteredTransactions.reduce((sum, tx) => sum + (tx.debit || 0), 0).toFixed(2)}</TableCell>
                    <TableCell className={cn("text-right font-bold font-mono", isAssetOrExpense ? 'text-red-600' : 'text-green-600')}>₹{filteredTransactions.reduce((sum, tx) => sum + (tx.credit || 0), 0).toFixed(2)}</TableCell>
                </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
