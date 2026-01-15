
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // This page has been removed, redirect to the main partner dashboard
    router.replace('/dashboard/dashboards/partner');
  }, [router]);

  return null; 
}
