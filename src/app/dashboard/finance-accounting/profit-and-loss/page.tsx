
"use client";

import * as React from "react";
import { reportsService, type ReportsResult } from "@/features/finance/services/reports.service";
import { fmt2 } from "@/features/finance/utils/accounting";
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

export default function ProfitLossPage() {
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
      setError(e?.message ?? "Failed to load P&L");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const incomeGroups = (data?.groupTotals ?? []).filter((g: any) => g.nature === "INCOME");
  const expenseGroups = (data?.groupTotals ?? []).filter((g: any) => g.nature === "EXPENSE");

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Profit & Loss" />
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Profit & Loss</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {fromDate} → {toDate}
            </div>
          </div>
          {data && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Profit</div>
              <div className="text-xl font-bold">{fmt2(data.pnl.profit)}</div>
            </div>
          )}
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

          {data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Income */}
              <div className="border rounded-2xl p-3">
                <div className="font-semibold mb-2">Income</div>
                <div className="space-y-2 text-sm">
                  {incomeGroups.map((g: any) => (
                    <div key={g.groupId} className="flex justify-between border rounded-xl p-2">
                      <span>{g.groupName}</span>
                      <span className="font-medium">{fmt2(Math.abs(g.totalNet))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold mt-2">
                    <span>Total Income</span>
                    <span>{fmt2(data.pnl.incomeAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Expense */}
              <div className="border rounded-2xl p-3">
                <div className="font-semibold mb-2">Expense</div>
                <div className="space-y-2 text-sm">
                  {expenseGroups.map((g: any) => (
                    <div key={g.groupId} className="flex justify-between border rounded-xl p-2">
                      <span>{g.groupName}</span>
                      <span className="font-medium">{fmt2(Math.abs(g.totalNet))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold mt-2">
                    <span>Total Expense</span>
                    <span>{fmt2(data.pnl.expenseAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data && (
            <div className="border rounded-2xl p-3 flex justify-between font-bold">
              <span>Net Profit</span>
              <span>{fmt2(data.pnl.profit)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
