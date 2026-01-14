
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

type Options = {
  enabled?: boolean;
};

export function useCollection<T>(q: Query<DocumentData> | null | undefined, options: Options = {}) {
  const { enabled = true } = options;
  const [data, setData] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(enabled && !!q);
  const [error, setError] = React.useState<Error | null>(null);

  const queryKey = React.useMemo(() => {
    if (!q) return 'null';
    return getQueryPath(q) + JSON.stringify((q as any)._query?.filters || []);
  }, [q]);

  React.useEffect(() => {
    if (!enabled || !q) {
      setLoading(false);
      setData([]);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as T[];
        setData(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Firestore Error in useCollection:", err);
        const permissionError = new FirestorePermissionError({
          path: getQueryPath(q) || 'unknown collection',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [enabled, queryKey]);

  return { data, loading, error };
}
