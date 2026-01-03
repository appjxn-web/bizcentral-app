'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileUp, Check, Paperclip, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { OnboardingEmployee, OnboardingDocument, DocumentStatus } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from '@/components/ui/table';

interface OnboardingDocumentsDialogProps {
  employee: OnboardingEmployee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getStatusBadgeVariant(status: DocumentStatus) {
  const variants: Record<DocumentStatus, string> = {
    Missing: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    Uploaded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    Verified: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  };
  return variants[status];
}

export function OnboardingDocumentsDialog({ employee, open, onOpenChange }: OnboardingDocumentsDialogProps) {
  const { toast } = useToast();
  const [documents, setDocuments] = React.useState<OnboardingDocument[]>(employee.documents);
  const fileInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileChange = (docId: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setDocuments(prevDocs =>
        prevDocs.map(doc =>
          doc.id === docId ? { ...doc, status: 'Uploaded', file: file } : doc
        )
      );
      toast({
        title: 'Document Uploaded',
        description: `${file.name} for ${documents.find(d => d.id === docId)?.name}.`,
      });
    }
  };

  const handleVerify = (docId: string) => {
    setDocuments(prevDocs =>
      prevDocs.map(doc =>
        doc.id === docId ? { ...doc, status: 'Verified' } : doc
      )
    );
    toast({
      title: 'Document Verified',
      description: 'The document has been marked as verified.',
    });
  };

  const handleMarkAsMissing = (docId: string) => {
    setDocuments(prevDocs =>
      prevDocs.map(doc =>
        doc.id === docId ? { ...doc, status: 'Missing', file: undefined } : doc
      )
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Documents for {employee.name}</DialogTitle>
          <DialogDescription>
            Upload, view, and verify required on-boarding documents.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map(doc => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    {doc.name}
                    {doc.file && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Paperclip className="h-3 w-3" /> {doc.file.name}
                        </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant(doc.status))}>
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                     <input
                        type="file"
                        className="hidden"
                        ref={el => (fileInputRefs.current[doc.id] = el)}
                        onChange={handleFileChange(doc.id)}
                      />
                    {doc.status !== 'Verified' && (
                       <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[doc.id]?.click()}
                        >
                          <FileUp className="h-3.5 w-3.5 mr-1.5" /> Upload
                        </Button>
                    )}
                    {doc.status === 'Uploaded' && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleVerify(doc.id)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1.5" /> Verify
                      </Button>
                    )}
                     {doc.status !== 'Missing' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleMarkAsMissing(doc.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
