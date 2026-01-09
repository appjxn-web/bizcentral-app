
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
import { Loader2, Package, Boxes, Archive } from 'lucide-react';
import { useFirestore, useUser, useCollection } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { Product } from '@/lib/types';
import Image from 'next/image';

interface PartnerStockItem {
  id: string;
  quantity: number;
}

export default function MyStockPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const partnerStockQuery = user ? query(collection(firestore, 'users', user.uid, 'stock')) : null;
  const { data: partnerStock, loading: stockLoading } = useCollection<PartnerStockItem>(partnerStockQuery);
  const { data: allProducts, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));

  const stockWithDetails = React.useMemo(() => {
    if (!partnerStock || !allProducts) return [];
    return partnerStock.map(stockItem => {
      const productDetails = allProducts.find(p => p.id === stockItem.id);
      return {
        ...stockItem,
        product: productDetails,
      };
    }).filter(item => item.product); // Filter out items where product details might not be found
  }, [partnerStock, allProducts]);

  const kpis = React.useMemo(() => {
    const totalItems = stockWithDetails.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueItems = stockWithDetails.length;
    const stockValue = stockWithDetails.reduce((sum, item) => sum + (item.quantity * (item.product?.cost || 0)), 0);
    return { totalItems, uniqueItems, stockValue };
  }, [stockWithDetails]);
  
  const loading = stockLoading || productsLoading;

  return (
    <>
      <PageHeader title="My Stock" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalItems}</div>
            <p className="text-xs text-muted-foreground">Sum of all quantities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Products</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.uniqueItems}</div>
            <p className="text-xs text-muted-foreground">Different product SKUs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approx. Stock Value</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(kpis.stockValue)}
            </div>
            <p className="text-xs text-muted-foreground">Based on product cost</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Inventory</CardTitle>
          <CardDescription>
            A list of all products currently in your possession.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Quantity on Hand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : stockWithDetails.length > 0 ? (
                stockWithDetails.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-4">
                        <Image
                          src={item.product?.imageUrl || 'https://placehold.co/64x64'}
                          alt={item.product?.name || 'Product Image'}
                          width={48}
                          height={48}
                          className="rounded-md object-cover"
                        />
                        <span className="font-medium">{item.product?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{item.product?.sku}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-lg">
                      {item.quantity}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    You do not have any stock yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
