
'use client';

import * as React from 'react';
import { HeroBanner } from './_components/hero-banner';
import ShopPageClient from './_components/shop-page-client';
import { CustomerMap } from './_components/customer-map';
import { GoogleMapsProvider } from './_components/google-map-provider';

export default function ShopPage() {
  return (
    <>
      <HeroBanner />
      <div className="py-12 space-y-12">
        <div className="container mx-auto px-4 md:px-6">
          <GoogleMapsProvider>
            <CustomerMap />
          </GoogleMapsProvider>
        </div>
        <div className="container mx-auto px-4 md:px-6 space-y-8">
          <ShopPageClient />
        </div>
      </div>
    </>
  );
}
