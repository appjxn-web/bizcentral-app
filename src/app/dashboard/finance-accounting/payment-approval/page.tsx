

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
import { collection, doc, updateDoc, query, orderBy, where } from 'firebase/firestore';
import type { PaymentSubmission } from '@/lib/types';
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
  submissions: PaymentSubmission[];
  onUpdateStatus: (submission: PaymentSubmission, status: 'Approved' | 'Rejected') => void;
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
            return (
              <TableRow key={submission.id}>
                <TableCell>{submission.customerName}</TableCell>
                <TableCell>{submission.submittedAt ? format(submission.submittedAt.toDate(), 'dd/MM/yyyy') : 'N/A'}</TableCell>
                <TableCell>{submission.paymentMethod}</TableCell>
                <TableCell className="font-mono text-xs">{submission.transactionDetails}</TableCell>
                <TableCell>
                  {submission.proofUrl ? (
                    <a href={submission.proofUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">View</a>
                  ) : 'N/A'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(getStatusBadgeVariant(submission.status))}>
                    {submission.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  ₹{(submission.amount || 0).toFixed(2)}
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

  // ONLY query paymentSubmissions
  const allPaymentsQuery = query(
    collection(firestore, 'paymentSubmissions'),
    orderBy('submittedAt', 'desc')
  );

  const { data: allPayments, loading } = useCollection<PaymentSubmission>(allPaymentsQuery);
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  const handleUpdateStatus = async (submission: PaymentSubmission, newStatus: 'Approved' | 'Rejected') => {
    setProcessingId(submission.id);
    const submissionRef = doc(firestore, 'paymentSubmissions', submission.id);

    try {
        // Just update the submission. The Cloud Function onPaymentApproved
        // will handle updating the Order and creating the JV.
        await updateDoc(submissionRef, { status: newStatus });

        toast({ title: `Payment ${newStatus}` });
    } catch (error) {
        toast({ variant: 'destructive', title: 'Update Failed' });
    } finally {
        setProcessingId(null);
    }
  };
  
  // Simplified Memo filters
  const pendingPayments = React.useMemo(() => 
    allPayments?.filter(p => p.status === 'Pending' || p.status === 'Awaiting Payment Confirmation') || []
  , [allPayments]);

  const approvedPayments = React.useMemo(() => 
    allPayments?.filter(p => p.status === 'Approved') || []
  , [allPayments]);

  const rejectedPayments = React.useMemo(() => 
    allPayments?.filter(p => p.status === 'Rejected') || []
  , [allPayments]);
  
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
