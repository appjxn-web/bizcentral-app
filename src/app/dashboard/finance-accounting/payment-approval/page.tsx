
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
import { collection, doc, updateDoc, query, where } from 'firebase/firestore';
import type { Order, PaymentSubmission } from '@/lib/types';
import { format } from 'date-fns';

export default function PaymentApprovalPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const pendingPaymentsQuery = query(
    collection(firestore, 'paymentSubmissions'),
    where('status', '==', 'Pending')
  );
  const { data: pendingPayments, loading } = useCollection<PaymentSubmission>(pendingPaymentsQuery);
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  const handleUpdateStatus = async (submissionId: string, newStatus: 'Approved' | 'Rejected') => {
    setProcessingId(submissionId);
    try {
      const submissionRef = doc(firestore, 'paymentSubmissions', submissionId);
      await updateDoc(submissionRef, { status: newStatus });
      toast({
        title: `Payment ${newStatus}`,
        description: `The payment submission has been ${newStatus.toLowerCase()}.`,
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

  return (
    <>
      <PageHeader title="Customer Payment Approvals" />
      <Card>
        <CardHeader>
          <CardTitle>Awaiting Payment Confirmation</CardTitle>
          <CardDescription>
            Verify the received payment details against your bank statement and approve or reject the submission.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Transaction Details</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : pendingPayments && pendingPayments.length > 0 ? (
                pendingPayments.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>{submission.customerName}</TableCell>
                    <TableCell>{format(new Date(submission.submittedAt.toDate()), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{submission.paymentMethod}</TableCell>
                    <TableCell className="font-mono text-xs">{submission.transactionDetails}</TableCell>
                    <TableCell>
                      {submission.proofUrl ? (
                        <a href={submission.proofUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">View</a>
                      ) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      ₹{(submission.amount || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleUpdateStatus(submission.id, 'Rejected')}
                        disabled={processingId === submission.id}
                      >
                        {processingId === submission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleUpdateStatus(submission.id, 'Approved')}
                        disabled={processingId === submission.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                         {processingId === submission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No customer payments awaiting confirmation.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
