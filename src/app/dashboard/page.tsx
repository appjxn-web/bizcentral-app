

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from './_components/role-provider';
import { Loader2 } from 'lucide-react';
import CeoDashboardPage from './dashboards/ceo/page';
import SalesManagerDashboardPage from './dashboards/sales-manager/page';
import PartnerDashboardPage from './dashboards/partner/page';
import ProductionManagerDashboardPage from './dashboards/production-manager/page';
import PurchaseManagerDashboardPage from './dashboards/purchase-manager/page';
import ServiceManagerDashboardPage from './dashboards/service-manager/page';
import AccountsManagerDashboardPage from './dashboards/accounts-manager/page';
import HrManagerDashboardPage from './dashboards/hr-manager/page';
import GateKeeperDashboardPage from './dashboards/gate-keeper/page';
import InventoryManagerDashboardPage from './dashboards/inventory-manager/page';
import EmployeeDashboardPage from './dashboards/employee/page';
import CustomerDashboardPage from './dashboards/customer/page';

const roleToDashboardMap: Record<string, React.ComponentType> = {
    'Admin': CeoDashboardPage,
    'CEO': CeoDashboardPage,
    'Sales Manager': SalesManagerDashboardPage,
    'Partner': PartnerDashboardPage,
    'Production Manager': ProductionManagerDashboardPage,
    'Purchase Manager': PurchaseManagerDashboardPage,
    'Service Manager': ServiceManagerDashboardPage,
    'Accounts Manager': AccountsManagerDashboardPage,
    'HR Manager': HrManagerDashboardPage,
    'Gate Keeper': GateKeeperDashboardPage,
    'Inventory Manager': InventoryManagerDashboardPage,
    'Employee': EmployeeDashboardPage,
    'Customer': CustomerDashboardPage,
};


export default function DashboardRedirectPage() {
  const { currentRole, realRole } = useRole();
  const router = useRouter();

  React.useEffect(() => {
    if (realRole && currentRole === realRole && realRole !== 'Admin' && realRole !== 'CEO') {
      let targetPath = '/dashboard';
      switch (realRole) {
        case 'Sales Manager':
          targetPath = '/dashboard/dashboards/sales-manager';
          break;
        case 'Partner':
          targetPath = '/dashboard/dashboards/partner';
          break;
        case 'Production Manager':
          targetPath = '/dashboard/dashboards/production-manager';
          break;
        case 'Purchase Manager':
          targetPath = '/dashboard/dashboards/purchase-manager';
          break;
        case 'Service Manager':
          targetPath = '/dashboard/dashboards/service-manager';
          break;
        case 'Accounts Manager':
          targetPath = '/dashboard/dashboards/accounts-manager';
          break;
        case 'HR Manager':
          targetPath = '/dashboard/dashboards/hr-manager';
          break;
        case 'Gate Keeper':
          targetPath = '/dashboard/dashboards/gate-keeper';
          break;
        case 'Inventory Manager':
            targetPath = '/dashboard/dashboards/inventory-manager';
            break;
        case 'Employee':
          targetPath = '/dashboard/dashboards/employee';
          break;
        case 'Customer':
          targetPath = '/dashboard/dashboards/customer';
          break;
        default:
          targetPath = '/dashboard/my-account';
          break;
      }
      router.replace(targetPath);
    }
  }, [realRole, currentRole, router]);

  const DashboardComponent = roleToDashboardMap[currentRole] || CeoDashboardPage;

  if (!realRole) {
      return (
        <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading dashboard...</p>
            </div>
        </div>
      );
  }

  return <DashboardComponent />;
}