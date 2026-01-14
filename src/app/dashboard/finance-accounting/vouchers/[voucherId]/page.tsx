"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { doc, collection, query, where, orderBy, limit } from "firebase/firestore";

import { initializeFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollectionQuery } from "@/hooks/use-collection-query";
import { reverseVoucher } from "@/features/finance/services/reverse-voucher.client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";

function fmt(n: any) {
  const x = Number(n || 0);
  return x.toFixed(2);
}

export default function VoucherDetailPage() {
  const params = useParams<{ voucherId: string }>();
  const voucherId = params.voucherId;
  const { firestore: db } = initializeFirebase();

  const companyId = "default";
  
  const [reason, setReason] = React.useState("");
  const [reversing, setReversing] = React.useState(false);
  const [revResult, setRevResult] = React.useState<any>(null);
  const [revErr, setRevErr] = React.useState<string | null>(null);

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
    `voucherLines:${companyId}:${voucherId}`
  );

  const totalDr = lines.reduce((s, l) => s + Number(l.dr || 0), 0);
  const totalCr = lines.reduce((s, l) => s + Number(l.cr || 0), 0);
  
  async function doReverse() {
    setReversing(true);
    setRevErr(null);
    setRevResult(null);
    try {
      const res = await reverseVoucher(companyId, voucherId, reason || "Reversal");
      setRevResult(res);
    } catch (e: any) {
      setRevErr(e?.message ?? "Reversal failed");
    } finally {
      setReversing(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Voucher Detail" />
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
          
           <div className="border rounded-2xl p-3">
            <div className="font-semibold">Reverse Voucher</div>
            <div className="text-xs text-muted-foreground mt-1">
              Creates a new reversal voucher (DR/CR swapped). Original voucher remains for audit.
            </div>

            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="md:col-span-2">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for reversal" />
              </div>
              <Button onClick={doReverse} disabled={reversing || !reason || voucher?.isReversal}>
                {reversing ? "Reversing..." : "Reverse Now"}
              </Button>
            </div>

            {revErr && <div className="text-sm text-destructive mt-2">{revErr}</div>}
            {revResult && (
              <div className="text-sm mt-2">
                Reversal created: <span className="font-medium">{revResult.reversalVoucherId}</span>
              </div>
            )}
          </div>

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