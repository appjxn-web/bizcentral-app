
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
import type { Party, CreditNote, SalesInvoice, SalesInvoiceItem } from '@/lib/types';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc, query, where } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

interface CreditItem extends SalesInvoiceItem {
  returnQty: number;
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
    const [reason, setReason] = React.useState<'Goods Return' | 'Revised Rate' | 'Revised discount' | ''>('');
    const [date, setDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
    const [revisedDiscount, setRevisedDiscount] = React.useState(0);

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
                    price: item.rate || 0,
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
      let subtotal = 0;
      let totalDiscount = 0;
      let taxableAmount = 0;
      let totalOriginalAmount = 0;
      let totalRevisedAmount = 0;

      if (reason === 'Goods Return' && selectedInvoice) {
          subtotal = creditItems.reduce((acc, item) => acc + (item.returnQty * item.rate), 0);
          
          if(selectedInvoice.subtotal > 0){
             totalDiscount = (subtotal / selectedInvoice.subtotal) * selectedInvoice.discount;
          }
          
          taxableAmount = subtotal - totalDiscount;

      } else if (reason === 'Revised Rate') {
          totalOriginalAmount = creditItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
          totalRevisedAmount = creditItems.reduce((acc, item) => acc + (item.quantity * item.revisedRate), 0);
          taxableAmount = totalOriginalAmount - totalRevisedAmount;
          subtotal = taxableAmount; 
      } else if (reason === 'Revised discount' && selectedInvoice) {
          const originalDiscountAmount = selectedInvoice.subtotal * (selectedInvoice.discount / 100);
          const newDiscountAmount = selectedInvoice.subtotal * (revisedDiscount / 100);
          taxableAmount = newDiscountAmount - originalDiscountAmount > 0 ? newDiscountAmount - originalDiscountAmount : 0;
          subtotal = taxableAmount;
      }
      
      const totalGst = taxableAmount * 0.18; // Simplified GST calculation
      const grandTotal = taxableAmount + totalGst;
      const cgst = isInterstate ? 0 : totalGst / 2;
      const sgst = isInterstate ? 0 : totalGst / 2;
      const igst = isInterstate ? totalGst : 0;
      
      return { subtotal, totalDiscount, taxableAmount, totalGst, grandTotal, cgst, sgst, igst, totalOriginalAmount, totalRevisedAmount };
    }, [creditItems, isInterstate, reason, revisedDiscount, selectedInvoice]);


    const handleSave = async () => {
        if (!partyId || !reason) {
            toast({ variant: 'destructive', title: 'Missing information', description: 'Please select a customer and provide a reason.' });
            return;
        }

        if (calculations.grandTotal <= 0) {
             toast({ variant: 'destructive', title: 'No Adjustments Made', description: 'The total credit amount is zero. Please make an adjustment.' });
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
            items: creditItems.filter(item => item.returnQty > 0 || item.revisedRate !== item.price)
        };

        await setDoc(doc(firestore, 'creditNotes', newNoteId), { ...newCreditNote, id: newNoteId });
        toast({ title: 'Credit Note Created', description: `Credit Note ${newNoteId} has been issued.` });
        
        setPartyId('');
        setOriginalInvoiceId('');
        setSelectedInvoice(null);
        setCreditItems([]);
        setReason('');
        setRevisedDiscount(0);
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
                                            {inv.invoiceNumber} - ({format(new Date(inv.date), 'dd/MM/yy')}) - {formatIndianCurrency(inv.grandTotal)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="reason">Reason for Credit Note</Label>
                             <Select value={reason} onValueChange={(value) => setReason(value as any)}>
                                <SelectTrigger id="reason"><SelectValue placeholder="Select a reason" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Goods Return">Goods Return</SelectItem>
                                    <SelectItem value="Revised Rate">Revised Rate</SelectItem>
                                    <SelectItem value="Revised discount">Revised discount</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {selectedInvoice && reason && (
                        <div className="pt-4 border-t">
                            <h3 className="text-lg font-medium mb-2">Adjust Invoice Items</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-center">Orig. Qty</TableHead>
                                        <TableHead className="text-right">Orig. Rate</TableHead>
                                        {reason === 'Goods Return' && <TableHead className="text-right">Orig. Disc. %</TableHead>}
                                        {reason !== 'Revised discount' && <TableHead className="text-right">Orig. Total</TableHead>}
                                        
                                        {reason === 'Goods Return' && <TableHead className="w-24 text-center">Return Qty</TableHead>}
                                        {reason === 'Revised Rate' && <TableHead className="w-32 text-right">Revised Rate</TableHead>}
                                        {reason === 'Revised Rate' && <TableHead className="text-right">Revised Total</TableHead>}

                                        <TableHead className="text-right">Credit Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {creditItems.map((item, index) => {
                                        if (reason === 'Goods Return') {
                                            const itemTotal = item.returnQty * item.rate;
                                            return (
                                                <TableRow key={item.productId}>
                                                    <TableCell>{item.name}</TableCell>
                                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                                    <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                                    <TableCell className="text-right">{item.discount || 0}%</TableCell>
                                                    <TableCell className="text-right font-mono">{formatIndianCurrency(item.quantity * item.rate)}</TableCell>
                                                    <TableCell>
                                                        <Input type="number" value={item.returnQty} onChange={(e) => handleItemChange(index, 'returnQty', e.target.value)} max={item.quantity} className="text-center" />
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-semibold">{formatIndianCurrency(itemTotal)}</TableCell>
                                                </TableRow>
                                            )
                                        }
                                        if (reason === 'Revised Rate') {
                                            const originalTotal = item.quantity * item.rate;
                                            const revisedTotal = item.quantity * item.revisedRate;
                                            const creditAmount = originalTotal - revisedTotal;
                                            return (
                                                <TableRow key={item.productId}>
                                                    <TableCell>{item.name}</TableCell>
                                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                                    <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                                    <TableCell className="text-right font-mono">{formatIndianCurrency(originalTotal)}</TableCell>
                                                    <TableCell>
                                                        <Input type="number" value={item.revisedRate} onChange={(e) => handleItemChange(index, 'revisedRate', e.target.value)} className="text-right" />
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono">{formatIndianCurrency(revisedTotal)}</TableCell>
                                                    <TableCell className="text-right font-mono font-semibold text-green-600">{formatIndianCurrency(creditAmount > 0 ? creditAmount : 0)}</TableCell>
                                                </TableRow>
                                            )
                                        }
                                         if (reason === 'Revised discount') {
                                            const itemTotal = item.quantity * item.rate;
                                            return (
                                                <TableRow key={item.productId}>
                                                    <TableCell>{item.name}</TableCell>
                                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                                    <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                                    <TableCell className="text-right font-mono">{formatIndianCurrency(itemTotal)}</TableCell>
                                                </TableRow>
                                            )
                                        }
                                        return null;
                                    })}
                                </TableBody>
                                {reason === 'Revised Rate' && (
                                    <TableFooter>
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right font-semibold">Taxable Value</TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount)}</TableCell>
                                            <TableCell></TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount)}</TableCell>
                                            <TableCell className="text-right font-mono font-bold text-green-600">{formatIndianCurrency(calculations.taxableAmount)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right">GST</TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount * 0.18)}</TableCell>
                                            <TableCell></TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount * 0.18)}</TableCell>
                                            <TableCell className="text-right font-mono font-bold text-green-600">{formatIndianCurrency(calculations.totalGst)}</TableCell>
                                        </TableRow>
                                        <TableRow className="bg-muted font-bold text-lg">
                                            <TableCell colSpan={3} className="text-right">Total Amount</TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalOriginalAmount * 1.18)}</TableCell>
                                            <TableCell></TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.totalRevisedAmount * 1.18)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatIndianCurrency(calculations.grandTotal)}</TableCell>
                                        </TableRow>
                                    </TableFooter>
                                )}
                            </Table>
                             {reason === 'Revised discount' && (
                                <div className="max-w-xs mt-4">
                                <Label htmlFor="revised-discount">New Overall Discount %</Label>
                                <Input id="revised-discount" type="number" value={revisedDiscount} onChange={(e) => setRevisedDiscount(Number(e.target.value))} />
                                <p className="text-xs text-muted-foreground mt-1">Original discount was {selectedInvoice?.discount.toFixed(2)}%</p>
                                </div>
                            )}
                        </div>
                    )}
                    {(reason === 'Goods Return' || reason === 'Revised discount') && (
                        <div className="pt-4 border-t flex justify-end">
                            <div className="space-y-2 w-full max-w-sm">
                                <div className="flex justify-between">
                                    <span>Taxable Value (Credit)</span>
                                    <span className="font-mono">{formatIndianCurrency(calculations.taxableAmount)}</span>
                                </div>
                                {isInterstate ? (
                                    <div className="flex justify-between"><span>IGST</span><span className="font-mono">{formatIndianCurrency(calculations.igst)}</span></div>
                                ) : (
                                    <>
                                    <div className="flex justify-between"><span>CGST</span><span className="font-mono">{formatIndianCurrency(calculations.cgst)}</span></div>
                                    <div className="flex justify-between"><span>SGST</span><span className="font-mono">{formatIndianCurrency(calculations.sgst)}</span></div>
                                    </>
                                )}
                                <Separator />
                                <div className="flex justify-between items-center text-xl font-bold">
                                    <Label className="text-lg">Total Credit Amount</Label>
                                    <span className="font-mono">{formatIndianCurrency(calculations.grandTotal)}</span>
                                </div>
                            </div>
                        </div>
                    )}
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
