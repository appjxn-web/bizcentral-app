

'use server';

import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  where,
  limit,
} from "firebase/firestore";
import { initializeFirebase } from "@/firebase"; 
import { financePaths } from "@/firebase/paths";
import { coaGroupSchema, coaLedgerSchema, type CoaGroupInput, type CoaLedgerInput } from "../schemas/coa.schema";

type ListOpts = { take?: number };

const { firestore: db } = initializeFirebase();

export const coaRepo = {
  async listGroups(companyId: string, opts: ListOpts = {}) {
    const ref = collection(db, financePaths.coaGroups(companyId));
    const q = query(ref, orderBy("name", "asc"), limit(opts.take ?? 500));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async listLedgers(companyId: string, opts: ListOpts = {}) {
    const ref = collection(db, financePaths.coaLedgers(companyId));
    const q = query(ref, orderBy("name", "asc"), limit(opts.take ?? 2000));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async createGroup(companyId: string, input: CoaGroupInput, actorUid: string) {
    const data = coaGroupSchema.parse(input);
    const ref = collection(db, financePaths.coaGroups(companyId));
    const res = await addDoc(ref, {
      ...data,
      companyId,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return res.id;
  },

  async updateGroup(companyId: string, groupId: string, patch: Partial<CoaGroupInput>, actorUid: string) {
    // validate by merging is safer; keep simple for now:
    const ref = doc(db, financePaths.coaGroups(companyId), groupId);
    await updateDoc(ref, {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
  },

  async createLedger(companyId: string, input: CoaLedgerInput, actorUid: string) {
    const data = coaLedgerSchema.parse(input);
    const ref = collection(db, financePaths.coaLedgers(companyId));
    const res = await addDoc(ref, {
      ...data,
      companyId,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return res.id;
  },

  async deleteGroupSafe(companyId: string, groupId: string) {
    // Rule: cannot delete group if any ledgers exist in it
    const ledRef = collection(db, financePaths.coaLedgers(companyId));
    const q = query(ledRef, where("groupId", "==", groupId), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) throw new Error("Cannot delete group: ledgers exist in this group.");

    await deleteDoc(doc(db, financePaths.coaGroups(companyId), groupId));
  },
};
