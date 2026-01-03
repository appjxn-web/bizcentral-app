
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
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';
import type { Order, OrderStatus, UserProfile, UserRole, WorkOrder, PickupPoint, SalesOrder, RefundRequest } from '@/lib/types';
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
import { OrderStatusTracker } from './_components/order-status';
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
import { useRole } from '../_components/role-provider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

function getStatusBadgeVariant(status: Order['status'] | 'Refund Pending' | 'Refund Complete') {
  const variants: Record<string, string> = {
    Delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'Refund Complete': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Shipped: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Ordered: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Refund Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    Manufacturing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    'Ready for Dispatch': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    'Awaiting Payment': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
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
    maximumFractionDigits: 2,
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


function PartnerPickupDetails({ pickupPointId }: { pickupPointId: string }) {
    const firestore = useFirestore();
    const pickupPointRef = pickupPointId ? doc(firestore, 'pickupPoints', pickupPointId) : null;
    const { data: pickupPoint, loading } = useDoc<PickupPoint>(pickupPointRef);

    if (loading) return <p className="text-sm text-muted-foreground">Loading details...</p>;
    if (!pickupPoint) return <p className="text-sm text-destructive">Could not load partner details.</p>;
    
    const addressString = pickupPoint.addressLine || '';
    let mapUrl = addressString ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressString)}` : '';
    if (pickupPoint.lat && pickupPoint.lng) {
        mapUrl = `https://www.google.com/maps/search/?api=1&query=${pickupPoint.lat},${pickupPoint.lng}`;
    }

    return (
        <>
            <p className="font-medium">{pickupPoint.name}</p>
            <p className="text-xs text-muted-foreground">Partner</p>
            {addressString && <p className="mt-2 text-sm">{addressString}</p>}
            <div className="flex gap-4 mt-2">
                {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm"><MapPin className="h-4 w-4" /> Get Directions</a>}
            </div>
        </>
    );
}

function CompanyPickupDetails({ point }: { point?: Order['pickupPoint'] }) {
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

function OrderCard({ order }: { order: Order }) {
    const { user } = useUser();
    const [isOpen, setIsOpen] = React.useState(false);
    const firestore = useFirestore();
    const { data: companyInfo } = useDoc(doc(firestore, 'company', 'info'));
    const [isCancelDialogOpen, setIsCancelDialogOpen] = React.useState(false);
    const { toast } = useToast();

    // Fetch corresponding refund request if the order is canceled
    const refundQuery = order.status === 'Canceled' && user
      ? query(collection(firestore, 'refundRequests'), where('customerId', '==', user.uid), where('orderId', '==', order.id))
      : null;
    const { data: refundRequests } = useCollection<RefundRequest>(refundQuery);
    const refundRequest = refundRequests?.[0];


    const canCancel = order.status === 'Ordered' || order.status === 'Manufacturing';
    
    let displayStatus: OrderStatus | 'Refund Pending' | 'Refund Complete' = order.status;
    let statusBadgeText = displayStatus;

    if (order.status === 'Canceled') {
        if (refundRequest?.status === 'Pending') {
            displayStatus = 'Refund Pending';
            statusBadgeText = 'Refund Pending';
        } else if (refundRequest?.status === 'Paid') {
            displayStatus = 'Refund Complete';
            statusBadgeText = 'Refund Complete';
        } else {
            statusBadgeText = 'Canceled';
        }
    }


    const handleConfirmCancellation = async (reason: string, details?: string) => {
        if (!user) return; 

        try {
            const orderRef = doc(firestore, 'orders', order.id);
            const updateData = {
                status: 'Cancellation Requested' as OrderStatus,
                cancellationReason: `${reason}${details ? `: ${details}` : ''}`,
            };
            
            await updateDoc(orderRef, updateData);

            toast({
                title: 'Cancellation Requested',
                description: `Your request to cancel order #${order.orderNumber || order.id} has been submitted for approval.`,
            });
            setIsCancelDialogOpen(false);
        } catch (error) {
            console.error("Error requesting order cancellation:", error);
            toast({
                variant: 'destructive',
                title: 'Cancellation Failed',
                description: 'There was an error while trying to submit your cancellation request.',
            });
        }
    };
    
    return (
      <>
        <Collapsible asChild key={order.id} open={isOpen} onOpenChange={setIsOpen}>
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between gap-2">
                        <div>
                            <CardTitle>Order ID: {order.orderNumber || order.id}</CardTitle>
                            <CardDescription>
                                Placed on {format(new Date(order.date), 'PPP')}
                            </CardDescription>
                        </div>
                        <Badge
                            className={cn('text-sm w-fit h-fit', getStatusBadgeVariant(displayStatus))}
                            variant="outline"
                        >
                            {statusBadgeText}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <OrderStatusTracker currentStatus={order.status} />
                    <CollapsibleTrigger asChild>
                         <Button variant="outline" size="sm" className="w-full">
                            {isOpen ? 'Hide' : 'Show'} Order Details <ChevronDown className={cn("h-4 w-4 ml-2 transition-transform", isOpen && "rotate-180")} />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-6">
                      <div className="space-y-2">
                        {order.items.map(item => (
                            <div key={item.productId} className="flex items-center justify-between py-2 border-b">
                                <div className="flex items-center gap-4">
                                    <Image src={`https://picsum.photos/seed/${item.productId}/64/64`} alt={item.name} width={64} height={64} className="rounded-md object-cover" />
                                    <div>
                                        <p className="font-medium">{item.name}</p>
                                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                                    </div>
                                </div>
                                <p className="font-medium">{formatIndianCurrency(item.price * item.quantity)}</p>
                            </div>
                        ))}
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
                                {displayStatus !== 'Refund Complete' && (
                                <div className="flex justify-between font-bold text-red-600"><span>Balance Due:</span> <span className="font-mono">{formatIndianCurrency(order.balance || 0)}</span></div>
                                )}
                            </div>
                            {order.paymentDetails && !refundRequest && (
                                <div>
                                    <p className="text-xs font-semibold">Transaction Note:</p>
                                    <p className="text-xs text-muted-foreground font-mono">{order.paymentDetails}</p>
                                </div>
                            )}
                             {refundRequest && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-800">
                                    <p className="text-xs font-semibold">Refund Details:</p>
                                    {refundRequest.status === 'Paid' && refundRequest.transactionDate ? (
                                        <div className="text-xs text-muted-foreground font-mono">
                                            <p>Amount: {formatIndianCurrency(refundRequest.refundAmount)}</p>
                                            <p>Ref: {refundRequest.transactionRef}</p>
                                            <p>Date: {format(new Date(refundRequest.transactionDate), 'PPP')}</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Your refund of {formatIndianCurrency(refundRequest.refundAmount)} is being processed.</p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <h4 className="font-semibold">Pickup Details</h4>
                             <div className="p-3 rounded-md border bg-background">
                                {order.pickupPointId !== 'company-main' && order.pickupPointId ? (
                                    <PartnerPickupDetails pickupPointId={order.pickupPointId} />
                                ) : (
                                    <CompanyPickupDetails />
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {order.balance && order.balance > 0 && (
                                    <PayBalanceDialog order={order} companyInfo={companyInfo} />
                                )}
                                {canCancel && (
                                    <Button variant="destructive" size="sm" onClick={() => setIsCancelDialogOpen(true)}>
                                        <XCircle className="mr-2 h-4 w-4" />
                                        Request Cancellation
                                    </Button>
                                )}
                            </div>
                        </div>
                      </div>

                    </CollapsibleContent>
                </CardContent>
            </Card>
        </Collapsible>
        <CancelOrderDialog
          order={order}
          open={isCancelDialogOpen}
          onOpenChange={setIsCancelDialogOpen}
          onConfirm={handleConfirmCancellation}
        />
      </>
    )
}

function MyOrdersPageContent() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { currentRole } = useRole();

    const ordersQuery = React.useMemo(() => {
        if (!user || !currentRole) return null;
        
        const isPartner = ['Partner', 'Franchisee', 'Sales Agent', 'Dealer'].includes(currentRole);

        // This query now handles both customers (userId) and partners (assignedToUid)
        return query(
            collection(firestore, 'orders'),
            or(
              where('userId', '==', user.uid),
              where('assignedToUid', '==', user.uid)
            ),
            orderBy('date', 'desc')
        );
    }, [user, currentRole, firestore]);

    const { data: orders } = useCollection<Order>(ordersQuery);

    const kpis = React.useMemo(() => {
        if (!orders) return { total: 0, inProcess: 0, shipped: 0, delivered: 0 };
        const total = orders.length;
        const inProcess = orders.filter(o => ['Ordered', 'Manufacturing', 'Ready for Dispatch', 'Awaiting Payment', 'Cancellation Requested'].includes(o.status)).length;
        const shipped = orders.filter(o => o.status === 'Shipped').length;
        const delivered = orders.filter(o => o.status === 'Delivered').length;
        return { total, inProcess, shipped, delivered };
    }, [orders]);

  return (
    <>
      <PageHeader title="My Orders" />
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All your orders with us</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Dispatch</CardTitle>
            <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inProcess}</div>
            <p className="text-xs text-muted-foreground">Orders being processed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shipped</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.shipped}</div>
            <p className="text-xs text-muted-foreground">Orders on their way</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.delivered}</div>
            <p className="text-xs text-muted-foreground">Successfully delivered orders</p>
          </CardContent>
        </Card>
      </div>
      
       <div className="space-y-4">
        {orders && orders.length > 0 ? (
            orders.map((order) => (
                <OrderCard key={order.id} order={order} />
            ))
        ) : (
            <Card>
                <CardContent className="p-12 text-center">
                    <h3 className="text-xl font-medium">No orders yet</h3>
                    <p className="text-muted-foreground">You haven't placed any orders yet. Start shopping to see your orders here.</p>
                </CardContent>
            </Card>
        )}
      </div>
    </>
  );
}


export default function MyOrdersPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <MyOrdersPageContent />;
}

  