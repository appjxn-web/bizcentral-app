
'use server';

import { collection, query, where, orderBy, getDocs, updateDoc, doc, type Firestore, type Query, limit, startAfter, type DocumentSnapshot, getCountFromServer, and } from 'firebase/firestore';
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

    async getOrders(options: { pageLimit?: number, startAfter?: DocumentSnapshot | null, role?: UserRole | null, userId?: string | null } = {}) {
        const { pageLimit = 10, startAfter = null, role, userId } = options;

        let q: Query;

        if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(role || '')) {
            q = query(this.collectionRef, orderBy('createdAt', 'desc'), limit(pageLimit));
        } else if (role === 'Partner' && userId) {
            q = query(this.collectionRef, where('assignedToUid', '==', userId), orderBy('createdAt', 'desc'), limit(pageLimit));
        } else if (userId) { // Customer, Employee etc.
            q = query(this.collectionRef, where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(pageLimit));
        } else {
            return { newOrders: [], lastVisible: null }; // No user, no data
        }
        
        if (startAfter) {
            q = query(q, startAfter(startAfter));
        }
        
        const documentSnapshots = await getDocs(q);
        const newOrders = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        const lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];

        return { newOrders, lastVisible };
    }

    async getOrderCounts() {
        const totalQuery = query(this.collectionRef);
        const inProcessQuery = query(this.collectionRef, where('status', 'in', ['Ordered', 'Manufacturing', 'Ready for Dispatch', 'Awaiting Payment', 'Awaiting Payment Confirmation', 'Cancellation Requested']));
        const shippedQuery = query(this.collectionRef, where('status', '==', 'Shipped'));
        const deliveredQuery = query(this.collectionRef, where('status', '==', 'Delivered'));

        const [totalSnap, inProcessSnap, shippedSnap, deliveredSnap] = await Promise.all([
            getCountFromServer(totalQuery),
            getCountFromServer(inProcessQuery),
            getCountFromServer(shippedQuery),
            getCountFromServer(deliveredQuery),
        ]);

        return {
            total: totalSnap.data().count,
            inProcess: inProcessSnap.data().count,
            shipped: shippedSnap.data().count,
            delivered: deliveredSnap.data().count,
        };
    }
    
    async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
        const orderRef = doc(this.db, 'orders', orderId);
        await updateDoc(orderRef, { status });
    }
}

export const ordersRepository = new OrdersRepository();
