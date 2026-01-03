

      
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, query, where, doc, orderBy } from 'firebase/firestore';
import type { Order, UserProfile } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { CircleDollarSign, TrendingUp, Loader2 } from 'lucide-react';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { 
        style: 'currency', 
        currency: 'INR', 
        minimumFractionDigits: 2 
    }).format(amount || 0);
};

export default function CommissionReportPage() {
  const { user: authUser } = useUser();
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');

  // Use the userId from URL if present (for admins), otherwise use the logged-in user's ID
  const targetUserId = userId || authUser?.uid;

  const userDocRef = targetUserId ? doc(firestore, 'users', targetUserId) : null;
  const { data: userProfile, loading: userProfileLoading } = useDoc<UserProfile>(userDocRef);

  const ordersQuery = React.useMemo(() => {
    if (!targetUserId || !firestore) return null;
    return query(
        collection(firestore, 'orders'),
        where('assignedToUid', '==', targetUserId),
        orderBy('date', 'desc')
    );
  }, [targetUserId, firestore]);
  
  const { data: orders, loading: ordersLoading } = useCollection<Order>(ordersQuery);

  const commissionData = React.useMemo(() => {
    if (!orders) return [];

    return orders.map(order => {
        let calculatedCommission = 0;
        if (order.items && userProfile?.partnerMatrix) {
            calculatedCommission = order.items.reduce((acc, item) => {
                const rule = userProfile.partnerMatrix?.find(r => r.category === item.category);
                if (rule) {
                    const commissionableValue = (item.price || 0) * (item.quantity || 0);
                    return acc + (commissionableValue * (rule.commissionRate / 100));
                }
                return acc;
            }, 0);
        }

        // Use the commission stored on the order if it exists, otherwise use the calculated one
        const finalCommission = order.commission || calculatedCommission;

        return {
            orderId: order.orderNumber || order.id,
            orderDate: order.date,
            customerName: order.customerName,
            orderTotal: order.grandTotal,
            commissionAmount: finalCommission,
            orderStatus: order.status,
            payoutStatus: order.status === 'Delivered' ? 'Paid' : 'Awaiting Delivery'
        };
    });
  }, [orders, userProfile]);

  const kpis = React.useMemo(() => {
    const totalEarned = commissionData
        .filter(i => i.orderStatus === 'Delivered')
        .reduce((acc, item) => acc + item.commissionAmount, 0);
        
    const pendingPayout = commissionData
        .filter(i => i.orderStatus !== 'Delivered' && i.orderStatus !== 'Canceled')
        .reduce((acc, item) => acc + item.commissionAmount, 0);

    return { totalEarned, pendingPayout };
  }, [commissionData]);
  
  const loading = userProfileLoading || ordersLoading;

  return (
    <>
      <PageHeader title={userProfile ? `Commission Report: ${userProfile.name}` : 'Commission Report'} />
      
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commission Earned</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.totalEarned)}</div>
            <p className="text-xs text-muted-foreground">From successfully delivered orders.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potential / Pending</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.pendingPayout)}</div>
            <p className="text-xs text-muted-foreground">From orders currently in progress.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Breakdown</CardTitle>
          <CardDescription>View your earnings across all assigned orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Total</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Order Status</TableHead>
                <TableHead>Payout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <div className="flex justify-center items-center gap-2">
                        <Loader2 className="animate-spin h-4 w-4" /> Loading...
                    </div>
                  </TableCell>
                </TableRow>
              ) : commissionData.length > 0 ? (
                commissionData.map(item => (
                  <TableRow key={item.orderId}>
                    <TableCell className="font-mono text-xs">{item.orderId}</TableCell>
                    <TableCell>
                        <div className="font-medium">{item.customerName}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(item.orderDate), 'PPP')}</div>
                    </TableCell>
                    <TableCell>{formatCurrency(item.orderTotal)}</TableCell>
                    <TableCell className="font-bold text-primary">{formatCurrency(item.commissionAmount)}</TableCell>
                    <TableCell>
                        <Badge variant="secondary">{item.orderStatus}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.payoutStatus === 'Paid' ? 'default' : 'outline'}>
                        {item.payoutStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No orders assigned to this account yet.
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
      
    