

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
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
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { MoreHorizontal, PlusCircle, Share2, Send, FileText, ClipboardList, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { PurchaseOrder, PoStatus } from '@/lib/types';


function getStatusBadgeVariant(status: PoStatus) {
  const variants: Record<PoStatus, string> = {
    Draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    Sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Canceled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    // Added for compatibility with purchase request statuses
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-blue-100 text-blue-800',
    Rejected: 'bg-red-100 text-red-800',
    Ordered: 'bg-green-100 text-green-800',
  };
  return variants[status as keyof typeof variants] || 'bg-gray-100';
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: purchaseOrders, loading } = useCollection<PurchaseOrder>(collection(firestore, 'purchaseOrders'));

  const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = React.useState(false);
  const [advancingPO, setAdvancingPO] = React.useState<PurchaseOrder | null>(null);
  const [advanceAmount, setAdvanceAmount] = React.useState(0);

  const kpis = React.useMemo(() => {
    if (!purchaseOrders) return { total: 0, draft: 0, sent: 0, completed: 0 };
    const total = purchaseOrders.length;
    const draft = purchaseOrders.filter(po => po.status === 'Draft').length;
    const sent = purchaseOrders.filter(po => po.status === 'Sent').length;
    const completed = purchaseOrders.filter(po => po.status === 'Completed').length;
    return { total, draft, sent, completed };
  }, [purchaseOrders]);
  
  const handleViewPo = (poId: string) => {
    router.push(`/dashboard/procurement/purchase-orders/view?id=${poId}`);
  };
  
  const handleDelete = async (poId: string) => {
    await deleteDoc(doc(firestore, 'purchaseOrders', poId));
    toast({
        title: 'Purchase Order Deleted',
        description: `PO ${poId} has been deleted.`,
    });
  };

  const handleEditPo = (poId: string) => {
    router.push(`/dashboard/procurement/create-purchase-order?id=${poId}`);
  };

  const handleShareOnWhatsApp = async (po: PurchaseOrder) => {
    const totalAmount = po.grandTotal;
    const message = `Hello ${po.supplierName},\n\nWe would like to place a Purchase Order.\n\n*PO Number:* ${po.id}\n*Date:* ${format(new Date(po.date), 'dd/MM/yyyy')}\n*Total Amount:* ~₹${totalAmount.toFixed(2)}\n\nWe will send the detailed PDF shortly.\n\nThank you,\nJXN Infra Equipment Private Limited`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');

    // Update status to 'Sent' in Firestore
    const poRef = doc(firestore, 'purchaseOrders', po.id);
    await updateDoc(poRef, { status: 'Sent' });

    toast({
        title: 'Purchase Order Shared',
        description: `PO ${po.id} has been marked as Sent.`,
    });
  };
  
  const openAdvanceDialog = (po: PurchaseOrder) => {
    const totalAmount = po.grandTotal;
    setAdvancingPO(po);
    setAdvanceAmount(totalAmount / 2); // Default to 50%
    setIsAdvanceDialogOpen(true);
  };
  
  const handleRequestAdvance = () => {
    if (!advancingPO) return;
    
    const allAdvanceRequests = JSON.parse(localStorage.getItem('advanceRequests') || '[]');
    const newRequest = {
        id: `ADV-${Date.now()}`,
        poId: advancingPO.id,
        supplierName: advancingPO.supplierName,
        poAmount: advancingPO.grandTotal,
        advanceAmount,
        requestDate: new Date().toISOString(),
        status: 'Pending Approval'
    };
    
    localStorage.setItem('advanceRequests', JSON.stringify([...allAdvanceRequests, newRequest]));
    toast({
      title: 'Advance Requested',
      description: `Request for an advance of ₹${advanceAmount.toFixed(2)} has been sent for approval.`,
    });
    
    setIsAdvanceDialogOpen(false);
  };

  return (
    <>
      <PageHeader title="Purchase Orders">
          <Button onClick={() => router.push('/dashboard/procurement/create-purchase-order')}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New PO
          </Button>
      </PageHeader>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total POs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All created purchase orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.draft}</div>
            <p className="text-xs text-muted-foreground">POs not yet sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.sent}</div>
            <p className="text-xs text-muted-foreground">Awaiting goods receipt</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.completed}</div>
            <p className="text-xs text-muted-foreground">Received and closed</p>
          </CardContent>
        </Card>
      </div>

      <Card>
          <CardHeader>
              <CardTitle>All Purchase Orders</CardTitle>
              <CardDescription>
                  Manage and track all purchase orders sent to suppliers.
              </CardDescription>
          </CardHeader>
          <CardContent>
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>PO Number</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                       <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
                    ) : purchaseOrders && purchaseOrders.length > 0 ? (
                        purchaseOrders.map(po => {
                           const totalAmount = po.grandTotal || 0;
                            return (
                                <TableRow key={po.id}>
                                    <TableCell className="font-mono cursor-pointer" onClick={() => handleViewPo(po.id)}>{po.id}</TableCell>
                                    <TableCell className="cursor-pointer" onClick={() => handleViewPo(po.id)}>{po.supplierName || 'N/A'}</TableCell>
                                    <TableCell className="cursor-pointer" onClick={() => handleViewPo(po.id)}>{format(new Date(po.date), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell className="cursor-pointer" onClick={() => handleViewPo(po.id)}>
                                        <Badge variant="outline" className={cn(getStatusBadgeVariant(po.status as PoStatus))}>
                                            {po.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono cursor-pointer" onClick={() => handleViewPo(po.id)}>₹{totalAmount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewPo(po.id); }}>
                                                    View & Download PDF
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditPo(po.id); }}>
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShareOnWhatsApp(po); }}>
                                                    <Share2 className="mr-2 h-4 w-4" /> Share on WhatsApp
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openAdvanceDialog(po)}>
                                                  <Send className="mr-2 h-4 w-4" /> Request for Advance
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem
                                                            onSelect={(e) => e.preventDefault()}
                                                            className="text-red-600 focus:text-red-600"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This action cannot be undone. This will permanently delete the purchase order {po.id}.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => handleDelete(po.id)}
                                                                className={buttonVariants({ variant: 'destructive' })}
                                                            >
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
                            <TableCell colSpan={6} className="h-24 text-center">
                                No purchase orders found.
                            </TableCell>
                        </TableRow>
                    )}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>
      
      <Dialog open={isAdvanceDialogOpen} onOpenChange={setIsAdvanceDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Request Advance for PO: {advancingPO?.id}</DialogTitle>
                <DialogDescription>Enter the amount you need to pay as an advance to the supplier.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label htmlFor="advance-amount">Advance Amount (₹)</Label>
                <Input
                    id="advance-amount"
                    type="number"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                />
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleRequestAdvance}>Submit Request</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
