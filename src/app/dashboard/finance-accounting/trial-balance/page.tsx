
'use client';

import * as React from 'react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Download, Filter, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, orderBy, Timestamp } from 'firebase/firestore';
import type { CoaLedger, JournalVoucher, SalesInvoice } from '@/lib/types';
import { useRole } from '../../_components/role-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from '@/lib/utils';
import { format, subYears, addYears } from 'date-fns';

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function TrialBalancePage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { currentRole } = useRole();
  const pdfRef = React.useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);
  
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [selectedFy, setSelectedFy] = React.useState('');

  const ledgersQuery = React.useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'coa_ledgers'), orderBy('name'));
  }, [firestore]);

  const vouchersQuery = React.useMemo(() => {
    if (!user || !['Admin', 'CEO', 'Accounts Manager'].includes(currentRole)) return null;
    return query(collection(firestore, 'journalVouchers'));
  }, [user, currentRole, firestore]);

  const invoicesQuery = React.useMemo(() => {
    if (!user || !['Admin', 'CEO', 'Accounts Manager'].includes(currentRole)) return null;
    return query(collection(firestore, 'salesInvoices'));
  }, [user, currentRole, firestore]);

  const { data: allAccounts, loading: accountsLoading } = useCollection<CoaLedger>(ledgersQuery);
  const { data: journalVouchers, loading: vouchersLoading } = useCollection<JournalVoucher>(vouchersQuery);
  const { data: salesInvoices, loading: invoicesLoading } = useCollection<SalesInvoice>(invoicesQuery);

  const loading = !firestore || accountsLoading || (vouchersLoading && invoicesLoading && ['Admin', 'CEO', 'Accounts Manager'].includes(currentRole));
  
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

  const finalBalances = React.useMemo(() => {
    if (!allAccounts?.length) return [];

    const accountBalances = new Map<string, number>();

    // 1. Initialize with Opening Balances
    allAccounts.forEach(acc => {
      const opening = acc.openingBalance?.amount ?? 0;
      const signedOpening = acc.openingBalance?.drCr === 'CR' ? -opening : opening;
      accountBalances.set(acc.id, signedOpening);
    });
    
    const sDate = startDate ? new Date(startDate) : null;
    if (sDate) sDate.setHours(0, 0, 0, 0);

    const periodTransactions: {accountId: string; debit: number; credit: number}[] = [];

    // 2. Process Journal Vouchers
    (journalVouchers || []).forEach(jv => {
      const jvDate = jv.createdAt instanceof Timestamp ? jv.createdAt.toDate() : new Date(jv.date);
      if ((!sDate || jvDate >= sDate) && (!endDate || jvDate <= new Date(endDate))) {
        jv.entries.forEach(entry => {
          periodTransactions.push({
            accountId: entry.accountId,
            debit: entry.debit || 0,
            credit: entry.credit || 0,
          });
        });
      }
    });

    // 3. Process Sales Invoices (as Journal Entries)
    (salesInvoices || []).forEach(inv => {
      const invDate = new Date(inv.date);
      if ((!sDate || invDate >= sDate) && (!endDate || invDate <= new Date(endDate))) {
        // Debit Customer
        if (inv.coaLedgerId) {
            periodTransactions.push({ accountId: inv.coaLedgerId, debit: inv.grandTotal, credit: 0 });
        }
        
        // Credit Sales
        const salesLedger = allAccounts.find(l => l.name === 'Sales – Domestic');
        if (salesLedger) {
          const taxableAmount = inv.taxableAmount || (inv.subtotal - (inv.discount || 0));
          periodTransactions.push({ accountId: salesLedger.id, debit: 0, credit: taxableAmount });
        }

        // Credit GST
        const cgstLedger = allAccounts.find(l => l.name === 'Output GST – CGST');
        if (cgstLedger && inv.cgst) {
            periodTransactions.push({ accountId: cgstLedger.id, debit: 0, credit: inv.cgst });
        }
        const sgstLedger = allAccounts.find(l => l.name === 'Output GST – SGST');
         if (sgstLedger && inv.sgst) {
            periodTransactions.push({ accountId: sgstLedger.id, debit: 0, credit: inv.sgst });
        }
      }
    });

    // 4. Aggregate all transactions to final balances
    for (const tx of periodTransactions) {
      if (accountBalances.has(tx.accountId)) {
        const current = accountBalances.get(tx.accountId) ?? 0;
        accountBalances.set(tx.accountId, current + tx.debit - tx.credit);
      }
    }

    return allAccounts.map((acc) => ({
      ...acc,
      finalBalance: accountBalances.get(acc.id) ?? 0,
    }));
  }, [allAccounts, journalVouchers, salesInvoices, startDate, endDate]);


  const { totalDebit, totalCredit } = React.useMemo(() => {
    let debit = 0;
    let credit = 0;

    for (const acc of finalBalances) {
      const bal = Number((acc as any).finalBalance ?? 0);
      if (bal > 0) debit += bal;
      else if (bal < 0) credit += Math.abs(bal);
    }

    debit = Math.round(debit * 100) / 100;
    credit = Math.round(credit * 100) / 100;

    return { totalDebit: debit, totalCredit: credit };
  }, [finalBalances]);
  
  const handleDownloadPdf = async () => {
    const element = pdfRef.current;
    if (!element) return;
    setIsDownloading(true);
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, 0, undefined, 'FAST');
    pdf.save(`Trial-Balance-${new Date().toISOString().split('T')[0]}.pdf`);
    setIsDownloading(false);
  };
  
  const handleExportExcel = () => {
    const dataToExport = finalBalances
      .map(account => {
        const bal = Number(account.finalBalance ?? 0);
        const debit = bal > 0 ? bal : 0;
        const credit = bal < 0 ? Math.abs(bal) : 0;
        if (debit === 0 && credit === 0) return null;
        return {
          'Ledger Account': account.name,
          'Debit (₹)': debit.toFixed(2),
          'Credit (₹)': credit.toFixed(2),
        };
      })
      .filter(Boolean);

    dataToExport.push({
        'Ledger Account': 'Total',
        'Debit (₹)': totalDebit.toFixed(2),
        'Credit (₹)': totalCredit.toFixed(2),
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trial Balance');
    XLSX.writeFile(workbook, 'TrialBalance.xlsx');
  };

  const mismatch = !loading && Math.abs(totalDebit - totalCredit) > 0.01;

  if (!['Admin', 'CEO', 'Accounts Manager'].includes(currentRole)) {
    return (
        <>
            <PageHeader title="Trial Balance" />
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
                <div className="flex flex-col items-center gap-1 text-center">
                <h3 className="text-2xl font-bold tracking-tight">
                    Access Denied
                </h3>
                <p className="text-sm text-muted-foreground">
                    You do not have permission to view the trial balance.
                </p>
                </div>
            </div>
        </>
    );
  }

  return (
    <>
      <PageHeader title="Trial Balance">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
             <Download className="mr-2 h-4 w-4" /> Export to Excel
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf} disabled={isDownloading}>
             {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
             Export PDF
          </Button>
        </div>
      </PageHeader>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Debits</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatIndianCurrency(totalDebit)}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatIndianCurrency(totalCredit)}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Difference</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${mismatch ? 'text-red-500' : 'text-green-500'}`}>{formatIndianCurrency(totalDebit - totalCredit)}</div>
            </CardContent>
        </Card>
      </div>

      {mismatch && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Totals Do Not Match!</AlertTitle>
          <AlertDescription>
            Total debits do not equal total credits. This indicates an accounting issue.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trial Balance Details</CardTitle>
          <CardDescription>
            A summary of all ledger balances to verify equality of debits and credits.
          </CardDescription>
        </CardHeader>

        <CardContent>
           <div className="flex flex-wrap items-end gap-4 mb-4 p-4 border rounded-lg bg-muted/50">
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

          <div ref={pdfRef} className="p-4">
            <h2 className="text-lg font-bold text-center mb-1">Trial Balance</h2>
            <p className="text-center text-sm text-muted-foreground mb-4">As on {endDate ? new Date(endDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2">Ledger Account</TableHead>
                  <TableHead className="text-right">Debit (₹)</TableHead>
                  <TableHead className="text-right">Credit (₹)</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : (
                  finalBalances.map((account) => {
                    const bal = Number((account as any).finalBalance ?? 0);
                    const debit = bal > 0 ? bal : 0;
                    const credit = bal < 0 ? Math.abs(bal) : 0;

                    if (debit === 0 && credit === 0) return null;

                    return (
                      <TableRow key={account.id}>
                        <TableCell>{account.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {debit > 0 ? formatIndianCurrency(debit) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {credit > 0 ? formatIndianCurrency(credit) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>

              <TableFooter>
                <TableRow className="text-base font-bold bg-muted">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatIndianCurrency(totalDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatIndianCurrency(totalCredit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
