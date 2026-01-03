
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, Save, Percent } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { PurchaseOrder, Party, Grn, Product, CompanyInfo, CoaLedger } from '@/lib/types';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { doc, updateDoc, collection, addDoc, serverTimestamp, getDoc, writeBatch, increment, setDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';

interface GrnItem {
  productId: string;
  productName: string;
  quantity: number;
  poRate: number;
  invoiceRate: number;
  amount: number;
  receivedQty: number;
  remarks: string;
  gstRate: number;
}

const companyDetails = {
  gstin: '08AAFCJ5369P1ZR', // Mock company GSTIN
};

const formatIndianCurrency = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(num);
  };

export default function CreateGrnPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const poId = searchParams.get('id');

  const poRef = React.useMemo(() => poId ? doc(firestore, 'purchaseOrders', poId) : null, [firestore, poId]);
  const { data: po, loading: poLoading } = useDoc<PurchaseOrder>(poRef);
  const { data: parties } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: allGrns, loading: grnsLoading } = useCollection<Grn>(collection(firestore, 'grns'));
  const { data: settingsData, loading: settingsLoading } = useDoc<any>(doc(firestore, 'company', 'settings'));
  const { data: allProducts, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const [grnItems, setGrnItems] = React.useState<GrnItem[]>([]);
  const [grnDate, setGrnDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));

  React.useEffect(() => {
    if (po) {
      const itemsFromPo: GrnItem[] = po.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        poRate: item.rate,
        invoiceRate: item.rate, // Default invoice rate to PO rate
        amount: item.rate * item.quantity,
        receivedQty: item.quantity,
        remarks: '',
        gstRate: 18, // Default GST rate
      }));
      setGrnItems(itemsFromPo);
    } else if (!poLoading && !po) {
       toast({
        variant: 'destructive',
        title: 'No Purchase Order selected',
        description: 'Please go back and select a PO to create a GRN for.',
      });
      router.push('/dashboard/procurement/goods-service-received-notes');
    }
  }, [po, poLoading, router, toast]);

  const supplier = React.useMemo(() => parties?.find(p => p.id === po?.supplierId), [parties, po]);
  const isInterstate = React.useMemo(() => {
    if (!supplier?.gstin) return false;
    return !companyDetails.gstin.startsWith(supplier.gstin.substring(0, 2));
  }, [supplier]);

  const calculations = React.useMemo(() => {
    const subtotal = grnItems.reduce((acc, item) => acc + (item.receivedQty * item.invoiceRate), 0);
    const totalGst = grnItems.reduce((acc, item) => acc + (item.receivedQty * item.invoiceRate) * (item.gstRate / 100), 0);
    const grandTotal = subtotal + totalGst;
    const cgst = isInterstate ? 0 : totalGst / 2;
    const sgst = isInterstate ? 0 : totalGst / 2;
    const igst = isInterstate ? totalGst : 0;
    return { subtotal, totalGst, cgst, sgst, igst, grandTotal };
  }, [grnItems, isInterstate]);


  const handleItemChange = (productId: string, field: keyof GrnItem, value: string | number) => {
    setGrnItems(prev =>
      prev.map(item =>
        item.productId === productId ? { ...item, [field]: value, amount: item.receivedQty * (field === 'invoiceRate' ? Number(value) : item.invoiceRate) } : item
      )
    );
  };
  
  const handleSaveGrn = async () => {
    if (!po || !settingsData?.prefixes || !allGrns || !coaLedgers || !allProducts || !supplier) {
      toast({ variant: 'destructive', title: 'Data Missing', description: 'Cannot save GRN without PO, settings, or accounts data.' });
      return;
    }
    
    try {
        const batch = writeBatch(firestore);

        const newGrnId = getNextDocNumber('Goods Received Note', settingsData.prefixes, allGrns);

        const grnData: Omit<Grn, 'id'> & { id: string } = {
            id: newGrnId,
            poId: po.id,
            supplierName: po.supplierName || 'N/A',
            supplierId: po.supplierId || 'N/A',
            grnDate,
            items: grnItems.map(item => ({
                productId: item.productId,
                productName: item.productName,
                orderedQty: item.quantity,
                receivedQty: item.receivedQty,
                rate: item.invoiceRate,
                gstRate: item.gstRate,
                remarks: item.remarks,
            })),
            subtotal: calculations.subtotal,
            cgst: calculations.cgst,
            sgst: calculations.sgst,
            igst: calculations.igst,
            totalGst: calculations.totalGst,
            grandTotal: calculations.grandTotal,
            createdAt: serverTimestamp(),
            paymentStatus: 'Pending Approval',
        };
        const grnRef = doc(firestore, 'grns', newGrnId);
        batch.set(grnRef, grnData);

        // --- Inventory & Accounting Logic ---
        const inputCgstLedger = coaLedgers.find(l => l.name.includes('Input GST – CGST'));
        const inputSgstLedger = coaLedgers.find(l => l.name.includes('Input GST – SGST'));
        const inputIgstLedger = coaLedgers.find(l => l.name.includes('Input GST – IGST'));
        const supplierLedger = coaLedgers.find(l => l.id === supplier.coaLedgerId);

        if (!supplierLedger || !inputCgstLedger || !inputSgstLedger || !inputIgstLedger) {
            throw new Error("Critical accounting ledgers (Supplier, GST) not found.");
        }
        
        const journalEntries: any[] = [];
        
        // 1. Update Inventory and create Debit entries for inventory ledgers
        for (const item of grnItems) {
            const product = allProducts.find(p => p.id === item.productId);
            if (!product) continue;

            const productRef = doc(firestore, 'products', item.productId);
            batch.update(productRef, { openingStock: increment(item.receivedQty) });

            const inventoryLedger = coaLedgers.find(l => l.id === product.coaAccountId);
            if (inventoryLedger) {
                journalEntries.push({
                    accountId: inventoryLedger.id,
                    debit: item.receivedQty * item.invoiceRate,
                    credit: 0
                });
            }
        }
        
        // 2. Debit GST Ledgers
        if (isInterstate) {
            journalEntries.push({ accountId: inputIgstLedger.id, debit: calculations.igst, credit: 0 });
        } else {
            journalEntries.push({ accountId: inputCgstLedger.id, debit: calculations.cgst, credit: 0 });
            journalEntries.push({ accountId: inputSgstLedger.id, debit: calculations.sgst, credit: 0 });
        }

        // 3. Credit the Supplier
        journalEntries.push({ accountId: supplierLedger.id, debit: 0, credit: calculations.grandTotal });
        
        const jvData = {
            date: grnDate,
            narration: `Goods received from ${po.supplierName} against PO ${po.id} (GRN #${newGrnId})`,
            entries: journalEntries,
            createdAt: serverTimestamp(),
        };
        const jvRef = doc(collection(firestore, 'journalVouchers'));
        batch.set(jvRef, jvData);
        
        // 4. Update PO Status
        const purchaseOrderRef = doc(firestore, 'purchaseOrders', po.id);
        batch.update(purchaseOrderRef, { status: 'Completed' });

        await batch.commit();

        toast({
            title: 'GRN Saved, Stock & Accounts Updated',
            description: `Stock levels and financial ledgers have been updated for GRN #${newGrnId}.`
        });

        router.push('/dashboard/procurement/goods-service-received-notes');
    } catch (error: any) {
        console.error("Error saving GRN:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save GRN.' });
    }
  }

  if (poLoading || settingsLoading || grnsLoading || productsLoading || ledgersLoading) {
    return (
      <>
        <PageHeader title="Loading Purchase Order..." />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </>
    );
  }

  if (!po) {
    // This will be handled by the useEffect redirect, but as a fallback:
     return <PageHeader title="Purchase Order not found." />;
  }

  return (
    <>
      <PageHeader title={`Create GRN for PO: ${po.id}`}>
        <Button onClick={handleSaveGrn}>
          <Save className="mr-2 h-4 w-4" /> Save GRN
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
          <CardTitle>Goods Received Note</CardTitle>
          <CardDescription>Confirm quantities received against the purchase order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <Label>Supplier</Label>
              <p className="font-medium">{po.supplierName}</p>
            </div>
            <div className="space-y-1">
              <Label>PO Date</Label>
              <p>{format(new Date(po.date), 'dd/MM/yyyy')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="grn-date">GRN Date</Label>
              <Input
                id="grn-date"
                type="date"
                value={grnDate}
                onChange={(e) => setGrnDate(e.target.value)}
              />
            </div>
          </div>
          
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-[100px]">Ordered</TableHead>
                <TableHead className="w-[120px]">PO Rate</TableHead>
                <TableHead className="w-[120px]">Invoice Rate</TableHead>
                <TableHead className="w-[100px]">Received</TableHead>
                <TableHead className="w-[120px]">GST Rate</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grnItems.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>
                    <Input value={item.quantity} readOnly disabled />
                  </TableCell>
                  <TableCell>
                    <Input value={item.poRate.toFixed(2)} readOnly disabled />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={item.invoiceRate}
                      onChange={(e) => handleItemChange(item.productId, 'invoiceRate', Number(e.target.value))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={item.receivedQty}
                      onChange={(e) => handleItemChange(item.productId, 'receivedQty', Number(e.target.value))}
                    />
                  </TableCell>
                  <TableCell>
                     <div className="relative">
                        <Input
                            type="number"
                            value={item.gstRate}
                            onChange={(e) => handleItemChange(item.productId, 'gstRate', Number(e.target.value))}
                            className="pr-7"
                        />
                        <Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Textarea
                      placeholder="e.g., Damaged box, partial delivery..."
                      value={item.remarks}
                      onChange={(e) => handleItemChange(item.productId, 'remarks', e.target.value)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={6} className="text-right font-semibold">Subtotal</TableCell>
                    <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.subtotal)}</TableCell>
                </TableRow>
                 {isInterstate ? (
                    <TableRow>
                        <TableCell colSpan={6} className="text-right font-semibold">IGST</TableCell>
                        <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.igst)}</TableCell>
                    </TableRow>
                 ) : (
                    <>
                        <TableRow>
                            <TableCell colSpan={6} className="text-right font-semibold">CGST</TableCell>
                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.cgst)}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell colSpan={6} className="text-right font-semibold">SGST</TableCell>
                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.sgst)}</TableCell>
                        </TableRow>
                    </>
                 )}
                 <TableRow>
                    <TableCell colSpan={6} className="text-right font-bold text-lg">Grand Total</TableCell>
                    <TableCell className="text-right font-bold font-mono text-lg">{formatIndianCurrency(calculations.grandTotal)}</TableCell>
                </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

