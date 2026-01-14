
'use client';

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { netFromOpening, round2 } from "@/features/finance/utils/accounting";
import type { CoaGroup, CoaLedger, CoaNature } from '@/lib/types';

const { firestore: db } = initializeFirebase();

export type TBRow = {
  ledgerId: string;
  ledgerName: string;
  groupId: string;

  openingNet: number; // DR positive, CR negative
  periodDr: number;
  periodCr: number;
  closingNet: number; // openingNet + (periodDr - periodCr)
};

export type GroupTotal = {
  groupId: string;
  groupName: string;
  nature: CoaNature;
  totalNet: number; // sum of ledger closingNet
};

export type ReportsResult = {
  fromDate: string;
  toDate: string;

  groups: CoaGroup[];
  ledgers: CoaLedger[];

  trialBalance: {
    rows: TBRow[];
    totalPeriodDr: number;
    totalPeriodCr: number;
  };

  pnl: {
    incomeNet: number;   // net sum for INCOME (usually negative)
    expenseNet: number;  // net sum for EXPENSE (usually positive)
    incomeAmount: number;  // abs(incomeNet)
    expenseAmount: number; // abs(expenseNet) (already positive generally)
    profit: number;        // incomeAmount - expenseAmount
  };

  balanceSheet: {
    assetsNet: number;
    liabilitiesNet: number;
    equityNet: number;

    assetsAmount: number;       // assetsNet (positive)
    liabilitiesAmount: number;  // abs(liabilitiesNet)
    equityAmount: number;       // abs(equityNet)
    liabilitiesPlusEquity: number; // liabilitiesAmount + equityAmount + profit
    profit: number;
  };

  groupTotals: GroupTotal[]; // closing totals by group
};

function abs(n: number) {
  return Math.abs(Number(n || 0));
}

export const reportsService = {
  async compute(companyId: string, fromDate: string, toDate: string): Promise<ReportsResult> {
    // 1) Load COA groups
    const gRef = collection(db, `companies/${companyId}/coa_groups`);
    const gSnap = await getDocs(query(gRef, orderBy("name", "asc"), limit(5000)));
    const groups: CoaGroup[] = gSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const groupById = new Map(groups.map((g) => [g.id, g]));

    // 2) Load ledgers
    const lRef = collection(db, `companies/${companyId}/coa_ledgers`);
    const lSnap = await getDocs(query(lRef, orderBy("name", "asc"), limit(10000)));
    const ledgers: CoaLedger[] = lSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // Opening net
    const openingNetByLedger = new Map<string, number>();
    for (const l of ledgers) {
      const openNet = netFromOpening(Number(l.openingBalance?.amount || 0), (l.openingBalance?.drCr || "DR") as any);
      openingNetByLedger.set(l.id, openNet);
    }

    // 3) Load journal entries within range
    const jRef = collection(db, `companies/${companyId}/journal_entries`);
    const jQ = query(
      jRef,
      orderBy("voucherDate", "asc"),
      where("voucherDate", ">=", fromDate),
      where("voucherDate", "<=", toDate),
      limit(200000) // later you will cache by month
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

    // 4) Build Trial Balance rows
    const rows: TBRow[] = [];
    for (const l of ledgers) {
      const openNet = openingNetByLedger.get(l.id) || 0;
      const dr = round2(periodDr.get(l.id) || 0);
      const cr = round2(periodCr.get(l.id) || 0);
      const closeNet = round2(openNet + (dr - cr));

      if (openNet === 0 && dr === 0 && cr === 0 && closeNet === 0) continue;

      rows.push({
        ledgerId: l.id,
        ledgerName: l.name,
        groupId: l.groupId,
        openingNet: openNet,
        periodDr: dr,
        periodCr: cr,
        closingNet: closeNet,
      });
    }

    const totalPeriodDr = round2(rows.reduce((s, r) => s + r.periodDr, 0));
    const totalPeriodCr = round2(rows.reduce((s, r) => s + r.periodCr, 0));

    // 5) Group totals from closingNet
    const groupTotalsMap = new Map<string, number>();
    for (const r of rows) {
      groupTotalsMap.set(r.groupId, (groupTotalsMap.get(r.groupId) || 0) + r.closingNet);
    }

    const groupTotals: GroupTotal[] = [];
    for (const [groupId, totalNet] of groupTotalsMap.entries()) {
      const g = groupById.get(groupId);
      if (!g) continue;
      groupTotals.push({
        groupId,
        groupName: g.name,
        nature: g.nature,
        totalNet: round2(totalNet),
      });
    }
    groupTotals.sort((a, b) => a.groupName.localeCompare(b.groupName));

    // 6) Summaries by nature (using ledger closingNet)
    let assetsNet = 0;
    let liabilitiesNet = 0;
    let equityNet = 0;
    let incomeNet = 0;
    let expenseNet = 0;

    for (const r of rows) {
      const g = groupById.get(r.groupId);
      if (!g) continue;

      if (g.nature === "ASSET") assetsNet += r.closingNet;
      if (g.nature === "LIABILITY") liabilitiesNet += r.closingNet;
      if (g.nature === "EQUITY") equityNet += r.closingNet;
      if (g.nature === "INCOME") incomeNet += r.closingNet;
      if (g.nature === "EXPENSE") expenseNet += r.closingNet;
    }

    assetsNet = round2(assetsNet);
    liabilitiesNet = round2(liabilitiesNet);
    equityNet = round2(equityNet);
    incomeNet = round2(incomeNet);
    expenseNet = round2(expenseNet);

    const incomeAmount = round2(abs(incomeNet));
    const expenseAmount = round2(abs(expenseNet));
    const profit = round2(incomeAmount - expenseAmount);

    const assetsAmount = round2(assetsNet);
    const liabilitiesAmount = round2(abs(liabilitiesNet));
    const equityAmount = round2(abs(equityNet));
    const liabilitiesPlusEquity = round2(liabilitiesAmount + equityAmount + profit);

    return {
      fromDate,
      toDate,
      groups,
      ledgers,
      trialBalance: {
        rows,
        totalPeriodDr,
        totalPeriodCr,
      },
      pnl: {
        incomeNet,
        expenseNet,
        incomeAmount,
        expenseAmount,
        profit,
      },
      balanceSheet: {
        assetsNet,
        liabilitiesNet,
        equityNet,
        assetsAmount,
        liabilitiesAmount,
        equityAmount,
        liabilitiesPlusEquity,
        profit,
      },
      groupTotals,
    };
  },
};
