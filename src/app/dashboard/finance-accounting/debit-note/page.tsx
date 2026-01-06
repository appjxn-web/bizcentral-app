
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Save } from 'lucide-react';
import type { Party, DebitNote } from '@/lib/types';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';
import { format } from 'date-fns';

export default function DebitNotePage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const { data: parties } = useCollection<Party>(collection(firestore, 'parties'));
    const { data: allDebitNotes } = useCollection<DebitNote>(collection(firestore, 'debitNotes'));
    const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));

    const [partyId, setPartyId] = React.useState('');
    const [amount, setAmount] = React.useState('');
    const [reason, setReason] = React.useState('');
    const [originalInvoiceId, setOriginalInvoiceId] = React.useState('');
    const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));

    const suppliers = parties?.filter(p => p.type === 'Supplier' || p.type === 'Vendor') || [];

    const handleSave = async () => {
        if (!partyId || !amount || !reason) {
            toast({ variant: 'destructive', title: 'Missing information' });
            return;
        }
        
        if (!settingsData?.prefixes || !allDebitNotes) {
            toast({ variant: 'destructive', title: 'Error', description: 'Document numbering settings not found.' });
            return;
        }
        const newNoteId = getNextDocNumber('Debit Note', settingsData.prefixes, allDebitNotes);

        const newDebitNote: Omit<DebitNote, 'id'> = {
            debitNoteNumber: newNoteId,
            partyId,
            partyName: parties?.find(p => p.id === partyId)?.name || 'Unknown',
            date,
            originalInvoiceId,
            amount: Number(amount),
            reason,
            status: 'Issued',
            createdAt: serverTimestamp(),
        };

        await setDoc(doc(firestore, 'debitNotes', newNoteId), { ...newDebitNote, id: newNoteId });
        toast({ title: 'Debit Note Created', description: `Debit Note ${newNoteId} has been issued.` });
        
        // Reset form
        setPartyId('');
        setAmount('');
        setReason('');
        setOriginalInvoiceId('');
    };

    return (
        <>
            <PageHeader title="Debit Notes">
                <Button onClick={handleSave}>
                    <Save className="mr-2 h-4 w-4" /> Save Debit Note
                </Button>
            </PageHeader>
            <Card>
                <CardHeader>
                    <CardTitle>Create Debit Note</CardTitle>
                    <CardDescription>Issue a debit note to a supplier, typically for purchase returns.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="supplier">Supplier / Vendor</Label>
                            <Select value={partyId} onValueChange={setPartyId}>
                                <SelectTrigger id="supplier"><SelectValue placeholder="Select a supplier" /></SelectTrigger>
                                <SelectContent>
                                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="amount">Amount</Label>
                            <Input id="amount" type="number" placeholder="Enter amount to debit" value={amount} onChange={e => setAmount(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="invoice-id">Original Invoice/Bill ID (Optional)</Label>
                            <Input id="invoice-id" placeholder="e.g., BILL-001" value={originalInvoiceId} onChange={e => setOriginalInvoiceId(e.target.value)} />
                        </div>
                         <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="reason">Reason for Debit Note</Label>
                            <Input id="reason" placeholder="e.g., Goods returned due to damage" value={reason} onChange={e => setReason(e.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Issued Debit Notes</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Note #</TableHead>
                                <TableHead>Party</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allDebitNotes?.map(note => (
                                <TableRow key={note.id}>
                                    <TableCell>{format(new Date(note.date), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell className="font-mono">{note.debitNoteNumber}</TableCell>
                                    <TableCell>{note.partyName}</TableCell>
                                    <TableCell>{note.reason}</TableCell>
                                    <TableCell className="text-right font-mono">{note.amount.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </>
    );
}
