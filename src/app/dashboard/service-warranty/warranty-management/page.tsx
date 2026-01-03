
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { RegisteredProduct } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { ShieldCheck, ShieldAlert, ShieldX, Package } from 'lucide-react';
import { useFirestore, useCollection } from '@/firebase';
import { collection } from 'firebase/firestore';

function getStatusBadgeVariant(status: string) {
    switch (status) {
        case 'Active':
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        case 'Expiring Soon':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        case 'Expired':
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
}

export default function WarrantyManagementPage() {
    const firestore = useFirestore();
    const { data: registeredProducts, loading } = useCollection<RegisteredProduct>(collection(firestore, 'registeredProducts'));
    
    const kpis = React.useMemo(() => {
        if (!registeredProducts) return { total: 0, active: 0, expiringSoon: 0, expired: 0 };
        const total = registeredProducts.length;
        const active = registeredProducts.filter(p => p.status === 'Active').length;
        const expiringSoon = registeredProducts.filter(p => p.status === 'Expiring Soon').length;
        const expired = registeredProducts.filter(p => p.status === 'Expired').length;
        return { total, active, expiringSoon, expired };
    }, [registeredProducts]);

    return (
        <>
            <PageHeader title="Warranty Management" />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Registered Products</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpis.total}</div>
                        <p className="text-xs text-muted-foreground">All products with warranty</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Warranties</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpis.active}</div>
                        <p className="text-xs text-muted-foreground">Products currently under warranty</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpis.expiringSoon}</div>
                        <p className="text-xs text-muted-foreground">Warranties ending in &lt;30 days</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Expired Warranties</CardTitle>
                        <ShieldX className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpis.expired}</div>
                        <p className="text-xs text-muted-foreground">Products no longer under warranty</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Registered Product Warranties</CardTitle>
                    <CardDescription>An overview of all product warranties for your customers.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Customer</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Serial Number</TableHead>
                                <TableHead>Warranty End Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Free Services Left</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading warranties...</TableCell></TableRow>
                            ) : registeredProducts?.map(product => (
                                <TableRow key={product.id}>
                                    <TableCell className="font-medium">{product.customerName}</TableCell>
                                    <TableCell>{product.productName}</TableCell>
                                    <TableCell className="font-mono">{product.serialNumber}</TableCell>
                                    <TableCell>{format(parseISO(product.warrantyEndDate), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={cn(getStatusBadgeVariant(product.status))}>
                                            {product.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{product.availableFreeServices ?? 'N/A'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </>
    );
}
