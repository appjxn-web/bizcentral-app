

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
  Heart,
  Tag,
  ThumbsUp,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, query, where, doc, orderBy, Timestamp, getDocs } from 'firebase/firestore';
import type { Order, RegisteredProduct, ServiceRequest, Referral, UserProfile, PaymentSubmission, JournalVoucher, SalesInvoice, CoaLedger, Offer, PostRequest } from '@/lib/types';
import { MakePaymentDialog } from './_components/make-payment-dialog';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
}


export default function CustomerDashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const userDocRef = user ? doc(firestore, 'users', user.uid) : null;
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);

  const ordersQuery = user ? query(collection(firestore, 'orders'), where('userId', '==', user.uid), orderBy('date', 'desc')) : null;
  const productsQuery = user ? query(collection(firestore, 'users', user.uid, 'registeredProducts')) : null;
  const serviceRequestsQuery = user ? query(collection(firestore, 'serviceRequests'), where('customer.id', '==', user.uid)) : null;
  const referralsQuery = user ? query(collection(firestore, 'users', user.uid, 'referrals')) : null;
  const offersQuery = query(collection(firestore, 'offers'), where('status', '==', 'Active'), where('targetRoles', 'array-contains', 'Customer'));
  const postsQuery = user ? query(collection(firestore, 'posts'), where('authorId', '==', user.uid)) : null;

  const { data: orders, loading: ordersLoading } = useCollection<Order>(ordersQuery);
  const { data: products, loading: productsLoading } = useCollection<RegisteredProduct>(productsQuery);
  const { data: serviceRequests, loading: serviceRequestsLoading } = useCollection<ServiceRequest>(serviceRequestsQuery);
  const { data: referrals, loading: referralsLoading } = useCollection<Referral>(referralsQuery);
  const { data: offers, loading: offersLoading } = useCollection<Offer>(offersQuery);
  const { data: posts, loading: postsLoading } = useCollection<PostRequest>(postsQuery);
  
  const paymentsQuery = user ? query(collection(firestore, 'paymentSubmissions'), where('userId', '==', user.uid), where('status', '==', 'Approved')) : null;
  const { data: paymentSubmissions, loading: paymentsLoading } = useCollection<PaymentSubmission>(paymentsQuery);
  
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);

  const loading = ordersLoading || productsLoading || serviceRequestsLoading || referralsLoading || offersLoading || postsLoading || paymentsLoading;


  const kpis = React.useMemo(() => {
    const totalOrders = orders?.length || 0;
    const activeOrders = orders?.filter(o => o.status === 'Ordered' || o.status === 'Shipped').length || 0;
    const productsOwned = products?.length || 0;
    const openServiceTickets = serviceRequests?.filter(sr => sr.status !== 'Completed' && sr.status !== 'Canceled').length || 0;
    
    const { totalEarnings } = (referrals || []).reduce((acc, r) => {
        if (r.status === 'Signed Up' || r.status === 'First Purchased' || r.status === 'Completed') {
            acc.totalEarnings += r.earnings || 0;
        }
        if (['First Purchased', 'Completed'].includes(r.status)) {
            acc.totalEarnings += r.commission || 0;
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
    if (!orders) return { thisMonth: 0, delivered: 0, inTransit: 0, pending: 0, cancelled: 0, totalValue: 0 };
    const thisMonth = orders.filter(o => new Date(o.date).getMonth() === new Date().getMonth()).length || 0;
    const delivered = orders.filter(o => o.status === 'Delivered').length || 0;
    const inTransit = orders.filter(o => o.status === 'Shipped').length || 0;
    const pending = orders.filter(o => ['Ordered', 'Manufacturing', 'Awaiting Payment Confirmation'].includes(o.status)).length || 0;
    const cancelled = orders.filter(o => o.status === 'Canceled').length || 0;
    
    const totalValue = orders
      .filter(o => o.status !== 'Canceled')
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0) || 0;

    return { thisMonth, delivered, inTransit, pending, cancelled, totalValue };
  }, [orders]);

  const paymentKpis = React.useMemo(() => {
    const totalOrderValue = orderKpis.totalValue;

    const paidFromOrders = (orders || [])
        .filter(o => o.status !== 'Canceled')
        .reduce((sum, o) => sum + (o.paymentReceived || 0), 0);
        
    const outstandingBalance = totalOrderValue - paidFromOrders;
    
    const lastPayment = (orders || [])
        .filter(o => o.paymentReceived && o.paymentReceived > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    const lastInvoiceAmount = orders?.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.grandTotal || 0;
    
    return {
      outstandingBalance,
      paidAmount: paidFromOrders,
      creditNotes: 0, // Placeholder
      lastPaymentDate: lastPayment ? new Date(lastPayment.date) : null,
      lastInvoiceAmount,
    };
  }, [orderKpis.totalValue, orders]);
  
  const alerts: any[] = [];
  if (paymentKpis.outstandingBalance > 0) {
    alerts.push({ id: 1, text: 'You have an outstanding balance.', action: '/dashboard/my-account', icon: CircleDollarSign });
  }
  if (kpis.openServiceTickets > 0) {
    alerts.push({ id: 2, text: `You have ${kpis.openServiceTickets} open service tickets.`, action: '/dashboard/service-warranty/service-management', icon: Wrench });
  }
  
  const productKpis = {
    activeWarranty: products?.filter(p => p.status === 'Active').length || 0,
    expiringSoon: products?.filter(p => p.status === 'Expiring Soon').length || 0,
  }

  const referralKpis = {
      pending: referrals?.filter(r => r.status === 'Pending').length || 0,
      signedUp: referrals?.filter(r => r.status === 'Signed Up').length || 0,
      completed: referrals?.filter(r => r.status === 'Completed').length || 0,
  }

  const postKpis = {
      totalPosts: posts?.length || 0,
      totalLikes: posts?.reduce((acc, p) => acc + (p.likes || 0), 0) || 0,
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
                    <span className="font-bold">{formatCurrency(paymentKpis.paidAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground flex items-center"><CircleDollarSign className="mr-2 h-4 w-4 text-red-500"/>Outstanding Balance including all orders</span>
                    <span className="font-bold">{formatCurrency(paymentKpis.outstandingBalance)}</span>
                </div>
             </div>
          </CardContent>
           <CardFooter>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/dashboard/my-orders">View All Orders <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
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
                    <p className="text-sm text-red-800 dark:text-red-300">Outstanding Balance including all orders</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(paymentKpis.outstandingBalance)}</p>
                </div>
                {paymentKpis.outstandingBalance > 0 && (
                  <Button size="sm" onClick={() => setIsPaymentDialogOpen(true)}>Make Payment</Button>
                )}
            </div>
            <div className="text-sm space-y-2">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Paid:</span>
                    <span>{formatCurrency(paymentKpis.paidAmount)}</span>
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
                <CardDescription>A summary of your registered products and their warranty status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground">Products with Active Warranty</span>
                    <span className="font-bold">{productKpis.activeWarranty}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground">Warranties Expiring Soon</span>
                    <span className="font-bold">{productKpis.expiringSoon}</span>
                </div>
            </CardContent>
            <CardFooter>
                <Button variant="outline" asChild className="w-full">
                    <Link href="/dashboard/my-products">Manage My Products <ArrowRight className="ml-2 h-4 w-4"/></Link>
                </Button>
            </CardFooter>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Deals & Offers</CardTitle>
                <CardDescription>Personalized deals and offers available for you.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <div className="text-center">
                    <p className="text-4xl font-bold">{offers?.length || 0}</p>
                    <p className="text-muted-foreground">Active offers</p>
                </div>
            </CardContent>
             <CardFooter>
                <Button variant="outline" asChild className="w-full">
                    <Link href="/dashboard/deals-offers">View All Offers <ArrowRight className="ml-2 h-4 w-4"/></Link>
                </Button>
            </CardFooter>
        </Card>
      </div>
       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Referrals Funnel</CardTitle>
                <CardDescription>A summary of your referral progress.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground">Invites Sent (Pending)</span>
                    <span className="font-bold">{referralKpis.pending}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground">Successful Sign-ups</span>
                    <span className="font-bold">{referralKpis.signedUp}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground">Completed (First Purchase)</span>
                    <span className="font-bold">{referralKpis.completed}</span>
                </div>
            </CardContent>
             <CardFooter>
                <Button variant="outline" asChild className="w-full">
                    <Link href="/dashboard/referrals">View Referral History <ArrowRight className="ml-2 h-4 w-4"/></Link>
                </Button>
            </CardFooter>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Posts & Engagement</CardTitle>
                <CardDescription>A summary of your community post engagement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                 <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground">Total Posts Submitted</span>
                    <span className="font-bold">{postKpis.totalPosts}</span>
                </div>
                 <div className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                    <span className="text-muted-foreground">Total Likes Received</span>
                    <span className="font-bold">{postKpis.totalLikes}</span>
                </div>
            </CardContent>
            <CardFooter>
                <Button variant="outline" asChild className="w-full">
                    <Link href="/dashboard/create-post">Create New Post <ArrowRight className="ml-2 h-4 w-4"/></Link>
                </Button>
            </CardFooter>
        </Card>
      </div>
       <Card>
        <CardHeader>
            <CardTitle>Support Tickets</CardTitle>
            <CardDescription>A summary of your open support tickets and their statuses.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
            <div className="text-center">
                <p className="text-4xl font-bold">{kpis.openServiceTickets}</p>
                <p className="text-muted-foreground">Open tickets</p>
            </div>
        </CardContent>
        <CardFooter>
            <Button variant="outline" asChild className="w-full">
                <Link href="/dashboard/service-warranty/service-management">View My Tickets <ArrowRight className="ml-2 h-4 w-4"/></Link>
            </Button>
        </CardFooter>
      </Card>
      <MakePaymentDialog
        open={isPaymentDialogOpen}
        onOpenChange={setIsPaymentDialogOpen}
        outstandingBalance={paymentKpis.outstandingBalance}
        userProfile={userProfile}
      />
    </>
  );
}





