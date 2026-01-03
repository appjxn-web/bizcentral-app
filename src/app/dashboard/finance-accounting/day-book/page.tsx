

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import type { JournalVoucher, CoaLedger, CompanyInfo, Order } from '@/lib/types';
import { Loader2, Download, ShieldCheck, Filter, Receipt, Calendar } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const formatCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2,
  }).format(num || 0);
};

export default function DayBookPage() {
  const firestore = useFirestore();
  const pdfRef = React.useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [typeFilters, setTypeFilters] = React.useState<string[]>([]);

  const { data: vouchers, loading: vouchersLoading } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));
  const { data: ledgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: companyInfo } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
  const { data: orders } = useCollection<Order>(collection(firestore, 'orders'));

  const ledgerMap = React.useMemo(() => new Map(ledgers?.map(l => [l.id, l.name])), [ledgers]);
  const orderMap = React.useMemo(() => new Map(orders?.map(o => [o.orderNumber, o.customerName])), [orders]);


  const dailyStats = React.useMemo(() => {
    const targetDate = selectedDate;
    const stats: { inflow: number; outflow: number; balances: any[] } = { inflow: 0, outflow: 0, balances: [] };
    if (!vouchers || !ledgers) return stats;

    const cashBankIds = new Set(ledgers.filter(l => l.groupId === '1.1.1' || l.type === 'BANK' || l.type === 'CASH').map(l => l.id));

    vouchers.forEach(jv => {
        if (jv.date === targetDate) {
            jv.entries.forEach(entry => {
                if (cashBankIds.has(entry.accountId)) {
                    if ((entry.debit || 0) > 0) stats.inflow += entry.debit!;
                    if ((entry.credit || 0) > 0) stats.outflow += entry.credit!;
                }
            });
        }
    });

    cashBankIds.forEach(id => {
        const ledger = ledgers.find(l => l.id === id);
        if (!ledger) return;
        let bal = (ledger.openingBalance?.amount || 0) * (ledger.openingBalance?.drCr === 'CR' ? -1 : 1);
        vouchers.filter(jv => new Date(jv.date) <= new Date(targetDate)).forEach(jv => {
            jv.entries.forEach(e => {
                if (e.accountId === id) bal += (e.debit || 0) - (e.credit || 0);
            });
        });
        stats.balances.push({ name: ledger.name, balance: bal, type: ledger.type });
    });
    return stats;
  }, [vouchers, ledgers, selectedDate]);

  const filteredTransactions = React.useMemo(() => {
    if (!vouchers) return [];
    return vouchers.filter(jv => jv.date === selectedDate && (typeFilters.length === 0 || typeFilters.some(f => jv.narration.toLowerCase().includes(f.toLowerCase()))))
                   .sort((a,b) => b.id.localeCompare(a.id));
  }, [vouchers, selectedDate, typeFilters]);

  const handleDownloadPdf = async () => {
    if (!pdfRef.current) return;
    setIsDownloading(true);
    const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png', 1.0);
    pdf.addImage(imgData, 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
    pdf.save(`DayBook_${selectedDate}.pdf`);
    setIsDownloading(false);
  };

  return (
    <div className="flex flex-col gap-3 pb-10 max-w-5xl mx-auto">
      <PageHeader title="Day Book">
        <Button onClick={handleDownloadPdf} disabled={isDownloading} className="rounded-[2px] h-8 text-[11px] font-bold bg-slate-900 shadow-md">
          {isDownloading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Download className="mr-2 h-3 w-3" />}
          Download PDF (Compact)
        </Button>
      </PageHeader>
      
      <div className="flex flex-wrap items-stretch gap-0 bg-white border border-slate-200 rounded-[2px] divide-x divide-slate-200 shadow-sm overflow-hidden">
        <div className="flex-1 px-4 py-2 bg-slate-50/50">
            <p className="text-[9px] uppercase font-black text-slate-400 leading-none mb-1">Inflow</p>
            <p className="text-sm font-bold text-green-600">{formatCurrency(dailyStats.inflow)}</p>
        </div>
        <div className="flex-1 px-4 py-2 bg-slate-50/50">
            <p className="text-[9px] uppercase font-black text-slate-400 leading-none mb-1">Outflow</p>
            <p className="text-sm font-bold text-red-600">{formatCurrency(dailyStats.outflow)}</p>
        </div>
        <div className="flex-1 px-4 py-2 bg-slate-50/50">
            <p className="text-[9px] uppercase font-black text-slate-400 leading-none mb-1">Net Flow</p>
            <p className="text-sm font-bold text-blue-600">{formatCurrency(dailyStats.inflow - dailyStats.outflow)}</p>
        </div>
        <div className="flex-[2] px-4 py-2 flex flex-wrap gap-x-4 gap-y-1">
            {dailyStats.balances?.map(b => (
                <div key={b.name} className="flex gap-2 items-center">
                    <span className="text-[8px] font-bold text-slate-500 uppercase">{b.name}:</span>
                    <span className="text-[10px] font-bold font-mono">{formatCurrency(b.balance)}</span>
                </div>
            ))}
        </div>
      </div>

      <Card className="rounded-[2px] border shadow-none">
        <CardHeader className="p-3 border-b flex flex-row items-center justify-between space-y-0 bg-slate-50/30">
          <div className="flex items-center gap-4">
            <CardTitle className="text-xs font-black uppercase tracking-tight flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5 text-slate-400" /> Transaction Ledger
            </CardTitle>
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-7 text-[11px] w-32 rounded-[2px] font-bold" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 rounded-[2px] text-[10px] uppercase font-bold"><Filter className="h-3 w-3 mr-1"/> Filter</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-[2px] text-xs">
                <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
                <DropdownMenuSeparator/>
                {['Payment', 'Receipt', 'Expense'].map(f => (
                    <DropdownMenuCheckboxItem key={f} checked={typeFilters.includes(f)} onCheckedChange={() => setTypeFilters(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f])}>{f}</DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-[11px]">
            <TableHeader className="bg-slate-100/50">
              <TableRow className="h-8 border-b-slate-200">
                <TableHead className="w-16 pl-4 font-black uppercase text-[9px] text-slate-900">Type</TableHead>
                <TableHead className="font-black uppercase text-[9px] text-slate-900">Particulars & Vouchers</TableHead>
                <TableHead className="text-right font-black uppercase text-[9px] text-slate-900">Debit (Dr)</TableHead>
                <TableHead className="text-right pr-4 font-black uppercase text-[9px] text-slate-900">Credit (Cr)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchersLoading ? <TableRow><TableCell colSpan={4} className="h-20 text-center"><Loader2 className="animate-spin mx-auto h-4 w-4"/></TableCell></TableRow> :
                filteredTransactions.map(jv => {
                  const voucherType = (jv as any).voucherType?.substring(0,2).toUpperCase() || 'JV';
                  const orderNumberMatch = jv.narration.match(/#(\S+)/);
                  const orderNumber = orderNumberMatch ? orderNumberMatch[1] : null;
                  const customerName = orderNumber ? orderMap.get(orderNumber) : null;
                  const voucherNumber = (jv as any).voucherNumber || jv.id.substring(0, 6);

                  return (
                    <React.Fragment key={jv.id}>
                      <TableRow className="bg-slate-50/20 border-b border-slate-100">
                        <TableCell className="pl-4">
                          <Badge className="rounded-[1px] text-[8px] h-3.5 bg-slate-200 text-slate-800 border-none font-bold">
                            {voucherType}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold py-1.5 text-slate-900">
                          <div className="flex justify-between items-center">
                            <span className="uppercase">{jv.narration}</span>
                            <span className="font-mono text-xs text-slate-400">{voucherNumber}</span>
                          </div>
                          {customerName && <div className="text-xs text-muted-foreground font-medium">Customer: {customerName}</div>}
                        </TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                      {jv.entries.map((entry, i) => (
                        <TableRow key={i} className="h-6 border-none hover:bg-transparent group">
                          <TableCell />
                          <TableCell className="pl-6 text-slate-500 py-0.5 border-l-2 border-slate-100 ml-4">{entry.debit ? 'Dr.' : 'Cr.'} {ledgerMap.get(entry.accountId)}</TableCell>
                          <TableCell className="text-right py-0.5 font-mono text-slate-700 font-medium">{entry.debit ? formatCurrency(entry.debit) : ''}</TableCell>
                          <TableCell className="text-right pr-4 py-0.5 font-mono text-slate-700 font-medium">{entry.credit ? formatCurrency(entry.credit) : ''}</TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  )
                })
              }
               {filteredTransactions.length === 0 && !vouchersLoading && (
                 <TableRow><TableCell colSpan={4} className="h-32 text-center text-slate-400 font-bold italic">No records found for this date.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="absolute -left-[9999px]" aria-hidden="true">
        <div className="w-[210mm] bg-white text-slate-900 p-6 font-sans" ref={pdfRef}>
            <div className="flex justify-between items-start border-b border-slate-300 pb-3 mb-3">
                <div className="flex items-center gap-4">
                    {companyInfo?.logo && <Image src={companyInfo.logo} alt="Logo" width={110} height={35} crossOrigin="anonymous" />}
                    <div className="space-y-0.5">
                        <h1 className="text-xl font-black uppercase leading-none">{companyInfo?.companyName || 'BIZCENTRAL'}</h1>
                        <p className="text-[7px] font-medium text-slate-500 max-w-sm leading-tight uppercase tracking-tight">{companyInfo?.address as string}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="inline-flex items-center gap-1 bg-slate-900 text-white px-2 py-0.5 rounded-[1px] mb-1">
                        <ShieldCheck className="h-2 w-2" />
                        <span className="text-[6px] font-bold uppercase tracking-widest">Certified Statement</span>
                    </div>
                    <h2 className="text-sm font-black uppercase tracking-tighter leading-none">Day Book Summary</h2>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">{format(new Date(selectedDate), 'MMMM do, yyyy')}</p>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2 p-2 border border-slate-200 bg-slate-50/50 rounded-[2px] mb-4 divide-x divide-slate-200">
                <div className="pl-2">
                    <p className="text-[6px] font-black uppercase text-slate-400 mb-0.5">Total Inflow</p>
                    <p className="text-xs font-black">{formatCurrency(dailyStats.inflow)}</p>
                </div>
                <div className="pl-4">
                    <p className="text-[6px] font-black uppercase text-slate-400 mb-0.5">Total Outflow</p>
                    <p className="text-xs font-black">{formatCurrency(dailyStats.outflow)}</p>
                </div>
                <div className="pl-4">
                    <p className="text-[6px] font-black uppercase text-slate-400 mb-0.5">Net Cash Flow</p>
                    <p className="text-xs font-black">{formatCurrency(dailyStats.inflow - dailyStats.outflow)}</p>
                </div>
                <div className="pl-4 space-y-0.5">
                    {dailyStats.balances.map(b => (
                        <div key={b.name} className="flex justify-between border-b border-slate-100 pb-0.5">
                            <span className="text-[6px] font-bold uppercase text-slate-500">{b.name}</span>
                            <span className="text-[6px] font-black font-mono">{formatCurrency(b.balance)}</span>
                        </div>
                    ))}
                </div>
            </div>

            <Table className="border-t border-slate-300 text-[8px] leading-tight">
                <TableHeader className="bg-slate-50">
                    <TableRow className="h-6 border-b-slate-300">
                        <TableHead className="text-slate-950 font-black uppercase text-[7px] py-0 h-6">Particulars & Narration</TableHead>
                        <TableHead className="text-right text-slate-950 font-black uppercase text-[7px] py-0 h-6">Debit (Dr)</TableHead>
                        <TableHead className="text-right text-slate-950 font-black uppercase text-[7px] py-0 h-6 pr-2">Credit (Cr)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredTransactions.map(jv => (
                        <React.Fragment key={jv.id}>
                            <TableRow className="bg-slate-100/30 h-5 border-none">
                                <TableCell className="font-black py-0.5 uppercase tracking-tighter" colSpan={3}>{jv.narration}</TableCell>
                            </TableRow>
                            {jv.entries.map((e, i) => (
                                <TableRow key={i} className="border-none h-3.5">
                                    <TableCell className="pl-4 py-0 text-slate-500 italic">{e.debit ? 'Dr.' : 'Cr.'} {ledgerMap.get(e.accountId)}</TableCell>
                                    <TableCell className="text-right py-0 font-bold font-mono text-slate-600">{e.debit ? formatCurrency(e.debit) : ''}</TableCell>
                                    <TableCell className="text-right py-0 font-bold font-mono text-slate-600 pr-2">{e.credit ? formatCurrency(e.credit) : ''}</TableCell>
                                </TableRow>
                            ))}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>

            <div className="mt-12 flex justify-between items-end border-t border-slate-200 pt-3">
                <div className="text-[6px] text-slate-400 font-bold uppercase space-y-0.5">
                    <p>Doc Ref: DB-{selectedDate.replace(/-/g, '')}</p>
                    <p>Generated: {format(new Date(), 'PPP p')}</p>
                </div>
                <div className="text-center w-32">
                    <div className="border-b border-slate-900 mb-1 h-6"></div>
                    <p className="text-[7px] font-black uppercase tracking-widest text-slate-900">Authorized Signatory</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

