
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CompanyInfo {
  customHomepageBanner?: {
    desktopImageUrl: string;
    mobileImageUrl: string;
    headline: string;
    subheadline: string;
    headlineStyle?: { bold?: boolean; italic?: boolean };
    subheadlineStyle?: { bold?: boolean; italic?: boolean };
    textAlign?: 'left' | 'center' | 'right';
    textPosition?: 'top' | 'center' | 'bottom';
  };
}

export function HeroBanner() {
  const firestore = useFirestore();
  const companyInfoRef = firestore ? doc(firestore, 'company', 'info') : null;
  const { data: companyInfo, loading } = useDoc<CompanyInfo>(companyInfoRef);

  const banner = companyInfo?.customHomepageBanner;

  const bannerImageUrl = banner?.desktopImageUrl || "https://images.unsplash.com/photo-1522071820081-009f0129c71c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwyfHx0ZWFtJTIwbWVldGluZ3xlbnwwfHx8fDE3MjE4OTc0NDB8MA&ixlib=rb-4.1.0&q=80&w=1920";
  const headline = banner?.headline || 'Welcome to BizCentral';
  const subheadline = banner?.subheadline || 'Your all-in-one solution for modern business management.';

  const positionClasses = {
    top: 'justify-start pt-12',
    center: 'justify-center',
    bottom: 'justify-end pb-12',
  };

  const alignmentClasses = {
    left: 'items-start text-left',
    center: 'items-center text-center',
    right: 'items-end text-right',
  };

  const headlineClasses = cn(
    'text-4xl md:text-6xl font-bold tracking-tight',
    banner?.headlineStyle?.bold && 'font-extrabold',
    banner?.headlineStyle?.italic && 'italic'
  );
  
  const subheadlineClasses = cn(
    'mt-4 text-lg md:text-xl max-w-2xl mx-auto',
     banner?.subheadlineStyle?.bold && 'font-semibold',
     banner?.subheadlineStyle?.italic && 'italic'
  );

  if (loading) {
    return <Skeleton className="relative w-full h-[calc(100vh-4rem)] bg-muted" />;
  }

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-primary/10">
      <Image
        src={bannerImageUrl}
        alt="Team collaborating"
        fill
        className="object-cover"
        priority
      />
      <div className={cn(
          "absolute inset-0 bg-black/50 flex flex-col p-4",
          positionClasses[banner?.textPosition || 'center'],
          alignmentClasses[banner?.textAlign || 'center']
      )}>
        <div className="text-white">
            <h1 className={headlineClasses}>
            {headline}
            </h1>
            <p className={subheadlineClasses}>
            {subheadline}
            </p>
        </div>
      </div>
    </div>
  );
}
