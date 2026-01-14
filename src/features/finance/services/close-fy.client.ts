
"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeFirebase } from "@/firebase";

const { app } = initializeFirebase();

export async function closeFY(companyId: string, fyEndDate: string) {
  const fn = httpsCallable(getFunctions(app, "asia-south1"), "closeFiscalYear");
  const res = await fn({ companyId, fyEndDate });
  return res.data as any;
}
