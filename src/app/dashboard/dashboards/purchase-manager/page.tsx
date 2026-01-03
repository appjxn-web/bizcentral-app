
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import {
  DollarSign,
  CreditCard,
  Package,
  FileText,
  Hourglass,
  ShoppingCart,
  PackageCheck,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { PurchaseOrder, Grn, PurchaseRequest } from '@/lib/types';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}


export default function PurchaseManagerDashboardPage() {
  const firestore = useFirestore();
  const { data: purchaseOrders, loading: poLoading } = useCollection<PurchaseOrder>(collection(firestore, 'purchaseOrders'));
  const { data: grns, loading: grnsLoading } = useCollection<Grn>(collection(firestore, 'grns'));
  const { data: purchaseRequests, loading: requestsLoading } = useCollection<PurchaseRequest>(collection(firestore, 'purchaseRequests'));

  const kpis = React.useMemo(() => {
    if (!purchaseOrders || !grns || !purchaseRequests) return { totalPurchaseValue: 0, purchaseOrdersRaised: 0, grnCompleted: 0, pendingGrn: 0, payablesOutstanding: 0, itcAvailable: 0 };
    
    const monthStart = new Date();
    monthStart.setDate(1);

    const totalPurchaseValue = purchaseOrders.filter(po => new Date(po.date) >= monthStart).reduce((sum, po) => sum + po.grandTotal, 0);
    const purchaseOrdersRaised = purchaseOrders.filter(po => new Date(po.date) >= monthStart).length;
    const grnCompleted = grns.filter(grn => new Date(grn.grnDate) >= monthStart).length;
    const pendingGrn = purchaseOrders.filter(po => po.status === 'Sent').length;
    const payablesOutstanding = grns.filter(grn => grn.paymentStatus !== 'Paid').reduce((sum, grn) => sum + grn.grandTotal, 0);
    const itcAvailable = grns.filter(grn => new Date(grn.grnDate) >= monthStart).reduce((sum, grn) => sum + grn.totalGst, 0);

    return { totalPurchaseValue, purchaseOrdersRaised, grnCompleted, pendingGrn, payablesOutstanding, itcAvailable };
  }, [purchaseOrders, grns, purchaseRequests]);

  const categorySpend: any[] = [];
  const pendingPOs = purchaseRequests?.filter(pr => pr.status === 'Approved').slice(0, 3) || [];
  const lowStockItems: any[] = [];


  return (
    <>
      <PageHeader title="Purchase Manager Dashboard" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Purchase Value</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.totalPurchaseValue)}</div>
            <p className="text-xs text-muted-foreground">Current month's purchase value</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payables Outstanding</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.payablesOutstanding)}</div>
            <p className="text-xs text-muted-foreground">Total amount due to suppliers</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Purchase Orders Raised</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.purchaseOrdersRaised}</div>
            <p className="text-xs text-muted-foreground">POs created this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">GRN Completed</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.grnCompleted}</div>
            <p className="text-xs text-muted-foreground">Goods received this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending GRN</CardTitle>
            <Hourglass className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pendingGrn}</div>
            <p className="text-xs text-muted-foreground">Purchase orders awaiting receipt</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Input Tax Credit (ITC)</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.itcAvailable)}</div>
            <p className="text-xs text-muted-foreground">Available from purchases this month</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Procurement Cycle & Delay Heatmap</CardTitle>
            <CardDescription>Coming Soon</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Chart will be displayed here.</p>
          </CardContent>
        </Card>
         <div className="grid md:grid-cols-2 gap-6">
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
                       <h4 className="font-semibold mb-1">Approved Purchase Requests</h4>
                       <div className="space-y-1">
                       {pendingPOs.map(po => (
                           <div key={po.id} className="flex justify-between text-muted-foreground">
                               <span>{po.productName.substring(0,20)}...</span>
                               <span className="font-mono">{formatCurrency(po.quantity * po.rate)}</span>
                           </div>
                       ))}
                       </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Vendor Scorecard</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Top vendor performance.</p>
              </CardContent>
            </Card>
         </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Price Variance</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Chart for Last Price vs Current Price.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Category-wise Spend</CardTitle>
                <CardDescription>Breakdown of purchase value by category.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                    <TableBody>
                        {categorySpend.map(category => (
                            <TableRow key={category.name}>
                                <TableCell className="font-medium">{category.name}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(category.value)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </CardContent>
            </Card>
         </div>
      </div>
    </>
  );
}
