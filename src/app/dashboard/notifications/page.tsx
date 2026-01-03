
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check, Trash2, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, doc, updateDoc, deleteDoc, writeBatch, getDocs, orderBy, limit } from 'firebase/firestore';
import type { Notification } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function NotificationsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const notificationsQuery = user
    ? query(collection(firestore, 'users', user.uid, 'notifications'), orderBy('timestamp', 'desc'), limit(50))
    : null;
    
  const { data: notifications, loading } = useCollection<Notification>(notificationsQuery);

  const handleMarkAsRead = async (id: string) => {
    if (!user) return;
    const notifRef = doc(firestore, 'users', user.uid, 'notifications', id);
    await updateDoc(notifRef, { read: true });
  };
  
  const handleMarkAllAsRead = async () => {
    if (!user || !notifications || notifications.length === 0) return;
    
    const unreadNotifications = notifications.filter(n => !n.read);
    if(unreadNotifications.length === 0) return;

    const batch = writeBatch(firestore);
    unreadNotifications.forEach(n => {
      const notifRef = doc(firestore, 'users', user.uid, 'notifications', n.id);
      batch.update(notifRef, { read: true });
    });

    await batch.commit();
    toast({ title: 'All notifications marked as read.' });
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const notifRef = doc(firestore, 'users', user.uid, 'notifications', id);
    await deleteDoc(notifRef);
    toast({ title: 'Notification Deleted' });
  };
  
  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  return (
    <>
      <PageHeader title="Notifications">
        <Button variant="outline" onClick={handleMarkAllAsRead} disabled={unreadCount === 0 || loading}>
          <Check className="mr-2 h-4 w-4" />
          Mark all as read
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>You have {unreadCount} unread notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
                <div className="flex justify-center items-center h-48">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : notifications && notifications.length > 0 ? (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50",
                    !notification.read && "bg-muted"
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    <Bell className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{notification.title}</p>
                    <p className="text-sm text-muted-foreground">{notification.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {notification.timestamp ? formatDistanceToNow(notification.timestamp.toDate(), { addSuffix: true }) : '...'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!notification.read && (
                       <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMarkAsRead(notification.id)}>
                        <Check className="h-4 w-4" />
                        <span className="sr-only">Mark as read</span>
                       </Button>
                    )}
                     <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => handleDelete(notification.id)}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                     </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                <div className="flex flex-col items-center gap-1 text-center">
                  <h3 className="text-2xl font-bold tracking-tight">You're all caught up!</h3>
                  <p className="text-sm text-muted-foreground">You have no new notifications.</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
