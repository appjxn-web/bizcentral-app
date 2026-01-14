
"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeFirebase } from "@/firebase";

const { app } = initializeFirebase();

/**
 * Triggers the 'postSalesInvoice' Cloud Function.
 * @param companyId The ID of the company.
 * @param invoiceId The ID of the invoice to post.
 * @returns The result from the Cloud Function.
 */
export async function postInvoice(companyId: string, invoiceId: string) {
  const functions = getFunctions(app, "asia-south1");
  const postSalesInvoiceFn = httpsCallable(functions, "postSalesInvoice");
  
  try {
    const res = await postSalesInvoiceFn({ companyId, invoiceId });
    return res.data as any;
  } catch (error) {
    console.error("Error calling postSalesInvoice function:", error);
    // It's often better to re-throw the error so the calling component can handle it.
    // This allows for more specific error messages in the UI.
    throw error;
  }
}
