

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
  TableFooter,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { Package, PackageCheck, Send, Loader2, ChevronRight, ChevronDown, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PurchaseOrder, Grn, CoaLedger, Party, Product } from '@/lib/types';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where, orderBy, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

// Helper to get status colors
function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'Completed':
    case 'Received':
    case 'Paid':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'Ordered':
    case 'Sent':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'Pending Approval':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
};

// Mock company details needed for calculations
const companyDetails = {
  gstin: '08AAFCJ5369P1ZR',
};

export default function GoodsServiceReceivedNotesPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = React.useState(false);

  const { data: purchaseOrders, loading: poLoading } = useCollection<PurchaseOrder>(
    query(
      collection(firestore, 'purchaseOrders'), 
      where('status', '==', 'Sent')
    )
  );

  const { data: grns, loading: grnsLoading } = useCollection<Grn>(
    query(
        collection(firestore, 'grns'),
        orderBy('grnDate', 'desc')
    )
  );
  
  const { data: journalVouchers } = useCollection<any>(collection(firestore, 'journalVouchers'));
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: parties } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: allProducts } = useCollection<any>(collection(firestore, 'products'));


  const [openGrnId, setOpenGrnId] = React.useState<string | null>(null);

  const sentPOs = purchaseOrders || [];

  const kpis = React.useMemo(() => {
    if (!sentPOs || !grns) return { pendingReceipts: 0, completedReceipts: 0, totalLogistics: 0 };
    const pendingReceipts = sentPOs.length;
    const completedReceipts = grns.length;
    const totalLogistics = pendingReceipts + completedReceipts;
    return { pendingReceipts, completedReceipts, totalLogistics };
  }, [sentPOs, grns]);


  const handleCreateGrn = (po: PurchaseOrder) => {
    router.push(`/dashboard/procurement/create-grn?id=${po.id}`);
  };

  const handleSyncAccounting = async () => {
    setIsSyncing(true);
    toast({ title: "Syncing started...", description: "Checking for GRNs missing accounting entries." });

    if (!grns || !journalVouchers || !coaLedgers || !allProducts || !parties) {
      toast({ variant: 'destructive', title: "Data not ready", description: "Please wait a moment and try again." });
      setIsSyncing(false);
      return;
    }

    const grnsWithoutJv = grns.filter(grn => 
      !journalVouchers.some(jv => jv.narration?.includes(`GRN #${grn.id}`))
    );

    if (grnsWithoutJv.length === 0) {
      toast({ title: "Already in Sync", description: "No old GRNs were found that needed accounting entries." });
      setIsSyncing(false);
      return;
    }

    try {
      const batch = writeBatch(firestore);
      let syncedCount = 0;

      for (const grn of grnsWithoutJv) {
        const supplier = parties.find(p => p.id === grn.supplierId);
        const supplierLedger = coaLedgers.find(l => l.id === supplier?.coaLedgerId);
        const inputCgstLedger = coaLedgers.find(l => l.name.includes('Input GST – CGST'));
        const inputSgstLedger = coaLedgers.find(l => l.name.includes('Input GST – SGST'));
        const inputIgstLedger = coaLedgers.find(l => l.name.includes('Input GST – IGST'));

        if (!supplierLedger || !inputCgstLedger || !inputSgstLedger || !inputIgstLedger) {
          console.warn(`Skipping GRN ${grn.id}: Missing critical ledgers.`);
          continue;
        }

        const isInterstate = !companyDetails.gstin.startsWith(supplier?.gstin?.substring(0, 2) || '');
        const journalEntries: any[] = [];
        
        for (const item of grn.items) {
          const product = allProducts.find(p => p.id === item.productId);
          const inventoryLedger = coaLedgers.find(l => l.id === product?.coaAccountId);
          if (inventoryLedger) {
            journalEntries.push({
              accountId: inventoryLedger.id,
              debit: item.receivedQty * item.rate,
              credit: 0
            });
          }
        }
        
        if (isInterstate) {
            journalEntries.push({ accountId: inputIgstLedger.id, debit: grn.igst, credit: 0 });
        } else {
            journalEntries.push({ accountId: inputCgstLedger.id, debit: grn.cgst, credit: 0 });
            journalEntries.push({ accountId: inputSgstLedger.id, debit: grn.sgst, credit: 0 });
        }
        journalEntries.push({ accountId: supplierLedger.id, debit: 0, credit: grn.grandTotal });
        
        const jvData = {
            date: grn.grnDate,
            narration: `Goods received from ${grn.supplierName} against PO ${grn.poId} (GRN #${grn.id})`,
            entries: journalEntries,
            createdAt: serverTimestamp(),
        };
        const jvRef = doc(collection(firestore, 'journalVouchers'));
        batch.set(jvRef, jvData);
        syncedCount++;
      }

      if (syncedCount > 0) {
        await batch.commit();
        toast({ title: "Sync Complete", description: `${syncedCount} GRNs have been successfully synced with accounting.` });
      } else {
        toast({ title: "Nothing to Sync", description: "Could not create entries for some old GRNs due to missing data." });
      }

    } catch (error) {
      console.error("Accounting sync failed:", error);
      toast({ variant: "destructive", title: "Sync Failed", description: "An error occurred during the sync process." });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <PageHeader title="Goods & Service Received Notes">
        <Button onClick={handleSyncAccounting} variant="outline" disabled={isSyncing}>
          {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Repeat className="mr-2 h-4 w-4" />}
          Sync Accounting for Old GRNs
        </Button>
      </PageHeader>

       <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Pending Receipts</CardTitle>
            <Package className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pendingReceipts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Completed Receipts</CardTitle>
            <PackageCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.completedReceipts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Total Logistics</CardTitle>
            <Send className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalLogistics}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Awaiting Goods Receipt</CardTitle>
          <CardDescription>
            Generate GRNs for orders currently in transit or recently ordered.
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
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="animate-spin mx-auto h-6 w-6 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : sentPOs.length > 0 ? (
                sentPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono font-bold">{po.id}</TableCell>
                    <TableCell className="font-medium">
                        {po.supplierName || "N/A"}
                    </TableCell>
                    <TableCell>
                        {po.date ? format(new Date(po.date), 'dd/MM/yyyy') : 'Pending'}
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className={cn(getStatusBadgeVariant(po.status))}>
                            {po.status === 'Sent' ? 'Pending Receipt' : po.status}
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
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
                    No purchase orders awaiting receipt.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>GRN History</CardTitle>
          <CardDescription>
            A log of all goods that have been received.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                        <TableHead>GRN ID</TableHead>
                        <TableHead>PO ID</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>GRN Date</TableHead>
                        <TableHead>Payment Status</TableHead>
                    </TableRow>
                </TableHeader>
                
                    {grnsLoading ? (
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    <Loader2 className="animate-spin mx-auto h-6 w-6 text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    ) : grns && grns.length > 0 ? (
                        grns.map((grn) => (
                            <Collapsible asChild key={grn.id} open={openGrnId === grn.id} onOpenChange={(isOpen) => setOpenGrnId(isOpen ? grn.id : null)}>
                                <TableBody>
                                    <TableRow className="cursor-pointer" onClick={() => setOpenGrnId(openGrnId === grn.id ? null : grn.id)}>
                                        <TableCell>
                                            <CollapsibleTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    {openGrnId === grn.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                </Button>
                                            </CollapsibleTrigger>
                                        </TableCell>
                                        <TableCell className="font-mono font-bold">{grn.id}</TableCell>
                                        <TableCell className="font-mono">{grn.poId}</TableCell>
                                        <TableCell>{grn.supplierName}</TableCell>
                                        <TableCell>{format(new Date(grn.grnDate), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={cn(getStatusBadgeVariant(grn.paymentStatus))}>
                                                {grn.paymentStatus}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                    <CollapsibleContent asChild>
                                        <TableRow>
                                            <TableCell colSpan={6} className="p-0">
                                                <div className="p-4 bg-muted/50 space-y-4">
                                                    <h4 className="font-semibold text-sm">Received Items:</h4>
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Product</TableHead>
                                                                <TableHead className="text-right">Ordered</TableHead>
                                                                <TableHead className="text-right">Received</TableHead>
                                                                <TableHead className="text-right">Rate</TableHead>
                                                                <TableHead className="text-right">Amount</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {grn.items.map((item, index) => (
                                                                <TableRow key={index}>
                                                                    <TableCell>{item.productName}</TableCell>
                                                                    <TableCell className="text-right font-mono">{item.orderedQty}</TableCell>
                                                                    <TableCell className="text-right font-mono">{item.receivedQty}</TableCell>
                                                                    <TableCell className="text-right font-mono">{formatIndianCurrency(item.rate)}</TableCell>
                                                                    <TableCell className="text-right font-mono">{formatIndianCurrency(item.rate * item.receivedQty)}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                    <div className="flex justify-end pt-4">
                                                        <div className="w-full max-w-xs space-y-2">
                                                            <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatIndianCurrency(grn.subtotal)}</span></div>
                                                            {grn.igst > 0 ? (
                                                                <div className="flex justify-between"><span>IGST</span><span className="font-mono">{formatIndianCurrency(grn.igst)}</span></div>
                                                            ) : (
                                                                <>
                                                                    <div className="flex justify-between"><span>CGST</span><span className="font-mono">{formatIndianCurrency(grn.cgst)}</span></div>
                                                                    <div className="flex justify-between"><span>SGST</span><span className="font-mono">{formatIndianCurrency(grn.sgst)}</span></div>
                                                                </>
                                                            )}
                                                            <Separator/>
                                                            <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="font-mono">{formatIndianCurrency(grn.grandTotal)}</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    </CollapsibleContent>
                                </TableBody>
                            </Collapsible>
                        ))
                    ) : (
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground italic">
                                    No GRNs have been created yet.
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    )}
            </Table>
        </CardContent>
      </Card>
    </>
  );
}
