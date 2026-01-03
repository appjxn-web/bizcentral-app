'use client';

import * as React from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Vacancy } from '@/lib/types';
import { Textarea } from '@/components/ui/textarea';

interface ApplyForJobDialogProps {
  vacancy: Vacancy;
}

export function ApplyForJobDialog({ vacancy }: ApplyForJobDialogProps) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [resume, setResume] = React.useState<File | null>(null);
  const resumeInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!name || !email || !phone) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill out your name, email, and phone number.',
      });
      return;
    }

    // In a real app, you would handle the form submission,
    // including uploading the resume file.
    toast({
      title: 'Application Submitted',
      description: `Your application for ${vacancy.title} has been received.`,
    });
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setResume(file);
      toast({
        title: 'Resume Uploaded',
        description: file.name,
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Apply Now</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for: {vacancy.title}</DialogTitle>
          <DialogDescription>
            Fill out the form below to submit your application.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="e.g., John Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="e.g., john.smith@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
           <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="e.g., 123-456-7890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Resume</Label>
             <input type="file" ref={resumeInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.doc,.docx" />
            <Button type="button" variant="outline" className="w-full" onClick={() => resumeInputRef.current?.click()}>
                <FileUp className="h-4 w-4 mr-2" />
                Upload Resume
            </Button>
            {resume && <p className="text-sm text-muted-foreground">{resume.name}</p>}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="button" onClick={handleSubmit}>
              Submit Application
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
