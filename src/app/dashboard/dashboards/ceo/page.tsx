

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
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OverviewChart } from '@/components/dashboard/overview-chart';
import { SalesFunnelChart } from '@/components/dashboard/sales-funnel-chart';
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
  Banknote,
  TrendingUp,
  AlertTriangle,
  Hourglass,
  Scale,
  Landmark,
  Percent,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import type { Order, User, Product, PurchaseRequest, CoaLedger, JournalVoucher, CoaGroup, Lead } from '@/lib/types';
import { useRole } from '../../_components/role-provider';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export default function CeoDashboardPage() {
  const firestore = useFirestore();
  const { currentRole } = useRole();
  const isAdminOrCEO = currentRole === 'Admin' || currentRole === 'CEO';

  const ordersQuery = isAdminOrCEO ? collection(firestore, 'orders') : null;
  const { data: ordersData } = useCollection<Order>(ordersQuery);
  const { data: usersData } = useCollection<User>(collection(firestore, 'users'));
  const { data: productsData } = useCollection<Product>(collection(firestore, 'products'));
  const { data: purchaseRequestsData } = useCollection<PurchaseRequest>(query(collection(firestore, 'purchaseRequests'), where('status', '==', 'Pending'), limit(5)));
  const { data: reimbursementRequestsData } = useCollection<any>(query(collection(firestore, 'reimbursementRequests'), where('status', '==', 'Pending Approval')));
  const { data: coaGroups } = useCollection<CoaGroup>(collection(firestore, 'coa_groups'));
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: journalVouchers } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));
  const { data: leadsData } = useCollection<Lead>(collection(firestore, 'leads'));


  const liveBalances = React.useMemo(() => {
    const balances = new Map<string, number>();
    if (!coaLedgers) return balances;

    coaLedgers.forEach(acc => {
      const openingBal = acc.openingBalance?.amount || 0;
      const balance = acc.openingBalance?.drCr === 'CR' ? -openingBal : openingBal;
      balances.set(acc.id, balance);
    });

    if (journalVouchers) {
      const sortedVouchers = [...journalVouchers].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      sortedVouchers.forEach(jv => {
        jv.entries.forEach(entry => {
          if (balances.has(entry.accountId)) {
            const currentBal = balances.get(entry.accountId)!;
            const newBal = currentBal + (entry.debit || 0) - (entry.credit || 0);
            balances.set(entry.accountId, newBal);
          }
        });
      });
    }
    return balances;
  }, [coaLedgers, journalVouchers]);


  const kpis = React.useMemo(() => {
    const totalRevenue = ordersData?.reduce((acc, order) => acc + (order.grandTotal || 0), 0) || 0;
    
    let totalCost = 0;
    if(ordersData && productsData) {
        totalCost = (ordersData.reduce((acc, order) => {
            return acc + order.items.reduce((itemAcc, item) => {
                const product = productsData.find(p => p.id === item.productId);
                return itemAcc + (product?.cost || 0) * item.quantity;
            }, 0);
        }, 0));
    }
    
    const netProfit = totalRevenue - totalCost;
    const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    const ebitda = netProfit * 1.5; // Mock calculation
    
    let assetsBalance = 0;
    let liabilitiesBalance = 0;
    if (coaGroups && coaLedgers && liveBalances) {
        const getGroupBalance = (groupId: string): number => {
            const ledgers = coaLedgers.filter(l => l.groupId === groupId);
            const ledgerBalance = ledgers.reduce((sum, l) => sum + (liveBalances.get(l.id) || 0), 0);
            const childGroups = coaGroups.filter(g => g.parentId === groupId);
            const childrenBalance = childGroups.reduce((sum, g) => sum + getGroupBalance(g.id), 0);
            return ledgerBalance + childrenBalance;
        }

        const assetsGroup = coaGroups.find(g => g.name === 'ASSETS' && g.level === 0);
        const liabilitiesGroup = coaGroups.find(g => g.name === 'LIABILITIES' && g.level === 0);

        if(assetsGroup) assetsBalance = getGroupBalance(assetsGroup.id);
        if(liabilitiesGroup) liabilitiesBalance = Math.abs(getGroupBalance(liabilitiesGroup.id));
    }
    
    const netWorth = assetsBalance - liabilitiesBalance;

    return { totalRevenue, netProfit, netProfitMargin, grossMargin, ebitda, netWorth };
  }, [ordersData, productsData, coaGroups, coaLedgers, liveBalances]);
  
  const accountBalances = React.useMemo(() => {
    if (!coaGroups || !coaLedgers || !liveBalances) return [];

    const cashAndBankGroup = coaGroups.find(g => g.name === 'Cash & Bank');
    if (!cashAndBankGroup) return [];

    return coaLedgers
      .filter(l => l.groupId === cashAndBankGroup.id)
      .map(acc => ({
        name: acc.name,
        balance: liveBalances.get(acc.id) || 0,
      }));
  }, [coaGroups, coaLedgers, liveBalances]);

  const receivablesAndPayables = React.useMemo(() => {
    if (!coaGroups || !coaLedgers || !liveBalances) return { receivables: 0, payables: 0 };
    
    const getGroupBalance = (groupId: string): number => {
      if (!coaLedgers || !coaGroups) return 0;
      const ledgers = coaLedgers.filter(l => l.groupId === groupId);
      const ledgerBalance = ledgers.reduce((sum, l) => sum + (liveBalances.get(l.id) || 0), 0);
      const childGroups = coaGroups.filter(g => g.parentId === groupId);
      const childrenBalance = childGroups.reduce((sum, g) => sum + getGroupBalance(g.id), 0);
      return ledgerBalance + childrenBalance;
    };
    
    const receivablesGroup = coaGroups.find(g => g.name === 'Trade Receivables');
    const payablesGroup = coaGroups.find(g => g.name === 'Trade Payables');

    // Receivables are assets (debit balance), so the raw sum is correct.
    const receivables = receivablesGroup ? getGroupBalance(receivablesGroup.id) : 0;
    // Payables are liabilities (credit balance, negative in our system), so we take the absolute value.
    const payables = payablesGroup ? Math.abs(getGroupBalance(payablesGroup.id)) : 0;

    return { receivables, payables };
  }, [coaGroups, coaLedgers, liveBalances]);


  const topPartners = React.useMemo(() => {
    if (!usersData || !ordersData) return [];
    
    const partnerSales: Record<string, { user: User, sales: number }> = {};

    usersData.filter(u => u.role === 'Partner' || u.role === 'Dealer' || u.role === 'Franchisee').forEach(p => {
        partnerSales[p.id] = { user: p, sales: 0 };
    });

    ordersData.forEach(order => {
        if(order.assignedToUid && partnerSales[order.assignedToUid]) {
            partnerSales[order.assignedToUid].sales += order.grandTotal;
        }
    });

    return Object.values(partnerSales)
        .sort((a,b) => b.sales - a.sales)
        .slice(0, 3);

  }, [usersData, ordersData]);
  
  const operationalKpis = React.useMemo(() => {
    if (!coaGroups || !coaLedgers || !liveBalances || !kpis.totalRevenue || !usersData?.length) {
      return [
        { name: 'Expense Ratio', value: '0.0%', trend: 'stable' },
        { name: 'Salary % of Revenue', value: '0.0%', trend: 'stable' },
        { name: 'Revenue per Employee', value: '₹0', trend: 'stable' },
        { name: 'Asset Utilization', value: '0.0%', trend: 'stable' },
      ];
    }
  
    const getGroupBalance = (groupName: string): number => {
        const group = coaGroups.find(g => g.name === groupName);
        if (!group) return 0;
        
        const ledgers = coaLedgers.filter(l => l.groupId === group.id);
        const ledgerBalance = ledgers.reduce((sum, l) => sum + (liveBalances.get(l.id) || 0), 0);
        const childGroups = coaGroups.filter(g => g.parentId === group.id);
        const childrenBalance = childGroups.reduce((sum, g) => sum + getGroupBalance(g.name), 0);
        return ledgerBalance + childrenBalance;
    };
    
    const totalExpenses = Math.abs(getGroupBalance('EXPENSES (INDIRECT)'));
    const totalAssets = getGroupBalance('ASSETS');
    const totalSalaries = Math.abs(getGroupBalance('Salaries & Wages'));

    const { totalRevenue } = kpis;
    
    const expenseRatio = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
    const salaryPercentage = totalRevenue > 0 ? (totalSalaries / totalRevenue) * 100 : 0;
    const revenuePerEmployee = totalRevenue / usersData.length;
    const assetUtilization = totalAssets > 0 ? (totalRevenue / totalAssets) * 100 : 0;

    return [
      { name: 'Expense Ratio', value: `${expenseRatio.toFixed(1)}%`, trend: 'down' },
      { name: 'Salary % of Revenue', value: `${salaryPercentage.toFixed(1)}%`, trend: 'stable' },
      { name: 'Revenue per Employee', value: `₹${revenuePerEmployee.toLocaleString('en-IN', {maximumFractionDigits: 0})}`, trend: 'up' },
      { name: 'Asset Utilization', value: `${assetUtilization.toFixed(1)}%`, trend: 'up' },
  ];
  }, [coaGroups, coaLedgers, liveBalances, kpis.totalRevenue, usersData]);

  const lowStockItems = React.useMemo(() => {
    if (!productsData) return [];
    return productsData.filter(p => p.openingStock < (p.minStockLevel || 0)).slice(0, 2);
  }, [productsData]);


  const kpiCards = [
    { title: "Total Revenue", value: formatCurrency(kpis.totalRevenue), change: 12.5, icon: DollarSign, trend: 'up' as const },
    { title: "Net Profit", value: formatCurrency(kpis.netProfit), change: 15.2, icon: CircleDollarSign, trend: 'up' as const },
    { title: "Net Profit Margin", value: `${kpis.netProfitMargin.toFixed(2)}%`, change: 2.2, icon: TrendingUp, trend: 'up' as const },
    { title: "Gross Margin %", value: `${kpis.grossMargin.toFixed(2)}%`, change: -1.5, icon: Percent, trend: 'down' as const },
    { title: "EBITDA", value: formatCurrency(kpis.ebitda), change: 18.0, icon: Activity, trend: 'up' as const },
    { title: "Net Worth", value: formatCurrency(kpis.netWorth), change: 8.3, icon: Scale, trend: 'up' as const },
  ];

  const TrendArrow = ({ trend, change }: { trend: 'up' | 'down', change: number }) => {
    const isUp = trend === 'up';
    const color = isUp ? 'text-green-500' : 'text-red-500';
    return (
      <span className={`text-xs text-muted-foreground flex items-center ${color}`}>
        {isUp ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        {change}% vs last period
      </span>
    );
  };

  return (
    <>
      <PageHeader title="CEO Dashboard" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map(kpi => (
          <Card key={kpi.title}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                    <kpi.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                </TooltipTrigger>
                <TooltipContent>
                  <p>vs last period</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <TrendArrow trend={kpi.trend} change={kpi.change} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild>
            <Link href="/dashboard/finance-accounting/day-book">
              <BookOpen className="mr-2 h-4 w-4" /> Day Book
            </Link>
          </Button>
        </CardContent>
      </Card>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
         <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Account Balances</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
                <TableBody>
                    {accountBalances.map(acc => (
                        <TableRow key={acc.name}>
                            <TableCell className="font-medium flex items-center gap-2">
                                <Landmark className="h-4 w-4 text-muted-foreground"/> {acc.name}
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(acc.balance)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receivables vs Payables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex justify-between items-center p-4 rounded-md bg-green-50 dark:bg-green-900/30">
                <div className="flex items-center gap-2">
                    <ArrowDown className="h-5 w-5 text-green-600"/>
                    <span className="font-semibold">Receivables</span>
                </div>
                <span className="font-mono text-lg font-bold">{formatCurrency(receivablesAndPayables.receivables)}</span>
             </div>
             <div className="flex justify-between items-center p-4 rounded-md bg-red-50 dark:bg-red-900/30">
                 <div className="flex items-center gap-2">
                    <ArrowUp className="h-5 w-5 text-red-600"/>
                    <span className="font-semibold">Payables</span>
                </div>
                <span className="font-mono text-lg font-bold">{formatCurrency(receivablesAndPayables.payables)}</span>
             </div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Approvals Pending</CardTitle>
          </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex justify-between items-center p-4 rounded-md bg-yellow-50 dark:bg-yellow-900/30">
                <div className="flex items-center gap-2">
                    <Hourglass className="h-5 w-5 text-yellow-600"/>
                    <span className="font-semibold">Purchase Requests</span>
                </div>
                <span className="font-mono text-lg font-bold">{purchaseRequestsData?.length || 0}</span>
             </div>
             <div className="flex justify-between items-center p-4 rounded-md bg-yellow-50 dark:bg-yellow-900/30">
                 <div className="flex items-center gap-2">
                    <Hourglass className="h-5 w-5 text-yellow-600"/>
                    <span className="font-semibold">Reimbursements</span>
                </div>
                <span className="font-mono text-lg font-bold">{reimbursementRequestsData?.length || 0}</span>
             </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-full lg:col-span-4">
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <OverviewChart orders={ordersData || []}/>
          </CardContent>
        </Card>
        <Card className="col-span-full lg:col-span-3">
          <CardHeader>
            <CardTitle>Sales & Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="direct">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="direct">Direct</TabsTrigger>
                <TabsTrigger value="dealer">Dealer</TabsTrigger>
              </TabsList>
              <TabsContent value="direct">
                <SalesFunnelChart leads={leadsData || []} />
              </TabsContent>
              <TabsContent value="dealer">
                <SalesFunnelChart leads={leadsData || []} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
         <div className="col-span-full grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Partner Performance</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {topPartners.map(p => (
                                <TableRow key={p.user.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8"><AvatarImage src={(p.user as any).avatar} /><AvatarFallback>{p.user.name?.charAt(0) || p.user.email?.charAt(0) || 'P'}</AvatarFallback></Avatar>
                                            <div>
                                                <p className="text-sm font-medium">{p.user.name}</p>
                                                <p className="text-xs text-muted-foreground">{p.user.role}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(p.sales)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Operational Efficiency</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            {operationalKpis.map(kpi => (
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
                            {lowStockItems.length > 0 ? lowStockItems.map(i => <li key={i.id}>{i.name} ({i.openingStock}/{i.minStockLevel})</li>) : <li>No low stock items.</li>}
                        </ul>
                    </div>
                    <div>
                       <h4 className="font-semibold mb-1">Pending POs</h4>
                       <div className="space-y-1">
                       {purchaseRequestsData && purchaseRequestsData.length > 0 ? purchaseRequestsData.map(po => (
                           <div key={po.id} className="flex justify-between text-muted-foreground">
                               <span>{po.productName.substring(0,20)}...</span>
                               <span className="font-mono">{formatCurrency(po.quantity * po.rate)}</span>
                           </div>
                       )) : <li>No pending POs.</li>}
                       </div>
                    </div>
                </CardContent>
            </Card>
         </div>
      </div>
    </>
  );
}
