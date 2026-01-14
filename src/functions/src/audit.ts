import * as admin from "firebase-admin";
import type { AuditLog } from "./types";

const db = admin.firestore();

/**
 * Creates an audit log entry.
 * @param logData - The data for the audit log entry.
 */
export async function createAuditLog(logData: Omit<AuditLog, 'timestamp'>): Promise<void> {
  const auditLogRef = db.collection('auditLogs').doc();
  
  const fullLogData: AuditLog = {
    ...logData,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };

  await auditLogRef.set(fullLogData);
}