

'use client';

import * as React from 'react';
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ServiceRequest, ServiceRequestStatus, User, QuotationItem as ServiceQuotationItem, Task, RegisteredProduct, ServiceInvoice } from '@/lib/types';
import { MoreHorizontal, Clock, Wrench, CheckCircle, Phone, User as UserIcon, FileText, Send, Image as ImageIcon, Video, ChevronRight, ChevronDown, PlusCircle, Trash2, DollarSign } from 'lucide-react';
import { format, differenceInMonths, parseISO } from 'date-fns';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, updateDoc, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getNextDocNumber } from '@/lib/number-series';


function getStatusBadgeVariant(status: ServiceRequestStatus) {
  const variants: Record<ServiceRequestStatus, string> = {
    Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'In Progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Canceled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    'Quotation Sent': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    'Work Complete': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Invoice Sent': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    'Paid': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'Awaiting Parts': 'bg-orange-100 text-orange-800'
  };
  return variants[status];
}


function ServiceRequestRow({ request, onAssign, onViewDetails, onSendQuotation, onUpdateStatus, onGenerateInvoice }: { request: ServiceRequest, onAssign: (req: ServiceRequest) => void, onViewDetails: (req: ServiceRequest) => void, onSendQuotation: (req: ServiceRequest) => void, onUpdateStatus: (reqId: string, status: ServiceRequestStatus) => void, onGenerateInvoice: (req: ServiceRequest) => void }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const {data: users} = useCollection<User>(collection(useFirestore(), 'users'));
    const assignedEngineer = users?.find(u => u.id === request.assignedTo);
    
    return (
        <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
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
                    <TableCell className="font-mono">{request.id}</TableCell>
                    <TableCell>{request.customer.name}</TableCell>
                    <TableCell>{request.productName}</TableCell>
                    <TableCell>{format(new Date(request.dateSubmitted), 'dd/MM/yyyy')}</TableCell>
                    <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(request.status))}>{request.status}</Badge></TableCell>
                    <TableCell className="text-right">
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => onViewDetails(request)}>View Details</DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onAssign(request)}}>Assign Engineer</DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onSendQuotation(request)}}>Generate Quotation</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onGenerateInvoice(request)} disabled={request.status !== 'Work Complete'}>Generate Invoice</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onUpdateStatus(request.id, 'Paid')} disabled={request.status !== 'Invoice Sent'}>Record Payment</DropdownMenuItem>
                            <DropdownMenuItem asChild><a href={`tel:${request.customer.phone}`}><Phone className="mr-2 h-4 w-4" /> Call Customer</a></DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onUpdateStatus(request.id, 'Completed')}>Mark as Completed</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onUpdateStatus(request.id, 'Canceled')} className="text-red-600 focus:text-red-600">Cancel Request</DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                </TableRow>
                 <CollapsibleContent asChild>
                    <TableRow>
                        <TableCell colSpan={7} className="p-0">
                            <div className="p-4 bg-muted/50 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <h4 className="font-semibold text-sm">Assigned Engineer</h4>
                                    {assignedEngineer ? (
                                        <div className="flex flex-col text-sm mt-2">
                                            <span>{assignedEngineer.name}</span>
                                            <span className="text-muted-foreground">{assignedEngineer.email}</span>
                                            <Button variant="link" asChild className="p-0 h-auto justify-start text-blue-600">
                                                <a href={`tel:555-555-5555`}><Phone className="mr-2 h-3 w-3" /> Call Engineer</a>
                                            </Button>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground mt-2">Not yet assigned</p>
                                    )}
                                </div>
                                <div>
                                     <h4 className="font-semibold text-sm">Description</h4>
                                     <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{request.description}</p>
                                </div>
                                {request.imageUrl && (
                                    <div>
                                        <h4 className="font-semibold text-sm">Attachment</h4>
                                        <Image src={request.imageUrl} alt="Attachment" width={100} height={100} className="mt-2 rounded-md border object-cover" />
                                    </div>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                </CollapsibleContent>
            </TableBody>
        </Collapsible>
    )
}

interface QuotationDialogItem {
    id: string;
    description: string;
    hsn: string;
    quantity: number;
    rate: number;
    discount: number;
    gstRate: number;
}

function QuotationDialog({ request, open, onOpenChange, onSubmit }: { request: ServiceRequest | null, open: boolean, onOpenChange: (open: boolean) => void, onSubmit: (items: any) => void }) {
    const [items, setItems] = React.useState<QuotationDialogItem[]>([]);

    React.useEffect(() => {
        if (request) {
            setItems([{ id: `item-${Date.now()}`, description: '', hsn: '', quantity: 1, rate: 0, discount: 0, gstRate: 18 }]);
        }
    }, [request]);

    const handleItemChange = (index: number, field: keyof QuotationDialogItem, value: string | number) => {
        const newItems = [...items];
        (newItems[index] as any)[field] = value;
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, { id: `item-${Date.now()}`, description: '', hsn: '', quantity: 1, rate: 0, discount: 0, gstRate: 18 }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const calculations = React.useMemo(() => {
        const subtotal = items.reduce((acc, item) => {
            const discountedRate = item.rate * (1 - item.discount / 100);
            return acc + (item.quantity * discountedRate);
        }, 0);

        const totalGst = items.reduce((acc, item) => {
            const discountedRate = item.rate * (1 - item.discount / 100);
            const itemTotal = item.quantity * discountedRate;
            return acc + (itemTotal * (item.gstRate / 100));
        }, 0);

        const grandTotal = subtotal + totalGst;
        return { subtotal, totalGst, grandTotal };
    }, [items]);

    if (!request) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Generate Quotation for {request.id}</DialogTitle>
                    <DialogDescription>Create a service quotation for {request.customer.name}.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] -mx-6 px-6">
                    <div className="py-4 px-2 grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Quotation Date</Label>
                                <Input type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                            </div>
                            <div className="space-y-2">
                                <Label>Valid Until</Label>
                                <Input type="date" />
                            </div>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[30%]">Description</TableHead>
                                    <TableHead>HSN</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Rate</TableHead>
                                    <TableHead>Disc %</TableHead>
                                    <TableHead>GST %</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead><span className="sr-only">Remove</span></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item, index) => {
                                    const discountedRate = item.rate * (1 - item.discount / 100);
                                    const amount = item.quantity * discountedRate;
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell><Input placeholder="Service/Part" value={item.description} onChange={(e) => handleItemChange(index, 'description', e.target.value)} /></TableCell>
                                            <TableCell><Input placeholder="HSN" value={item.hsn} onChange={(e) => handleItemChange(index, 'hsn', e.target.value)} /></TableCell>
                                            <TableCell><Input type="number" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))} /></TableCell>
                                            <TableCell><Input type="number" value={item.rate} onChange={(e) => handleItemChange(index, 'rate', Number(e.target.value))} /></TableCell>
                                            <TableCell><Input type="number" value={item.discount} onChange={(e) => handleItemChange(index, 'discount', Number(e.target.value))} /></TableCell>
                                            <TableCell><Input type="number" value={item.gstRate} onChange={(e) => handleItemChange(index, 'gstRate', Number(e.target.value))} /></TableCell>
                                            <TableCell className="text-right font-mono">₹{amount.toFixed(2)}</TableCell>
                                            <TableCell><Button variant="ghost" size="icon" onClick={() => removeItem(index)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        <Button variant="outline" size="sm" onClick={addItem}><PlusCircle className="mr-2 h-4 w-4" /> Add Line Item</Button>

                        <div className="flex justify-end pt-4">
                            <div className="w-full max-w-sm space-y-2">
                                <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">₹{calculations.subtotal.toFixed(2)}</span></div>
                                <div className="flex justify-between"><span>GST</span><span className="font-mono">₹{calculations.totalGst.toFixed(2)}</span></div>
                                <Separator />
                                <div className="flex justify-between font-bold text-lg"><span>Grand Total</span><span className="font-mono">₹{calculations.grandTotal.toFixed(2)}</span></div>
                            </div>
                        </div>

                        <div className="space-y-2 pt-4 border-t">
                            <Label>Terms & Conditions</Label>
                            <Textarea placeholder="e.g., Payment to be made 50% in advance..." />
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={() => onSubmit(items)}><Send className="mr-2 h-4 w-4" /> Send to Customer</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ServiceManagementPage() {
  const { toast } = useToast();
  const router = useRouter();
  const firestore = useFirestore();
  const { data: requests, loading } = useCollection<ServiceRequest>(collection(firestore, 'serviceRequests'));
  const { data: users, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
  const { data: registeredProductsData, loading: productsLoading } = useCollection<RegisteredProduct>(collection(firestore, 'registeredProducts'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
  const { data: allServiceInvoices } = useCollection<ServiceInvoice>(collection(firestore, 'serviceInvoices'));

  const engineers = users?.filter(u => u.role === 'Employee' || u.role === 'Service Manager') || [];


  const [viewingRequest, setViewingRequest] = React.useState<ServiceRequest | null>(null);
  const [assigningRequest, setAssigningRequest] = React.useState<ServiceRequest | null>(null);
  const [quotingRequest, setQuotingRequest] = React.useState<ServiceRequest | null>(null);
  const [selectedEngineer, setSelectedEngineer] = React.useState('');

  const kpis = React.useMemo(() => {
    if (!requests) return { total: 0, pending: 0, inProgress: 0, completed: 0 };
    return {
        total: requests.length,
        pending: requests.filter(r => r.status === 'Pending').length,
        inProgress: requests.filter(r => r.status === 'In Progress').length,
        completed: requests.filter(r => r.status === 'Completed').length,
    }
  }, [requests]);

  const handleUpdateStatus = async (requestId: string, status: ServiceRequestStatus) => {
    await updateDoc(doc(firestore, 'serviceRequests', requestId), { status });
    toast({ title: 'Status Updated', description: `Request ${requestId} has been marked as ${status}.` });
  };
  
  const handleAssignEngineer = async () => {
    if (!assigningRequest || !selectedEngineer) {
        toast({ variant: 'destructive', title: 'Assignment Failed', description: 'Please select an engineer.' });
        return;
    }
    await updateDoc(doc(firestore, 'serviceRequests', assigningRequest.id), { assignedTo: selectedEngineer, status: 'In Progress' });
    
    // Create a new task
    const newTask: Omit<Task, 'id'> = {
        title: `Service Request: ${assigningRequest.id} for ${assigningRequest.productName}`,
        description: assigningRequest.description,
        category: 'Service',
        status: 'Pending',
        assignedBy: 'Service Manager', // This would be the current user
        dueDate: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString(),
    };
    await addDoc(collection(firestore, 'tasks'), newTask);

    toast({ title: 'Engineer Assigned', description: `Request has been assigned and status moved to "In Progress". A task has been created.` });
    setAssigningRequest(null);
    setSelectedEngineer('');
  };
  
  const handleSendQuotation = async (items: any) => {
    if (!quotingRequest) return;
    await updateDoc(doc(firestore, 'serviceRequests', quotingRequest.id), { status: 'Quotation Sent', quotation: { items } });
    toast({ title: 'Quotation Sent', description: `A quotation has been sent to ${quotingRequest.customer.name}.` });
    setQuotingRequest(null);
  };
  
  const handleGenerateInvoice = async (request: ServiceRequest) => {
    if (!settingsData?.prefixes || !allServiceInvoices) {
      toast({ variant: 'destructive', title: 'Error', description: 'Document numbering settings not found.' });
      return;
    }

    const newInvoiceId = getNextDocNumber('Service Invoice', settingsData.prefixes, allServiceInvoices);

    const invoiceData: Omit<ServiceInvoice, 'id'> = {
      invoiceNumber: newInvoiceId,
      serviceRequestId: request.id,
      customerId: request.customer.id,
      customerName: request.customer.name,
      amount: request.quotation?.items.reduce((acc, item) => acc + item.quantity * item.rate * (1 + item.gstRate/100), 0) || 0,
      date: new Date().toISOString(),
      status: 'Unpaid'
    };

    await setDoc(doc(firestore, 'serviceInvoices', newInvoiceId), { ...invoiceData, id: newInvoiceId });
    await handleUpdateStatus(request.id, 'Invoice Sent');
    
    localStorage.setItem('serviceInvoiceData', JSON.stringify({ ...request, ...invoiceData, id: newInvoiceId }));
    router.push(`/dashboard/service-warranty/invoice/view?id=${newInvoiceId}`);
  };
  
  const productDetails = React.useMemo(() => {
    if (!viewingRequest || !registeredProductsData) return null;
    return registeredProductsData.find(p => p.serialNumber === viewingRequest.serialNumber);
  }, [viewingRequest, registeredProductsData]);

  return (
    <>
      <PageHeader title="Service Management" />

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting assignment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inProgress}</div>
            <p className="text-xs text-muted-foreground">Currently being serviced</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed This Month</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.completed}</div>
            <p className="text-xs text-muted-foreground">Successfully resolved requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All-time service requests</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Service Requests</CardTitle>
          <CardDescription>Manage and track all customer service requests.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                <TableHead>Request ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            {loading ? (
                <TableBody><TableRow><TableCell colSpan={7} className="text-center h-24">Loading requests...</TableCell></TableRow></TableBody>
            ) : requests?.map(request => (
                <ServiceRequestRow
                    key={request.id}
                    request={request}
                    onAssign={setAssigningRequest}
                    onViewDetails={setViewingRequest}
                    onSendQuotation={setQuotingRequest}
                    onUpdateStatus={handleUpdateStatus}
                    onGenerateInvoice={handleGenerateInvoice}
                />
            ))}
          </Table>
        </CardContent>
      </Card>

      {viewingRequest && (
        <Dialog open={!!viewingRequest} onOpenChange={(open) => !open && setViewingRequest(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Request Details: {viewingRequest.id}</DialogTitle>
              <DialogDescription>Full information about the service request.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] p-1">
                <div className="space-y-4 px-4 py-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-semibold text-sm">Customer Details</h4>
                            <p className="text-sm text-muted-foreground">{viewingRequest.customer.name}</p>
                            <p className="text-sm text-muted-foreground">{viewingRequest.customer.email}</p>
                            <p className="text-sm text-muted-foreground">{viewingRequest.customer.phone}</p>
                        </div>
                         <div>
                            <h4 className="font-semibold text-sm">Product Details</h4>
                            <p className="text-sm text-muted-foreground">{viewingRequest.productName}</p>
                            <p className="text-sm text-muted-foreground">SN: {viewingRequest.serialNumber}</p>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm">Issue Description</h4>
                        <p className="text-sm text-muted-foreground">{viewingRequest.description}</p>
                    </div>
                     <div>
                        <h4 className="font-semibold text-sm">Assigned Engineer</h4>
                        <p className="text-sm text-muted-foreground">{users?.find(u => u.id === viewingRequest.assignedTo)?.name || 'Not yet assigned'}</p>
                    </div>
                    <Separator />
                    {productDetails && (
                        <div>
                            <h4 className="font-semibold text-sm mb-2">Warranty & Service History</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm p-3 bg-muted/50 rounded-md">
                                <div className="flex items-center gap-2"><strong>Warranty Status:</strong> <Badge variant="outline" className={cn(productDetails.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>{productDetails.status}</Badge></div>
                                <p><strong>Warranty End:</strong> {format(parseISO(productDetails.warrantyEndDate), 'dd/MM/yyyy')}</p>
                                <p><strong>Free Services:</strong> {productDetails.availableFreeServices}</p>
                                <p><strong>Remaining Warranty:</strong> {differenceInMonths(parseISO(productDetails.warrantyEndDate), new Date())} months</p>
                            </div>
                            {productDetails.serviceLogs && productDetails.serviceLogs.length > 0 && (
                                <div className="mt-4">
                                     <h5 className="font-medium text-sm mb-2">Previous Service Logs</h5>
                                     <Table>
                                         <TableHeader>
                                             <TableRow>
                                                 <TableHead>Date</TableHead>
                                                 <TableHead>Description</TableHead>
                                                 <TableHead>Status</TableHead>
                                             </TableRow>
                                         </TableHeader>
                                         <TableBody>
                                             {productDetails.serviceLogs.map(log => (
                                                 <TableRow key={log.id}>
                                                     <TableCell>{format(parseISO(log.date), 'dd/MM/yyyy')}</TableCell>
                                                     <TableCell>{log.description}</TableCell>
                                                     <TableCell><Badge variant="secondary">{log.status}</Badge></TableCell>
                                                 </TableRow>
                                             ))}
                                         </TableBody>
                                     </Table>
                                </div>
                            )}
                        </div>
                    )}
                    {(viewingRequest.imageUrl || viewingRequest.videoUrl) && <Separator />}
                    {viewingRequest.imageUrl && (
                        <div>
                            <h4 className="font-semibold text-sm mb-2">Attached Image</h4>
                             <Image src={viewingRequest.imageUrl} alt="Attached by customer" width={500} height={300} className="rounded-md border object-cover" />
                        </div>
                    )}
                    {viewingRequest.videoUrl && (
                        <div>
                            <h4 className="font-semibold text-sm mb-2">Attached Video</h4>
                            <video src={viewingRequest.videoUrl} controls className="w-full rounded-md border" />
                        </div>
                    )}
                </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewingRequest(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {assigningRequest && (
        <Dialog open={!!assigningRequest} onOpenChange={(open) => !open && setAssigningRequest(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Engineer to {assigningRequest.id}</DialogTitle>
              <DialogDescription>Select an engineer to handle this service request.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="engineer-select">Service Engineer</Label>
              <Select onValueChange={setSelectedEngineer}>
                <SelectTrigger id="engineer-select">
                  <SelectValue placeholder="Select an engineer" />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssigningRequest(null)}>Cancel</Button>
              <Button onClick={handleAssignEngineer}>Assign & Notify</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <QuotationDialog
        request={quotingRequest}
        open={!!quotingRequest}
        onOpenChange={(open) => !open && setQuotingRequest(null)}
        onSubmit={handleSendQuotation}
      />
    </>
  );
}

function ServiceManagementWrapper() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return (
            <>
                <PageHeader title="Service Management" />
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h3 className="text-2xl font-bold tracking-tight">Loading Service Requests...</h3>
                    </div>
                </div>
            </>
        );
    }

    return <ServiceManagementPage />;
}

export default ServiceManagementWrapper;

    