
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

export const reverseVoucher = onCall({ region: "asia-south1" }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");

  const { companyId, voucherId, reason } = req.data || {};
  if (!companyId || !voucherId) throw new HttpsError("invalid-argument", "companyId & voucherId required");

  const voucherRef = db.doc(`companies/${companyId}/vouchers/${voucherId}`);
  const jRef = db.collection(`companies/${companyId}/journal_entries`);
  const revVoucherRef = db.collection(`companies/${companyId}/vouchers`).doc();

  return await db.runTransaction(async (tx) => {
    const vs = await tx.get(voucherRef);
    if (!vs.exists) throw new HttpsError("not-found", "Voucher not found");
    const v = vs.data() as any;

    // prevent double reversal
    if (v.isReversal) throw new HttpsError("failed-precondition", "Cannot reverse a reversal voucher.");

    const lines = v.lines;
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new HttpsError("failed-precondition", "Voucher lines not available. Store lines inside voucher for reversal.");
    }

    // Create reversal voucher
    tx.set(revVoucherRef, {
      companyId,
      voucherType: v.voucherType,
      voucherDate: v.voucherDate,
      refNo: `REV-${v.refNo || voucherId}`,
      narration: `Reversal of ${voucherId}. ${reason || ""}`.trim(),
      isReversal: true,
      reversedVoucherId: voucherId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      lines: lines.map((ln: any) => ({ ...ln, dr: ln.cr, cr: ln.dr })), // Reversed lines
    });

    // Create reversal journal entries
    lines.forEach((ln: any, idx: number) => {
      const je = jRef.doc();
      tx.set(je, {
        companyId,
        voucherId: revVoucherRef.id,
        voucherType: v.voucherType,
        voucherDate: v.voucherDate,
        lineNo: idx + 1,
        ledgerId: ln.ledgerId,
        dr: Number(ln.cr || 0),
        cr: Number(ln.dr || 0),
        narration: `Reversal: ${ln.narration || ""}`.trim(),
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    // Mark original voucher reversed (optional)
    tx.update(voucherRef, {
      reversedAt: FieldValue.serverTimestamp(),
      reversedBy: uid,
      reversalVoucherId: revVoucherRef.id,
    });

    return { ok: true, reversalVoucherId: revVoucherRef.id };
  });
});

    