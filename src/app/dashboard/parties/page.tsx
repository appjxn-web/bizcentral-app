

'use client';

import * as React from 'react';
import { MoreHorizontal, ListFilter, PlusCircle, User, Users, Building, FileUp, Handshake } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
import { PageHeader } from '@/components/page-header';
import type { Party, PartyType, PartyStatus, Address, BankAccount, User as UserType, UserRole, CoaGroup, CoaLedger, CoaNature, UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { useRole } from '../_components/role-provider';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, doc, setDoc, addDoc, serverTimestamp, deleteDoc, updateDoc, query, where, writeBatch, Timestamp } from 'firebase/firestore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';


const allPartyTypes: PartyType[] = ['Customer', 'Supplier', 'Vendor', 'Partner'];
const allRoles: UserRole[] = [
  'Admin', 'Manager', 'Employee', 'Customer', 'CEO', 'Sales Manager', 'Production Manager', 'Purchase Manager', 'Service Manager', 'Accounts Manager', 'HR Manager', 'Gate Keeper', 'Inventory Manager', 'Partner',
];
const allStatuses: PartyStatus[] = ['Active', 'Inactive', 'Blacklisted'];

function getStatusBadgeVariant(status: PartyStatus) {
  const variants: Record<PartyStatus, string> = {
    Active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    Blacklisted: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };
  return variants[status];
}

function getTypeBadgeVariant(type: UserRole | PartyType) {
  const variants: Partial<Record<UserRole | PartyType, string>> = {
    Customer: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Supplier: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    Vendor: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    Partner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    Manager: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    Employee: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Dealer: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    Franchisee: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
    'Sales Agent': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  };
  return variants[type] || 'bg-gray-100 text-gray-800';
}

type PartyFormData = Omit<Party, 'id' | 'status' | 'createdAt' | 'createdBy'>;


const defaultNewPartyState: PartyFormData = {
    name: '',
    contactPerson: '',
    type: 'Customer' as PartyType,
    email: '',
    phone: '',
    address: {},
    pan: '',
    gstin: '',
    openingBalance: 0,
    bankAccount: {},
    coaLedgerId: '',
};

function PartiesPageContent() {
  const { toast } = useToast();
  const { currentRole } = useRole();
  const router = useRouter();
  const firestore = useFirestore();
  const { user: authUser } = useUser();
  const userProfileRef = authUser ? doc(firestore, 'users', authUser.uid) : null;
  const { data: userProfile } = useDoc<UserProfile>(userProfileRef);
  
  const isAdminView = ['Admin', 'CEO', 'Accounts Manager', 'Sales Manager'].includes(currentRole);
  const isPartnerView = currentRole === 'Partner';

  const partiesQuery = React.useMemo(() => {
    if (!firestore) return null;
    const baseQuery = collection(firestore, 'parties');
    
    if (isPartnerView) {
      return query(baseQuery, where('type', '==', 'Customer'));
    }
    
    return baseQuery;
  }, [isPartnerView, firestore]);

  const { data: businessParties, loading: partiesLoading } = useCollection<Party>(partiesQuery);
  const { data: coaLedgers, loading: coaLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const parties = React.useMemo(() => {
    return businessParties || [];
  }, [businessParties]);

  const loading = partiesLoading || coaLoading;
  
  const [typeFilters, setTypeFilters] = React.useState<(PartyType|UserRole)[]>([]);
  const [statusFilters, setStatusFilters] = React.useState<PartyStatus[]>(['Active']);
  const [creatorFilters, setCreatorFilters] = React.useState<string[]>([]);
  const [startDateFilter, setStartDateFilter] = React.useState<string>('');
  const [endDateFilter, setEndDateFilter] = React.useState<string>('');
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [editingParty, setEditingParty] = React.useState<Party | null>(null);
  const [newParty, setNewParty] = React.useState<PartyFormData>(defaultNewPartyState);
  
  const [isBlacklistDialogOpen, setIsBlacklistDialogOpen] = React.useState(false);
  const [partyToBlacklist, setPartyToBlacklist] = React.useState<Party | null>(null);
  const [blacklistReason, setBlacklistReason] = React.useState('');

  const canDelete = ['Admin', 'CEO', 'Accounts Manager'].includes(currentRole);

  const allCreators = React.useMemo(() => {
    if (!parties) return [];
    return [...new Set(parties.map(p => (p as Party).createdBy || 'System'))];
  }, [parties]);
  
  React.useEffect(() => {
    if (!isSheetOpen) {
      setEditingParty(null);
      setNewParty(defaultNewPartyState);
    } else if (editingParty) {
      setNewParty({
        name: editingParty.name || '',
        contactPerson: editingParty.contactPerson || '',
        type: editingParty.type || 'Customer',
        email: editingParty.email || '',
        phone: editingParty.phone || '',
        address: editingParty.address || {},
        pan: editingParty.pan || '',
        gstin: editingParty.gstin || '',
        openingBalance: editingParty.openingBalance || 0,
        bankAccount: editingParty.bankAccount || {},
        coaLedgerId: editingParty.coaLedgerId || '',
      });
    }
  }, [isSheetOpen, editingParty]);

  const handleTypeFilterChange = (type: PartyType | UserRole) => {
    setTypeFilters(prev => (prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]));
  };
  const handleStatusFilterChange = (status: PartyStatus) => {
    setStatusFilters(prev => (prev.includes(status) ? prev.filter(s => s !== status) : [...prev, s]));
  };
  const handleCreatorFilterChange = (creator: string) => {
    setCreatorFilters(prev => (prev.includes(creator) ? prev.filter(c => c !== creator) : [...prev, c]));
  };

  const filteredParties = React.useMemo(() => {
    if (!parties) return [];
    return parties.filter(party => {
      const typeMatch = typeFilters.length === 0 || typeFilters.includes(party.type as PartyType | UserRole);
      const partyStatus = (party as Party).status || 'Active';
      const statusMatch = statusFilters.length === 0 || statusFilters.includes(partyStatus);
      const creatorMatch = creatorFilters.length === 0 || creatorFilters.includes((party as Party).createdBy || 'System');

      const partyDate = (party as Party).createdAt;
      if (!partyDate) return typeMatch && statusMatch && creatorMatch;

      const date = partyDate instanceof Timestamp ? partyDate.toDate() : new Date(partyDate);
      
      const startDate = startDateFilter ? new Date(startDateFilter) : null;
      const endDate = endDateFilter ? new Date(endDateFilter) : null;
      if (startDate) startDate.setHours(0, 0, 0, 0);
      if (endDate) endDate.setHours(23, 59, 59, 999);

      const dateMatch = (!startDate || date >= startDate) && (!endDate || date <= endDate);

      return typeMatch && statusMatch && creatorMatch && dateMatch;
    });
  }, [parties, typeFilters, statusFilters, creatorFilters, startDateFilter, endDateFilter]);

  const kpis = React.useMemo(() => {
    if (!parties) return { total: 0, customers: 0, suppliers: 0, vendors: 0, partners: 0 };
    return {
        total: parties.length,
        customers: parties.filter(p => p.type === 'Customer').length,
        suppliers: parties.filter(p => p.type === 'Supplier').length,
        vendors: parties.filter(p => p.type === 'Vendor').length,
        partners: parties.filter(p => p.type === 'Partner').length,
    }
  }, [parties]);

  const handleFormChange = (field: keyof PartyFormData, value: any) => {
    setNewParty(prev => ({...prev, [field]: value}));
  };

  const handleAddressChange = (field: keyof Address, value: string) => {
    setNewParty(prev => ({...prev, address: {...prev.address, [field]: value}}));
  };
  
  const handleBankChange = (field: keyof BankAccount, value: string) => {
    setNewParty(prev => ({...prev, bankAccount: {...prev.bankAccount, [field]: value}}));
  };
  
  const handleSaveParty = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newParty.name || !newParty.phone) {
        toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out Business Name and phone.' });
        return;
    }

    try {
        const batch = writeBatch(firestore);
        
        if (editingParty) {
            const partyRef = doc(firestore, 'parties', editingParty.id);
            batch.set(partyRef, newParty, { merge: true });
            toast({ title: 'Party Updated', description: `Details for "${newParty.name}" have been updated.` });
        } else {
            const newPartyRef = doc(collection(firestore, 'parties'));
            const creatorName = userProfile?.businessName || authUser?.displayName || 'Admin User';
            
            const newLedgerRef = doc(collection(firestore, 'coa_ledgers'));
            const newLedgerData: Omit<CoaLedger, 'id'> = {
                name: newParty.name,
                groupId: newParty.type === 'Customer' ? '1.1.2' : '2.1.1',
                nature: newParty.type === 'Customer' ? 'ASSET' : 'LIABILITY',
                type: newParty.type === 'Customer' ? 'RECEIVABLE' : 'PAYABLE',
                posting: { isPosting: true, normalBalance: newParty.type === 'Customer' ? 'DEBIT' : 'CREDIT', isSystem: false, allowManualJournal: true },
                status: 'ACTIVE',
                openingBalance: { amount: newParty.openingBalance || 0, drCr: newParty.type === 'Customer' ? 'DR' : 'CR', asOf: new Date().toISOString() },
            };
            batch.set(newLedgerRef, newLedgerData);

            const newPartyData: Party = {
                id: newPartyRef.id,
                ...newParty,
                status: 'Active',
                createdAt: new Date().toISOString(),
                createdBy: creatorName,
                coaLedgerId: newLedgerRef.id,
            };
            batch.set(newPartyRef, newPartyData);
            
            toast({ title: 'Party Added', description: `"${newParty.name}" has been successfully added.` });
        }

        await batch.commit();
        setIsSheetOpen(false);
    } catch (error) {
        console.error("Error saving party:", error);
        toast({ variant: 'destructive', title: 'Save Failed' });
    }
  };
  
  const handleEdit = (party: Party) => {
    setEditingParty(party);
    setIsSheetOpen(true);
  };
  
  const handleAdd = () => {
    setEditingParty(null);
    setIsSheetOpen(true);
  };
  
  const handleDelete = async (partyId: string) => {
    await deleteDoc(doc(firestore, 'parties', partyId));
    toast({ title: 'Party Deleted' });
  };
  
  const openBlacklistDialog = (party: Party) => {
    setPartyToBlacklist(party);
    setBlacklistReason(party.reason || '');
    setIsBlacklistDialogOpen(true);
  };

  const handleBlacklist = async () => {
    if (!partyToBlacklist) return;
    const partyRef = doc(firestore, 'parties', partyToBlacklist.id);
    await setDoc(partyRef, { status: 'Blacklisted', reason: blacklistReason }, { merge: true });
    toast({ title: 'Party Blacklisted', description: `${partyToBlacklist.name} has been blacklisted.` });
    setIsBlacklistDialogOpen(false);
    setPartyToBlacklist(null);
    setBlacklistReason('');
  };

  const handleWhitelist = async (partyId: string) => {
    const partyRef = doc(firestore, 'parties', partyId);
    await setDoc(partyRef, { status: 'Active', reason: '' }, { merge: true });
    toast({ title: 'Party Whitelisted', description: 'The party has been moved back to active status.' });
  };

  const handleViewAccount = (partyId: string) => {
    router.push(`/dashboard/finance-accounting/party-statement?partyId=${partyId}`);
  };


  return (
    <>
      <PageHeader title="Parties">
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1" onClick={handleAdd}>
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Add Party</span>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Parties</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All business contacts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.customers}</div>
            <p className="text-xs text-muted-foreground">Your client base</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suppliers &amp; Vendors</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.suppliers + kpis.vendors}</div>
            <p className="text-xs text-muted-foreground">Supply &amp; service providers</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partners</CardTitle>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.partners}</div>
            <p className="text-xs text-muted-foreground">Registered partners</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Party Management</CardTitle>
          <CardDescription>View, add, and manage all your business parties.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
              <Input type="date" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)} className="w-40" />
              <span className="text-muted-foreground">to</span>
              <Input type="date" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)} className="w-40" />
              <Button variant="outline" onClick={() => { setStartDateFilter(''); setEndDateFilter(''); }}>Clear Dates</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>
                    <div className="flex items-center gap-2">
                        Type
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6"><ListFilter className="h-3.5 w-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <ScrollArea className="h-48">
                                    {allPartyTypes.map(type => (
                                        <DropdownMenuCheckboxItem key={type} checked={typeFilters.includes(type)} onCheckedChange={() => handleTypeFilterChange(type)}>
                                            {type}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </ScrollArea>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </TableHead>
                <TableHead>
                    <div className="flex items-center gap-2">
                        Status
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6"><ListFilter className="h-3.5 w-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {allStatuses.map(status => (
                                    <DropdownMenuCheckboxItem key={status} checked={statusFilters.includes(status)} onCheckedChange={() => handleStatusFilterChange(status)}>
                                        {status}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </TableHead>
                <TableHead>
                    <div className="flex items-center gap-2">
                        Created By
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6"><ListFilter className="h-3.5 w-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Creator</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {allCreators.map(creator => (
                                    <DropdownMenuCheckboxItem key={creator} checked={creatorFilters.includes(creator)} onCheckedChange={() => handleCreatorFilterChange(creator)}>
                                        {creator}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </TableHead>
                <TableHead>Created At</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
              ) : filteredParties.map((party) => {
                  const createdAt = (party as Party).createdAt;
                  let formattedDate = 'N/A';
                  if (createdAt) {
                      if (typeof createdAt === 'string') {
                          formattedDate = format(new Date(createdAt), 'dd/MM/yyyy');
                      } else if (createdAt && typeof (createdAt as any).toDate === 'function') {
                          formattedDate = format((createdAt as any).toDate(), 'dd/MM/yyyy');
                      }
                  }

                  return (
                    <TableRow key={party.id}>
                      <TableCell className="font-medium">{party.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getTypeBadgeVariant(party.type as UserRole | PartyType))}>{party.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant((party as Party).status || 'Active'))}>{(party as Party).status || 'Active'}</Badge>
                      </TableCell>
                      <TableCell>{(party as Party).createdBy || 'System'}</TableCell>
                      <TableCell>{formattedDate}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleViewAccount(party.id)}>View Account</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(party as Party)}>Edit</DropdownMenuItem>
                            {(party as Party).status !== 'Blacklisted' ? (
                                <DropdownMenuItem onClick={() => openBlacklistDialog(party as Party)}>Blacklist</DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem onClick={() => handleWhitelist((party as Party).id)}>Whitelist</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {canDelete && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600">Delete</DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete the party "{party.name}".
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDelete((party as Party).id)} className={buttonVariants({ variant: 'destructive' })}>
                                            Delete
                                        </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
       <Dialog open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <DialogContent className="sm:max-w-lg flex flex-col h-full max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>{editingParty ? 'Edit Party' : 'Add New Party'}</DialogTitle>
                    <DialogDescription>
                        Fill in the details for the business party.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSaveParty} className="flex-1 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 -mx-6 px-6">
                        <div className="py-4 space-y-4">
                            <Tabs defaultValue="general" className="pr-1">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="general">General</TabsTrigger>
                                    <TabsTrigger value="tax">Tax</TabsTrigger>
                                    <TabsTrigger value="bank">Bank</TabsTrigger>
                                </TabsList>
                                <TabsContent value="general" className="mt-4">
                                    <div className="grid gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="party-name">Business Name</Label>
                                            <Input id="party-name" name="party-name" placeholder="e.g., Acme Corp" value={newParty.name} onChange={(e) => handleFormChange('name', e.target.value)} />
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="party-contact-person">Contact Person Name</Label>
                                            <Input id="party-contact-person" name="party-contact-person" placeholder="e.g., John Doe" value={newParty.contactPerson} onChange={(e) => handleFormChange('contactPerson', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="party-type">Party Type</Label>
                                            <Select name="party-type" value={newParty.type} onValueChange={(value: PartyType) => handleFormChange('type', value)}>
                                                <SelectTrigger id="party-type">
                                                    <SelectValue placeholder="Select a type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Customer">Customer</SelectItem>
                                                    <SelectItem value="Supplier">Supplier</SelectItem>
                                                    <SelectItem value="Vendor">Vendor</SelectItem>
                                                    <SelectItem value="Partner">Partner</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="party-email">Contact Email</Label>
                                            <Input id="party-email" name="party-email" type="email" placeholder="e.g., contact@acme.com" value={newParty.email} onChange={(e) => handleFormChange('email', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="party-phone">Contact Phone</Label>
                                            <Input id="party-phone" name="party-phone" type="tel" placeholder="e.g., +1 555-1234" value={newParty.phone} onChange={(e) => handleFormChange('phone', e.target.value)} />
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="address-line-1">Address Line 1</Label>
                                            <Input id="address-line-1" name="address-line-1" placeholder="e.g., 123 Main St" value={newParty.address?.line1 || ''} onChange={(e) => handleAddressChange('line1', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="address-line-2">Address Line 2</Label>
                                            <Input id="address-line-2" name="address-line-2" placeholder="e.g., Suite 4B" value={newParty.address?.line2 || ''} onChange={(e) => handleAddressChange('line2', e.target.value)} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="city">City</Label>
                                                <Input id="city" name="city" placeholder="e.g., Metropolis" value={newParty.address?.city || ''} onChange={(e) => handleAddressChange('city', e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="district">District</Label>
                                                <Input id="district" name="district" placeholder="e.g., Central District" value={newParty.address?.district || ''} onChange={(e) => handleAddressChange('district', e.target.value)} />
                                            </div>
                                        </div>
                                         <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="state">State</Label>
                                                <Input id="state" name="state" placeholder="e.g., California" value={newParty.address?.state || ''} onChange={(e) => handleAddressChange('state', e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="country">Country</Label>
                                                <Input id="country" name="country" value={newParty.address?.country || 'India'} onChange={(e) => handleAddressChange('country', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                             <div className="space-y-2">
                                                <Label htmlFor="pin">PIN</Label>
                                                <Input id="pin" name="pin" placeholder="e.g., 123456" value={newParty.address?.pin || ''} onChange={(e) => handleAddressChange('pin', e.target.value)} />
                                            </div>
                                             <div className="space-y-2">
                                                <Label htmlFor="digital-pin">Digital PIN</Label>
                                                <Input id="digital-pin" name="digital-pin" placeholder="e.g., 1234" value={newParty.address?.digitalPin || ''} onChange={(e) => handleAddressChange('digitalPin', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="opening-balance">Opening Balance</Label>
                                            <Input id="opening-balance" name="opening-balance" type="number" placeholder="e.g., 5000" value={newParty.openingBalance} onChange={(e) => handleFormChange('openingBalance', Number(e.target.value))} disabled={currentRole !== 'Admin'} />
                                        </div>
                                    </div>
                                </TabsContent>
                                <TabsContent value="tax" className="mt-4">
                                    <div className="grid gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="pan">PAN</Label>
                                            <Input id="pan" name="pan" placeholder="e.g., ABCDE1234F" value={newParty.pan} onChange={(e) => handleFormChange('pan', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="gstin">GSTIN</Label>
                                            <Input id="gstin" name="gstin" placeholder="e.g., 22AAAAA0000A1Z5" value={newParty.gstin} onChange={(e) => handleFormChange('gstin', e.target.value)} />
                                        </div>
                                    </div>
                                </TabsContent>
                                <TabsContent value="bank" className="mt-4">
                                    <div className="grid gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="account-holder-name">Account Holder Name</Label>
                                            <Input id="account-holder-name" name="account-holder-name" placeholder="John Doe" value={newParty.bankAccount?.accountHolderName || ''} onChange={(e) => handleBankChange('accountHolderName', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="bank-name">Bank Name</Label>
                                            <Input id="bank-name" name="bank-name" placeholder="e.g., State Bank of India" value={newParty.bankAccount?.bankName || ''} onChange={(e) => handleBankChange('bankName', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="account-number">Account Number</Label>
                                            <Input id="account-number" name="account-number" placeholder="e.g., 1234567890" value={newParty.bankAccount?.accountNumber || ''} onChange={(e) => handleBankChange('accountNumber', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="ifsc-code">IFSC Code</Label>
                                            <Input id="ifsc-code" name="ifsc-code" placeholder="e.g., SBIN0001234" value={newParty.bankAccount?.ifscCode || ''} onChange={(e) => handleBankChange('ifscCode', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="upi-id">UPI ID (Optional)</Label>
                                            <Input id="upi-id" name="upi-id" placeholder="e.g., username@upi" value={newParty.bankAccount?.upiId || ''} onChange={(e) => handleBankChange('upiId', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="upi-qr">UPI QR Code (Optional)</Label>
                                            <Input id="upi-qr" name="upi-qr" type="file" className="h-auto" accept="image/*" />
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="pt-4 border-t">
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button type="submit">Save Party</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        
        <Dialog open={isBlacklistDialogOpen} onOpenChange={setIsBlacklistDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Blacklist {partyToBlacklist?.name}</DialogTitle>
                    <DialogDescription>
                        Provide a reason for blacklisting this party. This will prevent future transactions.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="blacklist-reason">Reason</Label>
                    <Textarea
                        id="blacklist-reason"
                        value={blacklistReason}
                        onChange={(e) => setBlacklistReason(e.target.value)}
                        placeholder="e.g., Repeated payment failures, poor service quality..."
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button variant="destructive" onClick={handleBlacklist} disabled={!blacklistReason}>
                        Blacklist Party
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  );
}


export default function PartiesPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <PartiesPageContent />;
}



    
