

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Briefcase,
  Home,
  Package,
  ShoppingCart,
  Users,
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
  UserCheck as UserCheckIcon,
  UserCog,
  Warehouse,
  UserSquare,
  ArrowDownToLine,
  ArrowUpToLine,
  CheckCheck,
  AlertTriangle,
  Tag,
  Bell,
  Megaphone,
  Heart,
  FileDigit,
  BookOpen,
  ArrowLeftRight,
  GanttChartSquare,
  BookUser,
  BookText,
  BookKey,
  CalendarClock,
  LayoutDashboard,
  Wallet,
  Receipt,
  Scale,
  Columns3,
  TrendingDown,
  Shapes,
  Sheet as SheetIcon,
  ClipboardPaste,
  CircleDollarSign,
  User,
  Database,
  SlidersHorizontal,
  Goal,
} from 'lucide-react';
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
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useUser, FirebaseClientProvider, useFirestore } from '@/firebase';
import { RoleProvider, useRole } from './_components/role-provider';
import type { UserRole } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { Header } from './header';
import { cn } from '@/lib/utils';
import { navItems as allNavItems } from '@/lib/nav-items';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';

function getDashboardPathForRole(role: UserRole): string {
    switch (role) {
        case 'Admin':
        case 'CEO':
            return '/dashboard';
        case 'Customer':
            return '/dashboard/dashboards/customer';
        case 'Employee':
            return '/dashboard/dashboards/employee';
        case 'Sales Manager':
            return '/dashboard/dashboards/sales-manager';
        case 'Partner':
            return '/dashboard/dashboards/partner';
        case 'Production Manager':
            return '/dashboard/dashboards/production-manager';
        case 'Purchase Manager':
            return '/dashboard/dashboards/purchase-manager';
        case 'Service Manager':
            return '/dashboard/dashboards/service-manager';
        case 'Accounts Manager':
            return '/dashboard/dashboards/accounts-manager';
        case 'HR Manager':
            return '/dashboard/dashboards/hr-manager';
        case 'Gate Keeper':
            return '/dashboard/dashboards/gate-keeper';
        case 'Inventory Manager':
            return '/dashboard/dashboards/inventory-manager';
        default:
            return '/dashboard/my-account'; // A safe default
    }
}


export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile } = useSidebar();
  const { currentRole, setCurrentRole, realRole } = useRole();
  
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const navItems = React.useMemo(() => {
    const filterItems = (items: any[]): any[] => {
        return items.map(item => {
            if (item.id === 'switch-dashboard' && realRole !== 'Admin') {
                return null;
            }
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
  }, [currentRole, realRole]);
  
  return (
    <Sidebar collapsible="icon" variant={isMobile ? "sidebar" : "inset"}>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="shrink-0">
             <Briefcase className="h-5 w-5 text-primary" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">jxnPlus</h1>
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


function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [initialRole, setInitialRole] = React.useState<UserRole | null>(null);

  React.useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    const fetchUserRole = async () => {
      const userDocRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setInitialRole(userData.role as UserRole);
      } else {
        setInitialRole('Customer');
      }
    };

    fetchUserRole();
  }, [user, loading, router, firestore]);

  if (loading || !user || !initialRole) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
        <RoleProvider initialRole={initialRole}>
          <div className="flex min-h-screen w-full">
            <AppSidebar />
            <SidebarInset>
              <Header />
              <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
                {children}
              </main>
            </SidebarInset>
          </div>
        </RoleProvider>
    </SidebarProvider>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseClientProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </FirebaseClientProvider>
  );
}
