
'use server';

import { addDoc, collection, serverTimestamp, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { salesPaths } from "@/firebase/paths";
import { salesInvoiceSchema, type SalesInvoiceInput } from "../schemas/sales.schema";
import { inventoryRepo } from "@/features/inventory/services/inventory.repo";
import { postingService } from "@/features/finance/services/posting.service";
import type { Party, CoaLedger, UserProfile } from "@/lib/types";

const { firestore: db } = initializeFirebase();

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Helper function to find or create a party's Accounts Receivable ledger
async function getCustomerLedgerId(customerId: string): Promise<string> {
    const partyRef = doc(db, 'parties', customerId);
    const partySnap = await getDoc(partyRef);
    if (!partySnap.exists()) throw new Error('Customer (Party) record not found.');
    
    const partyData = partySnap.data() as Party;
    if (partyData.coaLedgerId) return partyData.coaLedgerId;

    // If not linked, try to find by name, otherwise create a new one.
    const ledgersRef = collection(db, 'coa_ledgers');
    const q = query(ledgersRef, where('name', '==', partyData.name), where('type', '==', 'RECEIVABLE'), limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        const ledgerId = querySnapshot.docs[0].id;
        await updateDoc(partyRef, { coaLedgerId: ledgerId });
        return ledgerId;
    }
    
    // Create new ledger if none exists
    const newLedgerData = {
        name: partyData.name,
        groupId: '1.1.2', // Trade Receivables
        nature: 'ASSET',
        type: 'RECEIVABLE',
        status: 'ACTIVE',
        posting: { isPosting: true, normalBalance: 'DEBIT', allowManualJournal: true, isSystem: false },
        openingBalance: { amount: 0, drCr: 'DR', asOf: new Date().toISOString() },
    };
    const newLedgerRef = await addDoc(ledgersRef, newLedgerData);
    await updateDoc(partyRef, { coaLedgerId: newLedgerRef.id });
    return newLedgerRef.id;
}


async function getSystemLedgerId(name: string): Promise<string> {
    const ledgersRef = collection(db, 'coa_ledgers');
    const q = query(ledgersRef, where('name', '==', name), limit(1));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        throw new Error(`System ledger "${name}" not found. Please ensure it exists in your Chart of Accounts.`);
    }
    return querySnapshot.docs[0].id;
}


export const salesService = {
  async createSalesInvoice(companyId: string, input: any, actorUid: string) {
    const inv = salesInvoiceSchema.parse(input);

    const subTotal = round2(inv.items.reduce((s, it) => s + it.qty * it.rate, 0));
    const gstTotal = round2(
      inv.items.reduce((s, it) => s + (it.qty * it.rate * (it.gstRate ?? 0)) / 100, 0)
    );
    const grandTotal = round2(subTotal - inv.discount + inv.shipping + gstTotal);

    const invRef = collection(db, salesPaths.salesInvoices(companyId));
    const invRes = await addDoc(invRef, {
      ...inv,
      companyId,
      subTotal,
      gstTotal,
      grandTotal,
      status: "POSTED",
      createdBy: actorUid,
      createdAt: serverTimestamp(),
    });
    
    // This entire logic is now handled by the onInvoiceCreated Cloud Function for atomicity.
    // The client-side service's only responsibility is to create the initial invoice document.
    
    return invRes.id;
  },
};
