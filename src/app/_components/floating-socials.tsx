

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Youtube, Instagram, Facebook, Linkedin, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';

interface SocialLinks {
  youtube: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  x: string;
}

export function FloatingSocials() {
  const firestore = useFirestore();
  const companyInfoRef = firestore ? doc(firestore, 'company', 'info') : null;
  const { data: companyInfo } = useDoc<{ socials: Partial<SocialLinks> }>(companyInfoRef);

  const socialLinks = companyInfo?.socials ? [
    { name: 'YouTube', href: companyInfo.socials.youtube, icon: Youtube },
    { name: 'Instagram', href: companyInfo.socials.instagram, icon: Instagram },
    { name: 'Facebook', href: companyInfo.socials.facebook, icon: Facebook },
    { name: 'LinkedIn', href: companyInfo.socials.linkedin, icon: Linkedin },
    { name: 'X', href: companyInfo.socials.x, icon: Twitter },
  ].filter(link => link.href) : [];

  if (socialLinks.length === 0) {
    return null;
  }

  return (
    <div className="fixed left-4 bottom-4 z-50 flex flex-col gap-2">
      <TooltipProvider>
        {socialLinks.map(link => (
          <Tooltip key={link.name}>
            <TooltipTrigger asChild>
              <Button asChild variant="outline" size="icon" className="rounded-full shadow-lg">
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  <link.icon className="h-5 w-5" />
                  <span className="sr-only">{link.name}</span>
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Follow us on {link.name}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
}
