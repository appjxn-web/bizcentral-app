
'use client';

import * as React from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

// This is a client-side only component that will listen for
// permission errors and render the Next.js error overlay.
export function FirebaseErrorListener() {
  React.useEffect(() => {
    const onError = (error: Error) => {
      // Throwing an error in a component will be caught by Next.js's
      // error boundary and render the error overlay in development.
      throw error;
    };

    errorEmitter.on('permission-error', onError);

    return () => {
      errorEmitter.off('permission-error', onError);
    };
  }, []);

  return null;
}
