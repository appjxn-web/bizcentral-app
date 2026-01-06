

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
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoreHorizontal, CircleDollarSign, Hourglass, CheckCircle, ListFilter, Send, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, doc, updateDoc, writeBatch, serverTimestamp, addDoc, query, where, increment } from 'firebase/firestore';
import type { ReimbursementRequest, CoaLedger, Party, Grn, AdvanceRequest, PurchaseRequest, RefundRequest, SalaryAdvanceRequest, UserProfile } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Badge } from '@/components/ui/badge';


type PaymentRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Paid';

const allStatuses: ReimbursementRequest['status'][] = ['Pending Approval', 'Approved', 'Rejected', 'Paid'];

function getStatusBadgeVariant(status: string) {
  const variants: Record<string, string> = {
    'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Pending Approval': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Approved': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    'Rejected': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    'Paid': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
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

export default function ReimbursementProcessPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const { data: reimbursements, loading: reimbursementsLoading } = useCollection<ReimbursementRequest>(collection(firestore, 'reimbursementRequests'));
  const { data: salaryAdvances, loading: salaryAdvancesLoading } = useCollection<SalaryAdvanceRequest>(collection(firestore, 'salaryAdvanceRequests'));
  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const { data: grnsData, loading: grnsLoading } = useCollection<Grn>(query(collection(firestore, 'grns'), where('paymentStatus', '==', 'Approved')));
  const { data: advanceRequestsData, loading: advancesLoading } = useCollection<AdvanceRequest>(query(collection(firestore, 'advanceRequests'), where('status', '==', 'Approved')));
  const { data: refundRequests, loading: refundsLoading } = useCollection<RefundRequest>(query(collection(firestore, 'refundRequests'), where('status', '==', 'Pending')));
  
  const { data: journalVouchers, loading: vouchersLoading } = useCollection<any>(collection(firestore, 'journalVouchers'));
  const { data: parties } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: users } = useCollection<UserProfile>(collection(firestore, 'users'));

  const [statusFilters, setStatusFilters] = React.useState<ReimbursementRequest['status'][]>([]);
  const [paymentDialog, setPaymentDialog] = React.useState<{ isOpen: boolean; request: any | null; partyBalance?: number }>({ isOpen: false, request: null });
  
  const [paymentDate, setPaymentDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMode, setPaymentMode] = React.useState('');
  const [paymentRef, setPaymentRef] = React.useState('');
  const [paymentAccountId, setPaymentAccountId] = React.useState('');
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [isProcessingPayment, setIsProcessingPayment] = React.useState(false);


  const filteredReimbursements = React.useMemo(() => {
    if (!reimbursements) return [];
    if (statusFilters.length === 0) return reimbursements;
    return reimbursements.filter(request => statusFilters.includes(request.status));
  }, [reimbursements, statusFilters]);

  const kpis = React.useMemo(() => {
    if (!reimbursements) return { pendingAmount: 0, approvedAmount: 0, paidAmount: 0 };
    const pendingAmount = reimbursements.filter(r => r.status === 'Pending Approval').reduce((sum, r) => sum + r.requestAmount, 0);
    const approvedAmount = reimbursements.filter(r => r.status === 'Approved').reduce((sum, r) => sum + (r.approvedAmount || r.requestAmount), 0);
    const paidAmount = reimbursements.filter(r => r.status === 'Paid').reduce((sum, r) => sum + (r.approvedAmount || r.requestAmount), 0);
    return { pendingAmount, approvedAmount, paidAmount };
  }, [reimbursements]);
  
  const bankAndCashAccounts = React.useMemo(() => {
    if (!coaLedgers) return [];
    return coaLedgers.filter(l => l.groupId === '1.1.1');
  }, [coaLedgers]);
  
  const liveBalances = React.useMemo(() => {
    const balances = new Map<string, number>();
    if (!coaLedgers || !journalVouchers) return balances;

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

    return balances;
  }, [coaLedgers, journalVouchers]);


  const handleStatusUpdate = async (requestId: string, status: ReimbursementRequest['status']) => {
    await updateDoc(doc(firestore, 'reimbursementRequests', requestId), { status });
    toast({ title: 'Status Updated', description: `Request has been marked as ${status}.` });
  };
  
  const openProcessDialog = (request: any) => {
    const amount = request.refundAmount ?? request.balanceDue ?? request.amount ?? 0;
    setPaymentAmount(amount.toString());
    
    let partyCoaId;
    if (request.type === 'refund') {
        const party = parties?.find(p => p.id === request.customerId);
        partyCoaId = party?.coaLedgerId;
    } else if (request.type === 'salary-advance') {
        const employee = users?.find(u => u.id === request.employeeId);
        partyCoaId = employee?.coaLedgerId;
    } else {
        const party = parties?.find(p => p.id === (request.customerId || request.supplierId));
        partyCoaId = party?.coaLedgerId;
    }
    
    const partyBalance = partyCoaId ? liveBalances.get(partyCoaId) : undefined;
    setPaymentDialog({ isOpen: true, request, partyBalance });
  };
  
  const handleProcessPayment = async () => {
    const { request } = paymentDialog;
    const amountToPay = Number(paymentAmount);

    if (!request || !paymentAccountId || !amountToPay || amountToPay <= 0) {
      toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please select a payment account and enter a valid amount.' });
      return;
    }
    
    setIsProcessingPayment(true);
    try {
        const batch = writeBatch(firestore);
        
        let collectionName, requestRef, narration;
        let partyLedgerId, partyName;
        
        if (request.type === 'reimbursement') {
          collectionName = 'reimbursementRequests';
          requestRef = doc(firestore, collectionName, request.id);
          narration = `Payment for reimbursement request ${request.id} to ${request.requestedBy}`;
          const employeeLedger = coaLedgers?.find(l => l.name === request.requestedBy);
          if (!employeeLedger) throw new Error('Could not find ledger account for the employee.');
          partyLedgerId = employeeLedger.id;

          batch.update(requestRef, {
            status: 'Paid',
            transactionRef: paymentRef,
            transactionDate: paymentDate,
          });

        } else if (request.type === 'refund') {
            collectionName = 'refundRequests';
            requestRef = doc(firestore, collectionName, request.id);
            const orderDisplayId = request.orderNumber || request.orderId;
            narration = `Refund for Canceled Order #${orderDisplayId} (Ref: ${paymentRef})`;
            const customer = parties?.find(p => p.id === request.customerId);
            if (!customer?.coaLedgerId) throw new Error('Customer ledger not found.');
            partyLedgerId = customer.coaLedgerId;
            batch.update(requestRef, { status: 'Paid', transactionRef: paymentRef, transactionDate: paymentDate });

        } else if (request.type === 'salary-advance') {
            collectionName = 'salaryAdvanceRequests';
            requestRef = doc(firestore, collectionName, request.id);
            narration = `Salary advance paid to ${request.employeeName}`;
            const employee = users?.find(u => u.id === request.employeeId);
            if (!employee?.coaLedgerId) throw new Error(`Ledger account for employee ${request.employeeName} not found.`);
            partyLedgerId = employee.coaLedgerId;
            batch.update(requestRef, { status: 'Paid' });

            // Update the withdrawal amount on the daily attendance log for the request date
            const requestDateStr = format(new Date(request.requestDate), 'yyyy-MM-dd');
            const attendanceDocRef = doc(firestore, 'users', request.employeeId, 'attendance', requestDateStr);
            batch.update(attendanceDocRef, { withdrawal: increment(amountToPay) });
        
        } else if (request.type === 'advance' || request.type === 'grn') {
           collectionName = request.type === 'advance' ? 'advanceRequests' : 'grns';
           const statusField = request.type === 'advance' ? 'status' : 'paymentStatus';
           requestRef = doc(firestore, collectionName, request.id);
           narration = `Payment to ${request.supplierName} for ${request.type === 'advance' ? 'PO advance' : 'GRN'} ${request.poId || request.id}`;
           const supplierLedger = coaLedgers?.find(l => l.id === request.supplierCoaId);
           if (!supplierLedger) throw new Error('Supplier ledger account not found.');
           partyLedgerId = supplierLedger.id;

           batch.update(requestRef, { [statusField]: 'Paid', transactionRef: paymentRef, transactionDate: paymentDate });
        }

        if (!partyLedgerId) throw new Error('Could not determine party ledger.');

        const jvData = {
            date: paymentDate,
            narration: narration,
            entries: [
                { accountId: partyLedgerId, debit: amountToPay, credit: 0 },
                { accountId: paymentAccountId, debit: 0, credit: amountToPay },
            ],
            createdAt: serverTimestamp(),
        };
        const jvRef = doc(collection(firestore, 'journalVouchers'));
        batch.set(jvRef, jvData);
        
        await batch.commit();

        toast({ title: 'Payment Processed', description: 'The transaction has been recorded.' });
        setPaymentDialog({ isOpen: false, request: null });
    } catch (error: any) {
        console.error("Error processing payment:", error);
        toast({ variant: 'destructive', title: 'Payment Failed', description: error.message || 'An error occurred.' });
    } finally {
        setIsProcessingPayment(false);
    }
  };

  const grnPayments: (GrnPaymentRequest & { advancePaid: number; balanceDue: number; items: Grn['items']; subtotal: number; totalGst: number; type: 'grn' })[] = React.useMemo(() => {
    if (!grnsData) return [];
    return grnsData.map(grn => {
        const invoiceAmount = grn.grandTotal;
        const advanceRequest = advanceRequestsData?.find(adv => adv.poId === grn.poId && (adv.status === 'Paid'));
        const advancePaid = advanceRequest?.advanceAmount || 0;
        const balanceDue = invoiceAmount - advancePaid;

        return {
            id: grn.id,
            grnId: grn.id,
            poId: grn.poId,
            supplierName: grn.supplierName,
            supplierId: grn.supplierId,
            invoiceAmount,
            grnDate: grn.grnDate,
            status: grn.paymentStatus || 'Pending Approval',
            advancePaid,
            balanceDue,
            items: grn.items,
            subtotal: grn.subtotal,
            totalGst: grn.cgst + grn.sgst + grn.igst,
            type: 'grn',
        }
    });
  }, [grnsData, advanceRequestsData, parties]);

  const allSupplierPayments = React.useMemo(() => {
    const advances = (advanceRequestsData || [])
        .filter(req => req.status === 'Approved')
        .map(req => ({
            ...req,
            type: 'advance' as const,
            amount: req.advanceAmount,
            balanceDue: req.advanceAmount, // For consistency
            invoiceAmount: req.poAmount, // For consistency
            supplierCoaId: parties?.find(p => p.id === req.supplierId)?.coaLedgerId,
        }));
    const grns = grnPayments.filter(req => req.status === 'Approved');

    return [...advances, ...grns];
  }, [advanceRequestsData, grnPayments, parties]);
  
  const pendingAdvanceCount = advanceRequestsData?.filter(r => r.status === 'Pending Approval').length || 0;
  const pendingGrnCount = grnPayments.filter(r => r.status === 'Pending Approval').length;


  return (
    <>
      <PageHeader title="Reimbursement & Payment Process" />
      
       <Tabs defaultValue="reimbursements">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="reimbursements">Employee Reimbursements</TabsTrigger>
          <TabsTrigger value="salary-advances">Salary Advances</TabsTrigger>
          <TabsTrigger value="supplier-payments">Supplier Payments</TabsTrigger>
          <TabsTrigger value="customer-refunds">Customer Refunds</TabsTrigger>
        </TabsList>
        <TabsContent value="reimbursements">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
                    <Hourglass className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatIndianCurrency(kpis.pendingAmount)}</div>
                    <p className="text-xs text-muted-foreground">Amount waiting for approval</p>
                </CardContent>
                </Card>
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Approved for Payment</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatIndianCurrency(kpis.approvedAmount)}</div>
                    <p className="text-xs text-muted-foreground">Total amount ready to be paid</p>
                </CardContent>
                </Card>
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Paid (This Month)</CardTitle>
                    <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatIndianCurrency(kpis.paidAmount)}</div>
                    <p className="text-xs text-muted-foreground">Total reimbursements paid out</p>
                </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                <CardTitle>All Reimbursement Requests</CardTitle>
                <div className="flex justify-between items-center">
                    <CardDescription>Review, approve, and process employee reimbursements.</CardDescription>
                </div>
                </CardHeader>
                <CardContent>
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {reimbursementsLoading ? (
                        <TableRow><TableCell colSpan={7} className="h-24 text-center">Loading requests...</TableCell></TableRow>
                    ) : filteredReimbursements.map(request => (
                        <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.requestedBy}</TableCell>
                        <TableCell>{format(new Date(request.date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{request.description}</TableCell>
                        <TableCell>{request.category}</TableCell>
                        <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(request.status))}>{request.status}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{formatIndianCurrency(request.requestAmount)}</TableCell>
                        <TableCell className="text-right">
                            {request.status === 'Approved' ? (
                            <Button size="sm" onClick={() => openProcessDialog({ ...request, type: 'reimbursement', amount: request.approvedAmount || request.requestAmount })}>Process Payment</Button>
                            ) : null}
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="salary-advances">
            <Card>
                <CardHeader>
                    <CardTitle>Approved Salary Advances</CardTitle>
                    <CardDescription>Process payments for approved salary advance requests.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee Name</TableHead>
                                <TableHead>Request Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {salaryAdvancesLoading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
                            ) : salaryAdvances?.filter(sa => sa.status === 'Approved').map(req => (
                                <TableRow key={req.id}>
                                    <TableCell>{req.employeeName}</TableCell>
                                    <TableCell>{format(new Date(req.requestDate), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>{req.status}</Badge></TableCell>
                                    <TableCell className="text-right font-mono">{formatIndianCurrency(req.amount)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" onClick={() => openProcessDialog({ ...req, type: 'salary-advance' })}>Process Payment</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="supplier-payments">
             <Card>
                <CardHeader>
                    <CardTitle>Approved Supplier Payments</CardTitle>
                    <CardDescription>Process payments for approved advance requests and GRNs.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Ref ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                         <TableBody>
                            {(advancesLoading || grnsLoading) ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
                            ) : (
                                <>
                                    {allSupplierPayments.map(req => (
                                        <TableRow key={`${req.type}-${req.id}`}>
                                            <TableCell>{req.supplierName}</TableCell>
                                            <TableCell><Badge variant={req.type === 'advance' ? 'secondary' : 'outline'}>{req.type === 'advance' ? 'Advance' : 'GRN'}</Badge></TableCell>
                                            <TableCell className="font-mono">{req.poId || req.id}</TableCell>
                                            <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>{req.status}</Badge></TableCell>
                                            <TableCell className="text-right font-mono font-semibold">{formatIndianCurrency(req.balanceDue)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" onClick={() => openProcessDialog(req)}>Process Payment</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </>
                            )}
                         </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="customer-refunds">
            <Card>
                <CardHeader>
                    <CardTitle>Customer Refund Requests</CardTitle>
                    <CardDescription>Process refunds for approved order cancellations.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Customer</TableHead>
                                <TableHead>Order ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Refund Amount</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {refundsLoading ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading refund requests...</TableCell></TableRow>
                            ) : refundRequests && refundRequests.length > 0 ? (
                                refundRequests.map(req => (
                                    <TableRow key={req.id}>
                                        <TableCell>{req.customerName}</TableCell>
                                        <TableCell className="font-mono">{req.orderNumber || req.orderId}</TableCell>
                                        <TableCell>{format(new Date(req.requestDate), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>{req.status}</Badge></TableCell>
                                        <TableCell className="text-right font-mono font-semibold">{formatIndianCurrency(req.refundAmount)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" onClick={() => openProcessDialog({ ...req, type: 'refund' })}>Process Refund</Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">No pending refunds.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
       <Dialog open={paymentDialog.isOpen} onOpenChange={(open) => setPaymentDialog(prev => ({...prev, isOpen: open}))}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Process Payment</DialogTitle>
                <DialogDescription>
                    Record payment to {paymentDialog.request?.supplierName || paymentDialog.request?.requestedBy || paymentDialog.request?.customerName}.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 rounded-lg border p-3">
                        <Label className="text-xs text-muted-foreground">Amount to Pay</Label>
                        <Input className="text-base h-auto p-0 border-none font-bold" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                    </div>
                    {paymentDialog.request?.type !== 'refund' && (
                        <div className="space-y-1 rounded-lg border p-3">
                            <Label className="text-xs text-muted-foreground">Advance Paid</Label>
                            <p className="text-base font-bold">{formatIndianCurrency(paymentDialog.request?.advancePaid || 0)}</p>
                        </div>
                    )}
                </div>
                {paymentDialog.partyBalance !== undefined && (
                     <div className="space-y-1 rounded-lg border p-3">
                        <Label className="text-xs text-muted-foreground">Party Closing Balance</Label>
                        <p className={cn(
                            "text-base font-bold",
                            paymentDialog.partyBalance < 0 ? "text-red-600" : "text-green-600"
                        )}>
                            {formatIndianCurrency(Math.abs(paymentDialog.partyBalance))}
                            <span className="text-xs font-normal"> {paymentDialog.partyBalance < 0 ? 'Cr' : 'Dr'}</span>
                        </p>
                    </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="payment-date">Payment Date</Label>
                    <Input id="payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="payment-account">Paid From Account</Label>
                    <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                        <SelectTrigger id="payment-account"><SelectValue placeholder="Select bank/cash account..." /></SelectTrigger>
                        <SelectContent>
                            {bankAndCashAccounts.map(acc => (
                              <SelectItem key={acc.id} value={acc.id}>
                                <div className="flex justify-between w-full">
                                  <span>{acc.name}</span>
                                  <span className="text-muted-foreground font-mono ml-4">{formatIndianCurrency(liveBalances.get(acc.id) || 0)}</span>
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="payment-ref">Transaction Reference</Label>
                    <Input id="payment-ref" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="e.g., UTR, Cheque No." />
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleProcessPayment} disabled={isProcessingPayment}>
                    {isProcessingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm & Process Payment
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
