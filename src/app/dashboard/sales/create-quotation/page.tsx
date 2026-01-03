

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
import { PlusCircle, Save, Trash2, Check, ChevronsUpDown, CalendarClock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Party, Product, UserRole, SalesOrder, Quotation } from '@/lib/types';
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
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, doc, addDoc, getDoc, updateDoc, query, where } from 'firebase/firestore';
import { estimateDispatchDate, type EstimateDispatchDateOutput } from '@/ai/flows/estimate-dispatch-date-flow';

interface QuotationItem {
    id: string;
    productId: string;
    name: string;
    hsn: string;
    qty: number;
    unit: string;
    rate: number;
    gstRate: number;
    amount: number;
    category?: string;
}

const companyGstin = '08AAFCJ5369P1ZR'; // Mock company GSTIN

const formatIndianCurrency = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(num);
};

export default function CreateQuotationPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const { user: authUser } = useUser();
  const firestore = useFirestore();
  
  const { data: parties, loading: partiesLoading } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: products, loading: productsLoading } = useCollection<Product>(query(collection(firestore, 'products'), where('saleable', '==', true)));
  
  const [loading, setLoading] = React.useState(!!editId);
  const [isSaving, setIsSaving] = React.useState(false);
  const [selectedPartyId, setSelectedPartyId] = React.useState<string | null>(null);
  const [quotationDate, setQuotationDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [items, setItems] = React.useState<any[]>([]);
  const [terms, setTerms] = React.useState('50% advance payment required. Delivery within 15 working days.');
  const [overallDiscount, setOverallDiscount] = React.useState(0);
  const [openCustomerCombobox, setOpenCustomerCombobox] = React.useState(false);
  const [openProductCombobox, setOpenProductCombobox] = React.useState<string | null>(null);

  const [dispatchEstimate, setDispatchEstimate] = React.useState<EstimateDispatchDateOutput | null>(null);
  const [isEstimating, setIsEstimating] = React.useState(false);

  React.useEffect(() => {
    if (editId && firestore) {
      const loadQuotation = async () => {
        setLoading(true);
        const docRef = doc(firestore, 'quotations', editId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Quotation;
          setSelectedPartyId(data.customerId);
          setQuotationDate(format(new Date(data.date), 'yyyy-MM-dd'));
          setItems(data.items.map((item, i) => ({...item, id: `item-${Date.now()}-${i}`})));
          setTerms(data.terms);
          setOverallDiscount(data.overallDiscount || 0);
        } else {
          toast({ variant: "destructive", title: "Quotation not found" });
        }
        setLoading(false);
      };
      loadQuotation();
    }
  }, [editId, firestore, toast]);

  const selectedParty = React.useMemo(() => {
    if (!parties) return null;
    return parties.find(p => p.id === selectedPartyId) || null;
  }, [selectedPartyId, parties]);
  
  const isInterstate = React.useMemo(() => {
    if (!selectedParty?.gstin) return false;
    return !companyGstin.startsWith(selectedParty.gstin.substring(0, 2));
  }, [selectedParty]);
  
  const calculations = React.useMemo(() => {
    const subtotal = items.reduce((acc, item) => acc + (item.qty * item.rate), 0);
    const totalDiscountAmount = subtotal * (overallDiscount / 100);
    const taxableAmount = subtotal - totalDiscountAmount;
    const totalGst = items.reduce((acc, item) => {
        const itemSubtotal = item.rate * item.qty;
        const itemDiscount = itemSubtotal * (overallDiscount / 100);
        const discountedAmount = itemSubtotal - itemDiscount;
        return acc + (discountedAmount * (item.gstRate / 100));
    }, 0);

    const grandTotal = taxableAmount + totalGst;
    const cgst = isInterstate ? 0 : totalGst / 2;
    const sgst = isInterstate ? 0 : totalGst / 2;
    const igst = isInterstate ? totalGst : 0;
    
    return { subtotal, totalDiscountAmount, taxableAmount, grandTotal, totalGst, cgst, sgst, igst };
  }, [items, overallDiscount, isInterstate]);
  
  React.useEffect(() => {
    const rawData = localStorage.getItem('quotationToConvert');
    if (rawData) {
        const data = JSON.parse(rawData);
        setSelectedPartyId(data.customerId);
        setItems(data.items.map((item: any, i: number) => ({...item, id: `item-${Date.now()}-${i}`})));
        setOverallDiscount(data.discount || 0);
        setTerms(data.terms || '50% advance payment required.');
        localStorage.removeItem('quotationToConvert');
        toast({ title: "Pre-filled from Quotation" });
    }
  }, [toast]);

  React.useEffect(() => {
    const fetchEstimate = async () => {
        const machineryItems = items.filter(item => item.category === 'Plants & Machinery');
        if (machineryItems.length > 0) {
            setIsEstimating(true);
            try {
                const estimateInput = {
                    items: machineryItems.map(item => ({
                        productId: item.productId,
                        quantity: item.qty,
                        category: item.category,
                    }))
                };
                const result = await estimateDispatchDate(estimateInput);
                setDispatchEstimate(result);
            } catch (error) {
                console.error("Error fetching dispatch estimate:", error);
                setDispatchEstimate(null);
            } finally {
                setIsEstimating(false);
            }
        } else {
            setDispatchEstimate(null);
        }
    };

    fetchEstimate();
  }, [items]);


  const handleAddItem = () => {
    const newItem: QuotationItem = {
      id: `item-${Date.now()}`,
      productId: '',
      name: '',
      hsn: '',
      qty: 1,
      unit: 'pcs',
      rate: 0,
      gstRate: 18,
      amount: 0,
    };
    setItems([...items, newItem]);
  };
  
  const handleItemChange = (itemId: string, field: keyof Omit<QuotationItem, 'id'>, value: any) => {
    setItems(prevItems => {
        const newItems = prevItems.map(item => {
            if (item.id === itemId) {
                const updatedItem = { ...item, [field]: value };
                let product: Product | undefined;
                
                if (field === 'productId') {
                    const product = products?.find(p => p.id === value);
                    if (product) {
                        updatedItem.name = product.name;
                        updatedItem.hsn = product.hsn || product.id.slice(0,4).toUpperCase();
                        updatedItem.rate = product.price;
                        updatedItem.gstRate = 18; // Default
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
  
  const handleSaveQuotation = async () => {
    setIsSaving(true);
    const submissionData = {
        customerId: selectedPartyId,
        customerName: parties?.find(p => p.id === selectedPartyId)?.name || '',
        date: new Date(quotationDate).toISOString(),
        total: calculations.grandTotal,
        items: items.map(({id, ...rest}) => rest),
        terms,
        overallDiscount,
    };

    try {
      if (editId) {
        const { quotationNumber, id, createdAt, ...updateData } = submissionData as any;
        await updateDoc(doc(firestore, 'quotations', editId), {
          ...updateData,
          updatedAt: new Date().toISOString()
        });
        toast({ title: "Quotation updated successfully" });
      } else {
        await addDoc(collection(firestore, 'quotations'), {
          ...submissionData,
          quotationNumber: null, 
          status: 'Draft',
          createdAt: new Date().toISOString(),
          createdBy: authUser?.displayName || 'System'
        });
        toast({ title: "Quotation created and generating number..." });
      }
      router.push('/dashboard/sales/quotation');
    } catch (error: any) {
      toast({ variant: 'destructive', title: "Save failed", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <>
      <PageHeader title={editId ? "Edit Quotation" : "Create Quotation"}>
        <Button onClick={handleSaveQuotation} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {editId ? "Update" : "Save"} Quotation
        </Button>
      </PageHeader>
      
      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Customer</Label>
               <Popover open={openCustomerCombobox} onOpenChange={setOpenCustomerCombobox}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCustomerCombobox}
                    className="w-full justify-between"
                    disabled={partiesLoading}
                  >
                    {selectedParty
                      ? selectedParty.name
                      : "Select a customer..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Search customer..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {(parties || []).filter(p => p.type === 'Customer').map((party) => (
                          <CommandItem
                            key={party.id}
                            value={party.name}
                            onSelect={() => {
                              setSelectedPartyId(party.id);
                              setOpenCustomerCombobox(false);
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
                  <p><strong>Address:</strong> {(selectedParty.address as any)?.line1}</p>
                  <p><strong>Email:</strong> {selectedParty.email}</p>
                  <p><strong>GSTIN:</strong> {selectedParty.gstin || 'N/A'}</p>
                </div>
              )}
            </div>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="quotation-date">Quotation Date</Label>
                    <Input
                        id="quotation-date"
                        type="date"
                        value={quotationDate}
                        onChange={(e) => setQuotationDate(e.target.value)}
                    />
                </div>
            </div>
          </div>
          
          <Separator />

          <div>
            <h3 className="text-lg font-medium mb-2">Items</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%]">Item</TableHead>
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
                        <Popover open={openProductCombobox === item.id} onOpenChange={(isOpen) => setOpenProductCombobox(isOpen ? item.id : null)}>
                          <PopoverTrigger asChild>
                              <Button
                                  variant="outline"
                                  role="combobox"
                                  className="w-full justify-between"
                                  disabled={productsLoading}
                                >
                                  {item.productId ? products?.find(p => p.id === item.productId)?.name : "Select Item..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                  <CommandInput placeholder="Search product..." />
                                  <CommandList>
                                      <CommandEmpty>No product found.</CommandEmpty>
                                      <CommandGroup>
                                          {products?.map(p => (
                                              <CommandItem
                                                  key={p.id}
                                                  value={p.name}
                                                  onSelect={() => { handleItemChange(item.id, 'productId', p.id); setOpenProductCombobox(null); }}
                                              >
                                                  <Check className={cn("mr-2 h-4 w-4", item.productId === p.id ? "opacity-100" : "opacity-0")} />
                                                  {p.name}
                                              </CommandItem>
                                          ))}
                                      </CommandGroup>
                                  </CommandList>
                              </Command>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell><Input value={item.hsn} onChange={e => handleItemChange(item.id, 'hsn', e.target.value)} /></TableCell>
                      <TableCell><Input type="number" value={item.qty} onChange={e => handleItemChange(item.id, 'qty', Number(e.target.value))} /></TableCell>
                      <TableCell><Input value={item.unit} onChange={e => handleItemChange(item.id, 'unit', e.target.value)} /></TableCell>
                      <TableCell><Input type="number" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', Number(e.target.value))} /></TableCell>
                      <TableCell><Input type="number" value={item.gstRate} onChange={e => handleItemChange(item.id, 'gstRate', Number(e.target.value))} /></TableCell>
                      <TableCell className="text-right font-mono">{formatIndianCurrency(item.qty * item.rate)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button variant="outline" size="sm" onClick={handleAddItem} className="mt-4 w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Item
            </Button>
          </div>
          
          <Separator />
          
          <div className="grid md:grid-cols-2 gap-8">
             <div className="space-y-2">
              <Label htmlFor="terms">Terms & Conditions</Label>
              <Textarea id="terms" value={terms} onChange={e => setTerms(e.target.value)} rows={5} />
            </div>
            <div className="space-y-3 p-4 border rounded-md bg-muted/50">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatIndianCurrency(calculations.subtotal)}</span></div>
              <div className="flex justify-between items-center">
                  <Label htmlFor="overall-discount" className="text-sm">Discount (%)</Label>
                  <Input id="overall-discount" type="number" value={overallDiscount} onChange={(e) => setOverallDiscount(Number(e.target.value))} className="w-24 h-8 text-right font-mono" placeholder="%" />
              </div>
              <div className="flex justify-between text-green-600">
                <span>Discount Amount</span>
                <span className="font-mono">- {formatIndianCurrency(calculations.totalDiscountAmount)}</span>
              </div>
              <div className="flex justify-between font-semibold"><span>Taxable Amount</span><span className="font-mono">{formatIndianCurrency(calculations.taxableAmount)}</span></div>
              
              {isInterstate ? (
                    <div className="flex justify-between"><span>IGST</span><span className="font-mono">{formatIndianCurrency(calculations.igst)}</span></div>
                ) : (
                    <>
                        <div className="flex justify-between"><span>CGST</span><span className="font-mono">{formatIndianCurrency(calculations.cgst)}</span></div>
                        <div className="flex justify-between"><span>SGST</span><span className="font-mono">{formatIndianCurrency(calculations.sgst)}</span></div>
                    </>
                )}
              
              <Separator />
              <div className="flex justify-between font-bold text-lg"><span>Grand Total</span><span className="font-mono">{formatIndianCurrency(calculations.grandTotal)}</span></div>
                {isEstimating ? (
                    <div className="flex items-center justify-center p-4 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calculating dispatch time...</div>
                ) : dispatchEstimate?.hasEstimate && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md space-y-1">
                        <p className="font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-blue-600"/> Estimated Dispatch Date</p>
                        <p className="font-bold text-blue-700 dark:text-blue-400">{dispatchEstimate.estimatedDate}</p>
                        <p className="text-xs text-muted-foreground">{dispatchEstimate.reasoning}</p>
                    </div>
                )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

