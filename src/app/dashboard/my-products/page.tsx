
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Camera, QrCode, ShieldCheck, Wrench, Loader2, FileUp, Video, Square, Mic, Package, ShieldAlert, ShieldX, History, ChevronRight, ChevronDown, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { serviceRequests as initialServiceRequests, users } from '@/lib/data';
import type { RegisteredProduct, ServiceRequest, WorkOrder, Product } from '@/lib/types';
import { format, parseISO, addMonths } from 'date-fns';
import { transcribeAudio } from '@/ai/flows/transcribe-audio-flow';
import { ProductLogDialog } from './_components/product-log-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';

function getStatusBadgeVariant(status: string) {
    switch (status) {
        case 'Active':
        case 'Completed':
        case 'Paid':
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        case 'Expiring Soon':
        case 'Pending':
        case 'Quotation Sent':
        case 'Work Complete':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        case 'In Progress':
        case 'Invoice Sent':
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
        case 'Expired':
        case 'Canceled':
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
}

function MyProductsPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const userProductsRef = user ? collection(firestore, 'users', user.uid, 'registeredProducts') : null;
  const { data: registeredProducts, loading: productsLoading } = useCollection<RegisteredProduct>(userProductsRef);
  const { data: serviceRequests, loading: serviceRequestsLoading } = useCollection<ServiceRequest>(collection(firestore, 'serviceRequests'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
  
  const [serialNumber, setSerialNumber] = React.useState('');
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);
  const [isServiceRequestOpen, setIsServiceRequestOpen] = React.useState(false);
  const [isServiceCameraOpen, setIsServiceCameraOpen] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<RegisteredProduct | null>(null);
  const [logProduct, setLogProduct] = React.useState<RegisteredProduct | null>(null);
  const [isRegistering, setIsRegistering] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | undefined>(undefined);
  const [isScanning, setIsScanning] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const [serviceDescription, setServiceDescription] = React.useState('');
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const recordedChunksRef = React.useRef<Blob[]>([]);

  const kpis = React.useMemo(() => {
    if (!registeredProducts) return { total: 0, active: 0, expiringSoon: 0, servicesUsed: 0 };
    const total = registeredProducts.length;
    const active = registeredProducts.filter(p => p.status === 'Active').length;
    const expiringSoon = registeredProducts.filter(p => p.status === 'Expiring Soon').length;
    const servicesUsed = registeredProducts.reduce((acc, p) => acc + (p.serviceLogs?.length || 0), 0);
    return { total, active, expiringSoon, servicesUsed };
  }, [registeredProducts]);

  React.useEffect(() => {
    if (isCameraOpen || isServiceCameraOpen) {
      const getCameraPermission = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
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
  }, [isCameraOpen, isServiceCameraOpen]);
  
  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => {
        const mockScannedSerial = 'WO-2407-0001-001'; // Mock for demonstration
        setSerialNumber(mockScannedSerial);
        setIsScanning(false);
        setIsCameraOpen(false);
        toast({
            title: 'Serial Number Scanned',
            description: `Serial number ${mockScannedSerial} has been entered.`,
        });
    }, 2000);
  };

  const handleRegister = async () => {
    if (!serialNumber) {
        toast({ variant: 'destructive', title: 'Serial Number Required' });
        return;
    }
    if (!user || !user.displayName || !firestore) {
        toast({ variant: 'destructive', title: 'User not found' });
        return;
    }

    setIsRegistering(true);
    try {
        const parts = serialNumber.split('-');
        const woId = parts.slice(0, 3).join('-');

        const woRef = doc(firestore, 'workOrders', woId);
        const woSnap = await getDoc(woRef);

        if (!woSnap.exists() || woSnap.data().qcStatus !== 'Passed') {
            throw new Error('Invalid or non-QC-passed serial number.');
        }

        const registeredQuery = collection(firestore, 'registeredProducts');
        const existingRegSnap = await getDoc(doc(registeredQuery, serialNumber));

        if (existingRegSnap.exists()) {
            throw new Error('This serial number has already been registered.');
        }

        const workOrder = woSnap.data() as WorkOrder;
        const productRef = doc(firestore, 'products', workOrder.productId);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
            throw new Error('Product details not found for this serial number.');
        }
        const product = productSnap.data() as Product;

        const purchaseDate = new Date();
        const warrantyMonths = product.warranty?.months || 12;
        const warrantyEndDate = addMonths(purchaseDate, warrantyMonths);

        const newRegisteredProduct: RegisteredProduct = {
            id: serialNumber,
            productName: product.name,
            imageUrl: product.imageUrl,
            serialNumber: serialNumber,
            purchaseDate: purchaseDate.toISOString(),
            warrantyEndDate: warrantyEndDate.toISOString(),
            status: 'Active',
            customerId: user.uid,
            customerName: user.displayName,
            childParts: product.warranty?.childParts?.map(cp => ({ ...cp, installDate: purchaseDate.toISOString() })) || [],
        };
        
        const regProdUserRef = doc(firestore, 'users', user.uid, 'registeredProducts', serialNumber);
        const regProdGlobalRef = doc(firestore, 'registeredProducts', serialNumber);

        await setDoc(regProdUserRef, newRegisteredProduct);
        await setDoc(regProdGlobalRef, newRegisteredProduct);


        toast({
            title: 'Warranty Registered!',
            description: `Your ${product.name} is now under warranty until ${format(warrantyEndDate, 'PPP')}.`,
        });
        setSerialNumber('');

    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Registration Failed',
            description: error.message,
        });
    } finally {
        setIsRegistering(false);
    }
  };


  const handleOpenServiceRequest = (product: RegisteredProduct) => {
    setSelectedProduct(product);
    setServiceDescription('');
    setIsServiceRequestOpen(true);
  };

  const handleServiceRequestSubmit = async () => {
    if (!selectedProduct || !serviceDescription || !user || !settingsData?.prefixes || !serviceRequests) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please provide a description of the issue or ensure settings are loaded.',
      });
      return;
    }

    const newRequestId = getNextDocNumber('Service Request', settingsData.prefixes, serviceRequests);

    const newRequest: Omit<ServiceRequest, 'id'> = {
      id: newRequestId,
      productName: selectedProduct.productName,
      serialNumber: selectedProduct.serialNumber,
      customer: {
        id: selectedProduct.customerId,
        name: selectedProduct.customerName,
        email: user.email || '',
        phone: user.phoneNumber || '',
      },
      dateSubmitted: new Date().toISOString(),
      description: serviceDescription,
      status: 'Pending',
    };
    
    await setDoc(doc(firestore, 'serviceRequests', newRequestId), newRequest);

     toast({
        title: 'Service Request Submitted',
        description: `Your request for ${selectedProduct?.productName} has been submitted.`,
    });
    setIsServiceRequestOpen(false);
  };
  
  // Placeholder for functions that are not fully implemented in this snippet
  const handleServiceCapture = () => toast({title: "Not Implemented"});
  const handleRecording = () => toast({title: "Not Implemented"});
  const handleMicClick = () => toast({title: "Not Implemented"});

  return (
    <>
      <PageHeader title="My Products" />

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All your registered products</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Warranties</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.active}</div>
            <p className="text-xs text-muted-foreground">Products currently under warranty</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.expiringSoon}</div>
            <p className="text-xs text-muted-foreground">Warranties ending in &lt;30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Services Used</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.servicesUsed}</div>
            <p className="text-xs text-muted-foreground">Across all your products</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
            <CardHeader>
            <CardTitle>Register Warranty</CardTitle>
            <CardDescription>
                Register your purchased product to activate its warranty.
            </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-grow">
                    <Input
                        placeholder="Enter or scan product serial number"
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="w-full sm:w-auto">
                                <Camera className="mr-2 h-4 w-4" />
                                Scan QR / Serial
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Scan Product QR Code</DialogTitle>
                                <DialogDescription>
                                Position the QR code or serial number within the frame.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="relative">
                                <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
                                {hasCameraPermission === false && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
                                        <Alert variant="destructive" className="w-auto">
                                            <AlertTitle>Camera Access Required</AlertTitle>
                                            <AlertDescription>
                                                Please allow camera permissions in your browser settings to use this feature.
                                            </AlertDescription>
                                        </Alert>
                                    </div>
                                )}
                                {isScanning && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-md text-white">
                                        <Loader2 className="h-8 w-8 animate-spin" />
                                        <p className="mt-2">Scanning...</p>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button onClick={handleScan} disabled={!hasCameraPermission || isScanning}>
                                    <QrCode className="mr-2 h-4 w-4" />
                                    Start Scan
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    <Button className="w-full sm:w-auto" onClick={handleRegister} disabled={isRegistering}>
                        {isRegistering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        Register
                    </Button>
                </div>
            </div>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registered Products</CardTitle>
          <CardDescription>
            View your registered products and their warranty status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%] hidden sm:table-cell">Product</TableHead>
                <TableHead className="w-[25%]">Serial Number</TableHead>
                <TableHead className="w-[25%]">Warranty End</TableHead>
                <TableHead className="w-[12%]">Status</TableHead>
                <TableHead className="w-[8%] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24">Loading your products...</TableCell></TableRow>
              ) : registeredProducts && registeredProducts.length > 0 ? (
                registeredProducts.map((product) => (
                    <TableRow key={product.id} className="cursor-pointer" onClick={() => setLogProduct(product)}>
                    <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-3">
                            <Image
                                alt={product.productName}
                                className="aspect-square rounded-md object-cover"
                                height="64"
                                src={product.imageUrl}
                                width="64"
                                data-ai-hint={product.imageHint}
                            />
                            <span className="font-medium">{product.productName}</span>
                        </div>
                    </TableCell>
                    <TableCell className="font-mono">{product.serialNumber}</TableCell>
                    <TableCell>{format(parseISO(product.warrantyEndDate), 'PPP')}</TableCell>
                    <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant(product.status))}>
                        {product.status}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleOpenServiceRequest(product); }}>
                            <Wrench className="h-4 w-4" />
                            <span className="sr-only">Request Service</span>
                        </Button>
                    </TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center">No products registered yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        <Dialog open={isServiceRequestOpen} onOpenChange={setIsServiceRequestOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Request Service for {selectedProduct?.productName}</DialogTitle>
                    <DialogDescription>
                        Please describe the issue you are facing with your product.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 grid gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="service-issue">Issue Description</Label>
                        <div className="relative">
                            <Textarea 
                                id="service-issue" 
                                placeholder="e.g., The screen is flickering, the device is not turning on..." 
                                value={serviceDescription}
                                onChange={(e) => setServiceDescription(e.target.value)}
                                className="pr-10"
                            />
                             <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={handleMicClick} disabled={isTranscribing}>
                                {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRecording ? <Square className="h-4 w-4 text-red-500" /> : <Mic className="h-4 w-4" />)}
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="service-attachment">Attach Image/Video (Optional)</Label>
                        <div className="flex items-center gap-2">
                           <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                               <FileUp className="mr-2 h-4 w-4" />
                               Upload Document
                           </Button>
                           <Dialog open={isServiceCameraOpen} onOpenChange={setIsServiceCameraOpen}>
                               <DialogTrigger asChild>
                                   <Button type="button" variant="outline" className="w-full">
                                       <Camera className="mr-2 h-4 w-4" />
                                       Use Camera
                                   </Button>
                               </DialogTrigger>
                               <DialogContent>
                                   <DialogHeader>
                                       <DialogTitle>Capture Issue</DialogTitle>
                                       <DialogDescription>
                                           Take a picture or video of the product issue.
                                       </DialogDescription>
                                   </DialogHeader>
                                   <div className="relative">
                                       <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
                                       {hasCameraPermission === false && (
                                           <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
                                               <Alert variant="destructive" className="w-auto">
                                                   <AlertTitle>Camera Access Required</AlertTitle>
                                                   <AlertDescription>
                                                       Please allow camera permissions in your browser settings to use this feature.
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
                                       <Button type="button" variant="outline" onClick={() => setIsServiceCameraOpen(false)}>Cancel</Button>
                                       <Button onClick={handleServiceCapture} disabled={!hasCameraPermission || isRecording}>
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
                           <Input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleServiceRequestSubmit}>Submit Request</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {logProduct && (
          <ProductLogDialog
            product={logProduct}
            open={!!logProduct}
            onOpenChange={(isOpen) => !isOpen && setLogProduct(null)}
          />
        )}
    </>
  );
}


export default function MyProductsPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <MyProductsPageContent />;
}
