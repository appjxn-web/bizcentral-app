

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
import { parties } from '@/lib/data';
import { products } from '@/lib/product-data';
import type { Party, Product, UserRole, PurchaseRequest, CompanyInfo, PurchaseOrder } from '@/lib/types';
import { format, startOfMonth } from 'date-fns';
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
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, addDoc, serverTimestamp, setDoc, query, where, orderBy, limit, getDocs, updateDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';

interface POItem {
  id: string;
  productId: string;
  name: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
}

const companyGstin = '08AAFCJ5369P1ZR'; // Mock company GSTIN

export default function CreatePurchaseOrderPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const poIdToEdit = searchParams.get('id');
  const firestore = useFirestore();

  const { data: parties, loading: partiesLoading } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: products, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
  const { data: purchaseOrders, loading: poLoading } = useCollection<PurchaseOrder>(collection(firestore, 'purchaseOrders'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
  
  const [selectedPartyId, setSelectedPartyId] = React.useState<string | null>(null);
  const [orderDate, setOrderDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [items, setItems] = React.useState<POItem[]>([]);
  const [terms, setTerms] = React.useState('Payment within 30 days of invoice. Please mention PO number on all invoices.');
  const [paymentDetails, setPaymentDetails] = React.useState('');
  const [bookingAmount, setBookingAmount] = React.useState(0);
  const [openCombobox, setOpenCombobox] = React.useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);

  const isEditMode = !!poIdToEdit;
  const purchasableProducts = React.useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.source === 'Bought' || p.type === 'Raw Materials' || p.type === 'Components');
  }, [products]);
  
  React.useEffect(() => {
    if (isEditMode && firestore && poIdToEdit && purchaseOrders) {
      const poToEdit = purchaseOrders.find(po => po.id === poIdToEdit);
      if (poToEdit) {
          setSelectedPartyId(poToEdit.supplierId || null);
          setOrderDate(poToEdit.date || format(new Date(), 'yyyy-MM-dd'));
          setItems(poToEdit.items.map((item, index) => ({
            id: `item-${Date.now()}-${index}`,
            productId: item.productId,
            name: item.productName,
            qty: item.quantity,
            rate: item.rate,
            amount: item.rate * item.quantity,
            unit: products?.find(p => p.id === item.productId)?.unit || 'pcs',
            hsn: '',
          })));
      }
    }
  }, [isEditMode, poIdToEdit, firestore, products, purchaseOrders]);

  const selectedParty = React.useMemo(() => {
    if (!parties) return null;
    return parties.find(p => p.id === selectedPartyId) || null;
  }, [selectedPartyId, parties]);
  
  const isInterstate = React.useMemo(() => {
    if (!selectedParty?.gstin) return false;
    return !companyGstin.startsWith(selectedParty.gstin.substring(0, 2));
  }, [selectedParty]);
  
  const calculations = React.useMemo(() => {
    const subtotal = items.reduce((acc, item) => acc + item.amount, 0);
    const totalGst = subtotal * 0.18; // Simplified: assuming flat 18%
    const grandTotal = subtotal + totalGst;
    
    const cgst = isInterstate ? 0 : totalGst / 2;
    const sgst = isInterstate ? 0 : totalGst / 2;
    const igst = isInterstate ? totalGst : 0;
    
    return { subtotal, cgst, sgst, igst, grandTotal };
  }, [items, isInterstate]);

  const handleAddItem = () => {
    const newItem: POItem = {
      id: `item-${Date.now()}`,
      productId: '',
      name: '',
      hsn: '',
      qty: 1,
      unit: 'pcs',
      rate: 0,
      amount: 0,
    };
    setItems([...items, newItem]);
  };
  
  const handleItemChange = (itemId: string, field: keyof POItem, value: any) => {
    setItems(prevItems => {
        const newItems = prevItems.map(item => {
            if (item.id === itemId) {
                const updatedItem = { ...item, [field]: value };
                let product: Product | undefined;
                
                if (field === 'productId') {
                    const product = products?.find(p => p.id === value);
                    if (product) {
                        updatedItem.name = product.name;
                        updatedItem.rate = product.cost || 0; 
                        updatedItem.unit = product.unit;
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
  
  const handleSavePurchaseOrder = async () => {
    if (!selectedPartyId || items.length === 0 || !settingsData?.prefixes) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Select a supplier and add items.' });
      return;
    }

    try {
      if (isEditMode) {
        const poRef = doc(firestore, 'purchaseOrders', poIdToEdit!);
        await updateDoc(poRef, { ...calculations, date: orderDate, supplierId: selectedPartyId,
            items: items.map(({ id, hsn, ...item }) => ({
                productId: item.productId,
                productName: item.name,
                quantity: item.qty,
                rate: item.rate,
                amount: item.amount,
                unit: item.unit
            })),
        });
        toast({ title: 'PO Updated' });
      } else {
        const newPoId = getNextDocNumber('Purchase Order', settingsData?.prefixes, purchaseOrders || []);
        
        const poData: Omit<PurchaseOrder, 'createdAt'> = {
          id: newPoId,
          supplierId: selectedPartyId,
          supplierName: selectedParty?.name || 'Unknown',
          date: orderDate,
          status: 'Draft',
          items: items.map(({ id, hsn, ...item }) => ({
            productId: item.productId,
            productName: item.name,
            quantity: item.qty,
            rate: item.rate,
            amount: item.amount,
            unit: item.unit
          })),
          ...calculations,
        };

        await setDoc(doc(firestore, 'purchaseOrders', newPoId), { ...poData, createdAt: serverTimestamp() });
        
        toast({ title: 'Purchase Order Saved', description: `Created order ${newPoId}` });
      }
      router.push('/dashboard/procurement/purchase-orders');
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save order.' });
    }
  };


  const suppliers = React.useMemo(() => {
    if (!parties) return [];
    return parties.filter(p => p.type === 'Supplier' || p.type === 'Vendor');
  }, [parties]);


  return (
    <>
      <PageHeader title={isEditMode ? `Edit Purchase Order: ${poIdToEdit}` : "Create Purchase Order"}>
        <Button onClick={handleSavePurchaseOrder}>
          <Save className="mr-2 h-4 w-4" /> Save
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
          <CardTitle>Purchase Order Details</CardTitle>
          <CardDescription>Fill in the details to create a new purchase order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-4 md:col-span-2">
              <Label>Supplier</Label>
               <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCombobox}
                    className="w-full justify-between"
                    disabled={partiesLoading}
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
              {selectedParty && (
                <div className="text-sm p-3 rounded-md border bg-muted/50 space-y-1">
                  <p><strong>Contact:</strong> {selectedParty.name}</p>
                  <p><strong>Address:</strong> {[selectedParty.address?.line1, selectedParty.address?.line2, selectedParty.address?.city, selectedParty.address?.state, selectedParty.address?.pin].filter(Boolean).join(', ')}</p>
                  <p><strong>Email:</strong> {selectedParty.email}</p>
                  <p><strong>Phone:</strong> {selectedParty.phone}</p>
                  <p><strong>GSTIN:</strong> {selectedParty.gstin || 'N/A'}</p>
                </div>
              )}
            </div>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="order-date">PO Date</Label>
                    <Input
                        id="order-date"
                        type="date"
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                    />
                </div>
            </div>
          </div>
          
          <Separator />

          <div>
            <h3 className="text-lg font-medium mb-2">Items</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell>
                       <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between"
                          >
                            {item.productId
                              ? purchasableProducts.find(p => p.id === item.productId)?.name
                              : "Select an item..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                          <Command>
                            <CommandInput placeholder="Search item..." />
                            <CommandList>
                              <CommandEmpty>No item found.</CommandEmpty>
                              <CommandGroup>
                                {purchasableProducts.map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={p.name}
                                    onSelect={() => {
                                      handleItemChange(item.id, 'productId', p.id);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        item.productId === p.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {p.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell><Input type="number" value={item.qty || 0} onChange={e => handleItemChange(item.id, 'qty', Number(e.target.value))} /></TableCell>
                    <TableCell><Input value={item.unit || ''} onChange={e => handleItemChange(item.id, 'unit', e.target.value)} /></TableCell>
                    <TableCell><Input type="number" value={item.rate || 0} onChange={e => handleItemChange(item.id, 'rate', Number(e.target.value))} /></TableCell>
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
                    <TableCell colSpan={5}>
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
              </div>
          </div>

          <Separator />

          <div className="grid gap-6">
            <div className="space-y-2">
              <Label htmlFor="terms">Terms & Conditions</Label>
              <Textarea id="terms" value={terms} onChange={e => setTerms(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

