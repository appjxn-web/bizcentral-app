
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle, Save, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, addDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import type { Party, Product, UserRole, CoaLedger, PartyType, CoaNature } from '@/lib/types';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useRole } from '../../_components/role-provider';
import { useRouter, useSearchParams } from 'next/navigation';

interface BillItem {
  id: string;
  productId: string;
  name: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  gstRate: number;
  amount: number;
  coaAccountId: string;
}

const companyGstin = '08AAFCJ5369P1ZR'; // Mock company GSTIN

export default function RecordPurchasePage() {
  const { toast } = useToast();
  const router = useRouter();
  
  const [selectedPartyId, setSelectedPartyId] = React.useState<string | null>(null);
  const [billDate, setBillDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [items, setItems] = React.useState<BillItem[]>([]);
  const [terms, setTerms] = React.useState('Payment upon receipt.');
  const [paymentAmount, setPaymentAmount] = React.useState(0);
  const [paymentMode, setPaymentMode] = React.useState('');
  const [paymentRef, setPaymentRef] = React.useState('');
  const [openCombobox, setOpenCombobox] = React.useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);

  const firestore = useFirestore();
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: products } = useCollection<Product>(collection(firestore, 'products'));
  const { data: parties } = useCollection<Party>(collection(firestore, 'parties'));
  const purchasableProducts = products?.filter(p => p.source === 'Bought' || p.type === 'Raw Materials' || p.type === 'Components') || [];
  
  const selectedParty = React.useMemo(() => {
    return parties?.find(p => p.id === selectedPartyId) || null;
  }, [selectedPartyId, parties]);
  
  const isInterstate = React.useMemo(() => {
    if (!selectedParty?.gstin) return false;
    return !companyGstin.startsWith(selectedParty.gstin.substring(0, 2));
  }, [selectedParty]);

  const calculations = React.useMemo(() => {
    const subtotal = items.reduce((acc, item) => acc + item.amount, 0);
    const totalGst = items.reduce((acc, item) => acc + item.amount * (item.gstRate / 100), 0);
    const grandTotal = subtotal + totalGst;
    const cgst = isInterstate ? 0 : totalGst / 2;
    const sgst = isInterstate ? 0 : totalGst / 2;
    const igst = isInterstate ? totalGst : 0;
    
    return { subtotal, cgst, sgst, igst, grandTotal };
  }, [items, isInterstate]);

  const handleAddItem = () => {
    const newItem: BillItem = {
      id: `item-${Date.now()}`,
      productId: '',
      name: '',
      hsn: '',
      qty: 1,
      unit: 'pcs',
      rate: 0,
      gstRate: 18,
      amount: 0,
      coaAccountId: ''
    };
    setItems([...items, newItem]);
  };
  
  const handleItemChange = (itemId: string, field: keyof Omit<BillItem, 'id'>, value: any) => {
    setItems(prevItems => {
        const newItems = prevItems.map(item => {
            if (item.id === itemId) {
                const updatedItem = { ...item, [field]: value };
                let product: Product | undefined;
                
                if (field === 'productId') {
                    product = products?.find(p => p.id === value);
                    if (product) {
                        updatedItem.name = product.name;
                        updatedItem.hsn = product.id.slice(0,4).toUpperCase();
                        updatedItem.rate = product.cost || 0; 
                        updatedItem.gstRate = 18;
                        updatedItem.coaAccountId = product.coaAccountId || '';
                    }
                }
                
                updatedItem.amount = updatedItem.qty * updatedItem.rate;
                return updatedItem;
            }
            return item;
        });
        return newItems;
    });
  };

  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
  };
  
  const getOrCreatePartyLedger = async (party: Party): Promise<CoaLedger> => {
    if (!coaLedgers) throw new Error("Chart of Accounts not loaded.");

    if (party.coaLedgerId) {
        const existingLedger = coaLedgers.find(l => l.id === party.coaLedgerId);
        if (existingLedger) return existingLedger;
    }

    const ledgerName = party.name;
    const existingLedgerByName = coaLedgers.find(l => l.name === ledgerName);
    if (existingLedgerByName) {
        const partyRef = doc(firestore, 'parties', party.id);
        await updateDoc(partyRef, { coaLedgerId: existingLedgerByName.id });
        return existingLedgerByName;
    }
    
    const newLedgerData: Omit<CoaLedger, 'id' | 'createdAt' | 'updatedAt'> = {
        name: ledgerName,
        groupId: '2.1.1', // Trade Payables
        nature: 'LIABILITY' as CoaNature,
        type: 'PAYABLE',
        posting: { isPosting: true, normalBalance: 'CREDIT', isSystem: false, allowManualJournal: true },
        status: 'ACTIVE',
    };

    const newLedgerRef = await addDoc(collection(firestore, 'coa_ledgers'), newLedgerData);
    await updateDoc(doc(firestore, 'parties', party.id), { coaLedgerId: newLedgerRef.id });

    // This is a simplification. In a real app, you'd refetch or get the created doc.
    return { id: newLedgerRef.id, ...newLedgerData } as CoaLedger;
  };
  
  const handleRecordPurchase = async () => {
    if (!selectedPartyId || items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please select a supplier and add at least one item.',
      });
      return;
    }
    
    const supplier = parties?.find(p => p.id === selectedPartyId);
    if (!supplier) {
      toast({ variant: 'destructive', title: 'Supplier not found' });
      return;
    }

    try {
      const batch = writeBatch(firestore);
      const supplierLedger = await getOrCreatePartyLedger(supplier);
      const inputCgstLedger = coaLedgers?.find(l => l.name === 'Input GST – CGST');
      const inputSgstLedger = coaLedgers?.find(l => l.name === 'Input GST – SGST');
      const inputIgstLedger = coaLedgers?.find(l => l.name === 'Input GST – IGST');

      if (!inputCgstLedger || !inputSgstLedger || !inputIgstLedger) {
          throw new Error("GST ledger accounts not found. Please ensure they exist in your Chart of Accounts.");
      }
      
      const journalEntries = items.map(item => ({
        accountId: item.coaAccountId,
        debit: item.amount,
        credit: 0
      }));

      // Add GST entries
      if (isInterstate) {
        journalEntries.push({ accountId: inputIgstLedger.id, debit: calculations.igst, credit: 0 });
      } else {
        journalEntries.push({ accountId: inputCgstLedger.id, debit: calculations.cgst, credit: 0 });
        journalEntries.push({ accountId: inputSgstLedger.id, debit: calculations.sgst, credit: 0 });
      }
      
      // Credit the supplier
      journalEntries.push({ accountId: supplierLedger.id, debit: 0, credit: calculations.grandTotal });
      
      const jvData = {
          date: billDate,
          narration: `Purchase from ${supplier.name}`,
          entries: journalEntries,
          createdAt: serverTimestamp(),
      };
      const jvRef = doc(collection(firestore, 'journalVouchers'));
      batch.set(jvRef, jvData);

      // Handle payment if made
      if (paymentAmount > 0) {
        const paymentAccount = coaLedgers?.find(l => l.id === paymentMode); // Assuming paymentMode stores ledger ID
        if (paymentAccount) {
            const paymentJvData = {
                date: billDate,
                narration: `Payment to ${supplier.name} via ${paymentAccount.name}`,
                entries: [
                    { accountId: supplierLedger.id, debit: paymentAmount, credit: 0 },
                    { accountId: paymentAccount.id, debit: 0, credit: paymentAmount },
                ],
                createdAt: serverTimestamp(),
            };
            const paymentJvRef = doc(collection(firestore, 'journalVouchers'));
            batch.set(paymentJvRef, paymentJvData);
        }
      }

      await batch.commit();

      toast({
        title: 'Purchase Recorded',
        description: 'The purchase has been successfully recorded with corresponding journal entries.',
      });

      router.push('/dashboard/finance-accounting/transactions');

    } catch (error: any) {
        console.error("Error recording purchase:", error);
        toast({
            variant: 'destructive',
            title: 'Failed to Record Purchase',
            description: error.message,
        });
    }
  };
  
  const suppliers = React.useMemo(() => {
    if (!parties) return [];
    return parties.filter(p => p.type === 'Supplier' || p.type === 'Vendor');
  }, [parties]);


  return (
    <>
      <PageHeader title="Record Purchase">
        <Button onClick={handleRecordPurchase}>
          <Save className="mr-2 h-4 w-4" /> Save Purchase
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
          <CardTitle>Enter Purchase / Bill Details</CardTitle>
          <CardDescription>Record a new purchase for assets or raw materials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-4 md:col-span-2">
              <Label>Supplier / Vendor</Label>
               <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCombobox}
                    className="w-full justify-between"
                  >
                    {selectedParty
                      ? selectedParty.name
                      : "Select a supplier..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Search supplier..." />
                    <CommandList>
                      <CommandEmpty>No supplier found.</CommandEmpty>
                      <CommandGroup>
                        {suppliers.map((party) => (
                          <CommandItem
                            key={party.id}
                            value={party.name}
                            onSelect={() => {
                              setSelectedPartyId(party.id);
                              setOpenCombobox(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedPartyId === party.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {party.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="bill-date">Bill/Invoice Date</Label>
                    <Input
                        id="bill-date"
                        type="date"
                        value={billDate}
                        onChange={(e) => setBillDate(e.target.value)}
                    />
                </div>
            </div>
          </div>
          
          <Separator />

          <div>
            <h3 className="text-lg font-medium mb-2">Items Purchased</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Item</TableHead>
                  <TableHead>HSN</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>GST %</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Select value={item.productId} onValueChange={(value) => handleItemChange(item.id, 'productId', value)}>
                          <SelectTrigger><SelectValue placeholder="Select Item" /></SelectTrigger>
                          <SelectContent>
                              {purchasableProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input value={item.hsn} onChange={e => handleItemChange(item.id, 'hsn', e.target.value)} /></TableCell>
                    <TableCell><Input type="number" value={item.qty} onChange={e => handleItemChange(item.id, 'qty', Number(e.target.value))} /></TableCell>
                    <TableCell><Input value={item.unit} onChange={e => handleItemChange(item.id, 'unit', e.target.value)} /></TableCell>
                    <TableCell><Input type="number" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', Number(e.target.value))} /></TableCell>
                    <TableCell><Input type="number" value={item.gstRate} onChange={e => handleItemChange(item.id, 'gstRate', Number(e.target.value))} /></TableCell>
                    <TableCell className="text-right font-mono">₹{item.amount.toFixed(2)}</TableCell>
                    <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
               <TableFooter>
                <TableRow>
                    <TableCell colSpan={7}>
                        <Button variant="outline" size="sm" onClick={handleAddItem} className="mt-2">
                           <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                        </Button>
                    </TableCell>
                    <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          
          <Separator />
          
          <div className="flex justify-end">
              <div className="w-full max-w-sm space-y-2">
                <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">₹{calculations.subtotal.toFixed(2)}</span></div>
                {isInterstate ? (
                    <div className="flex justify-between"><span>IGST</span><span className="font-mono">₹{calculations.igst.toFixed(2)}</span></div>
                ) : (
                    <>
                        <div className="flex justify-between"><span>CGST</span><span className="font-mono">₹{calculations.cgst.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>SGST</span><span className="font-mono">₹{calculations.sgst.toFixed(2)}</span></div>
                    </>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg"><span>Grand Total</span><span className="font-mono">₹{calculations.grandTotal.toFixed(2)}</span></div>
                <div className="flex justify-between items-center text-primary">
                    <span>Payment Made</span>
                    <span className="font-mono font-bold">₹{paymentAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center font-semibold">
                    <span>Balance Due</span>
                    <span className="font-mono">₹{(calculations.grandTotal - paymentAmount).toFixed(2)}</span>
                </div>
              </div>
          </div>

          <Separator />

          <div className="grid md:grid-cols-2 gap-6">
            <div className="w-full max-w-md space-y-4">
                 <h3 className="text-lg font-medium">Payment Details (Optional)</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="payment-amount">Amount Paid</Label>
                        <Input id="payment-amount" type="number" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="payment-mode">Payment Mode</Label>
                        <Select value={paymentMode} onValueChange={setPaymentMode}>
                            <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                            <SelectContent>
                                {coaLedgers?.filter(l => l.groupId === '1.1.1').map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="payment-ref">Transaction Reference</Label>
                    <Input id="payment-ref" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="e.g., Cheque No, UPI ID" />
                </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
