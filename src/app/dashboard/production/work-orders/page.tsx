

'use client';

import * as React from 'react';
import Image from 'next/image';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, query, where, doc, updateDoc, addDoc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import type { Product, Order, WorkOrder, BillOfMaterial, ProductionAssignment, ProductionTaskTemplate, User, Task, WorkOrderStatus } from '@/lib/types';
import { AlertCircle, PlusCircle, MoreHorizontal, FileText, Clock, Wrench, CheckCircle, ListFilter, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { WorkOrderRow } from './_components/work-order-row';
import { getNextDocNumber } from '@/lib/number-series';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

function WorkOrdersPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: authUser } = useUser();

  const { data: products, loading: productsLoading } = useCollection<Product>(query(collection(firestore, 'products'), where('source', '==', 'Made'), where('saleable', '==', true)));
  const { data: orders, loading: ordersLoading } = useCollection<Order>(collection(firestore, 'orders'));
  const { data: workOrders, loading: workOrdersLoading } = useCollection<WorkOrder>(collection(firestore, 'workOrders'));
  const { data: boms, loading: bomsLoading } = useCollection<BillOfMaterial>(collection(firestore, 'boms'));
  const { data: templates, loading: templatesLoading } = useCollection<ProductionTaskTemplate>(collection(firestore, 'productionTaskTemplates'));
  const { data: assignments, loading: assignmentsLoading } = useCollection<ProductionAssignment>(collection(firestore, 'productionAssignments'));
  const { data: users, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
  const { data: allTasks, loading: tasksLoading } = useCollection<Task>(collection(firestore, 'tasks'));

  const [statusFilters, setStatusFilters] = React.useState<WorkOrderStatus[]>([]);
  const [viewingTask, setViewingTask] = React.useState<Task | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [openRowId, setOpenRowId] = React.useState<string | null>(null);

  // State for manual WO creation
  const [isManualWoDialogOpen, setIsManualWoDialogOpen] = React.useState(false);
  const [manualWoProduct, setManualWoProduct] = React.useState<Product | null>(null);
  const [manualWoQuantity, setManualWoQuantity] = React.useState(1);


  const loading = productsLoading || ordersLoading || workOrdersLoading || bomsLoading || templatesLoading || assignmentsLoading || usersLoading || tasksLoading;
  
  const handleStatusFilterChange = (status: WorkOrderStatus) => {
    setStatusFilters(prev => 
        prev.includes(status) 
            ? prev.filter(s => s !== status) 
            : [...prev, status]
    );
  };

  const filteredWorkOrders = React.useMemo(() => {
    if (!workOrders) return [];
    if (statusFilters.length === 0) return workOrders;
    return workOrders.filter(wo => statusFilters.includes(wo.status));
  }, [workOrders, statusFilters]);

  // Effect to automatically update WO status to "Under QC"
  React.useEffect(() => {
    if (!workOrders || !allTasks) return;

    workOrders.forEach(async (wo) => {
      if (wo.status === 'In Progress' && wo.productionTasks && wo.productionTasks.length > 0) {
        const taskIdsForWo = wo.productionTasks.map(pt => pt.taskId).filter(Boolean);
        if (taskIdsForWo.length === 0) return;
        
        const relevantTasks = allTasks.filter(t => taskIdsForWo.includes(t.id));
        const allTasksCompleted = relevantTasks.length === taskIdsForWo.length && relevantTasks.every(t => t.status === 'Completed');

        if (allTasksCompleted) {
          const workOrderRef = doc(firestore, 'workOrders', wo.id);
          await updateDoc(workOrderRef, { status: 'Under QC' });
          toast({
            title: `Work Order Sent to QC`,
            description: `Work order ${wo.id} is now awaiting quality control.`,
          });
        }
      }
    });
  }, [allTasks, workOrders, firestore, toast]);


  const handleCreateWorkOrder = async (product: Product, quantity: number) => {
    if (quantity <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Quantity',
        description: 'Please enter a quantity greater than zero.',
      });
      return;
    }
    
    if (!settingsData?.prefixes) {
      toast({
        variant: 'destructive',
        title: 'Settings Error',
        description: 'Document numbering settings are not configured.',
      });
      return;
    }
    
    setIsCreating(true);
    const newWorkOrderId = getNextDocNumber('Work Order', settingsData.prefixes, workOrders || []);
    const bom = boms?.find(b => b.productId === product.id);

    const newWorkOrder: Omit<WorkOrder, 'id'> & { id: string } = {
      id: newWorkOrderId,
      productId: product.id,
      productName: product.name,
      quantity,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      productionTasks: bom?.productionTasks || [],
    };
    
    await setDoc(doc(firestore, 'workOrders', newWorkOrderId), newWorkOrder);
    
    toast({
      title: 'Work Order Created',
      description: `Work order ${newWorkOrderId} for ${quantity} x ${product.name} has been created.`,
    });
    setIsCreating(false);
    setIsManualWoDialogOpen(false); // Close dialog on success
  };
  
  const handleUpdateWorkOrder = async (workOrderId: string, updates: Partial<WorkOrder>) => {
    const workOrderRef = doc(firestore, 'workOrders', workOrderId);
    await updateDoc(workOrderRef, updates);
    toast({
      title: 'Work Order Updated',
      description: `Changes to work order ${workOrderId} have been saved.`,
    });
  };

  const getOrderInHand = (productId: string) => {
    if (!orders) return 0;
    return orders
      .filter(order => order.status !== 'Delivered' && order.status !== 'Canceled')
      .flatMap(order => order.items)
      .filter(item => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };
  
  const getDeliveredQty = (productId: string) => {
     if (!orders) return 0;
    return orders
      .filter(order => order.status === 'Delivered')
      .flatMap(order => order.items)
      .filter(item => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };
  
  const getAllottedForWIP = (productId: string) => {
    if (!workOrders) return 0;
    return workOrders
      .filter(wo => wo.status === 'In Progress' && wo.productId === productId)
      .reduce((sum, wo) => sum + wo.quantity, 0);
  };

  const kpis = React.useMemo(() => {
    if (!workOrders) return { total: 0, pending: 0, inProgress: 0, completed: 0 };
    const total = workOrders.length;
    const pending = workOrders.filter(wo => wo.status === 'Pending').length;
    const inProgress = workOrders.filter(wo => wo.status === 'In Progress').length;
    const completed = workOrders.filter(wo => wo.status === 'Completed').length;
    return { total, pending, inProgress, completed };
  }, [workOrders]);

  const handleAssign = async (workOrderId: string) => {
    const workOrder = workOrders?.find(wo => wo.id === workOrderId);
    if (!workOrder) return;
    
    const bom = boms?.find(b => b.productId === workOrder.productId);
    if (!bom || !bom.productionTasks || bom.productionTasks.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Assignment Failed',
        description: 'No Bill of Material or production tasks found for this product. Please create a BOM first.',
      });
      return;
    }

    try {
      const batch = writeBatch(firestore);
      const workOrderRef = doc(firestore, 'workOrders', workOrderId);
      
      const updatedTasks = [...bom.productionTasks];

      for (let i = 0; i < bom.productionTasks.length; i++) {
        const prodTask = bom.productionTasks[i];
        if (prodTask.assigneeId) {
          const newTaskRef = doc(collection(firestore, 'tasks'));
          const newTask: Omit<Task, 'id'> = {
            title: `WO Task: ${prodTask.taskName} for ${workOrder.productName}`,
            description: `Complete production task "${prodTask.taskName}" for ${workOrder.quantity} units of ${workOrder.productName} (Work Order: ${workOrder.id}).`,
            category: 'Production',
            status: 'Pending',
            assignedBy: authUser?.displayName || 'System',
            assigneeId: prodTask.assigneeId,
            dueDate: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString(), // Due in 3 days
            attachmentUrl: prodTask.attachmentUrl || '',
            duration: prodTask.duration * workOrder.quantity,
          };
          batch.set(newTaskRef, newTask);
          updatedTasks[i].taskId = newTaskRef.id;
        }
      }

      batch.update(workOrderRef, { status: 'In Progress', productionTasks: updatedTasks });

      await batch.commit();
      
      toast({
        title: 'Work Order Assigned',
        description: `Tasks have been created and assigned. Work order is now "In Progress".`,
      });

    } catch (error) {
      console.error("Error assigning work order and creating tasks:", error);
      toast({
        variant: 'destructive',
        title: 'Assignment Failed',
        description: 'An error occurred while creating tasks for the work order.',
      });
    }
  };
  
    const handleRejectTask = async (workOrderId: string, taskId: string, newAssigneeId: string, remarks: string) => {
        const batch = writeBatch(firestore);

        const workOrderRef = doc(firestore, 'workOrders', workOrderId);
        batch.update(workOrderRef, { status: 'In Progress' });

        const taskRef = doc(firestore, 'tasks', taskId);
        const rejectedBy = authUser?.displayName || 'Manager';
        const rejectionRecord = {
            timestamp: new Date().toISOString(),
            reason: remarks,
            rejectedBy,
        };
        batch.update(taskRef, {
            status: 'Rejected',
        });
        
        // Create a new task
        const originalTask = allTasks?.find(t => t.id === taskId);
        if(originalTask){
            const newTaskRef = doc(collection(firestore, 'tasks'));
             const newTask: Omit<Task, 'id'> = {
                ...originalTask,
                status: 'Pending',
                assigneeId: newAssigneeId,
                rejectionHistory: [rejectionRecord, ...(originalTask.rejectionHistory || [])]
            };
            batch.set(newTaskRef, newTask);

            const workOrder = workOrders?.find(wo => wo.id === workOrderId);
            if (workOrder) {
                const updatedTasks = workOrder.productionTasks?.map(pt => pt.taskId === taskId ? {...pt, taskId: newTaskRef.id, assigneeId: newAssigneeId} : pt);
                batch.update(workOrderRef, { productionTasks: updatedTasks });
            }
        }


        try {
            await batch.commit();
            toast({ title: 'Task Rejected', description: 'The task has been re-assigned and work order status reverted.' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Rejection Failed' });
        }
    };


  return (
    <>
      <PageHeader title="Work Orders">
        <Button onClick={() => setIsManualWoDialogOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Manual Work Order
        </Button>
      </PageHeader>
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Work Orders</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All created work orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pending}</div>
            <p className="text-xs text-muted-foreground">Orders awaiting production</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inProgress}</div>
            <p className="text-xs text-muted-foreground">Orders on the production line</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.completed}</div>
            <p className="text-xs text-muted-foreground">Finished production orders</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Manufacturing & Stock Levels</CardTitle>
          <CardDescription>
            Monitor stock for products you manufacture and create work orders to replenish inventory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Product</TableHead>
                <TableHead className="text-center w-[8%]">Stock</TableHead>
                <TableHead className="text-center w-[8%]">Min. Stock</TableHead>
                <TableHead className="text-center w-[8%]">Order in hand</TableHead>
                <TableHead className="text-center w-[8%]">WIP</TableHead>
                <TableHead className="text-center w-[8%]">Planned Qty.</TableHead>
                <TableHead className="text-right w-[10%]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products && products.length > 0 ? (
                products.map((product) => {
                  const deliveredQty = getDeliveredQty(product.id);
                  const stockAvailable = product.openingStock - deliveredQty;
                  const stockBelowMin = stockAvailable < (product.minStockLevel || 0);
                  const orderInHand = getOrderInHand(product.id);
                  const wip = getAllottedForWIP(product.id);
                  const minStock = product.minStockLevel || 0;
                  const plannedQty = Math.max(0, orderInHand - (stockAvailable + wip) + minStock);

                  return (
                    <TableRow key={product.id} className={cn(stockBelowMin && 'bg-red-50 dark:bg-red-900/20')}>
                      <TableCell>
                        <div className="flex items-center gap-4">
                          <Image
                            src={product.imageUrl}
                            alt={product.name}
                            width={48}
                            height={48}
                            className="rounded-md object-cover"
                            data-ai-hint={product.imageHint}
                          />
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-muted-foreground">{product.sku}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={cn("text-center font-mono", stockBelowMin && "text-red-600 font-bold")}>
                        <div className="flex items-center justify-center gap-2">
                            {stockBelowMin && <AlertCircle className="h-4 w-4" />}
                            {stockAvailable}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono">{minStock}</TableCell>
                      <TableCell className="text-center font-mono">{orderInHand}</TableCell>
                      <TableCell className="text-center font-mono">{wip}</TableCell>
                      <TableCell className="text-center font-mono font-bold text-blue-600">{plannedQty}</TableCell>
                      <TableCell className="text-right">
                        <Button onClick={() => handleCreateWorkOrder(product, plannedQty)} size="sm" disabled={plannedQty <= 0 || isCreating}>
                          {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                          Create Work Order
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No manufacturable products found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
          <CardTitle>Created Work Orders</CardTitle>
          <CardDescription>
            A list of all active and past work orders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                <TableHead>Work Order ID</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Quantity</TableHead>
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
                        {['Pending', 'In Progress', 'Under QC', 'Completed', 'Canceled'].map((status) => (
                          <DropdownMenuCheckboxItem
                            key={status}
                            checked={statusFilters.includes(status as WorkOrderStatus)}
                            onCheckedChange={() => handleStatusFilterChange(status as WorkOrderStatus)}
                          >
                            {status}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead>Creation Date</TableHead>
                <TableHead>Exp. Delivery Date</TableHead>
                <TableHead>Performance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
              {loading ? (
                <TableBody><TableRow><TableCell colSpan={9} className="h-24 text-center">Loading...</TableCell></TableRow></TableBody>
              ) : filteredWorkOrders?.map(wo => (
                <WorkOrderRow 
                  key={wo.id} 
                  workOrder={wo}
                  isOpen={openRowId === wo.id}
                  onToggle={() => setOpenRowId(prev => prev === wo.id ? null : wo.id)}
                  onAssign={handleAssign} 
                  onUpdate={handleUpdateWorkOrder} 
                  onRejectTask={handleRejectTask}
                  allUsers={users || []}
                  allBoms={boms || []}
                  allTasks={allTasks || []}
                  onViewTask={setViewingTask}
                />
              ))}
          </Table>
        </CardContent>
      </Card>
      {viewingTask && (
        <Dialog open={!!viewingTask} onOpenChange={(open) => !open && setViewingTask(null)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Task Details</DialogTitle>
                    <DialogDescription>
                        Details for task: {viewingTask.title}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                     <div>
                        <h4 className="font-semibold text-sm">Status</h4>
                        <Badge variant="outline">{viewingTask.status}</Badge>
                    </div>
                     <div>
                        <h4 className="font-semibold text-sm">Description</h4>
                        <p className="text-sm text-muted-foreground">{viewingTask.description}</p>
                    </div>
                    {viewingTask.proofImageUrl && (
                        <div>
                            <h4 className="font-semibold text-sm">Proof of Completion</h4>
                            <Image src={viewingTask.proofImageUrl} alt="Proof of completion" width={400} height={300} className="rounded-md border object-cover mt-2" />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setViewingTask(null)}>Close</Button>
                     <Button onClick={() => router.push('/dashboard/production/quality-control')}>Go to QC</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      {/* Manual WO Creation Dialog */}
      <Dialog open={isManualWoDialogOpen} onOpenChange={setIsManualWoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Manual Work Order</DialogTitle>
            <DialogDescription>Select a product and specify the quantity to manufacture.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="manual-product">Product</Label>
              <Select onValueChange={(productId) => setManualWoProduct(products?.find(p => p.id === productId) || null)}>
                <SelectTrigger id="manual-product">
                  <SelectValue placeholder="Select a manufacturable product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-quantity">Quantity</Label>
              <Input
                id="manual-quantity"
                type="number"
                value={manualWoQuantity}
                onChange={(e) => setManualWoQuantity(Number(e.target.value))}
                min="1"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (manualWoProduct) {
                  handleCreateWorkOrder(manualWoProduct, manualWoQuantity);
                } else {
                  toast({ variant: "destructive", title: "Please select a product." });
                }
              }}
              disabled={!manualWoProduct || isCreating}
            >
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function WorkOrdersPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return <PageHeader title="Work Orders" />;
    }

    return <WorkOrdersPageContent />;
}


