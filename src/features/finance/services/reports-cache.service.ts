
'use server';

import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { round2 } from "@/features/finance/utils/accounting";

type CacheDoc = {
  month: string; // "YYYY-MM"
  ledgers?: Record<string, { dr: number; cr: number }>;
};

function monthRange(fromISO: string, toISO: string) {
  const out: string[] = [];
  let current = new Date(fromISO);
  current.setDate(1); // Start from the beginning of the month
  const endDate = new Date(toISO);

  while (current <= endDate) {
    out.push(current.toISOString().slice(0, 7));
    current.setMonth(current.getMonth() + 1);
  }
  return out;
}

const { firestore: db } = initializeFirebase();

function addToTotals(
  totals: Map<string, { dr: number; cr: number }>,
  ledgerId: string,
  dr: number,
  cr: number
) {
  const cur = totals.get(ledgerId) || { dr: 0, cr: 0 };
  cur.dr += Number(dr || 0);
  cur.cr += Number(cr || 0);
  totals.set(ledgerId, cur);
}

async function loadMonthlyCacheTotals(companyId: string, month: string): Promise<CacheDoc | null> {
  const ref = doc(db, `companies/${companyId}/report_cache/${month}`);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as CacheDoc) : null;
}

async function scanJournalEntriesTotals(companyId: string, from: string, to: string) {
  const totals = new Map<string, { dr: number; cr: number }>();
  const jRef = collection(db, `companies/${companyId}/journal_entries`);
  const q = query(
    jRef,
    where("voucherDate", ">=", from),
    where("voucherDate", "<=", to)
  );
  const snap = await getDocs(q);
  snap.forEach(d => {
    const x = d.data() as any;
    addToTotals(totals, x.ledgerId, x.dr, x.cr);
  });
  return totals;
}

export async function getLedgerTotalsFromCache(companyId: string, fromDate: string, toDate: string) {
    const totals = new Map<string, { dr: number; cr: number }>();
    const jRef = collection(db, `companies/${companyId}/journal_entries`);

    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    
    fromDateObj.setHours(0,0,0,0);
    toDateObj.setHours(23,59,59,999);

    const firstMonthStr = fromDate.slice(0, 7);
    const lastMonthStr = toDate.slice(0, 7);

    const fullMonths = monthRange(fromDate, toDate);
    const monthsToCacheFetch = new Set(fullMonths);

    const firstDayOfFirstMonth = new Date(fromDateObj.getFullYear(), fromDateObj.getMonth(), 1);
    if (fromDateObj > firstDayOfFirstMonth) {
      const endOfFirstMonth = new Date(fromDateObj.getFullYear(), fromDateObj.getMonth() + 1, 0);
      const edgeEndDate = toDate.slice(0,7) === firstMonthStr ? toDate : endOfFirstMonth.toISOString().slice(0, 10);
      
      const edge = await scanJournalEntriesTotals(companyId, fromDate, edgeEndDate);
      for (const [k, v] of edge.entries()) addToTotals(totals, k, v.dr, v.cr);
      monthsToCacheFetch.delete(firstMonthStr);
    }
    
    const lastDayOfLastMonth = new Date(toDateObj.getFullYear(), toDateObj.getMonth() + 1, 0);
     if (toDateObj < lastDayOfLastMonth && firstMonthStr !== lastMonthStr) {
      const startOfLastMonth = new Date(toDateObj.getFullYear(), toDateObj.getMonth(), 1).toISOString().slice(0, 10);
      const edge = await scanJournalEntriesTotals(companyId, startOfLastMonth, toDate);
      for (const [k, v] of edge.entries()) addToTotals(totals, k, v.dr, v.cr);
      monthsToCacheFetch.delete(lastMonthStr);
    }

    for (const month of Array.from(monthsToCacheFetch)) {
      const cache = await loadMonthlyCacheTotals(companyId, month);
      if (!cache?.ledgers) continue;
      for (const [ledgerId, v] of Object.entries(cache.ledgers)) {
        addToTotals(totals, ledgerId, Number(v.dr || 0), Number(v.cr || 0));
      }
    }

    for (const [k, v] of totals.entries()) {
      totals.set(k, { dr: round2(v.dr), cr: round2(v.cr) });
    }

    return totals;
};
