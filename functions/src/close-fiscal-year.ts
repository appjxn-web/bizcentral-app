
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

type Input = {
  companyId: string;
  // FY end date inclusive, e.g. "2026-03-31" for FY 2025-26 (India)
  fyEndDate: string;
  // Optional: force lock until this month (YYYY-MM). Default = fyEndDate month
  lockUntilMonth?: string;
};

type CacheDoc = {
  month: string; // YYYY-MM
  ledgers?: Record<string, { dr: number; cr: number }>;
};

type CoaGroup = { nature: "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "EQUITY" };
type CoaLedger = { groupId: string; openingBalance?: number; openingBalanceType?: "DR" | "CR" };

function monthKey(dateISO: string) {
  return (dateISO || "").slice(0, 7); // YYYY-MM
}
function fyCodeFromStartYear(startYear: number) {
  // "2025-26"
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
function netFromOpening(openingBalance: number, type: "DR" | "CR") {
  const amt = Number(openingBalance || 0);
  return type === "DR" ? amt : -amt; // DR +, CR -
}
function monthRange(fromMonth: string, toMonth: string) {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);

  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m === 13) {
      m = 1;
      y++;
    }
  }
  return out;
}
function addDaysISO(dateISO: string, days: number) {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadMonthlyCache(companyId: string, month: string) {
  const ref = db.doc(`companies/${companyId}/report_cache/${month}`);
  const snap = await ref.get();
  return snap.exists ? (snap.data() as CacheDoc) : null;
}

export const closeFiscalYear = onCall({ region: "asia-south1" }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");

  const { companyId, fyEndDate, lockUntilMonth } = (req.data ?? {}) as Input;
  if (!companyId || !fyEndDate) throw new HttpsError("invalid-argument", "companyId and fyEndDate required");
  if (fyEndDate.length !== 10) throw new HttpsError("invalid-argument", "fyEndDate must be YYYY-MM-DD");

  // Load finance settings
  const settingsRef = db.doc(`companies/${companyId}/settings/finance`);
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) throw new HttpsError("failed-precondition", "Finance settings not found");
  const settings = settingsSnap.data() as any;

  const fyStartMonth: number = Number(settings.fiscalYearStartMonth || 4); // default April
  const retainedEarningsLedgerId: string = settings.retainedEarningsLedgerId;
  const pnlClearingLedgerId: string = settings.pnlClearingLedgerId;

  if (!retainedEarningsLedgerId || !pnlClearingLedgerId) {
    throw new HttpsError("failed-precondition", "Set retainedEarningsLedgerId and pnlClearingLedgerId in finance settings");
  }

  // Determine FY start date based on fyEndDate and fyStartMonth
  // Example: fyEndDate 2026-03-31 and fyStartMonth=4 => fyStartDate 2025-04-01
  const end = new Date(fyEndDate + "T00:00:00Z");
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;

  // If endMonth is before fyStartMonth, FY started previous year; else same year.
  const fyStartYear = endMonth < fyStartMonth ? endYear - 1 : endYear;
  const fyStartDate = `${fyStartYear}-${String(fyStartMonth).padStart(2, "0")}-01`;

  const fy = fyCodeFromStartYear(fyStartYear);
  const nextFy = fyCodeFromStartYear(fyStartYear + 1);
  const nextFyStartDate = addDaysISO(fyEndDate, 1);

  const fromMonth = monthKey(fyStartDate);
  const toMonth = monthKey(fyEndDate);
  const months = monthRange(fromMonth, toMonth);

  // Load COA groups and ledgers (admin SDK)
  const groupsSnap = await db.collection(`companies/${companyId}/coa_groups`).get();
  const groupById = new Map<string, CoaGroup>();
  groupsSnap.forEach((d) => groupById.set(d.id, d.data() as any));

  const ledgersSnap = await db.collection(`companies/${companyId}/coa_ledgers`).get();
  const ledgerById = new Map<string, CoaLedger>();
  ledgersSnap.forEach((d) => ledgerById.set(d.id, d.data() as any));

  // Load FY opening snapshot if exists, else create from ledger openingBalance
  const fyOpenRef = db.doc(`companies/${companyId}/fy_openings/${fy}`);
  const fyOpenSnap = await fyOpenRef.get();

  let openingNetByLedger: Record<string, number> = {};
  if (fyOpenSnap.exists) {
    const data = fyOpenSnap.data() as any;
    openingNetByLedger = data.ledgers || {};
  } else {
    // Create opening snapshot from ledger openingBalance
    ledgersSnap.forEach((d) => {
      const l = d.data() as any;
      openingNetByLedger[d.id] = netFromOpening(Number(l.openingBalance || 0), (l.openingBalanceType || "DR") as any);
    });

    await fyOpenRef.set({
      fy,
      asOfDate: fyStartDate,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      ledgers: openingNetByLedger,
      note: "Auto-created from ledger opening balances (first FY close)",
    });
  }

  // Aggregate FY movements using monthly cache (full months)
  // If your FY start/end are not whole months, you'd need edge scanning like we did in reportsService.
  // India FY is whole months, so this is fast.
  const movementNetByLedger = new Map<string, number>();

  for (const m of months) {
    const cache = await loadMonthlyCache(companyId, m);
    const led = cache?.ledgers || {};
    for (const [ledgerId, v] of Object.entries(led)) {
      const net = Number(v.dr || 0) - Number(v.cr || 0);
      movementNetByLedger.set(ledgerId, (movementNetByLedger.get(ledgerId) || 0) + net);
    }
  }

  // Compute FY profit from movements of INCOME and EXPENSE (not from opening)
  let incomeNetMove = 0;
  let expenseNetMove = 0;

  for (const [ledgerId, net] of movementNetByLedger.entries()) {
    const ledger = ledgerById.get(ledgerId);
    if (!ledger) continue;
    const g = groupById.get(ledger.groupId);
    if (!g) continue;

    if (g.nature === "INCOME") incomeNetMove += net;   // usually negative
    if (g.nature === "EXPENSE") expenseNetMove += net; // usually positive
  }

  const incomeAmount = Math.abs(incomeNetMove);
  const expenseAmount = Math.abs(expenseNetMove);
  const profit = Math.round((incomeAmount - expenseAmount) * 100) / 100; // +profit, -loss

  const postMonth = monthKey(fyEndDate);
  const lockTo = lockUntilMonth || postMonth;

  // Now do the year-end posting + next FY opening snapshot in ONE transaction
  await db.runTransaction(async (tx) => {
    // Re-read settings in tx (safety)
    const s2 = await tx.get(settingsRef);
    const st = s2.data() as any;

    // Period lock check (don’t allow closing into locked period unless admin override logic added)
    const currentLock = st.lockUntilMonth as string | undefined;
    if (currentLock && postMonth <= currentLock) {
      throw new HttpsError("failed-precondition", `Cannot close FY in locked period. Locked until ${currentLock}`);
    }

    // Create Year-End Closing voucher (profit transfer)
    const voucherRef = db.collection(`companies/${companyId}/vouchers`).doc();
    const voucherId = voucherRef.id;

    // Build lines:
    // If profit > 0: Dr PnL Clearing, Cr Retained Earnings
    // If loss  < 0: Dr Retained Earnings, Cr PnL Clearing
    const amt = Math.abs(profit);
    const lines =
      profit >= 0
        ? [
            { ledgerId: pnlClearingLedgerId, dr: amt, cr: 0, narration: `FY Closing ${fy} Profit` },
            { ledgerId: retainedEarningsLedgerId, dr: 0, cr: amt, narration: `FY Closing ${fy} Profit Transfer` },
          ]
        : [
            { ledgerId: retainedEarningsLedgerId, dr: amt, cr: 0, narration: `FY Closing ${fy} Loss` },
            { ledgerId: pnlClearingLedgerId, dr: 0, cr: amt, narration: `FY Closing ${fy} Loss Transfer` },
          ];

    tx.set(voucherRef, {
      companyId,
      voucherType: "JOURNAL",
      voucherDate: fyEndDate,
      refNo: `FY-CLOSE-${fy}`,
      narration: `Fiscal year closing for ${fy}`,
      isYearEndClose: true,
      fy,
      totalDr: amt,
      totalCr: amt,
      lines, // IMPORTANT: store lines for easy reversal/audit
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    // Journal entries for the voucher
    const jCol = db.collection(`companies/${companyId}/journal_entries`);
    lines.forEach((ln, idx) => {
      const je = jCol.doc();
      tx.set(je, {
        companyId,
        voucherId,
        voucherType: "JOURNAL",
        voucherDate: fyEndDate,
        lineNo: idx + 1,
        ledgerId: ln.ledgerId,
        dr: ln.dr,
        cr: ln.cr,
        narration: ln.narration,
        createdAt: FieldValue.serverTimestamp(),
        month: postMonth,
      });
    });

    // Update monthly report cache for fyEndDate month (so reports remain consistent)
    const cacheRef = db.doc(`companies/${companyId}/report_cache/${postMonth}`);
    const cacheSnap = await tx.get(cacheRef);
    const cache = cacheSnap.exists ? (cacheSnap.data() as any) : { month: postMonth, ledgers: {} };

    function inc(ledgerId: string, dr: number, cr: number) {
      if (!cache.ledgers) cache.ledgers = {};
      if (!cache.ledgers[ledgerId]) cache.ledgers[ledgerId] = { dr: 0, cr: 0 };
      cache.ledgers[ledgerId].dr += Number(dr || 0);
      cache.ledgers[ledgerId].cr += Number(cr || 0);
    }
    lines.forEach((ln) => inc(ln.ledgerId, ln.dr, ln.cr));

    tx.set(cacheRef, { ...cache, month: postMonth, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // Create next FY opening snapshot:
    // ClosingNet = openingNet + movementNet (FY)
    // Carry forward only ASSET/LIABILITY/EQUITY; reset INCOME/EXPENSE to 0.
    // Profit is already transferred via voucher above, so Equity now reflects it.
    const nextOpening: Record<string, number> = {};

    // Build closingNet by ledger
    for (const [ledgerId, ledger] of ledgerById.entries()) {
      const openNet = Number(openingNetByLedger[ledgerId] || 0);
      const mv = Number(movementNetByLedger.get(ledgerId) || 0);
      // Note: movement map includes all FY movements; voucher we posted is included via cache update
      // but not included in movementNetByLedger (since movementNetByLedger computed before tx).
      // So we also apply this year-end voucher effect to closing here:
      let closeNet = openNet + mv;

      // Apply year-end voucher net impact:
      // net = dr - cr
      if (ledgerId === pnlClearingLedgerId) {
        closeNet += Number(lines.find((x) => x.ledgerId === pnlClearingLedgerId)?.dr || 0)
                 - Number(lines.find((x) => x.ledgerId === pnlClearingLedgerId)?.cr || 0);
      }
      if (ledgerId === retainedEarningsLedgerId) {
        closeNet += Number(lines.find((x) => x.ledgerId === retainedEarningsLedgerId)?.dr || 0)
                 - Number(lines.find((x) => x.ledgerId === retainedEarningsLedgerId)?.cr || 0);
      }

      const g = groupById.get(ledger.groupId);
      if (!g) continue;

      if (g.nature === "INCOME" || g.nature === "EXPENSE") {
        nextOpening[ledgerId] = 0; // reset P&L ledgers for next FY
      } else {
        nextOpening[ledgerId] = Math.round(closeNet * 100) / 100;
      }
    }

    const nextFyRef = db.doc(`companies/${companyId}/fy_openings/${nextFy}`);
    tx.set(nextFyRef, {
      fy: nextFy,
      asOfDate: nextFyStartDate,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      baseFy: fy,
      yearEndVoucherId: voucherId,
      profitCarriedForward: profit,
      retainedEarningsLedgerId,
      ledgers: nextOpening,
    });

    // Lock the period through FY end month
    tx.set(settingsRef, { lockUntilMonth: lockTo, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid }, { merge: true });
  });

  return {
    ok: true,
    companyId,
    fy,
    nextFy,
    fyStartDate,
    fyEndDate,
    nextFyStartDate,
    profit,
    lockUntilMonth: lockTo,
  };
});

    