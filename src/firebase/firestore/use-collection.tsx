
'use client';

import * as React from 'react';
import {
  onSnapshot,
  type Query,
  type DocumentData,
  type CollectionReference,
} from 'firebase/firestore';

import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useCollectionQuery } from '@/hooks/use-collection-query';


/**
 * Extracts the path from a Firestore query or collection reference.
 * This is a workaround because the v9 SDK doesn't expose a public `path` property on queries.
 */
function getQueryPath(q: Query | CollectionReference): string | undefined {
    // The `_query` property is internal, but it's the most reliable way to get the path.
    const internalQuery = (q as any)._query;
    if (internalQuery && typeof internalQuery.path?.toString === 'function') {
        return internalQuery.path.toString();
    }
    return undefined;
}


/**
 * Safe collection listener hook.
 * - If q is null/undefined => no query runs (no Firestore request).
 * - Creates a stable dependency key so the listener re-subscribes only when the query changes.
 * - Emits permission error in a consistent way.
 */
export function useCollection<T>(q: Query<DocumentData> | null | undefined) {
  // Generate a stable key based on the collection path and serialized filters
  const queryKey = React.useMemo(() => {
    if (!q) return 'null';
    // Use the internal path and stringified constraints for a stable subscription key
    return (q as any)._query?.path?.toString() + JSON.stringify((q as any)._query?.filters || []);
  }, [q]);

  const { data, loading, error } = useCollectionQuery<T>(q, queryKey);
  
  React.useEffect(() => {
    if (error) {
        console.error("Firestore Permission Error on path:", getQueryPath(q!), error);
        const permissionError = new FirestorePermissionError({
          path: getQueryPath(q!) || 'unknown collection',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
    }
  }, [error, q]);


  return { data, loading, error };
}
