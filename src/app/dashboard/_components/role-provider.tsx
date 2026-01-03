'use client';

import * as React from 'react';
import type { UserRole } from '@/lib/types';
import { useRouter, usePathname } from 'next/navigation';

interface RoleContextType {
  realRole: UserRole;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
}

const RoleContext = React.createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({
  children,
  initialRole,
}: {
  children: React.ReactNode;
  initialRole: UserRole;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentRole, setCurrentRoleState] = React.useState<UserRole>(initialRole);

  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);

    // When switching roles, redirect to the corresponding dashboard.
    let newPath: string;
    if (role === 'Admin') {
      newPath = '/dashboard';
    } else if (role === 'Franchisee') {
      newPath = '/dashboard/dashboards/franchise';
    } else {
      newPath = `/dashboard/dashboards/${role.toLowerCase().replace(/\s+/g, '-')}`;
    }

    // Only push if the path is different to avoid redundant navigation
    if (pathname !== newPath) {
      router.push(newPath);
    }
  };

  const value = {
    realRole: initialRole,
    currentRole,
    setCurrentRole,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = React.useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
