
'use client';

import Link from 'next/link';
import { Briefcase, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import * as React from 'react';
import { useUser } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';

export function Header() {
  const { user } = useUser();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(getAuth());
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Briefcase className="h-6 w-6 text-primary" />
          <span className="font-bold">jxnPlus</span>
        </Link>
        <div className="ml-auto flex items-center gap-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="rounded-full">
                   <Avatar>
                      <AvatarImage src={user.photoURL ?? ''} alt={user.displayName || ''} />
                      <AvatarFallback>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="sr-only">Toggle user menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.displayName || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/dashboard">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/dashboard/profiles-settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
             <Button asChild>
                <Link href="/login">
                    <LogIn className="mr-2 h-4 w-4" />
                    Login / Sign Up
                </Link>
             </Button>
          )}
        </div>
    </header>
  );
}
