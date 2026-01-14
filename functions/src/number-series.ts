import { getFirestore } from "firebase-admin/firestore";
import type { Transaction } from "firebase-admin/firestore";
import { DocPrefixConfig } from "./types";

export async function getNextDocNumber(
  transaction: Transaction,
  type: string,
  configs: DocPrefixConfig[] | undefined | null
): Promise<string> {
  // Uses the Admin SDK instance initialized in index.ts
  const db = getFirestore();

  const safeConfigs = configs || [];
  const config = safeConfigs.find(
    (c) => c?.type?.toLowerCase() === type?.toLowerCase()
  );

  if (!config || !config.prefix) {
    console.warn(`No valid prefix configuration found for type: ${type}. Using fallback.`);
    const fallbackPrefix = type.substring(0, 2).toUpperCase();
    return `${fallbackPrefix}-${Date.now()}`;
  }

  const prefix = config.prefix;
  const now = new Date();

  const yearShort = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dateStr = config.useDate ? `${yearShort}${month}` : "";

  const counterId = dateStr ? `${prefix}_${dateStr}` : prefix;
  const counterRef = db.doc(`counters/${counterId}`);

  const counterSnap = await transaction.get(counterRef);
  const currentCount = counterSnap.exists
    ? (counterSnap.data()?.next ?? config.startNumber ?? 1)
    : (config.startNumber ?? 1);

  transaction.set(counterRef, { next: currentCount + 1 }, { merge: true });

  const paddedNum = String(currentCount).padStart(config.digits || 4, "0");
  return dateStr ? `${prefix}-${dateStr}-${paddedNum}` : `${prefix}-${paddedNum}`;
}
