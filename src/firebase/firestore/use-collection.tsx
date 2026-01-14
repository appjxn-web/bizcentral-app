
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

// A utility hook to memoize Firebase queries.
export function useMemoizedQuery(
  queryFn: () => Query<DocumentData> | null | undefined,
  deps: React.DependencyList
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const q = React.useMemo(queryFn, deps);
  return q;
}

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
  const [data, setData] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState<boolean>(!!q);
  const [error, setError] = React.useState<Error | null>(null);

  // Generate a stable key based on the collection path and serialized filters
  const queryKey = React.useMemo(() => {
    if (!q) return 'null';
    // Use the internal path and stringified constraints for a stable subscription key
    return (q as any)._query?.path?.toString() + JSON.stringify((q as any)._query?.filters || []);
  }, [q]);

  React.useEffect(() => {
    if (!q) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Firestore Permission Error on path:", getQueryPath(q), err);
        const permissionError = new FirestorePermissionError({
          path: getQueryPath(q) || 'orders',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [queryKey]); 

  return { data, loading, error };
}
