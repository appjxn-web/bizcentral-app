

'use server';

import { addDoc, collection, serverTimestamp, getDocs, query, where, doc } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { salesPaths } from "@/firebase/paths";
import { salesInvoiceSchema, type SalesInvoiceInput } from "../schemas/sales.schema";
import { inventoryRepo } from "@/features/inventory/services/inventory.repo";
import { postingService } from "@/features/finance/services/posting.service";
import type { Party, CoaLedger } from "@/lib/types";

const { firestore: db } = initializeFirebase();

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export const salesService = {
  async createSalesInvoice(companyId: string, input: SalesInvoiceInput, actorUid: string) {
    const inv = salesInvoiceSchema.parse(input);

    const subTotal = round2(inv.items.reduce((s, it) => s + it.qty * it.rate, 0));
    const gstTotal = round2(
      inv.items.reduce((s, it) => s + (it.qty * it.rate * (it.gstRate ?? 0)) / 100, 0)
    );
    const grandTotal = round2(subTotal - inv.discount + inv.shipping + gstTotal);

    // This is now handled by the onInvoiceCreated Cloud Function
    const invRef = collection(db, salesPaths.salesInvoices(companyId));
    const invRes = await addDoc(invRef, {
      ...inv,
      companyId,
      subTotal,
      gstTotal,
      grandTotal,
      status: "POSTED", // Or perhaps "PENDING_PROCESSING"
      createdBy: actorUid,
      createdAt: serverTimestamp(),
    });

    return invRes.id;
  },
};


    