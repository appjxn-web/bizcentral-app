
'use client';

import * as React from 'react';
import Image from 'next/image';
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
    DialogTrigger,
    DialogClose
  } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileUp, Camera, Mic, Square, Loader2, CircleDollarSign, Clock, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { transcribeAudio } from '@/ai/flows/transcribe-audio-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, setDoc, doc } from 'firebase/firestore';
import type { ReimbursementRequest } from '@/lib/types';
import { getNextDocNumber } from '@/lib/number-series';


function getStatusBadgeVariant(status: string) {
    switch (status) {
        case 'Paid':
        case 'Approved':
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        case 'Pending Approval':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        case 'Rejected':
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
}

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function ReimbursementPage() {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const firestore = useFirestore();
  const { user } = useUser();
  const reimbursementQuery = user ? query(collection(firestore, 'reimbursementRequests'), where('createdByUid', '==', user.uid)) : null;
  const { data: reimbursementHistory, loading } = useCollection<ReimbursementRequest>(reimbursementQuery);
  const { data: allReimbursements } = useCollection<ReimbursementRequest>(collection(firestore, 'reimbursementRequests'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
  
  const { toast } = useToast();
  const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | undefined>(undefined);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);

  const [description, setDescription] = React.useState('');
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const [dateValue, setDateValue] = React.useState('');

  const [statusFilter, setStatusFilter] = React.useState('All');

  const filteredReimbursements = React.useMemo(() => {
    if (!reimbursementHistory) return [];
    if (statusFilter === 'All') {
      return reimbursementHistory;
    }
    return reimbursementHistory.filter((item) => item.status === statusFilter);
  }, [reimbursementHistory, statusFilter]);


  const kpis = React.useMemo(() => {
    if (!reimbursementHistory) {
      return { totalReimbursed: 0, pendingApproval: 0, approved: 0, rejected: 0 };
    }
    const totalReimbursed = reimbursementHistory
      .filter(r => r.status === 'Paid')
      .reduce((sum, r) => sum + (r.approvedAmount || 0), 0);
    const pendingApproval = reimbursementHistory
      .filter(r => r.status === 'Pending Approval')
      .reduce((sum, r) => sum + r.requestAmount, 0);
    const approved = reimbursementHistory
      .filter(r => r.status === 'Approved')
      .reduce((sum, r) => sum + (r.approvedAmount || 0), 0);
    const rejected = reimbursementHistory
      .filter(r => r.status === 'Rejected')
      .reduce((sum, r) => sum + r.requestAmount, 0);

    return { totalReimbursed, pendingApproval, approved, rejected };
  }, [reimbursementHistory]);


  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    
    let day = rawValue.substring(0, 2);
    let month = rawValue.substring(2, 4);
    let year = rawValue.substring(4, 8);

    if (day.length === 2) {
      let dayNum = parseInt(day, 10);
      if (dayNum < 1) day = '01';
      if (dayNum > 31) day = '31';
    }

    if (month.length === 2) {
      let monthNum = parseInt(month, 10);
      if (monthNum < 1) month = '01';
      if (monthNum > 12) month = '12';
    }
    
    if (year.length === 4) {
        let yearNum = parseInt(year, 10);
        if (yearNum < 1000) year = '1000';
        if (yearNum > 3000) year = '3000';
    }

    let formattedValue = day;
    if (rawValue.length > 2) {
      formattedValue += '-' + month;
    }
    if (rawValue.length > 4) {
      formattedValue += '-' + year;
    }
    
    setDateValue(formattedValue);
  };

  React.useEffect(() => {
    if (isCameraOpen) {
      const getCameraPermission = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          setHasCameraPermission(true);

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error('Error accessing camera:', error);
          setHasCameraPermission(false);
          toast({
            variant: 'destructive',
            title: 'Camera Access Denied',
            description: 'Please enable camera permissions in your browser settings to use this app.',
          });
        }
      };

      getCameraPermission();

      return () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
      }
    }
  }, [isCameraOpen, toast]);

  const handleCapture = () => {
    toast({
        title: "Image Captured",
        description: "Your receipt image has been captured and attached.",
    })
    setIsCameraOpen(false);
  };

  const handleMicClick = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.addEventListener('dataavailable', (event) => {
        audioChunksRef.current.push(event.data);
      });

      mediaRecorderRef.current.addEventListener('stop', async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          setIsTranscribing(true);
          try {
            const result = await transcribeAudio({ audioDataUri: base64Audio });
            setDescription(prev => prev ? `${prev} ${result.transcription}` : result.transcription);
            toast({
              title: 'Transcription Complete',
              description: 'Your voice note has been added to the description.',
            });
          } catch (error) {
            console.error('Error transcribing audio:', error);
            toast({
              variant: 'destructive',
              title: 'Transcription Failed',
            });
          } finally {
            setIsTranscribing(false);
          }
        };
        stream.getTracks().forEach(track => track.stop());
      });

      mediaRecorderRef.current.start();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !settingsData?.prefixes || !allReimbursements) {
        toast({ variant: 'destructive', title: 'Error', description: 'User or settings not found.' });
        return;
    }

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const newRequestId = getNextDocNumber('Reimbursement Request', settingsData.prefixes, allReimbursements);

    const requestData = {
        id: newRequestId,
        date: formData.get('expense-date') as string,
        requestAmount: Number(formData.get('amount')),
        category: formData.get('category') as string,
        description,
        status: 'Pending Approval' as const,
        requestedBy: user.displayName || user.email,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
    };
    
    if (!requestData.date || !requestData.requestAmount || !requestData.category || !requestData.description) {
        toast({
            variant: 'destructive',
            title: 'Missing Information',
            description: 'Please fill out all required fields.',
        });
        return;
    }

    await setDoc(doc(firestore, 'reimbursementRequests', newRequestId), requestData);

    toast({ title: 'Request Submitted', description: 'Your reimbursement request has been submitted for approval.' });
    form.reset();
    setDescription('');
    setDateValue('');
  };


  return (
    <>
      <PageHeader title="Reimbursement">
      </PageHeader>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Reimbursed
            </CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.totalReimbursed)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Approval
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.pendingApproval)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.approved)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.rejected)}</div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Submit a New Request</CardTitle>
                    <CardDescription>Fill out the form to request a new reimbursement.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="expense-date">Expense Date</Label>
                            <Input 
                                name="expense-date"
                                id="expense-date" 
                                placeholder="dd-mm-yyyy"
                                value={dateValue}
                                onChange={handleDateChange}
                                maxLength={10}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount</Label>
                            <Input id="amount" name="amount" type="number" placeholder="₹0.00" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                             <Select name="category">
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="traveling-stay">Traveling & Stay</SelectItem>
                                    <SelectItem value="food">Food & Dining</SelectItem>
                                    <SelectItem value="supplies">Office Supplies</SelectItem>
                                    <SelectItem value="marketing">Marketing</SelectItem>
                                    <SelectItem value="repair-service">Repair & service</SelectItem>
                                    <SelectItem value="transport">Transport</SelectItem>
                                    <SelectItem value="material-handling">Material Handling</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <div className="relative">
                              <Textarea id="description" placeholder="e.g., Lunch with client" className="pr-10" value={description} onChange={(e) => setDescription(e.target.value)} />
                              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={handleMicClick} disabled={isTranscribing}>
                                {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRecording ? <Square className="h-4 w-4 text-red-500" /> : <Mic className="h-4 w-4" />)}
                                <span className="sr-only">Use Voice Note</span>
                              </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Attach Receipt</Label>
                            <div className="flex items-center gap-2">
                                <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                                    <FileUp className="mr-2 h-4 w-4" />
                                    Upload Document
                                </Button>
                                <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
                                    <DialogTrigger asChild>
                                        <Button type="button" variant="outline" className="w-full">
                                            <Camera className="mr-2 h-4 w-4" />
                                            Use Camera
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Capture Receipt</DialogTitle>
                                        </DialogHeader>
                                        <div className="relative">
                                            <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline/>
                                            {hasCameraPermission === false && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
                                                    <Alert variant="destructive" className="w-auto">
                                                        <AlertTitle>Camera Access Required</AlertTitle>
                                                    </Alert>
                                                </div>
                                            )}
                                        </div>
                                        <DialogFooter>
                                            <DialogClose asChild>
                                                <Button type="button" variant="outline">Cancel</Button>
                                            </DialogClose>
                                            <Button onClick={handleCapture} disabled={!hasCameraPermission}>Capture</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                                <Input type="file" ref={fileInputRef} className="hidden" accept="application/pdf,image/png,image/jpeg" />
                            </div>
                        </div>
                        <Button type="submit" className="w-full">
                            Submit Request
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
        <div className="lg:col-span-3">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <Card>
              <CardHeader>
                <CardTitle>My Reimbursement Requests</CardTitle>
                <CardDescription>
                  A list of your submitted expense reimbursements.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="All">All</TabsTrigger>
                    <TabsTrigger value="Pending Approval">Pending</TabsTrigger>
                    <TabsTrigger value="Approved">Approved</TabsTrigger>
                    <TabsTrigger value="Paid">Paid</TabsTrigger>
                    <TabsTrigger value="Rejected">Rejected</TabsTrigger>
                  </TabsList>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Request Amount</TableHead>
                      <TableHead className="text-right">Approved Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
                    ) : filteredReimbursements.length > 0 ? (
                      filteredReimbursements.map((item) => (
                        <Dialog key={item.id}>
                            <DialogTrigger asChild>
                                <TableRow className="cursor-pointer">
                                    <TableCell>{item.date}</TableCell>
                                    <TableCell className="font-medium">{item.description}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant(item.status))}>
                                        {item.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{formatIndianCurrency(item.requestAmount)}</TableCell>
                                    <TableCell className="text-right">{formatIndianCurrency(item.approvedAmount || 0)}</TableCell>
                                </TableRow>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Reimbursement Details</DialogTitle>
                                    <DialogDescription>
                                        Full details for request ID: {item.id}
                                    </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="max-h-[60vh] p-4">
                                    <div className="grid gap-4">
                                    </div>
                                </ScrollArea>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button type="button">Close</Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          No requests found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Tabs>
        </div>
      </div>
    </>
  );
}
