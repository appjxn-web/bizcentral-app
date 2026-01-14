"use client";

import * as React from "react";
import { doc } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { useDoc, useUser } from "@/firebase";

import { financeSettingsRepo } from "@/features/finance/services/finance-settings.repo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

function thisMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function PeriodLockPage() {
  const { firestore: db } = initializeFirebase();
  const { user } = useUser();
  const companyId = "default";
  const actorUid = user?.uid || "system";
  const isAdmin = true; // In a real app, this would come from useRole()

  const ref = React.useMemo(() => doc(db, `companies/${companyId}/settings/finance`), [companyId, db]);
  const { data: settings, loading } = useDoc<any>(ref);

  const [lockUntilMonth, setLockUntilMonth] = React.useState(thisMonth());
  const [allowOverride, setAllowOverride] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (settings) {
      setLockUntilMonth(settings.lockUntilMonth ?? "");
      setAllowOverride(!!settings.allowAdminOverrideLock);
    }
  }, [settings]);

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      if (!isAdmin) throw new Error("Only admin can update lock.");

      const current = (settings?.lockUntilMonth ?? "") as string;
      if (current && lockUntilMonth && lockUntilMonth < current) {
        throw new Error(`Lock cannot be moved backward. Current lock: ${current}`);
      }

      await financeSettingsRepo.upsert(
        companyId,
        {
          ...settings,
          lockUntilMonth,
          allowAdminOverrideLock: allowOverride,
        },
        actorUid
      );

      setMsg("Saved.");
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Accounting Period Lock" />
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Period Lock Settings</CardTitle>
          <CardDescription>
            Months ≤ lockUntilMonth are blocked for posting. This ensures financial data integrity for closed periods.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && <div className="text-sm">Loading settings...</div>}
          {err && <div className="text-sm text-destructive">{err}</div>}
          {msg && <div className="text-sm text-green-600">{msg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-xl p-4">
              <div className="text-sm text-muted-foreground">Currently Locked Until</div>
              <div className="font-semibold text-lg">{settings?.lockUntilMonth || "Not Set"}</div>
            </div>

            <div className="md:col-span-2 border rounded-xl p-4 space-y-2">
              <Label className="text-base font-medium">Set New Lock Date</Label>
              <Input
                type="month"
                value={lockUntilMonth}
                onChange={(e) => setLockUntilMonth(e.target.value)}
                placeholder="YYYY-MM"
              />
              <div className="text-xs text-muted-foreground">
                Example: “2025-12” locks all months up to and including December 2025.
              </div>
            </div>
          </div>

          <div className="border rounded-xl p-4 flex items-center justify-between">
            <div>
                <Label htmlFor="admin-override" className="text-base font-medium">Admin Override</Label>
                <div className="text-xs text-muted-foreground mt-1">
                If enabled, admins can override period locks (server-side check required).
                </div>
            </div>
            <Switch
                id="admin-override"
                checked={allowOverride}
                onCheckedChange={setAllowOverride}
            />
          </div>

          <Button onClick={save} disabled={saving || !isAdmin}>
            {saving ? "Saving..." : "Save Lock Settings"}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}