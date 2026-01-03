
'use client';

import * as React from 'react';
import {
  MoreHorizontal,
  ListFilter,
  PlusCircle,
  FileDown,
  FileUp,
  Briefcase,
  Check,
  X,
  Send,
  Users,
  ClipboardList,
  UserCheck,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Applicant, Vacancy } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, where, doc, addDoc, setDoc, deleteDoc } from 'firebase/firestore';

const allStatuses: Applicant['status'][] = [
  'Pending Review',
  'Shortlisted',
  'Interviewing',
  'Offered',
  'Rejected',
  'Hired',
];

function getStatusBadgeVariant(status: Applicant['status']) {
  const variants: Partial<Record<Applicant['status'], string>> = {
    'Pending Review': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Shortlisted': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    'Interviewing': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    'Offered': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
    'Hired': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'Rejected': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  };
  return variants[status] || 'bg-gray-100 text-gray-800';
}

function ResumesPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: applicants, loading: applicantsLoading } = useCollection<Applicant>(collection(firestore, 'applicants'));
  const { data: vacancies, loading: vacanciesLoading } = useCollection<Vacancy>(collection(firestore, 'vacancies'));
  
  const [statusFilters, setStatusFilters] = React.useState<Applicant['status'][]>([]);
  const [viewingApplicant, setViewingApplicant] = React.useState<Applicant | null>(null);
  const [interviewingApplicant, setInterviewingApplicant] = React.useState<Applicant | null>(null);
  const [offeringApplicant, setOfferingApplicant] = React.useState<Applicant | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);

  const [newApplicant, setNewApplicant] = React.useState<{name: string, email: string, phone: string, vacancyId: string, address: string}>({ name: '', email: '', phone: '', vacancyId: '', address: ''});
  const [resumeFile, setResumeFile] = React.useState<File | null>(null);
  const resumeInputRef = React.useRef<HTMLInputElement>(null);
  
  const [offerSalaryType, setOfferSalaryType] = React.useState<'monthly' | 'hourly'>('monthly');
  const [offerSalaryValue, setOfferSalaryValue] = React.useState('');
  const [basicHourlyRate, setBasicHourlyRate] = React.useState('');
  const [offerSkills, setOfferSkills] = React.useState<{ skill: string, rate: string }[]>([]);
  const [offerAllowances, setOfferAllowances] = React.useState<{ name: string, value: string }[]>([]);

  const totalHourlyRate = React.useMemo(() => {
    const basic = parseFloat(basicHourlyRate) || 0;
    const skillsTotal = offerSkills.reduce((acc, skill) => acc + (parseFloat(skill.rate) || 0), 0);
    return basic + skillsTotal;
  }, [basicHourlyRate, offerSkills]);
  
  const filteredApplicants = React.useMemo(() => {
    if (!applicants) return [];
    return applicants.filter(applicant => {
      const statusMatch = statusFilters.length === 0 || statusFilters.includes(applicant.status);
      return statusMatch;
    });
  }, [applicants, statusFilters]);

  const kpis = React.useMemo(() => {
    if (!applicants) return { total: 0, shortlisted: 0, interviewing: 0, hired: 0 };
    return {
        total: applicants.length,
        shortlisted: applicants.filter(a => a.status === 'Shortlisted').length,
        interviewing: applicants.filter(a => a.status === 'Interviewing').length,
        hired: applicants.filter(a => a.status === 'Hired').length,
    }
  }, [applicants]);

  const handleStatusFilterChange = (status: Applicant['status']) => {
    setStatusFilters(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };
  
  const viewApplicantDetails = (applicant: Applicant) => {
    setViewingApplicant(applicant);
  };

  const openInterviewDialog = (applicant: Applicant) => {
    setInterviewingApplicant(applicant);
  };
  
  const openOfferDialog = (applicant: Applicant) => {
    setOfferSalaryType('monthly');
    setOfferSalaryValue('');
    setBasicHourlyRate('');
    setOfferSkills([]);
    setOfferAllowances([]);
    setOfferingApplicant(applicant);
  };

  const handleAddApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const name = formData.get('add-name') as string;
    const email = formData.get('add-email') as string;
    const phone = formData.get('add-phone') as string;
    const vacancyId = newApplicant.vacancyId;

    const addressLine1 = formData.get('address-line-1') as string;
    const addressLine2 = formData.get('address-line-2') as string;
    const city = formData.get('city') as string;
    const district = formData.get('district') as string;
    const state = formData.get('state') as string;
    const country = formData.get('country') as string;
    const pin = formData.get('pin') as string;

    if (!name || !email || !phone || !vacancyId) {
        toast({
            variant: 'destructive',
            title: 'Missing Information',
            description: 'Please fill in all required fields.',
        });
        return;
    }

    const selectedVacancy = vacancies?.find(v => v.id === vacancyId);
    if (!selectedVacancy) {
      toast({ variant: 'destructive', title: 'Invalid Vacancy' });
      return;
    }
    
    const fullAddress = [addressLine1, addressLine2, city, district, state, country, pin].filter(Boolean).join(', ');

    const newAppData: Omit<Applicant, 'id'> = {
        name,
        email,
        phone,
        address: fullAddress,
        avatar: `https://i.pravatar.cc/150?u=${email}`,
        vacancyId: vacancyId,
        vacancyTitle: selectedVacancy.title,
        appliedDate: new Date().toISOString(),
        status: 'Pending Review',
        // In a real app, you would upload the file and store the URL
        resumeUrl: resumeFile ? '#' : undefined,
    };

    await addDoc(collection(firestore, 'applicants'), newAppData);

    toast({
        title: 'Application Added',
        description: `Application for ${name} has been added.`,
    });
    setIsAddDialogOpen(false);
    setNewApplicant({ name: '', email: '', phone: '', vacancyId: '', address: ''});
    setResumeFile(null);
    form.reset();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setResumeFile(file);
      toast({
        title: 'Resume Uploaded',
        description: file.name,
      });
    }
  };

  const handleSaveInterview = async () => {
    if (!interviewingApplicant) return;
    const applicantRef = doc(firestore, 'applicants', interviewingApplicant.id);
    await setDoc(applicantRef, { status: 'Interviewing' }, { merge: true });
    toast({
      title: 'Interview Details Saved',
      description: `Details for ${interviewingApplicant.name} have been recorded and status updated to "Interviewing".`,
    });
    setInterviewingApplicant(null);
  };
  
  const updateApplicantStatus = async (applicantId: string, status: Applicant['status']) => {
    const applicantRef = doc(firestore, 'applicants', applicantId);
    await setDoc(applicantRef, { status }, { merge: true });
    setViewingApplicant(null);
    toast({
      title: 'Status Updated',
      description: `Applicant has been marked as ${status}.`
    });
  }

  const handleSendOffer = async () => {
    if (!offeringApplicant) return;

    // In a real app, you would save this data and likely send an email.
    toast({
      title: 'Offer Sent',
      description: `An offer has been created and sent to ${offeringApplicant.name}.`,
    });
    
    const applicantRef = doc(firestore, 'applicants', offeringApplicant.id);
    await setDoc(applicantRef, { status: 'Offered' }, { merge: true });
    setOfferingApplicant(null);
  };
  
  const generateOfferLetterContent = () => {
    if (!offeringApplicant) return '';
    
    let salaryText = '';
    if (offerSalaryType === 'monthly') {
        salaryText = `Your starting salary will be ₹${offerSalaryValue || '[Offered Salary]'} per annum.`;
    } else {
        const skillsText = offerSkills.filter(s => s.skill && s.rate).map(s => `- ${s.skill}: ₹${parseFloat(s.rate).toFixed(2)}/hour`).join('\n');
        const allowancesText = offerAllowances.filter(a => a.name && a.value).map(a => `${a.name} allowance of ₹${parseFloat(a.value).toFixed(2)}`).join(', ');

        let salaryDetails = `Your starting hourly rate is composed as follows:\n- Basic Rate: ₹${parseFloat(basicHourlyRate || '0').toFixed(2)}/hour`;
        if (skillsText) {
          salaryDetails += `\n${skillsText}`;
        }
        salaryDetails += `\n\nYour total offered hourly rate is ₹${totalHourlyRate.toFixed(2)}.`;

        if (allowancesText) {
          salaryDetails += `\n\nAdditionally, you will receive the following fixed allowances: ${allowancesText}.`;
        }
        salaryText = salaryDetails;
    }

    return `Dear ${offeringApplicant.name},\n\nWe are pleased to offer you the position of ${offeringApplicant.vacancyTitle} at JXN Infra Equipment Private Limited.\n\n${salaryText}\n\nWe would like you to start on [Joining Date]. Please confirm your acceptance of this offer by [Acceptance Deadline].\n\nSincerely,\nHR Department`;
  }
  
  const handleSkillChange = (index: number, field: 'skill' | 'rate', value: string) => {
    const newSkills = [...offerSkills];
    newSkills[index][field] = value;
    setOfferSkills(newSkills);
  };

  const addSkill = () => {
    setOfferSkills([...offerSkills, { skill: '', rate: '' }]);
  };

  const handleAllowanceChange = (index: number, field: 'name' | 'value', value: string) => {
    const newAllowances = [...offerAllowances];
    newAllowances[index][field] = value;
    setOfferAllowances(newAllowances);
  };

  const addAllowance = () => {
    setOfferAllowances([...offerAllowances, { name: '', value: '' }]);
  };

  const handleDeleteApplicant = async (applicantId: string) => {
    await deleteDoc(doc(firestore, 'applicants', applicantId));
    toast({ title: 'Applicant Deleted' });
  }

  return (
    <>
      <PageHeader title="Resumes & Applications">
        <div className="flex items-center gap-2">
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                    Filter by Status
                </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="h-48">
                {allStatuses.map(status => (
                    <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilters.includes(status)}
                    onCheckedChange={() => handleStatusFilterChange(status)}
                    >
                    {status}
                    </DropdownMenuCheckboxItem>
                ))}
                </ScrollArea>
            </DropdownMenuContent>
            </DropdownMenu>
             <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" className="h-8 gap-1">
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                            Add Application
                        </span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg flex flex-col h-full max-h-[90vh]">
                     <DialogHeader>
                        <DialogTitle>Add New Application</DialogTitle>
                        <DialogDescription>
                            Manually enter a new applicant's details.
                        </DialogDescription>
                    </DialogHeader>
                     <form onSubmit={handleAddApplication} className="flex-1 overflow-hidden flex flex-col">
                        <ScrollArea className="flex-1 -mx-6 px-6">
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="add-name">Applicant Name</Label>
                                    <Input id="add-name" name="add-name" placeholder="e.g. John Doe" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="add-email">Email</Label>
                                    <Input id="add-email" name="add-email" type="email" placeholder="e.g. john@example.com" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="add-phone">Phone</Label>
                                    <Input id="add-phone" name="add-phone" type="tel" placeholder="e.g. 123-456-7890" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address-line-1">Address Line 1</Label>
                                    <Input id="address-line-1" name="address-line-1" placeholder="e.g., 123 Main St" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address-line-2">Address Line 2</Label>
                                    <Input id="address-line-2" name="address-line-2" placeholder="e.g., Suite 4B, Apartment, etc." />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="city">City</Label>
                                        <Input id="city" name="city" placeholder="e.g., Metropolis" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="district">District</Label>
                                        <Input id="district" name="district" placeholder="e.g., Central District" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="state">State</Label>
                                        <Input id="state" name="state" placeholder="e.g., California" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="country">Country</Label>
                                        <Input id="country" name="country" defaultValue="India" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="pin">PIN</Label>
                                        <Input id="pin" name="pin" placeholder="e.g., 123456" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="digital-pin">Digital PIN (Optional)</Label>
                                        <Input id="digital-pin" name="digital-pin" placeholder="e.g., 9876" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="add-vacancy">Applying For</Label>
                                    <Select value={newApplicant.vacancyId} onValueChange={(value) => setNewApplicant(prev => ({...prev, vacancyId: value}))}>
                                        <SelectTrigger id="add-vacancy">
                                            <SelectValue placeholder="Select a vacancy" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vacancies?.filter(v => v.status === 'Open').map(vacancy => (
                                                <SelectItem key={vacancy.id} value={vacancy.id}>{vacancy.title}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                <Label>Upload Resume</Label>
                                <input type="file" ref={resumeInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.doc,.docx" />
                                <Button type="button" variant="outline" className="w-full" onClick={() => resumeInputRef.current?.click()}>
                                    <FileUp className="h-4 w-4 mr-2" />
                                    Upload Resume
                                </Button>
                                {resumeFile && <p className="text-sm text-muted-foreground">{resumeFile.name}</p>}
                                </div>
                            </div>
                        </ScrollArea>
                        <DialogFooter className="pt-4 border-t">
                            <DialogClose asChild>
                                <Button type="button" variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button type="submit">Save Application</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
      </PageHeader>
      
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All received applications.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shortlisted</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.shortlisted}</div>
            <p className="text-xs text-muted-foreground">Candidates moved to the next stage.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interviewing</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.interviewing}</div>
            <p className="text-xs text-muted-foreground">Candidates in the interview process.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hired</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.hired}</div>
            <p className="text-xs text-muted-foreground">Successful candidates this period.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Received Applications</CardTitle>
          <CardDescription>
            Manage and review all job applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Applying For</TableHead>
                <TableHead>Date Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applicantsLoading ? (
                 <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading applications...</TableCell></TableRow>
              ) : filteredApplicants.length > 0 ? (
                filteredApplicants.map((applicant) => (
                  <TableRow key={applicant.id} className="cursor-pointer" onClick={() => viewApplicantDetails(applicant)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={applicant.avatar} />
                          <AvatarFallback>
                            {applicant.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{applicant.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {applicant.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{applicant.vacancyTitle}</TableCell>
                    <TableCell>
                      {format(new Date(applicant.appliedDate), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', getStatusBadgeVariant(applicant.status))}
                      >
                        {applicant.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-haspopup="true"
                            size="icon"
                            variant="ghost"
                            onClick={(e) => e.stopPropagation()} // Prevent row click
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => viewApplicantDetails(applicant)}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openInterviewDialog(applicant); }}>
                             <Briefcase className="mr-2 h-4 w-4" />
                             Record Interview
                          </DropdownMenuItem>
                           <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openOfferDialog(applicant); }}>
                            <Send className="mr-2 h-4 w-4" />
                            Create Offer
                          </DropdownMenuItem>
                           <DropdownMenuSeparator />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/40">
                                        Delete
                                    </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently delete the application for {applicant.name}.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteApplicant(applicant.id);
                                            }}
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
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No applications found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {viewingApplicant && (
        <Dialog open={!!viewingApplicant} onOpenChange={(open) => !open && setViewingApplicant(null)}>
            <DialogContent className="sm:max-w-lg">
                 <DialogHeader>
                    <DialogTitle>Applicant Details</DialogTitle>
                    <DialogDescription>
                        Reviewing application for {viewingApplicant.vacancyTitle}.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={viewingApplicant.avatar} />
                            <AvatarFallback>{viewingApplicant.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <h3 className="text-lg font-semibold">{viewingApplicant.name}</h3>
                            <p className="text-sm text-muted-foreground">{viewingApplicant.email}</p>
                            <p className="text-sm text-muted-foreground">{viewingApplicant.phone}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Status:</p>
                        <Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant(viewingApplicant.status))}>
                            {viewingApplicant.status}
                        </Badge>
                    </div>
                    <div>
                        <p className="text-sm font-medium">Address:</p>
                        <p className="text-sm text-muted-foreground">{viewingApplicant.address}</p>
                    </div>
                    {viewingApplicant.resumeUrl && (
                        <Button variant="outline" asChild>
                            <a href={viewingApplicant.resumeUrl} target="_blank" rel="noopener noreferrer">
                                <FileDown className="mr-2 h-4 w-4" />
                                Download Resume
                            </a>
                        </Button>
                    )}
                </div>
                 <DialogFooter className="justify-between">
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                    </DialogClose>
                    <div className="flex gap-2">
                        <Button 
                            variant="destructive"
                            onClick={() => updateApplicantStatus(viewingApplicant.id, 'Rejected')}
                        >
                            <X className="mr-2 h-4 w-4" />
                            Reject
                        </Button>
                        <Button 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => updateApplicantStatus(viewingApplicant.id, 'Shortlisted')}
                        >
                            <Check className="mr-2 h-4 w-4" />
                            Shortlist
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      {interviewingApplicant && (
        <Dialog open={!!interviewingApplicant} onOpenChange={(open) => !open && setInterviewingApplicant(null)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Interview Details for {interviewingApplicant.name}</DialogTitle>
                    <DialogDescription>
                        Record interview notes and feedback.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] p-1">
                    <div className="grid gap-4 py-4 px-4">
                        <div className="space-y-2">
                            <Label htmlFor="work-experience">Work Experience</Label>
                            <Textarea id="work-experience" placeholder="Summarize the candidate's relevant work experience..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="accepted-salary">Accepted Salary (₹)</Label>
                                <Input id="accepted-salary" type="number" placeholder="e.g., 800000" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="joining-date">Expected Joining Date</Label>
                                <Input id="joining-date" type="date" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="interview-qa">Other Q&A / Remarks</Label>
                            <Textarea id="interview-qa" placeholder="Record any other questions, answers, or general remarks about the candidate..." />
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button type="button" onClick={handleSaveInterview}>Save Details</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      {offeringApplicant && (
        <Dialog open={!!offeringApplicant} onOpenChange={(open) => !open && setOfferingApplicant(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Offer for {offeringApplicant.name}</DialogTitle>
              <DialogDescription>
                Position: {offeringApplicant.vacancyTitle}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] p-1">
              <div className="grid gap-4 py-4 px-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="offer-date">Offer Date</Label>
                        <Input id="offer-date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="joining-date-offer">Joining Date</Label>
                        <Input id="joining-date-offer" type="date" />
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="salary-type">Salary Type</Label>
                      <Select value={offerSalaryType} onValueChange={(value: 'monthly' | 'hourly') => setOfferSalaryType(value)}>
                        <SelectTrigger id="salary-type">
                          <SelectValue placeholder="Select salary type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly (CTC)</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {offerSalaryType === 'monthly' ? (
                      <div className="space-y-2">
                        <Label htmlFor="offered-salary-ctc">Offered Salary (CTC)</Label>
                        <Input id="offered-salary-ctc" type="number" placeholder="e.g., 900000" value={offerSalaryValue} onChange={(e) => setOfferSalaryValue(e.target.value)} />
                      </div>
                    ) : (
                      <div className="space-y-4 rounded-md border p-4">
                        <div className="space-y-2">
                           <Label>Hourly Rate Breakdown</Label>
                           <div className="space-y-2">
                                <Label htmlFor="basic-hourly-rate" className="text-xs font-normal text-muted-foreground">Basic Hourly Rate (₹)</Label>
                                <Input id="basic-hourly-rate" type="number" placeholder="e.g., 400" value={basicHourlyRate} onChange={(e) => setBasicHourlyRate(e.target.value)} />
                           </div>
                           {offerSkills.map((skill, index) => (
                             <div key={index} className="grid grid-cols-2 gap-2 items-center">
                               <Input placeholder="Skill Name" value={skill.skill} onChange={(e) => handleSkillChange(index, 'skill', e.target.value)} />
                               <Input type="number" placeholder="Rate (₹)" value={skill.rate} onChange={(e) => handleSkillChange(index, 'rate', e.target.value)} />
                             </div>
                           ))}
                           <Button type="button" variant="outline" size="sm" onClick={addSkill} className="w-full">
                             <PlusCircle className="mr-2 h-4 w-4" /> Add Skill Rate
                           </Button>
                        </div>
                         <div className="space-y-2 border-t pt-4">
                            <Label>Total Offered Hourly Rate (₹)</Label>
                            <Input value={totalHourlyRate.toFixed(2)} disabled className="font-semibold" />
                        </div>
                        <div className="space-y-2 border-t pt-4">
                           <Label>Fixed Allowances</Label>
                            {offerAllowances.map((allowance, index) => (
                             <div key={index} className="grid grid-cols-2 gap-2 items-center">
                                <Input placeholder="Allowance Name" value={allowance.name} onChange={(e) => handleAllowanceChange(index, 'name', e.target.value)} />
                               <Input type="number" placeholder="Amount (₹)" value={allowance.value} onChange={(e) => handleAllowanceChange(index, 'value', e.target.value)} />
                             </div>
                           ))}
                           <Button type="button" variant="outline" size="sm" onClick={addAllowance} className="w-full">
                             <PlusCircle className="mr-2 h-4 w-4" /> Add Allowance
                           </Button>
                        </div>
                      </div>
                    )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="acceptance-deadline">Acceptance Deadline</Label>
                        <Input id="acceptance-deadline" type="date" />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="offer-letter">Offer Letter Content</Label>
                    <Textarea 
                        id="offer-letter" 
                        placeholder="Paste or write the offer letter content here..." 
                        rows={10}
                        value={generateOfferLetterContent()}
                        readOnly // The content is now generated dynamically
                    />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="button" onClick={handleSendOffer}>Send Offer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}


export default function ResumesPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <ResumesPageContent />;
}
