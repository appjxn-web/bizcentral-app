'use client';

import { redirect } from 'next/navigation';
import { useEffect } from 'react';

export default function ShopRedirectPage() {
  useEffect(() => {
    redirect('/');
  }, []);

  return null;
}
