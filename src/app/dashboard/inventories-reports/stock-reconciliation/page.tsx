
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
  TableFooter,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Product, CoaLedger } from '@/lib/types';
import { Save, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useFirestore, useCollection } from '@/firebase';
import { collection, writeBatch, doc, addDoc, serverTimestamp, increment } from 'firebase/firestore';


interface ReconciliationItem extends Product {
  systemStock: number;
  physicalStock: number | '';
  difference: number;
  remarks: string;
}

export default function StockReconciliationPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: allProducts, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const [reconciliationItems, setReconciliationItems] = React.useState<ReconciliationItem[]>([]);
  const [isReconciling, setIsReconciling] = React.useState(false);
  const [reconciliationDate, setReconciliationDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));

  const startReconciliation = () => {
    if (!allProducts) {
        toast({ variant: 'destructive', title: 'Products not loaded yet.' });
        return;
    }
    const itemsToReconcile = allProducts.map(product => {
      const stockAvailable = product.openingStock;
      return {
        ...product,
        systemStock: stockAvailable,
        physicalStock: '',
        difference: 0, // Initially zero until physical is entered
        remarks: '',
      };
    });
    setReconciliationItems(itemsToReconcile);
    setIsReconciling(true);
  };

  const handleStockChange = (productId: string, physicalStock: number | '') => {
    setReconciliationItems(prevItems =>
      prevItems.map(item => {
        if (item.id === productId) {
          const newPhysicalStock = physicalStock === '' ? item.systemStock : Number(physicalStock); // Default to system stock if empty to show no difference
          const difference = newPhysicalStock - item.systemStock;
          return { ...item, physicalStock, difference };
        }
        return item;
      })
    );
  };
  
  const handleRemarksChange = (productId: string, remarks: string) => {
    setReconciliationItems(prevItems =>
      prevItems.map(item => item.id === productId ? { ...item, remarks } : item)
    );
  };

  const handleSaveReconciliation = async () => {
    const adjustedItems = reconciliationItems.filter(item => item.difference !== 0 && item.physicalStock !== '');

    if (adjustedItems.length === 0) {
        toast({ title: "No changes to save.", description: "No stock differences were recorded." });
        setIsReconciling(false);
        return;
    }
    
    if (!firestore || !coaLedgers) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not access database services.' });
        return;
    }

    try {
        const batch = writeBatch(firestore);
        const journalEntries = [];
        let totalAdjustmentValue = 0;

        const stockAdjustmentLedger = coaLedgers.find(l => l.name === 'Stock Adjustment');
        if (!stockAdjustmentLedger) {
            throw new Error('"Stock Adjustment" ledger not found in Chart of Accounts.');
        }

        for (const item of adjustedItems) {
            const productRef = doc(firestore, 'products', item.id);
            // We update the opening stock as this is the primary stock field in the current setup.
            // In a more complex system, this might be a 'currentStock' field.
            batch.update(productRef, { openingStock: item.physicalStock as number });
            
            const adjustmentValue = item.difference * (item.cost || 0);
            totalAdjustmentValue += adjustmentValue;

            const inventoryLedger = coaLedgers.find(l => l.id === item.coaAccountId);
            if (!inventoryLedger) {
                console.warn(`Inventory ledger not found for product ${item.name}. Skipping accounting entry for this item.`);
                continue;
            }

            if (adjustmentValue > 0) { // Stock increased
                journalEntries.push({ accountId: inventoryLedger.id, debit: adjustmentValue, credit: 0 });
            } else { // Stock decreased
                journalEntries.push({ accountId: inventoryLedger.id, debit: 0, credit: Math.abs(adjustmentValue) });
            }
        }
        
        // Create the balancing entry for the journal voucher
        if (totalAdjustmentValue > 0) {
            journalEntries.push({ accountId: stockAdjustmentLedger.id, debit: 0, credit: totalAdjustmentValue });
        } else {
            journalEntries.push({ accountId: stockAdjustmentLedger.id, debit: Math.abs(totalAdjustmentValue), credit: 0 });
        }

        const jvData = {
            date: reconciliationDate,
            narration: `Stock Reconciliation on ${reconciliationDate}`,
            entries: journalEntries,
            createdAt: serverTimestamp(),
        };
        const jvRef = doc(collection(firestore, 'journalVouchers'));
        batch.set(jvRef, jvData);

        await batch.commit();
        
        toast({
          title: "Reconciliation Saved",
          description: `Stock levels for ${adjustedItems.length} items have been adjusted and a journal entry has been created.`,
        });
        
        setIsReconciling(false);
    } catch (error: any) {
        console.error("Error saving reconciliation:", error);
        toast({
            variant: "destructive",
            title: "Save Failed",
            description: error.message || "An unknown error occurred.",
        });
    }
  };
  
  const totalDifferenceValue = React.useMemo(() => {
    return reconciliationItems.reduce((acc, item) => {
        if (item.difference) {
            return acc + (item.difference * (item.cost || 0));
        }
        return acc;
    }, 0);
  }, [reconciliationItems]);


  if (!isReconciling) {
    return (
      <>
        <PageHeader title="Stock Reconciliation" />
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">
              Start a New Stock Count
            </h3>
            <p className="text-sm text-muted-foreground">
              Begin the process of reconciling your physical inventory with your system records.
            </p>
            <Button className="mt-4" onClick={startReconciliation} disabled={productsLoading}>
              {productsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
               Start New Reconciliation
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New Stock Reconciliation">
        <Button onClick={handleSaveReconciliation}>
          <Save className="mr-2 h-4 w-4" /> Save Reconciliation
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Physical Stock Count</CardTitle>
          <CardDescription>
            Enter the physically counted stock for each item. The system will calculate the difference.
          </CardDescription>
           <div className="pt-4">
                <Label htmlFor="reconciliation-date">Reconciliation Date</Label>
                <Input
                    id="reconciliation-date"
                    type="date"
                    value={reconciliationDate}
                    onChange={(e) => setReconciliationDate(e.target.value)}
                    className="w-48"
                />
            </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Product</TableHead>
                <TableHead className="text-center w-[15%]">System Stock</TableHead>
                <TableHead className="text-center w-[15%]">Physical Stock</TableHead>
                <TableHead className="text-center w-[15%]">Difference</TableHead>
                <TableHead className="w-[25%]">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reconciliationItems.map((item) => (
                <TableRow key={item.id} className={cn(item.difference !== 0 && item.physicalStock !== '' && "bg-yellow-50 dark:bg-yellow-900/20")}>
                   <TableCell>
                      <div className="flex items-center gap-4">
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          width={40}
                          height={40}
                          className="rounded-md object-cover"
                          data-ai-hint={item.imageHint}
                        />
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{item.sku}</p>
                        </div>
                      </div>
                    </TableCell>
                  <TableCell className="text-center font-mono">{item.systemStock}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      placeholder="Enter count"
                      value={item.physicalStock}
                      onChange={(e) => handleStockChange(item.id, e.target.value === '' ? '' : Number(e.target.value))}
                      className="text-center"
                    />
                  </TableCell>
                   <TableCell className={cn("text-center font-mono font-bold", item.difference > 0 ? "text-green-600" : item.difference < 0 ? "text-red-600" : "")}>
                        {item.physicalStock !== '' ? item.difference : '-'}
                    </TableCell>
                  <TableCell>
                    <Input placeholder="e.g., Damaged items, found extra" value={item.remarks} onChange={(e) => handleRemarksChange(item.id, e.target.value)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
             <TableFooter>
                <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold text-lg">Total Difference Value</TableCell>
                    <TableCell className={cn("text-left font-mono font-bold text-lg", totalDifferenceValue > 0 ? "text-green-600" : totalDifferenceValue < 0 ? "text-red-600" : "")}>
                       ₹{totalDifferenceValue.toFixed(2)}
                    </TableCell>
                </TableRow>
             </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
