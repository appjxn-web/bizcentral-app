
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
  ClipboardList,
  CalendarCheck,
  CircleDollarSign,
  Users,
  AlertTriangle,
  CheckCircle,
  Bell,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useUser, useFirestore, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Task, ReimbursementRequest, Referral } from '@/lib/types';
import { format } from 'date-fns';

// Mock Data
const kpis_mock = {
  attendanceStatus: 'Absent',
};

export default function EmployeeDashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const tasksQuery = user ? query(collection(firestore, 'tasks'), where('assigneeId', '==', user.uid)) : null;
  const reimbursementsQuery = user ? query(collection(firestore, 'reimbursementRequests'), where('createdByUid', '==', user.uid)) : null;
  const referralsQuery = user ? query(collection(firestore, 'users', user.uid, 'referrals')) : null;
  const attendanceQuery = user ? query(collection(firestore, 'users', user.uid, 'attendance'), where('date', '==', format(new Date(), 'yyyy-MM-dd'))) : null;

  const { data: tasks } = useCollection<Task>(tasksQuery);
  const { data: reimbursements } = useCollection<ReimbursementRequest>(reimbursementsQuery);
  const { data: referrals } = useCollection<Referral>(referralsQuery);
  const { data: todayAttendance } = useCollection<any>(attendanceQuery);
  
  const kpis = React.useMemo(() => {
    const pendingTasks = tasks?.filter(t => t.status === 'Pending' || t.status === 'In Progress').length || 0;
    const attendanceStatus = (todayAttendance && todayAttendance.length > 0) ? 'Present' : 'Absent';
    const pendingReimbursements = reimbursements?.filter(r => r.status === 'Pending Approval').reduce((sum, r) => sum + r.requestAmount, 0) || 0;
    const referralsMtd = referrals?.filter(r => new Date(r.createdAt.toDate()).getMonth() === new Date().getMonth()).length || 0;
    return { pendingTasks, attendanceStatus, pendingReimbursements, referralsMtd };
  }, [tasks, reimbursements, referrals, todayAttendance]);


  const taskBreakdown = React.useMemo(() => {
    if (!tasks) return { total: 0, completed: 0, completionRate: 0 };
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Completed').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    return { total, completed, completionRate };
  }, [tasks]);

  const alerts: any[] = [];
  if (kpis.pendingTasks > 0) {
    alerts.push({ id: 1, text: `You have ${kpis.pendingTasks} pending tasks.`, action: '/dashboard/my-task', icon: ClipboardList });
  }
  if (kpis.pendingReimbursements > 0) {
    alerts.push({ id: 2, text: `You have pending reimbursements worth ₹${kpis.pendingReimbursements.toFixed(2)}.`, action: '/dashboard/reimbursement', icon: CircleDollarSign });
  }


  return (
    <>
      <PageHeader title="My Dashboard" />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pendingTasks}</div>
            <p className="text-xs text-muted-foreground">Tasks requiring your attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attendance Status</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div className="text-2xl font-bold">{kpis.attendanceStatus}</div>
            <p className="text-xs text-muted-foreground">Your current punch-in status</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reimbursements</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.pendingReimbursements.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Claims awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Referrals (MTD)</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.referralsMtd}</div>
            <p className="text-xs text-muted-foreground">New referrals made this month</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Task Productivity</CardTitle>
                <CardDescription>A summary of your task completion for this cycle.</CardDescription>
            </CardHeader>
            <CardContent>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Completion Rate</span>
                        <span className="font-bold text-lg">{taskBreakdown.completionRate.toFixed(0)}%</span>
                    </div>
                    <Progress value={taskBreakdown.completionRate} aria-label={`${taskBreakdown.completionRate.toFixed(0)}% of tasks completed`} />
                    <div className="flex justify-between text-sm">
                        <span><span className="font-semibold">{taskBreakdown.completed}</span> completed</span>
                        <span><span className="font-semibold">{taskBreakdown.total}</span> total</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                 <Button asChild variant="secondary" className="w-full">
                    <Link href="/dashboard/my-task">View All Tasks</Link>
                </Button>
            </CardFooter>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Attendance Calendar</CardTitle>
                <CardDescription>Coming Soon: A calendar view of your monthly attendance.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Calendar view will be here.</p>
            </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Reimbursement Status</CardTitle>
                <CardDescription>Coming Soon: A summary of your submitted claims.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Claim status summary will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Incentives</CardTitle>
                <CardDescription>Coming Soon: A summary of your earned incentives.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Incentives summary will be here.</p>
            </CardContent>
        </Card>
      </div>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Referrals Funnel</CardTitle>
                <CardDescription>Coming Soon: A funnel view of your referral progress.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Referral funnel chart will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>My Deals &amp; Offers</CardTitle>
                <CardDescription>Coming Soon: A summary of deals you can participate in.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Active deals and offers will be listed here.</p>
            </CardContent>
        </Card>
      </div>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Posts &amp; Engagement</CardTitle>
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
