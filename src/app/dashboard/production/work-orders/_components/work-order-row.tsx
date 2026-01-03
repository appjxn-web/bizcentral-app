
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ChevronRight, ChevronDown, MoreHorizontal, Star, Save, Paperclip, FileText, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { WorkOrder, ProductionTaskTemplate, ProductionAssignment, User, BillOfMaterial, ProductionTask, Task, SalesOrder } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';


interface WorkOrderRowProps {
  workOrder: WorkOrder;
  onAssign: (workOrderId: string) => void;
  onUpdate: (workOrderId: string, updates: Partial<WorkOrder>) => void;
  onRejectTask: (workOrderId: string, taskId: string, newAssigneeId: string, remarks: string) => void;
  allUsers: User[];
  allBoms: BillOfMaterial[];
  allTasks: Task[];
  onViewTask: (task: Task) => void;
}

function getWorkOrderStatusBadgeVariant(status: string) {
  switch (status) {
    case 'In Progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'Under QC':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    case 'Completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

function PerformanceRating({ task, standardDuration }: { task: Task | undefined, standardDuration: number }) {
    if (!task || task.status !== 'Completed' || !task.actualDuration || !task.rating) {
        return <span className="text-muted-foreground text-xs">N/A</span>;
    }

    const ratingValue = task.rating;
    
    const fullStars = Math.floor(ratingValue);
    const halfStar = ratingValue - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    const diffSeconds = (standardDuration * 60) - task.actualDuration;
    const timeDifference = formatDistanceToNowStrict(new Date(Date.now() + Math.abs(diffSeconds) * 1000), { unit: 'minute' });
    let ratingDescription = `Completed ${timeDifference} ${diffSeconds < 0 ? 'slower' : 'faster'} than standard.`;
    
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-0.5 cursor-pointer">
                        {[...Array(fullStars)].map((_, i) => (
                            <Star key={`full-${i}`} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                        ))}
                        {halfStar && <Star key="half" className="h-4 w-4 text-yellow-400" style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0% 100%)' }} />}
                        {[...Array(emptyStars)].map((_, i) => (
                            <Star key={`empty-${i}`} className="h-4 w-4 text-gray-300 fill-gray-300" />
                        ))}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{ratingDescription}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

const formatDuration = (totalSeconds?: number) => {
    if (totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

function RejectTaskDialog({ open, onOpenChange, task, productionTask, workOrder, users, onConfirm }: { open: boolean, onOpenChange: (open: boolean) => void, task: Task | undefined, productionTask: ProductionTask, workOrder: WorkOrder, users: User[], onConfirm: (newAssigneeId: string, remarks: string) => void }) {
    const [remarks, setRemarks] = React.useState('');
    const [newAssigneeId, setNewAssigneeId] = React.useState(productionTask.assigneeId || '');

    if (!task) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reject Task: {productionTask.taskName}</DialogTitle>
                    <DialogDescription>Provide a reason for rejection and re-assign the task.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="reject-remarks">Rejection Reason</Label>
                        <Textarea id="reject-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g., Finishing is not up to standard." />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="reassign-to">Re-assign To</Label>
                        <Select value={newAssigneeId} onValueChange={setNewAssigneeId}>
                            <SelectTrigger id="reassign-to"><SelectValue placeholder="Select an employee" /></SelectTrigger>
                            <SelectContent>
                                {users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button variant="destructive" onClick={() => onConfirm(newAssigneeId, remarks)} disabled={!remarks || !newAssigneeId}>Reject & Re-assign</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export function WorkOrderRow({ workOrder, onAssign, onUpdate, onRejectTask, allUsers, allBoms, allTasks, onViewTask }: WorkOrderRowProps) {
  const router = useRouter();
  const { data: salesOrder } = useDoc<SalesOrder>(workOrder.salesOrderId ? doc(useFirestore(), 'orders', workOrder.salesOrderId) : null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [editedQty, setEditedQty] = React.useState(workOrder.quantity);
  const [editedTasks, setEditedTasks] = React.useState<ProductionTask[]>([]);
  const [rejectingTask, setRejectingTask] = React.useState<{task: Task, productionTask: ProductionTask} | null>(null);

  React.useEffect(() => {
    if (workOrder.productionTasks && workOrder.productionTasks.length > 0) {
        setEditedTasks(workOrder.productionTasks);
    } else {
        const bom = allBoms.find((b: BillOfMaterial) => b.productId === workOrder.productId);
        setEditedTasks(bom?.productionTasks || []);
    }
  }, [workOrder, allBoms]);

  const handleTaskAssigneeChange = (taskIndex: number, newAssigneeId: string) => {
    const newTasks = [...editedTasks];
    newTasks[taskIndex].assigneeId = newAssigneeId;
    setEditedTasks(newTasks);
  };
  
  const handleSaveChanges = () => {
    const updates: Partial<WorkOrder> = {};
    if (editedQty !== workOrder.quantity) {
        updates.quantity = editedQty;
    }
    
    updates.productionTasks = editedTasks;
    
    if (Object.keys(updates).length > 0) {
        onUpdate(workOrder.id, updates);
    }
  };

  const isEditable = workOrder.status === 'Pending' || workOrder.status === 'In Progress';
  const bom = allBoms.find((b: BillOfMaterial) => b.productId === workOrder.productId);
  
  return (
    <>
      <TableRow data-state={isOpen ? 'open' : 'closed'}>
        <TableCell>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(!isOpen)}>
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform',
                isOpen && 'rotate-90'
              )}
            />
            <span className="sr-only">Toggle details</span>
          </Button>
        </TableCell>
        <TableCell className="font-mono">{workOrder.id}</TableCell>
        <TableCell>{workOrder.productName}</TableCell>
        <TableCell>
          {isOpen && isEditable ? (
            <Input
              type="number"
              value={editedQty}
              onChange={(e) => setEditedQty(Number(e.target.value))}
              className="h-8 w-20"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            workOrder.quantity
          )}
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={cn(getWorkOrderStatusBadgeVariant(workOrder.status))}
          >
            {workOrder.status}
          </Badge>
        </TableCell>
        <TableCell>
          {format(new Date(workOrder.createdAt), 'dd/MM/yyyy')}
        </TableCell>
         <TableCell>
          {salesOrder?.expectedDeliveryDate ? format(new Date(salesOrder.expectedDeliveryDate), 'dd/MM/yyyy') : 'N/A'}
        </TableCell>
        <TableCell>
          <span className="text-muted-foreground text-xs">View Details</span>
        </TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/dashboard/production/work-orders/view?id=${workOrder.id}`
                  )
                }
              >
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onAssign(workOrder.id)}
                disabled={workOrder.status !== 'Pending'}
              >
                Assign
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600">
                Cancel Order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow>
          <TableCell colSpan={9} className="p-0">
            <div className="p-4 bg-muted/50 space-y-6">
              <div>
                <h4 className="font-semibold text-sm mb-2">Production Tasks</h4>
                {editedTasks.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task Name</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead>Standard Duration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actual Duration</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>Attachment</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editedTasks.map((task, index) => {
                        const assignee = allUsers.find(
                          (u: User) => u.id === task.assigneeId
                        );
                        const correspondingTask = allTasks.find(
                          (t: Task) => t.id === task.taskId
                        );

                        return (
                          <TableRow key={task.id || index}>
                            <TableCell className="cursor-pointer hover:underline" onClick={() => correspondingTask && onViewTask(correspondingTask)}>{task.taskName}</TableCell>
                            <TableCell>
                              {isOpen && isEditable ? (
                                <Select
                                  value={task.assigneeId}
                                  onValueChange={(val) =>
                                    handleTaskAssigneeChange(index, val)
                                  }
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select Employee" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allUsers.map((user: User) => (
                                      <SelectItem key={user.id} value={user.id}>
                                        {user.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                assignee?.name || 'Unassigned'
                              )}
                            </TableCell>
                            <TableCell>{task.duration * editedQty} mins</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  getWorkOrderStatusBadgeVariant(
                                    correspondingTask?.status || 'Pending'
                                  )
                                )}
                              >
                                {correspondingTask?.status || 'Pending'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {formatDuration(correspondingTask?.actualDuration)}
                            </TableCell>
                            <TableCell>
                              <PerformanceRating
                                task={correspondingTask}
                                standardDuration={task.duration}
                              />
                            </TableCell>
                            <TableCell>
                              {task.attachmentUrl ||
                              correspondingTask?.proofImageUrl ? (
                                <a
                                  href={
                                    task.attachmentUrl ||
                                    correspondingTask?.proofImageUrl
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:underline flex items-center gap-1 text-sm"
                                >
                                  <Paperclip className="h-3 w-3" />{' '}
                                  {correspondingTask?.proofImageUrl
                                    ? 'View Proof'
                                    : 'View Attachment'}
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  None
                                </span>
                              )}
                            </TableCell>
                             <TableCell className="text-right">
                                {correspondingTask?.status === 'Completed' && (
                                    <Button variant="outline" size="sm" onClick={() => setRejectingTask({task: correspondingTask, productionTask: task})}>
                                        <RefreshCcw className="h-3 w-3 mr-1" />
                                        Reject
                                    </Button>
                                )}
                             </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No production tasks found for this product's BOM.
                  </p>
                )}
                {isOpen && isEditable && (
                  <div className="mt-4 flex justify-end">
                    <Button size="sm" onClick={handleSaveChanges}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-sm mb-2">
                  Linked Bill of Material (BOM)
                </h4>
                {bom ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead className="text-right">
                          Required Qty/Unit
                        </TableHead>
                        <TableHead className="text-right">
                          Total Required
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bom.items.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell className="text-right font-mono">
                            {item.quantity} {item.unit}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {(item.quantity * editedQty).toFixed(2)} {item.unit}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No BOM is linked to this product.
                  </p>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
      {rejectingTask && (
        <RejectTaskDialog
          open={!!rejectingTask}
          onOpenChange={(isOpen) => !isOpen && setRejectingTask(null)}
          task={rejectingTask.task}
          productionTask={rejectingTask.productionTask}
          workOrder={workOrder}
          users={allUsers}
          onConfirm={(newAssigneeId, remarks) => {
            onRejectTask(workOrder.id, rejectingTask.task.id, newAssigneeId, remarks);
            setRejectingTask(null);
          }}
        />
      )}
    </>
  );
}
