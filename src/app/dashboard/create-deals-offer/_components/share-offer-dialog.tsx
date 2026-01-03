
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Offer, User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


function getRoleBadgeVariant(role: User['role']) {
  const variants: Partial<Record<User['role'], string>> = {
    Admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    Manager: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    Employee: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Customer: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    'CEO': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    'Sales Manager': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    'Production Manager': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    'Purchase Manager': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Service Manager': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
    'Accounts Manager': 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-300',
    'HR Manager': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300',
    'Gate Keeper': 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-300',
    'Inventory Manager': 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-300',
  };
  return variants[role] || 'bg-gray-100 text-gray-800';
}


interface ShareOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: Offer | null;
}

export function ShareOfferDialog({ open, onOpenChange, offer }: ShareOfferDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: allUsers } = useCollection<User>(collection(firestore, 'users'));
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedUsers, setSelectedUsers] = React.useState<string[]>([]);
  

  React.useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setSelectedUsers([]);
    }
  }, [open]);

  const filteredUsers = React.useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter(user =>
      (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.role || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, allUsers]);

  const handleSelectUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleShare = async () => {
    if (selectedUsers.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No users selected',
        description: 'Please select at least one user to share the offer with.',
      });
      return;
    }
    
    if (!firestore || !offer) return;

    const batch = writeBatch(firestore);
    const notificationData = {
        type: 'info',
        title: `New Offer Shared: ${offer.title}`,
        description: offer.previewText || offer.description,
        timestamp: serverTimestamp(),
        read: false,
    };
    
    selectedUsers.forEach(userId => {
        const notificationRef = doc(collection(firestore, 'users', userId, 'notifications'));
        batch.set(notificationRef, notificationData);
    });

    batch.commit().then(() => {
      toast({
        title: 'Offer Shared',
        description: `A notification for "${offer?.title}" has been sent to ${selectedUsers.length} user(s).`,
      });
      onOpenChange(false);
    }).catch(async (serverError) => {
      // Create and emit a contextual error for better debugging
      const permissionError = new FirestorePermissionError({
        path: `/users/{userId}/notifications/{notificationId}`,
        operation: 'create',
        requestResourceData: notificationData,
      });
      errorEmitter.emit('permission-error', permissionError);

      // Also show a generic error toast to the user
      toast({
        variant: 'destructive',
        title: 'Failed to Share',
        description: 'Could not send notifications. Please try again.',
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Offer: {offer?.title}</DialogTitle>
          <DialogDescription>
            Select users to send an in-app notification about this offer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Input
            placeholder="Search users by name, email, or role..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <ScrollArea className="h-64 border rounded-md">
            <div className="p-4">
              {filteredUsers && filteredUsers.length > 0 ? (
                <div className="space-y-4">
                  {filteredUsers.map(user => (
                    <div key={user.id} className="flex items-center space-x-3">
                      <Checkbox
                        id={`user-${user.id}`}
                        checked={selectedUsers.includes(user.id)}
                        onCheckedChange={() => handleSelectUser(user.id)}
                      />
                       <div className="flex items-center gap-3 flex-1">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <Label htmlFor={`user-${user.id}`} className="flex-1 cursor-pointer">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{user.name}</span>
                             <Badge variant="outline" className={cn('text-xs', getRoleBadgeVariant(user.role))}>
                                {user.role}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center">No users found.</p>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleShare} disabled={selectedUsers.length === 0}>
            Notify {selectedUsers.length} User(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
