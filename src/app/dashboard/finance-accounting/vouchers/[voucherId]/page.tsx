
"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { doc, collection, query, where, orderBy, limit } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";

import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollectionQuery } from "@/hooks/use-collection-query";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function fmt(n: any) {
  const x = Number(n || 0);
  return x.toFixed(2);
}

export default function VoucherDetailPage() {
  const params = useParams<{ voucherId: string }>();
  const voucherId = params.voucherId;
  const { firestore: db } = initializeFirebase();

  // TODO: replace with your company context
  const companyId = "default";

  const voucherRef = React.useMemo(
    () => doc(db, `companies/${companyId}/vouchers/${voucherId}`),
    [companyId, voucherId, db]
  );
  const { data: voucher, loading, error } = useDoc<any>(voucherRef);

  const journalQ = React.useMemo(() => {
    if (!voucherId) return null;
    const ref = collection(db, `companies/${companyId}/journal_entries`);
    return query(ref, where("voucherId", "==", voucherId), orderBy("lineNo", "asc"), limit(200));
  }, [companyId, voucherId, db]);

  const { data: lines, loading: lLoading, error: lErr } = useCollectionQuery<any>(
    journalQ,
    `voucherLines:${companyId}:${voucherId}`,
    { enabled: !!voucherId }
  );

  const totalDr = lines.reduce((s, l) => s + Number(l.dr || 0), 0);
  const totalCr = lines.reduce((s, l) => s + Number(l.cr || 0), 0);

  return (
    <div className="p-4 space-y-4">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Voucher</CardTitle>
          <div className="text-xs text-muted-foreground mt-1">ID: {voucherId}</div>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          {loading && <div>Loading...</div>}
          {error && <div className="text-destructive">{String(error?.message ?? error)}</div>}

          {voucher && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">Type</div>
                <div className="font-medium">{voucher.voucherType ?? "-"}</div>
              </div>
              <div className="border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">Date</div>
                <div className="font-medium">{voucher.voucherDate ?? "-"}</div>
              </div>
              <div className="border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">Ref No</div>
                <div className="font-medium">{voucher.refNo ?? "-"}</div>
              </div>
              <div className="border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">Narration</div>
                <div className="font-medium">{voucher.narration ?? "-"}</div>
              </div>
            </div>
          )}

          <div className="border rounded-2xl p-3">
            <div className="font-medium mb-2">Journal Entries</div>

            {(lLoading || !lines) && <div className="text-muted-foreground">Loading lines...</div>}
            {lErr && <div className="text-destructive">{String(lErr?.message ?? lErr)}</div>}

            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.id} className="border rounded-xl p-2">
                  <div className="flex justify-between">
                    <div className="font-medium">Line {l.lineNo}</div>
                    <div className="text-xs text-muted-foreground">{l.ledgerId}</div>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>DR: {fmt(l.dr)}</span>
                    <span>CR: {fmt(l.cr)}</span>
                  </div>
                  {l.narration ? (
                    <div className="text-xs text-muted-foreground mt-1">{l.narration}</div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span>DR {fmt(totalDr)} | CR {fmt(totalCr)}</span>
            </div>

            {Math.round(totalDr * 100) !== Math.round(totalCr * 100) && (
              <div className="mt-2 text-xs text-destructive">
                ⚠ Voucher not balanced (DR ≠ CR). Check posting rules.
              </div>
            )}
          </div>

          {/* Optional: future drill-down */}
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" type="button" disabled>
              Ledger Drill-down (next)
            </Button>
            <Button variant="secondary" type="button" disabled>
              Print Voucher (next)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
