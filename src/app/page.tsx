
'use client';

import * as React from 'react';
import { HeroBanner } from './_components/hero-banner';
import ShopPageClient from './_components/shop-page-client';
import { CustomerMap } from './_components/customer-map';
import { Separator } from '@/components/ui/separator';

export default function HomePage() {
  return (
    <>
      <HeroBanner />
      <div className="container mx-auto px-4 md:px-6 py-12 space-y-12">
        <CustomerMap />
        <Separator />
        <ShopPageClient />
      </div>
    </>
  );
}
