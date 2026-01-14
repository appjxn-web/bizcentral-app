
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

import { initializeFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { fmt2, toDrCrFromNet, netFromOpening, round2 } from "@/features/finance/utils/accounting";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";

type Ledger = {
  id: string;
  name: string;
  groupId: string;
  openingBalance?: number;
  openingBalanceType?: "DR" | "CR";
  isActive?: boolean;
};

type TBRow = {
  ledgerId: string;
  ledgerName: string;
  groupId: string;

  openingNet: number;
  periodDr: number;
  periodCr: number;
  closingNet: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function TrialBalancePage() {
  const { firestore: db } = initializeFirebase();
  const companyId = "default";

  const [fromDate, setFromDate] = React.useState(firstDayOfMonthISO());
  const [toDate, setToDate] = React.useState(todayISO());

  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<TBRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const loadTrialBalance = React.useCallback(async () => {
    if (!db) return;
    setLoading(true);
    setError(null);

    try {
      const ledRef = collection(db, `companies/${companyId}/coa_ledgers`);
      const ledSnap = await getDocs(query(ledRef, orderBy("name", "asc"), limit(5000)));

      const ledgers: Ledger[] = ledSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const openingNetByLedger = new Map<string, number>();
      const metaByLedger = new Map<string, Ledger>();

      for (const l of ledgers) {
        metaByLedger.set(l.id, l);
        const openNet = netFromOpening(Number(l.openingBalance || 0), (l.openingBalanceType || "DR") as any);
        openingNetByLedger.set(l.id, openNet);
      }

      const jRef = collection(db, `companies/${companyId}/journal_entries`);
      const jQ = query(
        jRef,
        orderBy("voucherDate", "asc"),
        where("voucherDate", ">=", fromDate),
        where("voucherDate", "<=", toDate),
        limit(100000)
      );

      const jSnap = await getDocs(jQ);

      const periodDr = new Map<string, number>();
      const periodCr = new Map<string, number>();

      jSnap.forEach((d) => {
        const x = d.data() as any;
        const ledgerId = x.ledgerId as string;
        const dr = Number(x.dr || 0);
        const cr = Number(x.cr || 0);
        periodDr.set(ledgerId, (periodDr.get(ledgerId) || 0) + dr);
        periodCr.set(ledgerId, (periodCr.get(ledgerId) || 0) + cr);
      });

      const out: TBRow[] = [];
      for (const [ledgerId, ledger] of metaByLedger.entries()) {
        const openNet = openingNetByLedger.get(ledgerId) || 0;
        const dr = round2(periodDr.get(ledgerId) || 0);
        const cr = round2(periodCr.get(ledgerId) || 0);
        const closeNet = round2(openNet + (dr - cr));

        if (openNet === 0 && dr === 0 && cr === 0 && closeNet === 0) continue;

        out.push({
          ledgerId,
          ledgerName: ledger.name,
          groupId: ledger.groupId,
          openingNet: openNet,
          periodDr: dr,
          periodCr: cr,
          closingNet: closeNet,
        });
      }

      out.sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
      setRows(out);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load trial balance");
    } finally {
      setLoading(false);
    }
  }, [db, companyId, fromDate, toDate]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.periodDr += r.periodDr;
      acc.periodCr += r.periodCr;
      return acc;
    },
    { periodDr: 0, periodCr: 0 }
  );

  React.useEffect(() => {
    loadTrialBalance();
  }, [loadTrialBalance]);

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Trial Balance" />
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Trial Balance</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              From {fromDate} to {toDate}
            </div>
          </div>

          <div className="text-right text-sm">
            <div className="text-xs text-muted-foreground">Period Totals</div>
            <div className="font-semibold">
              DR {fmt2(totals.periodDr)} | CR {fmt2(totals.periodCr)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-sm">From</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">To</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={loadTrialBalance} disabled={loading}>
                {loading ? "Loading..." : "Apply"}
              </Button>
            </div>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="border rounded-2xl p-3 space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-4">Ledger</div>
              <div className="col-span-2 text-right">Opening</div>
              <div className="col-span-2 text-right">Period DR</div>
              <div className="col-span-2 text-right">Period CR</div>
              <div className="col-span-2 text-right">Closing</div>
            </div>

            {rows.map((r) => {
              const op = toDrCrFromNet(r.openingNet);
              const cl = toDrCrFromNet(r.closingNet);

              const openingStr = `${op.type} ${fmt2(op.type === "DR" ? op.dr : op.cr)}`;
              const closingStr = `${cl.type} ${fmt2(cl.type === "DR" ? cl.dr : cl.cr)}`;

              return (
                <div key={r.ledgerId} className="grid grid-cols-12 gap-2 border rounded-xl p-2 text-sm">
                  <div className="col-span-4 font-medium">{r.ledgerName}</div>
                  <div className="col-span-2 text-right">{openingStr}</div>
                  <div className="col-span-2 text-right">{fmt2(r.periodDr)}</div>
                  <div className="col-span-2 text-right">{fmt2(r.periodCr)}</div>
                  <div className="col-span-2 text-right font-semibold">{closingStr}</div>
                </div>
              );
            })}
          </div>

          {Math.round(totals.periodDr * 100) !== Math.round(totals.periodCr * 100) && (
            <div className="text-xs text-destructive">
              ⚠ Trial Balance mismatch (Period DR ≠ CR). Check posting rules.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
