
'use server';

import { addDoc, collection, serverTimestamp, getDocs, query, where, doc, updateDoc, setDoc } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { salesPaths } from "@/firebase/paths";
import { salesInvoiceSchema, type SalesInvoiceInput } from "../schemas/sales.schema";
import { inventoryRepo } from "@/features/inventory/services/inventory.repo";
import { postingService } from "@/features/finance/services/posting.service";
import { ledgerMappingService } from "@/features/finance/services/ledger-mapping.service";
import type { Party, CoaLedger, UserProfile, SalesInvoice } from "@/lib/types";
import { getNextDocNumber } from '@/lib/number-series';


const { firestore: db } = initializeFirebase();

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const salesService = {
  async createSalesInvoice(companyId: string, input: Omit<SalesInvoice, 'id' | 'invoiceNumber'>, actorUid: string) {

    // The core logic is now moved to the onInvoiceCreated Cloud Function for atomicity.
    // This client-side service is now only responsible for creating the initial document.

    const newDocRef = doc(collection(db, 'salesInvoices'));
    
    await setDoc(newDocRef, {
        ...input,
        id: newDocRef.id,
        status: 'Unpaid', // Initial status
        createdByUid: actorUid,
        createdAt: serverTimestamp(),
    });

    return newDocRef.id;
  },
};
