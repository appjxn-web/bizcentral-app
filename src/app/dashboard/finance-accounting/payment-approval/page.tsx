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
import type { Order } from '@/lib/types';
import { format } from 'date-fns';

export default function PaymentApprovalPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const pendingOrdersQuery = query(
    collection(firestore, 'orders'),
    where('status', '==', 'Awaiting Payment Confirmation')
  );
  const { data: pendingOrders, loading } = useCollection<Order>(pendingOrdersQuery);
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  const handleUpdateStatus = async (orderId: string, newStatus: 'Ordered' | 'Canceled') => {
    setProcessingId(orderId);
    try {
      const orderRef = doc(firestore, 'orders', orderId);
      await updateDoc(orderRef, { status: newStatus });
      toast({
        title: `Payment ${newStatus === 'Ordered' ? 'Approved' : 'Rejected'}`,
        description: `Order ${orderId} has been updated.`,
      });
    } catch (error) {
      console.error('Error updating order status:', error);
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
      <PageHeader title="Payment Approvals" />
      <Card>
        <CardHeader>
          <CardTitle>Awaiting Payment Confirmation</CardTitle>
          <CardDescription>
            Verify the received UPI transaction IDs against your bank statement and approve or reject the payment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>UPI Transaction ID</TableHead>
                <TableHead className="text-right">Advance Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : pendingOrders && pendingOrders.length > 0 ? (
                pendingOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono">{order.orderNumber || order.id}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{format(new Date(order.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="font-mono">{order.paymentDetails?.replace('UPI Transaction ID: ', '') || 'N/A'}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      ₹{(order.paymentReceived || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleUpdateStatus(order.id, 'Canceled')}
                        disabled={processingId === order.id}
                      >
                        {processingId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleUpdateStatus(order.id, 'Ordered')}
                        disabled={processingId === order.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                         {processingId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No orders awaiting payment confirmation.
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
