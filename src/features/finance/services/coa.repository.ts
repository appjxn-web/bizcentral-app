

'use server';

import { collection, query, orderBy, getDocs, type Firestore, doc, deleteDoc, addDoc, updateDoc, where, limit } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { pathCoaGroups, pathCoaLedgers } from '@/firebase/paths';
import type { CoaGroup, CoaLedger } from '@/features/finance/types/finance.types';

/**
 * Repository for managing Chart of Accounts data within a specific company.
 */
class CoaRepository {
    private db: Firestore;

    constructor() {
        const { firestore } = initializeFirebase();
        this.db = firestore;
    }

    private getGroupsCollection(companyId: string) {
        return collection(this.db, pathCoaGroups(companyId));
    }

    private getLedgersCollection(companyId: string) {
        return collection(this.db, pathCoaLedgers(companyId));
    }

    /**
     * Retrieves all Chart of Account groups for a company, ordered by path.
     */
    async listGroups(companyId: string): Promise<CoaGroup[]> {
        const q = query(this.getGroupsCollection(companyId), orderBy('path'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoaGroup));
    }

    /**
     * Retrieves all Chart of Account ledgers for a company.
     */
    async listLedgers(companyId: string): Promise<CoaLedger[]> {
        const snapshot = await getDocs(this.getLedgersCollection(companyId));
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoaLedger));
    }

    /**
     * Checks if a group has any child groups or ledgers.
     * @param companyId The ID of the company.
     * @param groupId The ID of the group to check.
     */
    async groupHasChildren(companyId: string, groupId: string): Promise<boolean> {
        const childGroupsQuery = query(this.getGroupsCollection(companyId), where('parentId', '==', groupId), limit(1));
        const childLedgersQuery = query(this.getLedgersCollection(companyId), where('groupId', '==', groupId), limit(1));
        
        const [childGroupsSnap, childLedgersSnap] = await Promise.all([
            getDocs(childGroupsQuery),
            getDocs(childLedgersQuery)
        ]);

        return !childGroupsSnap.empty || !childLedgersSnap.empty;
    }

    /**
     * Deletes a document from either groups or ledgers collection.
     * @param companyId The ID of the company.
     * @param type - Specifies whether to delete a 'group' or a 'ledger'.
     * @param id - The ID of the document to delete.
     */
    async delete(companyId: string, type: 'group' | 'ledger', id: string): Promise<void> {
        const collectionRef = type === 'group' 
            ? this.getGroupsCollection(companyId) 
            : this.getLedgersCollection(companyId);
        await deleteDoc(doc(collectionRef, id));
    }

    async createLedger(companyId: string, data: Partial<CoaLedger>): Promise<void> {
        await addDoc(this.getLedgersCollection(companyId), data);
    }
    
    async updateLedger(companyId: string, id: string, data: Partial<CoaLedger>): Promise<void> {
        await updateDoc(doc(this.getLedgersCollection(companyId), id), data);
    }

    async createGroup(companyId: string, data: Partial<CoaGroup>): Promise<void> {
         const newGroupData = {
          ...data,
          isSystem: false,
          isActive: true,
          reporting: { statement: ['INCOME', 'EXPENSE'].includes(data.nature as string) ? 'PL' : 'BS' },
          allowLedgerPosting: false,
        };
        await addDoc(this.getGroupsCollection(companyId), newGroupData);
    }

    async updateGroup(companyId: string, id: string, data: Partial<CoaGroup>): Promise<void> {
        await updateDoc(doc(this.getGroupsCollection(companyId), id), data);
    }
}

export const coaRepository = new CoaRepository();
