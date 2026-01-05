

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  MoreHorizontal,
  PlusCircle,
  ChevronDown,
  ChevronRight,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Building,
  User as UserIcon,
  Phone,
  MapPin,
  ListFilter,
  DollarSign,
  RefreshCcw,
  Receipt,
  CircleDollarSign,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus, UserProfile, UserRole, WorkOrder, PickupPoint, SalesOrder, RefundRequest, Product, ServiceInvoice, SalesInvoice } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, query, orderBy, doc, where, or, updateDoc, writeBatch, limit } from 'firebase/firestore';
import { OrderStatusTracker } from '../../my-orders/_components/order-status';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger
} from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { Input } from '@/components/ui/input';
import { useRole } from '../../_components/role-provider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

function getStatusBadgeVariant(status: Order['status'] | 'Refund Pending' | 'Refund Complete' | SalesInvoice['status']) {
  const variants: Record<string, string> = {
    Delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'Refund Complete': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Shipped: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    'Invoice Sent': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Ordered: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Refund Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Work Complete': 'bg-yellow-100 text-yellow-800',
    Manufacturing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    'Ready for Dispatch': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    'Awaiting Payment': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    Unpaid: 'bg-orange-100 text-orange-800',
    Overdue: 'bg-red-100 text-red-800',
    Canceled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    'Cancellation Requested': 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
  };
  return variants[status];
}

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
};

function PayBalanceDialog({ order, companyInfo }: { order: Order, companyInfo: any }) {
    if (!order.balance || order.balance <= 0) return null;

    const upiString = `upi://pay?pa=${companyInfo?.primaryUpiId || 'your-upi-id@okhdfcbank'}&pn=${encodeURIComponent(companyInfo?.companyName || 'Your Company Name')}&am=${order.balance.toFixed(2)}&cu=INR&tn=Order%20Balance%20Payment`;

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button size="sm">
                    <DollarSign className="mr-2 h-4 w-4" /> Pay Balance
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Pay Remaining Balance</DialogTitle>
                    <DialogDescription>
                        Scan the QR code to pay the balance of {formatIndianCurrency(order.balance)} for Order ID: {order.orderNumber || order.id}.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                    <div className="p-4 bg-white rounded-lg border">
                        <QRCodeSVG value={upiString} size={180} />
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                        After payment, please enter the transaction ID in the field below to confirm your payment.
                    </p>
                    <Input placeholder="Enter UPI Transaction ID" />
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Close</Button>
                    </DialogClose>
                     <Button type="button">Confirm Payment</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function CancelOrderDialog({ order, onConfirm, open, onOpenChange }: { order: Order; onConfirm: (reason: string, details?: string) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = React.useState('');
  const [otherDetails, setOtherDetails] = React.useState('');

  const handleSubmit = () => {
    if (!reason) {
      alert('Please select a reason.');
      return;
    }
    onConfirm(reason, otherDetails);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Cancellation for Order: {order.orderNumber || order.id}</DialogTitle>
          <DialogDescription>
            Please let us know why you are canceling this order. An admin will review and approve your request.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancellation-reason">Reason for Cancellation</Label>
            <Select onValueChange={setReason} value={reason}>
              <SelectTrigger id="cancellation-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ordered by mistake">Ordered by mistake</SelectItem>
                <SelectItem value="Item no longer needed">Item no longer needed</SelectItem>
                <SelectItem value="Found a better price elsewhere">Found a better price elsewhere</SelectItem>
                <SelectItem value="Delivery time is too long">Delivery time is too long</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reason === 'Other' && (
            <div className="space-y-2">
              <Label htmlFor="other-details">Please specify</Label>
              <Textarea
                id="other-details"
                value={otherDetails}
                onChange={(e) => setOtherDetails(e.target.value)}
                placeholder="Please provide more details..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Go Back</Button></DialogClose>
          <Button variant="destructive" onClick={handleSubmit} disabled={!reason}>Request Cancellation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function PartnerPickupDetails({ userId }: { userId: string }) {
    const firestore = useFirestore();
    const userDocRef = userId ? doc(firestore, 'users', userId) : null;
    const { data: partner, loading } = useDoc<UserProfile>(userDocRef);

    if (loading) return <p className="text-sm text-muted-foreground">Loading partner details...</p>;
    if (!partner) return <p className="text-sm text-destructive">Could not load partner details.</p>;
    
    const address = (partner.addresses || [])[0];
    const addressString = address ? [address.line1, address.line2, address.city, address.state, address.pin].filter(Boolean).join(', ') : 'Address not available';
    
    let mapUrl = addressString ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressString)}` : '';
    if (address?.latitude && address?.longitude) {
        mapUrl = `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`;
    }

    return (
        <>
            <p className="font-medium">{partner.businessName || partner.name}</p>
            <p className="text-xs text-muted-foreground">Partner</p>
            {addressString && <p className="mt-2 text-sm">{addressString}</p>}
            <div className="flex gap-4 mt-2">
                {partner.mobile && <a href={`tel:${partner.mobile}`} className="flex items-center gap-1 text-primary hover:underline text-sm"><Phone className="h-4 w-4" /> Call</a>}
                {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm"><MapPin className="h-4 w-4" /> Get Directions</a>}
            </div>
        </>
    );
}

function CompanyPickupDetails() {
    const { data: companyInfo, loading } = useDoc<any>(doc(useFirestore(), 'company', 'info'));
    
    if (loading) return <p className="text-sm text-muted-foreground">Loading details...</p>;
    if (!companyInfo) return <p className="text-sm text-destructive">Could not load company details.</p>;

    const mainAddress = companyInfo.addresses?.find((a: any) => a.type === 'Main Office' || a.type === 'Registered Office') || companyInfo.addresses?.[0];

    if (!mainAddress) return <p className="text-sm text-destructive">Main company address not found.</p>;

    const addressString = [mainAddress.line1, mainAddress.line2, mainAddress.city, mainAddress.state, mainAddress.pin].filter(Boolean).join(', ');
    const phone = mainAddress.pickupContactPhone || companyInfo.contactNumber;
    let mapUrl = addressString ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressString)}` : '';
    if (mainAddress.latitude && mainAddress.longitude) {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${mainAddress.latitude},${mainAddress.longitude}`;
    }
    
    return (
        <>
            <p className="font-medium">{mainAddress.pickupContactName || companyInfo.companyName}</p>
            <p className="text-xs text-muted-foreground">Main Office / Factory</p>
            {addressString && <p className="mt-2 text-sm">{addressString}</p>}
            <div className="flex gap-4 mt-2">
                {phone && <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary hover:underline text-sm"><Phone className="h-4 w-4" /> Call</a>}
                {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm"><MapPin className="h-4 w-4" /> Get Directions</a>}
            </div>
        </>
    );
}

function OrderRow({ order, onGenerateInvoice, onUpdateStatus, pickupPoints, dynamicStatus, allProducts, getOrderInHand }: { order: Order, onGenerateInvoice: (order: Order) => void, onUpdateStatus: (orderId: string, status: OrderStatus) => void, pickupPoints: PickupPoint[] | null, dynamicStatus: OrderStatus, allProducts: Product[] | null, getOrderInHand: (productId: string) => number }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const orderStatuses: OrderStatus[] = ['Manufacturing', 'Ready for Dispatch', 'Awaiting Payment', 'Shipped', 'Delivered'];

  const pickupPointName = pickupPoints?.find(p => p.id === order.pickupPointId)?.name || 'N/A';
  
  return (
    <Collapsible asChild key={order.id} open={isOpen} onOpenChange={setIsOpen}>
      <TableBody>
        <TableRow>
          <TableCell>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="sr-only">Toggle details</span>
              </Button>
            </CollapsibleTrigger>
          </TableCell>
          <TableCell className="font-mono">{(order as SalesOrder).orderNumber || order.id}</TableCell>
          <TableCell>{order.customerName}</TableCell>
          <TableCell>{format(new Date(order.date), 'dd/MM/yyyy')}</TableCell>
           <TableCell>{(order as SalesOrder).expectedDeliveryDate ? format(new Date((order as SalesOrder).expectedDeliveryDate!), 'dd/MM/yyyy') : 'N/A'}</TableCell>
          <TableCell>
            <Badge className={cn('text-xs', getStatusBadgeVariant(dynamicStatus))} variant="outline">
              {dynamicStatus}
            </Badge>
          </TableCell>
          <TableCell className="text-right font-mono">{formatIndianCurrency(order.grandTotal)}</TableCell>
          <TableCell className="text-right">
              <div className="flex gap-2 justify-end">
                <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={!['Awaiting Payment', 'Ready for Dispatch', 'Shipped', 'Delivered'].includes(dynamicStatus)}
                    onClick={() => onGenerateInvoice(order)}
                >
                    Generate Invoice
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {orderStatuses.map(status => (
                      <DropdownMenuItem key={status} onClick={() => onUpdateStatus(order.id, status)}>
                        {status}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
          </TableCell>
        </TableRow>
        <CollapsibleContent asChild>
          <TableRow>
              <TableCell colSpan={8} className="p-0">
                  <div className="p-6 space-y-6 bg-muted/50">
                      <div className="space-y-2">
                        {order.items.map(item => {
                            const product = allProducts?.find(p => p.id === item.productId);
                            const stock = product?.openingStock || 0;
                            const orderInHand = getOrderInHand(item.productId);
                            return (
                                <div key={item.productId} className="flex items-center justify-between py-2 border-b">
                                    <div className="flex items-center gap-4">
                                        <Image src={`https://picsum.photos/seed/${item.productId}/64/64`} alt={item.name} width={64} height={64} className="rounded-md object-cover" />
                                        <div>
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                                            <div className="flex gap-4 text-xs text-muted-foreground">
                                                <span>Available Stock: {stock}</span>
                                                <span>Order in Hand: {orderInHand}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="font-medium">{formatIndianCurrency(item.price * item.quantity)}</p>
                                </div>
                            )
                        })}
                      </div>
                      <Separator />
                      <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                              <h4 className="font-semibold">Payment Summary</h4>
                              <div className="text-sm space-y-2 text-muted-foreground">
                                  <div className="flex justify-between"><span>Subtotal:</span> <span className="font-mono">{formatIndianCurrency(order.subtotal)}</span></div>
                                  <div className="flex justify-between"><span>Discount:</span> <span className="font-mono">{formatIndianCurrency(order.discount)}</span></div>
                                  <div className="flex justify-between"><span>Taxes (CGST+SGST):</span> <span className="font-mono">{formatIndianCurrency(order.cgst + order.sgst)}</span></div>
                                  <div className="flex justify-between font-bold text-foreground"><span>Grand Total:</span> <span className="font-mono">{formatIndianCurrency(order.grandTotal)}</span></div>
                                  <Separator/>
                                  <div className="flex justify-between font-medium text-green-600"><span>Paid:</span> <span className="font-mono">{formatIndianCurrency(order.paymentReceived || 0)}</span></div>
                                  <div className="flex justify-between font-bold text-red-600"><span>Balance Due:</span> <span className="font-mono">{formatIndianCurrency(order.balance || 0)}</span></div>
                              </div>
                              {order.paymentDetails && (
                                  <div>
                                      <p className="text-xs font-semibold">Transaction Note:</p>
                                      <p className="text-xs text-muted-foreground font-mono">{order.paymentDetails}</p>
                                  </div>
                              )}
                          </div>
                          <div className="space-y-4">
                              <h4 className="font-semibold">Pickup Details</h4>
                              <div className="p-3 rounded-md border bg-background">
                                  {order.assignedToUid ? (
                                      <PartnerPickupDetails userId={order.assignedToUid} />
                                  ) : (
                                      <CompanyPickupDetails />
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              </TableCell>
          </TableRow>
        </CollapsibleContent>
      </TableBody>
    </Collapsible>
  )
}

function InvoicePage() {
    const router = useRouter();
    const firestore = useFirestore();
    const { toast } = useToast();
    const { data: orders, loading: ordersLoading } = useCollection<Order>(query(collection(firestore, 'orders'), orderBy('date', 'desc')));
    const { data: workOrders, loading: workOrdersLoading } = useCollection<WorkOrder>(collection(firestore, 'workOrders'));
    const { data: allSalesInvoices, loading: invoicesLoading } = useCollection<SalesInvoice>(query(collection(firestore, 'salesInvoices'), orderBy('date', 'desc')));
    const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
    const { data: pickupPoints } = useCollection<PickupPoint>(collection(firestore, 'pickupPoints'));
    const { data: allProducts, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));

    const getDynamicOrderStatus = (order: Order): OrderStatus => {
        if (order.status !== 'Ordered') {
            return order.status;
        }

        const relatedWorkOrder = workOrders?.find(wo => 
            order.items.some(item => wo.productId === item.productId) && 
            (wo.status === 'In Progress' || wo.status === 'Under QC')
        );

        if (relatedWorkOrder) {
            return 'Manufacturing';
        }

        return order.status;
    }
    
    const getOrderInHand = React.useCallback((productId: string) => {
        if (!orders) return 0;
        return orders
          .filter(order => order.status !== 'Delivered' && order.status !== 'Canceled')
          .flatMap(order => order.items)
          .filter(item => item.productId === productId)
          .reduce((sum, item) => sum + item.quantity, 0);
    }, [orders]);


    const kpis = React.useMemo(() => {
        if (!allSalesInvoices) return { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 };
        
        const totalBilled = allSalesInvoices.reduce((sum, invoice) => sum + invoice.grandTotal, 0);
        const totalPaid = allSalesInvoices.filter(inv => inv.status === 'Paid').reduce((sum, invoice) => sum + invoice.grandTotal, 0);
        const totalOutstanding = totalBilled - totalPaid;

        return { totalBilled, totalPaid, totalOutstanding };
    }, [allSalesInvoices]);

    const handleGenerateInvoice = (order: Order) => {
        const dataToPass = {
            ...order,
            customerId: order.userId,
            overallDiscount: (order.discount / order.subtotal) * 100 || 0,
        };
        localStorage.setItem('invoiceDataToCreate', JSON.stringify(dataToPass));
        router.push('/dashboard/finance-accounting/invoice/create');
    };
    
    const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
        const orderRef = doc(firestore, 'orders', orderId);
        try {
            await updateDoc(orderRef, { status: status });
            toast({
                title: 'Order Status Updated',
                description: `Order has been updated to "${status}".`,
            });
        } catch (error) {
            console.error("Error updating order status: ", error);
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: 'Could not update the order status.',
            });
        }
    };
    
    const handleInvoicePaymentStatus = async (invoiceId: string, status: 'Paid' | 'Unpaid') => {
      const invoiceRef = doc(firestore, 'salesInvoices', invoiceId);
      await updateDoc(invoiceRef, { status: status });
      toast({ title: "Status Updated", description: `Invoice marked as ${status}.`});
    }

    const loading = ordersLoading || workOrdersLoading || productsLoading || invoicesLoading;

  return (
    <>
      <PageHeader title="Invoices">
         <Button onClick={() => router.push('/dashboard/finance-accounting/invoice/create')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create New Invoice
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Billed Amount</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.totalBilled)}</div>
            <p className="text-xs text-muted-foreground">Sum of all order totals.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatIndianCurrency(kpis.totalPaid)}</div>
            <p className="text-xs text-muted-foreground">Total payments received.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatIndianCurrency(kpis.totalOutstanding)}</div>
            <p className="text-xs text-muted-foreground">Total balance to be collected.</p>
          </CardContent>
        </Card>
      </div>

       <Card>
        <CardHeader>
          <CardTitle>Sales Orders</CardTitle>
          <CardDescription>
            List of all sales orders. You can generate an invoice for orders that are ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"><span className="sr-only">Expand</span></TableHead>
                <TableHead>SO Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Exp. Delivery Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
              {loading ? (
                <TableBody><TableRow><TableCell colSpan={8} className="h-24 text-center">Loading orders...</TableCell></TableRow></TableBody>
              ) : orders && orders.length > 0 ? (
                orders.map((order) => {
                  const dynamicStatus = getDynamicOrderStatus(order);
                  return (
                    <OrderRow key={order.id} order={order} pickupPoints={pickupPoints} onGenerateInvoice={handleGenerateInvoice} onUpdateStatus={handleUpdateStatus} dynamicStatus={dynamicStatus} allProducts={allProducts} getOrderInHand={getOrderInHand} />
                  )
                })
              ) : (
                <TableBody><TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No sales orders found.
                  </TableCell>
                </TableRow></TableBody>
              )}
          </Table>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Generated Invoices</CardTitle>
          <CardDescription>
            List of all created sales invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesLoading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading invoices...</TableCell></TableRow>
              ) : allSalesInvoices && allSalesInvoices.length > 0 ? (
                allSalesInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell>{format(new Date(invoice.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <Badge className={cn('text-xs', getStatusBadgeVariant(invoice.status))} variant="outline">
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatIndianCurrency(invoice.grandTotal)}</TableCell>
                    <TableCell className="text-right">
                       <Button variant="outline" size="sm" onClick={() => handleInvoicePaymentStatus(invoice.id, invoice.status === 'Paid' ? 'Unpaid' : 'Paid')}>
                          Mark as {invoice.status === 'Paid' ? 'Unpaid' : 'Paid'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={6} className="h-24 text-center">No invoices created yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function InvoicePageWrapper() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <InvoicePage />;
}
