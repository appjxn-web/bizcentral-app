
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
  Users,
  UserX,
  UserCheck,
  Banknote,
  TrendingDown,
  CalendarCheck,
  Clock,
  Briefcase,
  Users2,
  ThumbsUp,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { User, Vacancy, Applicant } from '@/lib/types';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export default function HrManagerDashboardPage() {
  const firestore = useFirestore();
  const { data: users, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
  const { data: vacancies, loading: vacanciesLoading } = useCollection<Vacancy>(collection(firestore, 'vacancies'));
  const { data: applicants, loading: applicantsLoading } = useCollection<Applicant>(collection(firestore, 'applicants'));
  // Mock Attendance data
  const { data: attendance } = useCollection<any>(collection(firestore, 'attendance'));


  const kpis = React.useMemo(() => {
    if (!users) return { totalEmployees: 0, attritionRate: 0, presentToday: 0, totalSalaryPayable: 0 };
    
    const totalEmployees = users.length;
    const presentToday = attendance?.length || 0; // Simplified
    
    return {
      totalEmployees,
      attritionRate: 0, // Mock
      presentToday,
      totalSalaryPayable: 0, // Mock
    };
  }, [users, attendance]);

  const hiringKpis = React.useMemo(() => {
    const openPositions = vacancies?.filter(v => v.status === 'Open').length || 0;
    const candidatesInPipeline = applicants?.filter(a => ['Shortlisted', 'Interviewing'].includes(a.status)).length || 0;
    const hiredCount = applicants?.filter(a => a.status === 'Hired').length || 0;
    const offeredCount = applicants?.filter(a => ['Offered', 'Hired'].includes(a.status)).length || 0;
    const offerAcceptanceRate = offeredCount > 0 ? (hiredCount / offeredCount) * 100 : 0;
    
    return {
      openPositions,
      candidatesInPipeline,
      offerAcceptanceRate,
    };
  }, [vacancies, applicants]);


  return (
    <>
      <PageHeader title="HR Manager Dashboard" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">Active headcount on-roll</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attrition Rate (Annualized)</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.attritionRate}%</div>
            <p className="text-xs text-muted-foreground">Employee turnover rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present Today</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.presentToday}</div>
            <p className="text-xs text-muted-foreground">Employees marked as present</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Salary Payable</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.totalSalaryPayable)}</div>
            <p className="text-xs text-muted-foreground">For the current pay cycle</p>
          </CardContent>
        </Card>
      </div>
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-3">
          <CardHeader>
            <CardTitle>Attendance Trend</CardTitle>
             <CardDescription>Coming Soon</CardDescription>
          </CardHeader>
          <CardContent className="pl-2 flex items-center justify-center h-64">
            <p className="text-muted-foreground">Chart will be displayed here.</p>
          </CardContent>
        </Card>
        <Card className="col-span-full lg:col-span-4">
          <CardHeader>
            <CardTitle>Leave Trend</CardTitle>
            <CardDescription>Coming Soon</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
             <p className="text-muted-foreground">Chart will be displayed here.</p>
          </CardContent>
        </Card>
      </div>

       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Payroll & Compliance</CardTitle>
                <CardDescription>Coming Soon: Payroll status and statutory due dates.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Payroll & Compliance KPIs will be displayed here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Hiring & Vacancies</CardTitle>
                <CardDescription>A snapshot of the current recruitment pipeline.</CardDescription>
            </CardHeader>
             <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                      <span>Open Positions</span>
                    </div>
                    <span className="font-bold">{hiringKpis.openPositions}</span>
                  </div>
                   <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users2 className="h-4 w-4" />
                      <span>Candidates in Pipeline</span>
                    </div>
                    <span className="font-bold">{hiringKpis.candidatesInPipeline}</span>
                  </div>
                   <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ThumbsUp className="h-4 w-4" />
                      <span>Offer Acceptance Rate</span>
                    </div>
                    <span className="font-bold">{hiringKpis.offerAcceptanceRate.toFixed(1)}%</span>
                  </div>
                </div>
             </CardContent>
             <CardFooter>
                <Button asChild variant="secondary" className="w-full">
                    <Link href="/dashboard/hr/vacancies">View All Vacancies</Link>
                </Button>
             </CardFooter>
        </Card>
      </div>
       <div className="grid gap-4 md:grid-cols-3">
        <Card>
            <CardHeader>
                <CardTitle>Training & Skill Development</CardTitle>
                 <CardDescription>Coming Soon: KPIs for training sessions, skill gaps, and costs.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground text-center">KPIs for training sessions, skill gaps, and costs will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Employee Performance</CardTitle>
                 <CardDescription>Coming Soon: Productivity metrics and task completion rates.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Productivity KPIs will be displayed here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Contract Labour & Workers</CardTitle>
                <CardDescription>Coming Soon: Metrics for contract workers.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground text-center">Metrics for contract workers will be displayed here.</p>
            </CardContent>
        </Card>
      </div>
       <div className="grid gap-4 md:grid-cols-2">
         <Card>
            <CardHeader>
                <CardTitle>Discipline & Grievance</CardTitle>
                <CardDescription>Coming Soon: Metrics for complaints and disciplinary actions.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Metrics for open complaints and disciplinary actions will be here.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Alerts & Exceptions</CardTitle>
                <CardDescription>Coming Soon: Critical HR alerts will appear here.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Alerts will be displayed here.</p>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
