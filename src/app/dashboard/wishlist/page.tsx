
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { useFirestore, useUser, useDoc, useCollection } from '@/firebase';
import { collection, doc, arrayRemove, updateDoc } from 'firebase/firestore';
import type { Product, UserProfile } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Trash2, Heart } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function WishlistPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const userProfileRef = user ? doc(firestore, 'users', user.uid) : null;
  const { data: userProfile } = useDoc<UserProfile>(userProfileRef);
  const { data: allProducts, loading } = useCollection<Product>(collection(firestore, 'products'));
  const { toast } = useToast();

  const wishlistProducts = React.useMemo(() => {
    if (!userProfile?.wishlist || !allProducts) return [];
    return allProducts.filter(p => userProfile.wishlist.includes(p.id));
  }, [userProfile, allProducts]);

  const handleRemoveFromWishlist = async (productId: string) => {
    if (!userProfileRef) return;
    try {
      await updateDoc(userProfileRef, { wishlist: arrayRemove(productId) });
      toast({ title: 'Removed from Wishlist' });
    } catch (error) {
      console.error("Error removing from wishlist:", error);
      toast({ variant: 'destructive', title: 'Could not remove from wishlist.' });
    }
  };
  
    const addToCart = (product: Product) => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const existingItem = cart.find((item: Product & {quantity: number}) => item.id === product.id);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({...product, quantity: 1});
    }
    localStorage.setItem('cart', JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent('cartUpdated'));
    toast({
      title: 'Added to Cart',
      description: `${product.name} has been added to your cart.`,
    });
  };

  return (
    <>
      <PageHeader title="My Wishlist" />
      {wishlistProducts.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {wishlistProducts.map(product => (
            <Card key={product.id}>
              <CardHeader className="p-0">
                <Link href={`/dashboard/products-services/catalogue/${product.sku}`}>
                  <div className="relative w-full h-48">
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      className="object-cover rounded-t-lg"
                      data-ai-hint={product.imageHint}
                    />
                  </div>
                </Link>
              </CardHeader>
              <CardContent className="p-4">
                <Link href={`/dashboard/products-services/catalogue/${product.sku}`}>
                  <CardTitle className="text-lg font-semibold mb-2 hover:text-primary">{product.name}</CardTitle>
                </Link>
                <CardDescription className="text-sm text-muted-foreground line-clamp-2">
                  {product.description}
                </CardDescription>
              </CardContent>
              <CardFooter className="p-4 flex justify-between items-center">
                 <p className="text-lg font-bold">₹{product.price.toFixed(2)}</p>
                 <div className="flex gap-2">
                    <Button size="icon" variant="destructive" onClick={() => handleRemoveFromWishlist(product.id)}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove</span>
                    </Button>
                    <Button size="icon" onClick={() => addToCart(product)}>
                        <ShoppingCart className="h-4 w-4" />
                        <span className="sr-only">Add to Cart</span>
                    </Button>
                 </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 flex flex-col items-center justify-center text-center">
            <Heart className="h-16 w-16 text-muted-foreground mb-4" />
            <CardTitle className="text-2xl font-semibold mb-2">Your wishlist is empty</CardTitle>
            <CardDescription>
              Add products you love to your wishlist to keep track of them.
            </CardDescription>
            <Button asChild className="mt-6">
              <Link href="/">Start Shopping</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
