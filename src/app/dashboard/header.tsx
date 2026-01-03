

'use client';

import Link from 'next/link';
import { Briefcase, LogIn, LogOut, ShoppingCart, User, Bell, Heart, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import * as React from 'react';
import { useUser, useFirestore, useDoc, useCollection } from '@/firebase';
import { doc, getDoc, collection, query, where } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import type { UserRole, Offer } from '@/lib/types';
import { getAuth, signOut } from 'firebase/auth';
import { SidebarTrigger } from '@/components/ui/sidebar';


function getDashboardPathForRole(role: UserRole): string {
    switch (role) {
        case 'Admin':
        case 'CEO':
            return '/dashboard';
        case 'Customer':
            return '/dashboard/dashboards/customer';
        case 'Employee':
            return '/dashboard/dashboards/employee';
        case 'Partner':
            return '/dashboard/dashboards/partner';
        case 'Sales Manager':
            return '/dashboard/dashboards/sales-manager';
        case 'Production Manager':
            return '/dashboard/dashboards/production-manager';
        case 'Purchase Manager':
            return '/dashboard/dashboards/purchase-manager';
        case 'Service Manager':
            return '/dashboard/dashboards/service-manager';
        case 'Accounts Manager':
            return '/dashboard/dashboards/accounts-manager';
        case 'HR Manager':
            return '/dashboard/dashboards/hr-manager';
        case 'Gate Keeper':
            return '/dashboard/dashboards/gate-keeper';
        case 'Inventory Manager':
            return '/dashboard/dashboards/inventory-manager';
        default:
            return '/dashboard/my-account'; // A safe default
    }
}


export function Header({ showSidebarTrigger = true }: { showSidebarTrigger?: boolean }) {
  const [cartCount, setCartCount] = React.useState(0);
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [userRole, setUserRole] = React.useState<UserRole | null>(null);
  
  const companyInfoRef = firestore ? doc(firestore, 'company', 'info') : null;
  const { data: companyInfo, loading: companyInfoLoading } = useDoc<{ logo?: string, companyName?: string }>(companyInfoRef);

  const logo = companyInfo?.logo;
  const companyName = companyInfo?.companyName || 'jxnPlus';
  
    React.useEffect(() => {
    if (user && firestore) {
      const fetchUserRole = async () => {
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role as UserRole);
        } else {
          // Default to customer if no specific role is found
          setUserRole('Customer');
        }
      };
      fetchUserRole();
    } else if (!user) {
        // For guests, default role is Customer to see public offers
        setUserRole('Customer');
    }
  }, [user, firestore]);
  
  const offersQuery = React.useMemo(() => {
    if (!firestore || !userRole) return null;
    return query(
      collection(firestore, 'offers'),
      where('status', '==', 'Active'),
      where('targetRoles', 'array-contains', userRole)
    );
  }, [firestore, userRole]);
  
  const { data: activeOffers } = useCollection<Offer>(offersQuery);

  const updateCartCount = () => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    setCartCount(cart.length);
  };
  
  const handleLogout = async () => {
    await signOut(getAuth());
    router.push('/');
  };

  React.useEffect(() => {
    updateCartCount();
    window.addEventListener('cartUpdated', updateCartCount);
    return () => {
      window.removeEventListener('cartUpdated', updateCartCount);
    };
  }, []);
  
  const dashboardPath = userRole ? getDashboardPathForRole(userRole) : '/dashboard';

  return (
    <header className="sticky top-0 flex h-16 items-center gap-4 border-b px-4 md:px-6 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {showSidebarTrigger && <SidebarTrigger className="md:hidden"/>}
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          {companyInfoLoading ? (
            <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />
          ) : (logo && typeof logo === 'string' && logo.trim() !== '') ? (
            <Image src={logo} alt="Company Logo" width={100} height={28} className="object-contain h-8 w-auto md:h-10" priority />
          ) : (
             <Briefcase className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          )}
          <span className="hidden md:inline font-bold text-lg md:text-2xl text-primary">{companyName}</span>
        </Link>

        <div className="ml-auto flex items-center gap-2 md:gap-4">
           <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/notifications')}>
              <Bell className="h-5 w-5" />
              <span className="sr-only">Notifications</span>
            </Button>
           <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/wishlist')}>
              <Heart className="h-5 w-5" />
              <span className="sr-only">Wishlist</span>
            </Button>
             <Button variant="ghost" size="icon" className="relative" onClick={() => router.push('/dashboard/deals-offers')}>
              <Tag className="h-5 w-5" />
              {activeOffers && activeOffers.length > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
              )}
              <span className="sr-only">Deals & Offers</span>
            </Button>
          <Link href="/cart" passHref>
            <Button variant="outline" size="icon" className="relative h-8 w-8 md:h-10 md:w-10">
              <ShoppingCart className="h-4 w-4 md:h-5 md:w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
              <span className="sr-only">Shopping Cart</span>
            </Button>
          </Link>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="rounded-full h-8 w-8 md:h-10 md:w-10">
                   <Avatar className="h-8 w-8 md:h-10 md:w-10">
                      <AvatarImage src={user.photoURL ?? ''} alt={user.displayName || ''} />
                      <AvatarFallback>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="sr-only">User menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.displayName || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href={dashboardPath}>Dashboard</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard/profiles-settings">Settings</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/login" passHref>
              <Button size="sm">
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </Button>
            </Link>
          )}
        </div>
    </header>
  );
}
