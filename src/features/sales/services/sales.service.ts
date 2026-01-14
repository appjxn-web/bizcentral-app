
'use server';

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { salesPaths } from "@/firebase/paths";
import type { SalesInvoice } from '@/lib/types';
import { getNextDocNumber } from '@/lib/number-series';

const { firestore: db } = initializeFirebase();

/**
 * This service is now only responsible for creating the initial DRAFT invoice document.
 * The complex logic of stock deduction and accounting is handled atomically by the 
 * `onInvoiceCreated` Cloud Function, which is triggered when this document is created.
 */
export const salesService = {
  async createSalesInvoice(companyId: string, input: Omit<SalesInvoice, 'id' | 'invoiceNumber'>, actorUid: string) {

    const newDocRef = doc(collection(db, salesPaths.salesInvoices(companyId)));
    
    // We only set the initial data. The onInvoiceCreated function will handle the rest.
    await setDoc(newDocRef, {
        ...input,
        id: newDocRef.id,
        // The status is now set to 'Unpaid' or a similar initial state.
        // The Cloud Function will process it from here.
        status: 'Unpaid', 
        createdByUid: actorUid,
        createdAt: serverTimestamp(),
    });

    return newDocRef.id;
  },
};
