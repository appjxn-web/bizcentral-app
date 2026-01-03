
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Phone, Building } from 'lucide-react';

interface Post {
    id: string;
    authorName: string;
    authorAvatar: string;
    content: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    businessName: string;
    location: string;
    mobile: string;
}

interface PostDetailsDialogProps {
  post: Post | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostDetailsDialog({ post, open, onOpenChange }: PostDetailsDialogProps) {
  if (!post) {
    return null;
  }
  
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.location)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={post.authorAvatar} />
              <AvatarFallback>{post.authorName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle>{post.authorName}</DialogTitle>
              <DialogDescription>{post.businessName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="py-4 space-y-4 text-sm">
          <a
            href={`tel:${post.mobile}`}
            className="flex items-center gap-3 p-3 rounded-md hover:bg-muted"
          >
            <Phone className="h-5 w-5 text-muted-foreground" />
            <span>{post.mobile}</span>
          </a>
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-md hover:bg-muted"
          >
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <span>{post.location}</span>
          </a>
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
