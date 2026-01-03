
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
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Factory,
  Percent,
  TrendingUp,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { users } from '@/lib/data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFirestore, useCollection } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { WorkOrder } from '@/lib/types';
import { format, startOfDay, endOfDay, isToday, isPast } from 'date-fns';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}


export default function ProductionManagerDashboardPage() {
  const firestore = useFirestore();
  const { data: workOrders, loading } = useCollection<WorkOrder>(collection(firestore, 'workOrders'));

  const kpis = React.useMemo(() => {
    if (!workOrders) {
      return {
        plannedOutput: 0,
        actualOutput: 0,
        efficiency: 0,
        rejectionRate: 0,
        dueToday: 0,
        delayed: 0,
        totalOpen: 0,
      };
    }

    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    const plannedToday = workOrders.filter(wo => {
      const createdAt = new Date(wo.createdAt);
      return createdAt >= startOfToday && createdAt <= endOfToday;
    });

    const completedToday = workOrders.filter(wo => 
        (wo as any).completedAt && new Date((wo as any).completedAt) >= startOfToday && new Date((wo as any).completedAt) <= endOfToday
    );

    const plannedOutput = plannedToday.reduce((sum, wo) => sum + wo.quantity, 0);
    const actualOutput = completedToday.filter(wo => (wo as any).qcStatus !== 'Failed').reduce((sum, wo) => sum + wo.quantity, 0);
    
    const efficiency = plannedOutput > 0 ? (actualOutput / plannedOutput) * 100 : 0;
    
    const rejectedToday = completedToday.filter(wo => (wo as any).qcStatus === 'Failed').length;
    const rejectionRate = completedToday.length > 0 ? (rejectedToday / completedToday.length) * 100 : 0;

    const dueToday = workOrders.filter(wo => wo.dueDate && isToday(new Date(wo.dueDate)) && wo.status !== 'Completed').length;
    const delayed = workOrders.filter(wo => wo.dueDate && isPast(new Date(wo.dueDate)) && wo.status !== 'Completed').length;

    const totalOpen = workOrders.filter(wo => wo.status === 'Pending' || wo.status === 'In Progress' || (wo as any).qcStatus === 'Pending').length;

    return {
      plannedOutput,
      actualOutput,
      efficiency,
      rejectionRate,
      dueToday,
      delayed,
      totalOpen,
    };
  }, [workOrders]);

  const workOrderStatusData = React.useMemo(() => {
    if (!workOrders) return [];
    const statuses: WorkOrder['status'][] = ['Pending', 'In Progress', 'Completed', 'Canceled'];
    const data = statuses.map(status => ({
      status,
      count: workOrders.filter(wo => wo.status === status).length,
    }));
    // Add QC Hold as a conceptual status
    data.push({
      status: 'QC Hold',
      count: workOrders.filter(wo => (wo as any).qcStatus === 'Pending' && wo.status === 'Completed').length
    });
    return data;
  }, [workOrders]);
  
  const weeklyOutputData: any[] = [
  ];
  
  const delayedOrders: any[] = [
  ]
  
  const machineDowntime: any[] = [
  ]
  
  const manpowerData: any[] = [
  ]
  
  const pendingPOs: any[] = [
  ];
  
  const lowStockItems: any[] = [
  ]
  
  const costControlKpis: any[] = [
  ];


  const totalOpenWorkOrders = kpis.totalOpen;

  return (
    <>
      <PageHeader title="Production Manager Dashboard" />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planned vs Actual</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.actualOutput} / {kpis.plannedOutput}</div>
            <p className="text-xs text-muted-foreground">Units produced today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Production Efficiency</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.efficiency.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Actual vs. planned output</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejection Rate</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.rejectionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Quality control failures</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Work Orders Due</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.dueToday}</div>
            <p className="text-xs text-muted-foreground">Orders to be completed today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delayed Orders</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{kpis.delayed}</div>
            <p className="text-xs text-muted-foreground">Work orders past due date</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Work Orders</CardTitle>
            <Factory className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOpenWorkOrders}</div>
            <p className="text-xs text-muted-foreground">Planned, In Progress, &amp; QC Hold</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Work Order Status Distribution</CardTitle>
            <CardDescription>Current distribution of all work orders by status.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={workOrderStatusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="hsl(var(--primary))" name="Work Orders" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weekly Production Output</CardTitle>
             <CardDescription>Track the number of units produced each day this week.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyOutputData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="output" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
            <CardHeader>
                <CardTitle>Delayed Work Orders</CardTitle>
                <CardDescription>Work orders currently behind schedule.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Delay</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {delayedOrders.map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-mono">{order.id}</TableCell>
                                <TableCell>{order.product}</TableCell>
                                <TableCell><Badge variant="destructive">{order.delay}</Badge></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
         <Card>
            <CardHeader>
                <CardTitle>Machine Downtime</CardTitle>
                <CardDescription>Machines currently offline or under maintenance.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Machine ID</TableHead>
                            <TableHead>Downtime</TableHead>
                            <TableHead>Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {machineDowntime.map(machine => (
                            <TableRow key={machine.id}>
                                <TableCell className="font-mono">{machine.id}</TableCell>
                                <TableCell>{machine.downtime}</TableCell>
                                <TableCell>{machine.reason}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Manpower Productivity</CardTitle>
                <CardDescription>Today's output per worker.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Worker</TableHead>
                            <TableHead>Output</TableHead>
                            <TableHead>Rejection %</TableHead>
                            <TableHead>Hours</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {manpowerData.map(worker => (
                            <TableRow key={worker.id}>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={worker.avatar} />
                                            <AvatarFallback>{worker.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <span>{worker.name}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{worker.output}</TableCell>
                                <TableCell>{worker.rejectionRate}%</TableCell>
                                <TableCell>{worker.hoursLogged.toFixed(1)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Cost Control</CardTitle>
                <CardDescription>Key financial metrics for production efficiency.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableBody>
                        {costControlKpis.map(kpi => (
                            <TableRow key={kpi.name}>
                                <TableCell className="font-medium">{kpi.name}</TableCell>
                                <TableCell className="text-right font-mono font-bold">{kpi.value}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="text-yellow-500"/>Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm pt-4">
                <div>
                    <h4 className="font-semibold mb-1">Low Stock Items</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                        {lowStockItems.map(i => <li key={i.name}>{i.name} ({i.current}/{i.min})</li>)}
                    </ul>
                </div>
                <div>
                       <h4 className="font-semibold mb-1">Pending POs</h4>
                       <div className="space-y-1">
                       {pendingPOs.map(po => (
                           <div key={po.id} className="flex justify-between text-muted-foreground">
                               <span>{po.id}</span>
                               <span className="font-mono">{formatCurrency(po.amount)}</span>
                           </div>
                       ))}
                       </div>
                    </div>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
