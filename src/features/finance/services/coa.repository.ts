
'use server';

import { collection, query, orderBy, getDocs, type Firestore, doc, deleteDoc, addDoc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { CoaGroup, CoaLedger } from '@/features/finance/types/finance.types';

/**
 * Repository for managing Chart of Accounts data.
 */
class CoaRepository {
    private db: Firestore;
    private groupsCollection;
    private ledgersCollection;

    constructor() {
        const { firestore } = initializeFirebase();
        this.db = firestore;
        this.groupsCollection = collection(this.db, 'coa_groups');
        this.ledgersCollection = collection(this.db, 'coa_ledgers');
    }

    /**
     * Retrieves all Chart of Account groups, ordered by path.
     */
    async listGroups(): Promise<CoaGroup[]> {
        const q = query(this.groupsCollection, orderBy('path'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoaGroup));
    }

    /**
     * Retrieves all Chart of Account ledgers.
     */
    async listLedgers(): Promise<CoaLedger[]> {
        const snapshot = await getDocs(this.ledgersCollection);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoaLedger));
    }

    /**
     * Checks if a group has any child groups or ledgers.
     * @param groupId The ID of the group to check.
     */
    async groupHasChildren(groupId: string): Promise<boolean> {
        const childGroupsQuery = query(this.groupsCollection, where('parentId', '==', groupId), limit(1));
        const childLedgersQuery = query(this.ledgersCollection, where('groupId', '==', groupId), limit(1));
        
        const [childGroupsSnap, childLedgersSnap] = await Promise.all([
            getDocs(childGroupsQuery),
            getDocs(childLedgersQuery)
        ]);

        return !childGroupsSnap.empty || !childLedgersSnap.empty;
    }

    /**
     * Deletes a document from either groups or ledgers collection.
     * @param type - Specifies whether to delete a 'group' or a 'ledger'.
     * @param id - The ID of the document to delete.
     */
    async delete(type: 'group' | 'ledger', id: string): Promise<void> {
        const collectionRef = type === 'group' ? this.groupsCollection : this.ledgersCollection;
        await deleteDoc(doc(collectionRef, id));
    }

    async createLedger(data: Partial<CoaLedger>): Promise<void> {
        await addDoc(this.ledgersCollection, data);
    }
    
    async updateLedger(id: string, data: Partial<CoaLedger>): Promise<void> {
        await updateDoc(doc(this.ledgersCollection, id), data);
    }

    async createGroup(data: Partial<CoaGroup>): Promise<void> {
         const newGroupData = {
          ...data,
          isSystem: false,
          isActive: true,
          reporting: { statement: ['INCOME', 'EXPENSE'].includes(data.nature as string) ? 'PL' : 'BS' },
          allowLedgerPosting: false,
        };
        await addDoc(this.groupsCollection, newGroupData);
    }

    async updateGroup(id: string, data: Partial<CoaGroup>): Promise<void> {
        await updateDoc(doc(this.groupsCollection, id), data);
    }
}

export const coaRepository = new CoaRepository();
