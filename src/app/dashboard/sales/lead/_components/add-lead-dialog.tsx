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
import { Mic, Loader2, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { transcribeAudio } from '@/ai/flows/transcribe-audio-flow';
import type { Lead, LeadSource } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AddLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Omit<Lead, 'id' | 'createdAt' | 'ownerId' | 'status'>) => void;
}

const allSources: LeadSource[] = ['Website', 'Referral', 'Cold Call', 'Event', 'Social media', 'Other'];

export function AddLeadDialog({ open, onOpenChange, onSave }: AddLeadDialogProps) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [source, setSource] = React.useState<LeadSource>('Website');
  const [gstin, setGstin] = React.useState('');
  const [note, setNote] = React.useState('');
  
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);

  React.useEffect(() => {
    if (!open) {
      // Reset form on close
      setName('');
      setCompany('');
      setEmail('');
      setPhone('');
      setSource('Website');
      setGstin('');
      setNote('');
    }
  }, [open]);

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
            setNote(prev => (prev ? `${prev} ${result.transcription}` : result.transcription));
            toast({
              title: 'Transcription Complete',
              description: 'Your voice note has been added to the note field.',
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


  const handleSubmit = () => {
    if (!name || !phone) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill in the name and phone number.',
      });
      return;
    }
    onSave({ name, company, email, phone, source, gstin, note });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
          <DialogDescription>
            Enter the details for the new lead to add them to your sales pipeline.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] -mx-6 px-6">
          <div className="grid gap-4 py-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Name</Label>
              <Input
                id="lead-name"
                placeholder="e.g., Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-company">Company (Optional)</Label>
              <Input
                id="lead-company"
                placeholder="e.g., Acme Inc."
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email">Email (Optional)</Label>
              <Input
                id="lead-email"
                type="email"
                placeholder="e.g., jane.doe@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-phone">Phone</Label>
              <Input
                id="lead-phone"
                type="tel"
                placeholder="e.g., 555-123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-gstin">GSTIN (Optional)</Label>
              <Input
                id="lead-gstin"
                placeholder="e.g., 22AAAAA0000A1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-source">Source</Label>
              <Select value={source} onValueChange={(value) => setSource(value as LeadSource)}>
                  <SelectTrigger id="lead-source">
                      <SelectValue placeholder="Select a source" />
                  </SelectTrigger>
                  <SelectContent>
                      {allSources.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-note">Note (Optional)</Label>
              <div className="relative">
                <Textarea
                  id="lead-note"
                  placeholder="Add any relevant notes here..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={handleMicClick} disabled={isTranscribing}>
                  {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRecording ? <Square className="h-4 w-4 text-red-500" /> : <Mic className="h-4 w-4" />)}
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="pt-4 border-t">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>
            Save Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
