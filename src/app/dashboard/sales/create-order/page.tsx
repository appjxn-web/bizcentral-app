

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
import { PlusCircle, Save, Trash2, Check, ChevronsUpDown, CalendarClock, Loader2, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Party, Product, UserRole, SalesOrder, Quotation, CoaLedger, UserProfile } from '@/lib/types';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useRole } from '@/app/dashboard/_components/role-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, doc, addDoc, serverTimestamp, setDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';
import { estimateDispatchDate, type EstimateDispatchDateOutput } from '@/ai/flows/estimate-dispatch-date-flow';
import { QRCodeSVG } from 'qrcode.react';

interface OrderItem {
  id: string;
  productId: string;
  name: string;
  hsn: string;
  quantity: number;
  unit: string;
  discount: number;
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
    maximumFractionDigits: 2,
  }).format(num);
};

const getMaxDiscount = (role: UserRole, category: string): number => {
    if (role === 'Admin' || role === 'CEO') {
        return 100;
    }
    if (role === 'Sales Manager') {
        return 20;
    }
    if (role === 'Manager') { 
        if (category === 'Electronics') return 12;
        if (category === 'Furniture') return 15;
        return 10;
    }
    if (role === 'Employee') { 
        if (category === 'Electronics') return 10;
        if (category === 'Furniture') return 13;
        return 8;
    }
    return 5;
};

export default function CreateSalesOrderPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentRole } = useRole();
  const firestore = useFirestore();
  const { user: authUser } = useUser();
  
  const [selectedPartyId, setSelectedPartyId] = React.useState<string | null>(null);
  const [orderDate, setOrderDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = React.useState('');
  const [items, setItems] = React.useState<OrderItem[]>([]);
  const [terms, setTerms] = React.useState('50% advance payment required. Delivery within 15 working days. Warranty: 1 year on all products.');
  const [bookingAmount, setBookingAmount] = React.useState(0);
  const [openCustomerCombobox, setOpenCustomerCombobox] = React.useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);
  const [quotationId, setQuotationId] = React.useState<string | null>(null);
  
  const { data: allProducts, loading: productsLoading } = useCollection<Product>(query(collection(firestore, 'products'), where('saleable', '==', true)));

  // State for payment dialog
  const [paymentDate, setPaymentDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMode, setPaymentMode] = React.useState('UPI');
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [paymentRef, setPaymentRef] = React.useState('');
  const [paymentDetails, setPaymentDetails] = React.useState('');
  const [bankAccountId, setBankAccountId] = React.useState('');
  
  const [dispatchEstimate, setDispatchEstimate] = React.useState<EstimateDispatchDateOutput | null>(null);
  const [isEstimating, setIsEstimating] = React.useState(false);
  const [openProductCombobox, setOpenProductCombobox] = React.useState<string | null>(null);

  const { data: parties, loading: partiesLoading } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: companyInfo } = useDoc<any>(doc(firestore, 'company', 'info'));
  const saleableProducts = allProducts || [];
  
  const paymentAccounts = React.useMemo(() => {
    if (!coaLedgers) return [];
    return coaLedgers.filter(l => l.groupId === '1.1.1');
  }, [coaLedgers]);


  React.useEffect(() => {
    const rawData = localStorage.getItem('quotationToConvert');
    if (rawData) {
        const data = JSON.parse(rawData);
        setSelectedPartyId(data.customerId);
        setQuotationId(data.quotationNumber || data.id);
        setItems(data.items.map((item: any, i: number) => ({
            ...item, 
            quantity: item.quantity || item.qty || 1,
            id: `item-${Date.now()}-${i}`
        })));
        setOverallDiscount(data.overallDiscount || 0);
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
                        quantity: item.quantity,
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


  const selectedParty = React.useMemo(() => {
    if (!parties) return null;
    return parties.find(p => p.id === selectedPartyId) || null;
  }, [selectedPartyId, parties]);
  
  const isInterstate = React.useMemo(() => {
    if (!selectedParty?.gstin) return false;
    return !companyGstin.startsWith(selectedParty.gstin.substring(0, 2));
  }, [selectedParty]);
  
  const [overallDiscount, setOverallDiscount] = React.useState(0);

  const calculations = React.useMemo(() => {
    const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
    const totalDiscountAmount = subtotal * (overallDiscount / 100);
    const taxableAmount = subtotal - totalDiscountAmount;
    const totalGst = items.reduce((acc, item) => {
        const itemSubtotal = item.rate * item.quantity;
        const itemDiscount = itemSubtotal * (overallDiscount / 100);
        const discountedAmount = itemSubtotal - itemDiscount;
        return acc + (discountedAmount * (item.gstRate / 100));
    }, 0);

    const grandTotal = taxableAmount + totalGst;
    const cgst = isInterstate ? 0 : totalGst / 2;
    const sgst = isInterstate ? 0 : totalGst / 2;
    const igst = isInterstate ? totalGst : 0;
    
    return { subtotal, totalDiscountAmount, taxableAmount, cgst, sgst, igst, grandTotal };
  }, [items, isInterstate, overallDiscount]);
  
  const maxAllowedDiscount = React.useMemo(() => {
    if (!items.length) return getMaxDiscount(currentRole, '');
    
    const maxDiscounts = items.map(item => {
        const product = saleableProducts.find(p => p.id === item.productId);
        return getMaxDiscount(currentRole, product?.category || '');
    });

    return Math.min(...maxDiscounts);
  }, [items, currentRole, saleableProducts]);

  const isSaveDisabled = React.useMemo(() => {
    return overallDiscount > maxAllowedDiscount;
  }, [overallDiscount, maxAllowedDiscount]);


  const canReceiveCash = React.useMemo(() => {
    return currentRole !== 'Customer';
  }, [currentRole]);

  const handleAddItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}`,
      productId: '',
      name: '',
      hsn: '',
      quantity: 1,
      unit: 'pcs',
      discount: 0,
      rate: 0,
      gstRate: 18,
      amount: 0,
    };
    setItems([...items, newItem]);
  };
  
  const handleItemChange = (itemId: string, field: keyof Omit<OrderItem, 'id' | 'discount'>, value: any) => {
    setItems(prevItems => {
        const newItems = prevItems.map(item => {
            if (item.id === itemId) {
                const updatedItem = { ...item, [field]: value };
                let product: Product | undefined;
                
                if (field === 'productId') {
                    const product = saleableProducts.find(p => p.id === value);
                    if (product) {
                        updatedItem.name = product.name;
                        updatedItem.hsn = product.hsn || product.id.slice(0,4).toUpperCase();
                        updatedItem.rate = product.price;
                        updatedItem.gstRate = 18; 
                        updatedItem.category = product.category;
                    }
                }
                
                updatedItem.amount = updatedItem.quantity * updatedItem.rate;
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
  
  const handleSaveSalesOrder = async () => {
    if (isSaveDisabled) return;
    if (!selectedPartyId || items.length === 0) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a customer and add items.' });
      return;
    }
    if (!firestore || !authUser) return;

    // Fetch the full UserProfile associated with the Party
    const customerUserQuery = query(collection(firestore, 'users'), where('email', '==', selectedParty?.email), limit(1));
    const customerUserSnap = await getDocs(customerUserQuery);

    let customerDisplayName = selectedParty?.name || '';
    let customerUserId = selectedPartyId;

    if (!customerUserSnap.empty) {
        const customerUserData = customerUserSnap.docs[0].data() as UserProfile;
        customerDisplayName = customerUserData.displayName || customerUserData.name;
        customerUserId = customerUserSnap.docs[0].id;
    }


    try {
      const newOrderId = `SO-${Date.now()}`;

      const newOrderData: Partial<SalesOrder> = {
          orderNumber: newOrderId,
          userId: customerUserId, 
          customerName: customerDisplayName,
          customerEmail: selectedParty?.email || '',
          date: orderDate,
          expectedDeliveryDate: expectedDeliveryDate || null,
          items: items.map(({id, category, ...rest}) => ({...rest, discount: overallDiscount})),
          subtotal: calculations.subtotal,
          discount: calculations.totalDiscountAmount,
          cgst: calculations.cgst,
          sgst: calculations.sgst,
          grandTotal: calculations.grandTotal,
          total: calculations.grandTotal,
          paymentReceived: bookingAmount,
          balance: calculations.grandTotal - bookingAmount,
          pickupPointId: 'company-main',
          assignedToUid: authUser.uid, // Assign to the admin/manager creating it
          createdBy: authUser.displayName || 'System',
          paymentDetails: paymentDetails,
          status: 'Ordered',
          createdAt: serverTimestamp(),
          ...(quotationId && { quotationId: quotationId }),
      };
      
      await addDoc(collection(firestore, 'orders'), newOrderData);
      toast({ title: 'Sales Order Saved', description: `Order ${newOrderId} has been saved.` });
      router.push('/dashboard/sales/orders');
    } catch (e) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Save failed' });
    }
  };

  const handleRecordPayment = () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0 || !bankAccountId) {
        toast({ variant: 'destructive', title: 'Invalid Payment', description: 'Please enter a valid amount and select a payment account.' });
        return;
    }
    setBookingAmount(prev => prev + amount);
    
    const accountName = paymentAccounts.find(acc => acc.id === bankAccountId)?.name || 'Unknown Account';
    const details = `Mode: ${accountName}, Ref: ${paymentRef}, Date: ${paymentDate}, Amount: ₹${amount.toFixed(2)}`;
    setPaymentDetails(prev => prev ? `${prev}\\n${details}` : details);
    
    toast({ title: 'Payment Recorded', description: `₹${amount.toFixed(2)} recorded.` });
    
    setIsPaymentDialogOpen(false);
    setPaymentAmount('');
    setPaymentRef('');
    setBankAccountId('');
  }


  return (
    <>
      <PageHeader title="Create Sales Order">
        <Button onClick={handleSaveSalesOrder} disabled={isSaveDisabled}>
          <Save className="mr-2 h-4 w-4" /> Save Sales Order
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
          <CardTitle>Sales Order Details</CardTitle>
          <CardDescription>Fill in the details to generate a new sales order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
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
                    <Label htmlFor="order-date">Order Date</Label>
                    <Input
                        id="order-date"
                        type="date"
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="expected-delivery-date">Expected Delivery Date</Label>
                    <Input
                        id="expected-delivery-date"
                        type="date"
                        value={expectedDeliveryDate}
                        onChange={(e) => setExpectedDeliveryDate(e.target.value)}
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
                    <TableHead className="w-[10%]">HSN</TableHead>
                    <TableHead className="w-[8%]">Qty</TableHead>
                    <TableHead className="w-[8%]">Unit</TableHead>
                    <TableHead className="w-[12%]">Rate</TableHead>
                    <TableHead className="w-[8%]">GST %</TableHead>
                    <TableHead className="text-right w-[15%]">Amount</TableHead>
                    <TableHead className="w-[8%]"><span className="sr-only">Actions</span></TableHead>
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
                                  {item.productId ? saleableProducts.find(p => p.id === item.productId)?.name : "Select Item..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                  <CommandInput placeholder="Search product..." />
                                  <CommandList>
                                      <CommandEmpty>No product found.</CommandEmpty>
                                      <CommandGroup>
                                          {saleableProducts.map(p => (
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
                      <TableCell><Input type="number" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', Number(e.target.value))} /></TableCell>
                      <TableCell><Input value={item.unit} onChange={e => handleItemChange(item.id, 'unit', e.target.value)} /></TableCell>
                      <TableCell><Input type="number" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', Number(e.target.value))} /></TableCell>
                      <TableCell><Input type="number" value={item.gstRate} onChange={e => handleItemChange(item.id, 'gstRate', Number(e.target.value))} /></TableCell>
                      <TableCell className="text-right font-mono">{formatIndianCurrency(item.quantity * item.rate)}</TableCell>
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
             <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="terms">Terms & Conditions</Label>
                    <Textarea id="terms" value={terms} onChange={e => setTerms(e.target.value)} rows={5} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="payment-details">Payment Details</Label>
                    <Textarea id="payment-details" value={paymentDetails} onChange={e => setPaymentDetails(e.target.value)} placeholder="e.g., Transaction ID, Cheque No." />
                </div>
                <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">Record Advance Payment</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Record Advance Payment</DialogTitle>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="payment-date">Payment Date</Label>
                                <Input id="payment-date" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="payment-account">Received In</Label>
                                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                                    <SelectTrigger id="payment-account"><SelectValue placeholder="Select bank/cash account" /></SelectTrigger>
                                    <SelectContent>
                                        {paymentAccounts.map(acc => (
                                            <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment-amount">Amount Received</Label>
                                <Input id="payment-amount" type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="₹0.00" />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="payment-ref">Transaction Reference</Label>
                                <Input id="payment-ref" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="e.g., UTR, Cheque No." />
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                            <Button onClick={handleRecordPayment}>Record Payment</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
            <div className="space-y-3 p-4 border rounded-md bg-muted/50">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatIndianCurrency(calculations.subtotal)}</span></div>
               <div className="flex justify-between items-center">
                  <Label htmlFor="overall-discount" className="text-sm">Discount (%)</Label>
                  <div className="w-24">
                      <Input id="overall-discount" type="number" value={overallDiscount} onChange={(e) => setOverallDiscount(Number(e.target.value))} className="text-right" placeholder="%" />
                      <p className="text-xs text-muted-foreground mt-1">Max: {maxAllowedDiscount}%</p>
                  </div>
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
              <div className="flex justify-between items-center text-primary">
                  <span>Payment Received</span>
                  <span className="font-mono font-bold">{formatIndianCurrency(bookingAmount)}</span>
              </div>
               <div className="flex justify-between items-center font-semibold">
                  <span>Balance</span>
                  <span className="font-mono">{formatIndianCurrency(calculations.grandTotal - bookingAmount)}</span>
              </div>
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

