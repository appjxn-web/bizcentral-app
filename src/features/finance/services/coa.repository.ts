
'use server';

import { collection, query, orderBy, getDocs, type Firestore } from 'firebase/firestore';
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
}

export const coaRepository = new CoaRepository();
