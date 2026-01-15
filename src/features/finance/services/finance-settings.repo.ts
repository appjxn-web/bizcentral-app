

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

const settingsDoc = () => doc(db, 'company', 'settings');

export const financeSettingsRepo = {
  async get(): Promise<FinanceSettings | null> {
    const snap = await getDoc(settingsDoc());
    return snap.exists() ? (snap.data() as any as FinanceSettings) : null;
  },

  async upsert(data: Partial<FinanceSettings>, actorUid: string) {
    await setDoc(
      settingsDoc(),
      {
        finance: {
            ...data,
            updatedAt: serverTimestamp(),
            updatedBy: actorUid,
        }
      },
      { merge: true }
    );
  },
};
