
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import {
  Users,
  Phone,
  ShoppingCart,
  CircleDollarSign,
  ClipboardList,
  FileText,
  AlertTriangle,
  Gift,
} from 'lucide-react';
import { SalesFunnelChart } from '@/components/dashboard/sales-funnel-chart';
import { OverviewChart } from '@/components/dashboard/overview-chart';
import { useUser, useDoc, useFirestore, useCollection } from '@/firebase';
import type { UserProfile, Lead, Order, Task } from '@/lib/types';
import { doc, collection, query, where } from 'firebase/firestore';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}


export default function SalesAgentDashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const userDocRef = user ? doc(firestore, 'users', user.uid) : null;
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);
  
  const leadsQuery = user ? query(collection(firestore, 'leads'), where('ownerId', '==', user.uid)) : null;
  const ordersQuery = user ? query(collection(firestore, 'orders'), where('assignedToUid', '==', user.uid)) : null;
  const tasksQuery = user ? query(collection(firestore, 'tasks'), where('assigneeId', '==', user.uid)) : null;

  const { data: leads } = useCollection<Lead>(leadsQuery);
  const { data: orders } = useCollection<Order>(ordersQuery);
  const { data: tasks } = useCollection<Task>(tasksQuery);
  
  // Mock Data - replace with actual queries
  const kpis = React.useMemo(() => {
    const activeLeads = leads?.filter(l => l.status !== 'Converted' && l.status !== 'Lost').length || 0;
    const quotationsSent = leads?.filter(l => l.status === 'Proposal Sent').length || 0;
    const ordersWon = orders?.filter(o => new Date(o.date).getMonth() === new Date().getMonth()).length || 0;
    const commissionEarned = userProfile?.commissionPayable || 0;
    const tasksPending = tasks?.filter(t => t.status === 'Pending').length || 0;

    return {
      activeLeads,
      followUpsDue: 0, // Mock
      quotationsSent,
      ordersWon,
      commissionEarned,
      tasksPending,
    };
  }, [leads, orders, tasks, userProfile]);

  const alerts: any[] = [];
  if (kpis.tasksPending > 0) {
    alerts.push({ id: 1, text: `You have ${kpis.tasksPending} pending tasks.` });
  }


  return (
    <>
      <PageHeader title="Sales Agent Dashboard" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeLeads}</div>
            <p className="text-xs text-muted-foreground">Leads you are currently handling</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Follow-ups Due Today</CardTitle>
            <Phone className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{kpis.followUpsDue}</div>
            <p className="text-xs text-muted-foreground">Immediate actions required</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quotations Sent</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.quotationsSent}</div>
            <p className="text-xs text-muted-foreground">Total quotations sent this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orders Won (Month)</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.ordersWon}</div>
            <p className="text-xs text-muted-foreground">Confirmed sales this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commission Earned (₹)</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(kpis.commissionEarned)}</div>
            <p className="text-xs text-muted-foreground">Your estimated earnings this month</p>
          </CardContent>
        </Card>
      </div>
      
       <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Alerts & Reminders
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

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-4">
          <CardHeader>
            <CardTitle>Personal Sales Pipeline</CardTitle>
             <CardDescription>A visualization of your lead conversion stages.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <SalesFunnelChart leads={leads || []} />
          </CardContent>
        </Card>
        <Card className="col-span-full lg:col-span-3">
          <CardHeader>
            <CardTitle>Monthly Sales</CardTitle>
            <CardDescription>A chart showing your sales performance over the month.</CardDescription>
          </CardHeader>
          <CardContent>
            <OverviewChart orders={orders || []} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Quotes Status</CardTitle>
                <CardDescription>A summary of your quotation statuses (draft, sent, approved, expired).</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Quotation status summary will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Incentive Progress</CardTitle>
                <CardDescription>Coming Soon: A progress bar towards your next incentive slab.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Incentive progress bar will be here.</p>
            </CardContent>
        </Card>
      </div>
      
       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Tasks & Attendance</CardTitle>
                <CardDescription>Coming Soon: A summary of your tasks and attendance.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Task & attendance summary will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Reimbursements</CardTitle>
                <CardDescription>Coming Soon: A summary of your reimbursement requests.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Reimbursement status will be here.</p>
            </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Referrals & Offers</CardTitle>
                <CardDescription>Coming Soon: A summary of your referrals and available offers.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <Gift className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground ml-4">Referral and offer details will be displayed here.</p>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
