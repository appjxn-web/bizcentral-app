
'use client';

import * as React from 'react';
import {
  MoreHorizontal,
  ListFilter,
  PlusCircle,
  Users,
  CheckCircle,
  TrendingUp,
  Phone,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Lead, LeadStatus, LeadSource, UserRole } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useRole } from '../../_components/role-provider';
import { format } from 'date-fns';
import { AddLeadDialog } from './_components/add-lead-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';

const allStatuses: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Converted', 'Lost'];
const allSources: LeadSource[] = ['Website', 'Referral', 'Cold Call', 'Event', 'Social media', 'Other'];

function getStatusBadgeVariant(status: LeadStatus) {
  const variants: Record<LeadStatus, string> = {
    New: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Contacted: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
    Qualified: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    'Proposal Sent': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    Converted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Lost: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };
  return variants[status];
}

export default function LeadPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { currentRole } = useRole();
  const { user: authUser } = useUser();
  const firestore = useFirestore();
  
  const { data: leads, loading: leadsLoading } = useCollection<Lead>(collection(firestore, 'leads'));
  const { data: allUsers } = useCollection<any>(collection(firestore, 'users'));

  const [statusFilters, setStatusFilters] = React.useState<LeadStatus[]>([]);
  const [sourceFilters, setSourceFilters] = React.useState<LeadSource[]>([]);
  const [isAddLeadOpen, setIsAddLeadOpen] = React.useState(false);
  
  const loggedInUserId = authUser?.uid;
  const isEmployee = ['Admin', 'Manager', 'Sales Manager'].includes(currentRole);
  
  const filteredLeads = React.useMemo(() => {
    if (!leads) return [];
    const userLeads = isEmployee ? leads : leads.filter(lead => lead.ownerId === loggedInUserId);
    
    return userLeads.filter(lead => {
      const statusMatch = statusFilters.length === 0 || statusFilters.includes(lead.status);
      const sourceMatch = sourceFilters.length === 0 || sourceFilters.includes(lead.source);
      return statusMatch && sourceMatch;
    });
  }, [leads, statusFilters, sourceFilters, isEmployee, loggedInUserId]);

  const kpis = React.useMemo(() => {
    if (!leads) return { total: 0, converted: 0, conversionRate: 0 };
    const relevantLeads = isEmployee ? leads : leads.filter(lead => lead.ownerId === loggedInUserId);
    const total = relevantLeads.length;
    const converted = relevantLeads.filter(l => l.status === 'Converted').length;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;
    return { total, converted, conversionRate };
  }, [leads, isEmployee, loggedInUserId]);

  const handleSaveLead = async (newLeadData: Omit<Lead, 'id' | 'createdAt' | 'ownerId' | 'status'>) => {
    if (!loggedInUserId) {
        toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to create a lead.' });
        return;
    }
    const newLead: Omit<Lead, 'id'> = {
      ...newLeadData,
      status: 'New',
      createdAt: new Date().toISOString(),
      ownerId: loggedInUserId,
    };
    await addDoc(collection(firestore, 'leads'), newLead);
    toast({
      title: 'Lead Created',
      description: `${newLead.name} has been added to the pipeline.`,
    });
    setIsAddLeadOpen(false);
  };

  const findDuplicateOwner = (currentLead: Lead) => {
    if (!leads || !allUsers) return null;
    const duplicate = leads.find(l => l.id !== currentLead.id && l.phone === currentLead.phone && l.ownerId !== currentLead.ownerId);
    if (duplicate) {
      return allUsers.find(u => u.id === duplicate.ownerId)?.name || 'another user';
    }
    return null;
  };
  
  const handleCreateQuotation = async (lead: Lead) => {
    const leadRef = doc(firestore, 'leads', lead.id);
    await setDoc(leadRef, { status: 'Proposal Sent' }, { merge: true });
    
    toast({
      title: 'Status Updated',
      description: `${lead.name}'s status changed to "Proposal Sent".`,
    });
    
    localStorage.setItem('quotationLead', JSON.stringify(lead));
    router.push(`/dashboard/sales/create-quotation?leadName=${lead.name}`);
  };

  const handleStatusFilterChange = (status: LeadStatus) => {
    setStatusFilters(prev => (prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]));
  };
  
  const handleSourceFilterChange = (source: LeadSource) => {
    setSourceFilters(prev => (prev.includes(source) ? prev.filter(s => s !== source) : [...prev, s]));
  };

  return (
    <>
      <PageHeader title="Lead Management">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Filter</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <ScrollArea className="h-40">
                {allStatuses.map(status => (
                  <DropdownMenuCheckboxItem key={status} checked={statusFilters.includes(status)} onCheckedChange={() => handleStatusFilterChange(status)}>
                    {status}
                  </DropdownMenuCheckboxItem>
                ))}
              </ScrollArea>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Source</DropdownMenuLabel>
              {allSources.map(source => (
                <DropdownMenuCheckboxItem key={source} checked={sourceFilters.includes(source)} onCheckedChange={() => handleSourceFilterChange(source)}>
                  {source}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="gap-1" onClick={() => setIsAddLeadOpen(true)}>
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Add Lead</span>
          </Button>
        </div>
      </PageHeader>
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All leads in the pipeline.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Converted Leads</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.converted}</div>
            <p className="text-xs text-muted-foreground">Leads successfully converted to customers.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">The percentage of leads that convert.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales Pipeline</CardTitle>
          <CardDescription>Manage and track all potential customers.</CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Mobile No.</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  {isEmployee && <TableHead>Owner</TableHead>}
                  <TableHead>Created At</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadsLoading ? (
                  <TableRow><TableCell colSpan={isEmployee ? 7 : 6} className="h-24 text-center">Loading leads...</TableCell></TableRow>
                ) : filteredLeads.map((lead) => {
                  const duplicateOwner = findDuplicateOwner(lead);
                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="font-medium">{lead.name}</div>
                        <div className="text-sm text-muted-foreground">{lead.company}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{lead.phone}</span>
                          {duplicateOwner && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Duplicate lead owned by {duplicateOwner}.</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{lead.source}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(getStatusBadgeVariant(lead.status))}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      {isEmployee && <TableCell>{allUsers?.find(u => u.id === lead.ownerId)?.name || 'Unknown'}</TableCell>}
                      <TableCell>{format(new Date(lead.createdAt), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateQuotation(lead)}>
                              Create Quotation
                            </DropdownMenuItem>
                            <DropdownMenuItem>Mark as Converted</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600 focus:text-red-600">Mark as Lost</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild><a href={`tel:${lead.phone}`}><Phone className="mr-2 h-4 w-4" /> Call</a></DropdownMenuItem>
                            {lead.email && <DropdownMenuItem asChild><a href={`mailto:${lead.email}`}><FileText className="mr-2 h-4 w-4" /> Email</a></DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
      <AddLeadDialog 
        open={isAddLeadOpen}
        onOpenChange={setIsAddLeadOpen}
        onSave={handleSaveLead}
      />
    </>
  );
}

    