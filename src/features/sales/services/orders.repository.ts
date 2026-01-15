

'use server';

import { collection, query, where, orderBy, getDocs, updateDoc, doc, type Firestore, type Query, limit, startAfter, type DocumentSnapshot, getCountFromServer, and } from 'firebase/firestore';
import { initializeFirebase } from "@/firebase";
import type { Order, OrderStatus } from '@/lib/types';
import type { UserRole } from '@/features/users/types/users.types';

const { firestore: db } = initializeFirebase();
const collectionRef = collection(db, 'orders');

export async function getOrders(options: { pageLimit?: number, startAfter?: DocumentSnapshot | null, role?: UserRole | null, userId?: string | null } = {}) {
    const { pageLimit = 10, startAfter = null, role, userId } = options;

    let q: Query;

    if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(role || '')) {
        q = query(collectionRef, orderBy('createdAt', 'desc'));
    } else if (role === 'Partner' && userId) {
        q = query(collectionRef, where('assignedToUid', '==', userId), orderBy('createdAt', 'desc'));
    } else if (userId) { // Customer, Employee etc.
        q = query(collectionRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    } else {
        return { newOrders: [], lastVisible: null }; // No user, no data
    }
    
    q = query(q, limit(pageLimit));

    if (startAfter) {
        q = query(q, startAfter(startAfter));
    }
    
    const documentSnapshots = await getDocs(q);
    const newOrders = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    const lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];

    return { newOrders, lastVisible };
}

export async function getOrderCounts() {
    const totalQuery = query(collectionRef);
    const inProcessQuery = query(collectionRef, where('status', 'in', ['Ordered', 'Manufacturing', 'Ready for Dispatch', 'Awaiting Payment', 'Awaiting Payment Confirmation', 'Cancellation Requested']));
    const shippedQuery = query(collectionRef, where('status', '==', 'Shipped'));
    const deliveredQuery = query(collectionRef, where('status', '==', 'Delivered'));

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

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, { status });
}
