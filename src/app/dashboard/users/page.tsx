
'use client';

import * as React from 'react';
import { MoreHorizontal, ListFilter, Users as UsersIcon, UserCheck, UserX, Shield, PlusCircle, MapPin, BookKey } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import type { User, UserRole, Location, Party, PartyType, CoaLedger, CoaNature, UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { UserFormSheet, type UserFormValues } from './_components/add-user-sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';
import { useFirestore, useCollection, useAuth } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, serverTimestamp, addDoc, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import Link from 'next/link';


const allRoles: UserRole[] = [
  'Admin', 'Manager', 'Employee', 'Customer', 'CEO', 'Sales Manager', 'Production Manager', 'Purchase Manager', 'Service Manager', 'Accounts Manager', 'HR Manager', 'Gate Keeper', 'Inventory Manager', 'Partner',
];

function getRoleBadgeVariant(role: User['role']) {
  const variants: Partial<Record<UserRole, string>> = {
    Admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    Manager: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    Employee: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Customer: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    'CEO': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    'Sales Manager': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'Production Manager': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    'Purchase Manager': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Service Manager': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
    'Accounts Manager': 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-300',
    'HR Manager': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300',
    'Gate Keeper': 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-300',
    'Inventory Manager': 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-300',
    Partner: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  };
  return variants[role] || 'bg-gray-100 text-gray-800';
}

export default function UsersPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const auth = useAuth();
  const { data: users, loading } = useCollection<UserProfile>(collection(firestore, 'users'));
  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const [roleFilters, setRoleFilters] = React.useState<UserRole[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'Active' | 'Deactivated'>('all');
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserProfile | null>(null);

  const { toast } = useToast();

  const handleRoleFilterChange = (role: UserRole) => {
    setRoleFilters(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role) 
        : [...prev, role]
    );
  };
  
  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    return users.filter(user => {
      const roleMatch = roleFilters.length === 0 || roleFilters.includes(user.role);
      const statusMatch = statusFilter === 'all' || user.status === statusFilter;
      return roleMatch && statusMatch;
    });
  }, [users, roleFilters, statusFilter]);

  const kpis = React.useMemo(() => {
    if (!users) return { totalUsers: 0, activeUsers: 0, inactiveUsers: 0, mostCommonRole: 'N/A' };
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'Active').length;
    const inactiveUsers = totalUsers - activeUsers;
    const roleCounts = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {} as Record<UserRole, number>);
    
    const mostCommonRole = Object.entries(roleCounts).sort(([,a],[,b]) => b-a)[0]?.[0] || 'N/A';

    return { totalUsers, activeUsers, inactiveUsers, mostCommonRole };
  }, [users]);
  
  const handleDeactivate = async (user: UserProfile) => {
    const newStatus = user.status === 'Active' ? 'Deactivated' : 'Active';
    const userDocRef = doc(firestore, 'users', user.id);
    await setDoc(userDocRef, { status: newStatus }, { merge: true });
    toast({ title: 'User status updated' });
  };

  const handleDelete = async (userId: string) => {
    const userDocRef = doc(firestore, 'users', userId);
    await deleteDoc(userDocRef);
    toast({ title: 'User deleted' });
  };
  
  const handleEdit = (user: UserProfile) => {
    setEditingUser(user);
    setIsSheetOpen(true);
  };

  const handleAdd = () => {
    setEditingUser(null);
    setIsSheetOpen(true);
  };
  
  const handleSaveUser = async (data: UserFormValues, userId?: string) => {
    try {
        const isEditMode = !!userId;
        let finalUserId = userId;
        let successMessage = { title: 'User Updated', description: `${data.contactPerson}'s information has been updated.` };
        const batch = writeBatch(firestore);

        if (!isEditMode) {
            // Create new auth user
            const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password!);
            const authUser = userCredential.user;
            await updateProfile(authUser, { displayName: data.contactPerson });
            finalUserId = authUser.uid;
            successMessage = { title: 'User Created', description: `User ${data.contactPerson} has been created with role ${data.role}.` };
        }

        if (!finalUserId) throw new Error("Could not determine user ID.");

        const userDocRef = doc(firestore, 'users', finalUserId);
        const profileData: Partial<UserProfile> = {
            displayName: data.contactPerson,
            name: data.businessName || data.contactPerson,
            email: data.email,
            role: data.role,
            ...(data.businessName && { businessName: data.businessName }),
            ...(data.mobile && { mobile: data.mobile }),
        };

        if (!isEditMode) {
            profileData.status = 'Active';
            profileData.photoURL = `https://i.pravatar.cc/150?u=${finalUserId}`;
        }
        
        // If user is a partner, create/update corresponding party record
        if (data.role === 'Partner') {
          const partyRef = doc(firestore, 'parties', finalUserId);
          const partyData: Partial<Party> = {
            id: finalUserId,
            name: data.businessName || data.contactPerson,
            type: 'Partner' as PartyType,
            email: data.email,
            phone: data.mobile || '',
            status: 'Active',
            createdAt: serverTimestamp() as any,
            createdBy: 'System',
          };
          batch.set(partyRef, partyData, { merge: true });
        } else if (data.role !== 'Customer' && !isEditMode) { // Create ledger for new internal employees
           const newLedgerRef = doc(collection(firestore, 'coa_ledgers'));
           const newLedgerData: Omit<CoaLedger, 'id' | 'createdAt' | 'updatedAt'> = {
                name: data.contactPerson,
                groupId: '1.1.4', // Employee Advances
                nature: 'ASSET' as CoaNature,
                type: 'OTHER',
                posting: { isPosting: true, normalBalance: 'DEBIT', isSystem: false, allowManualJournal: true },
                status: 'ACTIVE',
                openingBalance: { amount: 0, drCr: 'DR', asOf: new Date().toISOString() },
            };
            batch.set(newLedgerRef, newLedgerData);
            profileData.coaLedgerId = newLedgerRef.id;
        }

        batch.set(userDocRef, profileData, { merge: true });
        await batch.commit();
        
        toast(successMessage);
    } catch (error: any) {
        console.error("Error saving user:", error);
        toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
    }
  };

  const handleCreateLedgerForUser = async (user: UserProfile) => {
    if (!user || user.coaLedgerId || !coaLedgers) {
      toast({ variant: 'destructive', title: 'Invalid Operation', description: 'User already has a ledger or data is missing.'});
      return;
    }

    const existingLedger = coaLedgers.find(l => l.name === user.name);
    if (existingLedger) {
        toast({ variant: 'destructive', title: 'Ledger Exists', description: `A ledger named '${user.name}' already exists. Please resolve manually.`});
        return;
    }

    try {
        const batch = writeBatch(firestore);
        const newLedgerRef = doc(collection(firestore, 'coa_ledgers'));
        const newLedgerData: Omit<CoaLedger, 'id' | 'createdAt' | 'updatedAt'> = {
             name: user.name,
             groupId: '1.1.4', // Employee Advances
             nature: 'ASSET' as CoaNature,
             type: 'OTHER',
             posting: { isPosting: true, normalBalance: 'DEBIT', isSystem: false, allowManualJournal: true },
             status: 'ACTIVE',
             openingBalance: { amount: 0, drCr: 'DR', asOf: new Date().toISOString() },
         };
         batch.set(newLedgerRef, newLedgerData);

         const userRef = doc(firestore, 'users', user.id);
         batch.update(userRef, { coaLedgerId: newLedgerRef.id });

         await batch.commit();
         toast({ title: 'Ledger Created', description: `Successfully created and linked ledger for ${user.name}.` });
    } catch (error) {
         console.error(error);
         toast({ variant: 'destructive', title: 'Error', description: 'Failed to create ledger.' });
    }
  };

  return (
    <>
      <PageHeader title="Users">
        <div className="flex items-center gap-2">
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Filter
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Status</DropdownMenuLabel>
               <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | 'Active' | 'Deactivated')}>
                  <SelectTrigger className="w-[180px] mx-2">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Deactivated">Deactivated</SelectItem>
                  </SelectContent>
                </Select>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Role</DropdownMenuLabel>
                <ScrollArea className="h-48">
                {allRoles.map(role => (
                    <DropdownMenuCheckboxItem
                    key={role}
                    checked={roleFilters.includes(role)}
                    onCheckedChange={() => handleRoleFilterChange(role)}
                    >
                    {role}
                    </DropdownMenuCheckboxItem>
                ))}
                </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>
           <Button size="sm" className="gap-1" onClick={handleAdd}>
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Add User
            </span>
          </Button>
        </div>
      </PageHeader>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalUsers}</div>
            <p className="text-xs text-muted-foreground">All registered users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeUsers}</div>
            <p className="text-xs text-muted-foreground">Users currently active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inactiveUsers}</div>
            <p className="text-xs text-muted-foreground">Deactivated or idle users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Common Role</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.mostCommonRole}</div>
            <p className="text-xs text-muted-foreground">The most assigned role</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Manage users, their roles, and permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Contact No.</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading users...</TableCell></TableRow>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const displayName = (user as any).businessName || user.displayName || user.name || 'Unnamed User';
                  const isEmployeeWithoutLedger = user.role !== 'Customer' && user.role !== 'Partner' && !user.coaLedgerId;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarImage src={user.photoURL} />
                            <AvatarFallback>{displayName.charAt(0) || 'U'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{displayName}</div>
                            <div className="text-sm text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getRoleBadgeVariant(user.role))}>
                          {user.role}
                        </Badge>
                      </TableCell>
                       <TableCell className="hidden sm:table-cell">
                        {(user as any).mobile || 'N/A'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge
                          variant={
                            user.status === 'Active' ? 'outline' : 'secondary'
                          }
                          className={cn(
                            user.status === 'Active' && 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
                            user.status === 'Deactivated' && 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                          )}
                        >
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                         {isEmployeeWithoutLedger && (
                            <Button variant="destructive" size="sm" onClick={() => handleCreateLedgerForUser(user)}>
                                <BookKey className="mr-2 h-4 w-4" />
                                Create Ledger
                            </Button>
                         )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-haspopup="true"
                              size="icon"
                              variant="ghost"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                             <DropdownMenuItem asChild>
                              <Link href={`/dashboard/profiles-settings?userId=${user.id}`}>View Profile</Link>
                             </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => handleEdit(user)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/users/tracking?userId=${user.id}`)}>
                              <MapPin className="mr-2 h-4 w-4" />
                              Live Tracking
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeactivate(user)}>
                              {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                 <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/40"
                                >
                                  Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                  <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                      This action cannot be undone. This will permanently delete the user account for {displayName}.
                                  </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(user.id)} className={buttonVariants({ variant: 'destructive' })}>
                                      Delete
                                  </AlertDialogAction>
                                  </AlertDialogFooter>
                              </AlertDialogContent>
                             </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No users found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <UserFormSheet 
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        initialData={editingUser}
        onSave={handleSaveUser}
      />
    </>
  );
}

    