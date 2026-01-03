
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { format } from 'date-fns';
import { Package, PackageCheck, Send, Loader2 } from 'lucide-react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { PurchaseOrder } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'Sent':
      return 'bg-blue-100 text-blue-800';
    case 'Completed':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export default function InwardsPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { data: sentPOs, loading: poLoading } = useCollection<PurchaseOrder>(
    query(
      collection(firestore, 'purchaseOrders'),
      where('status', '==', 'Sent')
    )
  );

  const { data: allPOs, loading: allPoLoading } = useCollection<PurchaseOrder>(collection(firestore, 'purchaseOrders'));

  const kpis = React.useMemo(() => {
    if (!sentPOs || !allPOs) return { pendingReceipts: 0, completedReceipts: 0, totalSent: 0 };
    const pendingReceipts = sentPOs.length;
    const completedReceipts = allPOs.filter(po => po.status === 'Completed').length;
    const totalSent = pendingReceipts + completedReceipts;
    return { pendingReceipts, completedReceipts, totalSent };
  }, [sentPOs, allPOs]);


  const handleCreateGrn = (po: PurchaseOrder) => {
    // Navigate to the GRN page with the PO ID as a query parameter
    router.push(`/dashboard/procurement/create-grn?id=${po.id}`);
  };

  return (
    <>
      <PageHeader title="Inwards / Goods Received" />

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Receipts</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pendingReceipts}</div>
            <p className="text-xs text-muted-foreground">POs awaiting goods receipt.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Receipts</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.completedReceipts}</div>
            <p className="text-xs text-muted-foreground">POs that have been fully received.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total POs Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalSent}</div>
            <p className="text-xs text-muted-foreground">All sent and completed POs.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Receipts</CardTitle>
          <CardDescription>
            Create Goods Received Notes (GRN) for purchase orders that have been sent to suppliers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO ID</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date Sent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {poLoading ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="animate-spin h-6 w-6" /></TableCell></TableRow>
              ) : sentPOs && sentPOs.length > 0 ? (
                sentPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono">{po.id}</TableCell>
                    <TableCell>{po.supplierName}</TableCell>
                    <TableCell>{format(new Date(po.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(getStatusBadgeVariant(po.status))}>
                        {po.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => handleCreateGrn(po)}>
                        Create GRN
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No purchase orders awaiting receipt.
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

    