
"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeFirebase } from "@/firebase";

const { app } = initializeFirebase();

export async function postInvoice(companyId: string, invoiceId: string) {
  const functions = getFunctions(app, "asia-south1");
  const postSalesInvoiceFn = httpsCallable(functions, "postSalesInvoice");
  const res = await postSalesInvoiceFn({ companyId, invoiceId });
  return res.data as any;
}
