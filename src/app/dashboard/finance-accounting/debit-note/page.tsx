
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Save } from 'lucide-react';
import type { Party, DebitNote, SalesInvoice, SalesInvoiceItem } from '@/lib/types';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

interface DebitItem extends SalesInvoiceItem {
  adjustQty: number;
  revisedRate: number;
}

const companyDetails = {
  gstin: '08AAFCJ5369P1ZR', // Mock company GSTIN
};

const formatIndianCurrency = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(num || 0);
  };

export default function DebitNotePage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const { data: parties } = useCollection<Party>(collection(firestore, 'parties'));
    const { data: allDebitNotes } = useCollection<DebitNote>(collection(firestore, 'debitNotes'));
    const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
    const { data: salesInvoices } = useCollection<SalesInvoice>(collection(firestore, 'salesInvoices'));


    const [partyId, setPartyId] = React.useState('');
    const [amount, setAmount] = React.useState('');
    const [reason, setReason] = React.useState<'Price Escalation' | 'Other' | ''>('');
    const [originalInvoiceId, setOriginalInvoiceId] = React.useState('');
    const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedInvoice, setSelectedInvoice] = React.useState<SalesInvoice | null>(null);
    const [debitItems, setDebitItems] = React.useState<DebitItem[]>([]);

    const suppliers = parties?.filter(p => p.type === 'Supplier' || p.type === 'Vendor') || [];

     const supplierInvoices = React.useMemo(() => {
        if (!partyId || !salesInvoices) return [];
        // This is a simplification. In a real app, you'd fetch Purchase Invoices.
        // We're reusing Sales Invoices for demo purposes.
        return salesInvoices.filter(inv => inv.customerId === partyId);
    }, [partyId, salesInvoices]);

    const isInterstate = React.useMemo(() => {
        if (!selectedInvoice) return false;
        const customer = parties?.find(p => p.id === selectedInvoice.customerId);
        if (!customer?.gstin) return false;
        return !companyDetails.gstin.startsWith(customer.gstin.substring(0, 2));
    }, [selectedInvoice, parties]);

    const handleInvoiceSelection = (invoiceId: string) => {
        setOriginalInvoiceId(invoiceId);
        if (invoiceId && invoiceId !== 'none') {
            const invoice = salesInvoices?.find(inv => inv.invoiceNumber === invoiceId);
            if (invoice) {
                setSelectedInvoice(invoice);
                setDebitItems(invoice.items.map(item => ({
                    ...item,
                    rate: item.price || 0,
                    price: item.price || 0,
                    discount: item.discount || 0,
                    adjustQty: 0,
                    revisedRate: item.price || 0,
                })));
            }
        } else {
            setSelectedInvoice(null);
            setDebitItems([]);
        }
    };
    
    const handleItemChange = (index: number, field: 'adjustQty' | 'revisedRate', value: string) => {
        const numericValue = Number(value);
        if (isNaN(numericValue)) return;

        setDebitItems(prev => 
            prev.map((item, i) => 
                i === index ? { ...item, [field]: numericValue } : item
            )
        );
    };

    const calculations = React.useMemo(() => {
        let taxableAmount = 0;
        let totalGst = 0;
        let subtotal = 0;
        let totalDiscount = 0;
        let totalOriginalAmount = 0;
        let totalRevisedAmount = 0;


        if (reason === 'Price Escalation') {
            totalOriginalAmount = debitItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
            totalRevisedAmount = debitItems.reduce((acc, item) => acc + (item.quantity * item.revisedRate), 0);
            taxableAmount = totalRevisedAmount - totalOriginalAmount;
        }

        totalGst = taxableAmount * 0.18; // Simplified GST
        const grandTotal = taxableAmount + totalGst;
        const cgst = isInterstate ? 0 : totalGst / 2;
        const sgst = isInterstate ? 0 : totalGst / 2;
        const igst = isInterstate ? totalGst : 0;
        
        return { subtotal, totalDiscount, taxableAmount, totalGst, grandTotal, cgst, sgst, igst, totalOriginalAmount, totalRevisedAmount };
    }, [debitItems, isInterstate, reason]);


    const handleSave = async () => {
        if (!partyId || !reason) {
            toast({ variant: 'destructive', title: 'Missing information' });
            return;
        }

        const finalAmount = selectedInvoice ? calculations.grandTotal : Number(amount);
        if (finalAmount <= 0) {
            toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Debit amount must be greater than zero.' });
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
            originalInvoiceId: originalInvoiceId === 'none' ? '' : originalInvoiceId,
            amount: finalAmount,
            reason,
            status: 'Issued',
            createdAt: serverTimestamp(),
            ...(selectedInvoice && { items: debitItems.filter(item => item.revisedRate > (item.rate || 0)) }),
        };

        await setDoc(doc(firestore, 'debitNotes', newNoteId), { ...newDebitNote, id: newNoteId });
        toast({ title: 'Debit Note Created', description: `Debit Note ${newNoteId} has been issued.` });
        
        setPartyId('');
        setAmount('');
        setReason('');
        setOriginalInvoiceId('');
        setSelectedInvoice(null);
        setDebitItems([]);
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
                    <CardDescription>Issue a debit note to a supplier, typically for purchase returns or price corrections.</CardDescription>
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
                            <Label htmlFor="invoice-id">Original Invoice/Bill ID (Optional)</Label>
                            <Select value={originalInvoiceId} onValueChange={handleInvoiceSelection} disabled={!partyId}>
                                <SelectTrigger id="invoice-id">
                                    <SelectValue placeholder="Select an invoice to adjust" />
                                </SelectTrigger>
                                <SelectContent>
                                     <SelectItem value="none">None (Manual Entry)</SelectItem>
                                    {supplierInvoices.map(inv => (
                                        <SelectItem key={inv.id} value={inv.invoiceNumber}>
                                            {inv.invoiceNumber} - ({format(new Date(inv.date), 'dd/MM/yy')}) - {formatIndianCurrency(inv.grandTotal)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="reason">Reason for Debit Note</Label>
                            <Select value={reason} onValueChange={(value) => setReason(value as any)}>
                                <SelectTrigger id="reason"><SelectValue placeholder="Select a reason" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Price Escalation">Price Escalation</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         {!selectedInvoice && (
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount</Label>
                                <Input id="amount" type="number" placeholder="Enter amount to debit" value={amount} onChange={e => setAmount(e.target.value)} />
                            </div>
                        )}
                    </div>
                     {selectedInvoice && reason === 'Price Escalation' && (
                        <div className="pt-4 border-t">
                            <h3 className="text-lg font-medium mb-2">Adjust Invoice Items</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-center">Orig. Qty</TableHead>
                                        <TableHead className="text-right">Orig. Rate</TableHead>
                                        <TableHead className="text-right">Orig. Total</TableHead>
                                        <TableHead className="w-32 text-right">Revised Rate</TableHead>
                                        <TableHead className="text-right">Revised Total</TableHead>
                                        <TableHead className="text-right">Debit Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {debitItems.map((item, index) => {
                                        const originalTotal = item.quantity * item.rate;
                                        const revisedTotal = item.quantity * item.revisedRate;
                                        const debitAmount = revisedTotal - originalTotal;
                                        return (
                                        <TableRow key={item.productId}>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(originalTotal)}</TableCell>
                                            <TableCell>
                                                <Input 
                                                    type="number" 
                                                    value={item.revisedRate} 
                                                    onChange={(e) => handleItemChange(index, 'revisedRate', e.target.value)}
                                                    className="text-right"
                                                />
                                            </TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(revisedTotal)}</TableCell>
                                            <TableCell className="text-right font-mono font-semibold text-green-600">{formatIndianCurrency(debitAmount > 0 ? debitAmount : 0)}</TableCell>
                                        </TableRow>
                                    )})}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-semibold">Subtotal</TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount)}</TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount)}</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-semibold">Discount</TableCell>
                                        <TableCell className="text-right font-mono text-red-600">- {formatIndianCurrency(0)}</TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-right font-mono text-red-600">- {formatIndianCurrency(0)}</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-semibold">Taxable Value</TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount)}</TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount)}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-green-600">{formatIndianCurrency(calculations.taxableAmount)}</TableCell>
                                    </TableRow>
                                    {isInterstate ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right">IGST</TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount * 0.18)}</TableCell>
                                            <TableCell></TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount * 0.18)}</TableCell>
                                            <TableCell className="text-right font-mono font-bold text-green-600">{formatIndianCurrency(calculations.igst)}</TableCell>
                                        </TableRow>
                                    ) : (
                                        <>
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right">CGST</TableCell>
                                                <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount * 0.09)}</TableCell>
                                                 <TableCell></TableCell>
                                                <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount * 0.09)}</TableCell>
                                                <TableCell className="text-right font-mono font-bold text-green-600">{formatIndianCurrency(calculations.cgst)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right">SGST</TableCell>
                                                <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount * 0.09)}</TableCell>
                                                 <TableCell></TableCell>
                                                <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount * 0.09)}</TableCell>
                                                <TableCell className="text-right font-mono font-bold text-green-600">{formatIndianCurrency(calculations.sgst)}</TableCell>
                                            </TableRow>
                                        </>
                                    )}
                                    <TableRow className="bg-muted font-bold text-lg">
                                        <TableCell colSpan={3} className="text-right">Total Amount</TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount * 1.18)}</TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount * 1.18)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.grandTotal)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    )}
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
                                    <TableCell className="text-right font-mono">{formatIndianCurrency(note.amount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </>
    );
}
