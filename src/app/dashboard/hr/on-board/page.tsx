
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { OnboardingBoard } from './_components/onboarding-board';
import type { OnboardingEmployee } from '@/lib/types';
import { useCollection, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';

export default function OnBoardPage() {
  const firestore = useFirestore();
  const { data: onboardingEmployees, loading } = useCollection<OnboardingEmployee>(collection(firestore, 'onboarding'));
    
  return (
    <>
      <PageHeader title="On-boarding" />
      <div className="flex flex-1">
        {loading ? <p>Loading...</p> : <OnboardingBoard initialEmployees={onboardingEmployees || []} />}
      </div>
    </>
  );
}
