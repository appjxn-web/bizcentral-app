'use server';

import { collection, query, where, orderBy, getDocs, updateDoc, doc, type Firestore, type Query } from 'firebase/firestore';
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
    getOrdersQueryForUser(userId: string | null | undefined, role: UserRole | null | undefined): Query | null {
        if (!userId || !role) return null;

        if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(role)) {
            return query(this.collectionRef, orderBy('createdAt', 'desc'));
        }

        if (role === 'Partner') {
            return query(this.collectionRef, where('assignedToUid', '==', userId), orderBy('createdAt', 'desc'));
        }

        // Default for Customers and other roles
        return query(this.collectionRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
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