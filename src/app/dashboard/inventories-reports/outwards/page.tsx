
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Check, ChevronsUpDown, Send, Package, Wrench, PackageSearch, Loader2, ChevronRight, ChevronDown, MoreHorizontal } from 'lucide-react';
import type { User, Product, SparesRequest, StockTransferRequest, UserProfile } from '@/lib/types';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useRole } from '../../_components/role-provider';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { writeBatch, doc, updateDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';
import type { BillOfMaterial, WorkOrder, IssuedItem, CoaLedger } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';


interface StockTransferItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
}

interface IssueDialogProps {
  request: WorkOrder | SparesRequest | null;
  bomItems: (BomItem & { availableStock: number; alreadyIssued: number })[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssue: (request: WorkOrder | SparesRequest, issuedItems: {productId: string; productName: string; issuedQty: number; rate: number}[], employeeId: string) => void;
  users: User[];
}

function IssueMaterialsDialog({ request, bomItems, open, onOpenChange, onIssue, users }: IssueDialogProps) {
  const [issuedItems, setIssuedItems] = React.useState<Map<string, { issuedQty: number; remarks: string }>>(new Map());
  const [selectedEmployee, setSelectedEmployee] = React.useState('');
  const [assigneeFilter, setAssigneeFilter] = React.useState('All');
  const { toast } = useToast();

  const isAdvanceRequest = request && 'engineerId' in request;

  React.useEffect(() => {
    if (request) {
      const initialItems = new Map();
      const itemsToProcess = isAdvanceRequest ? (request as SparesRequest).items : bomItems;
      
      itemsToProcess?.forEach(item => {
        const requiredQty = isAdvanceRequest ? (item as any).quantity : (item as any).quantity * (request as WorkOrder).quantity;
        const balanceQty = requiredQty - ((item as any).alreadyIssued || 0);
        initialItems.set(item.productId, { issuedQty: balanceQty, remarks: '' });
      });
      
      setIssuedItems(initialItems);
      const assignee = isAdvanceRequest ? (request as SparesRequest).engineerId : bomItems?.[0]?.assigneeId;
      setSelectedEmployee(assignee || '');
      setAssigneeFilter('All');
    }
  }, [request, bomItems, isAdvanceRequest]);

  const handleItemChange = (productId: string, field: 'issuedQty' | 'remarks', value: string | number) => {
    setIssuedItems(prev => {
      const newItems = new Map(prev);
      const currentItem = newItems.get(productId) || { issuedQty: 0, remarks: '' };
      newItems.set(productId, { ...currentItem, [field]: value });
      return newItems;
    });
  };
  
  const handleSubmit = () => {
    if (!request) return;
    
    const finalIssuedItems = Array.from(issuedItems.entries()).map(([productId, data]) => {
        const product = (isAdvanceRequest ? (request as SparesRequest).items : bomItems)?.find(item => item.productId === productId);
        return {
            productId,
            productName: product?.productName || 'Unknown',
            issuedQty: Number(data.issuedQty) || 0,
            rate: (product as any)?.rate || 0,
        };
    }).filter(item => item.issuedQty > 0);

    if (finalIssuedItems.length === 0) {
        toast({ variant: 'destructive', title: 'No Items to Issue', description: 'Please enter a quantity for at least one item.' });
        return;
    }
    
    const issueToEmployee = isAdvanceRequest ? (request as SparesRequest).engineerId : selectedEmployee;
    if (!issueToEmployee) {
      toast({ variant: 'destructive', title: 'Missing Employee', description: 'Please select an employee to issue materials to.' });
      return;
    }

    onIssue(request, finalIssuedItems, issueToEmployee);
  };
  
  const allRequestItems = isAdvanceRequest ? (request as SparesRequest)?.items : bomItems;

  const uniqueAssignees = React.useMemo(() => {
    if (!allRequestItems || isAdvanceRequest) return [];
    const assigneeIds = new Set(allRequestItems.map(item => item.assigneeId).filter(Boolean));
    return Array.from(assigneeIds).map(id => users.find(u => u.id === id)).filter(Boolean) as User[];
  }, [allRequestItems, isAdvanceRequest, users]);

  const filteredItemsToDisplay = React.useMemo(() => {
    if (!allRequestItems) return [];
    if (assigneeFilter === 'All' || isAdvanceRequest) return allRequestItems;
    return allRequestItems.filter(item => item.assigneeId === assigneeFilter);
  }, [allRequestItems, assigneeFilter, isAdvanceRequest]);

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Issue Materials for {isAdvanceRequest ? 'Advance Spares Request' : `Work Order: ${request.id}`}</DialogTitle>
          <DialogDescription>
            Confirm the components to be issued.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <div className="flex items-center gap-4">
                <div className="w-1/2">
                    <Label htmlFor="issue-to-employee">Issue To</Label>
                    <p className="font-semibold">{users.find(u => u.id === (isAdvanceRequest ? (request as SparesRequest).engineerId : selectedEmployee))?.name || 'Unassigned'}</p>
                </div>
                 {!isAdvanceRequest && uniqueAssignees.length > 1 && (
                    <div className="w-1/2">
                        <Label htmlFor="assignee-filter">Filter by Assignee</Label>
                        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                            <SelectTrigger id="assignee-filter">
                                <SelectValue placeholder="Filter by employee" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Employees</SelectItem>
                                {uniqueAssignees.map(user => (
                                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                 )}
           </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Issue To</TableHead>
                <TableHead className="text-right">Required</TableHead>
                <TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-28 text-right">Issue Now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItemsToDisplay?.map(item => {
                const requiredQty = isAdvanceRequest ? (item as any).quantity : (item as any).quantity * (request as WorkOrder).quantity;
                const balanceQty = requiredQty - ((item as any).alreadyIssued || 0);
                const issuedData = issuedItems.get(item.productId) || { issuedQty: 0, remarks: '' };
                const isShortage = (item as any).availableStock < balanceQty;
                const assigneeName = users.find(u => u.id === (item as any).assigneeId)?.name || 'N/A';
                return (
                    <TableRow key={item.productId}>
                      <TableCell>{item.productName}</TableCell>
                       <TableCell>{assigneeName}</TableCell>
                      <TableCell className="text-right font-mono">{requiredQty}</TableCell>
                      <TableCell className="text-right font-mono">{(item as any).alreadyIssued || 0}</TableCell>
                      <TableCell className={cn("text-right font-mono", isShortage && 'text-red-500 font-bold')}>
                        {balanceQty}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input 
                            type="number"
                            value={issuedData.issuedQty}
                            onChange={(e) => handleItemChange(item.productId, 'issuedQty', e.target.value)}
                            className="text-right"
                            max={Math.min(balanceQty, (item as any).availableStock)}
                        />
                      </TableCell>
                    </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleSubmit}>
            <Send className="mr-2 h-4 w-4" /> Confirm & Issue Materials
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getIssueStatus(workOrder: WorkOrder, allBoms: BillOfMaterial[]) {
    if (!workOrder.items) return { text: 'Pending', variant: 'bg-yellow-100 text-yellow-800' };
    
    const bom = allBoms.find(b => b.productId === workOrder.productId);
    if (!bom) {
        return { text: 'BOM Missing', variant: 'bg-red-100 text-red-800' };
    }

    const isFullyIssued = bom.items.every(bomItem => {
        const totalRequired = bomItem.quantity * workOrder.quantity;
        const totalIssued = workOrder.issuedItems
            ?.filter(issued => issued.productId === bomItem.productId)
            .reduce((sum, item) => sum + item.issuedQty, 0) || 0;
        return totalIssued >= totalRequired;
    });

    if (isFullyIssued) {
        return { text: 'Issued', variant: 'bg-green-100 text-green-800' };
    } 
    
    if (workOrder.issuedItems && workOrder.issuedItems.length > 0) {
        return { text: 'Partially Issued', variant: 'bg-blue-100 text-blue-800' };
    }

    return { text: 'Pending', variant: 'bg-yellow-100 text-yellow-800' };
}

function getSparesRequestStatus(request: SparesRequest) {
    const variants: Record<SparesRequest['status'], string> = {
        Pending: 'bg-yellow-100 text-yellow-800',
        Approved: 'bg-blue-100 text-blue-800',
        Issued: 'bg-green-100 text-green-800',
        Rejected: 'bg-red-100 text-red-800',
        Returned: 'bg-gray-100 text-gray-800',
    }
    return { text: request.status, variant: variants[request.status] };
}

function WorkOrderRow({ workOrder, onIssueClick, allProducts, allBoms }: { workOrder: WorkOrder, onIssueClick: (wo: WorkOrder) => void, allProducts: Product[], allBoms: BillOfMaterial[] }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const issueStatus = getIssueStatus(workOrder, allBoms);

    const bom = React.useMemo(() => {
        const foundBom = allBoms.find(b => b.productId === workOrder.productId);
        if (!foundBom) return null;
        return foundBom.items.map(item => {
            const product = allProducts.find(p => p.id === item.productId);
            const totalIssued = workOrder.issuedItems
                ?.filter(issued => issued.productId === item.productId)
                .reduce((sum, item) => sum + item.issuedQty, 0) || 0;
            return {
                ...item,
                availableStock: product?.openingStock || 0,
                totalIssued
            };
        });
    }, [workOrder, allProducts, allBoms]);

    return (
        <Collapsible asChild key={workOrder.id} open={isOpen} onOpenChange={setIsOpen}>
            <TableBody>
                <TableRow>
                    <TableCell>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                <span className="sr-only">Toggle details</span>
                            </Button>
                        </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="font-mono">{workOrder.id}</TableCell>
                    <TableCell>{workOrder.productName}</TableCell>
                    <TableCell>{workOrder.quantity}</TableCell>
                    <TableCell>{format(new Date(workOrder.createdAt), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                        <Badge variant="outline" className={cn('dark:bg-opacity-20', issueStatus.variant)}>
                            {issueStatus.text}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => onIssueClick(workOrder)}>
                        Issue Materials
                      </Button>
                    </TableCell>
                </TableRow>
                <CollapsibleContent asChild>
                    <TableRow>
                        <TableCell colSpan={7} className="p-0">
                            <div className="p-4 bg-muted/50">
                                <h4 className="font-semibold mb-2">Required Components:</h4>
                                {bom ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Component</TableHead>
                                                <TableHead className="text-right">Required</TableHead>
                                                <TableHead className="text-right">Issued</TableHead>
                                                <TableHead className="text-right">Balance</TableHead>
                                                <TableHead className="text-right">Available</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {bom.map(item => {
                                                const requiredQty = item.quantity * workOrder.quantity;
                                                const balance = requiredQty - item.totalIssued;
                                                return (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{item.productName}</TableCell>
                                                        <TableCell className="text-right font-mono">{requiredQty}</TableCell>
                                                        <TableCell className="text-right font-mono">{item.totalIssued}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold">{balance}</TableCell>
                                                        <TableCell className={cn("text-right font-mono", item.availableStock < balance && 'text-red-500 font-bold')}>
                                                            {item.availableStock}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No Bill of Material found for this product.</p>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                </CollapsibleContent>
            </TableBody>
        </Collapsible>
    )
}

function SparesRequestRow({ request, onIssueClick, allProducts }: { request: SparesRequest, onIssueClick: (req: SparesRequest) => void, allProducts: Product[] }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const issueStatus = getSparesRequestStatus(request);

    return (
        <Collapsible asChild key={request.id} open={isOpen} onOpenChange={setIsOpen}>
            <TableBody>
                <TableRow>
                    <TableCell>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                        </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="font-mono">{request.id}</TableCell>
                    <TableCell>{request.engineerName}</TableCell>
                    <TableCell>{request.type}</TableCell>
                    <TableCell>{format(new Date(request.requestDate), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                        <Badge variant="outline" className={cn('dark:bg-opacity-20', issueStatus.variant)}>
                            {issueStatus.text}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => onIssueClick(request)} disabled={request.status !== 'Approved'}>
                        Issue Spares
                      </Button>
                    </TableCell>
                </TableRow>
                <CollapsibleContent asChild>
                    <TableRow>
                        <TableCell colSpan={7} className="p-0">
                            <div className="p-4 bg-muted/50">
                                <h4 className="font-semibold mb-2">Requested Spares:</h4>
                                <Table>
                                    <TableHeader><TableRow><TableHead>Part</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {request.items.map(item => (
                                            <TableRow key={item.productId}>
                                                <TableCell>{item.productName}</TableCell>
                                                <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </TableCell>
                    </TableRow>
                </CollapsibleContent>
            </TableBody>
        </Collapsible>
    )
}

function getStatusBadgeVariant(status: string) {
    const variants: Record<string, string> = {
      'Pending Approval': 'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-blue-100 text-blue-800',
      'Rejected': 'bg-red-100 text-red-800',
      'Shipped': 'bg-green-100 text-green-800',
    };
    return variants[status] || 'bg-gray-100';
}

function DispatchDialog({ request, open, onOpenChange, onDispatch }: { request: StockTransferRequest | null, open: boolean, onOpenChange: (open: boolean) => void, onDispatch: (id: string, details: any) => void }) {
    const [vehicleNo, setVehicleNo] = React.useState('');
    const [driverName, setDriverName] = React.useState('');
    const [driverPhone, setDriverPhone] = React.useState('');
    const [remarks, setRemarks] = React.useState('');

    React.useEffect(() => {
        if (!open) {
            setVehicleNo('');
            setDriverName('');
            setDriverPhone('');
            setRemarks('');
        }
    }, [open]);

    const handleSubmit = () => {
        if (!vehicleNo || !driverName || !driverPhone) {
            alert('Please fill all dispatch details.');
            return;
        }
        onDispatch(request!.id, { vehicleNo, driverName, driverPhone, remarks });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Dispatch Stock Transfer</DialogTitle>
                    <DialogDescription>Enter logistics details for request to {request?.partnerName}.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="vehicle-no">Vehicle Number</Label>
                        <Input id="vehicle-no" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="driver-name">Driver Name</Label>
                        <Input id="driver-name" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="driver-phone">Driver Phone</Label>
                        <Input id="driver-phone" type="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="remarks">Remarks (Optional)</Label>
                        <Textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleSubmit}>Confirm Dispatch</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function StockTransferTab() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { data: partners } = useCollection<Party>(query(collection(firestore, 'parties'), where('type', '==', 'Partner')));
  const { data: products } = useCollection<Product>(collection(firestore, 'products'));
  const [openRequestId, setOpenRequestId] = React.useState<string | null>(null);

  const [selectedPartnerId, setSelectedPartnerId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<StockTransferItem[]>([{ id: `item-${Date.now()}`, productId: '', productName: '', quantity: 1 }]);
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [dispatchingRequest, setDispatchingRequest] = React.useState<StockTransferRequest | null>(null);

  const handleAddItem = () => {
    setItems(prev => [...prev, { id: `item-${Date.now()}`, productId: '', productName: '', quantity: 1 }]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: 'productId' | 'quantity', value: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'productId') {
            const product = products?.find(p => p.id === value);
            if (product) updatedItem.productName = product.name;
          }
          return updatedItem;
        }
        return item;
      })
    );
  };
  
  const handleSubmit = async () => {
    if (!selectedPartnerId || items.length === 0 || items.some(i => !i.productId || Number(i.quantity) <= 0)) {
        toast({ variant: 'destructive', title: 'Missing Information' });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const partner = partners?.find(p => p.id === selectedPartnerId);
        const requestingUserDoc = await getDoc(doc(firestore, 'users', user!.uid));
        const requestingUser = requestingUserDoc.data() as UserProfile | undefined;
        
        const requestData = {
            requestingUserId: user?.uid,
            requestingUserName: requestingUser?.businessName || user?.displayName,
            partnerId: selectedPartnerId,
            partnerName: (partner as UserProfile)?.businessName || partner?.name,
            items: items.map(({ id, ...rest }) => ({...rest, quantity: Number(rest.quantity)})),
            status: 'Pending Approval',
            createdAt: serverTimestamp(),
            notes,
        };

        await addDoc(collection(firestore, 'stockTransferRequests'), requestData);
        toast({ title: 'Request Submitted', description: 'Stock transfer request has been sent for approval.' });
        
        setSelectedPartnerId(null);
        setItems([{ id: `item-${Date.now()}`, productId: '', productName: '', quantity: 1 }]);
        setNotes('');
    } catch(e) {
        console.error("Failed to submit stock transfer request:", e);
        toast({ variant: 'destructive', title: 'Submission Failed' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDispatchRequest = async (id: string, details: any) => {
    try {
      const requestRef = doc(firestore, 'stockTransferRequests', id);
      await updateDoc(requestRef, {
        status: 'Shipped',
        shippedAt: serverTimestamp(),
        shippingDetails: details,
      });
      toast({ title: 'Dispatch Confirmed', description: 'Request status updated to Shipped.' });
      setDispatchingRequest(null);
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Dispatch Failed' });
    }
  };

  const userRequestsQuery = React.useMemo(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'stockTransferRequests'),
      orderBy('createdAt', 'desc')
    );
  }, [user, firestore]);

  const { data: userRequests, loading: requestsLoading } = useCollection<StockTransferRequest>(userRequestsQuery);

  return (
    <>
        <Card>
          <CardHeader>
            <CardTitle>Create Stock Transfer</CardTitle>
            <CardDescription>Request to move inventory from the main warehouse to a partner location.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="max-w-md space-y-2">
                <Label>To Partner</Label>
                <Select onValueChange={setSelectedPartnerId} value={selectedPartnerId || ''}>
                    <SelectTrigger><SelectValue placeholder="Select a partner..." /></SelectTrigger>
                    <SelectContent>
                        {partners?.map(p => <SelectItem key={p.id} value={p.id}>{(p as UserProfile).businessName || p.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Items to Transfer</Label>
                <div className="border rounded-md mt-2">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[60%]">Product</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead className="w-[50px]"><span className="sr-only">Remove</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                         <Select value={item.productId} onValueChange={(value) => handleItemChange(item.id, 'productId', value)}>
                                            <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                                            <SelectContent>
                                                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (Stock: {p.openingStock})</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} />
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                     <Button variant="outline" size="sm" onClick={handleAddItem} className="m-2">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                    </Button>
                </div>
            </div>
            <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes for the approver..." />
            </div>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit for Approval
            </Button>
          </CardContent>
        </Card>
        
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>All Stock Transfer Requests</CardTitle>
            <CardDescription>A history of all submitted stock transfer requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Request Date</TableHead>
                  <TableHead>Requesting User</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                   <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              {requestsLoading ? (
                <TableBody><TableRow><TableCell colSpan={7} className="h-24 text-center">Loading requests...</TableCell></TableRow></TableBody>
              ) : userRequests && userRequests.length > 0 ? (
                userRequests.map(req => (
                    <Collapsible asChild key={req.id} open={openRequestId === req.id} onOpenChange={(isOpen) => setOpenRequestId(isOpen ? req.id : null)}>
                        <TableBody>
                        <TableRow>
                            <TableCell>
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <ChevronRight className={cn("h-4 w-4 transition-transform", openRequestId === req.id && "rotate-90")} />
                                </Button>
                            </CollapsibleTrigger>
                            </TableCell>
                            <TableCell>{req.createdAt ? format(req.createdAt.toDate(), 'dd/MM/yyyy') : 'Pending'}</TableCell>
                            <TableCell>{req.requestingUserName}</TableCell>
                            <TableCell>{req.partnerName}</TableCell>
                            <TableCell>{req.items.length}</TableCell>
                            <TableCell>
                            <Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>
                                {req.status}
                            </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                {req.status === 'Approved' && (
                                    <Button size="sm" onClick={() => setDispatchingRequest(req)}>
                                        Dispatch
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                            <TableRow>
                                <TableCell colSpan={7} className="p-0">
                                    <div className="p-4 bg-muted/50">
                                        <h4 className="font-semibold text-sm mb-2">Requested Items:</h4>
                                        <Table>
                                        <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Quantity</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {req.items.map(item => (
                                            <TableRow key={item.productId}>
                                                <TableCell>{item.productName}</TableCell>
                                                <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                            </TableRow>
                                            ))}
                                        </TableBody>
                                        </Table>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </CollapsibleContent>
                        </TableBody>
                    </Collapsible>
                ))
              ) : (
                <TableBody><TableRow>
                  <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                    No requests have been made yet.
                  </TableCell>
                </TableRow></TableBody>
              )}
            </Table>
          </CardContent>
        </Card>
        <DispatchDialog
            request={dispatchingRequest}
            open={!!dispatchingRequest}
            onOpenChange={() => setDispatchingRequest(null)}
            onDispatch={handleDispatchRequest}
        />
    </>
  );
}

export default function OutwardsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const { data: workOrders, loading: woLoading } = useCollection<WorkOrder>(query(collection(firestore, 'workOrders'), where('status', '==', 'In Progress')));
  const { data: servicePartRequests, loading: serviceRequestsLoading } = useCollection<SparesRequest>(query(collection(firestore, 'sparesRequests'), where('type', '==', 'Service'), where('status', '==', 'Approved')));
  const { data: advanceSparesRequests, loading: advanceRequestsLoading } = useCollection<SparesRequest>(query(collection(firestore, 'sparesRequests'), where('type', '==', 'Advance'), where('status', '==', 'Approved')));

  const { data: allProducts } = useCollection<Product>(collection(firestore, 'products'));
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  const { data: allBoms, loading: bomsLoading } = useCollection<BillOfMaterial>(collection(firestore, 'boms'));
  const { data: allUsers } = useCollection<User>(collection(firestore, 'users'));
  
  const [isIssueDialogOpen, setIsIssueDialogOpen] = React.useState(false);
  const [selectedRequest, setSelectedRequest] = React.useState<WorkOrder | SparesRequest | null>(null);
  
  const productionRequests = workOrders || [];
  
  const kpis = {
    pendingProduction: productionRequests.length,
    pendingService: servicePartRequests?.length || 0,
    pendingAdvance: advanceSparesRequests?.length || 0,
  };

  const bomForSelectedWO = React.useMemo(() => {
    if (!selectedRequest || 'engineerId' in selectedRequest || !allProducts || !allBoms) return null;
    const bom = allBoms.find(b => b.productId === (selectedRequest as WorkOrder).productId);
    if (!bom) return null;

    return bom.items.map(item => {
      const product = allProducts.find(p => p.id === item.productId);
      const alreadyIssued = (selectedRequest as WorkOrder).issuedItems
            ?.filter(issued => issued.productId === item.productId)
            .reduce((sum, item) => sum + item.issuedQty, 0) || 0;
      return {
        ...item,
        availableStock: product?.openingStock || 0,
        alreadyIssued,
        rate: product?.cost || 0,
      };
    });
  }, [selectedRequest, allProducts, allBoms]);
  
  const handleOpenIssueDialog = (request: WorkOrder | SparesRequest) => {
    setSelectedRequest(request);
    setIsIssueDialogOpen(true);
  };
  
  const handleIssueMaterials = async (request: WorkOrder | SparesRequest, issuedItems: {productId: string; productName: string; issuedQty: number; rate: number}[], employeeId: string) => {
    if (!firestore || !coaLedgers || !allProducts) {
        toast({ variant: 'destructive', title: 'Error', description: 'Database service not available.' });
        return;
    }

    try {
        const batch = writeBatch(firestore);
        
        let narration = '';
        let targetDocRef;

        if ('engineerId' in request) { // It's a SparesRequest
            targetDocRef = doc(firestore, 'sparesRequests', request.id);
            narration = `Spares issued to ${request.engineerName} for Request #${request.id}`;
            batch.update(targetDocRef, { status: 'Issued', issuedAt: new Date().toISOString(), issuedBy: employeeId });
        } else { // It's a WorkOrder
            targetDocRef = doc(firestore, 'workOrders', request.id);
            narration = `Material issue for WO #${request.id}`;
            const newIssuedItems: IssuedItem[] = issuedItems.map(item => ({
                productId: item.productId,
                productName: item.productName,
                issuedQty: item.issuedQty,
                issuedTo: employeeId,
                issuedAt: new Date().toISOString(),
            }));
            batch.update(targetDocRef, {
                issuedItems: [
                    ...(request.issuedItems || []),
                    ...newIssuedItems
                ]
            });
        }
        
        const wipLedger = coaLedgers.find(l => l.name.includes('Work-in-Progress'));
        if (!wipLedger) throw new Error("WIP ledger not found.");
        
        let totalIssueValue = 0;
        const jvEntries = [];

        for (const item of issuedItems) {
            batch.update(doc(firestore, 'products', item.productId), {
                openingStock: increment(-item.issuedQty)
            });

            const product = allProducts.find(p => p.id === item.productId);
            const productLedger = coaLedgers.find(l => l.id === product?.coaAccountId);
            if (!productLedger) {
                console.warn(`Inventory ledger not found for product ${item.productName}. Skipping accounting entry for this item.`);
                continue;
            }

            const itemValue = item.issuedQty * item.rate;
            totalIssueValue += itemValue;

            jvEntries.push({
                accountId: productLedger.id,
                credit: itemValue,
                debit: 0,
            });
        }
        
        jvEntries.push({ accountId: wipLedger.id, debit: totalIssueValue, credit: 0 });

        const jvData = {
            date: new Date().toISOString().split('T')[0],
            narration,
            entries: jvEntries,
            createdAt: serverTimestamp(),
        };
        
        const jvRef = doc(collection(firestore, 'journalVouchers'));
        batch.set(jvRef, jvData);
        
        const notificationRef = doc(collection(firestore, 'users', employeeId, 'notifications'));
        batch.set(notificationRef, {
            type: 'info',
            title: 'Materials Issued',
            description: `Materials for ${ 'engineerId' in request ? `Request #${request.id}` : `Work Order #${request.id}` } have been issued to you.`,
            timestamp: serverTimestamp(),
            read: false,
        });

        await batch.commit();

        toast({
            title: 'Materials Issued & Accounts Updated',
            description: `Stock has been deducted, accounts posted, and employee notified for Request #${request.id}.`,
        });

        setIsIssueDialogOpen(false);
    } catch (e: any) {
        console.error("Error issuing materials:", e);
        toast({ variant: 'destructive', title: 'Failed to Issue', description: e.message || 'An unknown error occurred.' });
    }
  };

  return (
    <>
      <PageHeader title="Outwards / Material Issue" />
      
       <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">For Production</CardTitle>
            <Package className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pendingProduction}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">For Service</CardTitle>
            <Wrench className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pendingService}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Advance Spares</CardTitle>
            <PackageSearch className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pendingAdvance}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="production">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="production">Production Requests</TabsTrigger>
          <TabsTrigger value="service">Service Requests</TabsTrigger>
          <TabsTrigger value="advance">Advance Spares</TabsTrigger>
          <TabsTrigger value="transfer">Stock Transfer</TabsTrigger>
        </TabsList>
        <TabsContent value="production">
            <Card>
                <CardHeader>
                    <CardTitle>Material Requests from Production</CardTitle>
                    <CardDescription>Issue raw materials and components for active work orders.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                            <TableHead>Work Order ID</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Issue Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        {woLoading || bomsLoading ? (
                            <TableBody><TableRow><TableCell colSpan={7} className="text-center h-24">Loading...</TableCell></TableRow></TableBody>
                        ) : productionRequests.length > 0 ? (
                            productionRequests.map((wo) => (
                            <WorkOrderRow key={wo.id} workOrder={wo} onIssueClick={handleOpenIssueDialog} allProducts={allProducts || []} allBoms={allBoms || []} />
                            ))
                        ) : (
                            <TableBody><TableRow><TableCell colSpan={7} className="h-24 text-center">No active work orders require materials.</TableCell></TableRow></TableBody>
                        )}
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="service">
            <Card>
                <CardHeader>
                    <CardTitle>Spares Requests for Service</CardTitle>
                    <CardDescription>Issue parts for specific, ongoing customer service requests.</CardDescription>
                </CardHeader>
                <CardContent>
                   <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                                <TableHead>Request ID</TableHead>
                                <TableHead>Engineer</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        {serviceRequestsLoading ? (
                             <TableBody><TableRow><TableCell colSpan={7} className="text-center h-24">Loading...</TableCell></TableRow></TableBody>
                        ) : servicePartRequests?.map(req => (
                            <SparesRequestRow key={req.id} request={req} onIssueClick={handleOpenIssueDialog} allProducts={allProducts || []} />
                        ))}
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="advance">
             <Card>
                <CardHeader>
                    <CardTitle>Advance Spares Requests</CardTitle>
                    <CardDescription>Issue parts to engineers in advance for on-site visits.</CardDescription>
                </CardHeader>
                 <CardContent>
                   <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                                <TableHead>Request ID</TableHead>
                                <TableHead>Engineer</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        {advanceRequestsLoading ? (
                             <TableBody><TableRow><TableCell colSpan={7} className="text-center h-24">Loading...</TableCell></TableRow></TableBody>
                        ) : advanceSparesRequests?.map(req => (
                            <SparesRequestRow key={req.id} request={req} onIssueClick={handleOpenIssueDialog} allProducts={allProducts || []} />
                        ))}
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="transfer">
            <StockTransferTab />
        </TabsContent>
      </Tabs>
      
      <IssueMaterialsDialog
        request={selectedRequest}
        bomItems={bomForSelectedWO}
        open={isIssueDialogOpen}
        onOpenChange={setIsIssueDialogOpen}
        onIssue={handleIssueMaterials}
        users={allUsers || []}
      />
    </>
  );
}
