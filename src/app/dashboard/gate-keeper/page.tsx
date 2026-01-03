
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowRightCircle,
  ArrowLeftCircle,
  Truck,
  Users,
  History,
  Camera,
  Mic,
  Loader2,
  Square,
  LogOut,
} from 'lucide-react';
import { transcribeAudio } from '@/ai/flows/transcribe-audio-flow';
import type { GateEntry } from '@/lib/types';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, addDoc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';

type EntryType = 'Inward' | 'Outward';

function GateKeeperPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: log, loading } = useCollection<GateEntry>(collection(firestore, 'gateLog'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [entryType, setEntryType] = React.useState<EntryType | null>(null);

  // Form state
  const [personName, setPersonName] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [vehicleNo, setVehicleNo] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [linkedDoc, setLinkedDoc] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  
  // AI features state
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  
  // Camera state
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [capturedImage, setCapturedImage] = React.useState<string | null>(null);
  
  const [filterDate, setFilterDate] = React.useState(new Date().toISOString().split('T')[0]);


  const resetForm = () => {
    setPersonName('');
    setMobile('');
    setVehicleNo('');
    setPurpose('');
    setLinkedDoc('');
    setRemarks('');
    setCapturedImage(null);
  };

  const handleOpenDialog = (type: EntryType, vNo: string = '') => {
    resetForm();
    if(vNo) setVehicleNo(vNo);
    setEntryType(type);
    setIsDialogOpen(true);
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
            setRemarks(prev => (prev ? `${prev} ${result.transcription}` : result.transcription));
            toast({
              title: 'Transcription Complete',
              description: 'Your voice note has been added to the remarks.',
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

  const handleCameraCapture = () => {
    if (videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        const imageUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(imageUrl);
        setIsCameraOpen(false); // Close camera after capture
    }
  };

  const handleSubmit = async () => {
    if (!personName || !mobile || !vehicleNo || !purpose) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
      });
      return;
    }

    if (entryType === 'Inward') {
      if (!settingsData?.prefixes || !log) {
        toast({ variant: 'destructive', title: 'Settings not loaded' });
        return;
      }
      const newEntryId = getNextDocNumber('Gate Entry', settingsData.prefixes, log);
      const newEntry: GateEntry = {
        id: newEntryId,
        personName,
        mobile,
        vehicleNo,
        purpose,
        linkedDoc,
        inTime: new Date().toISOString(),
        outTime: null,
        remarks,
        imageUrl: capturedImage,
      };
      await setDoc(doc(firestore, 'gateLog', newEntryId), newEntry);
      toast({ title: 'Inward Entry Logged', description: `${personName} has been logged in.` });
    } else { // Outward
        const entryToUpdate = log?.find(entry => entry.vehicleNo === vehicleNo && entry.outTime === null);
        if (entryToUpdate) {
            await updateDoc(doc(firestore, 'gateLog', entryToUpdate.id), { outTime: new Date().toISOString() });
            toast({ title: 'Outward Entry Logged', description: `${entryToUpdate.personName} has been logged out.` });
        } else {
            toast({ variant: 'destructive', title: 'No Matching Inward Entry', description: `No active inward entry found for vehicle no. ${vehicleNo}.` });
            return;
        }
    }
    
    setIsDialogOpen(false);
  };
  
  const vehiclesInside = log?.filter(e => e.outTime === null) || [];
  const today = new Date().toISOString().split('T')[0];
  const entriesToday = log?.filter(e => e.inTime.startsWith(today)).length || 0;
  const exitsToday = log?.filter(e => e.outTime && e.outTime.startsWith(today)).length || 0;

  const filteredLog = React.useMemo(() => {
    if (!log) return [];
    return log.filter(entry => entry.inTime.startsWith(filterDate));
  }, [log, filterDate]);


  return (
    <>
      <PageHeader title="Gate Keeper" />
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vehicles/Persons Inside</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vehiclesInside.length}</div>
            <p className="text-xs text-muted-foreground">Currently on premises</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entries Today</CardTitle>
            <ArrowRightCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entriesToday}</div>
             <p className="text-xs text-muted-foreground">Total inward movements today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exits Today</CardTitle>
            <ArrowLeftCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exitsToday}</div>
             <p className="text-xs text-muted-foreground">Total outward movements today</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Button className="h-24 text-lg" onClick={() => handleOpenDialog('Inward')}>
          <ArrowRightCircle className="mr-4 h-8 w-8" /> Inward
        </Button>
        <Button variant="destructive" className="h-24 text-lg" onClick={() => handleOpenDialog('Outward')}>
          <ArrowLeftCircle className="mr-4 h-8 w-8" /> Outward
        </Button>
      </div>

       <Card>
        <CardHeader>
            <CardTitle>Currently Inside Premises</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Person Name</TableHead>
                        <TableHead>Vehicle No.</TableHead>
                        <TableHead>Purpose</TableHead>
                        <TableHead>In Time</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                       <TableRow><TableCell colSpan={5} className="text-center h-24">Loading...</TableCell></TableRow>
                    ) : vehiclesInside.length > 0 ? vehiclesInside.map(entry => (
                        <TableRow key={entry.id}>
                            <TableCell>{entry.personName}</TableCell>
                            <TableCell>{entry.vehicleNo}</TableCell>
                            <TableCell>{entry.purpose}</TableCell>
                            <TableCell>{format(new Date(entry.inTime), 'p')}</TableCell>
                            <TableCell className="text-right">
                                <Button variant="outline" size="sm" onClick={() => handleOpenDialog('Outward', entry.vehicleNo)}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Exit
                                </Button>
                            </TableCell>
                        </TableRow>
                    )) : (
                        <TableRow><TableCell colSpan={5} className="text-center h-24">No one is currently inside.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        </CardContent>
       </Card>

       <Card>
        <CardHeader className="flex flex-row justify-between items-center">
            <div>
                <CardTitle>Activity Log</CardTitle>
                <CardDescription>A complete log of all entries and exits.</CardDescription>
            </div>
            <Input 
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-48"
            />
        </CardHeader>
        <CardContent>
             <ScrollArea className="h-96">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Person</TableHead>
                            <TableHead>Vehicle No.</TableHead>
                            <TableHead>In Time</TableHead>
                            <TableHead>Out Time</TableHead>
                            <TableHead>Purpose</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredLog.map(entry => (
                            <TableRow key={entry.id}>
                                <TableCell>{entry.personName}</TableCell>
                                <TableCell>{entry.vehicleNo}</TableCell>
                                <TableCell>{format(new Date(entry.inTime), 'p')}</TableCell>
                                <TableCell>{entry.outTime ? format(new Date(entry.outTime), 'p') : 'N/A'}</TableCell>
                                <TableCell>{entry.purpose}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </ScrollArea>
        </CardContent>
       </Card>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{entryType} Entry</DialogTitle>
                <DialogDescription>Log a new {entryType?.toLowerCase()} movement.</DialogDescription>
            </DialogHeader>
             {entryType === 'Inward' ? (
                <ScrollArea className="max-h-[70vh] -mx-6 px-6">
                    <div className="grid gap-4 py-4 px-2">
                        <div className="space-y-2">
                            <Label htmlFor="personName">Name</Label>
                            <Input id="personName" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="e.g. John Doe" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobile">Mobile No.</Label>
                            <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. 9876543210" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="vehicleNo">Vehicle No.</Label>
                            <Input id="vehicleNo" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="e.g. UP32 AB 1234" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="purpose">Purpose</Label>
                            <Input id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Material Delivery" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="linkedDoc">Linked PO/DC/Invoice (Optional)</Label>
                            <Input id="linkedDoc" value={linkedDoc} onChange={(e) => setLinkedDoc(e.target.value)} placeholder="e.g. PO-123" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="remarks">Remarks</Label>
                             <div className="relative">
                                <Textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add any notes..." />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={handleMicClick} disabled={isTranscribing}>
                                    {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRecording ? <Square className="h-4 w-4 text-red-500" /> : <Mic className="h-4 w-4" />)}
                                </Button>
                            </div>
                        </div>
                         <div className="space-y-2">
                            <Label>Capture Photo (Optional)</Label>
                             <Button type="button" variant="outline" className="w-full" onClick={() => setIsCameraOpen(true)}>
                                <Camera className="mr-2 h-4 w-4" /> Open Camera
                            </Button>
                            {capturedImage && (
                                <div className="p-2 border rounded-md">
                                    <img src={capturedImage} alt="Captured" className="w-full rounded-md" />
                                </div>
                            )}
                         </div>
                    </div>
                </ScrollArea>
             ) : (
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="outwardVehicleNo">Vehicle No.</Label>
                        <Input id="outwardVehicleNo" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="Enter vehicle number to log out" />
                    </div>
                    <div className="space-y-2">
                        <Label>Capture Photo (Optional)</Label>
                         <Button type="button" variant="outline" className="w-full" onClick={() => setIsCameraOpen(true)}>
                            <Camera className="mr-2 h-4 w-4" /> Open Camera
                        </Button>
                        {capturedImage && (
                            <div className="p-2 border rounded-md">
                                <img src={capturedImage} alt="Captured" className="w-full rounded-md" />
                            </div>
                        )}
                     </div>
                </div>
             )}
            <DialogFooter className="border-t pt-4">
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleSubmit}>Submit</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
       <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Capture Photo</DialogTitle>
                </DialogHeader>
                <div className="relative">
                    <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleCameraCapture}>Capture</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  );
}


export default function GateKeeperPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null; // Render nothing on the server
    }

    return <GateKeeperPageContent />;
}
