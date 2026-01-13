

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
  Ticket,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus, UserProfile, UserRole, WorkOrder, PickupPoint, SalesOrder, RefundRequest, SalesInvoice, Party, CompanyInfo, PaymentSubmission, CoaLedger, JournalVoucher } from '@/lib/types';
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
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


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
      const submissionData: Partial<PaymentSubmission> = {
        userId: order.userId, 
        recordedByUid: user.uid, 
        customerName: order.customerName,
        orderId: order.id,
        assignedToUid: order.assignedToUid || null,
        amount: Number(amountToPay),
        paymentMethod: paymentType === 'upi' ? 'UPI / Online' : manualPaymentMethod,
        transactionDetails: transactionId,
        proofUrl: '',
        status: 'Pending',
        submittedAt: Timestamp.now(),
        ...(paymentType === 'manual' && { receivingAccountId: receivingAccountId }),
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
    const { data: partner, loading } = useDoc<UserProfile>(userId ? doc(firestore, 'users', userId) : null);
    
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

    const customerPartyRef = React.useMemo(() => {
        if(!order.userId || !firestore) return null;
        return doc(firestore, 'parties', order.userId);
    }, [order.userId, firestore]);
    const { data: customerParty } = useDoc<Party>(customerPartyRef);
    
    const paymentSubmissionsQuery = React.useMemo(() => {
      if (!order.id || !user?.uid || !firestore) return null;
      const submissionsRef = collection(firestore, 'paymentSubmissions');
    
      if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(currentRole)) {
        return query(submissionsRef, where('orderId', '==', order.id), orderBy('submittedAt', 'desc'));
      }
    
      const securityField = currentRole === 'Partner' ? 'assignedToUid' : 'userId';
      return query(
        submissionsRef,
        where('orderId', '==', order.id),
        where(securityField, '==', user.uid),
        orderBy('submittedAt', 'desc')
      );
    }, [order.id, user?.uid, currentRole, firestore]);

    const { data: paymentSubmissions } = useCollection<PaymentSubmission>(paymentSubmissionsQuery);
    
    const { totalPaid, balanceDue, paymentHistory } = React.useMemo(() => {
        const approvedPayments = (paymentSubmissions || [])
            .filter(p => p.status === 'Approved');

        const totalPaidAmount = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
        
        const history = (paymentSubmissions || []).map(p => ({
            amount: p.amount,
            date: p.submittedAt.toDate(),
            details: `Ref: ${p.transactionDetails || 'N/A'} (${p.paymentMethod}) - ${p.status}`,
        })).sort((a,b) => a.date.getTime() - b.date.getTime());

        return {
            totalPaid: totalPaidAmount,
            balanceDue: order.grandTotal - totalPaidAmount,
            paymentHistory: history,
        }
    }, [order.grandTotal, paymentSubmissions]);


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
      'Ordered': balanceDue <= 0 ? ['Ready for Dispatch'] : [],
      'Ready for Dispatch': ['Shipped'],
      'Invoice Sent': ['Shipped'],
      'Shipped': ['Delivered'],
      'Manufacturing': ['Ready for Dispatch'],
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
                                    {(paymentHistory as any[]).map((p, i) => (
                                        <p key={i} className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                                            {format(p.date, 'dd/MM/yy')}: {formatIndianCurrency(p.amount)} - {p.details}
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
                                    <PayBalanceDialog order={{...order, balance: balanceDue}} companyInfo={companyInfo} balance={balanceDue}/>
                                )}
                                {canCancel && (
                                    <Button variant="destructive" size="sm" onClick={() => setIsCancelDialogOpen(true)}>
                                        <XCircle className="mr-2 h-4 w-4" />
                                        Request Cancellation
                                    </Button>
                                )}
                                {existingInvoice ? (
                                  <>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/dashboard/sales/invoice/view?id=${existingInvoice.invoiceNumber}`}>
                                        <Receipt className="mr-2 h-4 w-4" />
                                        View Invoice
                                        </Link>
                                    </Button>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/dashboard/sales/orders/gate-pass?id=${order.orderNumber}`}>
                                            <Ticket className="mr-2 h-4 w-4" />
                                            Generate Gate Pass
                                        </Link>
                                    </Button>
                                  </>
                                ) : balanceDue <= 0 && ['Ordered', 'Ready for Dispatch'].includes(order.status) && ['Admin', 'Partner'].includes(currentRole) && (
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
      
      // Default to customer view
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
  
      // Default to customer view
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
      <PageHeader title="Sales Orders" />
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All orders in the system</p>
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
                    <h3 className="text-xl font-medium">No orders found</h3>
                    <p className="text-muted-foreground">No orders match the current criteria.</p>
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

    
