
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
  DollarSign,
  Package,
  Archive,
  AlertTriangle,
  TrendingDown,
  Repeat,
} from 'lucide-react';
import { useFirestore, useCollection } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Product } from '@/lib/types';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export default function InventoryManagerDashboardPage() {
  const firestore = useFirestore();
  const { data: products, loading } = useCollection<Product>(collection(firestore, 'products'));

  const kpis = React.useMemo(() => {
    if (!products) return { inventoryValue: 0, lowStockItems: 0, overstockItems: 0, inventoryTurnover: 0 };
    
    const inventoryValue = products.reduce((acc, p) => acc + ((p.openingStock || 0) * (p.cost || 0)), 0);
    const lowStockItems = products.filter(p => (p.openingStock || 0) < (p.minStockLevel || 0)).length;
    // Overstock logic can be complex, this is a simplification
    const overstockItems = products.filter(p => (p.openingStock || 0) > ((p.minStockLevel || 0) * 5) && p.minStockLevel).length;

    return {
      inventoryValue,
      lowStockItems,
      overstockItems,
      inventoryTurnover: 0, // Mock, needs sales data for accurate calculation
    };
  }, [products]);


  return (
    <>
      <PageHeader title="Inventory Manager Dashboard" />
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.inventoryValue)}</div>
            <p className="text-xs text-muted-foreground">Working capital blocked in inventory</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.lowStockItems}</div>
            <p className="text-xs text-muted-foreground">Items below their minimum stock level</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overstock Items</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.overstockItems}</div>
            <p className="text-xs text-muted-foreground">Items exceeding maximum stock level</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Turnover</CardTitle>
            <Repeat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inventoryTurnover}</div>
            <p className="text-xs text-muted-foreground">Times inventory is sold in a period</p>
          </CardContent>
        </Card>
      </div>

       <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Inward vs Outward Trend</CardTitle>
            <CardDescription>Coming Soon</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Chart for inward/outward movement will be here.</p>
          </CardContent>
        </Card>
        <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Reorder Alerts</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Items that have breached reorder levels.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Procurement Status</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Summary of open purchase orders.</p>
              </CardContent>
            </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Inventory Ageing & Dead Stock</CardTitle>
            <CardDescription>Coming Soon</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Heatmap/Chart for stock ageing will be here.</p>
          </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>Inventory Valuation & Costing</CardTitle>
                <CardDescription>Coming Soon</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-48">
                <p className="text-muted-foreground">Breakdown of inventory value by RM, WIP, and FG.</p>
            </CardContent>
        </Card>
         <div className="grid md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Warehouse & Location Performance</CardTitle>
                    <CardDescription>Coming Soon</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                    <p className="text-muted-foreground">Location utilization and pick accuracy metrics.</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Loss, Damage & Shrinkage</CardTitle>
                    <CardDescription>Coming Soon</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                    <p className="text-muted-foreground">Metrics on stock adjustments and losses.</p>
                </CardContent>
            </Card>
        </div>
         <div className="grid md:grid-cols-2 gap-6">
             <Card>
                <CardHeader>
                    <CardTitle>QC & Returns</CardTitle>
                    <CardDescription>Coming Soon</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-48">
                    <p className="text-muted-foreground">Metrics on QC failures, supplier rejections, and customer returns.</p>
                </CardContent>
            </Card>
         </div>
      </div>
    </>
  );
}
