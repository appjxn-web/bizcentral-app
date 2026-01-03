
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, MoreHorizontal, CheckCircle, AlertTriangle, XCircle, ChevronRight, ChevronDown } from 'lucide-react';
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import type { Goal, User, GoalHealth, Milestone, MilestoneStatus, GoalVisibility, GoalTargetType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const getHealthBadgeVariant = (health: GoalHealth) => {
  const variants: Record<GoalHealth, string> = {
    'On Track': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'At Risk': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Off Track': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };
  return variants[health] || 'bg-gray-100';
};

const getHealthIcon = (health: GoalHealth) => {
    switch (health) {
        case 'On Track': return <CheckCircle className="h-4 w-4 text-green-500" />;
        case 'At Risk': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
        case 'Off Track': return <XCircle className="h-4 w-4 text-red-500" />;
        default: return null;
    }
}

const getMilestoneStatusBadgeVariant = (status: MilestoneStatus) => {
  const variants: Record<MilestoneStatus, string> = {
    'Todo': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    'In Progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    'Done': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'Blocked': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };
  return variants[status];
};


function GoalFormDialog({ open, onOpenChange, onSave, users, initialData }: { open: boolean, onOpenChange: (open: boolean) => void, onSave: (data: any) => void, users: User[], initialData: Partial<Goal> | null }) {
    const [formData, setFormData] = React.useState<Partial<Goal>>(initialData || {});

    React.useEffect(() => {
        if (open) {
            setFormData(initialData || { visibility: 'Private', targetType: 'Numeric' });
        }
    }, [open, initialData]);

    const handleInputChange = (field: keyof Goal, value: string | number) => {
        setFormData(prev => ({...prev, [field]: value}));
    };

    const handleSave = () => {
        onSave(formData);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{initialData?.id ? 'Edit Goal' : 'Create New Goal'}</DialogTitle>
                </DialogHeader>
                 <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="goal-title">Goal Title</Label>
                        <Input id="goal-title" value={formData.title || ''} onChange={(e) => handleInputChange('title', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="goal-desc">Description</Label>
                        <Textarea id="goal-desc" value={formData.description || ''} onChange={(e) => handleInputChange('description', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="goal-owner">Owner</Label>
                            <Select value={formData.ownerId} onValueChange={(value) => handleInputChange('ownerId', value)}>
                                <SelectTrigger><SelectValue placeholder="Select Owner" /></SelectTrigger>
                                <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="goal-visibility">Visibility</Label>
                             <Select value={formData.visibility} onValueChange={(value) => handleInputChange('visibility', value as GoalVisibility)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Company">Company</SelectItem>
                                    <SelectItem value="Leadership">Leadership</SelectItem>
                                    <SelectItem value="Private">Private</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start-date">Start Date</Label>
                            <Input id="start-date" type="date" value={formData.startDate || ''} onChange={(e) => handleInputChange('startDate', e.target.value)} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="end-date">End Date</Label>
                            <Input id="end-date" type="date" value={formData.endDate || ''} onChange={(e) => handleInputChange('endDate', e.target.value)} />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="target-type">Target Type</Label>
                             <Select value={formData.targetType} onValueChange={(value) => handleInputChange('targetType', value as GoalTargetType)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Percentage">Percentage</SelectItem>
                                    <SelectItem value="Numeric">Numeric</SelectItem>
                                    <SelectItem value="Currency">Currency</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="target-value">Target Value</Label>
                            <Input id="target-value" type="number" value={formData.targetValue || ''} onChange={(e) => handleInputChange('targetValue', Number(e.target.value))} />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleSave}>Save Goal</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MilestoneDialog({
    open,
    onOpenChange,
    onSave,
    users,
    goalId,
    initialData,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: Partial<Milestone>) => void;
    users: User[];
    goalId: string;
    initialData: Partial<Milestone> | null;
}) {
    const [formData, setFormData] = React.useState<Partial<Milestone>>(initialData || {});

    React.useEffect(() => {
        if (open) {
            setFormData(initialData || { status: 'Todo' });
        }
    }, [open, initialData]);
    
    const handleInputChange = (field: keyof Milestone, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onSave(formData);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit' : 'Add'} Milestone</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="milestone-title">Title</Label>
                        <Input id="milestone-title" value={formData.title || ''} onChange={(e) => handleInputChange('title', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="milestone-owner">Owner</Label>
                            <Select value={formData.ownerId} onValueChange={(value) => handleInputChange('ownerId', value)}>
                                <SelectTrigger><SelectValue placeholder="Select Owner" /></SelectTrigger>
                                <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="milestone-due-date">Due Date</Label>
                            <Input id="milestone-due-date" type="date" value={formData.dueDate || ''} onChange={(e) => handleInputChange('dueDate', e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="milestone-status">Status</Label>
                            <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value as MilestoneStatus)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Todo">Todo</SelectItem>
                                    <SelectItem value="In Progress">In Progress</SelectItem>
                                    <SelectItem value="Done">Done</SelectItem>
                                    <SelectItem value="Blocked">Blocked</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="milestone-points">Points</Label>
                            <Input id="milestone-points" type="number" value={formData.points || 0} onChange={(e) => handleInputChange('points', Number(e.target.value))} />
                        </div>
                    </div>
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleSave}>Save Milestone</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MilestonesTable({ goalId, users }: { goalId: string, users: User[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const milestonesQuery = query(collection(firestore, 'goals', goalId, 'milestones'), orderBy('dueDate', 'asc'));
    const { data: milestones, loading } = useCollection<Milestone>(milestonesQuery);
    
    const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = React.useState(false);
    const [editingMilestone, setEditingMilestone] = React.useState<Milestone | null>(null);

    const handleSaveMilestone = async (data: Partial<Milestone>) => {
        const milestoneData = { ...data, dueDate: data.dueDate || '', title: data.title || '', ownerId: data.ownerId || '', status: data.status || 'Todo', points: data.points || 0 };
        
        if (editingMilestone) {
            await updateDoc(doc(firestore, 'goals', goalId, 'milestones', editingMilestone.id), milestoneData);
            toast({ title: 'Milestone Updated' });
        } else {
            await addDoc(collection(firestore, 'goals', goalId, 'milestones'), milestoneData);
            toast({ title: 'Milestone Created' });
        }
    };
    
    const handleMilestoneStatusChange = async (milestoneId: string, status: MilestoneStatus) => {
        await updateDoc(doc(firestore, 'goals', goalId, 'milestones', milestoneId), { status, ...(status === 'Done' && { completedAt: new Date().toISOString() })});
        toast({ title: 'Status Updated' });
    };

    const handleDeleteMilestone = async (milestoneId: string) => {
        await deleteDoc(doc(firestore, 'goals', goalId, 'milestones', milestoneId));
        toast({ title: 'Milestone Deleted' });
    };

    const handleEditMilestone = (milestone: Milestone) => {
        setEditingMilestone(milestone);
        setIsMilestoneDialogOpen(true);
    };

    return (
        <div className="p-4 bg-muted/50">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-sm">Milestones</h4>
                <Button size="sm" variant="outline" onClick={() => { setEditingMilestone(null); setIsMilestoneDialogOpen(true); }}>
                    <PlusCircle className="h-4 w-4 mr-2" /> Add Milestone
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={5} className="text-center">Loading milestones...</TableCell></TableRow>
                    ) : milestones && milestones.length > 0 ? (
                        milestones.map(milestone => (
                            <TableRow key={milestone.id}>
                                <TableCell>{milestone.title}</TableCell>
                                <TableCell>{users.find(u => u.id === milestone.ownerId)?.name || 'N/A'}</TableCell>
                                <TableCell>{milestone.dueDate ? format(new Date(milestone.dueDate), 'dd MMM yyyy') : 'N/A'}</TableCell>
                                <TableCell>
                                    <Badge className={cn('text-xs', getMilestoneStatusBadgeVariant(milestone.status))}>
                                        {milestone.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                     <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={() => handleEditMilestone(milestone)}>Edit</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger>Set Status</DropdownMenuSubTrigger>
                                                <DropdownMenuPortal>
                                                    <DropdownMenuSubContent>
                                                        {(['Todo', 'In Progress', 'Done', 'Blocked'] as MilestoneStatus[]).map(status => (
                                                            <DropdownMenuItem key={status} onClick={() => handleMilestoneStatusChange(milestone.id, status)}>{status}</DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuSubContent>
                                                </DropdownMenuPortal>
                                            </DropdownMenuSub>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-red-500" onClick={() => handleDeleteMilestone(milestone.id)}>Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow><TableCell colSpan={5} className="text-center">No milestones for this goal yet.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
            <MilestoneDialog
                open={isMilestoneDialogOpen}
                onOpenChange={setIsMilestoneDialogOpen}
                onSave={handleSaveMilestone}
                users={users}
                goalId={goalId}
                initialData={editingMilestone}
            />
        </div>
    );
}


export default function GoalsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: goals, loading: goalsLoading } = useCollection<Goal>(collection(firestore, 'goals'));
  const { data: users, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
  
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingGoal, setEditingGoal] = React.useState<Partial<Goal> | null>(null);
  const [openGoalId, setOpenGoalId] = React.useState<string | null>(null);


  const handleSaveGoal = async (data: Partial<Goal>) => {
    if (editingGoal?.id) {
        await updateDoc(doc(firestore, 'goals', editingGoal.id), data);
        toast({ title: 'Goal Updated' });
    } else {
        await addDoc(collection(firestore, 'goals'), {
            ...data,
            progressPct: 0,
            currentValue: 0,
            health: 'On Track',
            weight: 1, // default weight
            createdAt: new Date().toISOString(),
        });
        toast({ title: 'Goal Created' });
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setIsFormOpen(true);
  };
  
  const handleCreate = () => {
    setEditingGoal(null);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(firestore, 'goals', id));
    toast({ title: 'Goal Deleted' });
  };
  
  const loading = goalsLoading || usersLoading;

  return (
    <>
      <PageHeader title="Goals">
        <Button onClick={handleCreate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Goal
        </Button>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Strategic Goals</CardTitle>
          <CardDescription>
            A list of all strategic goals for the company.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-[40%]">Goal</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="w-[20%]">Progress</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            
              {loading ? (
                <TableBody><TableRow><TableCell colSpan={7} className="h-24 text-center">Loading goals...</TableCell></TableRow></TableBody>
              ) : goals && goals.length > 0 ? (
                goals.map(goal => (
                  <Collapsible asChild key={goal.id} open={openGoalId === goal.id} onOpenChange={(isOpen) => setOpenGoalId(isOpen ? goal.id : null)}>
                    <TableBody>
                      <TableRow>
                          <TableCell>
                              <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <ChevronRight className={cn("h-4 w-4 transition-transform", openGoalId === goal.id && "rotate-90")} />
                                  </Button>
                              </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="font-medium">{goal.title}</TableCell>
                          <TableCell>{users?.find(u => u.id === goal.ownerId)?.name || 'N/A'}</TableCell>
                          <TableCell>
                              <div className="flex items-center gap-2">
                                  <Progress value={goal.progressPct} aria-label={`${goal.progressPct}% complete`} />
                                  <span className="text-xs font-mono">{goal.progressPct}%</span>
                              </div>
                          </TableCell>
                          <TableCell>
                              <Badge variant="outline" className={cn(getHealthBadgeVariant(goal.health))}>
                              <div className="flex items-center gap-1">
                                  {getHealthIcon(goal.health)} {goal.health}
                              </div>
                              </Badge>
                          </TableCell>
                          <TableCell>{goal.endDate ? format(new Date(goal.endDate), 'dd MMM yyyy') : 'N/A'}</TableCell>
                          <TableCell>
                              <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                      <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                      <DropdownMenuItem onClick={() => handleEdit(goal)}>Edit</DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                       <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                              <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-red-500">Delete</DropdownMenuItem>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                              <AlertDialogHeader>
                                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                      This will permanently delete the goal "{goal.title}" and all its milestones.
                                                  </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                  <AlertDialogAction onClick={() => handleDelete(goal.id)}>Delete</AlertDialogAction>
                                              </AlertDialogFooter>
                                          </AlertDialogContent>
                                      </AlertDialog>
                                  </DropdownMenuContent>
                              </DropdownMenu>
                          </TableCell>
                      </TableRow>
                       <CollapsibleContent asChild>
                            <TableRow>
                              <TableCell colSpan={7} className="p-0">
                                  <MilestonesTable goalId={goal.id} users={users || []} />
                              </TableCell>
                            </TableRow>
                       </CollapsibleContent>
                    </TableBody>
                  </Collapsible>
                ))
              ) : (
                <TableBody><TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No goals defined yet. Click "Create Goal" to start.
                  </TableCell>
                </TableRow></TableBody>
              )}
            
          </Table>
        </CardContent>
      </Card>

      <GoalFormDialog 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen}
        onSave={handleSaveGoal}
        users={users || []}
        initialData={editingGoal}
      />
    </>
  );
}
