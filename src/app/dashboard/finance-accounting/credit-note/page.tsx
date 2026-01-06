

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
import type { Party, CreditNote, SalesInvoice, SalesInvoiceItem } from '@/lib/types';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc, query, where } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

const companyDetails = {
  gstin: '08AAFCJ5369P1ZR', // Mock company GSTIN
};

interface CreditItem extends SalesInvoiceItem {
  returnQty: number;
  revisedRate: number;
}

export default function CreditNotePage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const { data: parties } = useCollection<Party>(collection(firestore, 'parties'));
    const { data: allCreditNotes } = useCollection<CreditNote>(collection(firestore, 'creditNotes'));
    const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
    const { data: salesInvoices } = useCollection<SalesInvoice>(collection(firestore, 'salesInvoices'));

    const [partyId, setPartyId] = React.useState('');
    const [originalInvoiceId, setOriginalInvoiceId] = React.useState('');
    const [selectedInvoice, setSelectedInvoice] = React.useState<SalesInvoice | null>(null);
    const [creditItems, setCreditItems] = React.useState<CreditItem[]>([]);
    const [reason, setReason] = React.useState('');
    const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));

    const customers = parties?.filter(p => p.type === 'Customer') || [];
    
    const customerInvoices = React.useMemo(() => {
        if (!partyId || !salesInvoices) return [];
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
                setCreditItems(invoice.items.map(item => ({
                    ...item,
                    rate: item.rate || 0,
                    price: item.rate || 0, // Ensure `price` is aliased to `rate`
                    discount: item.discount || 0,
                    returnQty: 0,
                    revisedRate: item.rate || 0,
                })));
            }
        } else {
            setSelectedInvoice(null);
            setCreditItems([]);
        }
    };


    const handleItemChange = (index: number, field: 'returnQty' | 'revisedRate', value: string) => {
        const numericValue = Number(value);
        if (isNaN(numericValue)) return;

        setCreditItems(prev => 
            prev.map((item, i) => 
                i === index ? { ...item, [field]: numericValue } : item
            )
        );
    };

    const calculations = React.useMemo(() => {
      const taxableAmount = creditItems.reduce((acc, item) => {
          const originalDiscountAmount = (item.rate || 0) * (item.discount / 100);
          const originalNetRate = (item.rate || 0) - originalDiscountAmount;
          
          const priceDifference = originalNetRate - item.revisedRate;
          const priceDifferenceCredit = priceDifference > 0 ? priceDifference * (item.quantity - item.returnQty) : 0;
          
          const returnCredit = item.returnQty * originalNetRate;
          return acc + priceDifferenceCredit + returnCredit;
      }, 0);
      
      const totalGst = creditItems.reduce((acc, item) => {
          const originalDiscountAmount = (item.rate || 0) * (item.discount / 100);
          const originalNetRate = (item.rate || 0) - originalDiscountAmount;

          const priceDifference = originalNetRate - item.revisedRate;
          const priceDifferenceCredit = priceDifference > 0 ? priceDifference * (item.quantity - item.returnQty) : 0;
          const returnCredit = item.returnQty * originalNetRate;
          const itemTaxableValue = priceDifferenceCredit + returnCredit;
          return acc + (itemTaxableValue * ((item.gstRate || 18) / 100));
      }, 0);

      const grandTotal = taxableAmount + totalGst;
      const cgst = isInterstate ? 0 : totalGst / 2;
      const sgst = isInterstate ? 0 : totalGst / 2;
      const igst = isInterstate ? totalGst : 0;
      
      return { taxableAmount, totalGst, grandTotal, cgst, sgst, igst };
    }, [creditItems, isInterstate]);


    const handleSave = async () => {
        if (!partyId || !reason) {
            toast({ variant: 'destructive', title: 'Missing information', description: 'Please select a customer and provide a reason.' });
            return;
        }

        const isAdjustmentMade = creditItems.some(item => item.returnQty > 0 || item.revisedRate !== item.rate);
        if (selectedInvoice && !isAdjustmentMade) {
             toast({ variant: 'destructive', title: 'No Adjustments Made', description: 'Please enter a return quantity or revise a rate for at least one item.' });
            return;
        }
        
        if (!settingsData?.prefixes || !allCreditNotes) {
            toast({ variant: 'destructive', title: 'Error', description: 'Document numbering settings not found.' });
            return;
        }
        const newNoteId = getNextDocNumber('Credit Note', settingsData.prefixes, allCreditNotes);

        const newCreditNote: Omit<CreditNote, 'id'> = {
            creditNoteNumber: newNoteId,
            partyId,
            partyName: parties?.find(p => p.id === partyId)?.name || 'Unknown',
            date,
            originalInvoiceId: originalInvoiceId === 'none' ? '' : originalInvoiceId,
            amount: calculations.grandTotal,
            reason,
            status: 'Issued',
            createdAt: serverTimestamp(),
            items: creditItems.filter(item => item.returnQty > 0 || item.revisedRate !== item.rate)
        };

        await setDoc(doc(firestore, 'creditNotes', newNoteId), { ...newCreditNote, id: newNoteId });
        toast({ title: 'Credit Note Created', description: `Credit Note ${newNoteId} has been issued.` });
        
        setPartyId('');
        setOriginalInvoiceId('');
        setSelectedInvoice(null);
        setCreditItems([]);
        setReason('');
    };

    return (
        <>
            <PageHeader title="Credit Notes">
                <Button onClick={handleSave}>
                    <Save className="mr-2 h-4 w-4" /> Save Credit Note
                </Button>
            </PageHeader>
            <Card>
                <CardHeader>
                    <CardTitle>Create Credit Note</CardTitle>
                    <CardDescription>Issue a credit note to a customer for returns or price adjustments.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="customer">Customer</Label>
                            <Select value={partyId} onValueChange={setPartyId}>
                                <SelectTrigger id="customer"><SelectValue placeholder="Select a customer" /></SelectTrigger>
                                <SelectContent>
                                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="invoice-id">Original Invoice ID (Optional)</Label>
                            <Select value={originalInvoiceId} onValueChange={handleInvoiceSelection} disabled={!partyId}>
                                <SelectTrigger id="invoice-id">
                                    <SelectValue placeholder="Select an invoice" />
                                </SelectTrigger>
                                <SelectContent>
                                     <SelectItem value="none">None</SelectItem>
                                    {customerInvoices.map(inv => (
                                        <SelectItem key={inv.id} value={inv.invoiceNumber}>
                                            {inv.invoiceNumber} - ({format(new Date(inv.date), 'dd/MM/yy')}) - ₹{inv.grandTotal.toFixed(2)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="reason">Reason for Credit Note</Label>
                            <Input id="reason" placeholder="e.g., Goods returned, Price correction" value={reason} onChange={e => setReason(e.target.value)} />
                        </div>
                    </div>

                    {selectedInvoice && (
                        <div className="pt-4 border-t">
                            <h3 className="text-lg font-medium mb-2">Adjust Invoice Items</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-center">Orig. Qty</TableHead>
                                        <TableHead className="text-right">Orig. Rate</TableHead>
                                        <TableHead className="text-right">Orig. Disc. %</TableHead>
                                        <TableHead className="w-24 text-center">Return Qty</TableHead>
                                        <TableHead className="w-32 text-right">Revised Rate</TableHead>
                                        <TableHead className="text-right">Taxable Value</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {creditItems.map((item, index) => {
                                        const originalDiscountAmount = (item.rate || 0) * (item.discount / 100);
                                        const originalNetRate = (item.rate || 0) - originalDiscountAmount;

                                        const priceDifference = originalNetRate - item.revisedRate;
                                        const priceDifferenceCredit = priceDifference > 0 ? priceDifference * (item.quantity - item.returnQty) : 0;
                                        
                                        const returnCredit = item.returnQty * originalNetRate;

                                        const taxableValue = priceDifferenceCredit + returnCredit;
                                        const itemGst = taxableValue * ((item.gstRate || 18) / 100);
                                        const total = taxableValue + itemGst;

                                        return (
                                        <TableRow key={item.productId}>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                            <TableCell className="text-right">{(item.rate || 0).toFixed(2)}</TableCell>
                                            <TableCell className="text-right">{(item.discount || 0).toFixed(2)}%</TableCell>
                                            <TableCell>
                                                <Input 
                                                    type="number" 
                                                    value={item.returnQty} 
                                                    onChange={(e) => handleItemChange(index, 'returnQty', e.target.value)}
                                                    max={item.quantity}
                                                    className="text-center"
                                                />
                                            </TableCell>
                                             <TableCell>
                                                <Input 
                                                    type="number" 
                                                    value={item.revisedRate} 
                                                    onChange={(e) => handleItemChange(index, 'revisedRate', e.target.value)}
                                                    className="text-right"
                                                />
                                            </TableCell>
                                            <TableCell className="text-right font-mono">{taxableValue.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-mono font-semibold">{total.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )})}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    <div className="pt-4 border-t flex justify-end">
                        <div className="space-y-2 w-full max-w-sm">
                            <div className="flex justify-between">
                                <span>Subtotal (Credit Value)</span>
                                <span className="font-mono">{calculations.taxableAmount.toFixed(2)}</span>
                            </div>
                            {isInterstate ? (
                                <div className="flex justify-between"><span>IGST</span><span className="font-mono">{calculations.igst.toFixed(2)}</span></div>
                            ) : (
                                <>
                                <div className="flex justify-between"><span>CGST</span><span className="font-mono">{calculations.cgst.toFixed(2)}</span></div>
                                <div className="flex justify-between"><span>SGST</span><span className="font-mono">{calculations.sgst.toFixed(2)}</span></div>
                                </>
                            )}
                            <Separator />
                            <div className="flex justify-between items-center text-xl font-bold">
                                <Label className="text-lg">Total Credit Amount</Label>
                                <span className="font-mono">{calculations.grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Issued Credit Notes</CardTitle>
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
                            {allCreditNotes?.map(note => (
                                <TableRow key={note.id}>
                                    <TableCell>{format(new Date(note.date), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell className="font-mono">{note.creditNoteNumber}</TableCell>
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
