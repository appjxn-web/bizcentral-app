

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { PurchaseRequest, RequestStatus, Party, Product, CompanyInfo } from '@/lib/types';
import { 
  ListFilter, 
  Clock, 
  CheckCircle, 
  ShoppingCart, 
  FileText, 
  PlusCircle, 
  MoreHorizontal, 
  Loader2,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, updateDoc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';
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
import { Badge } from '@/components/ui/badge';
import { writeBatch } from 'firebase/firestore';


// --- Helper for Badge Colors ---
function getStatusBadgeVariant(status: RequestStatus) {
  const variants: Record<RequestStatus, string> = {
    Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    Approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Ordered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    Completed: 'bg-green-100 text-green-800'
  };
  return variants[status as keyof typeof variants] || 'bg-gray-100';
}

const allStatuses: RequestStatus[] = ['Pending', 'Approved', 'Rejected', 'Ordered', 'Completed'];

export default function PurchaseRequestedPage() {
  const { toast } = useToast();
  const router = useRouter();
  const firestore = useFirestore();
  
  // Data fetching
  const { data: requests, loading } = useCollection<PurchaseRequest>(collection(firestore, 'purchaseRequests'));
  const { data: partiesData } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: allProducts } = useCollection<Product>(collection(firestore, 'products'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));

  // UI State
  const [selectedRequests, setSelectedRequests] = React.useState<string[]>([]);
  const [requestForPo, setRequestForPo] = React.useState<PurchaseRequest | null>(null);
  const [isDraftPoDialogOpen, setIsDraftPoDialogOpen] = React.useState(false);
  const [editingRequest, setEditingRequest] = React.useState<PurchaseRequest | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isCombinePoDialogOpen, setIsCombinePoDialogOpen] = React.useState(false);
  const [combinedPoSupplierId, setCombinedPoSupplierId] = React.useState<string>('');
  const [statusFilters, setStatusFilters] = React.useState<RequestStatus[]>([]);
  const [supplierFilters, setSupplierFilters] = React.useState<string[]>([]);

  // KPIs
  const kpis = React.useMemo(() => {
    if (!requests) return { total: 0, pending: 0, approved: 0, ordered: 0 };
    return {
      total: requests.length,
      pending: requests.filter(r => r.status === 'Pending').length,
      approved: requests.filter(r => r.status === 'Approved').length,
      ordered: requests.filter(r => r.status === 'Ordered').length,
    };
  }, [requests]);

  const preferredSuppliersForSelectedRequest = React.useMemo(() => {
    if (!requestForPo || !allProducts || !partiesData) return [];

    const product = allProducts.find(p => p.id === requestForPo.productId);
    if (!product || !product.preferredSupplierIds || product.preferredSupplierIds.length === 0) {
      // Fallback: return all suppliers if none are preferred
      return partiesData.filter(p => p.type === 'Supplier' || p.type === 'Vendor');
    }

    return partiesData.filter(party => product.preferredSupplierIds?.includes(party.id));
  }, [requestForPo, allProducts, partiesData]);
  
  const handleStatusFilterChange = (status: RequestStatus) => {
    setStatusFilters(prev => 
        prev.includes(status) 
            ? prev.filter(s => s !== status) 
            : [...prev, status]
    );
  };
  
   const handleSupplierFilterChange = (supplierName: string) => {
    setSupplierFilters(prev => 
        prev.includes(supplierName) 
            ? prev.filter(s => s !== supplierName) 
            : [...prev, s]
    );
  };

  const filteredRequests = React.useMemo(() => {
    if (!requests || !allProducts || !partiesData) return [];
    
    let filtered = requests;

    if (statusFilters.length > 0) {
        filtered = filtered.filter(req => statusFilters.includes(req.status));
    }
    
    if (supplierFilters.length > 0) {
        filtered = filtered.filter(req => {
            const product = allProducts.find(p => p.id === req.productId);
            const preferredSupplierNames = product?.preferredSupplierIds?.map(id => partiesData.find(p => p.id === id)?.name).filter(Boolean) || [];
            return preferredSupplierNames.some(name => supplierFilters.includes(name));
        });
    }

    // Ensure uniqueness
    const uniqueIds = new Set();
    return filtered.filter(req => {
        if (uniqueIds.has(req.id)) {
            return false;
        } else {
            uniqueIds.add(req.id);
            return true;
        }
    });
  }, [requests, allProducts, partiesData, statusFilters, supplierFilters]);

  const allPreferredSuppliers = React.useMemo(() => {
    if (!allProducts || !partiesData) return [];
    const supplierIds = new Set(allProducts.flatMap(p => p.preferredSupplierIds || []));
    return Array.from(new Set(partiesData.filter(p => supplierIds.has(p.id)).map(p => p.name)));
  }, [allProducts, partiesData]);

  // Actions
  const handleUpdateStatus = async (id: string, status: RequestStatus) => {
    try {
      await updateDoc(doc(firestore, 'purchaseRequests', id), { status });
      toast({ title: 'Success', description: `Request marked as ${status}` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update status' });
    }
  };

  const handleDeleteRequest = async (id: string) => {
    try {
      await deleteDoc(doc(firestore, 'purchaseRequests', id));
      toast({ title: 'Deleted', description: 'Request removed successfully' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete' });
    }
  };

  const handleSaveEdit = async (id: string, qty: number) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(firestore, 'purchaseRequests', id), { quantity: qty });
      setIsEditDialogOpen(false);
      toast({ title: 'Updated', description: 'Quantity updated successfully' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalizeDraftPo = async (supplierId: string, qty: number) => {
    if (!requestForPo || !settingsData?.prefixes || !requests) return;
    setIsSaving(true);
    try {
      const supplier = partiesData?.find(p => p.id === supplierId);
      const product = allProducts?.find(p => p.id === requestForPo.productId);
      
      const newPoId = getNextDocNumber('Purchase Order', settingsData.prefixes, []);

      const poData = {
        id: newPoId,
        supplierId,
        supplierName: supplier?.name || 'Unknown',
        date: new Date().toISOString(),
        status: 'Draft',
        items: [{
          productId: requestForPo.productId,
          productName: requestForPo.productName,
          quantity: qty,
          rate: product?.cost || 0,
          amount: (product?.cost || 0) * qty,
        }],
        createdAt: serverTimestamp(),
        requestId: requestForPo.id,
      };

      await setDoc(doc(firestore, 'purchaseOrders', newPoId), poData);
      await updateDoc(doc(firestore, 'purchaseRequests', requestForPo.id), { status: 'Ordered' });

      toast({ title: 'Draft PO Created', description: `Order ${newPoId} generated.` });
      setIsDraftPoDialogOpen(false);
      router.push('/dashboard/procurement/purchase-orders');
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to create PO' });
    } finally {
      setIsSaving(false);
    }
  };
  
    const handleCreateCombinedPo = async () => {
    if (selectedRequests.length === 0 || !combinedPoSupplierId) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Select requests and a supplier.' });
      return;
    }
    if (!settingsData?.prefixes || !requests) return;
    
    setIsSaving(true);
    try {
      const supplier = partiesData?.find(p => p.id === combinedPoSupplierId);
      const newPoId = getNextDocNumber('Purchase Order', settingsData.prefixes, []);

      const poItems = selectedRequests.map(reqId => {
        const req = requests.find(r => r.id === reqId);
        const product = allProducts?.find(p => p.id === req?.productId);
        return {
          productId: req!.productId,
          productName: req!.productName,
          quantity: req!.quantity,
          rate: product?.cost || 0,
          amount: (product?.cost || 0) * req!.quantity,
        };
      });

      const poData = {
        id: newPoId,
        supplierId: combinedPoSupplierId,
        supplierName: supplier?.name || 'Unknown',
        date: new Date().toISOString(),
        status: 'Draft',
        items: poItems,
        createdAt: serverTimestamp(),
      };

      const batch = writeBatch(firestore);
      batch.set(doc(firestore, 'purchaseOrders', newPoId), poData);
      selectedRequests.forEach(reqId => {
        batch.update(doc(firestore, 'purchaseRequests', reqId), { status: 'Ordered' });
      });

      await batch.commit();

      toast({ title: 'Combined PO Created', description: `Draft PO ${newPoId} created.` });
      setIsCombinePoDialogOpen(false);
      setSelectedRequests([]);
      router.push('/dashboard/procurement/purchase-orders');
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error' });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <>
      <PageHeader title="Purchase Requests" />

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{kpis.total}</div><p className="text-xs text-muted-foreground uppercase font-bold">Total</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-600">{kpis.pending}</div><p className="text-xs text-muted-foreground uppercase font-bold">Pending</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-600">{kpis.approved}</div><p className="text-xs text-muted-foreground uppercase font-bold">Approved</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600">{kpis.ordered}</div><p className="text-xs text-muted-foreground uppercase font-bold">Ordered</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Requests</CardTitle>
          <div className="flex justify-between items-center">
            <CardDescription>Manage and track internal procurement requests.</CardDescription>
            {selectedRequests.length > 0 && (
              <Button onClick={() => setIsCombinePoDialogOpen(true)}>
                Create PO for Selected ({selectedRequests.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"><Checkbox onCheckedChange={(checked) => setSelectedRequests(checked ? requests?.map(r => r.id) || [] : [])} /></TableHead>
                <TableHead>Request #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>
                    <div className="flex items-center gap-2">
                        Preferred Suppliers
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6"><ListFilter className="h-3.5 w-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Filter by Supplier</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {allPreferredSuppliers.map(supplier => (
                                    <DropdownMenuCheckboxItem
                                    key={supplier}
                                    checked={supplierFilters.includes(supplier)}
                                    onCheckedChange={() => handleSupplierFilterChange(supplier)}
                                    >
                                    {supplier}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    Status
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <ListFilter className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {allStatuses.map((status) => (
                          <DropdownMenuCheckboxItem
                            key={status}
                            checked={statusFilters.includes(status)}
                            onCheckedChange={() => handleStatusFilterChange(status)}
                          >
                            {status}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="h-24 text-center"><Loader2 className="animate-spin mx-auto"/></TableCell></TableRow>
              ) : filteredRequests?.map((req) => {
                  const product = allProducts?.find(p => p.id === req.productId);
                  const preferredSuppliers = product?.preferredSupplierIds?.map(id => partiesData?.find(p => p.id === id)?.name).filter(Boolean) || [];

                  return (
                    <TableRow key={req.id}>
                      <TableCell><Checkbox checked={selectedRequests.includes(req.id)} onCheckedChange={() => setSelectedRequests(prev => prev.includes(req.id) ? prev.filter(id => id !== req.id) : [...prev, req.id])} /></TableCell>
                      <TableCell className="font-mono font-bold">{req.id}</TableCell>
                      <TableCell>{req.productName}</TableCell>
                      <TableCell>{req.quantity}</TableCell>
                       <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {preferredSuppliers.length > 0 ? preferredSuppliers.map(name => (
                            <Badge key={name} variant="secondary">{name}</Badge>
                          )) : <span className="text-xs text-muted-foreground">N/A</span>}
                        </div>
                      </TableCell>
                      <TableCell>{req.requestedBy}</TableCell>
                      <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>{req.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingRequest(req); setIsEditDialogOpen(true); }}>Edit Request</DropdownMenuItem>
                            
                            {req.status === 'Pending' && (
                              <>
                                <DropdownMenuItem onClick={() => handleUpdateStatus(req.id, 'Approved')} className="text-blue-600">Approve</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleUpdateStatus(req.id, 'Rejected')} className="text-red-600">Reject</DropdownMenuItem>
                              </>
                            )}

                            {req.status === 'Approved' && (
                              <DropdownMenuItem onClick={() => { setRequestForPo(req); setIsDraftPoDialogOpen(true); }} className="font-bold text-green-600">
                                Create Draft PO
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500">Delete</DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>This will permanently delete the request for {req.productName}.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteRequest(req.id)} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
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

      {/* --- DIALOGS --- */}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Quantity</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <Label>Quantity for {editingRequest?.productName}</Label>
            <Input 
              type="number" 
              defaultValue={editingRequest?.quantity} 
              onChange={(e) => setEditingRequest(prev => prev ? {...prev, quantity: Number(e.target.value)} : null)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => editingRequest && handleSaveEdit(editingRequest.id, editingRequest.quantity)} disabled={isSaving}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDraftPoDialogOpen} onOpenChange={setIsDraftPoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Draft Purchase Order</DialogTitle>
            <DialogDescription>Convert request {requestForPo?.id} into a Purchase Order.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select onValueChange={(val) => setRequestForPo(prev => prev ? {...prev, supplierId: val} : null)}>
                <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                <SelectContent>
                  {preferredSuppliersForSelectedRequest.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Final Order Quantity</Label>
              <Input 
                type="number" 
                defaultValue={requestForPo?.quantity} 
                onChange={(e) => setRequestForPo(prev => prev ? {...prev, quantity: Number(e.target.value)} : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button 
              onClick={() => requestForPo?.supplierId && handleFinalizeDraftPo(requestForPo.supplierId, requestForPo.quantity)}
              disabled={isSaving || !requestForPo?.supplierId}
            >
              {isSaving ? <Loader2 className="animate-spin h-4 w-4"/> : "Create PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       <Dialog open={isCombinePoDialogOpen} onOpenChange={setIsCombinePoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Combined Purchase Order</DialogTitle>
            <DialogDescription>Combine {selectedRequests.length} requests into a single PO.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <p className="font-medium text-sm mb-2">Items to be included:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                {selectedRequests.map(reqId => {
                  const req = requests?.find(r => r.id === reqId);
                  return <li key={reqId}>{req?.productName} (Qty: {req?.quantity})</li>
                })}
              </ul>
            </div>
            <div className="space-y-2">
              <Label>Select Common Supplier</Label>
              <Select onValueChange={setCombinedPoSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select a supplier" /></SelectTrigger>
                <SelectContent>
                  {partiesData?.filter(p => p.type === 'Supplier' || p.type === 'Vendor').map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleCreateCombinedPo} disabled={isSaving || !combinedPoSupplierId}>
              {isSaving ? <Loader2 className="animate-spin h-4 w-4"/> : "Create Combined PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
