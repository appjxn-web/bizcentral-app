
'use server';

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";

export type FinanceSettings = {
  defaultSalesLedgerId: string;
  defaultGstOutputLedgerId: string;
  defaultArControlLedgerId?: string; 
  defaultCashLedgerId?: string;
  defaultBankLedgerId?: string;
  lockUntilMonth?: string;
  allowAdminOverrideLock?: boolean;
};

const { firestore: db } = initializeFirebase();

const settingsDoc = (companyId: string) => doc(db, `companies/${companyId}/settings/finance`);

export const financeSettingsRepo = {
  async get(companyId: string): Promise<FinanceSettings | null> {
    const snap = await getDoc(settingsDoc(companyId));
    return snap.exists() ? (snap.data() as any as FinanceSettings) : null;
  },

  async upsert(companyId: string, data: Partial<FinanceSettings>, actorUid: string) {
    await setDoc(
      settingsDoc(companyId),
      {
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      },
      { merge: true }
    );
  },
};
