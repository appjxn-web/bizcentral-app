
"use client";

import * as React from "react";
import { doc } from "firebase/firestore";
import { HttpsError } from "firebase/functions";

import { initializeFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";

import { reportsService } from "@/features/finance/services/reports.service";
import { closeFY } from "@/features/finance/services/close-fy.client";
import { fmt2 } from "@/features/finance/utils/accounting";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";

function monthKey(dateISO: string) {
  return (dateISO || "").slice(0, 7); // YYYY-MM
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function fyStartDateFromEnd(fyEndDate: string, fyStartMonth: number) {
  const d = new Date(fyEndDate + "T00:00:00Z");
  const endYear = d.getUTCFullYear();
  const endMonth = d.getUTCMonth() + 1;

  const startYear = endMonth < fyStartMonth ? endYear - 1 : endYear;
  return `${startYear}-${pad2(fyStartMonth)}-01`;
}
function fyCodeFromStart(startYear: number) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
function inferFYCode(fyStartDate: string) {
  const y = Number(fyStartDate.slice(0, 4));
  return fyCodeFromStart(y);
}

export default function YearEndClosingPage() {
  const { firestore: db } = initializeFirebase();
  const companyId = "default";

  // Finance settings doc
  const settingsRef = React.useMemo(() => doc(db, `companies/${companyId}/settings/finance`), [companyId, db]);
  const { data: settings, loading: settingsLoading } = useDoc<any>(settingsRef);

  const [fyEndDate, setFyEndDate] = React.useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const isAfterMar = now.getMonth() + 1 > 3;
    const y = isAfterMar ? year + 1 : year;
    return `${y}-03-31`;
  });

  const fyStartMonth = Number(settings?.fiscalYearStartMonth || 4);
  const fyStartDate = React.useMemo(() => fyStartDateFromEnd(fyEndDate, fyStartMonth), [fyEndDate, fyStartMonth]);
  const fyCode = React.useMemo(() => inferFYCode(fyStartDate), [fyStartDate]);

  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [preview, setPreview] = React.useState<any>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const [closing, setClosing] = React.useState(false);
  const [closeResult, setCloseResult] = React.useState<any>(null);
  const [closeError, setCloseError] = React.useState<string | null>(null);

  const lockUntilMonth = settings?.lockUntilMonth as string | undefined;
  const endMonth = monthKey(fyEndDate);
  const locked = lockUntilMonth ? endMonth <= lockUntilMonth : false;

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const res = await reportsService.compute(companyId, fyStartDate, fyEndDate);
      setPreview(res);
    } catch (e: any) {
      setPreviewError(e?.message ?? "Failed to compute FY preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runClose() {
    setClosing(true);
    setCloseError(null);
    setCloseResult(null);

    try {
      const res = await closeFY(companyId, fyEndDate);
      setCloseResult(res);
    } catch (e: any) {
      setCloseError(e?.message ?? "FY close failed");
    } finally {
      setClosing(false);
    }
  }

  React.useEffect(() => {
    if (!settingsLoading) loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading, fyEndDate]); // Re-run preview when date changes

  const profit = preview?.pnl?.profit ?? null;
  const income = preview?.pnl?.incomeAmount ?? null;
  const expense = preview?.pnl?.expenseAmount ?? null;

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Year-End Closing" />
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Year-End Closing</CardTitle>
          <div className="text-xs text-muted-foreground mt-1">
            FY Start Month: {fyStartMonth} • FY: {fyCode} • Range: {fyStartDate} → {fyEndDate}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Lock Until Month</div>
              <div className="font-semibold">{lockUntilMonth ?? "-"}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Posting blocked for months ≤ lockUntilMonth
              </div>
            </div>

            <div className="border rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Selected FY End Month</div>
              <div className="font-semibold">{endMonth}</div>
              <div className={`text-xs mt-1 ${locked ? "text-destructive" : "text-muted-foreground"}`}>
                {locked ? "This period is already locked." : "This period is open."}
              </div>
            </div>

            <div className="border rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Retained Earnings Ledger</div>
              <div className="font-semibold">{settings?.retainedEarningsLedgerId ?? "Not set"}</div>
              <div className="text-xs text-muted-foreground mt-1">Required to close FY.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <label className="text-sm">FY End Date</label>
              <Input type="date" value={fyEndDate} onChange={(e) => setFyEndDate(e.target.value)} />
              <div className="text-xs text-muted-foreground mt-1">
                For India FY, usually 31 March.
              </div>
            </div>

            <div className="flex items-end">
              <Button variant="secondary" onClick={loadPreview} disabled={previewLoading}>
                {previewLoading ? "Calculating..." : "Refresh Preview"}
              </Button>
            </div>
          </div>

          <div className="border rounded-2xl p-3">
            <div className="font-semibold mb-2">Preview (based on reports)</div>

            {previewError && <div className="text-sm text-destructive">{previewError}</div>}

            {!preview && !previewError && (
              <div className="text-sm text-muted-foreground">No preview loaded.</div>
            )}

            {preview && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">Total Income</div>
                  <div className="text-lg font-bold">{fmt2(income)}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">Total Expense</div>
                  <div className="text-lg font-bold">{fmt2(expense)}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">Profit / Loss</div>
                  <div className={`text-lg font-bold ${Number(profit) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {fmt2(profit)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Profit will be transferred to Retained Earnings.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border rounded-2xl p-3">
            <div className="font-semibold mb-2">Close Fiscal Year</div>
            <div className="text-sm text-muted-foreground">
              This will create a Year-End voucher, create next FY opening snapshot, and lock the period.
            </div>

            {closeError && <div className="text-sm text-destructive mt-2">{closeError}</div>}

            <div className="flex gap-2 flex-wrap mt-3">
              <Button
                onClick={runClose}
                disabled={
                  closing ||
                  settingsLoading ||
                  !settings?.retainedEarningsLedgerId ||
                  !settings?.pnlClearingLedgerId ||
                  locked
                }
              >
                {closing ? "Closing..." : "Close FY Now"}
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  setCloseResult(null);
                  setCloseError(null);
                }}
                disabled={closing}
              >
                Clear Result
              </Button>
            </div>

            {!settings?.pnlClearingLedgerId || !settings?.retainedEarningsLedgerId ? (
              <div className="text-xs text-destructive mt-2">
                Missing settings: {settings?.pnlClearingLedgerId ? "" : "pnlClearingLedgerId "}
                {settings?.retainedEarningsLedgerId ? "" : "retainedEarningsLedgerId"}
              </div>
            ) : null}
          </div>

          {closeResult && (
            <div className="border rounded-2xl p-3">
              <div className="font-semibold mb-2">Close Result</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">FY</div>
                  <div className="font-semibold">{closeResult.fy}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Next FY: {closeResult.nextFy}
                  </div>
                </div>

                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">Profit Carried</div>
                  <div className="font-semibold">{fmt2(closeResult.profit)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Locked until: {closeResult.lockUntilMonth}
                  </div>
                </div>

                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">FY Dates</div>
                  <div className="font-medium">
                    {closeResult.fyStartDate} → {closeResult.fyEndDate}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Next FY starts: {closeResult.nextFyStartDate}
                  </div>
                </div>

                <div className="border rounded-xl p-3">
                  <div className="text-xs text-muted-foreground">What to do now</div>
                  <div className="text-sm">
                    Open reports for new FY and confirm balances match. Posting for old FY is now blocked.
                  </div>
                </div>
              </div>

              <pre className="text-xs bg-muted p-3 rounded-xl mt-3 overflow-auto">
{JSON.stringify(closeResult, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
