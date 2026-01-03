
'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Trash2, ShoppingCart, Tag, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Product, Offer, UserRole } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, where, getDoc, doc } from 'firebase/firestore';

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

export default function CartPage() {
  const [cartItems, setCartItems] = React.useState<CartItem[]>([]);
  const [appliedCoupons, setAppliedCoupons] = React.useState<Offer[]>([]);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [userRole, setUserRole] = React.useState<UserRole | null>(null);

  const [lastAppliedCoupon, setLastAppliedCoupon] = React.useState<Offer | null>(null);
  const [lastRemovedCoupon, setLastRemovedCoupon] = React.useState<Offer | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (user && firestore) {
      const fetchUserRole = async () => {
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role as UserRole);
        } else {
          setUserRole('Customer');
        }
      };
      fetchUserRole();
    } else if (!user) {
      setUserRole('Customer');
    }
  }, [user, firestore]);

  const allCouponsQuery = firestore
    ? query(collection(firestore, 'offers'), where('status', '==', 'Active'))
    : null;
  const { data: allCoupons, loading: couponsLoading } = useCollection<Offer>(allCouponsQuery);

  const coupons = React.useMemo(() => {
    if (!allCoupons || !userRole) return [];
    
    const couponFromUrl = searchParams.get('coupon_code');

    return allCoupons.filter(offer => {
      // An offer is visible if:
      // 1. It is targeted to the user's role.
      // 2. It has no target roles, making it a private/shareable offer.
      // 3. It matches a coupon code from the URL.
      const isTargeted = offer.targetRoles?.includes(userRole);
      const isPrivateShareable = !offer.targetRoles || offer.targetRoles.length === 0;
      const matchesUrl = couponFromUrl && offer.code === couponFromUrl;
      
      return (isTargeted || isPrivateShareable) || matchesUrl;
    });
  }, [allCoupons, userRole, searchParams]);


  const subtotal = React.useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }, [cartItems]);

  const handleApplyCoupon = (coupon: Offer) => {
    if (coupon.targetType === 'purchase' && coupon.targetValue && subtotal < coupon.targetValue) {
        toast({
            variant: 'destructive',
            title: 'Cannot Apply Coupon',
            description: `This coupon is only valid for orders over ${formatIndianCurrency(coupon.targetValue)}.`,
        });
        return;
    }
    
    const isApplied = appliedCoupons.some(c => c.code === coupon.code);
    if (isApplied) {
      setAppliedCoupons(prev => prev.filter(c => c.code !== coupon.code));
      setLastRemovedCoupon(coupon);
    } else {
      if (appliedCoupons.length >= 2) {
        toast({
            variant: 'destructive',
            title: 'Coupon Limit Reached',
            description: 'You can only apply a maximum of 2 coupons.'
        });
        return;
      }
      setAppliedCoupons(prev => [...prev, coupon]);
      setLastAppliedCoupon(coupon);
    }
  };

  React.useEffect(() => {
    const items = JSON.parse(localStorage.getItem('cart') || '[]');
    const storedCoupons = JSON.parse(localStorage.getItem('appliedCoupons') || '[]');
    setCartItems(items);

    if (allCoupons) {
      const validStoredCoupons = storedCoupons.filter((sc: Offer) => {
        const couponDetails = allCoupons.find(
          (c) => c.id === sc.id && c.status === 'Active'
        );
        if (!couponDetails) return false;
        if (
          couponDetails.targetType === 'purchase' &&
          couponDetails.targetValue &&
          subtotal < couponDetails.targetValue
        ) {
          return false;
        }
        return true;
      });
      setAppliedCoupons(validStoredCoupons);
    }

    const couponCodeFromUrl = searchParams.get('coupon_code');
    if (couponCodeFromUrl && allCoupons) {
        const couponFromUrl = allCoupons.find(c => c.code === couponCodeFromUrl && c.status === 'Active');
        if (couponFromUrl && !appliedCoupons.some(c => c.id === couponFromUrl.id)) {
            handleApplyCoupon(couponFromUrl);
        }
        // Clean the URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCoupons, subtotal]);


  React.useEffect(() => {
    localStorage.setItem('appliedCoupons', JSON.stringify(appliedCoupons));
  }, [appliedCoupons]);

  React.useEffect(() => {
    if (lastAppliedCoupon) {
      toast({
        title: 'Coupon Applied',
        description: `Successfully applied coupon "${lastAppliedCoupon.code}".`,
      });
      setLastAppliedCoupon(null);
    }
  }, [lastAppliedCoupon, toast]);

  React.useEffect(() => {
    if (lastRemovedCoupon) {
      toast({
        variant: 'destructive',
        title: 'Coupon Removed',
        description: `Coupon "${lastRemovedCoupon.code}" has been removed.`,
      });
      setLastRemovedCoupon(null);
    }
  }, [lastRemovedCoupon, toast]);

  const discount = React.useMemo(() => {
    if (appliedCoupons.length === 0) return 0;

    let totalDiscount = 0;
    let percentageDiscountValue = 0;

    appliedCoupons.forEach(coupon => {
        if (coupon.valueType === 'percent') {
            percentageDiscountValue += coupon.value;
        }
    });

    if (percentageDiscountValue > 0) {
        totalDiscount += subtotal * (percentageDiscountValue / 100);
    }
    
    appliedCoupons.forEach(coupon => {
         if (coupon.valueType === 'amount') {
            totalDiscount += coupon.value;
        }
    });

    return Math.min(totalDiscount, subtotal);
  }, [appliedCoupons, subtotal]);

  const totalAfterDiscount = subtotal - discount;
  const gstRate = 0.18;
  const isInterstate = false; // Forcing intrastate calculation for customer cart
  const cgst = isInterstate ? 0 : totalAfterDiscount * (gstRate / 2);
  const sgst = isInterstate ? 0 : totalAfterDiscount * (gstRate / 2);
  const grandTotal = totalAfterDiscount + cgst + sgst;

  const handleUpdateCart = (newCart: CartItem[]) => {
    setCartItems(newCart);
    localStorage.setItem('cart', JSON.stringify(newCart));
    window.dispatchEvent(new CustomEvent('cartUpdated'));
  };

  const handleRemove = (productId: string) => {
    const newCart = cartItems.filter(item => item.id !== productId);
    handleUpdateCart(newCart);
    toast({
      title: 'Item Removed',
      description: 'The item has been removed from your cart.',
    });
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    if (quantity < 1) {
      handleRemove(productId);
      return;
    }
    const newCart = cartItems.map(item =>
      item.id === productId ? { ...item, quantity } : item
    );
    handleUpdateCart(newCart);
  };
  

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Your Shopping Cart</h1>
      {cartItems.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Product</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="w-24 text-center">Unit</TableHead>
                  <TableHead className="w-24 text-center">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"><span className="sr-only">Remove</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cartItems.map((item) => {
                  const isAvailable = item.openingStock > (item.minStockLevel || 0);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          width={64}
                          height={64}
                          className="rounded-md object-cover"
                          data-ai-hint={item.imageHint}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.sku}</p>
                      </TableCell>
                       <TableCell>
                        {isAvailable ? (
                           <Badge variant="outline" className="bg-green-100 text-green-800">In Stock</Badge>
                        ) : (
                           <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Waiting</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatIndianCurrency(item.price)}</TableCell>
                      <TableCell className="text-center">pcs</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value, 10))}
                          className="w-20 text-center"
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatIndianCurrency(item.price * item.quantity)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleRemove(item.id)}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove item</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          <Separator />
          <CardContent className="p-6">
             <div className="flex flex-col-reverse md:flex-row gap-8">
                <div className="flex-1 space-y-4">
                    <Label>Available Coupons (select up to 2)</Label>
                    <div className="space-y-2">
                      {couponsLoading ? (
                        <div className="flex items-center justify-center h-24">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : coupons && coupons.length > 0 ? (
                        coupons.map(coupon => {
                            const isEligible = !(coupon.targetType === 'purchase' && coupon.targetValue && subtotal < coupon.targetValue);
                            const requirementText = coupon.targetType === 'purchase' && coupon.targetValue 
                                ? `(on orders over ${formatIndianCurrency(coupon.targetValue)})`
                                : '';
                            
                            return (
                                <Label key={coupon.id} htmlFor={coupon.id} className={`flex items-start gap-3 p-3 border rounded-md has-[:checked]:bg-muted ${isEligible ? 'cursor-pointer hover:bg-muted/50' : 'cursor-not-allowed bg-gray-50 text-gray-400'}`}>
                                    <Checkbox
                                    id={coupon.id}
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
                </div>
                <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-mono">{formatIndianCurrency(subtotal)}</span>
                    </div>
                    {appliedCoupons.length > 0 && (
                        <div className="flex justify-between text-green-600">
                             <span className="text-muted-foreground">Discount ({appliedCoupons.map(c => c.code).join(', ')})</span>
                            <span className="font-mono">- {formatIndianCurrency(discount)}</span>
                        </div>
                    )}
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">CGST (9%)</span>
                        <span className="font-mono">{formatIndianCurrency(cgst)}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">SGST (9%)</span>
                        <span className="font-mono">{formatIndianCurrency(sgst)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold text-lg">
                        <span>Grand Total</span>
                        <span className="font-mono">{formatIndianCurrency(grandTotal)}</span>
                    </div>
                </div>
             </div>
          </CardContent>
          <CardFooter className="flex justify-between pt-6">
             <Button size="lg" variant="outline" asChild>
                <Link href="/">Continue Shopping</Link>
            </Button>
             <Button size="lg" asChild>
                <Link href="/checkout">Proceed to Checkout</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card>
            <CardContent className="p-12 flex flex-col items-center justify-center text-center">
                <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
                <CardTitle className="text-2xl font-semibold mb-2">Your cart is empty</CardTitle>
                <CardDescription>
                Looks like you haven't added anything to your cart yet.
                </CardDescription>
                <Button asChild className="mt-6">
                    <Link href="/">Start Shopping</Link>
                </Button>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
