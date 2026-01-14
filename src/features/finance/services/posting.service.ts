
'use server';

import { addDoc, collection, serverTimestamp, writeBatch } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { financePaths } from "@/firebase/paths";
import { voucherSchema } from "../schemas/journal.schema";

const { firestore: db } = initializeFirebase();

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const postingService = {
  async postVoucher(companyId: string, input: unknown, actorUid: string) {
    const voucher = voucherSchema.parse(input);

    const totalDr = round2(voucher.lines.reduce((s, l) => s + (l.dr || 0), 0));
    const totalCr = round2(voucher.lines.reduce((s, l) => s + (l.cr || 0), 0));
    if (totalDr !== totalCr) throw new Error(`Voucher not balanced. DR=${totalDr} CR=${totalCr}`);

    // Save voucher (header + lines)
    const vRef = collection(db, financePaths.vouchers(companyId));
    const vRes = await addDoc(vRef, {
      ...voucher,
      companyId,
      totalDr,
      totalCr,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
    });

    // Save journal entries (one doc per line) — easy for reporting
    const jRef = collection(db, financePaths.journalEntries(companyId));
    await Promise.all(
      voucher.lines.map((l, idx) =>
        addDoc(jRef, {
          companyId,
          voucherId: vRes.id,
          voucherType: voucher.voucherType,
          voucherDate: voucher.voucherDate,
          lineNo: idx + 1,
          ledgerId: l.ledgerId,
          dr: l.dr || 0,
          cr: l.cr || 0,
          narration: l.narration ?? voucher.narration ?? "",
          createdAt: serverTimestamp(),
        })
      )
    );

    return vRes.id;
  },
};
