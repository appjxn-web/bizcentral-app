
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

    // totals
    const subTotal = round2(inv.items.reduce((s, it) => s + it.qty * it.rate, 0));
    const gstTotal = round2(
      inv.items.reduce((s, it) => s + (it.qty * it.rate * (it.gstRate ?? 0)) / 100, 0)
    );
    const grandTotal = round2(subTotal - inv.discount + inv.shipping + gstTotal);

    // 1) create invoice doc
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

    // 2) stock movements (SALES_OUT per item)
    await Promise.all(
      inv.items.map((it) =>
        inventoryRepo.addMovement(
          companyId,
          {
            type: "SALES_OUT",
            productId: it.productId,
            warehouseId: inv.warehouseId,
            qty: it.qty,
            refType: "SALES_INVOICE",
            refId: invRes.id,
            note: inv.invoiceNo,
          },
          actorUid
        )
      )
    );
    
    // 3) accounting posting (voucher -> journal_entries)
    const partiesSnap = await getDocs(query(collection(db, 'parties'), where('id', '==', inv.customerId)));
    const customerParty = partiesSnap.docs[0]?.data() as Party | undefined;
    const coaLedgersSnap = await getDocs(collection(db, 'coa_ledgers'));
    const coaLedgers = coaLedgersSnap.docs.map(d => d.data() as CoaLedger);

    const arLedgerId = customerParty?.coaLedgerId;
    const salesLedgerId = coaLedgers.find(l => l.name === 'Sales – Domestic')?.id;
    const gstOutputLedgerId = coaLedgers.find(l => l.name === 'Output GST – CGST')?.id; // Simplified

    if (!arLedgerId || !salesLedgerId || !gstOutputLedgerId) {
        throw new Error("One or more critical ledgers (Accounts Receivable, Sales, GST Output) could not be found.");
    }

    await postingService.postVoucher(
      companyId,
      {
        voucherType: "SALES_INVOICE",
        voucherDate: inv.invoiceDate,
        refNo: inv.invoiceNo,
        narration: inv.note ?? `Sales to ${customerParty?.name}`,
        lines: [
          { ledgerId: arLedgerId, dr: grandTotal, cr: 0, narration: "Sales Invoice" },
          { ledgerId: salesLedgerId, dr: 0, cr: subTotal - inv.discount + inv.shipping, narration: "Sales Revenue" },
          { ledgerId: gstOutputLedgerId, dr: 0, cr: gstTotal, narration: "GST Output" },
        ],
      },
      actorUid
    );

    return invRes.id;
  },
};
