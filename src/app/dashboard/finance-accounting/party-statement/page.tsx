

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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
import { CircleDollarSign, ArrowUpCircle, ArrowDownCircle, Download, Loader2, Check, ChevronsUpDown, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { collection, query, doc } from 'firebase/firestore';
import type { JournalVoucher, CoaLedger, Party, CompanyInfo } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

function PartyStatementPageContent() {
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const partyIdFromUrl = searchParams.get('partyId');
  
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(partyIdFromUrl);
  const [accountHolder, setAccountHolder] = React.useState<Party | CoaLedger | null>(null);
  const [openCombobox, setOpenCombobox] = React.useState(false);

  // Data fetching
  const { data: companyInfo } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
  const { data: parties, loading: partiesLoading } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: ledgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: journalVouchers, loading: vouchersLoading } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));

  const pdfRef = React.useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);

  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const combinedAccounts = React.useMemo(() => {
    if (!parties && !ledgers) return [];
    const accountsMap = new Map<string, { id: string; name: string; type: string }>();
    (parties || []).forEach(p => {
      const key = p.coaLedgerId || p.id;
      if (!accountsMap.has(key)) {
        accountsMap.set(key, { id: key, name: p.name, type: 'Party' });
      }
    });
    (ledgers || []).forEach(l => {
      if (!accountsMap.has(l.id)) {
        accountsMap.set(l.id, { id: l.id, name: l.name, type: 'Ledger' });
      }
    });
    return Array.from(accountsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, ledgers]);
  
  React.useEffect(() => {
    const account = combinedAccounts.find(acc => acc.id === selectedAccountId);
    if(account) {
        if(account.type === 'Party') {
            setAccountHolder(parties?.find(p => p.coaLedgerId === account.id || p.id === account.id) || null);
        } else {
            setAccountHolder(ledgers?.find(l => l.id === account.id) || null);
        }
    } else {
        setAccountHolder(null);
    }
  }, [selectedAccountId, combinedAccounts, parties, ledgers]);

  const { ledger, kpis } = React.useMemo(() => {
    const defaultKpis = { openingBalance: 0, balance: 0, totalCredit: 0, totalDebit: 0 };
    if (!selectedAccountId || !journalVouchers || !ledgers) return { ledger: [], kpis: defaultKpis };
    
    const targetLedger = ledgers.find(l => l.id === selectedAccountId);
    if (!targetLedger) return { ledger: [], kpis: defaultKpis };

    const openingBalance = targetLedger.openingBalance?.amount || 0;
    const sortedVouchers = [...journalVouchers].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const transactionsBeforePeriod = sortedVouchers.filter(jv => {
        const jvDate = new Date(jv.date);
        return dateFrom && jvDate < new Date(dateFrom);
    }).flatMap(jv => jv.entries.filter(e => e.accountId === selectedAccountId));

    let periodOpeningBalance = openingBalance;
    transactionsBeforePeriod.forEach(tx => {
        periodOpeningBalance += (tx.debit || 0) - (tx.credit || 0);
    });
    
    const periodTransactions = sortedVouchers.filter(jv => {
        const jvDate = new Date(jv.date);
        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo) : null;
        if(fromDate) fromDate.setHours(0,0,0,0);
        if(toDate) toDate.setHours(23,59,59,999);
        return jv.entries.some(e => e.accountId === selectedAccountId) && 
               (!fromDate || jvDate >= fromDate) && 
               (!toDate || jvDate <= toDate);
    });

    let runningBalance = periodOpeningBalance;
    const processedLedger = periodTransactions.map(jv => {
      const entry = jv.entries.find(e => e.accountId === selectedAccountId)!;
      runningBalance += (entry.debit || 0) - (entry.credit || 0);
      return {
        id: jv.id, date: jv.date, description: jv.narration,
        debit: entry.debit || 0, credit: entry.credit || 0, balance: runningBalance,
      };
    });

    return {
      ledger: processedLedger,
      kpis: { 
        openingBalance: periodOpeningBalance, 
        balance: runningBalance, 
        totalCredit: processedLedger.reduce((s, t) => s + t.credit, 0), 
        totalDebit: processedLedger.reduce((s, t) => s + t.debit, 0) 
      },
    };
  }, [selectedAccountId, journalVouchers, ledgers, dateFrom, dateTo]);

  const handleDownloadPdf = async () => {
    const element = pdfRef.current;
    if (!element) return;
    setIsDownloading(true);
    
    const canvas = await html2canvas(element, { 
      scale: 3, 
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const imgProps = pdf.getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Statement_${accountHolder?.name || 'Account'}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    setIsDownloading(false);
  };
  
  const loading = partiesLoading || vouchersLoading || ledgersLoading;
  const isAssetOrExpense = accountHolder && ('nature' in accountHolder) && (accountHolder.nature === 'ASSET' || accountHolder.nature === 'EXPENSE');

  return (
    <>
      <PageHeader title="Ledger Statement">
          <Button onClick={handleDownloadPdf} disabled={isDownloading || !selectedAccountId} className="shadow-lg">
            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Professional PDF
          </Button>
      </PageHeader>
      
       <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filter Statement</CardTitle>
          <div className="flex flex-wrap items-end gap-4 pt-4">
              <div className="space-y-2 flex-grow">
                <Label>Select Account</Label>
                <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {selectedAccountId ? combinedAccounts.find(acc => acc.id === selectedAccountId)?.name : "Search account..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Search account..." />
                      <CommandList>
                        <CommandEmpty>No account found.</CommandEmpty>
                        <CommandGroup>
                          {combinedAccounts.map((acc) => (
                            <CommandItem key={acc.id} value={acc.name} onSelect={() => { setSelectedAccountId(acc.id); setOpenCombobox(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", selectedAccountId === acc.id ? "opacity-100" : "opacity-0")} />
                              {acc.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                  <Label>From</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                  <Label>To</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <Button variant="ghost" onClick={() => { setDateFrom(''); setDateTo(''); setSelectedAccountId(null); }}>Reset</Button>
          </div>
        </CardHeader>
      </Card>
      
      {selectedAccountId ? (
          <>
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              <Card className="bg-muted/30">
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase font-bold text-muted-foreground">Opening</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold">{formatIndianCurrency(kpis.openingBalance)}</div></CardContent>
              </Card>
              <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase font-bold text-muted-foreground text-red-600">Total Dr.</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold">{formatIndianCurrency(kpis.totalDebit)}</div></CardContent>
              </Card>
              <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase font-bold text-muted-foreground text-green-600">Total Cr.</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold">{formatIndianCurrency(kpis.totalCredit)}</div></CardContent>
              </Card>
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase font-bold text-primary">Closing Balance</CardTitle></CardHeader>
                <CardContent><div className="text-xl font-bold text-primary">{formatIndianCurrency(kpis.balance)}</div></CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Detailed History</CardTitle>
              </CardHeader>
              <CardContent>
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
                    {loading ? (
                      <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                    ) : ledger.length > 0 ? (
                      ledger.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="whitespace-nowrap">{format(new Date(tx.date), 'dd MMM yyyy')}</TableCell>
                            <TableCell className="font-medium">{tx.description}</TableCell>
                            <TableCell className="text-right font-mono text-red-600">{tx.debit ? formatIndianCurrency(tx.debit) : '-'}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{tx.credit ? formatIndianCurrency(tx.credit) : '-'}</TableCell>
                            <TableCell className="text-right font-mono font-bold">{formatIndianCurrency(tx.balance)}</TableCell>
                          </TableRow>
                        ))
                    ) : (
                      <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">No transactions found.</TableCell></TableRow>
                    )}
                  </TableBody>
                   <TableFooter>
                    <TableRow>
                        <TableCell colSpan={4} className="text-right font-bold">Closing Balance</TableCell>
                        <TableCell className="text-right font-bold font-mono">{formatIndianCurrency(kpis.balance)}</TableCell>
                    </TableRow>
                </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </>
      ) : (
        <div className="p-20 text-center border-2 border-dashed rounded-xl">
            <p className="text-muted-foreground text-lg">Please select an account to generate a statement.</p>
        </div>
      )}

      {/* --- PROFESSIONAL PDF TEMPLATE (HIDDEN FROM SCREEN) --- */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
        <div 
          className="w-[210mm] bg-white text-slate-900 p-12 font-sans shadow-none" 
          ref={pdfRef}
          style={{ minHeight: '297mm' }}
        >
          {accountHolder && (
            <>
            <header className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8">
              <div className="flex-1">
                {companyInfo?.logo && (
                  <Image 
                    src={companyInfo.logo} 
                    alt="Company Logo" 
                    crossOrigin="anonymous" 
                    width={180}
                    height={50}
                    style={{ objectFit: 'contain', marginBottom: '15px' }} 
                  />
                )}
                <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-950">
                  {companyInfo?.companyName || 'BIZCENTRAL'}
                </h1>
              </div>
              <div className="text-right flex flex-col items-end">
                <Badge className="bg-slate-900 text-white rounded-none px-4 py-1 mb-4 uppercase tracking-[0.2em] font-bold">
                  Account Statement
                </Badge>
              </div>
            </header>

            <div className="grid grid-cols-2 gap-10 mb-8">
              <div className="space-y-1">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Statement For:</h3>
                <p className="text-xl font-bold">{accountHolder?.name}</p>
                <p className="text-xs text-slate-600">ID: {accountHolder?.id}</p>
                <p className="text-xs text-slate-600 italic">{accountHolder?.email}</p>
              </div>
              <div className="bg-slate-50 border-l-4 border-slate-900 p-4 grid grid-cols-2 gap-4">
                 <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Opening Bal.</p>
                    <p className="text-sm font-black">{formatIndianCurrency(kpis.openingBalance)}</p>
                 </div>
                 <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Closing Bal.</p>
                    <p className="text-sm font-black underline decoration-2">{formatIndianCurrency(kpis.balance)}</p>
                 </div>
                 <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Net Debit</p>
                    <p className="text-xs font-bold text-red-600">{formatIndianCurrency(kpis.totalDebit)}</p>
                 </div>
                 <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Net Credit</p>
                    <p className="text-xs font-bold text-green-600">{formatIndianCurrency(kpis.totalCredit)}</p>
                 </div>
              </div>
            </div>

            <Table className="border-t-2 border-slate-900">
              <TableHeader className="bg-slate-100">
                <TableRow className="h-10">
                  <TableHead className="text-slate-950 font-black text-[10px] uppercase">Date</TableHead>
                  <TableHead className="text-slate-950 font-black text-[10px] uppercase">Transaction Description</TableHead>
                  <TableHead className="text-right text-slate-950 font-black text-[10px] uppercase">Debit (Dr)</TableHead>
                  <TableHead className="text-right text-slate-950 font-black text-[10px] uppercase">Credit (Cr)</TableHead>
                  <TableHead className="text-right text-slate-950 font-black text-[10px] uppercase">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-slate-50/50 italic border-b h-8">
                  <TableCell colSpan={4} className="text-[10px] font-bold">Opening Balance</TableCell>
                  <TableCell className="text-right text-[10px] font-black">{formatIndianCurrency(kpis.openingBalance)}</TableCell>
                </TableRow>
                {ledger.map((tx) => (
                  <TableRow key={tx.id} className="border-b border-slate-100 h-9">
                    <TableCell className="text-[10px] whitespace-nowrap">{format(new Date(tx.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-[10px] font-medium leading-tight max-w-[200px]">{tx.description}</TableCell>
                    <TableCell className="text-right text-[10px] font-mono text-red-600">{tx.debit ? formatIndianCurrency(tx.debit) : ''}</TableCell>
                    <TableCell className="text-right text-[10px] font-mono text-green-600">{tx.credit ? formatIndianCurrency(tx.credit) : ''}</TableCell>
                    <TableCell className="text-right text-[10px] font-black">{formatIndianCurrency(tx.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                 <TableRow className="bg-slate-900 text-white h-12 font-black">
                    <TableCell colSpan={4} className="text-[11px] uppercase tracking-widest pl-4">Closing Statement Balance</TableCell>
                    <TableCell className="text-right text-lg pr-4">{formatIndianCurrency(kpis.balance)}</TableCell>
                 </TableRow>
              </TableFooter>
            </Table>

            <footer className="mt-auto pt-20 flex justify-between items-end border-t border-slate-200">
              <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest space-y-1">
                  <div className="flex items-center gap-1 text-slate-900 bg-slate-50 px-2 py-1 rounded-sm w-fit mb-2">
                    <ShieldCheck className="h-2.5 w-2.5" /> Verified Statement
                  </div>
                  <p>Doc. Verification ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                  <p>Generated: {format(new Date(), 'PPP p')}</p>
              </div>
              <div className="text-center w-64">
                <div className="border-b-2 border-slate-950 mb-3 h-12"></div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-950">Authorized Signatory</p>
                <p className="text-[7px] text-slate-400 mt-1 font-medium italic">This is a system generated statement and does not require a physical signature.</p>
              </div>
            </footer>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function PartyStatementPage() {
    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => { setIsClient(true); }, []);
    if (!isClient) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
    return <PartyStatementPageContent />;
}
