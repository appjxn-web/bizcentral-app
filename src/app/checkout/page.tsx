

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Info, Loader2, Building, User, CalendarClock } from 'lucide-react';
import type { Product, Offer, UserRole, Party, CompanyInfo, Address, Order, OrderItem, CoaLedger, PickupPoint, UserProfile, SalesOrder } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, query, where, getDoc, getDocs, doc, addDoc, serverTimestamp, writeBatch, setDoc, orderBy, limit, getCountFromServer } from 'firebase/firestore';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { format, startOfMonth } from 'date-fns';
import { estimateDispatchDate, type EstimateDispatchDateOutput } from '@/ai/flows/estimate-dispatch-date-flow';

interface CartItem extends Product {
  quantity: number;
}

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

function PartnerPickupDetails({ pickupPoint }: { pickupPoint: PickupPoint }) {
    if (!pickupPoint) return <p className="text-sm text-destructive">Could not load partner details.</p>;
    const addressString = pickupPoint.addressLine || 'Address not available';
    return (
        <>
            <p className="font-semibold">{pickupPoint.name}</p>
            <p className="mt-2 text-sm">{addressString}</p>
        </>
    );
}

function CompanyPickupDetails() {
    const { data: companyInfo, loading } = useDoc<any>(doc(useFirestore(), 'company', 'info'));
    if (loading) return <p className="text-sm text-muted-foreground">Loading details...</p>;
    if (!companyInfo) return <p className="text-sm text-destructive">Could not load company details.</p>;
    const factoryAddress = companyInfo.addresses?.find((a: Address) => a.type === 'Factory') || companyInfo.addresses?.[0];
    if (!factoryAddress) return <p className="text-sm text-destructive">Factory address not found.</p>;
    const addressString = [factoryAddress.line1, factoryAddress.line2, factoryAddress.city, factoryAddress.state, factoryAddress.pin].filter(Boolean).join(', ');
    return (
        <>
            <p className="font-semibold">Company Warehouse</p>
            <p className="mt-2 text-sm">{addressString}</p>
        </>
    );
}

export default function CheckoutPage() {
  const [cartItems, setCartItems] = React.useState<CartItem[]>([]);
  const [appliedCoupons, setAppliedCoupons] = React.useState<Offer[]>([]);
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const userProfileRef = user ? doc(firestore, 'users', user.uid) : null;
  const { data: userProfile } = useDoc<UserProfile>(userProfileRef);

  const searchParams = useSearchParams();

  const [lastAppliedCoupon, setLastAppliedCoupon] = React.useState<Offer | null>(null);
  const [lastRemovedCoupon, setLastRemovedCoupon] = React.useState<Offer | null>(null);
  const [upiTransactionId, setUpiTransactionId] = React.useState('');
  const [isPlacingOrder, setIsPlacingOrder] = React.useState(false);
  const [selectedPickupPointId, setSelectedPickupPointId] = React.useState<string | null>(null);
  
  const [dispatchEstimate, setDispatchEstimate] = React.useState<EstimateDispatchDateOutput | null>(null);
  const [isEstimating, setIsEstimating] = React.useState(false);


  const companyInfoRef = firestore ? doc(firestore, 'company', 'info') : null;
  const { data: companyInfo } = useDoc<CompanyInfo>(companyInfoRef);

  const { data: pickupPoints, loading: pickupPointsLoading } = useCollection<PickupPoint>(
    firestore ? query(collection(firestore, 'pickupPoints'), where('active', '==', true)) : null
  );

  const isInterstate = false; // Forcing intrastate calculation for all online checkouts
  

  const allCouponsQuery = firestore ? query(collection(firestore, 'offers'), where('status', '==', 'Active')) : null;
  const { data: allCoupons } = useCollection<Offer>(allCouponsQuery);
  
  const coupons = React.useMemo(() => {
    if (!allCoupons || !userProfile?.role) return [];
    const couponFromUrl = searchParams.get('coupon_code');
    return allCoupons.filter(offer => {
      if (offer.type !== 'Coupon' && offer.type !== 'Discount') return false;
      const isTargeted = offer.targetRoles?.includes(userProfile?.role);
      const isPrivateShareable = !offer.targetRoles || offer.targetRoles.length === 0;
      const matchesUrl = couponFromUrl && offer.code === couponFromUrl;
      return (isTargeted || isPrivateShareable) || matchesUrl;
    });
  }, [allCoupons, userProfile?.role, searchParams]);

  const subtotal = React.useMemo(() => cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0), [cartItems]);
  
    React.useEffect(() => {
    const fetchEstimate = async () => {
        if (cartItems.length > 0) {
            setIsEstimating(true);
            try {
                const estimateInput = {
                    items: cartItems.map(item => ({
                        productId: item.id,
                        quantity: item.quantity,
                        category: item.category,
                    }))
                };
                const result = await estimateDispatchDate(estimateInput);
                setDispatchEstimate(result);
            } catch (error) {
                console.error("Error fetching dispatch estimate:", error);
                setDispatchEstimate(null); // Clear previous estimate on error
            } finally {
                setIsEstimating(false);
            }
        } else {
            setDispatchEstimate(null);
        }
    };

    if (cartItems.length > 0) {
      fetchEstimate();
    }
  }, [cartItems]);

  const handleApplyCoupon = (coupon: Offer) => {
    if (coupon.targetType === 'purchase' && coupon.targetValue && subtotal < coupon.targetValue) {
        toast({ variant: 'destructive', title: 'Cannot Apply Coupon', description: `This coupon is only valid for orders over ${formatIndianCurrency(coupon.targetValue)}.` });
        return;
    }
    const isApplied = appliedCoupons.some(c => c.code === coupon.code);
    if (isApplied) {
      setAppliedCoupons(prev => prev.filter(c => c.code !== coupon.code));
      setLastRemovedCoupon(coupon);
    } else {
      if (appliedCoupons.length >= 2) {
        toast({ variant: 'destructive', title: 'Coupon Limit Reached', description: 'You can only apply a maximum of 2 coupons.' });
        return;
      }
      setAppliedCoupons(prev => [...prev, coupon]);
      setLastAppliedCoupon(coupon);
    }
  };

  React.useEffect(() => {
    const items = JSON.parse(localStorage.getItem('cart') || '[]');
    const storedCoupons = JSON.parse(localStorage.getItem('appliedCoupons') || '[]');
    if (items.length === 0) {
      router.push('/cart');
      return;
    }
    setCartItems(items);
    if (allCoupons) {
        const validStoredCoupons = storedCoupons.filter((sc: Offer) => {
            const couponDetails = allCoupons.find(c => c.id === sc.id && c.status === 'Active');
            if (!couponDetails) return false;
            if (couponDetails.targetType === 'purchase' && couponDetails.targetValue && subtotal < couponDetails.targetValue) return false;
            return true;
        });
        setAppliedCoupons(validStoredCoupons);
    }
  }, [router, allCoupons, subtotal]);
  
  React.useEffect(() => {
    localStorage.setItem('appliedCoupons', JSON.stringify(appliedCoupons));
  }, [appliedCoupons]);

  React.useEffect(() => {
    if (lastAppliedCoupon) { toast({ title: 'Coupon Applied', description: `Successfully applied coupon "${lastAppliedCoupon.code}".` }); setLastAppliedCoupon(null); }
  }, [lastAppliedCoupon, toast]);

  React.useEffect(() => {
    if (lastRemovedCoupon) { toast({ variant: 'destructive', title: 'Coupon Removed', description: `Coupon "${lastRemovedCoupon.code}" has been removed.` }); setLastRemovedCoupon(null); }
  }, [lastRemovedCoupon, toast]);
  
   const { discount, grandTotal, cgst, sgst, igst } = React.useMemo(() => {
    let totalDiscount = 0;
    if (appliedCoupons.length > 0) {
        let percentageDiscountValue = 0;
        appliedCoupons.forEach(coupon => { if (coupon.valueType === 'percent') percentageDiscountValue += coupon.value; });
        if (percentageDiscountValue > 0) totalDiscount += subtotal * (percentageDiscountValue / 100);
        appliedCoupons.forEach(coupon => { if (coupon.valueType === 'amount') totalDiscount += coupon.value; });
    }
    const finalDiscount = Math.min(totalDiscount, subtotal);
    const totalAfterDiscount = subtotal - finalDiscount;
    const gstRate = 0.18;
    const totalGst = totalAfterDiscount * gstRate;
    const cgstValue = isInterstate ? 0 : totalGst / 2;
    const sgstValue = isInterstate ? 0 : totalGst / 2;
    const igstValue = isInterstate ? totalGst : 0;
    const grandTotalValue = totalAfterDiscount + totalGst;
    return { discount: finalDiscount, grandTotal: grandTotalValue, cgst: cgstValue, sgst: sgstValue, igst: igstValue };
  }, [cartItems, appliedCoupons, subtotal, isInterstate]);
  
  const advanceAmount = grandTotal * 0.25;

  const handlePlaceOrder = async () => {
    if (!user?.uid || !firestore || !userProfile) {
      toast({ variant: 'destructive', title: 'Authentication Error', description: 'User not found. Please log in again.' });
      return;
    }
    if (!upiTransactionId) {
      toast({ variant: 'destructive', title: 'Transaction ID Required', description: 'Please enter the UPI Transaction ID after making the payment.' });
      return;
    }
    if (!selectedPickupPointId) {
        toast({ variant: 'destructive', title: 'Pickup Point Required', description: 'Please select a pickup location.' });
        return;
    }
    
    setIsPlacingOrder(true);

    const selectedPickup = pickupPoints?.find(p => p.id === selectedPickupPointId);
    
    const orderItems: OrderItem[] = cartItems.map(item => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
    }));
    
    const batch = writeBatch(firestore);
    const orderRef = doc(collection(firestore, 'orders'));

    const newOrder: Omit<Order, 'id'|'orderNumber'> & {id: string} = {
        id: orderRef.id,
        userId: user.uid,
        customerName: userProfile.name || user.displayName || 'Guest',
        customerEmail: user.email || 'N/A',
        date: new Date().toISOString(),
        status: 'Ordered',
        items: orderItems,
        subtotal,
        discount,
        cgst,
        sgst,
        igst: igst, // Ensure igst is saved even if 0
        grandTotal,
        total: grandTotal,
        paymentReceived: advanceAmount,
        balance: grandTotal - advanceAmount,
        commission: 0,
        pickupPointId: selectedPickupPointId,
        assignedToUid: selectedPickup?.ownerUid || null,
        paymentDetails: `UPI Transaction ID: ${upiTransactionId}`,
        createdAt: serverTimestamp() as any,
    };
    batch.set(orderRef, newOrder);

    // --- Referral Logic ---
    if (userProfile?.referredBy) {
      const ordersQuery = query(collection(firestore, 'orders'), where('userId', '==', user.uid), limit(1));
      const orderCountSnapshot = await getCountFromServer(ordersQuery);
      
      // If count is 0, this is their first order (since the current one hasn't been committed yet)
      if (orderCountSnapshot.data().count === 0) {
        const referralsQuery = query(
          collection(firestore, 'users', userProfile.referredBy, 'referrals'),
          where('mobile', '==', userProfile.mobile),
          where('status', '==', 'Signed Up')
        );
        const referralsSnapshot = await getDocs(referralsQuery);
        if (!referralsSnapshot.empty) {
          const referralDoc = referralsSnapshot.docs[0];
          const commissionPercentage = referralDoc.data().commission || 0;
          const commission = grandTotal * (commissionPercentage / 100);
          batch.update(referralDoc.ref, { status: 'First Purchased', commission });
        }
      }
    }

    batch.commit().then(() => {
        toast({ title: 'Order Placed!', description: `Your order has been successfully booked.` });
        localStorage.removeItem('cart');
        localStorage.removeItem('appliedCoupons');
        window.dispatchEvent(new CustomEvent('cartUpdated'));
        router.push('/checkout/success');
    }).catch(async (serverError: any) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `/orders/${orderRef.id}`,
            operation: 'create',
            requestResourceData: newOrder,
        }));
        console.error(serverError);
        toast({ variant: 'destructive', title: 'Order Failed', description: 'Could not place your order. Please check your permissions and try again.' });
    }).finally(() => {
        setIsPlacingOrder(false);
    });
  };
  
  return (
    <div className="max-w-6xl mx-auto">
       <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href="/cart">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Cart
          </Link>
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-8">
           <Card>
            <CardHeader>
              <CardTitle>Apply Coupons</CardTitle>
              <CardDescription>Select up to 2 available coupons.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                      {coupons && coupons.length > 0 ? (
                        coupons.map(coupon => {
                           const isEligible = !(coupon.targetType === 'purchase' && coupon.targetValue && subtotal < coupon.targetValue);
                            const requirementText = coupon.targetType === 'purchase' && coupon.targetValue 
                                ? `(on orders over ${formatIndianCurrency(coupon.targetValue)})`
                                : '';

                            return (
                                <Label key={coupon.id} htmlFor={`checkout-coupon-${coupon.id}`} className={`flex items-start gap-3 p-3 border rounded-md has-[:checked]:bg-muted ${isEligible ? 'cursor-pointer hover:bg-muted/50' : 'cursor-not-allowed bg-gray-50 text-gray-400'}`}>
                                <Checkbox
                                    id={`checkout-coupon-${coupon.id}`}
                                    checked={appliedCoupons.some(c => c.code === coupon.code)}
                                    onCheckedChange={() => handleApplyCoupon(coupon)}
                                    disabled={!isEligible}
                                />
                                <div>
                                    <span className="font-semibold">{coupon.code}</span>
                                    <p className="text-sm">{coupon.description} <span className="text-xs">{requirementText}</span></p>
                                </div>
                                </Label>
                            )
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground">No coupons available at the moment.</p>
                      )}
                    </div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
              <CardTitle>Pickup Location</CardTitle>
              <CardDescription>Choose where you'll pick up your order.</CardDescription>
            </CardHeader>
            <CardContent>
                <RadioGroup value={selectedPickupPointId || ''} onValueChange={setSelectedPickupPointId} className="space-y-2">
                    <Label htmlFor="company-main" className="flex items-start gap-3 p-3 border rounded-md has-[:checked]:bg-muted cursor-pointer hover:bg-muted/50">
                        <RadioGroupItem value="company-main" id="company-main" />
                        <div className="grid gap-1.5">
                            <span className="font-semibold flex items-center gap-2"><Building className="h-4 w-4" /> Company Warehouse</span>
                            <CompanyPickupDetails />
                        </div>
                    </Label>
                    {(pickupPointsLoading) ? (
                        <div className="flex items-center justify-center h-24">
                           <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : pickupPoints?.map(point => (
                         <Label key={point.id} htmlFor={point.id} className="flex items-start gap-3 p-3 border rounded-md has-[:checked]:bg-muted cursor-pointer hover:bg-muted/50">
                            <RadioGroupItem value={point.id} id={point.id} />
                            <div className="grid gap-1.5">
                               <span className="font-semibold flex items-center gap-2"><User className="h-4 w-4" /> Partner Location </span> 
                               <PartnerPickupDetails pickupPoint={point} />
                            </div>
                        </Label>
                    ))}
                </RadioGroup>
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cartItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.name} <span className="text-muted-foreground">x{item.quantity}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatIndianCurrency(item.price * item.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Separator className="my-4" />
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">{formatIndianCurrency(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span className="text-muted-foreground">Discount ({appliedCoupons.map(c => c.code).join(', ')})</span>
                    <span className="font-mono">- {formatIndianCurrency(discount)}</span>
                  </div>
                )}
                {isInterstate ? (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">IGST (18%)</span>
                        <span className="font-mono">{formatIndianCurrency(igst)}</span>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">CGST (9%)</span>
                            <span className="font-mono">{formatIndianCurrency(cgst)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">SGST (9%)</span>
                            <span className="font-mono">{formatIndianCurrency(sgst)}</span>
                        </div>
                    </>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Grand Total:</span>
                  <span className="font-mono">{formatIndianCurrency(grandTotal)}</span>
                </div>
                 <div className="flex justify-between font-bold text-primary">
                  <span>Advance Payment (25%):</span>
                  <span className="font-mono">{formatIndianCurrency(advanceAmount)}</span>
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
            </CardContent>
            {selectedPickupPointId ? (
                <CardFooter className="flex-col items-center gap-4 pt-6 border-t">
                    <div className="p-4 bg-white rounded-lg border">
                        <QRCodeSVG 
                            value={`upi://pay?pa=${companyInfo?.primaryUpiId || 'your-upi-id@okhdfcbank'}&pn=${encodeURIComponent(companyInfo?.companyName || 'Your Company Name')}&am=${advanceAmount.toFixed(2)}&cu=INR&tn=Order%20Advance`} 
                            size={160}
                        />
                    </div>
                    <p className="text-sm text-muted-foreground text-center">Scan the QR code to pay the advance amount using any UPI app.</p>
                    <Separator className="w-full" />
                    <div className="w-full space-y-2">
                        <Label htmlFor="upi-id">UPI Transaction ID</Label>
                        <Input 
                        id="upi-id"
                        placeholder="Enter the transaction ID from your UPI app" 
                        value={upiTransactionId}
                        onChange={e => setUpiTransactionId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">After payment, enter the transaction ID here to confirm your order.</p>
                    </div>
                        <Button size="lg" className="w-full" onClick={handlePlaceOrder} disabled={isPlacingOrder}>
                            {isPlacingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Confirm Payment &amp; Book Order
                        </Button>
                </CardFooter>
            ) : (
                <CardFooter className="pt-6 border-t">
                    <div className="text-center w-full text-muted-foreground">
                        <Info className="mx-auto h-6 w-6 mb-2" />
                        Please select a pickup location to proceed with payment.
                    </div>
                </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

