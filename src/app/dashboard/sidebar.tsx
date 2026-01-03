'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  ChevronDown,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { navItems as allNavItems } from '@/lib/nav-items';
import { hasPermission } from '@/lib/permissions';
import { useRole } from './_components/role-provider';
import type { UserRole } from '@/lib/types';


export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile } = useSidebar();
  const { currentRole, setCurrentRole } = useRole();
  
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const navItems = React.useMemo(() => {
    const filterItems = (items: any[]): any[] => {
        return items.map(item => {
            if (!hasPermission(currentRole, item.id)) {
                return null;
            }
            if (item.items) {
                const visibleSubItems = filterItems(item.items);
                if (visibleSubItems.length === 0) {
                    return null;
                }
                return { ...item, items: visibleSubItems };
            }
            return item;
        }).filter(Boolean);
    };

    return filterItems(allNavItems);
  }, [currentRole]);
  
  return (
    <Sidebar collapsible="icon" variant={isMobile ? "sidebar" : "inset"}>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="shrink-0">
             <Briefcase className="h-5 w-5 text-primary" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">BizCentral</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
        {navItems.map((item) => (
            item.href ? (
                <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className="justify-start"
                    >
                    <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ) : (
            <Collapsible key={item.id} open={openSections[item.id]} onOpenChange={() => toggleSection(item.id)}>
                <CollapsibleTrigger asChild>
                <SidebarMenuButton variant="ghost" className="w-full justify-start">
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform duration-200", openSections[item.id] && "rotate-180")} />
                </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenu className="pl-6">
                    {item.items?.map((subItem) => (
                        <SidebarMenuItem key={subItem.id}>
                          {item.id === 'switch-dashboard' ? (
                            <SidebarMenuButton
                                size="sm"
                                tooltip={subItem.label}
                                className="justify-start w-full"
                                onClick={() => setCurrentRole(subItem.role as UserRole)}
                            >
                                <subItem.icon className="h-3.5 w-3.5" />
                                <span>{subItem.label}</span>
                            </SidebarMenuButton>
                          ) : (
                            <SidebarMenuButton
                                asChild
                                size="sm"
                                isActive={pathname === subItem.href}
                                tooltip={subItem.label}
                                className="justify-start"
                            >
                                <Link href={subItem.href!}>
                                    <subItem.icon className="h-3.5 w-3.5" />
                                    <span>{subItem.label}</span>
                                </Link>
                            </SidebarMenuButton>
                          )}
                        </SidebarMenuItem>
                    ))}
                    </SidebarMenu>
                </CollapsibleContent>
            </Collapsible>
            )
        ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
