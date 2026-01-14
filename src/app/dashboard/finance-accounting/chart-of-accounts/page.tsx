

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import type { CoaGroup, CoaLedger, CoaNature } from '@/lib/types';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, doc, deleteDoc, addDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddLedgerDialog } from './_components/add-ledger-dialog';
import { AddGroupDialog } from './_components/add-group-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

function ChartOfAccountsPageContent() {
  const { toast } = useToast();
  const router = useRouter();
  const firestore = useFirestore();
  const { data: coaGroups, loading: groupsLoading } = useCollection<CoaGroup>(query(collection(firestore, 'coa_groups'), orderBy('path')));
  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const [isAddLedgerOpen, setIsAddLedgerOpen] = React.useState(false);
  const [editingLedger, setEditingLedger] = React.useState<CoaLedger | null>(null);
  
  const [isAddGroupOpen, setIsAddGroupOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<CoaGroup | null>(null);

  const kpis = React.useMemo(() => {
    if (!coaGroups || !coaLedgers) {
      return { totalGroups: 0, totalLedgers: 0, assetAccounts: 0, liabilityAccounts: 0, incomeAccounts: 0, expenseAccounts: 0 };
    }
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
        const hasChildren = coaGroups?.some(g => g.parentId === id) || coaLedgers?.some(l => l.groupId === id);
        if (hasChildren) {
            toast({
                variant: 'destructive',
                title: 'Deletion Failed',
                description: `Cannot delete group "${name}" because it contains other groups or ledgers.`,
            });
            return;
        }
    }

    const collectionName = type === 'group' ? 'coa_groups' : 'coa_ledgers';
    await deleteDoc(doc(firestore, collectionName, id));
    toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} Deleted` });
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
    if (editingLedger) {
        await updateDoc(doc(firestore, 'coa_ledgers', editingLedger.id), data);
        toast({ title: 'Ledger Updated' });
    } else {
        await addDoc(collection(firestore, 'coa_ledgers'), data);
        toast({ title: 'Ledger Created' });
    }
    setIsAddLedgerOpen(false);
    setEditingLedger(null);
  };

  const handleSaveGroup = async (data: Partial<CoaGroup>) => {
    if (editingGroup) {
      await updateDoc(doc(firestore, 'coa_groups', editingGroup.id), data);
      toast({ title: 'Group Updated' });
    } else {
      const newGroupData = {
          ...data,
          isSystem: false,
          isActive: true,
          reporting: { statement: ['INCOME', 'EXPENSE'].includes(data.nature as string) ? 'PL' : 'BS' },
          allowLedgerPosting: false,
      };
      await addDoc(collection(firestore, 'coa_groups'), newGroupData);
      toast({ title: 'Group Created' });
    }
    setIsAddGroupOpen(false);
    setEditingGroup(null);
  };
  
  const handleLedgerClick = (accountId: string) => {
    router.push(`/dashboard/finance-accounting/balance-sheet/view?accountId=${accountId}`);
  };

  const renderAccountTree = (parentId: string | null = null, level = 0) => {
    const groups = coaGroups?.filter(g => g.parentId === parentId);
    const ledgers = coaLedgers?.filter(l => l.groupId === parentId);
    
    let elements: JSX.Element[] = [];

    if(ledgers) {
        elements = elements.concat(
            ledgers.map(ledger => (
                <TableRow key={ledger.id} onClick={() => handleLedgerClick(ledger.id)} className="cursor-pointer">
                    <TableCell style={{ paddingLeft: `${level * 2}rem` }}>{ledger.name}</TableCell>
                    <TableCell>{ledger.nature}</TableCell>
                    <TableCell>Ledger</TableCell>
                    <TableCell className="text-right">
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); handleEditLedger(ledger);}}>Edit</DropdownMenuItem>
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
                                            <AlertDialogAction onClick={(e) => { e.stopPropagation(); handleDelete('ledger', ledger.id, ledger.name)}} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                </TableRow>
            ))
        )
    }

    if (groups) {
      elements = elements.concat(
        groups.flatMap(group => [
          <TableRow key={group.id} className="bg-muted/50 font-semibold">
            <TableCell style={{ paddingLeft: `${level * 1.5}rem` }}>{group.name}</TableCell>
            <TableCell>{group.nature}</TableCell>
            <TableCell>Group</TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditGroup(group);}}>Edit</DropdownMenuItem>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()} className="text-red-500">Delete</DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete the group "{group.name}". You can only delete empty groups.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={(e) => { e.stopPropagation(); handleDelete('group', group.id, group.name);}} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>,
          ...renderAccountTree(group.id, level + 1),
        ])
      );
    }

    return elements;
  };

  const loading = groupsLoading || ledgersLoading;

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
