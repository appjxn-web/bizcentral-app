

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { MoreHorizontal, CheckCircle, XCircle, CircleDollarSign, Hourglass, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, updateDoc, query, where, writeBatch, serverTimestamp, addDoc } from 'firebase/firestore';
import type { Grn, GrnPaymentRequest, AdvanceRequest, PurchaseRequest, CoaLedger } from '@/lib/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


type PaymentRequestStatus = 'Pending Approval' | 'Approved' | 'Rejected' | 'Paid';

function getStatusBadgeVariant(status: PaymentRequestStatus) {
  const variants: Record<PaymentRequestStatus, string> = {
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

function AdvanceRequestRow({ request, onUpdate }: { request: AdvanceRequest, onUpdate: (id: string, status: PaymentRequestStatus) => void }) {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
            <TableBody>
                <TableRow>
                    <TableCell>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                            </Button>
                        </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="font-mono">{request.poId}</TableCell>
                    <TableCell>{request.supplierName}</TableCell>
                    <TableCell className="font-mono">{formatIndianCurrency(request.poAmount)}</TableCell>
                    <TableCell className="font-mono font-semibold">{formatIndianCurrency(request.advanceAmount)}</TableCell>
                    <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(request.status))}>{request.status}</Badge></TableCell>
                    <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" disabled={request.status !== 'Pending Approval'}><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => onUpdate(request.id, 'Approved')}>
                                    <CheckCircle className="mr-2 h-4 w-4" /> Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onUpdate(request.id, 'Rejected')} className="text-red-500">
                                    <XCircle className="mr-2 h-4 w-4" /> Reject
                                </DropdownMenuItem>
                                <DropdownMenuItem>Edit</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                </TableRow>
                <CollapsibleContent asChild>
                    <TableRow>
                        <TableCell colSpan={7} className="p-0">
                            <div className="p-4 bg-muted/50 text-sm">
                                <strong>Reason for Advance:</strong> {request.reason || 'Not specified'}
                            </div>
                        </TableCell>
                    </TableRow>
                </CollapsibleContent>
            </TableBody>
        </Collapsible>
    );
}

function GrnPaymentRow({ request, originalPo, onUpdate }: { request: (GrnPaymentRequest & { advancePaid: number; balanceDue: number; items: Grn['items']; subtotal: number; totalGst: number; }), originalPo: PurchaseRequest | undefined, onUpdate: (id: string, status: PaymentRequestStatus) => void }) {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
            <TableBody>
                <TableRow>
                    <TableCell>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                            </Button>
                        </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="font-mono">{request.grnId}</TableCell>
                    <TableCell>{request.supplierName}</TableCell>
                    <TableCell className="font-mono">{formatIndianCurrency(request.invoiceAmount)}</TableCell>
                    <TableCell className="font-mono text-blue-600">{formatIndianCurrency(request.advancePaid)}</TableCell>
                    <TableCell className="font-mono font-bold">{formatIndianCurrency(request.balanceDue)}</TableCell>
                    <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(request.status))}>{request.status}</Badge></TableCell>
                    <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" disabled={request.status !== 'Pending Approval'}><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => onUpdate(request.id, 'Approved')}>
                                    <CheckCircle className="mr-2 h-4 w-4" /> Approve for Payment
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onUpdate(request.id, 'Rejected')} className="text-red-500">
                                    <XCircle className="mr-2 h-4 w-4" /> Reject
                                </DropdownMenuItem>
                                 <DropdownMenuItem>Edit</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                </TableRow>
                 <CollapsibleContent asChild>
                    <TableRow>
                        <TableCell colSpan={8} className="p-0">
                            <div className="p-4 bg-muted/50">
                               <h4 className="font-semibold text-sm mb-2">Items in this GRN:</h4>
                               <Table>
                                 <TableHeader>
                                   <TableRow>
                                     <TableHead>Product</TableHead>
                                     <TableHead className="text-right">Received Qty</TableHead>
                                     <TableHead className="text-right">Ordered Rate</TableHead>
                                     <TableHead className="text-right">Invoice Rate</TableHead>
                                     <TableHead className="text-right">Subtotal</TableHead>
                                   </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                   {request.items.map((item, index) => {
                                     const orderedItem = originalPo;
                                     const orderedRate = orderedItem?.rate || 0;
                                     return (
                                     <TableRow key={index}>
                                       <TableCell>{item.productName}</TableCell>
                                       <TableCell className="text-right font-mono">{item.receivedQty}</TableCell>
                                       <TableCell className="text-right font-mono">{formatIndianCurrency(orderedRate)}</TableCell>
                                       <TableCell className={cn("text-right font-mono", item.rate > orderedRate && 'text-red-500 font-bold')}>
                                            {formatIndianCurrency(item.rate)}
                                       </TableCell>
                                       <TableCell className="text-right font-mono">{formatIndianCurrency(item.receivedQty * item.rate)}</TableCell>
                                     </TableRow>
                                   )})}
                                 </TableBody>
                                 <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-right">Taxable Value</TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(request.subtotal)}</TableCell>
                                    </TableRow>
                                     <TableRow>
                                        <TableCell colSpan={4} className="text-right">GST</TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(request.totalGst)}</TableCell>
                                    </TableRow>
                                     <TableRow className="font-bold">
                                        <TableCell colSpan={4} className="text-right">Total Invoice Value</TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(request.invoiceAmount)}</TableCell>
                                    </TableRow>
                                 </TableFooter>
                               </Table>
                            </div>
                        </TableCell>
                    </TableRow>
                </CollapsibleContent>
            </TableBody>
        </Collapsible>
    );
}

export default function PaymentApprovalPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const { data: grnsData, loading: grnsLoading } = useCollection<Grn>(collection(firestore, 'grns'));
  const { data: advanceRequestsData, loading: advancesLoading } = useCollection<AdvanceRequest>(collection(firestore, 'advanceRequests'));
  const { data: purchaseRequestsData, loading: poLoading } = useCollection<PurchaseRequest>(collection(firestore, 'purchaseRequests'));
  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const [paymentDialog, setPaymentDialog] = React.useState<{ isOpen: boolean; request: any | null }>({ isOpen: false, request: null });
  const [isProcessingPayment, setIsProcessingPayment] = React.useState(false);

  const grnPayments: (GrnPaymentRequest & { advancePaid: number; balanceDue: number; items: Grn['items']; subtotal: number; totalGst: number; })[] = React.useMemo(() => {
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
            totalGst: grn.totalGst,
        }
    });
  }, [grnsData, advanceRequestsData]);
  
  const pendingAdvanceCount = advanceRequestsData?.filter(r => r.status === 'Pending Approval').length || 0;
  const pendingGrnCount = grnPayments.filter(r => r.status === 'Pending Approval').length;

  const kpis = React.useMemo(() => {
    const pendingAdvanceAmount = advanceRequestsData
      ?.filter(r => r.status === 'Pending Approval')
      .reduce((sum, r) => sum + r.advanceAmount, 0) || 0;

    const pendingGrnAmount = grnPayments
      .filter(r => r.status === 'Pending Approval')
      .reduce((sum, r) => sum + r.balanceDue, 0);

    const totalPendingAmount = pendingAdvanceAmount + pendingGrnAmount;

    return { pendingAdvanceAmount, pendingGrnAmount, totalPendingAmount };
  }, [advanceRequestsData, grnPayments]);
  
  const handleUpdate = async (collectionName: 'advanceRequests' | 'grns', docId: string, status: PaymentRequestStatus) => {
    const docRef = doc(firestore, collectionName, docId);
    const fieldToUpdate = collectionName === 'grns' ? 'paymentStatus' : 'status';
    await updateDoc(docRef, { [fieldToUpdate]: status });
    toast({ title: 'Request Status Updated', description: `Request ${docId} has been marked as ${status}.` });
  };


  return (
    <>
      <PageHeader title="Payment Approval" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pending Amount</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.totalPendingAmount)}</div>
            <p className="text-xs text-muted-foreground">Sum of all pending approvals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Advances Pending</CardTitle>
            <Hourglass className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.pendingAdvanceAmount)}</div>
            <p className="text-xs text-muted-foreground">{pendingAdvanceCount} advance requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">GRN Payments Pending</CardTitle>
            <Hourglass className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.pendingGrnAmount)}</div>
            <p className="text-xs text-muted-foreground">{pendingGrnCount} GRN payment requests</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="advances">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="advances">
            Advance Requests
            {pendingAdvanceCount > 0 && <Badge className="ml-2">{pendingAdvanceCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="grn-payments">
            GRN Payments
            {pendingGrnCount > 0 && <Badge className="ml-2">{pendingGrnCount}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="advances">
          <Card>
            <CardHeader>
              <CardTitle>Advance Payment Requests</CardTitle>
              <CardDescription>Approve advance payments to suppliers for purchase orders.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                    <TableHead>PO ID</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Total PO Amount</TableHead>
                    <TableHead>Advance Requested</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                {advancesLoading ? (
                  <TableBody><TableRow><TableCell colSpan={7} className="h-24 text-center">Loading...</TableCell></TableRow></TableBody>
                ) : advanceRequestsData?.map(req => (
                    <AdvanceRequestRow key={req.id} request={req} onUpdate={(id, status) => handleUpdate('advanceRequests', id, status)} />
                ))}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="grn-payments">
          <Card>
            <CardHeader>
              <CardTitle>GRN-Based Payment Requests</CardTitle>
              <CardDescription>Approve payments for goods that have been received and verified.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                    <TableHead>GRN ID</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Invoice Amount</TableHead>
                    <TableHead>Advance Paid</TableHead>
                    <TableHead>Balance Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                {grnsLoading || poLoading ? (
                   <TableBody><TableRow><TableCell colSpan={8} className="h-24 text-center">Loading...</TableCell></TableRow></TableBody>
                ) : grnPayments.map(req => {
                    const originalPo = purchaseRequestsData?.find(po => po.id === req.poId);
                    return (
                        <GrnPaymentRow key={req.id} request={req} originalPo={originalPo} onUpdate={(id, status) => handleUpdate('grns', id, status)} />
                    )
                })}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
