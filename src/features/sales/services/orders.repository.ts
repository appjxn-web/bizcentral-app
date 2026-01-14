
'use server';

import { collection, query, where, orderBy, getDocs, updateDoc, doc, type Firestore, type Query, limit, startAfter, typeDocumentSnapshot } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Order, OrderStatus } from '@/lib/types';
import type { UserRole } from '@/features/users/types/users.types';

class OrdersRepository {
    private db: Firestore;
    private collectionRef;

    constructor() {
        const { firestore } = initializeFirebase();
        this.db = firestore;
        this.collectionRef = collection(this.db, 'orders');
    }

    /**
     * Builds a Firestore query for orders based on the user's role and ID.
     * This is intended to be used with a hook like useCollection.
     * @param userId - The ID of the current user.
     * @param role - The role of the current user.
     * @returns A Firestore Query object or null if no user is provided.
     */
    getOrdersQueryForUser(
      userId: string | null | undefined, 
      role: UserRole | null | undefined,
      options: { pageLimit?: number, lastDoc?: DocumentSnapshot } = {}
    ): Query | null {
        if (!userId || !role) return null;

        const { pageLimit = 10, lastDoc } = options;

        let q: Query;

        if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(role)) {
            q = query(this.collectionRef, orderBy('createdAt', 'desc'), limit(pageLimit));
        } else if (role === 'Partner') {
            q = query(this.collectionRef, where('assignedToUid', '==', userId), orderBy('createdAt', 'desc'), limit(pageLimit));
        } else {
            // Default for Customers and other roles
            q = query(this.collectionRef, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(pageLimit));
        }
        
        if (lastDoc) {
            q = query(q, startAfter(lastDoc));
        }
        
        return q;
    }
    
    /**
     * Updates the status of a specific order.
     * @param orderId - The ID of the order to update.
     * @param status - The new status to set.
     */
    async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
        const orderRef = doc(this.db, 'orders', orderId);
        await updateDoc(orderRef, { status });
    }
}

export const ordersRepository = new OrdersRepository();

