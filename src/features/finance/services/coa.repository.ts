

'use server';

import {
  addDoc,
  collection,
  doc,
  getDoc,
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

export async function getLedger(companyId: string, ledgerId: string) {
    const ref = doc(db, financePaths.coaLedgers(companyId), ledgerId);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listGroups(companyId: string, opts: ListOpts = {}) {
    const ref = collection(db, financePaths.coaGroups(companyId));
    const q = query(ref, orderBy("path", "asc"), limit(opts.take ?? 500));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listLedgers(companyId: string, opts: ListOpts = {}) {
    const ref = collection(db, financePaths.coaLedgers(companyId));
    const q = query(ref, orderBy("name", "asc"), limit(opts.take ?? 2000));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createGroup(companyId: string, input: CoaGroupInput, actorUid: string) {
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
}

export async function updateGroup(companyId: string, groupId: string, patch: Partial<CoaGroupInput>, actorUid: string) {
    const ref = doc(db, financePaths.coaGroups(companyId), groupId);
    await updateDoc(ref, {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
}

export async function createLedger(companyId: string, input: any, actorUid: string) {
    const data = input;
    const ref = collection(db, financePaths.coaLedgers(companyId));
    const res = await addDoc(ref, {
      ...data,
      id: '',
      companyId,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(res, { id: res.id });
    return res.id;
}

export async function deleteGroupSafe(companyId: string, groupId: string) {
    const ledRef = collection(db, financePaths.coaLedgers(companyId));
    const q = query(ledRef, where("groupId", "==", groupId), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) throw new Error("Cannot delete group: ledgers exist in this group.");

    await deleteDoc(doc(db, financePaths.coaGroups(companyId), groupId));
}

export const coaRepository = {
    getLedger,
    listGroups,
    listLedgers,
    createGroup,
    updateGroup,
    createLedger,
    deleteGroupSafe,
};
