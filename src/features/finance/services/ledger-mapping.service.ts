

'use server';

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { coaRepository } from "@/features/finance/services/coa.repository";
import { financeSettingsRepo } from "./finance-settings.repo";
import { initializeFirebase } from "@/firebase";
import type { Party, CoaLedger, CoaNature } from '@/lib/types';

const { firestore: db } = initializeFirebase();

const customerDoc = (customerId: string) =>
  doc(db, `parties/${customerId}`);

/**
 * Returns ledger IDs required to post a SALES INVOICE.
 * - Ensures customer has a Party ledger (creates it if missing).
 * - Loads finance defaults for sales + gst output ledgers.
 */
export const ledgerMappingService = {
  async resolveForSalesInvoice(customerId: string, actorUid: string) {
    const settings = await financeSettingsRepo.get();
    if (!settings?.defaultSalesLedgerId || !settings?.defaultGstOutputLedgerId) {
      throw new Error("Finance settings missing: set default Sales Ledger and GST Output Ledger first.");
    }

    const csnap = await getDoc(customerDoc(customerId));
    if (!csnap.exists()) throw new Error("Customer not found.");

    const c = csnap.data() as Party;
    let partyLedgerId: string | undefined = c.coaLedgerId;

    if (!partyLedgerId) {
      const customerName = (c.name ?? "Customer").toString();
      
      const SUNDRY_DEBTORS_GROUP_ID = "1.1.2"; 

      partyLedgerId = await coaRepository.createLedger(
        {
          name: customerName,
          groupId: SUNDRY_DEBTORS_GROUP_ID,
          type: "RECEIVABLE",
          nature: 'ASSET',
          posting: {
            isPosting: true,
            normalBalance: 'DEBIT',
            isSystem: false,
            allowManualJournal: true
          },
          status: 'ACTIVE'
        },
        actorUid
      );

      await updateDoc(customerDoc(customerId), {
        coaLedgerId: partyLedgerId,
        updatedAt: new Date(),
      });
    }

    return {
      arLedgerId: partyLedgerId!,
      salesLedgerId: settings.defaultSalesLedgerId,
      gstOutputLedgerId: settings.defaultGstOutputLedgerId,
      cashLedgerId: settings.defaultCashLedgerId,
      bankLedgerId: settings.defaultBankLedgerId,
    };
  },
};
