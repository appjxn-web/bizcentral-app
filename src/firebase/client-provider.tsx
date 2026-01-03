'use client';

import * as React from 'react';
import { initializeFirebase } from '.';
import { FirebaseProvider, type FirebaseProviderProps } from './provider';

// This is a client-side only provider that ensures Firebase is initialized only once.
export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const [firebaseInstances, setFirebaseInstances] = React.useState<FirebaseProviderProps | null>(null);

  React.useEffect(() => {
    // Firebase should only be initialized on the client side.
    const instances = initializeFirebase();
    setFirebaseInstances(instances);
  }, []);

  if (!firebaseInstances) {
    // You can render a loading skeleton here if needed
    return null;
  }

  return (
    <FirebaseProvider {...firebaseInstances}>
      {children}
    </FirebaseProvider>
  );
}
