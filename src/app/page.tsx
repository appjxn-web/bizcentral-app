
'use client';

import * as React from 'react';
import { HeroBanner } from './_components/hero-banner';

export default function HomePage() {
  return (
    <>
      <HeroBanner />
      <div className="container mx-auto px-4 md:px-6 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Welcome to jxnPlus</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Our shop and map will be displayed here shortly.
          </p>
        </div>
      </div>
    </>
  );
}
