
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

export const reportsCacheService = {
  async getLedgerTotals(companyId: string, fromDate: string, toDate: string) {
    const { firestore: db } = initializeFirebase();
    const totals = new Map<string, { dr: number; cr: number }>();
    const jRef = collection(db, `companies/${companyId}/journal_entries`);

    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    const firstMonth = fromDate.slice(0, 7);
    const lastMonth = toDate.slice(0, 7);
    const firstDayOfFirstMonth = new Date(fromDateObj.getFullYear(), fromDateObj.getMonth(), 1);
    const lastDayOfLastMonth = new Date(toDateObj.getFullYear(), toDateObj.getMonth() + 1, 0);

    const fullMonths = monthRange(fromDate, toDate);
    
    // Logic for partial first month
    if (fromDateObj > firstDayOfFirstMonth) {
      const q = query(jRef, 
        where("voucherDate", ">=", fromDate), 
        where("voucherDate", "<", new Date(fromDateObj.getFullYear(), fromDateObj.getMonth() + 1, 1).toISOString().slice(0, 10))
      );
      const snap = await getDocs(q);
      snap.forEach(d => {
        const x = d.data() as any;
        const cur = totals.get(x.ledgerId) || { dr: 0, cr: 0 };
        cur.dr += Number(x.dr || 0);
        cur.cr += Number(x.cr || 0);
        totals.set(x.ledgerId, cur);
      });
      fullMonths.shift(); // Remove first month as it's handled
    }

    // Logic for partial last month
    if (toDateObj < lastDayOfLastMonth && firstMonth !== lastMonth) {
      const q = query(jRef, 
        where("voucherDate", ">=", new Date(toDateObj.getFullYear(), toDateObj.getMonth(), 1).toISOString().slice(0, 10)),
        where("voucherDate", "<=", toDate)
      );
      const snap = await getDocs(q);
       snap.forEach(d => {
        const x = d.data() as any;
        const cur = totals.get(x.ledgerId) || { dr: 0, cr: 0 };
        cur.dr += Number(x.dr || 0);
        cur.cr += Number(x.cr || 0);
        totals.set(x.ledgerId, cur);
      });
      fullMonths.pop(); // Remove last month
    } else if (firstMonth === lastMonth && fromDateObj > firstDayOfFirstMonth) {
        // Handled by the first partial month logic
        fullMonths.pop();
    }


    // Fetch full months from cache
    for (const month of fullMonths) {
      const ref = doc(db, `companies/${companyId}/report_cache/${month}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;

      const cache = snap.data() as CacheDoc;
      const ledgers = cache.ledgers ?? {};

      for (const [ledgerId, v] of Object.entries(ledgers)) {
        const cur = totals.get(ledgerId) || { dr: 0, cr: 0 };
        cur.dr += Number(v.dr || 0);
        cur.cr += Number(v.cr || 0);
        totals.set(ledgerId, cur);
      }
    }

    // Round final totals
    for (const [k, v] of totals.entries()) {
      totals.set(k, { dr: round2(v.dr), cr: round2(v.cr) });
    }

    return totals;
  },
};
