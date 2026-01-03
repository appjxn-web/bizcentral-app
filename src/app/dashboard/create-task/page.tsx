
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
  } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { users } from '@/lib/data';
import { products } from '@/lib/product-data';
import type { Task, TaskCategory, User } from '@/lib/types';
import { format } from 'date-fns';
import { FileUp, Camera, Video, Square, Paperclip } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';

const allCategories: TaskCategory[] = ['Service', 'Production', 'Office', 'Other'];

function CreateTaskPageContent() {
    const { toast } = useToast();
    const [title, setTitle] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [assignedTo, setAssignedTo] = React.useState('');
    const [category, setCategory] = React.useState<TaskCategory>('Other');
    const [dueDate, setDueDate] = React.useState('');
    const [selectedProducts, setSelectedProducts] = React.useState<string[]>([]);
    
    // Attachment state
    const [isCameraOpen, setIsCameraOpen] = React.useState(false);
    const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | undefined>(undefined);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isRecording, setIsRecording] = React.useState(false);
    const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
    const recordedChunksRef = React.useRef<Blob[]>([]);
    
    const [attachedFile, setAttachedFile] = React.useState<File | null>(null);
    const [capturedImage, setCapturedImage] = React.useState<string | null>(null);
    const [capturedVideo, setCapturedVideo] = React.useState<Blob | null>(null);


    React.useEffect(() => {
        if (isCameraOpen) {
          const getCameraPermission = async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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
    }, [isCameraOpen]);
    
    const handleCategoryChange = (value: TaskCategory) => {
        setCategory(value);
        if (value !== 'Production') {
            setSelectedProducts([]);
        }
    };

    const handleProductSelect = (productId: string) => {
        setSelectedProducts(prev => 
            prev.includes(productId) 
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setAttachedFile(file);
            setCapturedImage(null);
            setCapturedVideo(null);
            toast({ title: 'File Attached', description: file.name });
        }
    };
    
    const handleCapturePhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
            const imageUrl = canvas.toDataURL('image/jpeg');
            setCapturedImage(imageUrl);
            setAttachedFile(null);
            setCapturedVideo(null);
            toast({ title: 'Photo Captured' });
            setIsCameraOpen(false);
        }
    };

    const handleRecording = () => {
        if (isRecording) {
          mediaRecorderRef.current?.stop();
          setIsRecording(false);
          setIsCameraOpen(false);
        } else {
          if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            recordedChunksRef.current = [];
            mediaRecorderRef.current = new MediaRecorder(stream);

            mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
              }
            };

            mediaRecorderRef.current.onstop = () => {
              const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
              setCapturedVideo(videoBlob);
              setAttachedFile(null);
              setCapturedImage(null);
              toast({ title: 'Video Recorded', description: 'Video has been attached to the task.' });
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            toast({ title: 'Recording Started' });
          }
        }
    };

    const clearAttachments = () => {
        setAttachedFile(null);
        setCapturedImage(null);
        setCapturedVideo(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !description || !assignedTo || !category || !dueDate) {
            toast({
                variant: 'destructive',
                title: 'Missing Information',
                description: 'Please fill out all fields to create a task.',
            });
            return;
        }

        const assignedUser = users.find(u => u.id === assignedTo);

        // In a real app, you would save this to your database, including attachments.
        toast({
            title: 'Task Created',
            description: `Task "${title}" has been assigned to ${assignedUser?.name}.`,
        });

        // Reset form
        setTitle('');
        setDescription('');
        setAssignedTo('');
        setCategory('Other');
        setDueDate('');
        setSelectedProducts([]);
        clearAttachments();
    };

  return (
    <>
      <PageHeader title="Create Task" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>New Task Details</CardTitle>
                    <CardDescription>Fill out the form below to assign a new task.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="task-title">Task Title</Label>
                            <Input
                                id="task-title"
                                placeholder="e.g., Follow up with new leads"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="task-description">Description</Label>
                            <Textarea
                                id="task-description"
                                placeholder="Provide a detailed description of the task..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="assign-to">Assign To</Label>
                                <Select value={assignedTo} onValueChange={setAssignedTo}>
                                    <SelectTrigger id="assign-to">
                                        <SelectValue placeholder="Select a user" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {users.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Category</Label>
                                <Select value={category} onValueChange={handleCategoryChange}>
                                    <SelectTrigger id="category">
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allCategories.map((cat) => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {category === 'Production' && (
                            <div className="space-y-2">
                                <Label>Products</Label>
                                <ScrollArea className="h-40 rounded-md border">
                                    <div className="p-4">
                                    {products.map((product) => (
                                        <div key={product.id} className="flex items-center space-x-2 mb-2">
                                            <Checkbox
                                                id={`product-${product.id}`}
                                                checked={selectedProducts.includes(product.id)}
                                                onCheckedChange={() => handleProductSelect(product.id)}
                                            />
                                            <Label htmlFor={`product-${product.id}`} className="font-normal cursor-pointer">{product.name}</Label>
                                        </div>
                                    ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            <Label htmlFor="due-date">Due Date</Label>
                            <Input
                                id="due-date"
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                min={format(new Date(), 'yyyy-MM-dd')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Attachments (Optional)</Label>
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
                                            <DialogTitle>Capture Media</DialogTitle>
                                            <DialogDescription>
                                                Take a picture or record a video to attach to the task.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="relative">
                                            <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
                                            {hasCameraPermission === false && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
                                                    <Alert variant="destructive" className="w-auto">
                                                        <AlertTitle>Camera Access Required</AlertTitle>
                                                        <AlertDescription>
                                                            Please allow camera access to use this feature.
                                                        </AlertDescription>
                                                    </Alert>
                                                </div>
                                            )}
                                             {isRecording && (
                                                <div className="absolute top-2 left-2 flex items-center gap-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                                                <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                                                REC
                                                </div>
                                            )}
                                        </div>
                                        <DialogFooter>
                                            <Button type="button" variant="outline" onClick={() => setIsCameraOpen(false)}>Cancel</Button>
                                            <Button onClick={handleCapturePhoto} disabled={!hasCameraPermission || isRecording}>
                                            <Camera className="mr-2 h-4 w-4" />
                                            Capture Photo
                                            </Button>
                                            <Button onClick={handleRecording} disabled={!hasCameraPermission} variant={isRecording ? "destructive" : "default"}>
                                            {isRecording ? <Square className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
                                            {isRecording ? 'Stop' : 'Record Video'}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                                <Input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                            </div>
                             {attachedFile && (
                                <div className="text-sm text-muted-foreground p-2 border rounded-md flex items-center justify-between">
                                    <span className="flex items-center gap-2"><Paperclip className="h-4 w-4" />{attachedFile.name}</span>
                                    <Button variant="ghost" size="sm" onClick={clearAttachments}>Clear</Button>
                                </div>
                            )}
                            {capturedImage && (
                                <div className="p-2 border rounded-md relative">
                                    <Image src={capturedImage} alt="Captured" width={200} height={150} className="rounded-md" />
                                     <Button variant="ghost" size="sm" onClick={clearAttachments} className="absolute top-1 right-1">Clear</Button>
                                </div>
                            )}
                            {capturedVideo && (
                                <div className="p-2 border rounded-md relative">
                                    <video src={URL.createObjectURL(capturedVideo)} controls className="w-full rounded-md" />
                                     <Button variant="ghost" size="sm" onClick={clearAttachments} className="absolute top-1 right-1 bg-white/50">Clear</Button>
                                </div>
                            )}
                        </div>
                        <Button type="submit" className="w-full md:w-auto">Create Task</Button>
                    </form>
                </CardContent>
            </Card>
        </div>
        <div className="lg:col-span-1">
             <Card>
                <CardHeader>
                    <CardTitle>Recent Tasks</CardTitle>
                    <CardDescription>A quick look at recently created tasks.</CardDescription>
                </CardHeader>
                <CardContent>
                     <p className="text-sm text-muted-foreground text-center py-8">
                        No recent tasks to display.
                    </p>
                </CardContent>
            </Card>
        </div>
      </div>
    </>
  );
}

export default function CreateTaskPage() {
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; // Render nothing on the server
  }

  return <CreateTaskPageContent />;
}
