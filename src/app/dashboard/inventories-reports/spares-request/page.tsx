
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Save, Trash2, Check, ChevronsUpDown, Send } from 'lucide-react';
import type { User, Product, SparesRequest } from '@/lib/types';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

interface RequestItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
}

export default function SparesRequestPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { data: productsData, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
  const { data: usersData, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
  
  const [selectedEngineerId, setSelectedEngineerId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<RequestItem[]>([{ id: `item-${Date.now()}`, productId: '', productName: '', quantity: 1 }]);
  const [openCombobox, setOpenCombobox] = React.useState(false);

  const engineers = React.useMemo(() => usersData?.filter(u => u.role === 'Employee' || u.role === 'Service Manager') || [], [usersData]);
  const spares = React.useMemo(() => productsData?.filter(p => p.type === 'Components' || p.type === 'Consumables') || [], [productsData]);

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
            const product = spares.find(p => p.id === value);
            if (product) {
              updatedItem.productName = product.name;
            }
          }
          return updatedItem;
        }
        return item;
      })
    );
  };
  
  const handleSubmitRequest = async () => {
    if (!selectedEngineerId || items.length === 0 || items.some(i => !i.productId || i.quantity <= 0)) {
        toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select an engineer and add at least one valid item.' });
        return;
    }

    const engineer = engineers.find(e => e.id === selectedEngineerId);
    if (!engineer || !user) {
        toast({ variant: 'destructive', title: 'Invalid User', description: 'Could not find the selected engineer or your user profile.' });
        return;
    }
    
    const newRequest: Omit<SparesRequest, 'id'> = {
        engineerId: selectedEngineerId,
        engineerName: engineer.name,
        requestDate: new Date().toISOString(),
        items: items.map(({ id, ...rest }) => rest),
        status: 'Approved', // Advance requests are auto-approved
        type: 'Advance',
        approvedBy: user.uid,
        approvedAt: new Date().toISOString(),
    };
    
    try {
        await addDoc(collection(firestore, 'sparesRequests'), newRequest);
        toast({ title: 'Success', description: 'Advance spares request has been submitted for issuance.' });
        // Reset form
        setSelectedEngineerId(null);
        setItems([{ id: `item-${Date.now()}`, productId: '', productName: '', quantity: 1 }]);
    } catch(error) {
        console.error("Error submitting request:", error);
        toast({ variant: 'destructive', title: 'Submission Failed' });
    }
  };

  return (
    <>
      <PageHeader title="Advance Spares Request">
        <Button onClick={handleSubmitRequest}><Send className="mr-2 h-4 w-4"/> Submit for Issuance</Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
            <CardTitle>Create Spares Request</CardTitle>
            <CardDescription>Request a set of spare parts in advance for an engineer to carry for on-site service calls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="max-w-sm space-y-2">
                <Label>Engineer</Label>
                 <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                    <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between" disabled={usersLoading}>
                        {selectedEngineerId ? engineers.find(e => e.id === selectedEngineerId)?.name : "Select an engineer..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                        <CommandInput placeholder="Search engineer..." />
                        <CommandList>
                        <CommandEmpty>No engineer found.</CommandEmpty>
                        <CommandGroup>
                            {engineers.map((e) => (
                            <CommandItem
                                key={e.id}
                                value={e.name}
                                onSelect={() => { setSelectedEngineerId(e.id); setOpenCombobox(false); }}
                            >
                                <Check className={cn("mr-2 h-4 w-4", selectedEngineerId === e.id ? "opacity-100" : "opacity-0")} />
                                {e.name}
                            </CommandItem>
                            ))}
                        </CommandGroup>
                        </CommandList>
                    </Command>
                    </PopoverContent>
                </Popover>
            </div>
            
            <div>
                <h3 className="text-lg font-medium mb-2">Requested Parts</h3>
                <Table>
                    <TableHeader><TableRow>
                        <TableHead className="w-[50%]">Part / Spare</TableHead>
                        <TableHead className="w-[30%]">Quantity</TableHead>
                        <TableHead className="w-[20%]"></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                        {items.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <Select value={item.productId} onValueChange={(value) => handleItemChange(item.id, 'productId', value)}>
                                        <SelectTrigger><SelectValue placeholder="Select a spare part" /></SelectTrigger>
                                        <SelectContent>
                                            {spares.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (Stock: {p.openingStock})</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell>
                                    <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} />
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button variant="outline" size="sm" onClick={handleAddItem} className="mt-4 w-full">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Part
                </Button>
            </div>

        </CardContent>
      </Card>
    </>
  );
}


  