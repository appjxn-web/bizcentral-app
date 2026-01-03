
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Target, TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import Link from 'next/link';

export default function CommandCenterDashboardPage() {
  return (
    <>
      <PageHeader title="Command Center">
        <Button asChild>
            <Link href="/dashboard/command-center/goals">
                <PlusCircle className="mr-2 h-4 w-4" />
                New Goal
            </Link>
        </Button>
      </PageHeader>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Goals</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5</div>
            <p className="text-xs text-muted-foreground">Company-wide objectives</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Progress</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">62%</div>
            <p className="text-xs text-muted-foreground">Weighted average completion</p>
          </CardContent>
        </Card>
      </div>

       <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-[450px]">
        <div className="flex flex-col items-center gap-1 text-center">
          <h3 className="text-2xl font-bold tracking-tight">
            More Widgets Coming Soon
          </h3>
          <p className="text-sm text-muted-foreground">
            Goal lists, timeline strips, and notepads will be displayed here.
          </p>
        </div>
      </div>
    </>
  );
}
