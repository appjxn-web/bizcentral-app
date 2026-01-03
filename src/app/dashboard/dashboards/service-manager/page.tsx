
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
    Users,
    HeartHandshake,
    ThumbsUp,
    AlarmClockOff,
    FileClock,
  } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { users } from '@/lib/data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFirestore, useCollection } from '@/firebase';
import type { ServiceRequest } from '@/lib/types';
import { collection } from 'firebase/firestore';

export default function ServiceManagerDashboardPage() {
    const firestore = useFirestore();
    const { data: serviceRequests, loading } = useCollection<ServiceRequest>(collection(firestore, 'serviceRequests'));

    const kpis = React.useMemo(() => {
        if (!serviceRequests) return { openTickets: 0, criticalTickets: 0, avgResponseTime: 'N/A', avgResolutionTime: 'N/A', ftfr: 0, csat: 0 };
        
        const openTickets = serviceRequests.filter(sr => sr.status !== 'Completed' && sr.status !== 'Canceled').length;
        // Mocking other KPIs for now
        const criticalTickets = serviceRequests.filter(sr => sr.status === 'Pending' && new Date(sr.dateSubmitted) < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)).length;
        
        return {
            openTickets,
            criticalTickets,
            avgResponseTime: '2h 15m',
            avgResolutionTime: '1d 4h',
            ftfr: 82,
            csat: 91,
        };
    }, [serviceRequests]);

    const engineerPerformance = users.filter(u => u.role === 'Employee' || u.role === 'Service Manager').map(eng => {
        const assignedTickets = serviceRequests?.filter(sr => sr.assignedTo === eng.id) || [];
        const closedTickets = assignedTickets.filter(sr => sr.status === 'Completed').length;
        return {
            id: eng.id,
            name: eng.name,
            avatar: eng.avatar,
            ticketsAssigned: assignedTickets.length,
            ticketsClosed: closedTickets,
            ftfr: assignedTickets.length > 0 ? Math.round((closedTickets / assignedTickets.length) * 85) + 10 : 0 // Mocked for realism
        }
    });


  return (
    <>
      <PageHeader title="Service Manager Dashboard" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Service Tickets</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.openTickets}</div>
            <p className="text-xs text-muted-foreground">Current active service workload</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Tickets (SLA Breach)</CardTitle>
            <AlarmClockOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{kpis.criticalTickets}</div>
            <p className="text-xs text-muted-foreground">Tickets that have breached their SLA</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.avgResponseTime}</div>
            <p className="text-xs text-muted-foreground">Ticket open to first action</p>
          </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Resolution Time</CardTitle>
                <FileClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.avgResolutionTime}</div>
                <p className="text-xs text-muted-foreground">From ticket open to close</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">First-Time Fix Rate (FTFR)</CardTitle>
                <HeartHandshake className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.ftfr}%</div>
                <p className="text-xs text-muted-foreground">Issues resolved on first contact</p>
            </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer Satisfaction (CSAT)</CardTitle>
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.csat}%</div>
            <p className="text-xs text-muted-foreground">Based on post-service surveys</p>
          </CardContent>
        </Card>
      </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-4">
          <CardHeader>
            <CardTitle>Ticket Status Funnel</CardTitle>
             <CardDescription>Coming Soon</CardDescription>
          </CardHeader>
          <CardContent className="pl-2 flex items-center justify-center h-64">
            <p className="text-muted-foreground">Chart will be displayed here.</p>
          </CardContent>
        </Card>
        <Card className="col-span-full lg:col-span-3">
          <CardHeader>
            <CardTitle>SLA Trend Line</CardTitle>
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
                <CardTitle>Engineer Performance</CardTitle>
                <CardDescription>Key metrics for each service engineer.</CardDescription>
            </CardHeader>
             <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Engineer</TableHead>
                            <TableHead>Tickets Assigned</TableHead>
                            <TableHead>Tickets Closed</TableHead>
                            <TableHead>FTFR (%)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {engineerPerformance.map(eng => (
                            <TableRow key={eng.id}>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={eng.avatar} />
                                            <AvatarFallback>{eng.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <span>{eng.name}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{eng.ticketsAssigned}</TableCell>
                                <TableCell>{eng.ticketsClosed}</TableCell>
                                <TableCell>{eng.ftfr}%</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Installation KPIs</CardTitle>
                <CardDescription>Coming Soon: Metrics for new product installations.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Installation metrics will be displayed here.</p>
            </CardContent>
        </Card>
      </div>
      
       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Spares & Parts Usage</CardTitle>
                <CardDescription>Coming Soon: Consumption data for service parts.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Spares and parts consumption data.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Warranty vs AMC Tickets</CardTitle>
                <CardDescription>Coming Soon: Distribution of tickets by support type.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Ticket distribution chart will be displayed here.</p>
            </CardContent>
        </Card>
      </div>

       <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader>
                <CardTitle>Geography &amp; Asset-Wise Analysis</CardTitle>
                <CardDescription>Coming Soon: Charts for tickets by region and high-failure products.</CardDescription>
            </CardHeader>
             <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Charts for tickets by region and high-failure products.</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Alerts &amp; Escalations</CardTitle>
                <CardDescription>Coming Soon: Critical alerts like SLA breaches and repeat failures.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Critical alerts like SLA breaches and repeat failures.</p>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
