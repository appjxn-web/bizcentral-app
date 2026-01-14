
import { FieldValue, getFirestore } from "firebase-admin/firestore";

export type AuditAction =
  | "POST_SALES_INVOICE"
  | "REVERSE_VOUCHER"
  | "CLOSE_FY"
  | "UPDATE_LOCK"
  | string;

export async function createAuditLog(params: {
  companyId: string;
  actorUid: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  meta?: any;
}) {
  const { companyId, actorUid, action, entityType, entityId, meta } = params;

  // ✅ Safe: getFirestore() is called only when function is executed,
  // and ONLY after admin.initializeApp() has run in index.ts
  const db = getFirestore();

  const ref = db.collection(`companies/${companyId}/audit_logs`).doc();
  await ref.set({
    at: FieldValue.serverTimestamp(),
    actorUid,
    action,
    entityType,
    entityId,
    meta: meta ?? {},
  });

  return ref.id;
}
