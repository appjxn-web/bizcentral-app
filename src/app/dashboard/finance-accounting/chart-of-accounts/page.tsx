

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, MoreHorizontal, Edit, Trash2, Columns3, Book, Landmark, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddLedgerDialog } from './_components/add-ledger-dialog';
import { AddGroupDialog } from './_components/add-group-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { coaRepository } from '@/features/finance/services/coa.repository';
import type { CoaGroup, CoaLedger } from '@/features/finance/types/finance.types';

function ChartOfAccountsPageContent() {
  const { toast } = useToast();
  
  const [coaGroups, setCoaGroups] = React.useState<CoaGroup[]>([]);
  const [coaLedgers, setCoaLedgers] = React.useState<CoaLedger[]>([]);
  const [loading, setLoading] = React.useState(true);
  
  const [isAddLedgerOpen, setIsAddLedgerOpen] = React.useState(false);
  const [editingLedger, setEditingLedger] = React.useState<CoaLedger | null>(null);
  
  const [isAddGroupOpen, setIsAddGroupOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<CoaGroup | null>(null);
  
  // This is a placeholder. In a real multi-tenant app, you'd get this from user auth state.
  const companyId = 'default'; 

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    const [groups, ledgers] = await Promise.all([
        coaRepository.listGroups(companyId),
        coaRepository.listLedgers(companyId),
    ]);
    setCoaGroups(groups as CoaGroup[]);
    setCoaLedgers(ledgers as CoaLedger[]);
    setLoading(false);
  }, [companyId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { groupsByParentId, ledgersByGroupId } = React.useMemo(() => {
    const groupMap = new Map<string | null, CoaGroup[]>();
    coaGroups.forEach(group => {
        const parentId = group.parentId || 'root';
        if (!groupMap.has(parentId)) {
            groupMap.set(parentId, []);
        }
        groupMap.get(parentId)!.push(group);
    });

    const ledgerMap = new Map<string, CoaLedger[]>();
    coaLedgers.forEach(ledger => {
        if (!ledgerMap.has(ledger.groupId)) {
            ledgerMap.set(ledger.groupId, []);
        }
        ledgerMap.get(ledger.groupId)!.push(ledger);
    });
    return { groupsByParentId: groupMap, ledgersByGroupId: ledgerMap };
  }, [coaGroups, coaLedgers]);

  const kpis = React.useMemo(() => {
    const totalGroups = coaGroups.length;
    const totalLedgers = coaLedgers.length;
    const assetAccounts = coaLedgers.filter(l => l.nature === 'ASSET').length;
    const liabilityAccounts = coaLedgers.filter(l => l.nature === 'LIABILITY').length;
    const incomeAccounts = coaLedgers.filter(l => l.nature === 'INCOME').length;
    const expenseAccounts = coaLedgers.filter(l => l.nature === 'EXPENSE').length;
    return { totalGroups, totalLedgers, assetAccounts, liabilityAccounts, incomeAccounts, expenseAccounts };
  }, [coaGroups, coaLedgers]);

  const handleDelete = async (type: 'group' | 'ledger', id: string, name: string) => {
    if (type === 'group') {
        try {
            await coaRepository.deleteGroupSafe(companyId, id);
            toast({ title: `Group "${name}" Deleted` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Deletion Failed', description: error.message });
            return;
        }
    } else {
        // Direct ledger delete (add repo method if needed)
        // await coaRepository.deleteLedger(companyId, id);
    }
    fetchData(); // Refresh data
  };

  const handleEditLedger = (ledger: CoaLedger) => {
    setEditingLedger(ledger);
    setIsAddLedgerOpen(true);
  };
  
  const handleEditGroup = (group: CoaGroup) => {
    setEditingGroup(group);
    setIsAddGroupOpen(true);
  };
  
  const handleSaveLedger = async (data: Partial<CoaLedger>) => {
    const actorUid = 'system'; // Placeholder
    if (editingLedger) {
      // await coaRepository.updateLedger(companyId, editingLedger.id, data, actorUid);
      toast({ title: 'Ledger Updated (Simulated)' });
    } else {
      // await coaRepository.createLedger(companyId, data as any, actorUid);
      toast({ title: 'Ledger Created (Simulated)' });
    }
    fetchData();
    setIsAddLedgerOpen(false);
  };

  const handleSaveGroup = async (data: Partial<CoaGroup>) => {
    const actorUid = 'system'; // Placeholder
    try {
        if (editingGroup) {
            await coaRepository.updateGroup(companyId, editingGroup.id, data as any, actorUid);
            toast({ title: 'Group Updated' });
        } else {
            await coaRepository.createGroup(companyId, data as any, actorUid);
            toast({ title: 'Group Created' });
        }
        fetchData();
        setIsAddGroupOpen(false);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
    }
  };

  const renderAccountTree = (parentId: string | null = 'root', level = 0): React.ReactNode[] => {
    const childGroups = groupsByParentId.get(parentId) || [];
    
    return childGroups.flatMap(group => {
      const childLedgers = ledgersByGroupId.get(group.id) || [];
      
      const groupRow = (
        <TableRow key={group.id} className="bg-muted/50 font-semibold">
          <TableCell style={{ paddingLeft: `${level * 1.5}rem` }}>{group.name}</TableCell>
          <TableCell>{group.nature}</TableCell>
          <TableCell>Group</TableCell>
          <TableCell className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleEditGroup(group)}>Edit</DropdownMenuItem>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500">Delete</DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently delete the group "{group.name}". You can only delete empty groups.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete('group', group.id, group.name)} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      );

      const ledgerRows = childLedgers.map(ledger => (
        <TableRow key={ledger.id} className="cursor-pointer">
          <TableCell style={{ paddingLeft: `${(level + 1) * 1.5}rem` }}>{ledger.name}</TableCell>
          <TableCell>{ledger.nature}</TableCell>
          <TableCell>Ledger</TableCell>
          <TableCell className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditLedger(ledger); }}>Edit</DropdownMenuItem>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()} className="text-red-500">Delete</DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently delete the ledger "{ledger.name}".</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={(e) => { e.stopPropagation(); handleDelete('ledger', ledger.id, ledger.name); }} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      ));

      return [groupRow, ...ledgerRows, ...renderAccountTree(group.id, level + 1)];
    });
  };

  return (
    <>
      <PageHeader title="Chart of Accounts">
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setEditingGroup(null); setIsAddGroupOpen(true);}}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Group
            </Button>
            <Button onClick={() => { setEditingLedger(null); setIsAddLedgerOpen(true);}}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Ledger
            </Button>
        </div>
      </PageHeader>
      
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Groups</CardTitle>
                    <Columns3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.totalGroups}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Ledgers</CardTitle>
                    <Book className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.totalLedgers}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Asset Accounts</CardTitle>
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.assetAccounts}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Liability Accounts</CardTitle>
                    <Scale className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.liabilityAccounts}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Income Accounts</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.incomeAccounts}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Expense Accounts</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.expenseAccounts}</div>
                </CardContent>
            </Card>
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts Hierarchy</CardTitle>
          <CardDescription>A complete, hierarchical view of all financial accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/2">Account / Group Name</TableHead>
                <TableHead>Nature</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-64 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : (
                renderAccountTree()
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddLedgerDialog 
        open={isAddLedgerOpen}
        onOpenChange={setIsAddLedgerOpen}
        coaGroups={coaGroups}
        onSave={handleSaveLedger}
        editingLedger={editingLedger}
      />
      
      <AddGroupDialog
        open={isAddGroupOpen}
        onOpenChange={setIsAddGroupOpen}
        coaGroups={coaGroups}
        onSave={handleSaveGroup}
        editingGroup={editingGroup}
      />
    </>
  );
}

export default function ChartOfAccountsPage() {
    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <ChartOfAccountsPageContent />;
}
