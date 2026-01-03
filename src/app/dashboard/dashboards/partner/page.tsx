
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Users,
  UserCheck,
  Target,
  CircleDollarSign,
  Wallet,
  Hourglass,
  AlertTriangle,
  Tag,
  Wrench,
  ShieldCheck,
  FileText,
  ShoppingCart,
} from 'lucide-react';
import { OverviewChart } from '@/components/dashboard/overview-chart';
import { useUser, useDoc, useFirestore, useCollection } from '@/firebase';
import type { UserProfile, Order, Lead, ServiceRequest, RegisteredProduct, Offer } from '@/lib/types';
import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export default function PartnerDashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const userDocRef = user ? doc(firestore, 'users', user.uid) : null;
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);
  
  const ordersQuery = React.useMemo(() => {
    if (!user || !firestore) return null;
    return query(
        collection(firestore, 'orders'),
        where('assignedToUid', '==', user.uid)
    );
  }, [user, firestore]);

  const { data: orders } = useCollection<Order>(ordersQuery);

  const leadsQuery = user ? query(collection(firestore, 'leads'), where('ownerId', '==', user.uid)) : null;
  const { data: leads } = useCollection<Lead>(leadsQuery);

  const serviceRequestsQuery = user ? query(collection(firestore, 'serviceRequests'), where('assignedToUid', '==', user.uid)) : null;
  const { data: serviceRequests } = useCollection<ServiceRequest>(serviceRequestsQuery);

  const registeredProductsQuery = user ? query(collection(firestore, 'registeredProducts'), where('ownerId', '==', user.uid)) : null;
  const { data: registeredProducts } = useCollection<RegisteredProduct>(registeredProductsQuery);

  const offersQuery = user ? query(collection(firestore, 'offers'), where('targetRoles', 'array-contains', 'Partner')) : null;
  const { data: offers } = useCollection<Offer>(offersQuery);

  const kpis = React.useMemo(() => {
    if (!orders || !userProfile || !leads) {
      return {
        activeCustomers: 0,
        totalLeads: 0,
        totalSales: 0,
        partnerCommission: 0,
        pendingCommission: userProfile?.commissionPayable || 0,
        walletBalance: userProfile?.walletBalance || 0,
        openServiceTickets: serviceRequests?.filter(sr => sr.status !== 'Completed' && sr.status !== 'Canceled').length || 0,
        productsUnderWarranty: registeredProducts?.filter(p => p.status === 'Active').length || 0,
        activeOffers: offers?.filter(o => o.status === 'Active').length || 0,
      };
    }

    const deliveredOrders = orders.filter(o => o.status === 'Delivered');
    const activeCustomers = new Set(deliveredOrders.map(o => o.userId)).size;

    const totalSales = deliveredOrders.reduce((acc, order) => acc + (order.grandTotal || 0), 0);

    const calculateCommission = (order: Order): number => {
        if (order.commission) return order.commission;
        if (!userProfile.partnerMatrix) return 0;
        return order.items.reduce((acc, item) => {
            const rule = userProfile.partnerMatrix?.find(r => r.category === item.category);
            if (rule) {
                const commissionableValue = (item.price || 0) * (item.quantity || 0);
                return acc + (commissionableValue * (rule.commissionRate / 100));
            }
            return acc;
        }, 0);
    };

    const partnerCommission = deliveredOrders.reduce((acc, order) => acc + calculateCommission(order), 0);
    
    const pendingCommission = orders
        .filter(o => o.status !== 'Delivered' && o.status !== 'Canceled')
        .reduce((acc, order) => acc + calculateCommission(order), 0);

    return {
      activeCustomers,
      totalLeads: leads.length,
      totalSales,
      partnerCommission,
      pendingCommission: (userProfile.commissionPayable || 0) + pendingCommission,
      walletBalance: userProfile.walletBalance || 0,
      openServiceTickets: serviceRequests?.filter(sr => sr.status !== 'Completed' && sr.status !== 'Canceled').length || 0,
      productsUnderWarranty: registeredProducts?.filter(p => p.status === 'Active').length || 0,
      activeOffers: offers?.filter(o => o.status === 'Active').length || 0,
    };
  }, [orders, userProfile, leads, serviceRequests, registeredProducts, offers]);

  const alerts = React.useMemo(() => {
    if (!orders) return [];
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return orders
      .filter(o => o.status === 'Ordered' && new Date(o.date) < oneWeekAgo)
      .map(o => ({
        id: o.id,
        text: `Order #${o.id.substring(0, 6)}... for ${o.customerName} is pending for over a week.`,
      }));
  }, [orders]);


  return (
    <>
      <PageHeader title="Partner Dashboard" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeCustomers}</div>
            <p className="text-xs text-muted-foreground">Transacting customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalLeads}</div>
            <p className="text-xs text-muted-foreground">Leads in your territory</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(kpis.totalSales)}</div>
            <p className="text-xs text-muted-foreground">Gross sales from delivered orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partner Commission</CardTitle>
            <Wallet className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(kpis.partnerCommission)}</div>
            <p className="text-xs text-muted-foreground">Total commission earned</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Commission</CardTitle>
            <Hourglass className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{formatCurrency(kpis.pendingCommission)}</div>
            <p className="text-xs text-muted-foreground">Commission not yet paid</p>
          </CardContent>
        </Card>
      </div>

       <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild>
            <Link href="/dashboard/sales/lead">
              <Users className="mr-2 h-4 w-4" /> Manage Leads
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/sales/quotation">
              <FileText className="mr-2 h-4 w-4" /> Manage Quotations
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/sales/orders">
              <ShoppingCart className="mr-2 h-4 w-4" /> Manage Orders
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>Sales Growth Chart</CardTitle>
            <CardDescription>A chart showing monthly sales growth.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <OverviewChart orders={orders || []} />
          </CardContent>
        </Card>
      </div>

       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Commission Summary</CardTitle>
                 <CardDescription>A summary of your commission payouts and balance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-md bg-green-50 dark:bg-green-900/30">
                    <span className="font-semibold">Total Commission Earned</span>
                    <span className="font-mono font-bold text-green-600">{formatCurrency(kpis.partnerCommission)}</span>
                </div>
                 <div className="flex justify-between items-center p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/30">
                    <span className="font-semibold">Pending Commission</span>
                    <span className="font-mono font-bold text-yellow-600">{formatCurrency(kpis.pendingCommission)}</span>
                </div>
                 <div className="flex justify-between items-center p-3 rounded-md bg-blue-50 dark:bg-blue-900/30">
                    <span className="font-semibold">Wallet Balance</span>
                    <span className="font-mono font-bold text-blue-600">{formatCurrency(kpis.walletBalance)}</span>
                </div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Service &amp; Warranty</CardTitle>
                <CardDescription>An overview of service tickets in your territory.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-md bg-muted">
                    <div className="flex items-center gap-2">
                        <Wrench className="h-5 w-5 text-destructive"/>
                        <span className="font-semibold">Open Service Tickets</span>
                    </div>
                    <span className="font-mono text-lg font-bold">{kpis.openServiceTickets}</span>
                </div>
                 <div className="flex justify-between items-center p-3 rounded-md bg-muted">
                     <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-green-600"/>
                        <span className="font-semibold">Products Under Warranty</span>
                    </div>
                    <span className="font-mono text-lg font-bold">{kpis.productsUnderWarranty}</span>
                </div>
            </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Deals, Offers & Campaigns</CardTitle>
                <CardDescription>An overview of active schemes and their performance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                 <div className="flex justify-between items-center p-3 rounded-md bg-muted">
                    <div className="flex items-center gap-2">
                        <Tag className="h-5 w-5 text-primary"/>
                        <span className="font-semibold">Active Offers for Partners</span>
                    </div>
                    <span className="font-mono text-lg font-bold">{kpis.activeOffers}</span>
                </div>
                <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard/deals-offers">View All Offers</Link>
                </Button>
            </CardContent>
        </Card>
         <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Alerts & Exceptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length > 0 ? alerts.map(alert => (
              <div
                key={alert.id}
                className="flex items-center gap-3 rounded-md p-3 hover:bg-muted"
              >
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <p className="text-sm font-medium">{alert.text}</p>
              </div>
            )) : <p className="text-sm text-muted-foreground text-center py-4">No new alerts.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
