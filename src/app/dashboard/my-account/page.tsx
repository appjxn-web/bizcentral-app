
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
import { CircleDollarSign, ArrowUpCircle, ArrowDownCircle, Download, Loader2, Wallet, Users, Handshake, ShoppingCart, TrendingUp, TrendingDown, FileUp } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { useUser, useFirestore, useDoc, useCollection } from '@/firebase';
import { collection, query, where, doc, getDoc, Timestamp, orderBy, addDoc, updateDoc } from 'firebase/firestore';
import type { JournalVoucher, CoaLedger, UserProfile, Party, Referral, Order, SalesInvoice, PaymentSubmission, CoaNature, PartyType } from '@/lib/types';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '@/hooks/use-toast';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRole } from '../_components/role-provider';


const companyDetails = {
  name: 'JXN Infra Equipment Private Limited',
  address: {
    line1: '123 Biz Street, Business City, 12345',
    line2: ''
  },
  logo: 'https://placehold.co/150x50/eee/ccc.png?text=Your+Logo',
};

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const numberToWords = (num: number): string => {
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const number = parseFloat(num.toFixed(2));
    if (isNaN(number)) return '';
    if (number === 0) return 'zero rupees only.';

    const integerPart = Math.floor(number);
    const decimalPart = Math.round((number - integerPart) * 100);

    const numToWords = (n: number): string => {
        let str = '';
        if (n >= 10000000) {
            str += numToWords(Math.floor(n / 10000000)) + ' crore ';
            n %= 10000000;
        }
        if (n >= 100000) {
            str += numToWords(Math.floor(n / 100000)) + ' lakh ';
            n %= 100000;
        }
        if (n >= 1000) {
            str += numToWords(Math.floor(n / 1000)) + ' thousand ';
            n %= 1000;
        }
        if (n >= 100) {
            str += a[Math.floor(n / 100)] + ' hundred ';
            n %= 100;
        }
        if (n > 19) {
            str += b[Math.floor(n / 20)] + (a[n % 10] ? ' ' + a[n % 10] : '');
        } else if (n > 0) {
            str += a[n];
        }
        return str.trim();
    };

    let words = numToWords(integerPart);
    if (!words) words = "zero";
    let finalString = words.charAt(0).toUpperCase() + words.slice(1) + ' Rupees';
    if (decimalPart > 0) {
        finalString += ' and ' + numToWords(decimalPart) + ' Paise';
    }
    
    return finalString + ' Only.';
};

function PayBalanceDialog({ order, companyInfo, balance }: { order: Order; companyInfo: any; balance: number }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { currentRole } = useRole();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const proofInputRef = React.useRef<HTMLInputElement>(null);

  const [amountToPay, setAmountToPay] = React.useState<number | ''>(balance > 0 ? balance : '');
  const [transactionId, setTransactionId] = React.useState('');
  const [paymentProofFile, setPaymentProofFile] = React.useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = React.useState<string | null>(null);

  const [manualPaymentMethod, setManualPaymentMethod] = React.useState('Cash');
  const [receivingAccountId, setReceivingAccountId] = React.useState('');

  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const bankAndCashAccounts = React.useMemo(() => coaLedgers?.filter(l => l.groupId === '1.1.1') || [], [coaLedgers]);
  const canRecordManualPayment = ['Admin', 'Manager', 'Sales Manager', 'Accounts Manager', 'Partner', 'CEO'].includes(currentRole);

  const dynamicUpiString = React.useMemo(() => {
    if (!companyInfo?.primaryUpiId || !amountToPay || amountToPay <= 0) return '';
    const orderNumber = (order as SalesOrder).orderNumber || order.id;
    return `upi://pay?pa=${companyInfo.primaryUpiId}&pn=${encodeURIComponent(companyInfo.companyName || 'Your Company')}&am=${Number(amountToPay).toFixed(2)}&cu=INR&tn=Order%20${orderNumber}`;
  }, [companyInfo, amountToPay, order]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPaymentProofFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentProofPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (paymentType: 'upi' | 'manual') => {
    if (!user || !amountToPay || amountToPay <= 0) {
      toast({ variant: 'destructive', title: 'Missing Amount', description: 'Please enter a valid amount.' });
      return;
    }
    if (paymentType === 'upi' && !transactionId) {
      toast({ variant: 'destructive', title: 'Missing Transaction ID', description: 'Please enter the UPI transaction ID.' });
      return;
    }
    if (paymentType === 'manual' && !receivingAccountId) {
        toast({ variant: 'destructive', title: 'Missing Account', description: 'Please select the receiving account.' });
        return;
    }

    setIsSubmitting(true);
    try {
      const submissionData: Omit<PaymentSubmission, 'id'> = {
        userId: user.uid,
        customerName: order.customerName,
        orderId: order.id,
        assignedToUid: order.assignedToUid || null,
        amount: Number(amountToPay),
        paymentMethod: paymentType === 'upi' ? 'UPI / Online' : manualPaymentMethod,
        transactionDetails: transactionId,
        proofUrl: '',
        status: 'Pending',
        submittedAt: Timestamp.now(),
      };

      const newSubmissionRef = await addDoc(collection(firestore, 'paymentSubmissions'), submissionData);

      if (paymentProofFile) {
        const storage = getStorage();
        const proofStorageRef = ref(storage, `payment_proofs/${user.uid}/${order.id}/${newSubmissionRef.id}-${paymentProofFile.name}`);
        const snapshot = await uploadBytes(proofStorageRef, paymentProofFile);
        const proofUrl = await getDownloadURL(snapshot.ref);
        await updateDoc(newSubmissionRef, { proofUrl: proofUrl });
      }

      await updateDoc(doc(firestore, 'orders', order.id), { status: 'Awaiting Payment Confirmation' });

      toast({ title: 'Payment Proof Submitted', description: 'An accounts manager will verify your payment shortly.' });

      setAmountToPay('');
      setTransactionId('');
      setPaymentProofFile(null);
      setPaymentProofPreview(null);
      setManualPaymentMethod('Cash');
      setReceivingAccountId('');

    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Submission Failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <DollarSign className="mr-2 h-4 w-4" /> Pay Balance
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay Balance for Order: {(order as SalesOrder).orderNumber || order.id}</DialogTitle>
          <DialogDescription>
            You can pay the full amount of <span className="font-bold">{formatIndianCurrency(balance)}</span> or make a partial payment.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="customer-payment" className="w-full">
            <TabsList className={cn("grid w-full", canRecordManualPayment ? "grid-cols-2" : "grid-cols-1")}>
                <TabsTrigger value="customer-payment">Customer UPI Payment</TabsTrigger>
                {canRecordManualPayment && <TabsTrigger value="manual-payment">Record Manual Payment</TabsTrigger>}
            </TabsList>
            <TabsContent value="customer-payment">
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pay-amount-upi">Amount to Pay (Max: {formatIndianCurrency(balance)})</Label>
                    <Input id="pay-amount-upi" type="number" value={amountToPay} onChange={(e) => setAmountToPay(Number(e.target.value))} placeholder={`Max: ${balance.toFixed(2)}`} />
                  </div>
                  {dynamicUpiString && (
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2 bg-white rounded-lg border"><QRCodeSVG value={dynamicUpiString} size={150} /></div>
                      <p className="text-sm font-bold">Paying: {formatIndianCurrency(Number(amountToPay))}</p>
                      <p className="text-xs text-muted-foreground text-center">Scan with any UPI app to pay.</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="transaction-id-upi">Transaction ID / Ref No.</Label>
                    <Input id="transaction-id-upi" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Enter UPI Ref ID after payment" />
                  </div>
                   <div className="space-y-2">
                        <Label>Upload Screenshot (Optional)</Label>
                        <Input type="file" ref={proofInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                        <Button type="button" variant="outline" className="w-full" onClick={() => proofInputRef.current?.click()}>
                            <FileUp className="h-4 w-4 mr-2" /> Upload Image
                        </Button>
                        {paymentProofPreview && <img src={paymentProofPreview} alt="Proof preview" className="mt-2 rounded-md border max-h-40" />}
                    </div>
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose>
                    <Button type="button" onClick={() => handleSubmit('upi')} disabled={isSubmitting || !amountToPay || !transactionId}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Payment Made
                    </Button>
                </DialogFooter>
            </TabsContent>
            {canRecordManualPayment && (
                <TabsContent value="manual-payment">
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="pay-amount-manual">Amount Received</Label>
                            <Input id="pay-amount-manual" type="number" value={amountToPay} onChange={(e) => setAmountToPay(Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payment-method-manual">Payment Method</Label>
                            <Select value={manualPaymentMethod} onValueChange={setManualPaymentMethod}>
                                <SelectTrigger id="payment-method-manual"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Cash">Cash</SelectItem>
                                    <SelectItem value="Cheque">Cheque</SelectItem>
                                    <SelectItem value="Card">Card</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="receiving-account">Received In</Label>
                            <Select value={receivingAccountId} onValueChange={setReceivingAccountId}>
                                <SelectTrigger id="receiving-account"><SelectValue placeholder="Select bank/cash account" /></SelectTrigger>
                                <SelectContent>
                                    {bankAndCashAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="transaction-id-manual">Transaction Reference</Label>
                            <Input id="transaction-id-manual" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="e.g., Cheque No., Receipt No." />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose>
                        <Button type="button" onClick={() => handleSubmit('manual')} disabled={isSubmitting || !amountToPay || !receivingAccountId}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Record Payment
                        </Button>
                    </DialogFooter>
                </TabsContent>
            )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MyAccountPageContent() {
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { user: authUser } = useUser();
  const userIdFromParams = searchParams.get('userId');
  const partyId = searchParams.get('partyId');
  const [accountHolder, setAccountHolder] = React.useState<UserProfile | Party | null>(null);
  
  // Determine the target ID for fetching data
  const targetId = userIdFromParams || partyId || authUser?.uid;

  // Fetch data based on type (user or party)
  const userDocRef = userIdFromParams || authUser?.uid ? doc(firestore, 'users', userIdFromParams || authUser!.uid) : null;
  const partyDocRef = partyId ? doc(firestore, 'parties', partyId) : null;
  const { data: userData, loading: userLoading } = useDoc<UserProfile>(userDocRef);
  const { data: partyData, loading: partyLoading } = useDoc<Party>(partyDocRef);
  
  const [userLedgerId, setUserLedgerId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (partyId && partyData) {
      setAccountHolder(partyData);
      setUserLedgerId(partyData.coaLedgerId || null);
    } else if ((userIdFromParams || authUser?.uid) && userData) {
      setAccountHolder(userData);
      setUserLedgerId((userData as any).coaLedgerId || null);
    }
  }, [partyId, userIdFromParams, authUser, userData, partyData]);

  const userLedgerRef = userLedgerId ? doc(firestore, 'coa_ledgers', userLedgerId) : null;
  const { data: userLedger, loading: ledgerLoading } = useDoc<CoaLedger>(userLedgerRef);
  
  const { data: allJournalVouchers, loading: vouchersLoading } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));
  
  const salesInvoicesQuery = targetId ? query(
      collection(firestore, 'salesInvoices'),
      where('customerId', '==', targetId)
  ) : null;
  const { data: salesInvoices, loading: invoicesLoading } = useCollection<SalesInvoice>(salesInvoicesQuery);
  
  const referralsQuery = targetId ? query(collection(firestore, 'users', targetId, 'referrals')) : null;
  const { data: referrals } = useCollection<Referral>(referralsQuery);
  
  const ordersQuery = targetId ? query(collection(firestore, 'orders'), where('userId', '==', targetId)) : null;
  const { data: orders } = useCollection<Order>(ordersQuery);

  const pdfRef = React.useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);

  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const { ledger, kpis } = React.useMemo(() => {
    const defaultKpis = { balance: 0, totalCredit: 0, totalDebit: 0 };
    if (!userLedger || (!allJournalVouchers && !salesInvoices)) return { ledger: [], kpis: defaultKpis };

    const openingBalance = userLedger.openingBalance?.amount || 0;
    
    const jvTransactions = (allJournalVouchers || [])
      .filter(jv => jv.entries.some(e => e.accountId === userLedger.id))
      .map(jv => {
        const entry = jv.entries.find(e => e.accountId === userLedger.id)!;
        return {
          id: jv.id,
          date: jv.date,
          createdAt: jv.createdAt,
          description: jv.narration,
          debit: entry.debit || 0,
          credit: entry.credit || 0,
        };
      });

    const invoiceTransactions = (salesInvoices || []).map(inv => ({
        id: inv.id,
        date: inv.date,
        createdAt: new Timestamp(new Date(inv.date).getTime() / 1000, 0), // Fallback createdAt
        description: `Sales Invoice #${inv.invoiceNumber}`,
        debit: inv.grandTotal,
        credit: 0
    }));

    const allTransactions = [...jvTransactions, ...invoiceTransactions].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.date);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.date);
        return dateA.getTime() - dateB.getTime();
    });
    
    let runningBalance = openingBalance;
    const processedLedger = allTransactions.map(tx => {
      runningBalance += tx.debit - tx.credit;
      return { ...tx, balance: runningBalance };
    });

    const totalCredit = allTransactions.reduce((sum, tx) => sum + tx.credit, 0);
    const totalDebit = allTransactions.reduce((sum, tx) => sum + tx.debit, 0);

    return {
      ledger: processedLedger.reverse(),
      kpis: { balance: runningBalance, totalCredit, totalDebit },
    };
  }, [userLedger, allJournalVouchers, salesInvoices]);
  
  const earningsKpis = React.useMemo(() => {
    if (!referrals) return { totalEarnings: 0, totalWithdrawn: 0 };
    
    const totalEarnings = referrals.reduce((acc, r) => {
        let referralEarning = 0;
        if (['Signed Up', 'First Purchased', 'Completed'].includes(r.status)) {
            referralEarning += r.earnings || 0;
        }
        if (['First Purchased', 'Completed'].includes(r.status)) {
            referralEarning += r.commission || 0;
        }
        return acc + referralEarning;
    }, 0);
    
    const pendingEarnings = referrals.reduce((acc, r) => {
        if (r.status === 'First Purchased') {
            return acc + (r.earnings || 0) + (r.commission || 0);
        }
        return acc;
    }, 0);

    const commissionPayable = (accountHolder as UserProfile)?.commissionPayable || 0;
    const totalWithdrawn = totalEarnings - pendingEarnings - commissionPayable;

    return { totalEarnings, totalWithdrawn };
  }, [referrals, accountHolder]);
  
   const filteredLedger = React.useMemo(() => {
    return ledger.filter(tx => {
        const txDate = new Date(tx.date);
        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo) : null;

        if (fromDate && txDate < fromDate) return false;
        if (toDate && txDate > toDate) return false;
        
        return true;
    });
  }, [ledger, dateFrom, dateTo]);


  const handleDownloadPdf = async () => {
    const element = pdfRef.current;
    if (!element) return;
    setIsDownloading(true);
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
    pdf.save(`Ledger-${accountHolder?.name}.pdf`);
    setIsDownloading(false);
  };
  
    if (userLoading || partyLoading || vouchersLoading || ledgerLoading || invoicesLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
  
    if (!accountHolder) {
        return <PageHeader title="User or Party not found" />;
    }
    if (!userLedger) {
         return (
            <>
                <PageHeader title={`Account: ${accountHolder.name}`} />
                <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                        No accounting ledger found for this user/party. Transactions will appear here once they are recorded.
                    </CardContent>
                </Card>
            </>
         )
    }

  return (
    <>
      <PageHeader title="My Account">
          <Button onClick={handleDownloadPdf} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
      </PageHeader>
      
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
              <div className="text-2xl font-bold">{orders?.length || 0}</div>
          </CardContent>
          </Card>
          <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
              <div className="text-2xl font-bold">{formatIndianCurrency((accountHolder as UserProfile)?.walletBalance || 0)}</div>
          </CardContent>
          </Card>
          <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Commission Payable</CardTitle>
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
              <div className="text-2xl font-bold">{formatIndianCurrency((accountHolder as UserProfile)?.commissionPayable || 0)}</div>
          </CardContent>
          </Card>
           <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
              <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
              <div className="text-2xl font-bold">{referrals?.length || 0}</div>
          </CardContent>
          </Card>
           <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
              <div className="text-2xl font-bold">{formatIndianCurrency(earningsKpis.totalEarnings)}</div>
          </CardContent>
          </Card>
           <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Withdrawn</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
              <div className="text-2xl font-bold">{formatIndianCurrency(earningsKpis.totalWithdrawn)}</div>
          </CardContent>
          </Card>
      </div>

      <Card>
          <CardHeader>
          <CardTitle>Account Ledger</CardTitle>
          <CardDescription>
              A detailed statement of all your financial transactions.
          </CardDescription>
          </CardHeader>
          <CardContent>
              <div className="flex flex-wrap items-end gap-4 mb-4 p-4 border rounded-lg bg-muted/50 no-print">
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

            {!userLedger ? (
                <div className="text-center py-12 text-muted-foreground">
                    No accounting ledger found. Transactions will appear here once they are recorded.
                </div>
            ) : (
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
                    {filteredLedger.length > 0 ? (
                        <>
                            <TableRow>
                            <TableCell colSpan={4}>Opening Balance</TableCell>
                            <TableCell className="text-right font-mono">{formatIndianCurrency(userLedger.openingBalance?.amount || 0)}</TableCell>
                            </TableRow>
                            {filteredLedger.map((tx) => (
                                <TableRow key={tx.id}>
                                <TableCell>{format(new Date(tx.date), 'PPP')}</TableCell>
                                <TableCell className="font-medium">{tx.description}</TableCell>
                                <TableCell className="text-right font-mono text-red-600">
                                    {tx.debit ? formatIndianCurrency(tx.debit) : '-'}
                                </TableCell>
                                <TableCell className="text-right font-mono text-green-600">
                                    {tx.credit ? formatIndianCurrency(tx.credit) : '-'}
                                </TableCell>
                                <TableCell className="text-right font-mono">{formatIndianCurrency(tx.balance)}</TableCell>
                                </TableRow>
                            ))}
                        </>
                    ) : (
                        <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                            No transactions found for the selected filters.
                        </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                    <TableFooter>
                        <TableRow>
                            <TableCell colSpan={2} className="text-right font-bold">Closing Balance</TableCell>
                            <TableCell className="text-right font-bold font-mono">{formatIndianCurrency(filteredLedger.reduce((sum, tx) => sum + (tx.debit || 0), 0))}</TableCell>
                            <TableCell className="text-right font-bold font-mono">{formatIndianCurrency(filteredLedger.reduce((sum, tx) => sum + (tx.credit || 0), 0))}</TableCell>
                            <TableCell className="text-right font-bold font-mono">{formatIndianCurrency(kpis.balance)}</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            )}
          </CardContent>
      </Card>

      {/* Hidden printable area */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
        <div className="max-w-4xl mx-auto p-8 bg-background" ref={pdfRef}>
          <header className="flex justify-between items-start border-b pb-4">
            <div>
              <Image src={companyDetails.logo} alt="Company Logo" width={150} height={50} className="object-contain" />
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-bold text-primary">{companyDetails.name}</h1>
              <p className="text-sm text-muted-foreground">{companyDetails.address.line1}, {companyDetails.address.city}</p>
            </div>
          </header>
          <section className="my-6">
            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold">Statement For:</h3>
                <p className="font-bold">{accountHolder?.name}</p>
                <p>{(accountHolder as Party).address?.line1}</p>
                <p>{accountHolder?.email}</p>
              </div>
              <div className="text-right">
                <p><strong>Statement Date:</strong> {format(new Date(), 'dd/MM/yyyy')}</p>
                {(dateFrom || dateTo) && (
                    <p>
                        <strong>Period:</strong>
                        {dateFrom ? ` ${format(new Date(dateFrom), 'dd/MM/yy')}` : ' Beginning'} -
                        {dateTo ? ` ${format(new Date(dateTo), 'dd/MM/yy')}` : ' Today'}
                    </p>
                )}
              </div>
            </div>
          </section>
          {userLedger && (
            <section>
                <Table>
                    <TableHeader>
                    <TableRow className="bg-muted">
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit (Dr.)</TableHead>
                        <TableHead className="text-right">Credit (Cr.)</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    <TableRow>
                        <TableCell colSpan={4}>Opening Balance</TableCell>
                        <TableCell className="text-right font-mono">{formatIndianCurrency(userLedger.openingBalance?.amount || 0)}</TableCell>
                    </TableRow>
                    {ledger.slice().reverse().map((tx) => (
                        <TableRow key={tx.id}>
                        <TableCell>{format(new Date(tx.date), 'PPP')}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">{tx.debit ? formatIndianCurrency(tx.debit) : '-'}</TableCell>
                        <TableCell className="text-right font-mono text-green-600">{tx.credit ? formatIndianCurrency(tx.credit) : '-'}</TableCell>
                        <TableCell className="text-right font-mono">{formatIndianCurrency(tx.balance)}</TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                    <TableFooter>
                    <TableRow className="bg-muted font-bold">
                        <TableCell colSpan={4} className="text-right">Closing Balance</TableCell>
                        <TableCell className="text-right font-mono">{formatIndianCurrency(kpis.balance)}</TableCell>
                    </TableRow>
                    </TableFooter>
                </Table>
            </section>
          )}
          <footer className="text-center text-xs text-muted-foreground pt-16">
            <p>This is a computer-generated statement.</p>
            <p>{companyDetails.name} | {(accountHolder as Party)?.address?.line1}, {(accountHolder as Party)?.address?.city}</p>
          </footer>
        </div>
      </div>
    </>
  );
}

export default function MyAccountPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return (
             <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return <MyAccountPageContent />;
}
