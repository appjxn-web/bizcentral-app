
'use client';

import * as React from 'react';
import { useFirestore } from '@/firebase';
import { writeBatch, collection, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Database } from 'lucide-react';
import { defaultCoaGroups, defaultCoaLedgers } from '@/lib/coa-data';

export function SeedDatabaseButton() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSeeding, setIsSeeding] = React.useState(false);

  const handleSeedDatabase = async () => {
    setIsSeeding(true);
    toast({ title: 'Database Seeding Started', description: 'Populating Firestore with initial data...' });

    try {
      const batch = writeBatch(firestore);

      // 1. Seed Chart of Account Groups
      const groupsCollection = collection(firestore, 'coa_groups');
      defaultCoaGroups.forEach(group => {
        const groupRef = doc(groupsCollection, group.id);
        const path = group.parentId 
            ? `${defaultCoaGroups.find(g => g.id === group.parentId)?.path}.${group.name.toLowerCase().replace(/ /g, '-')}` 
            : group.name.toLowerCase().replace(/ /g, '-');
        
        batch.set(groupRef, { ...group, path, createdAt: new Date(), updatedAt: new Date() });
      });
      
      // 2. Seed Chart of Account Ledgers
      const ledgersCollection = collection(firestore, 'coa_ledgers');
      defaultCoaLedgers.forEach(ledger => {
          const ledgerRef = doc(ledgersCollection, ledger.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase());
          batch.set(ledgerRef, { ...ledger, id: ledgerRef.id, createdAt: new Date(), updatedAt: new Date() });
      });

      // 3. Seed initial company info
      const companyInfoRef = doc(firestore, 'company', 'info');
      batch.set(companyInfoRef, {
        companyName: 'Your Company Name',
        aboutUs: 'Your company description goes here.',
        contactEmail: 'contact@example.com',
        contactNumber: '+91-1234567890',
        website: 'https://example.com',
        addresses: [],
        socials: {},
      }, { merge: true });

      await batch.commit();

      toast({
        title: 'Seeding Complete',
        description: 'Your database has been populated with default data.',
      });

    } catch (error) {
      console.error('Error seeding database:', error);
      toast({
        variant: 'destructive',
        title: 'Seeding Failed',
        description: 'Could not populate the database. Check the console for errors.',
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <Button onClick={handleSeedDatabase} disabled={isSeeding}>
      {isSeeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
      Seed Database
    </Button>
  );
}
