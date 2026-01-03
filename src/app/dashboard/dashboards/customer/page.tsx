
'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Package,
  Wrench,
  Gift,
  Wallet,
  Box,
  ShoppingCart,
  CheckCircle,
  Truck,
  Hourglass,
  XCircle,
  FileText,
  CircleDollarSign,
  ArrowRight,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { Order, RegisteredProduct, ServiceRequest, Referral, UserProfile } from '@/lib/types';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}


export default function CustomerDashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const userDocRef = user ? doc(firestore, 'users', user.uid) : null;
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);

  const ordersQuery = user ? query(collection(firestore, 'orders'), where('userId', '==', user.uid)) : null;
  const productsQuery = user ? query(collection(firestore, 'registeredProducts'), where('customerId', '==', user.uid)) : null;
  const serviceRequestsQuery = user ? query(collection(firestore, 'serviceRequests'), where('customer.id', '==', user.uid)) : null;
  const referralsQuery = user ? query(collection(firestore, 'users', user.uid, 'referrals')) : null;
  
  const { data: orders } = useCollection<Order>(ordersQuery);
  const { data: products } = useCollection<RegisteredProduct>(productsQuery);
  const { data: serviceRequests } = useCollection<ServiceRequest>(serviceRequestsQuery);
  const { data: referrals } = useCollection<Referral>(referralsQuery);


  const kpis = React.useMemo(() => {
    const totalOrders = orders?.length || 0;
    const activeOrders = orders?.filter(o => o.status === 'Pending' || o.status === 'Shipped').length || 0;
    const productsOwned = products?.length || 0;
    const openServiceTickets = serviceRequests?.filter(sr => sr.status !== 'Completed' && sr.status !== 'Canceled').length || 0;
    
    const { totalEarnings } = (referrals || []).reduce((acc, r) => {
        if (r.status === 'Signed Up' || r.status === 'First Purchased' || r.status === 'Completed') {
            acc.totalEarnings += r.earnings;
        }
        if (['First Purchased', 'Completed'].includes(r.status)) {
            acc.totalEarnings += r.commission;
        }
        return acc;
    }, { totalEarnings: 0 });
    
    const walletBalance = userProfile?.walletBalance || 0;

    return {
        totalOrders,
        activeOrders,
        productsOwned,
        openServiceTickets,
        referralEarnings: totalEarnings,
        walletBalance,
    };
  }, [orders, products, serviceRequests, referrals, userProfile]);

  const orderKpis = React.useMemo(() => {
    const thisMonth = orders?.filter(o => new Date(o.date).getMonth() === new Date().getMonth()).length || 0;
    const delivered = orders?.filter(o => o.status === 'Delivered').length || 0;
    const inTransit = orders?.filter(o => o.status === 'Shipped').length || 0;
    const pending = orders?.filter(o => o.status === 'Pending').length || 0;
    const cancelled = orders?.filter(o => o.status === 'Canceled').length || 0;
    const totalValue = orders?.reduce((sum, o) => sum + o.total, 0) || 0;
    const paidAmount = orders?.reduce((sum, o) => sum + (o.paymentReceived || 0), 0) || 0;
    const outstandingAmount = totalValue - paidAmount;
    
    return { thisMonth, delivered, inTransit, pending, cancelled, totalValue, paidAmount, outstandingAmount };
  }, [orders]);

  const paymentKpis = React.useMemo(() => {
    const outstandingBalance = orderKpis.outstandingAmount;
    const advancePaid = orders?.reduce((sum, o) => sum + (o.paymentReceived || 0), 0) || 0; // Simplified
    const creditNotes = 0; // Needs data from finance
    const lastPaymentDate = orders?.filter(o => o.paymentReceived).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date;
    const lastInvoiceAmount = orders?.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.total || 0;
    
    return {
      outstandingBalance,
      advancePaid,
      creditNotes,
      lastPaymentDate,
      lastInvoiceAmount,
    };
  }, [orders, orderKpis]);
  
  const alerts: any[] = [];
  if (paymentKpis.outstandingBalance > 0) {
    alerts.push({ id: 1, text: 'You have an outstanding balance.', action: '/dashboard/my-account', icon: CircleDollarSign });
  }
  if (kpis.openServiceTickets > 0) {
    alerts.push({ id: 2, text: `You have ${kpis.openServiceTickets} open service tickets.`, action: '/dashboard/service-warranty/service-management', icon: Wrench });
  }

  return (
    <>
      <PageHeader title="My Dashboard" />
      
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalOrders}</div>
            <p className="text-xs text-muted-foreground">Lifetime orders placed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeOrders}</div>
            <p className="text-xs text-muted-foreground">Orders in progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products Owned</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.productsOwned}</div>
            <p className="text-xs text-muted-foreground">Registered products</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Service Tickets</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.openServiceTickets}</div>
            <p className="text-xs text-muted-foreground">Pending service issues</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Referral Earnings</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.referralEarnings)}</div>
            <p className="text-xs text-muted-foreground">Incentives earned from referrals</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.walletBalance)}</div>
            <p className="text-xs text-muted-foreground">Your available credit balance</p>
          </CardContent>
        </Card>
      </div>

       <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Alerts & Reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
            {alerts.length > 0 ? alerts.map(alert => (
                <Link key={alert.id} href={alert.action} className="block p-3 rounded-md hover:bg-muted">
                    <div className="flex items-center gap-3">
                        <alert.icon className="h-5 w-5 text-primary" />
                        <p className="text-sm font-medium">{alert.text}</p>
                    </div>
                </Link>
            )) : <p className="text-sm text-muted-foreground text-center py-4">No new alerts.</p>}
        </CardContent>
      </Card>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-4">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
            <CardDescription>A summary of your order statuses and financials.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
                 <h4 className="text-sm font-medium">Core Metrics</h4>
                 <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground flex items-center"><CheckCircle className="mr-2 h-4 w-4 text-green-500"/>Orders Delivered</span>
                    <span className="font-bold">{orderKpis.delivered}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground flex items-center"><Truck className="mr-2 h-4 w-4 text-blue-500"/>Orders In Transit</span>
                    <span className="font-bold">{orderKpis.inTransit}</span>
                </div>
                 <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground flex items-center"><Hourglass className="mr-2 h-4 w-4 text-yellow-500"/>Orders Pending</span>
                    <span className="font-bold">{orderKpis.pending}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground flex items-center"><XCircle className="mr-2 h-4 w-4 text-red-500"/>Orders Cancelled</span>
                    <span className="font-bold">{orderKpis.cancelled}</span>
                </div>
            </div>
             <div className="space-y-3">
                <h4 className="text-sm font-medium">Financial Overview</h4>
                 <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground flex items-center"><FileText className="mr-2 h-4 w-4"/>Total Order Value</span>
                    <span className="font-bold">{formatCurrency(orderKpis.totalValue)}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground flex items-center"><CircleDollarSign className="mr-2 h-4 w-4 text-green-500"/>Paid Amount</span>
                    <span className="font-bold">{formatCurrency(orderKpis.paidAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground flex items-center"><CircleDollarSign className="mr-2 h-4 w-4 text-red-500"/>Outstanding Amount</span>
                    <span className="font-bold">{formatCurrency(orderKpis.outstandingAmount)}</span>
                </div>
             </div>
          </CardContent>
           <CardFooter>
                <p className="text-xs text-muted-foreground">Chart for order status distribution will be here.</p>
           </CardFooter>
        </Card>
        <Card className="col-span-full lg:col-span-3">
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
            <CardDescription>An overview of your account balance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
                <div>
                    <p className="text-sm text-red-800 dark:text-red-300">Outstanding Balance</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(paymentKpis.outstandingBalance)}</p>
                </div>
                <Button size="sm">Make Payment</Button>
            </div>
            <div className="text-sm space-y-2">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Advance Paid:</span>
                    <span>{formatCurrency(paymentKpis.advancePaid)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Credit Notes:</span>
                    <span>{formatCurrency(paymentKpis.creditNotes)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Payment Date:</span>
                    <span>{paymentKpis.lastPaymentDate ? new Date(paymentKpis.lastPaymentDate).toLocaleDateString() : 'N/A'}</span>
                </div>
                 <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Invoice Amount:</span>
                    <span>{formatCurrency(paymentKpis.lastInvoiceAmount)}</span>
                </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/dashboard/my-account">View Statement <ArrowRight className="ml-2 h-4 w-4"/></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Products & Warranty</CardTitle>
                <CardDescription>Coming Soon: A summary of your registered products and their warranty status.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Product and warranty details will be displayed here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Deals & Offers</CardTitle>
                <CardDescription>Coming Soon: Personalized deals and offers for you.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Active offers will be displayed here.</p>
            </CardContent>
        </Card>
      </div>
       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Referrals Funnel</CardTitle>
                <CardDescription>Coming Soon: A summary of your referral progress.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Referral funnel chart will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Support Tickets</CardTitle>
                <CardDescription>Coming Soon: A summary of your open support tickets and their statuses.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Ticket summary and resolution times will be here.</p>
            </CardContent>
        </Card>
      </div>
       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Posts & Engagement</CardTitle>
                <CardDescription>Coming Soon: A summary of your community post engagement.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Post engagement metrics will be displayed here.</p>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
