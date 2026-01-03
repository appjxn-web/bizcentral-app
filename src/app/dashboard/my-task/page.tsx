

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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Camera, Clock, CheckCircle, Upload, Paperclip, PlayCircle, PauseCircle, Wrench, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { useUser, useFirestore, useCollection, useDoc, useStorage } from '@/firebase';
import { collection, doc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import type { Task, TaskStatus, Attendance, PunchLog, WorkOrder } from '@/lib/types';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

function CompletionDialog({
    isCompletionDialogOpen,
    setIsCompletionDialogOpen,
    completingTask,
    handleSubmitCompletion,
    hasCameraPermission,
    videoRef,
    canvasRef,
    handleCaptureProof,
    proofImage,
    setProofImage
}: {
    isCompletionDialogOpen: boolean;
    setIsCompletionDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
    completingTask: Task | null;
    handleSubmitCompletion: () => void;
    hasCameraPermission: boolean | undefined;
    videoRef: React.RefObject<HTMLVideoElement>;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    handleCaptureProof: () => void;
    proofImage: string | null;
    setProofImage: (image: string | null) => void;
}) {
    return (
        <Dialog open={isCompletionDialogOpen} onOpenChange={(open) => {
            if (!open) {
                setProofImage(null); // Reset proof image on close
            }
            setIsCompletionDialogOpen(open);
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Submit Proof of Completion</DialogTitle>
                    <DialogDescription>Take a picture of the completed task to finalize.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    {!proofImage ? (
                        <div className="relative">
                            <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
                            <canvas ref={canvasRef} className="hidden" />
                            {hasCameraPermission === false && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
                                    <Alert variant="destructive" className="w-auto">
                                        <AlertTitle>Camera Access Required</AlertTitle>
                                    </Alert>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <Label>Captured Proof</Label>
                            <img src={proofImage} alt="Proof of completion" className="rounded-md border p-1" />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCompletionDialogOpen(false)}>Cancel</Button>
                    {!proofImage ? (
                        <Button onClick={handleCaptureProof} disabled={!hasCameraPermission}><Camera className="mr-2 h-4 w-4" /> Capture</Button>
                    ) : (
                        <div className="flex gap-2">
                             <Button variant="outline" onClick={() => setProofImage(null)}>
                                <RefreshCw className="mr-2 h-4 w-4" /> Retake
                            </Button>
                            <Button onClick={handleSubmitCompletion}><Upload className="mr-2 h-4 w-4" /> Submit Proof</Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function getStatusBadgeVariant(status: TaskStatus) {
  const variants: Record<TaskStatus, string> = {
    Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'In Progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'On Hold': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  };
  return variants[status];
}

const formatDuration = (totalSeconds: number) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

function MyTaskPageContent() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    const storage = useStorage();

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayDocRef = user ? doc(firestore, 'users', user.uid, 'attendance', todayStr) : null;
    const { data: todayAttendance } = useDoc<Attendance>(todayDocRef);

    const tasksQuery = React.useMemo(() => {
        if (!user) return null;
        return query(collection(firestore, 'tasks'), where('assigneeId', '==', user.uid));
    }, [user, firestore]);

    const { data: tasks, loading } = useCollection<Task>(tasksQuery);
    const { data: workOrders } = useCollection<WorkOrder>(collection(firestore, 'workOrders'));
    
    const [viewingTask, setViewingTask] = React.useState<Task | null>(null);
    const [isCompletionDialogOpen, setIsCompletionDialogOpen] = React.useState(false);
    const [completingTask, setCompletingTask] = React.useState<Task | null>(null);
    const [proofImage, setProofImage] = React.useState<string | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | undefined>(undefined);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    const [elapsedTime, setElapsedTime] = React.useState(0);

    // Effect to calculate and update the timer
    React.useEffect(() => {
        let timer: NodeJS.Timeout | undefined;

        const calculateElapsedTime = () => {
            if (!viewingTask) return 0;

            // Use stored actualDuration for completed tasks
            if (viewingTask.status === 'Completed' && typeof viewingTask.actualDuration === 'number') {
                return viewingTask.actualDuration;
            }

            const start = viewingTask.startedAt ? new Date(viewingTask.startedAt).getTime() : 0;
            if (start === 0) return 0;
            
            let totalSeconds = 0;
            
            if (viewingTask.status === 'In Progress') {
                 let baseDurationSeconds = 0;
                 if (viewingTask.pausedAt && new Date(viewingTask.pausedAt) > new Date(viewingTask.startedAt || 0)) {
                    baseDurationSeconds = (new Date(viewingTask.pausedAt).getTime() - new Date(viewingTask.startedAt || 0).getTime()) / 1000;
                 }

                 let lastStartTime = start;
                 if (viewingTask.resumedAt && new Date(viewingTask.resumedAt) > (viewingTask.pausedAt ? new Date(viewingTask.pausedAt) : new Date(0))) {
                    lastStartTime = new Date(viewingTask.resumedAt).getTime();
                 } else if (viewingTask.pausedAt) {
                    return baseDurationSeconds;
                 }


                 const runningDuration = (new Date().getTime() - lastStartTime) / 1000;
                 totalSeconds = baseDurationSeconds + runningDuration;

            } else if (viewingTask.status === 'On Hold' && viewingTask.pausedAt) {
                totalSeconds = (new Date(viewingTask.pausedAt).getTime() - start) / 1000;
            } else if (viewingTask.status === 'Pending') {
                return 0;
            }

            return totalSeconds < 0 ? 0 : totalSeconds;
        };

        setElapsedTime(calculateElapsedTime());

        if (viewingTask?.status === 'In Progress') {
            timer = setInterval(() => {
                setElapsedTime(calculateElapsedTime());
            }, 1000);
        }

        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [viewingTask]);

    const kpis = React.useMemo(() => {
        if (!tasks) return { pending: 0, inProgress: 0, completed: 0 };
        return {
            pending: tasks.filter(t => t.status === 'Pending').length,
            inProgress: tasks.filter(t => t.status === 'In Progress').length,
            completed: tasks.filter(t => t.status === 'Completed').length,
        }
    }, [tasks]);
    
    React.useEffect(() => {
        if (isCompletionDialogOpen) {
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
    }, [isCompletionDialogOpen]);

    const handleUpdateStatus = async (taskId: string, status: TaskStatus) => {
        const taskRef = doc(firestore, 'tasks', taskId);
        
        const updates: Partial<Task> = { status };
        const currentTask = tasks?.find(t => t.id === taskId);
        
        if (status === 'In Progress') {
            // Pre-checks before starting a task
            const lastPunch = todayAttendance?.punches?.[todayAttendance.punches.length - 1];
            if (!lastPunch || lastPunch.outTime) {
                toast({ variant: 'destructive', title: 'Not Punched In', description: 'You must be punched in to start a task.' });
                return;
            }
            if (lastPunch.type === 'Field' && !lastPunch.isApproved) {
                toast({ variant: 'destructive', title: 'Approval Required', description: 'Your field punch-in requires HR approval before starting tasks.' });
                return;
            }

            if (currentTask?.category === 'Production') {
                const relatedWorkOrder = workOrders?.find(wo => wo.productionTasks?.some(pt => pt.taskId === taskId));
                if (relatedWorkOrder && (!relatedWorkOrder.issuedItems || relatedWorkOrder.issuedItems.length === 0)) {
                    toast({
                        variant: 'destructive',
                        title: 'Cannot start task',
                        description: "Raw materials have not been issued for the Work Order. Please go to 'Inventories & Reports' > 'Outwards' to issue materials.",
                        duration: 7000,
                    });
                    return;
                }
            }

            // Auto-pause other tasks
            const batch = writeBatch(firestore);
            const otherInProgressTasks = tasks?.filter(t => t.id !== taskId && t.status === 'In Progress');
            otherInProgressTasks?.forEach(taskToPause => {
                const otherTaskRef = doc(firestore, 'tasks', taskToPause.id);
                batch.update(otherTaskRef, { status: 'On Hold', pausedAt: new Date().toISOString() });
            });

            await batch.commit();
            if (otherInProgressTasks && otherInProgressTasks.length > 0) {
                 toast({ title: 'Tasks Auto-Paused', description: `${otherInProgressTasks.length} other task(s) have been put on hold.` });
            }


            if (currentTask?.status === 'Pending') {
                 updates.startedAt = new Date().toISOString();
            } else if (currentTask?.status === 'On Hold') {
                 updates.resumedAt = new Date().toISOString();
            }
        } else if (status === 'On Hold') {
            updates.pausedAt = new Date().toISOString();
        } else if (status === 'Completed') {
             handleOpenCompletionDialog(currentTask!);
             return;
        }
        
        await updateDoc(taskRef, updates);
        
        if (viewingTask?.id === taskId) {
            setViewingTask(prev => prev ? { ...prev, ...updates } : null);
        }
        toast({
            title: 'Task Status Updated',
            description: `The task has been marked as \"${status}\".`,
        });
    };
    
    const handleOpenCompletionDialog = (task: Task) => {
        setCompletingTask(task);
        setIsCompletionDialogOpen(true);
        setViewingTask(null);
    };

    const handleCaptureProof = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg');
            setProofImage(dataUrl);
        }
    };
    
    const handleSubmitCompletion = async () => {
        if (!completingTask || !proofImage) return;

        const taskRef = doc(firestore, 'tasks', completingTask.id);
        const storageRef = ref(storage, `task-proofs/${completingTask.id}/${Date.now()}.jpg`);
        const snapshot = await uploadString(storageRef, proofImage, 'data_url');
        const downloadUrl = await getDownloadURL(snapshot.ref);
        
        const completedAt = new Date();
        const startedAt = completingTask.startedAt ? new Date(completingTask.startedAt) : new Date(completedAt.getTime() - 10 * 60000);
        
        let durationMs = completedAt.getTime() - startedAt.getTime();

        if (completingTask.pausedAt && completingTask.resumedAt) {
            const pause = new Date(completingTask.pausedAt).getTime();
            const resume = new Date(completingTask.resumedAt).getTime();
            if (resume > pause) {
              durationMs -= (resume - pause);
            }
        }
        
        const actualDurationSeconds = Math.max(1, Math.round(durationMs / 1000));
        const standardDurationSeconds = (completingTask.duration || 0) * 60;
        
        let rating = 0;
        if (standardDurationSeconds > 0) {
            const efficiencyRatio = standardDurationSeconds / actualDurationSeconds;
            rating = Math.max(1, Math.min(5, efficiencyRatio * 4));
            rating = parseFloat(rating.toFixed(1));
        } else {
            rating = 5;
        }

        await updateDoc(taskRef, {
            proofImageUrl: downloadUrl,
            status: 'Completed',
            completedAt: completedAt.toISOString(),
            actualDuration: actualDurationSeconds,
            rating: rating,
        });

        toast({ title: 'Task Completed!', description: 'Proof has been submitted.'});
        setIsCompletionDialogOpen(false);
        setCompletingTask(null);
        setProofImage(null);
    };

  return (
    <>
      <PageHeader title="My Tasks" />
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pending}</div>
            <p className="text-xs text-muted-foreground">Tasks waiting to be started.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inProgress}</div>
            <p className="text-xs text-muted-foreground">Tasks you are currently working on.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed This Week</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.completed}</div>
            <p className="text-xs text-muted-foreground">Tasks finished in the last 7 days.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Tasks</CardTitle>
          <CardDescription>A list of tasks assigned to you.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading tasks...</TableCell></TableRow>
              ) : (tasks || []).length > 0 ? (
                tasks.map((task) => (
                    <TableRow key={task.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewingTask(task)}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell><Badge variant="outline">{task.category}</Badge></TableCell>
                        <TableCell>{format(new Date(task.dueDate), 'dd/MM/yyyy')}</TableCell>
                        <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(task.status))}>{task.status}</Badge></TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No tasks found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {viewingTask && (
        <Dialog open={!!viewingTask} onOpenChange={(open) => !open && setViewingTask(null)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{viewingTask.title}</DialogTitle>
                    <DialogDescription>
                        Due by {format(new Date(viewingTask.dueDate), 'dd/MM/yyyy')}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] p-1">
                    <div className="space-y-4 px-4 py-2">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <strong className="text-sm font-medium">Status:</strong>
                                <Badge variant="outline" className={cn('text-sm', getStatusBadgeVariant(viewingTask.status))}>{viewingTask.status}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <strong className="text-sm font-medium">Total Time Taken:</strong>
                                <span className="font-mono text-sm font-semibold">{formatDuration(elapsedTime)}</span>
                            </div>
                        </div>
                        {viewingTask.duration && (
                            <div>
                                <h4 className="font-semibold text-sm">Standard Duration</h4>
                                <p className="text-sm text-muted-foreground">{viewingTask.duration} minutes</p>
                            </div>
                        )}
                        <div>
                            <h4 className="font-semibold text-sm">Description</h4>
                            <p className="text-sm text-muted-foreground">{viewingTask.description}</p>
                        </div>
                         <div>
                            <h4 className="font-semibold text-sm">Assigned By</h4>
                            <p className="text-sm text-muted-foreground">{viewingTask.assignedBy}</p>
                        </div>
                        {viewingTask.attachmentUrl && (
                            <div>
                                <h4 className="font-semibold text-sm">Attachment</h4>
                                <a href={viewingTask.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1 text-sm">
                                    <Paperclip className="h-3 w-3" /> View Attachment
                                </a>
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter className="justify-between">
                    <Button type="button" variant="outline" onClick={() => setViewingTask(null)}>Close</Button>
                     <div className="flex gap-2">
                        {viewingTask.status === 'Pending' && (
                            <Button onClick={() => handleUpdateStatus(viewingTask.id, 'In Progress')}>
                                <PlayCircle className="mr-2 h-4 w-4" /> Start Task
                            </Button>
                        )}
                        {viewingTask.status === 'In Progress' && (
                           <>
                                <Button variant="outline" onClick={() => handleUpdateStatus(viewingTask.id, 'On Hold')}>
                                    <PauseCircle className="mr-2 h-4 w-4" /> Pause Task
                                </Button>
                               <Button onClick={() => handleOpenCompletionDialog(viewingTask)} className="bg-green-600 hover:bg-green-700">
                                    <CheckCircle className="mr-2 h-4 w-4" /> Mark as Completed
                                </Button>
                           </>
                        )}
                         {viewingTask.status === 'On Hold' && (
                           <>
                                <Button onClick={() => handleUpdateStatus(viewingTask.id, 'In Progress')}>
                                    <PlayCircle className="mr-2 h-4 w-4" /> Resume Task
                                </Button>
                               <Button onClick={() => handleOpenCompletionDialog(viewingTask)} className="bg-green-600 hover:bg-green-700">
                                    <CheckCircle className="mr-2 h-4 w-4" /> Mark as Completed
                                </Button>
                           </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      <CompletionDialog 
        isCompletionDialogOpen={isCompletionDialogOpen}
        setIsCompletionDialogOpen={setIsCompletionDialogOpen}
        completingTask={completingTask}
        handleSubmitCompletion={handleSubmitCompletion}
        hasCameraPermission={hasCameraPermission}
        videoRef={videoRef}
        canvasRef={canvasRef}
        handleCaptureProof={handleCaptureProof}
        proofImage={proofImage}
        setProofImage={setProofImage}
      />
    </>
  );
}

export default function MyTaskPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null; // Or a loading spinner
    }

    return <MyTaskPageContent />;
}

    
