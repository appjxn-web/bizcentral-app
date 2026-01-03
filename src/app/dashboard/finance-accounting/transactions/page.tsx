
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
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
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, FileUp, Camera, Loader2, Trash2, MoreHorizontal, Search, CheckCheck, FileText, Printer, Eye, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, orderBy, query, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import type { CoaLedger, JournalVoucher, Party, CoaNature, PartyType } from '@/lib/types';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useRole } from '../../_components/role-provider';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';


interface JournalEntryRow {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
}

interface BalanceEntry {
    name: string;
    id: string;
    balance: number;
    type: 'Receivable' | 'Payable';
    dueDate?: string;
}

const numberToWords = (num: number): string => {
    if (num === 0) return "Zero";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    
    const number = parseFloat(num.toFixed(2));
    if (isNaN(number)) return '';

    const [integerPart, decimalPart] = number.toString().split('.');
    
    let words = '';
    if (integerPart.length > 3) {
      words += ones[parseInt(integerPart.slice(0, -3), 10)] + ' thousand ';
    }
    const lastThree = parseInt(integerPart.slice(-3), 10);
    if (lastThree >= 100) {
      words += ones[Math.floor(lastThree / 100)] + ' hundred ';
    }
    const lastTwo = lastThree % 100;
    if (lastTwo >= 20) {
      words += tens[Math.floor(lastTwo / 20)] + ' ' + ones[lastTwo % 10];
    } else if (lastTwo > 0) {
      words += tens[lastTwo];
    }

    let finalString = words.trim() + ' rupees';
    if (decimalPart && parseInt(decimalPart) > 0) {
        finalString += ' and ' + (tens[Math.floor(parseInt(decimalPart) / 10)] + ' ' + ones[parseInt(decimalPart) % 10]).trim() + ' paise';
    }
    
    return finalString.charAt(0).toUpperCase() + finalString.slice(1) + ' only.';
};

const formatIndianCurrency = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

function TransactionsPageContent() {
    const { toast } = useToast();
    const { currentRole } = useRole();
    const router = useRouter();
    const firestore = useFirestore();
    const { user } = useUser();
    
    const { data: settingsData, loading: settingsLoading } = useDoc<any>(doc(firestore, 'company', 'info'));
    const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
    const { data: journalVouchers, loading: vouchersLoading } = useCollection<JournalVoucher>(query(collection(firestore, 'journalVouchers'), orderBy('createdAt', 'desc')));
    const { data: parties, loading: partiesLoading } = useCollection<Party>(collection(firestore, 'parties'));
    
    const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
    const [narration, setNarration] = React.useState('');
    const [amount, setAmount] = React.useState('');
    const [activeTab, setActiveTab] = React.useState('journal');
    
    const [partyId, setPartyId] = React.useState('');
    const [paymentRef, setPaymentRef] = React.useState('');
    const [bankAccountId, setBankAccountId] = React.useState('');
    
    const [expenseLedgerId, setExpenseLedgerId] = React.useState('');
    const [paidFromLedgerId, setPaidFromLedgerId] = React.useState('');
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    
    const [editingJv, setEditingJv] = React.useState<JournalVoucher | null>(null);
    const [viewingJv, setViewingJv] = React.useState<JournalVoucher | null>(null);
    const [deletingJv, setDeletingJv] = React.useState<JournalVoucher | null>(null);

    const [jvDate, setJvDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
    const [jvNarration, setJvNarration] = React.useState('');
    const [journalEntries, setJournalEntries] = React.useState<JournalEntryRow[]>([
        { id: `row-${Date.now()}-1`, accountId: '', debit: '', credit: '' },
        { id: `row-${Date.now()}-2`, accountId: '', debit: '', credit: '' },
    ]);

    const [searchTerm, setSearchTerm] = React.useState('');
    const [startDate, setStartDate] = React.useState('');
    const [endDate, setEndDate] = React.useState('');

    const [isCameraOpen, setIsCameraOpen] = React.useState(false);
    const [hasCameraPermission] = React.useState<boolean | undefined>(undefined);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    
    // PDF Print state
    const [isPrinting, setIsPrinting] = React.useState(false);
    const [voucherToPrint, setVoucherToPrint] = React.useState<any>(null);
    const pdfRef = React.useRef<HTMLDivElement>(null);

    const expenseAccounts = React.useMemo(() => coaLedgers?.filter(l => l.nature === 'EXPENSE') || [], [coaLedgers]);
    const paymentAccounts = React.useMemo(() => coaLedgers?.filter(l => l.nature === 'ASSET' && (l.type === 'CASH' || l.type === 'BANK')) || [], [coaLedgers]);
    const customers = React.useMemo(() => parties?.filter(p => p.type === 'Customer') || [], [parties]);
    const suppliers = React.useMemo(() => parties?.filter(p => p.type === 'Supplier' || p.type === 'Vendor') || [], [parties]);
    
    const isDataReady = !settingsLoading && !!settingsData && !vouchersLoading && !!journalVouchers && !ledgersLoading && !!coaLedgers && !partiesLoading && !!parties;

    const liveBalances = React.useMemo(() => {
        const balances = new Map<string, number>();
        if (!coaLedgers || !journalVouchers) return balances;

        coaLedgers.forEach(acc => {
            const openingBal = acc.openingBalance?.amount || 0;
            const balance = acc.openingBalance?.drCr === 'CR' ? -openingBal : openingBal;
            balances.set(acc.id, balance);
        });

        if (journalVouchers) {
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
        }
        return balances;
    }, [coaLedgers, journalVouchers]);


    const { receivables, payables } = React.useMemo(() => {
        const ar: BalanceEntry[] = [];
        const ap: BalanceEntry[] = [];

        liveBalances.forEach((balance, accountId) => {
            const account = coaLedgers?.find(l => l.id === accountId);
            if (!account || Math.abs(balance) < 0.01) return;

            if (balance > 0 && account.nature === 'ASSET') {
                 ar.push({ id: account.id, name: account.name, balance, type: 'Receivable' });
            } 
            else if (balance > 0 && account.nature === 'LIABILITY') {
                 ar.push({ id: account.id, name: account.name, balance, type: 'Receivable' });
            }
            else if (balance < 0 && account.nature === 'LIABILITY') {
                 ap.push({ id: account.id, name: account.name, balance: Math.abs(balance), type: 'Payable' });
            }
        });
        return { receivables: ar, payables: ap };
    }, [coaLedgers, liveBalances]);


    const resetForms = () => {
        setDate(format(new Date(), 'yyyy-MM-dd'));
        setNarration('');
        setAmount('');
        setPartyId('');
        setPaymentRef('');
        setBankAccountId('');
        setExpenseLedgerId('');
        setPaidFromLedgerId('');
        setJvDate(format(new Date(), 'yyyy-MM-dd'));
        setJvNarration('');
        setJournalEntries([
            { id: `row-${Date.now()}-1`, accountId: '', debit: '', credit: '' },
            { id: `row-${Date.now()}-2`, accountId: '', debit: '', credit: '' },
        ]);
        setEditingJv(null);
    };
    
    const jvTotals = React.useMemo(() => {
        return journalEntries.reduce((acc, entry) => {
            acc.debit += Number(entry.debit) || 0;
            acc.credit += Number(entry.credit) || 0;
            return acc;
        }, { debit: 0, credit: 0 });
    }, [journalEntries]);

    const handleJvEntryChange = (index: number, field: keyof JournalEntryRow, value: string) => {
        const newEntries = [...journalEntries];
        newEntries[index] = { ...newEntries[index], [field]: value };
        if (field === 'debit' && value) newEntries[index].credit = '';
        if (field === 'credit' && value) newEntries[index].debit = '';
        setJournalEntries(newEntries);
    };

    const addJvRow = () => {
        setJournalEntries(prev => [...prev, { id: `row-${Date.now()}`, accountId: '', debit: '', credit: '' }]);
    };

    const removeJvRow = (index: number) => {
        if (journalEntries.length > 2) {
            setJournalEntries(prev => prev.filter((_, i) => i !== index));
        }
    };
    
    const handleJvSave = async () => {
        if (jvTotals.debit !== jvTotals.credit || jvTotals.debit === 0) {
            toast({ variant: 'destructive', title: 'Invalid Entry', description: 'Total debits must equal total credits.' });
            return;
        }
        if (!jvNarration) {
            toast({ variant: 'destructive', title: 'Narration Required' });
            return;
        }

        const finalEntries = journalEntries.filter(e => Number(e.debit) > 0 || Number(e.credit) > 0);
        const journalVoucherData = {
            date: jvDate,
            narration: jvNarration,
            voucherType: 'Journal Voucher',
            entries: finalEntries.map(e => ({
                accountId: e.accountId,
                debit: Number(e.debit) || 0,
                credit: Number(e.credit) || 0,
            })),
            createdAt: serverTimestamp(),
        };

        if (editingJv) {
            const jvRef = doc(firestore, 'journalVouchers', editingJv.id);
            updateDoc(jvRef, { ...journalVoucherData, createdAt: editingJv.createdAt }).then(() => {
                toast({ title: 'Journal Voucher Updated' });
                resetForms();
            });
        } else {
            const jvRef = doc(collection(firestore, 'journalVouchers'));
            setDoc(jvRef, { ...journalVoucherData, id: jvRef.id }).then(() => {
                toast({ title: 'Journal Voucher Saved' });
                resetForms();
            });
        }
    };
    
    const handleEditJv = (jv: JournalVoucher) => {
        setEditingJv(jv);
        setActiveTab('journal');
        setJvDate(jv.date);
        setJvNarration(jv.narration);
        setJournalEntries(jv.entries.map((e, i) => ({
            id: `row-${jv.id}-${i}`,
            accountId: e.accountId,
            debit: e.debit && e.debit > 0 ? String(e.debit) : '',
            credit: e.credit && e.credit > 0 ? String(e.credit) : '',
        })));
        window.scrollTo(0, 0);
    };

    const handleDeleteJv = async () => {
        if (!deletingJv) return;
        try {
            await deleteDoc(doc(firestore, 'journalVouchers', deletingJv.id));
            toast({ title: 'Deleted', description: 'Journal voucher permanently removed.' });
            setDeletingJv(null);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Delete Failed' });
        }
    };


    const getOrCreatePartyLedger = async (party: Party): Promise<CoaLedger> => {
        if (!coaLedgers) throw new Error("COA not loaded.");
        if (party.coaLedgerId) {
            const existing = coaLedgers.find(l => l.id === party.coaLedgerId);
            if (existing) return existing;
        }

        const existingByName = coaLedgers.find(l => l.name === party.name);
        if (existingByName) {
            await updateDoc(doc(firestore, 'parties', party.id), { coaLedgerId: existingByName.id });
            return existingByName;
        }
        
        const newLedgerData: Omit<CoaLedger, 'id' | 'createdAt' | 'updatedAt'> = {
            name: party.name,
            groupId: party.type === 'Customer' ? '1.1.2' : '2.1.1', // Trade Receivables or Trade Payables
            nature: (party.type === 'Customer' ? 'ASSET' : 'LIABILITY') as CoaNature,
            type: party.type === 'Customer' ? 'RECEIVABLE' : 'PAYABLE',
            posting: { isPosting: true, normalBalance: party.type === 'Customer' ? 'DEBIT' : 'CREDIT', isSystem: false, allowManualJournal: true },
            status: 'ACTIVE',
        };

        const newLedgerRef = await addDoc(collection(firestore, 'coa_ledgers'), newLedgerData);
        await updateDoc(doc(firestore, 'parties', party.id), { coaLedgerId: newLedgerRef.id });

        return { id: newLedgerRef.id, ...newLedgerData } as CoaLedger;
    };


    const handleTransactionSave = async (type: 'pay' | 'receive' | 'expense') => {
        const transAmt = Number(amount);
        if (!transAmt || transAmt <= 0 || !narration) {
            toast({ variant: 'destructive', title: 'Missing Information' });
            return;
        }
       
        let journalVoucherData: any;
        const jvRef = doc(collection(firestore, 'journalVouchers'));

        try {
            if (type === 'expense') {
                if (!expenseLedgerId || !paidFromLedgerId || !partyId) return;
                journalVoucherData = {
                    id: jvRef.id, date, narration, partyId, voucherType: 'Payment Voucher', entries: [
                        { accountId: expenseLedgerId, debit: transAmt, credit: 0 },
                        { accountId: paidFromLedgerId, debit: 0, credit: transAmt },
                    ], createdAt: serverTimestamp()
                };
            } else { 
                const selParty = parties?.find(p => p.id === partyId);
                if (!selParty || !bankAccountId) return;
                const partyLedger = await getOrCreatePartyLedger(selParty);

                if (type === 'receive') {
                    journalVoucherData = {
                       id: jvRef.id, date, narration, voucherType: 'Receipt Voucher', entries: [
                            { accountId: bankAccountId, debit: transAmt, credit: 0 },
                            { accountId: partyLedger.id, debit: 0, credit: transAmt },
                        ], createdAt: serverTimestamp()
                    };
                } else {
                    journalVoucherData = {
                       id: jvRef.id, date, narration, voucherType: 'Payment Voucher', entries: [
                            { accountId: partyLedger.id, debit: transAmt, credit: 0 },
                            { accountId: bankAccountId, debit: 0, credit: transAmt },
                        ], createdAt: serverTimestamp()
                    };
                }
            }
            
            await setDoc(jvRef, journalVoucherData);
            prepareAndPrintVoucher(journalVoucherData.voucherType, jvRef.id);
            resetForms();

        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
        }
    };
    
    const prepareAndPrintVoucher = (type: string, jvId: string) => {
        if (!partyId || !amount) return;
    
        const partyDetails = parties?.find(p => p.id === partyId);
        const accountDetails = coaLedgers?.find(l => l.id === (bankAccountId || paidFromLedgerId));
    
        setVoucherToPrint({
            id: jvId,
            type,
            date,
            narration,
            amount: Number(amount),
            partyName: partyDetails?.name,
            partyAddress: (partyDetails?.address as any)?.line1,
            paymentMode: accountDetails?.name,
            refNo: paymentRef
        });
    };
    
    const handlePrint = async () => {
        const element = pdfRef.current;
        if (!element || !voucherToPrint) return; 
        
        setIsPrinting(true);
        try {
            const canvas = await html2canvas(element, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = imgWidth / imgHeight;
            let imgPdfWidth = pdfWidth;
            let imgPdfHeight = pdfWidth / ratio;
            if (imgPdfHeight > pdfHeight) {
                imgPdfHeight = pdfHeight;
                imgPdfWidth = pdfHeight * ratio;
            }
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgPdfHeight);
            pdf.save(`${voucherToPrint.type}-Voucher-${voucherToPrint.id}.pdf`);
            
            toast({ title: 'Voucher Saved', description: `${voucherToPrint.type} generated.`});
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Print Failed' });
        } finally {
            setIsPrinting(false);
            setVoucherToPrint(null);
        }
    };

    React.useEffect(() => {
        if (voucherToPrint !== null && !isPrinting) {
            handlePrint();
        }
    }, [voucherToPrint, isPrinting]);


    const getAccountName = (accountId: string) => {
        const ledger = coaLedgers?.find(l => l.id === accountId);
        if (ledger) return ledger.name;
        const party = parties?.find(p => p.coaLedgerId === accountId);
        if (party) return party.name;
        return accountId;
    };
    
    const renderAccountOption = (acc: CoaLedger) => (
        <SelectItem key={acc.id} value={acc.id}>
          <div className="flex justify-between w-full">
            <span>{acc.name}</span>
            <span className="text-muted-foreground font-mono ml-4">₹{(liveBalances.get(acc.id) || 0).toFixed(2)}</span>
          </div>
        </SelectItem>
    );

    const filteredJournalVouchers = React.useMemo(() => {
        if (!journalVouchers) return [];
        return journalVouchers.filter(jv => {
            const narrationMatch = jv.narration.toLowerCase().includes(searchTerm.toLowerCase());
            const accountMatch = jv.entries.some(e => getAccountName(e.accountId).toLowerCase().includes(searchTerm.toLowerCase()));
            const dateVal = new Date(jv.date);
            const sDate = startDate ? new Date(startDate) : null;
            const eDate = endDate ? new Date(endDate) : null;

            if (sDate) sDate.setHours(0,0,0,0);
            if (eDate) eDate.setHours(23,59,59,999);

            if (sDate && dateVal < sDate) return false;
            if (eDate && dateVal > eDate) return false;
            
            return searchTerm === '' || narrationMatch || accountMatch;
        })
    }, [journalVouchers, searchTerm, startDate, endDate, coaLedgers]);


    return (
        <>
            <PageHeader title="Transactions" />

            <Card>
                <CardHeader>
                    <CardTitle>Transact</CardTitle>
                    <CardDescription>Day-to-day financial entries.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="journal">Journal Voucher</TabsTrigger>
                            <TabsTrigger value="expense">Record Expense</TabsTrigger>
                            <TabsTrigger value="receive">Receive Payment</TabsTrigger>
                            <TabsTrigger value="pay">Make Payment</TabsTrigger>
                        </TabsList>

                        <TabsContent value="journal" className="mt-6">
                            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleJvSave(); }}>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                      <Label>Date</Label>
                                      <Input type="date" value={jvDate} onChange={e => setJvDate(e.target.value)} />
                                  </div>
                                   <div className="space-y-2">
                                      <Label>Narration</Label>
                                      <Input placeholder="Narration" value={jvNarration} onChange={e => setJvNarration(e.target.value)} />
                                  </div>
                               </div>
                                <div className="space-y-2">
                                    {journalEntries.map((entry, index) => (
                                        <div key={entry.id} className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <Select value={entry.accountId} onValueChange={value => handleJvEntryChange(index, 'accountId', value)}>
                                                    <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                                                    <SelectContent>
                                                        {coaLedgers?.map(ledger => <SelectItem key={ledger.id} value={ledger.id}>{ledger.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-32">
                                                <Input type="number" placeholder="Debit" value={entry.debit} onChange={e => handleJvEntryChange(index, 'debit', e.target.value)} />
                                            </div>
                                            <div className="w-32">
                                                <Input type="number" placeholder="Credit" value={entry.credit} onChange={e => handleJvEntryChange(index, 'credit', e.target.value)} />
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeJvRow(index)} disabled={journalEntries.length <= 2}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={addJvRow}><PlusCircle className="mr-2 h-4 w-4" /> Add Row</Button>
                                <div className="flex justify-end gap-8 font-semibold">
                                    <div>Total Dr: ₹{jvTotals.debit.toFixed(2)}</div>
                                    <div>Total Cr: ₹{jvTotals.credit.toFixed(2)}</div>
                                </div>
                                <Button type="submit" disabled={!isDataReady}>Save Voucher</Button>
                            </form>
                        </TabsContent>
                        
                        <TabsContent value="expense" className="mt-6">
                            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleTransactionSave('expense'); }}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                                    <div className="space-y-2"><Label>Amount</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                                </div>
                                 <div className="space-y-2">
                                    <Label>Paid To</Label>
                                    <Select value={partyId} onValueChange={setPartyId}>
                                        <SelectTrigger><SelectValue placeholder="Select Party" /></SelectTrigger>
                                        <SelectContent>{suppliers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Expense Ledger (Debit)</Label>
                                    <Select value={expenseLedgerId} onValueChange={setExpenseLedgerId}>
                                        <SelectTrigger><SelectValue placeholder="Select Expense" /></SelectTrigger>
                                        <SelectContent>{expenseAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Paid From (Credit)</Label>
                                    <Select value={paidFromLedgerId} onValueChange={setPaidFromLedgerId}>
                                        <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                                        <SelectContent>{paymentAccounts.map(renderAccountOption)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Narration</Label>
                                    <Textarea value={narration} onChange={e => setNarration(e.target.value)} />
                                </div>
                                <Button type="submit" disabled={!isDataReady}>Save Expense</Button>
                            </form>
                        </TabsContent>

                         <TabsContent value="receive" className="mt-6">
                            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleTransactionSave('receive'); }}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                                    <div className="space-y-2"><Label>Amount</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                                </div>
                                <div className="space-y-2">
                                    <Label>From Customer</Label>
                                    <Select value={partyId} onValueChange={setPartyId}>
                                        <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                                        <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>To Account (Debit)</Label>
                                    <Select value={bankAccountId} onValueChange={setBankAccountId}>
                                        <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                                        <SelectContent>{paymentAccounts.map(renderAccountOption)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Narration</Label>
                                    <Textarea value={narration} onChange={e => setNarration(e.target.value)} />
                                </div>
                                <Button type="submit" disabled={!isDataReady}>Save Receipt</Button>
                            </form>
                        </TabsContent>

                        <TabsContent value="pay" className="mt-6">
                           <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleTransactionSave('pay'); }}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                                    <div className="space-y-2"><Label>Amount</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                                </div>
                                <div className="space-y-2">
                                    <Label>To Supplier</Label>
                                    <Select value={partyId} onValueChange={setPartyId}>
                                        <SelectTrigger><SelectValue placeholder="Select Party" /></SelectTrigger>
                                        <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>From Account (Credit)</Label>
                                    <Select value={bankAccountId} onValueChange={setBankAccountId}>
                                        <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                                        <SelectContent>{paymentAccounts.map(renderAccountOption)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Narration</Label>
                                    <Textarea value={narration} onChange={e => setNarration(e.target.value)} />
                                </div>
                                <Button type="submit" disabled={!isDataReady}>Save Payment</Button>
                            </form>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <Card className="mt-6">
                <CardHeader><CardTitle>Receivables &amp; Payables</CardTitle></CardHeader>
                <CardContent>
                    <Tabs defaultValue="receivable">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="receivable">Receivables</TabsTrigger>
                            <TabsTrigger value="payable">Payables</TabsTrigger>
                        </TabsList>
                        <TabsContent value="receivable" className="mt-4">
                            <Table>
                                <TableHeader><TableRow><TableHead>Party</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {receivables.map(item => (
                                        <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell className="text-right">₹{item.balance.toFixed(2)}</TableCell></TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TabsContent>
                        <TabsContent value="payable" className="mt-4">
                            <Table>
                                <TableHeader><TableRow><TableHead>Party</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                                <TableBody>
                                     {payables.map(item => (
                                        <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell className="text-right">₹{item.balance.toFixed(2)}</TableCell></TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <Card className="mt-6">
                <CardHeader><CardTitle>Recent Vouchers</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex gap-4 mb-4">
                        <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Voucher No.</TableHead>
                                <TableHead>Narration</TableHead>
                                <TableHead>Ledger/Party</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {filteredJournalVouchers.map((jv, index) => {
                         const mainEntry = jv.entries.find(e => e.debit && e.debit > 0);
                         const amt = mainEntry?.debit || jv.entries[0]?.credit || 0;
                         const displayId = (jv as any).voucherNumber || jv.id;

                         return (
                             <TableRow key={`${jv.id}-${index}`}>
                                    <TableCell>{format(new Date(jv.date), 'dd/MM/yy')}</TableCell>
                                    <TableCell className="font-mono text-xs font-bold text-blue-600">
                                        {displayId}
                                    </TableCell>
                                    <TableCell>{jv.narration}</TableCell>
                                    <TableCell>
                                        {getAccountName(mainEntry?.accountId || '')}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {formatIndianCurrency(amt)}
                                    </TableCell>
                                     <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => setViewingJv(jv)}><Eye className="mr-2 h-4 w-4"/> View</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleEditJv(jv)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setVoucherToPrint({...jv, amount: amt})}><Printer className="mr-2 h-4 w-4"/> Print PDF</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem
                                                        onSelect={(e) => {
                                                            e.preventDefault();
                                                            setDeletingJv(jv);
                                                        }}
                                                        className="text-red-500 focus:text-red-600"
                                                        >
                                                        Delete
                                                        </DropdownMenuItem>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>This will permanently delete the voucher "{jv.narration}".</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleDeleteJv} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={!!viewingJv} onOpenChange={(open) => !open && setViewingJv(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Voucher Details</DialogTitle>
                        <DialogDescription>Voucher No: {(viewingJv as any)?.voucherNumber || viewingJv?.id}</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p><strong>Date:</strong> {viewingJv ? format(new Date(viewingJv.date), 'PPP') : ''}</p>
                        <p><strong>Narration:</strong> {viewingJv?.narration}</p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account</TableHead>
                                    <TableHead className="text-right">Debit</TableHead>
                                    <TableHead className="text-right">Credit</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {viewingJv?.entries.map((entry, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{getAccountName(entry.accountId)}</TableCell>
                                        <TableCell className="text-right">{entry.debit ? formatIndianCurrency(entry.debit) : '-'}</TableCell>
                                        <TableCell className="text-right">{entry.credit ? formatIndianCurrency(entry.credit) : '-'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>
            
            <AlertDialog open={!!deletingJv} onOpenChange={(open) => !open && setDeletingJv(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the voucher "{deletingJv?.narration}".</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteJv} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
                <div ref={pdfRef} className="w-[210mm] bg-white text-slate-900 p-8 font-sans" style={{ minHeight: '297mm', display: 'flex', flexDirection: 'column' }}>
                {voucherToPrint && (
                    <>
                    <header className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-8">
                        <div>
                        {settingsData?.logo && <Image src={settingsData.logo} alt="Logo" width={150} height={40} crossOrigin="anonymous" />}
                        <h1 className="text-2xl font-bold mt-2">{settingsData?.companyName}</h1>
                        </div>
                        <div className="text-right">
                        <h2 className="text-xl font-bold uppercase">{voucherToPrint.type}</h2>
                        <p><strong>Voucher No:</strong> {voucherToPrint.id}</p>
                        <p><strong>Date:</strong> {format(new Date(voucherToPrint.date), 'dd MMMM, yyyy')}</p>
                        </div>
                    </header>
                    <div className="my-8">
                        <p><strong>Party:</strong> <span className="font-semibold ml-2">{voucherToPrint.partyName}</span></p>
                        <p><strong>Narration:</strong> <span className="ml-2">{voucherToPrint.narration}</span></p>
                    </div>
                    <div className="my-8 flex justify-between items-center bg-gray-100 p-4 rounded-md">
                        <p className="font-bold">Amount:</p>
                        <p className="text-xl font-bold">{formatIndianCurrency(voucherToPrint.amount)}</p>
                    </div>
                    <p><strong>Words:</strong> {numberToWords(voucherToPrint.amount)}</p>
                    <footer className="mt-auto pt-20 grid grid-cols-2 gap-8 text-center text-xs">
                        <div><div className="border-t border-slate-900 pt-2 mt-8">Receiver Signature</div></div>
                        <div><div className="border-t border-slate-900 pt-2 mt-8">Authorized Signatory</div></div>
                    </footer>
                    </>
                )}
                </div>
            </div>
        </>
    );
}

export default function TransactionsPageWrapper() {
    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => { setIsClient(true); }, []);
    if (!isClient) return <PageHeader title="Transactions" />;
    return <TransactionsPageContent />;
}

    
    