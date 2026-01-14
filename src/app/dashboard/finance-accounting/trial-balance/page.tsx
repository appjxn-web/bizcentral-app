
"use client";

import * as React from "react";
import { reportsService, type ReportsResult } from "@/features/finance/services/reports.service";
import { fmt2, toDrCrFromNet } from "@/features/finance/utils/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function firstDayOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function TrialBalancePage() {
  const companyId = "default";

  const [fromDate, setFromDate] = React.useState(firstDayOfMonthISO());
  const [toDate, setToDate] = React.useState(todayISO());

  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<ReportsResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsService.compute(companyId, fromDate, toDate);
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Trial Balance");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  
  const rows = data?.trialBalance?.rows || [];
  const totals = data?.trialBalance || { totalPeriodDr: 0, totalPeriodCr: 0 };


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
              DR {fmt2(totals.totalPeriodDr)} | CR {fmt2(totals.totalPeriodCr)}
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
              <Button onClick={load} disabled={loading}>
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

          {Math.round(totals.totalPeriodDr * 100) !== Math.round(totals.totalPeriodCr * 100) && (
            <div className="text-xs text-destructive">
              ⚠ Trial Balance mismatch (Period DR ≠ CR). Check posting rules.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    