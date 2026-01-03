'use client';

import * as React from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    // This component will now primarily be used where the map might not be optional.
    // The CustomerMap component has its own fallback UI.
    return (
      <div className="flex items-center justify-center p-4 bg-muted rounded-lg border h-full">
          <p className="text-muted-foreground text-center">
            Google Maps API key is missing. Please add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to your .env file to display the map.
          </p>
      </div>
    );
  }

  return <APIProvider apiKey={apiKey}>{children}</APIProvider>;
}
