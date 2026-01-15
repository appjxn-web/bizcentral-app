

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
import { coaGroupSchema, coaLedgerSchema, type CoaGroupInput, type CoaLedgerInput } from "../schemas/coa.schema";

type ListOpts = { take?: number };

const { firestore: db } = initializeFirebase();

async function getLedger(ledgerId: string) {
    const ref = doc(db, `coa_ledgers/${ledgerId}`);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function listGroups(opts: ListOpts = {}) {
    const ref = collection(db, `coa_groups`);
    const q = query(ref, orderBy("path", "asc"), limit(opts.take ?? 500));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listLedgers(opts: ListOpts = {}) {
    const ref = collection(db, `coa_ledgers`);
    const q = query(ref, orderBy("name", "asc"), limit(opts.take ?? 2000));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function createGroup(input: CoaGroupInput, actorUid: string) {
    const data = coaGroupSchema.parse(input);
    const ref = collection(db, `coa_groups`);
    const res = await addDoc(ref, {
      ...data,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return res.id;
}

async function updateGroup(groupId: string, patch: Partial<CoaGroupInput>, actorUid: string) {
    const ref = doc(db, `coa_groups`, groupId);
    await updateDoc(ref, {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
}

async function createLedger(input: any, actorUid: string) {
    const data = input;
    const ref = collection(db, `coa_ledgers`);
    const res = await addDoc(ref, {
      ...data,
      id: '',
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(res, { id: res.id });
    return res.id;
}

async function deleteGroupSafe(groupId: string) {
    const ledRef = collection(db, `coa_ledgers`);
    const q = query(ledRef, where("groupId", "==", groupId), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) throw new Error("Cannot delete group: ledgers exist in this group.");

    await deleteDoc(doc(db, `coa_groups`, groupId));
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
