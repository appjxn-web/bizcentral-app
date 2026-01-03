

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Youtube, Instagram, Facebook, Linkedin, Twitter, Briefcase, Mail, Phone, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';

interface CompanyInfo {
  logo?: string;
  companyName?: string;
  socials?: Partial<SocialLinks>;
  contactEmail?: string;
  contactNumber?: string;
  website?: string;
  aboutUs?: string;
}

interface SocialLinks {
  youtube: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  x: string;
}

const AboutUsSection = ({ text }: { text: string }) => {
  if (!text) return null;

  const sections = text.split('\n\n');

  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      {sections.map((section, index) => {
        const lines = section.split('\n');
        return (
          <div key={index}>
            {lines.map((line, lineIndex) => {
              // A simple heuristic: if a line is short and is the only line in its "paragraph" (section), it's a heading.
              if (lines.length === 1 && line.length < 50) {
                return <h5 key={lineIndex} className="font-bold text-card-foreground text-base mt-2">{line}</h5>;
              }
              // Render lists
              if (line.trim().startsWith('✅') || line.trim().startsWith('-')) {
                return <p key={lineIndex} className="flex items-start gap-2">{line}</p>
              }
              return <p key={lineIndex}>{line}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
};


export function Footer() {
  const firestore = useFirestore();
  const companyInfoRef = firestore ? doc(firestore, 'company', 'info') : null;
  const { data: companyInfo } = useDoc<CompanyInfo>(companyInfoRef);

  const logo = companyInfo?.logo || null;
  const companyName = companyInfo?.companyName || 'jxnPlus';
  const socials = companyInfo?.socials || {};
  const contactEmail = companyInfo?.contactEmail || 'contact@example.com';
  const contactNumber = companyInfo?.contactNumber || '+1 (123) 456-7890';
  const website = companyInfo?.website || '#';
  const aboutUs = companyInfo?.aboutUs || 'Empowering businesses with modern solutions.';

  const socialLinks = [
    { name: 'YouTube', href: socials.youtube, icon: Youtube },
    { name: 'Instagram', href: socials.instagram, icon: Instagram },
    { name: 'Facebook', href: socials.facebook, icon: Facebook },
    { name: 'LinkedIn', href: socials.linkedin, icon: Linkedin },
    { name: 'X', href: socials.x, icon: Twitter },
  ].filter(link => link && link.href);

  return (
    <footer className="bg-card text-card-foreground border-t">
      <div className="container mx-auto px-4 md:px-6 py-8">
        <div className="space-y-8">
            {/* About Section */}
            <div className="space-y-4">
                <Link href="/" className="flex items-center gap-2 text-lg font-semibold md:text-base">
                {logo ? (
                    <Image src={logo} alt="Company Logo" width={140} height={32} className="object-contain" />
                ) : (
                    <>
                    <Briefcase className="h-6 w-6 text-primary" />
                    <span className="font-bold">{companyName}</span>
                    </>
                )}
                </Link>
                <AboutUsSection text={aboutUs} />
            </div>

            <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
                {/* Quick Links */}
                <div className="space-y-4">
                    <h4 className="font-semibold">Quick Links</h4>
                    <ul className="space-y-2 text-sm">
                    <li><Link href="/" className="text-muted-foreground hover:text-primary">Home</Link></li>
                    <li><Link href="/dashboard" className="text-muted-foreground hover:text-primary">Login</Link></li>
                    <li><Link href="/cart" className="text-muted-foreground hover:text-primary">Cart</Link></li>
                    <li><Link href="/dashboard/help" className="text-muted-foreground hover:text-primary">Support</Link></li>
                    </ul>
                </div>

                {/* Contact Us */}
                <div className="space-y-4">
                    <h4 className="font-semibold">Contact Us</h4>
                    <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <a href={`mailto:${contactEmail}`} className="hover:text-primary">{contactEmail}</a>
                    </li>
                    <li className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <a href={`tel:${contactNumber}`} className="hover:text-primary">{contactNumber}</a>
                    </li>
                    <li className="flex items-center gap-2 text-muted-foreground">
                        <Globe className="h-4 w-4" />
                        <a href={website} target="_blank" rel="noopener noreferrer" className="hover:text-primary">{website}</a>
                    </li>
                    </ul>
                </div>

                {/* Social Media */}
                <div className="space-y-4">
                    <h4 className="font-semibold">Follow Us</h4>
                    {socialLinks.length > 0 ? (
                        <div className="flex space-x-2">
                            {socialLinks.map(link => (
                                <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                                    <link.icon className="h-5 w-5" />
                                    <span className="sr-only">{link.name}</span>
                                </a>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No social media links configured yet.</p>
                    )}
                </div>
            </div>
        </div>
        <div className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {companyName}. All Rights Reserved.
        </div>
      </div>
    </footer>
  );
}
