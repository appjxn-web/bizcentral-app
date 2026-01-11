

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
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
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import type { PaymentSubmission, Order } from '@/lib/types';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'Approved':
    case 'Ordered':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'Pending':
    case 'Awaiting Payment Confirmation':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'Rejected':
    case 'Canceled':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

function PaymentTable({
  submissions,
  onUpdateStatus,
  processingId,
}: {
  submissions: (PaymentSubmission | Order)[];
  onUpdateStatus: (submission: PaymentSubmission | Order, status: 'Approved' | 'Rejected') => void;
  processingId: string | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Transaction Details</TableHead>
          <TableHead>Proof</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {submissions.length > 0 ? (
          submissions.map((submission) => {
            const isOrder = 'orderNumber' in submission;
            const submittedAt = isOrder ? new Date(submission.date) : (submission as PaymentSubmission).submittedAt?.toDate();

            return (
              <TableRow key={submission.id}>
                <TableCell>{submission.customerName}</TableCell>
                <TableCell>{submittedAt ? format(submittedAt, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                <TableCell>{isOrder ? 'Online' : (submission as PaymentSubmission).paymentMethod}</TableCell>
                <TableCell className="font-mono text-xs">{isOrder ? submission.paymentDetails : (submission as PaymentSubmission).transactionDetails}</TableCell>
                <TableCell>
                  { 'proofUrl' in submission && submission.proofUrl ? (
                    <a href={submission.proofUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">View</a>
                  ) : 'N/A'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(getStatusBadgeVariant(submission.status))}>
                    {submission.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  ₹{(isOrder ? submission.paymentReceived : (submission as PaymentSubmission).amount || 0).toFixed(2)}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {submission.status === 'Pending' || submission.status === 'Awaiting Payment Confirmation' ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onUpdateStatus(submission, 'Rejected')}
                        disabled={processingId === submission.id}
                      >
                        {processingId === submission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onUpdateStatus(submission, 'Approved')}
                        disabled={processingId === submission.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                         {processingId === submission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      </Button>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })
        ) : (
          <TableRow>
            <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
              No payments in this category.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}


export default function PaymentApprovalPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const allPaymentsQuery = query(
    collection(firestore, 'paymentSubmissions'),
    orderBy('submittedAt', 'desc')
  );
  
  const allOrdersQuery = query(
    collection(firestore, 'orders'),
    orderBy('createdAt', 'desc')
  );

  const { data: allPayments, loading: paymentsLoading } = useCollection<PaymentSubmission>(allPaymentsQuery);
  const { data: allOrders, loading: ordersLoading } = useCollection<Order>(allOrdersQuery);
  
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  const handleUpdateStatus = async (submission: PaymentSubmission | Order, newStatus: 'Approved' | 'Rejected') => {
    setProcessingId(submission.id);

    const isOrder = 'orderNumber' in submission;
    const collectionName = isOrder ? 'orders' : 'paymentSubmissions';
    const submissionRef = doc(firestore, collectionName, submission.id);

    try {
        if (isOrder) {
            const finalStatus = newStatus === 'Approved' ? 'Ordered' : 'Canceled';
            await updateDoc(submissionRef, { status: finalStatus });
        } else {
            await updateDoc(submissionRef, { status: newStatus });
        }

        toast({
            title: `Payment ${newStatus}`,
            description: `The submission has been ${newStatus.toLowerCase()}. The Cloud Function will handle accounting.`,
        });
    } catch (error) {
        console.error('Error updating payment status:', error);
        toast({
            variant: 'destructive',
            title: 'Update Failed',
        });
    } finally {
        setProcessingId(null);
    }
  };
  
  const pendingPayments = React.useMemo(() => {
    const manualSubmissions = allPayments?.filter(p => p.status === 'Pending') || [];
    const onlineOrders = allOrders?.filter(o => o.status === 'Awaiting Payment Confirmation') || [];
    return [...manualSubmissions, ...onlineOrders].sort((a,b) => {
        const dateA = 'orderNumber' in a ? new Date(a.date) : (a as PaymentSubmission).submittedAt.toDate();
        const dateB = 'orderNumber' in b ? new Date(b.date) : (b as PaymentSubmission).submittedAt.toDate();
        return dateB.getTime() - dateA.getTime();
    });
  }, [allPayments, allOrders]);

  const approvedPayments = React.useMemo(() => {
    const manual = allPayments?.filter(p => p.status === 'Approved') || [];
    const online = allOrders?.filter(o => o.status === 'Ordered' && o.paymentReceived > 0) || [];
    return [...manual, ...online].sort((a,b) => {
        const dateA = 'orderNumber' in a ? new Date(a.date) : (a as PaymentSubmission).submittedAt.toDate();
        const dateB = 'orderNumber' in b ? new Date(b.date) : (b as PaymentSubmission).submittedAt.toDate();
        return dateB.getTime() - dateA.getTime();
    });
  }, [allPayments, allOrders]);

  const rejectedPayments = React.useMemo(() => {
    const manual = allPayments?.filter(p => p.status === 'Rejected') || [];
    const online = allOrders?.filter(o => o.status === 'Canceled') || [];
     return [...manual, ...online].sort((a,b) => {
        const dateA = 'orderNumber' in a ? new Date(a.date) : (a as PaymentSubmission).submittedAt.toDate();
        const dateB = 'orderNumber' in b ? new Date(b.date) : (b as PaymentSubmission).submittedAt.toDate();
        return dateB.getTime() - dateA.getTime();
    });
  }, [allPayments, allOrders]);
  
  const loading = paymentsLoading || ordersLoading;

  return (
    <>
      <PageHeader title="Customer Payment Approvals" />
      <Card>
        <CardHeader>
          <CardTitle>Payment Confirmation</CardTitle>
          <CardDescription>
            Verify received payment details against your bank statement and approve or reject submissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending">Pending ({pendingPayments.length})</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4">
               {loading ? (
                  <div className="h-24 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
               ) : (
                <PaymentTable submissions={pendingPayments} onUpdateStatus={handleUpdateStatus} processingId={processingId} />
               )}
            </TabsContent>
             <TabsContent value="approved" className="mt-4">
               {loading ? (
                  <div className="h-24 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
               ) : (
                <PaymentTable submissions={approvedPayments} onUpdateStatus={handleUpdateStatus} processingId={processingId} />
               )}
            </TabsContent>
             <TabsContent value="rejected" className="mt-4">
               {loading ? (
                  <div className="h-24 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
               ) : (
                <PaymentTable submissions={rejectedPayments} onUpdateStatus={handleUpdateStatus} processingId={processingId} />
               )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
