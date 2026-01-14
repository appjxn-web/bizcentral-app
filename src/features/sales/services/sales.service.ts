
'use server';

import { doc, setDoc, serverTimestamp, collection, getDocs, query, where, limit } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { salesPaths } from "@/firebase/paths";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { SalesInvoice } from '@/lib/types';
import { getNextDocNumber } from '@/lib/number-series';

const { firestore: db, app } = initializeFirebase();

/**
 * This service handles sales-related operations.
 * The createSalesInvoice function now only creates a DRAFT invoice.
 * The posting logic (stock, accounting) is handled by a separate, callable Cloud Function.
 */
export const salesService = {
  /**
   * Creates a new sales invoice document with a 'DRAFT' status.
   * @param companyId The ID of the company.
   * @param input The invoice data.
   * @param actorUid The UID of the user creating the invoice.
   * @param allInvoices All existing invoices, used for number series generation.
   * @param settingsData Company settings containing document prefixes.
   * @returns The ID of the newly created draft invoice.
   */
  async createSalesInvoice(
    companyId: string, 
    input: Omit<SalesInvoice, 'id' | 'invoiceNumber' | 'status'>, 
    actorUid: string,
    allInvoices: SalesInvoice[],
    settingsData: any
  ) {
    
    const newInvoiceRef = doc(collection(db, `companies/${companyId}/sales_invoices`));
    
    await setDoc(newInvoiceRef, {
        ...input,
        id: newInvoiceRef.id,
        invoiceNumber: newInvoiceRef.id, // Temporary, will be set properly by Cloud Function
        status: 'DRAFT', 
        createdByUid: actorUid,
        createdAt: serverTimestamp(),
    });

    return newInvoiceRef.id;
  },

  /**
   * Calls the 'postSalesInvoice' Cloud Function to process an invoice.
   * @param companyId The ID of the company.
   * @param invoiceId The ID of the invoice to post.
   * @returns The result from the Cloud Function.
   */
  async postInvoice(companyId: string, invoiceId: string) {
    const functions = getFunctions(app, "asia-south1");
    const postSalesInvoiceFn = httpsCallable(functions, "postSalesInvoice");
    const res = await postSalesInvoiceFn({ companyId, invoiceId });
    return res.data as any;
  }
};
