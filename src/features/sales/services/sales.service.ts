'use server';

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { salesPaths } from "@/firebase/paths";
import { salesInvoiceSchema, type SalesInvoiceInput } from "../schemas/sales.schema";
import { inventoryRepo } from "@/features/inventory/services/inventory.repo";
import { postingService } from "@/features/finance/services/posting.service";

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
    // NOTE: You must map these ledgerIds from your COA:
    // - customer AR ledger (customerId -> party ledger)
    // - sales ledger
    // - gst output ledger
    const AR_LEDGER_ID = "SET_ME_AR_LEDGER_ID";
    const SALES_LEDGER_ID = "SET_ME_SALES_LEDGER_ID";
    const GST_OUTPUT_LEDGER_ID = "SET_ME_GST_OUTPUT_LEDGER_ID";

    await postingService.postVoucher(
      companyId,
      {
        voucherType: "SALES_INVOICE",
        voucherDate: inv.invoiceDate,
        refNo: inv.invoiceNo,
        narration: inv.note ?? ``,
        lines: [
          { ledgerId: AR_LEDGER_ID, dr: grandTotal, cr: 0, narration: "Sales Invoice" },
          { ledgerId: SALES_LEDGER_ID, dr: 0, cr: subTotal - inv.discount + inv.shipping, narration: "Sales" },
          { ledgerId: GST_OUTPUT_LEDGER_ID, dr: 0, cr: gstTotal, narration: "GST Output" },
        ],
      },
      actorUid
    );

    return invRes.id;
  },
};
