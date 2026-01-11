
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
import { CircleDollarSign, ArrowUpCircle, ArrowDownCircle, Download, Loader2, Wallet, Users, Handshake, ShoppingCart, TrendingUp, TrendingDown } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { useUser, useFirestore, useDoc, useCollection } from '@/firebase';
import { collection, query, where, doc, getDoc, Timestamp, orderBy } from 'firebase/firestore';
import type { JournalVoucher, CoaLedger, UserProfile, Party, Referral, Order, SalesInvoice } from '@/lib/types';


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

    
```
    </content>
  </change>
  <change>
    <file>src/app/dashboard/sales/orders/page.tsx</file>
    <content><![CDATA[
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  MoreHorizontal,
  PlusCircle,
  ChevronDown,
  ChevronRight,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Building,
  User as UserIcon,
  Phone,
  MapPin,
  ListFilter,
  DollarSign,
  RefreshCcw,
  Receipt,
  FileUp,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus, UserProfile, UserRole, WorkOrder, PickupPoint, SalesOrder, RefundRequest, SalesInvoice, Party, CompanyInfo, PaymentSubmission } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, query, orderBy, doc, where, or, updateDoc, writeBatch, serverTimestamp, addDoc, Timestamp, getDoc } from 'firebase/firestore';
import { OrderStatusTracker } from '../../my-orders/_components/order-status';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger
} from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { Input } from '@/components/ui/input';
import { useRole } from '@/app/dashboard/_components/role-provider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2 } from 'lucide-react';

function getStatusBadgeVariant(status: Order['status'] | 'Refund Pending' | 'Refund Complete' | SalesInvoice['status']) {
  const variants: Record<string, string> = {
    Delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'Refund Complete': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Shipped: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    'Invoice Sent': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Ordered: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Refund Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Work Complete': 'bg-yellow-100 text-yellow-800',
    Manufacturing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    'Ready for Dispatch': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    'Awaiting Payment': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    'Awaiting Payment Confirmation': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    Unpaid: 'bg-orange-100 text-orange-800',
    Overdue: 'bg-red-100 text-red-800',
    Canceled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    'Cancellation Requested': 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
  };
  return variants[status];
}

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
};

function PayBalanceDialog({ order, companyInfo }: { order: Order; companyInfo: any; }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const proofInputRef = React.useRef<HTMLInputElement>(null);

  const [amountToPay, setAmountToPay] = React.useState<number | ''>((order.balance || 0) > 0 ? order.balance || 0 : '');
  const [transactionId, setTransactionId] = React.useState('');
  const [paymentProofFile, setPaymentProofFile] = React.useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = React.useState<string | null>(null);
  
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

  const handleSubmit = async () => {
    if (!user || !amountToPay || amountToPay <= 0 || !transactionId) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please enter a valid amount and transaction ID.' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const submissionData: Omit<PaymentSubmission, 'id'|'orderNumber'> = {
        userId: user.uid,
        customerName: order.customerName,
        orderId: order.id,
        amount: Number(amountToPay),
        paymentMethod: 'UPI / Online',
        transactionDetails: transactionId,
        proofUrl: '',
        status: 'Pending',
        submittedAt: Timestamp.now(),
      };
      
      const newSubmissionRef = await addDoc(collection(firestore, 'paymentSubmissions'), submissionData);

      if (paymentProofFile) {
        const storage = useStorage();
        const proofStorageRef = ref(storage, `payment_proofs/${user.uid}/${order.id}/${newSubmissionRef.id}-${paymentProofFile.name}`);
        const snapshot = await uploadBytes(proofStorageRef, paymentProofFile);
        const proofUrl = await getDownloadURL(snapshot.ref);
        await updateDoc(newSubmissionRef, { proofUrl: proofUrl });
      }

      await updateDoc(doc(firestore, 'orders', order.id), { status: 'Awaiting Payment Confirmation' });
      
      toast({ title: 'Payment Proof Submitted', description: 'An accounts manager will verify your payment shortly.' });

      setAmountToPay(0);
      setTransactionId('');
      setPaymentProofFile(null);
      setPaymentProofPreview(null);
      
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Submission Failed' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!order.balance || order.balance <= 0) return null;

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
            You can pay the full amount of <span className="font-bold">{formatIndianCurrency(order.balance)}</span> or make a partial payment.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount to Pay (Max: {formatIndianCurrency(order.balance)})</Label>
            <Input
              id="pay-amount"
              type="number"
              value={amountToPay}
              onChange={(e) => setAmountToPay(Number(e.target.value))}
              placeholder={`Max: ${order.balance.toFixed(2)}`}
            />
          </div>
          {dynamicUpiString && (
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 bg-white rounded-lg border">
                <QRCodeSVG value={dynamicUpiString} size={150} />
              </div>
              <p className="text-sm font-bold">Paying: {formatIndianCurrency(Number(amountToPay))}</p>
              <p className="text-xs text-muted-foreground text-center">Scan with any UPI app to pay.</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="transaction-id">Transaction ID / Ref No.</Label>
            <Input id="transaction-id" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Enter UPI Ref ID after payment" />
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
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !amountToPay || !transactionId}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Payment Made
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelOrderDialog({ order, onConfirm, open, onOpenChange }: { order: Order; onConfirm: (reason: string, details?: string) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = React.useState('');
  const [otherDetails, setOtherDetails] = React.useState('');

  const handleSubmit = () => {
    if (!reason) {
      alert('Please select a reason.');
      return;
    }
    onConfirm(reason, otherDetails);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Cancellation for Order: {(order as SalesOrder).orderNumber || order.id}</DialogTitle>
          <DialogDescription>
            Please let us know why you are canceling this order. An admin will review and approve your request.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancellation-reason">Reason for Cancellation</Label>
            <Select onValueChange={setReason} value={reason}>
              <SelectTrigger id="cancellation-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ordered by mistake">Ordered by mistake</SelectItem>
                <SelectItem value="Item no longer needed">Item no longer needed</SelectItem>
                <SelectItem value="Found a better price elsewhere">Found a better price elsewhere</SelectItem>
                <SelectItem value="Delivery time is too long">Delivery time is too long</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reason === 'Other' && (
            <div className="space-y-2">
              <Label htmlFor="other-details">Please specify</Label>
              <Textarea
                id="other-details"
                value={otherDetails}
                onChange={(e) => setOtherDetails(e.target.value)}
                placeholder="Please provide more details..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Go Back</Button></DialogClose>
          <Button variant="destructive" onClick={handleSubmit} disabled={!reason}>Request Cancellation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function PartnerPickupDetails({ userId }: { userId: string }) {
    const firestore = useFirestore();
    const [partner, setPartner] = React.useState<UserProfile | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        };
        
        const fetchPartner = async () => {
            try {
                const docSnap = await getDoc(doc(firestore, 'users', userId));
                if (docSnap.exists()) {
                    setPartner(docSnap.data() as UserProfile);
                }
            } catch (e) {
                console.error("Error loading partner:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchPartner();
    }, [userId, firestore]);

    if (loading) return <p className="text-sm text-muted-foreground">Loading partner details...</p>;
    if (!partner) return <p className="text-sm text-destructive">Could not load partner details.</p>;
    
    const address = (partner.addresses || [])[0];
    const addressString = address ? [address.line1, address.line2, address.city, address.state, address.pin].filter(Boolean).join(', ') : 'Address not available';
    
    let mapUrl = addressString ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressString)}` : '';
    if (address?.latitude && address?.longitude) {
        mapUrl = `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`;
    }

    return (
        <>
            <p className="font-medium">{partner.businessName || partner.name}</p>
            <p className="text-xs text-muted-foreground">Partner</p>
            {addressString && <p className="mt-2 text-sm">{addressString}</p>}
            <div className="flex gap-4 mt-2">
                {partner.mobile && <a href={`tel:${partner.mobile}`} className="flex items-center gap-1 text-primary hover:underline text-sm"><Phone className="mr-2 h-4 w-4" /> Call</a>}
                {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm"><MapPin className="h-4 w-4" /> Get Directions</a>}
            </div>
        </>
    );
}

function CompanyPickupDetails() {
  const { data: companyInfo, loading } = useDoc<any>(doc(useFirestore(), 'company', 'info'));
  if (loading) return <p className="text-sm text-muted-foreground">Loading details...</p>;
  if (!companyInfo) return <p className="text-sm text-destructive">Could not load company details.</p>;

  const mainAddress = companyInfo.addresses?.find((a: any) => a.type === 'Main Office' || a.type === 'Registered Office') || companyInfo.addresses?.[0];

  if (!mainAddress) return <p className="text-sm text-destructive">Main company address not found.</p>;
  
  const addressString = [mainAddress.line1, mainAddress.line2, mainAddress.city, mainAddress.state, mainAddress.pin].filter(Boolean).join(', ');
  const phone = mainAddress.pickupContactPhone || companyInfo.contactNumber;
  let mapUrl = addressString ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressString)}` : '';
  if (mainAddress.latitude && mainAddress.longitude) {
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${mainAddress.latitude},${mainAddress.longitude}`;
  }
  
  return (
      <>
          <p className="font-medium">{mainAddress.pickupContactName || companyInfo.companyName}</p>
          <p className="text-xs text-muted-foreground">Main Office / Factory</p>
          {addressString && <p className="mt-2 text-sm">{addressString}</p>}
          <div className="flex gap-4 mt-2">
              {phone && <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary hover:underline text-sm"><Phone className="h-4 w-4" /> Call</a>}
              {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm"><MapPin className="h-4 w-4" /> Get Directions</a>}
          </div>
      </>
  );
}

function OrderCard({ order, allSalesInvoices, onStatusChange }: { order: Order, allSalesInvoices: SalesInvoice[] | null, onStatusChange: (order: Order, newStatus: OrderStatus) => void }) {
    const { user } = useUser();
    const router = useRouter();
    const { currentRole } = useRole();
    const [isOpen, setIsOpen] = React.useState(false);
    const firestore = useFirestore();
    const { data: companyInfo } = useDoc(doc(firestore, 'company', 'info'));
    const [isCancelDialogOpen, setIsCancelDialogOpen] = React.useState(false);
    const { toast } = useToast();
    const userProfileRef = user ? doc(firestore, 'users', user.uid) : null;
    const { data: userProfile } = useDoc<UserProfile>(userProfileRef);

    const paymentSubmissionsQuery = React.useMemo(() => {
      if (!order.id) return null;
      return query(collection(firestore, 'paymentSubmissions'), where('orderId', '==', order.id));
    }, [order.id, firestore]);
    const { data: paymentSubmissions } = useCollection<PaymentSubmission>(paymentSubmissionsQuery);
    
    const { totalPaid, balanceDue, paymentHistory } = React.useMemo(() => {
        const initialPayment = {
            amount: order.paymentReceived || 0,
            date: order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.date),
            details: order.paymentDetails || 'Initial Payment',
            status: 'Approved'
        };

        const otherPayments = (paymentSubmissions || []).map(p => ({
            amount: p.amount,
            date: p.submittedAt.toDate(),
            details: p.transactionDetails || `Via ${p.paymentMethod}`,
            status: p.status,
        }));
        
        const allPayments = [initialPayment, ...otherPayments].filter(p => p.amount > 0);

        const approvedPayments = allPayments.filter(p => p.status === 'Approved');
        const totalPaid = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
        const balance = order.grandTotal - totalPaid;

        return {
            totalPaid,
            balanceDue: balance,
            paymentHistory: allPayments
        }
    }, [order, paymentSubmissions]);

    const refundQuery = order.status === 'Canceled' && user
      ? query(collection(firestore, 'refundRequests'), where('customerId', '==', user.uid), where('orderId', '==', order.id))
      : null;
    const { data: refundRequests } = useCollection<RefundRequest>(refundQuery);
    const refundRequest = refundRequests?.[0];

    const existingInvoice = allSalesInvoices?.find(inv => inv.orderNumber === (order as SalesOrder).orderNumber);

    const canCancel = order.status === 'Ordered' || order.status === 'Manufacturing';
    
    let displayStatus: OrderStatus | 'Refund Pending' | 'Refund Complete' = order.status;
    let statusBadgeText = displayStatus;

    if (order.status === 'Canceled') {
        if (refundRequest?.status === 'Pending') {
            displayStatus = 'Refund Pending';
            statusBadgeText = 'Refund Pending';
        } else if (refundRequest?.status === 'Paid') {
            displayStatus = 'Refund Complete';
            statusBadgeText = 'Refund Complete';
        } else {
            statusBadgeText = 'Canceled';
        }
    }


    const handleConfirmCancellation = async (reason: string, details?: string) => {
        if (!user) return; 

        try {
            const orderRef = doc(firestore, 'orders', order.id);
            const updateData = {
                status: 'Cancellation Requested' as OrderStatus,
                cancellationReason: `${reason}${details ? `: ${details}` : ''}`,
            };
            
            await updateDoc(orderRef, updateData);

            toast({
                title: 'Cancellation Requested',
                description: `Your request to cancel order #${(order as SalesOrder).orderNumber || order.id} has been submitted for approval.`,
            });
            setIsCancelDialogOpen(false);
        } catch (error) {
            console.error("Error requesting order cancellation:", error);
            toast({
                variant: 'destructive',
                title: 'Cancellation Failed',
                description: 'There was an error while trying to submit your cancellation request.',
            });
        }
    };
    
    const canChangeStatus = ['Admin', 'Partner', 'Sales Manager', 'CEO'].includes(currentRole);
    
    const nextStatusOptions: Record<OrderStatus, OrderStatus[]> = {
      'Awaiting Payment': ['Ordered', 'Canceled'],
      'Awaiting Payment Confirmation': ['Ordered', 'Canceled'],
      'Ordered': ['Manufacturing', 'Ready for Dispatch', 'Shipped'],
      'Ready for Dispatch': balanceDue <= 0 ? ['Invoice Sent', 'Shipped'] : [],
      'Invoice Sent': balanceDue <= 0 ? ['Shipped', 'Delivered'] : [],
      'Shipped': balanceDue <= 0 ? ['Delivered'] : [],
      'Manufacturing': ['Ready for Dispatch', 'Shipped'],
      'Delivered': [],
      'Canceled': [],
      'Cancellation Requested': ['Ordered', 'Canceled'],
    };
    
    const availableStatuses = nextStatusOptions[order.status] || [];
    
    return (
      <>
        <Collapsible asChild key={order.id} open={isOpen} onOpenChange={setIsOpen}>
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between gap-2">
                        <div>
                            <CardTitle>Order ID: {(order as SalesOrder).orderNumber || order.id}</CardTitle>
                            <CardDescription>
                                Placed on {format(new Date(order.date), 'PPP')}
                            </CardDescription>
                        </div>
                        <Badge
                            className={cn('text-sm w-fit h-fit', getStatusBadgeVariant(displayStatus))}
                            variant="outline"
                        >
                            {statusBadgeText}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <OrderStatusTracker 
                        currentStatus={order.status}
                        canChangeStatus={canChangeStatus}
                        availableNextStatuses={availableStatuses}
                        onStatusChange={(newStatus) => onStatusChange(order, newStatus)}
                    />
                    <CollapsibleTrigger asChild>
                         <Button variant="outline" size="sm" className="w-full">
                            {isOpen ? 'Hide' : 'Show'} Order Details <ChevronDown className={cn("h-4 w-4 ml-2 transition-transform", isOpen && "rotate-180")} />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-6">
                      <div className="space-y-2">
                        {order.items.map(item => (
                            <div key={item.productId} className="flex items-center justify-between py-2 border-b">
                                <div className="flex items-center gap-4">
                                    <Image src={`https://picsum.photos/seed/${item.productId}/64/64`} alt={item.name} width={64} height={64} className="rounded-md object-cover" />
                                    <div>
                                        <p className="font-medium">{item.name}</p>
                                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                                    </div>
                                </div>
                                <p className="font-medium">{formatIndianCurrency(item.price * item.quantity)}</p>
                            </div>
                        ))}
                      </div>

                      <Separator />

                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h4 className="font-semibold">Payment Summary</h4>
                            <div className="text-sm space-y-2 text-muted-foreground">
                                <div className="flex justify-between"><span>Subtotal:</span> <span className="font-mono">{formatIndianCurrency(order.subtotal)}</span></div>
                                <div className="flex justify-between"><span>Discount:</span> <span className="font-mono">{formatIndianCurrency(order.discount)}</span></div>
                                <div className="flex justify-between"><span>Taxes (CGST+SGST):</span> <span className="font-mono">{formatIndianCurrency(order.cgst + order.sgst)}</span></div>
                                <div className="flex justify-between font-bold text-foreground"><span>Grand Total:</span> <span className="font-mono">{formatIndianCurrency(order.grandTotal)}</span></div>
                                <Separator/>
                                <div className="flex justify-between font-medium text-green-600"><span>Paid:</span> <span className="font-mono">{formatIndianCurrency(totalPaid)}</span></div>
                                {displayStatus !== 'Refund Complete' && (
                                <div className="flex justify-between font-bold text-red-600"><span>Balance Due:</span> <span className="font-mono">{formatIndianCurrency(balanceDue)}</span></div>
                                )}
                            </div>
                            {paymentHistory && paymentHistory.length > 0 && !refundRequest && (
                                <div>
                                    <p className="text-xs font-semibold">Payment History:</p>
                                    {paymentHistory.map((p, i) => (
                                        <p key={i} className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                                            {format(p.date, 'dd/MM/yy')}: ₹{p.amount.toFixed(2)} - {p.details} ({p.status})
                                        </p>
                                    ))}
                                </div>
                            )}
                             {refundRequest && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-800">
                                    <p className="text-xs font-semibold">Refund Details:</p>
                                    {refundRequest.status === 'Paid' && refundRequest.transactionDate ? (
                                        <div className="text-xs text-muted-foreground font-mono">
                                            <p>Amount: {formatIndianCurrency(refundRequest.refundAmount)}</p>
                                            <p>Ref: {refundRequest.transactionRef}</p>
                                            <p>Date: {format(new Date(refundRequest.transactionDate), 'PPP')}</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Your refund of {formatIndianCurrency(refundRequest.refundAmount)} is being processed.</p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <h4 className="font-semibold">Pickup Details</h4>
                             <div className="p-3 rounded-md border bg-background">
                                {order.assignedToUid && order.pickupPointId !== 'company-main' ? (
                                    <PartnerPickupDetails userId={order.assignedToUid} />
                                ) : (
                                    <CompanyPickupDetails />
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {balanceDue > 0 && userProfile && (
                                    <PayBalanceDialog order={{...order, balance: balanceDue}} companyInfo={companyInfo} />
                                )}
                                {canCancel && (
                                    <Button variant="destructive" size="sm" onClick={() => setIsCancelDialogOpen(true)}>
                                        <XCircle className="mr-2 h-4 w-4" />
                                        Request Cancellation
                                    </Button>
                                )}
                                {existingInvoice ? (
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href={`/dashboard/sales/invoice/view?id=${existingInvoice.invoiceNumber}`}>
                                      <Receipt className="mr-2 h-4 w-4" />
                                      View Invoice
                                    </Link>
                                  </Button>
                                ) : (order.status === 'Ready for Dispatch' || order.status === 'Shipped') && ['Admin', 'Accounts Manager', 'Sales Manager'].includes(currentRole) && (
                                     <Button size="sm" onClick={() => {
                                         localStorage.setItem('invoiceDataToCreate', JSON.stringify(order));
                                         router.push('/dashboard/sales/create-invoice');
                                     }}>
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Generate Invoice
                                    </Button>
                                )}
                            </div>
                        </div>
                      </div>

                    </CollapsibleContent>
                </CardContent>
            </Card>
        </Collapsible>
        <CancelOrderDialog
          order={order}
          open={isCancelDialogOpen}
          onOpenChange={setIsCancelDialogOpen}
          onConfirm={handleConfirmCancellation}
        />
      </>
    )
}

function OrdersPageContent() {
    const router = useRouter();
    const firestore = useFirestore();
    const { toast } = useToast();
    const { user } = useUser();
    const { currentRole } = useRole();
    
    const ordersQuery = React.useMemo(() => {
        if (!user?.uid || !currentRole) return null;
        const ordersRef = collection(firestore, 'orders');

        if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(currentRole)) {
            return query(ordersRef, orderBy('date', 'desc'));
        }

        if (currentRole === 'Partner') {
            return query(ordersRef, where('assignedToUid', '==', user.uid), orderBy('date', 'desc'));
        }
        
        return query(ordersRef, where('userId', '==', user.uid), orderBy('date', 'desc'));
    }, [user?.uid, currentRole, firestore]);
    
    const invoicesQuery = React.useMemo(() => {
        if (!user?.uid || !currentRole) return null;
        const invoicesRef = collection(firestore, 'salesInvoices');
    
        if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(currentRole)) {
            return query(invoicesRef, orderBy('date', 'desc'));
        }
    
        if (currentRole === 'Partner') {
            return query(invoicesRef, where('assignedToUid', '==', user.uid), orderBy('date', 'desc'));
        }
    
        return query(invoicesRef, where('customerId', '==', user.uid), orderBy('date', 'desc'));
    }, [user?.uid, currentRole, firestore]);


    const { data: orders, loading: ordersLoading } = useCollection<Order>(ordersQuery);
    const { data: allSalesInvoices, loading: invoicesLoading } = useCollection<SalesInvoice>(invoicesQuery);


    const kpis = React.useMemo(() => {
        if (!orders) return { total: 0, inProcess: 0, shipped: 0, delivered: 0 };
        
        const total = orders.length;
        const inProcess = orders.filter(o => ['Ordered', 'Manufacturing', 'Ready for Dispatch', 'Awaiting Payment', 'Awaiting Payment Confirmation', 'Cancellation Requested'].includes(o.status)).length;
        const shipped = orders.filter(o => o.status === 'Shipped').length;
        const delivered = orders.filter(o => o.status === 'Delivered').length;

        return { total, inProcess, shipped, delivered };
    }, [orders]);
    
    const handleStatusChange = async (order: Order, newStatus: OrderStatus) => {
        try {
            const batch = writeBatch(firestore);
            const orderRef = doc(firestore, 'orders', order.id);
            batch.update(orderRef, { status: newStatus });
            
            const notificationRef = doc(collection(firestore, 'users', order.userId, 'notifications'));
            const orderNumber = (order as SalesOrder).orderNumber || order.id;

            const notificationData = {
                type: 'info',
                title: 'Order Status Updated',
                description: `Your order #${orderNumber} has been updated to "${newStatus}".`,
                timestamp: serverTimestamp(),
                read: false,
            };
            batch.set(notificationRef, notificationData);

            await batch.commit();

            toast({
                title: 'Status Updated',
                description: `Order status changed to "${newStatus}" and customer notified.`,
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: 'Could not update order status.',
            });
        }
    };


    const loading = ordersLoading || invoicesLoading;

  return (
    <>
      <PageHeader title="Sales Orders">
        <Button onClick={() => router.push('/dashboard/sales/create-order')}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create Sales Order
        </Button>
      </PageHeader>
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All visible orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Dispatch</CardTitle>
            <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inProcess}</div>
            <p className="text-xs text-muted-foreground">Orders being processed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shipped</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.shipped}</div>
            <p className="text-xs text-muted-foreground">Orders on their way</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.delivered}</div>
            <p className="text-xs text-muted-foreground">Successfully delivered orders</p>
          </CardContent>
        </Card>
      </div>
      
       <div className="space-y-4">
        {loading ? (
           <Card><CardContent className="p-12 text-center">Loading your orders...</CardContent></Card>
        ) : orders && orders.length > 0 ? (
            orders.map((order) => (
                <OrderCard key={order.id} order={order} allSalesInvoices={allSalesInvoices} onStatusChange={handleStatusChange} />
            ))
        ) : (
            <Card>
                <CardContent className="p-12 text-center">
                    <h3 className="text-xl font-medium">No orders yet</h3>
                    <p className="text-muted-foreground">You haven't placed any orders yet. Start shopping to see your orders here.</p>
                </CardContent>
            </Card>
        )}
      </div>
    </>
  );
}


export default function OrdersPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <OrdersPageContent />;
}

    

    