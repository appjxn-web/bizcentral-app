
"use client";

import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { salesPaths } from "@/firebase/paths";
import { salesInvoiceSchema, type SalesInvoiceInput } from "../schemas/sales.schema";

const { firestore: db } = initializeFirebase();

export const salesInvoiceDraftRepo = {
  async createDraft(companyId: string, input: SalesInvoiceInput, actorUid: string) {
    const data = salesInvoiceSchema.parse(input);

    const ref = collection(db, salesPaths.salesInvoices(companyId));
    const res = await addDoc(ref, {
      ...data,
      companyId,
      status: "DRAFT",
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
    // Set the document ID inside the document itself
    await updateDoc(res, { id: res.id });
    return res.id;
  },

  async updateDraft(companyId: string, invoiceId: string, input: SalesInvoiceInput, actorUid: string) {
    const data = salesInvoiceSchema.parse(input);
    const ref = doc(db, salesPaths.salesInvoices(companyId), invoiceId);
    await updateDoc(ref, {
      ...data,
      status: "DRAFT", // Ensure it stays as DRAFT on update
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
  },
};
