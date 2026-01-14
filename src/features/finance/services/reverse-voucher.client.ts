
"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeFirebase } from "@/firebase";

const { app } = initializeFirebase();

export async function reverseVoucher(companyId: string, voucherId: string, reason: string) {
  const fn = httpsCallable(getFunctions(app, "asia-south1"), "reverseVoucher");
  const res = await fn({ companyId, voucherId, reason });
  return res.data as any;
}
