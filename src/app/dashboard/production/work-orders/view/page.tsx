

'use client';

import * as React from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Loader2, Star, Paperclip } from 'lucide-react';
import { notFound } from 'next/navigation';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import type { WorkOrder, User, Task } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const companyDetails = {
  name: 'JXN Infra Equipment Private Limited',
  address: {
    line1: '123 Industrial Area',
    line2: 'BizTown',
    city: 'Metropolis',
    pin: '12345',
  },
  logo: 'https://placehold.co/350x80/eee/ccc.png?text=Your+Logo',
};

const formatDuration = (totalSeconds?: number) => {
    if (totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

function getWorkOrderStatusBadgeVariant(status: string) {
  switch (status) {
    case 'In Progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'Completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

function PerformanceRating({ task, standardDuration }: { task: Task | undefined, standardDuration: number }) {
    if (!task || task.status !== 'Completed') {
        return <span className="text-muted-foreground text-xs\">N/A</span>;
    }

    let ratingValue = task.rating;
    let actualDurationSeconds = task.actualDuration;

    if (ratingValue === undefined || actualDurationSeconds === undefined) {
        if (!task.startedAt || !task.completedAt) return <span className="text-muted-foreground text-xs\">N/A</span>;
        const start = new Date(task.startedAt).getTime();
        const end = new Date(task.completedAt).getTime();
        let durationSeconds = (end - start) / 1000;
        
        if (task.pausedAt && task.resumedAt) {
            const pause = new Date(task.pausedAt).getTime();
            const resume = new Date(task.resumedAt).getTime();
            durationSeconds -= (resume - pause) / 1000;
        }
        
        actualDurationSeconds = Math.max(1, durationSeconds);
        const standardDurationSeconds = standardDuration * 60;
        const efficiencyRatio = standardDurationSeconds > 0 ? standardDurationSeconds / actualDurationSeconds : 1;
        ratingValue = Math.max(1, Math.min(5, efficiencyRatio * 4));
    }
    
    const fullStars = Math.floor(ratingValue);
    const halfStar = ratingValue - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    const diffSeconds = (standardDuration * 60) - (actualDurationSeconds || 0);
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


export default function ProductionTaskViewPage() {
    const searchParams = useSearchParams();
    const workOrderId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);

    const firestore = useFirestore();
    const workOrderRef = workOrderId ? doc(firestore, 'workOrders', workOrderId) : null;
    const { data: workOrder, loading: workOrderLoading } = useDoc<WorkOrder>(workOrderRef);
    const { data: allUsers, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
    
    const taskIds = React.useMemo(() => workOrder?.productionTasks?.map(pt => pt.taskId).filter(Boolean) || [], [workOrder]);

    const tasksQuery = taskIds.length > 0 ? query(collection(firestore, 'tasks'), where('__name__', 'in', taskIds)) : null;
    const { data: relevantTasks, loading: tasksLoading } = useCollection<Task>(tasksQuery);


    const handleDownloadPdf = async () => {
        const element = pdfRef.current;
        if (!element) return;
        setIsDownloading(true);
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = imgWidth / imgHeight;
        let imgPdfWidth = pdfWidth;
        let imgPdfHeight = pdfWidth / ratio;
        if (imgPdfHeight > pdfHeight) {
            imgPdfHeight = pdfHeight;
            imgPdfWidth = pdfHeight * ratio;
        }
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgPdfHeight);
        pdf.save(`Task-Assignment-${workOrder?.id}.pdf`);
        setIsDownloading(false);
    };

    if (workOrderLoading || usersLoading || tasksLoading) {
        return (
            <PageHeader title="Loading Assignment...">
                <Loader2 className="h-6 w-6 animate-spin" />
            </PageHeader>
        )
    }

    if (!workOrderId || !workOrder) {
        return <PageHeader title="Assignment Not Found" />;
    }

    const totalStandardDuration = workOrder.productionTasks?.reduce((acc, task) => acc + (task.duration || 0), 0) || 0;

    return (
        <>
            <PageHeader title={`Task Assignment: ${workOrderId}`}>
                <Button onClick={handleDownloadPdf} disabled={isDownloading}>
                    {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download PDF
                </Button>
            </PageHeader>
            <Card>
                <CardContent>
                    <div className="max-w-4xl mx-auto p-8" ref={pdfRef}>
                        <header className="flex justify-between items-start border-b pb-4">
                             <div>
                                <Image src={companyDetails.logo} alt="Company Logo" width={175} height={40} className="object-contain" />
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-bold text-primary">{companyDetails.name}</h1>
                                <p className="text-sm text-muted-foreground">{companyDetails.address.line1}, {companyDetails.address.line2}, {companyDetails.address.city} - {companyDetails.address.pin}</p>
                            </div>
                        </header>

                        <section className="my-6">
                             <div className="text-center mb-4">
                                <h2 className="text-xl font-semibold underline">PRODUCTION TASK ASSIGNMENT</h2>
                            </div>
                            <div className="p-4 border rounded-md grid grid-cols-3 gap-4 items-end">
                                <p><strong>Product Name:</strong> {workOrder.productName}</p>
                                <p><strong>Work Order ID:</strong> {workOrder.id}</p>
                                <p><strong>Total Standard Duration:</strong> {totalStandardDuration * workOrder.quantity} minutes</p>
                            </div>
                        </section>

                        <section>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted">
                                        <TableHead>Task Name</TableHead>
                                        <TableHead>Assign To</TableHead>
                                        <TableHead>Std. Duration</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actual Duration</TableHead>
                                        <TableHead>Rating</TableHead>
                                        <TableHead>Attachment</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {workOrder.productionTasks?.map((task, index) => {
                                        const assignee = allUsers?.find(u => u.id === task.assigneeId);
                                        const correspondingTask = relevantTasks?.find(t => t.id === task.taskId);

                                        return (
                                            <TableRow key={task.id || index}>
                                                <TableCell>{task.taskName}</TableCell>
                                                <TableCell>{assignee?.name || 'N/A'}</TableCell>
                                                <TableCell>{task.duration} mins</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn(getWorkOrderStatusBadgeVariant(correspondingTask?.status || 'Pending'))}>
                                                        {correspondingTask?.status || 'Pending'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{formatDuration(correspondingTask?.actualDuration)}</TableCell>
                                                <TableCell>
                                                    <PerformanceRating task={correspondingTask} standardDuration={task.duration} />
                                                </TableCell>
                                                <TableCell>
                                                     {task.attachmentUrl || correspondingTask?.proofImageUrl ? (
                                                        <a href={task.attachmentUrl || correspondingTask?.proofImageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1 text-sm">
                                                            <Paperclip className="h-3 w-3" /> {correspondingTask?.proofImageUrl ? 'View Proof' : 'View Attachment'}
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">None</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </section>
                        
                        <footer className="text-center text-xs text-muted-foreground pt-16">
                            <p>This is a system-generated document.</p>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
