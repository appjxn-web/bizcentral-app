
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { useRole } from '../_components/role-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Offer, UserProfile } from '@/lib/types';
import Image from 'next/image';
import { Tag } from 'lucide-react';


export default function DealsOffersPage() {
  const { user } = useUser();
  const { currentRole } = useRole();
  const firestore = useFirestore();

  // Fetch all active offers. We will filter them on the client-side.
  const allOffersQuery = firestore 
    ? query(
        collection(firestore, 'offers'), 
        where('status', '==', 'Active'),
      ) 
    : null;

  const { data: allOffers, loading } = useCollection<Offer>(allOffersQuery);
  
  const userOffers = React.useMemo(() => {
    if (!allOffers || !currentRole) return [];
    
    return allOffers.filter(offer => {
      // CORRECTED LOGIC: An offer is visible to the current user if one of the following is true:
      // 1. The offer's 'targetRoles' array includes the user's current role.
      // 2. The offer has no 'targetRoles' defined (or the array is empty), making it a public or shareable offer visible to everyone.
      // The "Share" button in "Create Deals & Offer" only sends a notification and does NOT affect visibility here.
      const isTargeted = offer.targetRoles?.includes(currentRole);
      const isPublicOrShareable = !offer.targetRoles || offer.targetRoles.length === 0;

      return isTargeted || isPublicOrShareable;
    });

  }, [allOffers, currentRole]);


  return (
    <>
      <PageHeader title="Deals & Offers" />
      
      {loading ? (
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-40 bg-muted rounded-t-lg" />
                <CardHeader>
                  <div className="h-6 w-3/4 bg-muted rounded-md" />
                  <div className="h-4 w-1/2 bg-muted rounded-md mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 w-full bg-muted rounded-md" />
                  <div className="h-4 w-full bg-muted rounded-md mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
      ) : userOffers && userOffers.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {userOffers.map((offer, index) => (
            <Card key={offer.id} className="overflow-hidden">
               {offer.imageUrl ? (
                  <div className="relative aspect-video w-full bg-muted">
                    <Image
                        src={offer.imageUrl}
                        alt={offer.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        priority={index === 0}
                    />
                  </div>
              ) : (
                  <div className="relative aspect-video w-full bg-muted flex items-center justify-center">
                    <Tag className="h-12 w-12 text-muted-foreground" />
                  </div>
              )}
              <CardHeader>
                <div className="flex justify-between items-start">
                    <CardTitle>{offer.previewText || offer.title}</CardTitle>
                    {offer.status !== 'Active' && <Badge variant={offer.status === 'Upcoming' ? 'default' : 'secondary'}>{offer.status}</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground line-clamp-3">{offer.description}</p>
              </CardContent>
              <CardContent>
                 <p className="text-sm text-muted-foreground">
                    Valid from {new Date(offer.validFrom).toLocaleDateString('en-GB')} to {new Date(offer.validTo).toLocaleDateString('en-GB')}
                 </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="text-2xl font-bold tracking-tight">
                No Offers Available
              </h3>
              <p className="text-sm text-muted-foreground">
                There are currently no deals or offers for your role.
              </p>
            </div>
          </div>
      )}
    </>
  );
}
