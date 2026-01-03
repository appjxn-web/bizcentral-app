'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  Home,
  Package,
  ShoppingCart,
  Users,
  Search,
  Settings,
  LifeBuoy,
  Box,
  Building,
  ChevronDown,
  Target,
  FileText,
  Factory,
  Wrench,
  ShieldCheck,
  Landmark,
  CreditCard,
  Banknote,
  Book,
  ClipboardList,
  PieChart,
  PackageCheck,
  CheckCircle,
  TrendingUp,
  UserPlus,
  UserMinus,
  CalendarCheck,
  Handshake,
  Store,
  Building2,
  UserCheck,
  UserCog,
  Warehouse,
  UserSquare,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckCheck,
  AlertTriangle,
} from 'lucide-react';
import Image from 'next/image';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { navItems as allNavItems } from '@/lib/nav-items';
import { hasPermission } from '@/lib/permissions';
import { RoleProvider, useRole } from './_components/role-provider';
import type { UserRole } from '@/lib/types';


function AppSidebar() {
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="justify-start" tooltip="Help">
              <LifeBuoy className="h-4 w-4" />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="justify-start" tooltip="Profiles & Settings">
                <Link href="/dashboard/profiles-settings">
                    <Settings className="h-4 w-4" />
                    <span>Profiles &amp; Settings</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}


function Header() {
  const { realRole, currentRole, setCurrentRole } = useRole();

  return (
    <>
    {realRole === 'Admin' && currentRole !== 'Admin' && (
      <div className="bg-yellow-100 border-b border-yellow-300 text-yellow-900 px-4 py-2 flex items-center justify-center text-sm gap-2">
        <AlertTriangle className="h-4 w-4" />
        <p>You are currently viewing as a <span className="font-semibold">{currentRole}</span>.</p>
        <Button 
          variant="link" 
          className="h-auto p-0 text-yellow-900 underline"
          onClick={() => setCurrentRole(realRole)}
        >
          Return to Admin Dashboard
        </Button>
      </div>
    )}
    <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 sticky top-0 z-30">
        <SidebarTrigger className="md:hidden"/>
        <div className="w-full flex-1">
          <form>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-1/3"
              />
            </div>
          </form>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="rounded-full">
               <Avatar>
                <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026024d" alt="@shadcn" />
                <AvatarFallback>OM</AvatarFallback>
              </Avatar>
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profiles-settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    </>
  )
}

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar/>
      <SidebarInset>
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // For now, we assume the logged in user is an Admin.
  // This would be replaced with actual user authentication state.
  const loggedInUserRole: UserRole = 'Admin';

  return (
    <RoleProvider initialRole={loggedInUserRole}>