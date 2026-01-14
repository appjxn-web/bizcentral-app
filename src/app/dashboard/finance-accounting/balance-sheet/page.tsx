
"use client";

import * as React from "react";
import { computeReports, type ReportsResult } from "@/features/finance/services/reports.service";
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

export default function BalanceSheetPage() {
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
      const res = await computeReports(companyId, fromDate, toDate);
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Balance Sheet");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const assetsGroups = (data?.groupTotals ?? []).filter((g: any) => g.nature === "ASSET");
  const liabGroups = (data?.groupTotals ?? []).filter((g: any) => g.nature === "LIABILITY");
  const equityGroups = (data?.groupTotals ?? []).filter((g: any) => g.nature === "EQUITY");

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Balance Sheet" />
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Balance Sheet</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              As of {toDate} (period {fromDate} → {toDate})
            </div>
          </div>

          {data && (
            <div className="text-right text-sm">
              <div className="text-xs text-muted-foreground">Match Check</div>
              <div className="font-semibold">
                Assets {fmt2(data.balanceSheet.assetsAmount)} | L+E+P {fmt2(data.balanceSheet.liabilitiesPlusEquity)}
              </div>
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
              {/* Assets */}
              <div className="border rounded-2xl p-3">
                <div className="font-semibold mb-2">Assets</div>
                <div className="space-y-2 text-sm">
                  {assetsGroups.map((g: any) => (
                    <div key={g.groupId} className="flex justify-between border rounded-xl p-2">
                      <span>{g.groupName}</span>
                      <span className="font-medium">{fmt2(Math.abs(g.totalNet))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold mt-2">
                    <span>Total Assets</span>
                    <span>{fmt2(data.balanceSheet.assetsAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Liabilities + Equity */}
              <div className="border rounded-2xl p-3">
                <div className="font-semibold mb-2">Liabilities & Equity</div>

                <div className="text-sm font-medium mt-2">Liabilities</div>
                <div className="space-y-2 text-sm">
                  {liabGroups.map((g: any) => (
                    <div key={g.groupId} className="flex justify-between border rounded-xl p-2">
                      <span>{g.groupName}</span>
                      <span className="font-medium">{fmt2(Math.abs(g.totalNet))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold mt-2">
                    <span>Total Liabilities</span>
                    <span>{fmt2(data.balanceSheet.liabilitiesAmount)}</span>
                  </div>
                </div>

                <div className="text-sm font-medium mt-4">Equity</div>
                <div className="space-y-2 text-sm">
                  {equityGroups.map((g: any) => (
                    <div key={g.groupId} className="flex justify-between border rounded-xl p-2">
                      <span>{g.groupName}</span>
                      <span className="font-medium">{fmt2(Math.abs(g.totalNet))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold mt-2">
                    <span>Total Equity</span>
                    <span>{fmt2(data.balanceSheet.equityAmount)}</span>
                  </div>
                </div>

                <div className="border rounded-xl p-2 mt-4 flex justify-between font-semibold">
                  <span>Profit (from P&L)</span>
                  <span>{fmt2(data.balanceSheet.profit)}</span>
                </div>

                <div className="flex justify-between font-bold mt-2">
                  <span>Total L + E + Profit</span>
                  <span>{fmt2(data.balanceSheet.liabilitiesPlusEquity)}</span>
                </div>
              </div>
            </div>
          )}

          {data && (
            <div className="text-xs text-muted-foreground">
              Note: If Assets ≠ (Liabilities + Equity + Profit), check (1) voucher posting balance, (2) group nature mapping.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
