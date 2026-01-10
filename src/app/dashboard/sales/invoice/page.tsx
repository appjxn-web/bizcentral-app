

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection } from '@/firebase';
import { useRole } from '../../_components/role-provider';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { SalesInvoice } from '@/lib/types';
import * as React from 'react';

function InvoicePageContent() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();
  const { currentRole } = useRole();

  const invoicesQuery = React.useMemo(() => {
    if (!user || !currentRole) return null;
    const invoicesRef = collection(firestore, 'salesInvoices');

    // 1. Admins see all
    if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(currentRole)) {
        return query(invoicesRef, orderBy('date', 'desc'));
    }

    // 2. Partners see only assigned
    if (currentRole === 'Partner') {
        return query(
            invoicesRef, 
            where('assignedToUid', '==', user.uid),
            orderBy('date', 'desc')
        );
    }

    // 3. Customers see only their own
    return query(
        invoicesRef, 
        where('customerId', '==', user.uid),
        orderBy('date', 'desc')
    );
  }, [user, currentRole, firestore]);
  
  const { data: invoices, loading } = useCollection<SalesInvoice>(invoicesQuery);

  // This is a simplified redirect, you might want a loading state
  if (!loading && (!invoices || invoices.length === 0)) {
     // You can add a message here for no invoices
  }

  useEffect(() => {
    router.replace('/dashboard/sales/orders');
  }, [router]);

  return null; 
}


export default function RedirectPage() {
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
      setIsClient(true);
  }, []);

  if (!isClient) {
      return null;
  }

  return <InvoicePageContent />;
}
