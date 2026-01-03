

'use client';

import * as React from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import {
  Activity,
  CreditCard,
  DollarSign,
  Users,
  ArrowUp,
  ArrowDown,
  CircleDollarSign,
  ShoppingCart,
  Clock,
  UserPlus,
  UserX,
  Zap,
  FileText,
  BookOpen,
} from 'lucide-react';
import { OverviewChart } from '@/components/dashboard/overview-chart';
import { SalesFunnelChart } from '@/components/dashboard/sales-funnel-chart';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

const kpis = {
  totalRevenue: 0,
  ordersBooked: 0,
  collections: 0,
  outstanding: 0,
  newLeads: 0,
  activeLeads: 0,
  lostLeads: 0,
  avgResponseTime: '0h 0m',
};

const topProducts: any[] = [
];


export default function SalesManagerDashboardPage() {
  return (
    <>
      <PageHeader title="Sales Manager Dashboard" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(kpis.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground">+0% vs last month</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Orders Booked</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.ordersBooked}</div>
                <p className="text-xs text-muted-foreground">+0 vs last month</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Collections</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(kpis.collections)}</div>
                <p className="text-xs text-muted-foreground">+0% vs last month</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(kpis.outstanding)}</div>
                <p className="text-xs text-muted-foreground">+0% vs last month</p>
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
           <Button asChild>
            <Link href="/dashboard/finance-accounting/day-book">
              <BookOpen className="mr-2 h-4 w-4" /> Day Book
            </Link>
          </Button>
        </CardContent>
      </Card>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Leads (Month)</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.newLeads}</div>
            <p className="text-xs text-muted-foreground">+0% vs last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeLeads}</div>
            <p className="text-xs text-muted-foreground">Currently in the pipeline</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lost Leads (Month)</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.lostLeads}</div>
            <p className="text-xs text-muted-foreground">Leads that did not convert</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Response Time</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.avgResponseTime}</div>
            <p className="text-xs text-muted-foreground">Time to first contact</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-4">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <OverviewChart />
          </CardContent>
        </Card>
        <Card className="col-span-full lg:col-span-3">
          <CardHeader>
            <CardTitle>Sales Funnel</CardTitle>
            <CardDescription>
              A visualization of your sales pipeline stages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SalesFunnelChart />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Top Selling Products</CardTitle>
                <CardDescription>Your most profitable products this month.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {topProducts.map(p => (
                            <TableRow key={p.name}>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8 rounded-md">
                                            <AvatarImage src={p.avatar} />
                                            <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="text-sm font-medium">{p.name}</p>
                                            <p className="text-xs text-muted-foreground">{p.category}</p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(p.revenue)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Coming Soon</CardTitle>
                <CardDescription>More sales analytics will be available here.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Dealer/Sales Team performance chart</p>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
