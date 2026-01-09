'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Camera, FileUp } from 'lucide-react';
import Image from 'next/image';
import type { UserProfile } from '@/lib/types';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface MakePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outstandingBalance: number;
  userProfile: UserProfile | null;
}

export function MakePaymentDialog({ open, onOpenChange, outstandingBalance, userProfile }: MakePaymentDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();

  const [paymentMethod, setPaymentMethod] = React.useState('UPI');
  const [amount, setAmount] = React.useState('');
  const [transactionDetails, setTransactionDetails] = React.useState('');
  const [proofFile, setProofFile] = React.useState<File | null>(null);
  const [proofPreview, setProofPreview] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAmount(outstandingBalance > 0 ? outstandingBalance.toString() : '');
      setTransactionDetails('');
      setProofFile(null);
      setProofPreview(null);
    }
  }, [open, outstandingBalance]);
  
  React.useEffect(() => {
    if (isCameraOpen) {
      const getCameraPermission = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error('Error accessing camera:', error);
          toast({ variant: 'destructive', title: 'Camera access denied.' });
        }
      };
      getCameraPermission();
      return () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
      };
    }
  }, [isCameraOpen, toast]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setProofFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setProofPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };
  
  const handleCaptureProof = () => {
    if (videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        const imageUrl = canvas.toDataURL('image/jpeg');
        
        fetch(imageUrl)
            .then(res => res.blob())
            .then(blob => {
                const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
                setProofFile(file);
                setProofPreview(imageUrl);
            });

        toast({ title: 'Proof Captured' });
        setIsCameraOpen(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !userProfile) {
        toast({ variant: 'destructive', title: 'Not logged in' });
        return;
    }
    if (!amount || Number(amount) <= 0) {
        toast({ variant: 'destructive', title: 'Invalid Amount' });
        return;
    }
    setIsSubmitting(true);
    let proofUrl = '';

    try {
        if (proofFile) {
            toast({ title: 'Uploading proof...' });
            const storageRef = ref(storage, `payment_proofs/${user.uid}/${Date.now()}_${proofFile.name}`);
            const snapshot = await uploadBytes(storageRef, proofFile);
            proofUrl = await getDownloadURL(snapshot.ref);
        }

        const submissionData = {
            userId: user.uid,
            customerName: userProfile.name,
            amount: Number(amount),
            paymentMethod,
            transactionDetails,
            proofUrl,
            status: 'Pending',
            submittedAt: serverTimestamp(),
        };

        await addDoc(collection(firestore, 'paymentSubmissions'), submissionData);

        toast({
            title: 'Payment Submitted',
            description: 'Your payment is now pending approval from our accounts team.',
        });
        onOpenChange(false);
    } catch (error) {
        console.error("Error submitting payment:", error);
        toast({ variant: 'destructive', title: 'Submission Failed' });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Make a Payment</DialogTitle>
            <DialogDescription>Submit your payment details for verification.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g., 50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment-method">
                  <SelectValue placeholder="Select a method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank Deposit">Bank Deposit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transaction-details">Transaction Details</Label>
              <Textarea
                id="transaction-details"
                value={transactionDetails}
                onChange={(e) => setTransactionDetails(e.target.value)}
                placeholder="e.g., UPI Transaction ID, Cheque No, etc."
              />
            </div>
            <div className="space-y-2">
              <Label>Attach Proof (Optional)</Label>
              <div className="flex items-center gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,.pdf" />
                <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                    <FileUp className="mr-2 h-4 w-4" />
                    Upload File
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => setIsCameraOpen(true)}>
                    <Camera className="mr-2 h-4 w-4" />
                    Use Camera
                </Button>
              </div>
              {proofPreview && (
                <div className="mt-2 p-2 border rounded-md max-w-sm mx-auto">
                    <Image src={proofPreview} alt="Proof preview" width={400} height={300} className="rounded-md object-contain" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Capture Proof</DialogTitle></DialogHeader>
          <div className="relative">
            <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleCaptureProof}><Camera className="mr-2 h-4 w-4" /> Capture</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
