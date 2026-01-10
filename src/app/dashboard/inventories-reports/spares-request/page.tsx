

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Save, Trash2, Check, ChevronsUpDown, Send } from 'lucide-react';
import type { User, Product, SparesRequest, StockTransferRequest, UserProfile } from '@/lib/types';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, doc, setDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useRole } from '../../_components/role-provider';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { getNextDocNumber } from '@/lib/number-series';

interface RequestItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
}

function getStatusBadgeVariant(status: string) {
    const variants: Record<string, string> = {
      'Pending Approval': 'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-blue-100 text-blue-800',
      'Rejected': 'bg-red-100 text-red-800',
      'Shipped': 'bg-green-100 text-green-800',
    };
    return variants[status] || 'bg-gray-100';
}

export default function SparesRequestPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const userProfileRef = user ? doc(firestore, 'users', user.uid) : null;
  const { data: userProfile } = useDoc<UserProfile>(userProfileRef);
  const { currentRole } = useRole();

  const { data: partners } = useCollection<Party>(query(collection(firestore, 'parties'), where('type', '==', 'Partner')));
  const { data: products } = useCollection<Product>(collection(firestore, 'products'));
  const { data: stockTransferRequests, loading: requestsLoading } = useCollection<StockTransferRequest>(collection(firestore, 'stockTransferRequests'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
  
  const [selectedPartnerId, setSelectedPartnerId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<RequestItem[]>([{ id: `item-${Date.now()}`, productId: '', productName: '', quantity: 1 }]);
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isPartner = currentRole === 'Partner';

  const availableProducts = React.useMemo(() => {
    if (!products) return [];
    if (isPartner) {
        return products.filter(p => p.saleable);
    }
    return products.filter(p => p.type === 'Components' || p.type === 'Consumables' || p.source === 'Bought');
  }, [products, isPartner]);

  const handleAddItem = () => {
    setItems(prev => [...prev, { id: `item-${Date.now()}`, productId: '', productName: '', quantity: 1 }]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: 'productId' | 'quantity', value: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'productId') {
            const product = availableProducts.find(p => p.id === value);
            if (product) updatedItem.productName = product.name;
          }
          return updatedItem;
        }
        return item;
      })
    );
  };
  
  const handleSubmitRequest = async () => {
    const targetId = isPartner ? user?.uid : selectedPartnerId;
    const targetUser = isPartner ? userProfile : partners?.find(p => p.id === targetId);

    if (!targetId || !targetUser || items.length === 0 || items.some(i => !i.productId || Number(i.quantity) <= 0)) {
        toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a recipient and add at least one valid item.' });
        return;
    }
    if (!settingsData?.prefixes || !stockTransferRequests) {
        toast({ variant: 'destructive', title: 'Error loading settings' });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const partnerName = (targetUser as UserProfile)?.businessName || targetUser.name || 'Unknown';
        
        const newRequestId = getNextDocNumber('Stock Transfer', settingsData.prefixes, stockTransferRequests);
        
        const requestData = {
            id: newRequestId,
            requestingUserId: user?.uid,
            requestingUserName: userProfile?.businessName || userProfile?.name || user?.displayName,
            partnerId: targetId,
            partnerName: partnerName,
            items: items.map(({ id, ...rest }) => ({...rest, quantity: Number(rest.quantity)})),
            status: 'Pending Approval' as 'Pending Approval',
            createdAt: serverTimestamp(),
            notes,
        };

        await setDoc(doc(firestore, 'stockTransferRequests', newRequestId), requestData);
        toast({ title: 'Request Submitted', description: 'Stock transfer request has been sent for approval.' });
        
        setSelectedPartnerId(null);
        setItems([{ id: `item-${Date.now()}`, productId: '', productName: '', quantity: 1 }]);
        setNotes('');
    } catch(e) {
        console.error("Failed to submit stock transfer request:", e);
        toast({ variant: 'destructive', title: 'Submission Failed' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const userRequestsQuery = React.useMemo(() => {
    if (!user) return null;
    const ref = collection(firestore, 'stockTransferRequests');
    if (isPartner) {
        return query(ref, where('partnerId', '==', user.uid), orderBy('createdAt', 'desc'));
    }
    return query(ref, orderBy('createdAt', 'desc'));
  }, [user, isPartner, firestore]);

  const { data: userRequests } = useCollection<StockTransferRequest>(userRequestsQuery);

  return (
    <>
      <PageHeader title={isPartner ? "Request Stock" : "Create Stock Transfer"}>
        <Button onClick={handleSubmitRequest} disabled={isSubmitting}><Send className="mr-2 h-4 w-4"/> Submit for Approval</Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
            <CardTitle>{isPartner ? "Create Stock Request" : "Create Stock Transfer"}</CardTitle>
            <CardDescription>
                {isPartner 
                    ? "Request stock to be transferred to your inventory from the main warehouse." 
                    : "Transfer stock from the main warehouse to a partner location."
                }
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {!isPartner && (
              <div className="max-w-md space-y-2">
                  <Label>To Partner</Label>
                  <Select onValueChange={setSelectedPartnerId} value={selectedPartnerId || ''}>
                      <SelectTrigger><SelectValue placeholder="Select a partner..." /></SelectTrigger>
                      <SelectContent>
                          {partners?.map(p => <SelectItem key={p.id} value={p.id}>{(p as UserProfile).businessName || p.name}</SelectItem>)}
                      </SelectContent>
                  </Select>
              </div>
            )}
            
            <div>
                <h3 className="text-lg font-medium mb-2">Items to Transfer</h3>
                <div className="border rounded-md mt-2">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[60%]">Product</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead className="w-[50px]"><span className="sr-only">Remove</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                         <Select value={item.productId} onValueChange={(value) => handleItemChange(item.id, 'productId', value)}>
                                            <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                                            <SelectContent>
                                                {availableProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (Stock: {p.openingStock})</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} />
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                     <Button variant="outline" size="sm" onClick={handleAddItem} className="m-2">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                    </Button>
                </div>
            </div>
            <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes for the approver..." />
            </div>
          </CardContent>
        </Card>
      
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>My Requests</CardTitle>
          <CardDescription>A history of your submitted stock and spares requests.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestsLoading ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading requests...</TableCell></TableRow>
              ) : userRequests && userRequests.length > 0 ? (
                userRequests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono">{req.id}</TableCell>
                    <TableCell>{req.createdAt ? format(req.createdAt.toDate(), 'dd/MM/yyyy') : 'Pending'}</TableCell>
                    <TableCell>{req.partnerName}</TableCell>
                    <TableCell>{req.items.length}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>
                        {req.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                    You have not made any requests yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

