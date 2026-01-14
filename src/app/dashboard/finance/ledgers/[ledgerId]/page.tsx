
"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { useFirestore } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { fmt2, toDrCr } from "@/features/finance/utils/balance";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";

type Row = {
  id: string;
  voucherDate: string;
  voucherType: string;
  voucherId: string;
  refNo?: string;
  narration?: string;
  dr: number;
  cr: number;
  lineNo?: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function LedgerDrillDownPage() {
  const params = useParams<{ ledgerId: string }>();
  const ledgerId = params.ledgerId;
  const firestore = useFirestore();

  const companyId = "default";

  const ledgerRef = React.useMemo(
    () => doc(firestore, `companies/${companyId}/coa_ledgers/${ledgerId}`),
    [companyId, ledgerId, firestore]
  );
  const { data: ledger } = useDoc<any>(ledgerRef);

  // Filters
  const [fromDate, setFromDate] = React.useState(firstDayOfMonthISO());
  const [toDate, setToDate] = React.useState(todayISO());
  const [voucherType, setVoucherType] = React.useState<string>("ALL"); // optional filter

  // Data
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [openingNet, setOpeningNet] = React.useState(0); // DR positive, CR negative
  const [error, setError] = React.useState<string | null>(null);

  const loadLedger = React.useCallback(async () => {
    if (!firestore) return;
    setLoading(true);
    setError(null);

    try {
      const jRef = collection(firestore, `companies/${companyId}/journal_entries`);

      // --- Opening balance: all entries before fromDate ---
      const openConstraints: any[] = [
        where("ledgerId", "==", ledgerId),
        orderBy("voucherDate", "asc"),
        where("voucherDate", "<", fromDate),
        limit(5000),
      ];
      if (voucherType !== "ALL") {
        openConstraints.unshift(where("voucherType", "==", voucherType));
      }

      const openQ = query(jRef, ...openConstraints);
      const openSnap = await getDocs(openQ);

      let open = 0;
      openSnap.forEach((d) => {
        const x = d.data() as any;
        open += Number(x.dr || 0) - Number(x.cr || 0);
      });
      setOpeningNet(open);

      // --- Transactions within range ---
      const txConstraints: any[] = [
        where("ledgerId", "==", ledgerId),
        orderBy("voucherDate", "asc"),
        where("voucherDate", ">=", fromDate),
        where("voucherDate", "<=", toDate),
        limit(5000),
      ];
      if (voucherType !== "ALL") {
        txConstraints.unshift(where("voucherType", "==", voucherType));
      }

      const txQ = query(jRef, ...txConstraints);
      const txSnap = await getDocs(txQ);

      const list: Row[] = txSnap.docs.map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          voucherDate: x.voucherDate,
          voucherType: x.voucherType,
          voucherId: x.voucherId,
          refNo: x.refNo,
          narration: x.narration,
          dr: Number(x.dr || 0),
          cr: Number(x.cr || 0),
          lineNo: x.lineNo,
        };
      });

      setRows(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, [firestore, companyId, ledgerId, fromDate, toDate, voucherType]);

  React.useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // Running + Closing
  let running = openingNet;
  const computed = rows.map((r) => {
    running += (r.dr || 0) - (r.cr || 0);
    return { ...r, runningNet: running };
  });

  const opening = toDrCr(openingNet);
  const closing = toDrCr(running);

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Ledger Drill-Down" />
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Ledger Drill-Down</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              Ledger: {ledger?.name ?? ledgerId}
            </div>
          </div>

          <div className="text-right text-sm">
            <div className="text-xs text-muted-foreground">Closing</div>
            <div className="font-semibold">
              {closing.type} {fmt2(closing.type === "DR" ? closing.dr : closing.cr)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-sm">From</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">To</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm">Voucher Type</label>
              <Input
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value)}
                placeholder='ALL or e.g. SALES_INVOICE'
              />
              <div className="text-xs text-muted-foreground mt-1">
                Tip: keep “ALL”. Filtering may need Firestore composite indexes.
              </div>
            </div>

            <div className="flex items-end">
              <Button type="button" onClick={loadLedger} disabled={loading}>
                {loading ? "Loading..." : "Apply"}
              </Button>
            </div>
          </div>

          {/* Opening / Closing summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Opening</div>
              <div className="font-semibold">
                {opening.type} {fmt2(opening.type === "DR" ? opening.dr : opening.cr)}
              </div>
            </div>
            <div className="border rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Transactions</div>
              <div className="font-semibold">{rows.length}</div>
            </div>
            <div className="border rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Closing</div>
              <div className="font-semibold">
                {closing.type} {fmt2(closing.type === "DR" ? closing.dr : closing.cr)}
              </div>
            </div>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          {/* Table-like list */}
          <div className="border rounded-2xl p-3 space-y-2">
            <div className="font-medium">Entries</div>

            {loading ? <div className="text-center p-8">Loading entries...</div> : (
              computed.length === 0 ? (
                <div className="text-sm text-muted-foreground p-8 text-center">No entries found in selected period.</div>
              ) : (
                computed.map((r) => {
                  const bal = toDrCr(r.runningNet);
                  return (
                    <div key={r.id} className="border rounded-xl p-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {r.voucherDate} • {r.voucherType}
                        </div>
                        <div className="text-xs text-muted-foreground">Voucher: {r.voucherId}</div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-2">
                        <div className="md:col-span-2">
                          <div className="text-xs text-muted-foreground">Narration</div>
                          <div className="truncate">{r.narration ?? "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">DR</div>
                          <div className="font-medium">{fmt2(r.dr)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">CR</div>
                          <div className="font-medium">{fmt2(r.cr)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Running</div>
                          <div className="font-semibold">
                            {bal.type} {fmt2(bal.type === "DR" ? bal.dr : bal.cr)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
