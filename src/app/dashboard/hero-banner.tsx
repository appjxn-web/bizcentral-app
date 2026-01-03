

'use client';

import Image from 'next/image';
import React from 'react';
import { useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';

interface CompanyInfo {
  customHomepageBanner?: { desktopImageUrl: string; mobileImageUrl: string; };
}

export function HeroBanner() {
  const firestore = useFirestore();
  const companyInfoRef = doc(firestore, 'company', 'info');
  const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(companyInfoRef);
  
  const [bannerData, setBannerData] = React.useState<{ desktopImageUrl: string; mobileImageUrl: string; } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!companyInfoLoading) {
      if (companyInfo?.customHomepageBanner?.desktopImageUrl && companyInfo.customHomepageBanner.mobileImageUrl) {
        setBannerData(companyInfo.customHomepageBanner);
      } else {
        // Fallback to a default banner if no custom one is set
        setBannerData({
          desktopImageUrl: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMGJsdWUlMjBwdXJwbGV8ZW58MHx8fHwxNzE3MDk0Mjk4fDA&ixlib=rb-4.1.0&q=80&w=1920',
          mobileImageUrl: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMGJsdWUlMjBwdXJwbGV8ZW58MHx8fHwxNzE3MDk0Mjk4fDA&ixlib=rb-4.1.0&q=80&w=1080',
        });
      }
      setIsLoading(false);
    }
  }, [companyInfo, companyInfoLoading]);


  if (isLoading || !bannerData) {
    return <div className="relative w-full h-[calc(100vh-4rem)] bg-muted animate-pulse" />;
  }

  const { desktopImageUrl, mobileImageUrl } = bannerData;

  return (
    <div className="relative w-full h-[calc(100vh-4rem)]">
      <picture>
        <source media="(max-width: 768px)" srcSet={mobileImageUrl} />
        <source media="(min-width: 769px)" srcSet={desktopImageUrl} />
        <Image
            src={desktopImageUrl}
            alt="Welcome banner"
            fill
            priority
            className="object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
        <div className="text-center text-white p-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Welcome to BizCentral
          </h1>
          <p className="mt-4 text-lg md:text-xl max-w-2xl mx-auto">
            Your all-in-one solution for modern business management.
          </p>
        </div>
      </div>
    </div>
  );
}
