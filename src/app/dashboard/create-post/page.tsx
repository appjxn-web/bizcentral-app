
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Image as ImageIcon, Send, Video, Camera, Square, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import Image from 'next/image';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { generatePostIdea } from '@/ai/flows/generate-post-idea-flow';
import { useStorage, useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addDoc, collection, query, where, doc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { UserProfile } from '@/lib/types';

type PostRequest = {
    id: string;
    authorId: string;
    authorName: string;
    authorAvatar: string;
    content: string;
    mediaUrl?: string | null;
    mediaType?: 'image' | 'video';
    submittedAt: string;
    status: 'Pending' | 'Approved' | 'Rejected';
};

export default function CreatePostPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const storage = useStorage();
    const firestore = useFirestore();
    const userDocRef = user ? doc(firestore, 'users', user.uid) : null;
    const { data: userProfile } = useDoc<UserProfile>(userDocRef);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [postContent, setPostContent] = React.useState('');
    const [mediaFile, setMediaFile] = React.useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = React.useState<string | null>(null);
    
    // State for My Posts
    const postsQuery = user ? query(collection(firestore, 'posts'), where('authorId', '==', user.uid)) : null;
    const { data: myPosts } = useCollection<PostRequest>(postsQuery);

    // Camera state
    const [isCameraOpen, setIsCameraOpen] = React.useState(false);
    const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | undefined>(undefined);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const [isRecording, setIsRecording] = React.useState(false);
    const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
    const recordedChunksRef = React.useRef<Blob[]>([]);
    
    // AI state
    const [isAiDialogOpen, setIsAiDialogOpen] = React.useState(false);
    const [aiTopic, setAiTopic] = React.useState('');
    const [isGenerating, setIsGenerating] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

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
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setMediaFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setMediaPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCapturePhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
            const imageUrl = canvas.toDataURL('image/jpeg');
            
            fetch(imageUrl).then(res => res.blob()).then(blob => {
                setMediaFile(new File([blob], "capture.jpg", { type: "image/jpeg" }));
            })

            setMediaPreview(imageUrl);
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
              setMediaFile(videoBlob);
              setMediaPreview(URL.createObjectURL(videoBlob));
              toast({ title: 'Video Recorded', description: 'Video has been attached.' });
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            toast({ title: 'Recording Started' });
            
            // Stop recording after 30 seconds
            setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    setIsRecording(false);
                    setIsCameraOpen(false);
                }
            }, 30000);
          }
        }
    };

    const handleSubmit = async () => {
        if (!user || !userProfile) {
            toast({ variant: 'destructive', title: 'Not Authenticated', description: 'You must be logged in to create a post.'});
            return;
        }
        if (!postContent) {
            toast({ variant: 'destructive', title: 'Post content is empty', description: 'Please write something before submitting.' });
            return;
        }

        setIsSubmitting(true);
        let mediaUrl: string | null = null;
        let mediaType: 'image' | 'video' | undefined = undefined;

        if (mediaFile) {
            toast({ title: 'Uploading media...', description: 'Please wait.' });
            const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${mediaFile.name}`);
            try {
                const snapshot = await uploadBytes(storageRef, mediaFile);
                mediaUrl = await getDownloadURL(snapshot.ref);
                mediaType = mediaFile.type.startsWith('video') ? 'video' : 'image';
                toast({ title: 'Upload complete!' });
            } catch (error) {
                console.error("Error uploading file:", error);
                toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload your media file.'});
                setIsSubmitting(false);
                return;
            }
        }

        const newPostData = {
            authorId: user.uid,
            authorName: user.displayName || 'Anonymous',
            authorAvatar: user.photoURL || 'https://i.pravatar.cc/150?u=anonymous',
            content: postContent,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            businessName: userProfile.businessName || user.displayName,
            location: userProfile.addresses?.[0] ? `${userProfile.addresses[0].city}, ${userProfile.addresses[0].state}` : 'Location not available',
            mobile: userProfile.mobile || 'Mobile not available',
            submittedAt: new Date().toISOString(),
            status: 'Pending' as const,
            likes: 0,
            dislikes: 0,
        };

        try {
            await addDoc(collection(firestore, 'posts'), newPostData);
            toast({
                title: 'Post Submitted for Review',
                description: 'Your post will be visible publicly after it has been approved by an admin.',
            });

            // Reset form
            setPostContent('');
            setMediaFile(null);
            setMediaPreview(null);
            if(fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Error creating post:', error);
            toast({ variant: 'destructive', title: 'Submission Failed', description: 'Could not save your post.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGeneratePost = async () => {
        if (!aiTopic) {
            toast({ variant: 'destructive', title: 'Topic is empty', description: 'Please provide a topic for the AI.' });
            return;
        }
        setIsGenerating(true);
        try {
            const result = await generatePostIdea({ topic: aiTopic });
            setPostContent(result.postContent);
            toast({ title: 'AI Post Generated', description: 'The content has been added to your message.' });
            setIsAiDialogOpen(false);
            setAiTopic('');
        } catch (error) {
            console.error('Error generating post:', error);
            toast({ variant: 'destructive', title: 'AI Generation Failed' });
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleRepost = (post: PostRequest) => {
        setPostContent(post.content);
        if (post.mediaUrl) {
            setMediaPreview(post.mediaUrl);
            setMediaFile(null); // We reuse the URL, don't re-upload the file
        } else {
            setMediaPreview(null);
            setMediaFile(null);
        }
        window.scrollTo(0, 0);
        toast({
            title: 'Content Reposted',
            description: 'The post content has been copied to the form above.'
        });
    };
    
    const getStatusBadge = (status: PostRequest['status']) => {
        const variantMap = {
            'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
            'Approved': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
            'Rejected': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
        };
        return <Badge variant="outline" className={cn(variantMap[status])}>{status}</Badge>;
    };

    return (
        <>
            <PageHeader title="Create a Post" />
            <Card>
                <CardHeader>
                    <CardTitle>Share Your Story</CardTitle>
                    <CardDescription>
                        Promote your business, showcase products you've made, or share your thoughts with the community.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label htmlFor="post-content">Your Message</Label>
                          <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2">
                                  <Sparkles className="h-4 w-4" />
                                  Draft with AI
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Draft with AI</DialogTitle>
                                  <DialogDescription>
                                    Tell the AI what your post is about, and it will generate a draft for you.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-2">
                                  <Label htmlFor="ai-topic">What is your post about?</Label>
                                  <Input 
                                    id="ai-topic"
                                    placeholder="e.g., Our new line of handcrafted furniture"
                                    value={aiTopic}
                                    onChange={(e) => setAiTopic(e.target.value)} 
                                  />
                                </div>
                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                  </DialogClose>
                                  <Button onClick={handleGeneratePost} disabled={isGenerating}>
                                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    Generate
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                          </Dialog>
                        </div>
                        <Textarea 
                            id="post-content" 
                            placeholder="What would you like to share?" 
                            rows={6}
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Attach Media (Optional)</Label>
                        <div className="flex items-center gap-2">
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*" />
                            <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                                <FileUp className="mr-2 h-4 w-4" />
                                Upload Media
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
                                            Take a picture or record a short video (max 30s).
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
                        </div>
                        {mediaPreview && (
                            <div className="mt-4 p-2 border rounded-md max-w-sm">
                                {mediaFile?.type.startsWith('image/') || mediaPreview.startsWith('data:image') || mediaPreview.includes('unsplash') ? (
                                     <Image src={mediaPreview} alt="Media preview" width={400} height={300} className="rounded-md object-contain" />
                                ) : (
                                    <video src={mediaPreview} controls className="w-full rounded-md" />
                                )}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">Attach a photo or a short video to make your post stand out.</p>
                    </div>
                     <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Submit for Approval
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>My Posts</CardTitle>
                    <CardDescription>A history of your submitted posts.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {myPosts && myPosts.length > 0 ? (
                            myPosts.map(post => (
                                <div key={post.id} className="border p-4 rounded-lg flex gap-4">
                                    {post.mediaUrl && (
                                        <div className="w-24 h-24 flex-shrink-0">
                                            {post.mediaType === 'image' ? (
                                                <Image src={post.mediaUrl} alt="Post media" width={96} height={96} className="rounded-md object-cover w-full h-full" />
                                            ) : (
                                                <video src={post.mediaUrl} className="rounded-md w-full h-full object-cover" />
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <p className="text-sm text-muted-foreground line-clamp-3">{post.content}</p>
                                            <Button variant="ghost" size="sm" onClick={() => handleRepost(post)}>
                                                <RefreshCw className="mr-2 h-3 w-3" />
                                                Repost
                                            </Button>
                                        </div>
                                         <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                                            <span>{format(new Date(post.submittedAt), 'PPP')}</span>
                                            <span>&middot;</span>
                                            {getStatusBadge(post.status)}
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">You haven't submitted any posts yet.</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
