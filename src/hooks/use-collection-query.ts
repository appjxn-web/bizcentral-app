
"use client";

import * as React from "react";
import type { Query } from "firebase/firestore";
import { onSnapshot } from "firebase/firestore";

type Options = {
  enabled?: boolean;
};

export function useCollectionQuery<T = any>(
  q: Query | null,
  queryKey: string,
  opts: Options = {}
) {
  const enabled = opts.enabled ?? true;

  const [data, setData] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState<boolean>(enabled && !!q);
  const [error, setError] = React.useState<any>(null);

  React.useEffect(() => {
    if (!enabled || !q) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as T[];
        setData(rows);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
    // ✅ queryKey is the stable dependency, not Firestore internals
  }, [enabled, queryKey]);

  return { data, loading, error };
}
