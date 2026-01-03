
'use client';

import * as React from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme-provider';
import { usePathname } from 'next/navigation';
import { Header } from '@/app/dashboard/header';
import { FloatingSocials } from './_components/floating-socials';
import { Footer } from './_components/footer';
import { FirebaseClientProvider } from '@/firebase';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    const pathname = usePathname();
    const isDashboard = pathname.startsWith('/dashboard');
    const isAuthPage = pathname === '/login' || pathname === '/signup';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
          <title>BizCentral</title>
          <meta name="description" content="A comprehensive mobile app for business management" />
          <link rel="icon" href="/icon.svg" type="image/svg+xml" />
          <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          fontSans.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <FirebaseClientProvider>
              {isDashboard ? (
                <>{children}</>
              ) : (
                  <div className="flex min-h-screen w-full flex-col">
                      <Header showSidebarTrigger={false} />
                      <main className="flex-1">
                          {children}
                      </main>
                      {!isAuthPage && <FloatingSocials />}
                      {!isAuthPage && <Footer />}
                  </div>
              )}
            <Toaster />
          </FirebaseClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
