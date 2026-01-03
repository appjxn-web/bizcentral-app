
'use client';

import * as React from 'react';
import { MoreHorizontal, PlusCircle, Briefcase, FolderOpen, Archive, Building2 } from 'lucide-react';
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
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Vacancy } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

function getStatusBadgeVariant(status: 'Open' | 'Closed') {
  return status === 'Open'
    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}

const defaultNewVacancyState = {
    title: '',
    department: '',
    location: '',
    description: '',
    type: 'Full-time' as Vacancy['type'],
};


export default function VacanciesPage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const { data: vacancies, loading } = useCollection<Vacancy>(collection(firestore, 'vacancies'));
    
    const [isSheetOpen, setIsSheetOpen] = React.useState(false);
    const [editingVacancy, setEditingVacancy] = React.useState<Vacancy | null>(null);
    const [newVacancy, setNewVacancy] = React.useState<Omit<Vacancy, 'id' | 'status'>>(defaultNewVacancyState);

    const kpis = React.useMemo(() => {
        if (!vacancies) return { total: 0, open: 0, closed: 0, departmentsHiring: 0 };
        const total = vacancies.length;
        const open = vacancies.filter(v => v.status === 'Open').length;
        const closed = vacancies.filter(v => v.status === 'Closed').length;
        const departmentsHiring = new Set(vacancies.filter(v => v.status === 'Open').map(v => v.department)).size;
        return { total, open, closed, departmentsHiring };
    }, [vacancies]);


    React.useEffect(() => {
        if (!isSheetOpen) {
            setEditingVacancy(null);
            setNewVacancy(defaultNewVacancyState);
        } else if (editingVacancy) {
            setNewVacancy({
                title: editingVacancy.title,
                department: editingVacancy.department,
                location: editingVacancy.location,
                description: editingVacancy.description,
                type: editingVacancy.type,
            });
        }
    }, [isSheetOpen, editingVacancy]);


    const handleInputChange = (field: keyof typeof newVacancy, value: string) => {
        setNewVacancy(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveVacancy = async () => {
        if (!newVacancy.title || !newVacancy.department || !newVacancy.location || !newVacancy.description) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all required fields.' });
            return;
        }

        if (editingVacancy) {
            const vacancyRef = doc(firestore, 'vacancies', editingVacancy.id);
            await updateDoc(vacancyRef, newVacancy);
            toast({ title: 'Vacancy Updated', description: `The vacancy for "${newVacancy.title}" has been updated.` });
        } else {
            const newVacancyData: Omit<Vacancy, 'id'> = {
                ...newVacancy,
                status: 'Open',
            };
            await addDoc(collection(firestore, 'vacancies'), newVacancyData);
            toast({ title: 'Vacancy Created', description: `The vacancy for "${newVacancy.title}" has been successfully created.` });
        }

        setIsSheetOpen(false);
    };

    const handleDelete = async (vacancyId: string) => {
        await deleteDoc(doc(firestore, 'vacancies', vacancyId));
        toast({ title: 'Vacancy Deleted', description: 'The vacancy has been permanently deleted.' });
    };

    const handleEdit = (vacancy: Vacancy) => {
        setEditingVacancy(vacancy);
        setIsSheetOpen(true);
    };


  return (
    <>
      <PageHeader title="Vacancies">
        <Button size="sm" className="gap-1" onClick={() => setIsSheetOpen(true)}>
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Create Vacancy
            </span>
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vacancies</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All job openings ever created</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.open}</div>
            <p className="text-xs text-muted-foreground">Currently active job listings</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hiring Departments</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.departmentsHiring}</div>
            <p className="text-xs text-muted-foreground">Unique departments with open roles</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed Vacancies</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.closed}</div>
            <p className="text-xs text-muted-foreground">Filled or expired job openings</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Openings</CardTitle>
          <CardDescription>
            Manage job vacancies for your company.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                 <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading vacancies...</TableCell></TableRow>
              ) : vacancies && vacancies.length > 0 ? (
                vacancies.map((vacancy) => (
                  <TableRow key={vacancy.id}>
                    <TableCell className="font-medium">{vacancy.title}</TableCell>
                    <TableCell>{vacancy.department}</TableCell>
                    <TableCell>{vacancy.location}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant(vacancy.status))}>
                        {vacancy.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
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
                            <DropdownMenuItem onClick={() => handleEdit(vacancy)}>
                                Edit
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
                                        This action cannot be undone. This will permanently delete the vacancy for {vacancy.title}.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(vacancy.id)} className={buttonVariants({ variant: 'destructive' })}>
                                        Delete
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No vacancies found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
        <Dialog open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingVacancy ? 'Edit Vacancy' : 'Create New Vacancy'}</DialogTitle>
                  <DialogDescription>
                    Fill in the details for the job opening.
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[70vh] p-4 -mx-4">
                 <div className="grid gap-4 px-2">
                    <div className="space-y-2">
                        <Label htmlFor="job-title">Job Title</Label>
                        <Input id="job-title" placeholder="e.g., Software Engineer" value={newVacancy.title} onChange={(e) => handleInputChange('title', e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="department">Department</Label>
                        <Input id="department" placeholder="e.g., Engineering" value={newVacancy.department} onChange={(e) => handleInputChange('department', e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input id="location" placeholder="e.g., Remote, New York" value={newVacancy.location} onChange={(e) => handleInputChange('location', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="job-type">Job Type</Label>
                        <Select value={newVacancy.type} onValueChange={(value: Vacancy['type']) => handleInputChange('type', value)}>
                            <SelectTrigger id="job-type">
                                <SelectValue placeholder="Select a type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Full-time">Full-time</SelectItem>
                                <SelectItem value="Part-time">Part-time</SelectItem>
                                <SelectItem value="Contract">Contract</SelectItem>
                                <SelectItem value="Internship">Internship</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="job-description">Job Description</Label>
                        <Textarea id="job-description" placeholder="Describe the role, responsibilities, and requirements..." value={newVacancy.description} onChange={(e) => handleInputChange('description', e.target.value)} />
                    </div>
                 </div>
                </ScrollArea>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={handleSaveVacancy}>Save Vacancy</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
    </>
  );
}
