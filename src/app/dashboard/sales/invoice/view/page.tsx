
'use client';

import * as React from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Download, Loader2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import type { SalesInvoice, CompanyInfo, Party, CoaLedger, Address, Order } from '@/lib/types';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { collection, doc, query, where, limit } from 'firebase/firestore';

const numberToWords = (num: number): string => {
    if (num === null || num === undefined) return '';
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const number = parseFloat(num.toFixed(2));
    if (isNaN(number)) return '';
    if (number === 0) return 'zero rupees only.';

    const integerPart = Math.floor(number);
    const decimalPart = Math.round((number - integerPart) * 100);

    const numToWords = (n: number): string => {
        let str = '';
        if (n >= 10000000) {
            str += numToWords(Math.floor(n / 10000000)) + ' crore ';
            n %= 10000000;
        }
        if (n >= 100000) {
            str += numToWords(Math.floor(n / 100000)) + ' lakh ';
            n %= 100000;
        }
        if (n >= 1000) {
            str += numToWords(Math.floor(n / 1000)) + ' thousand ';
            n %= 1000;
        }
        if (n >= 100) {
            str += a[Math.floor(n / 100)] + ' hundred ';
            n %= 100;
        }
        if (n > 19) {
            str += b[Math.floor(n / 20)] + (a[n % 10] ? ' ' + a[n % 10] : '');
        } else if (n > 0) {
            str += a[n];
        }
        return str.trim();
    };

    let words = numToWords(integerPart);
    if (!words) words = "zero";
    let finalString = words.charAt(0).toUpperCase() + words.slice(1) + ' Rupees';
    if (decimalPart > 0) {
        finalString += ' and ' + numToWords(decimalPart) + ' Paise';
    }
    
    return finalString + ' Only.';
};

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

export default function InvoiceViewPage() {
    const searchParams = useSearchParams();
    const invoiceId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    
    const firestore = useFirestore();
    const invoiceRef = invoiceId ? doc(firestore, 'salesInvoices', invoiceId) : null;
    const { data: invoiceData, loading: invoiceLoading } = useDoc<SalesInvoice>(invoiceRef);

    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
    
    const { data: customerData, loading: customerLoading } = useDoc<Party>(
        invoiceData?.customerId ? doc(firestore, 'parties', invoiceData.customerId) : null
    );
    
    const bankLedgerQuery = React.useMemo(() => {
        if (!companyInfo?.primaryUpiId || !firestore) return null;
        return query(
            collection(firestore, 'coa_ledgers'),
            where('bank.upiId', '==', companyInfo.primaryUpiId),
            limit(1)
        );
    }, [companyInfo, firestore]);

    const { data: bankLedgerResult, loading: bankLedgerLoading } = useCollection<CoaLedger>(bankLedgerQuery);
    const bankDetails = bankLedgerResult?.[0]?.bank;
    
    const companyAddress = companyInfo?.addresses?.[0] as Address | undefined;
    const customerAddress = customerData?.address;

    const isInterstate = React.useMemo(() => {
        const companyGstin = companyInfo?.taxInfo?.gstin?.value;
        if (!companyGstin || !customerData?.gstin) return false;
        return !companyGstin.startsWith(customerData.gstin.substring(0, 2));
    }, [companyInfo, customerData]);
    
    const calculations = React.useMemo(() => {
        if (!invoiceData?.items) return { items: [], subtotal: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 0, totalDiscountAmount: 0, taxableAmount: 0 };
    
        const items = invoiceData.items;
        const subtotal = items.reduce((acc: number, item: any) => acc + (item.rate * item.quantity), 0);
        const totalDiscount = invoiceData.discount || 0;
        const taxableAmount = subtotal - totalDiscount;
        const totalGst = items.reduce((acc: number, item: any) => {
            const itemSubtotal = item.rate * item.quantity;
            const itemDiscount = itemSubtotal * ((invoiceData.discount / subtotal) || 0);
            const discountedAmount = itemSubtotal - itemDiscount;
            return acc + (discountedAmount * ((item.gstRate || 18) / 100));
        }, 0);
    
        const grandTotal = taxableAmount + totalGst;
        const cgst = isInterstate ? 0 : totalGst / 2;
        const sgst = isInterstate ? 0 : totalGst / 2;
        const igst = isInterstate ? totalGst : 0;
        
        return { items, subtotal, totalDiscountAmount: totalDiscount, taxableAmount, cgst, sgst, igst, grandTotal };
      }, [invoiceData, isInterstate]);


    const handleDownloadPdf = async () => {
        const element = pdfRef.current;
        if (!element) return;
        setIsDownloading(true);
        
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(element, { 
            scale: 3, 
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png', 1.0);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgProps = pdf.getImageProperties(imgData);
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Invoice-${invoiceData.invoiceNumber || invoiceId}.pdf`);
        setIsDownloading(false);
    };

    const isLoading = invoiceLoading || companyInfoLoading || customerLoading || bankLedgerLoading;

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!invoiceData) {
        return (
            <div className="p-8 text-center space-y-4">
                <h1 className="text-2xl font-bold text-destructive">Invoice Data Not Found</h1>
                <p className="text-muted-foreground">Could not load the invoice details.</p>
                <Button variant="outline" onClick={() => window.history.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </div>
        );
    }

    const { grandTotal, subtotal, discount, cgst, sgst, igst, items, totalDiscountAmount, taxableAmount } = calculations;

    return (
        <>
            <PageHeader title={`Invoice: ${invoiceId}`}>
                <Button onClick={handleDownloadPdf} disabled={isDownloading}>
                    {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download PDF
                </Button>
            </PageHeader>
            <Card>
                <CardContent>
                    <div className="max-w-4xl mx-auto p-8" ref={pdfRef}>
                        <header className="flex justify-between items-start border-b pb-4">
                            <div>
                                {companyInfo?.logo && (
                                    <Image 
                                        src={companyInfo.logo} 
                                        alt="Company Logo" 
                                        width={175} 
                                        height={45} 
                                        className="object-contain"
                                        crossOrigin="anonymous"
                                    />
                                )}
                            </div>
                            <div className="text-right">
                                <h1 className="text-xl md:text-2xl font-bold text-primary">{companyInfo?.companyName}</h1>
                                <p className="text-xs md:text-sm text-muted-foreground">
                                    {[companyAddress?.line1, companyAddress?.line2].filter(Boolean).join(', ')}
                                </p>
                                <p className="text-xs md:text-sm text-muted-foreground">
                                    {companyAddress?.city && `${companyAddress.city} - ${companyAddress.pin}, `}
                                    {companyAddress?.district}, {companyAddress?.state}, {companyAddress?.country}
                                </p>
                                <p className="text-xs md:text-sm text-muted-foreground">{companyInfo?.contactEmail} | {companyInfo?.contactNumber}</p>
                                <div className="text-xs md:text-sm mt-2 space-y-1">
                                    <p><strong>GSTIN:</strong> {companyInfo?.taxInfo?.gstin?.value}</p>
                                    <p><strong>CIN:</strong> {companyInfo?.taxInfo?.cin?.value}</p>
                                </div>
                            </div>
                        </header>
        
                        <section className="my-6">
                            <h2 className="text-right text-lg font-bold mb-4 underline">TAX INVOICE</h2>
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div>
                                    <h3 className="font-semibold text-sm">Billed To:</h3>
                                    <p className="font-bold">{customerData?.name}</p>
                                    <p className="text-sm">
                                        {[customerAddress?.line1, customerAddress?.line2].filter(Boolean).join(', ')}
                                    </p>
                                    <p className="text-sm">
                                        {customerAddress?.city && `${customerAddress.city} - ${customerAddress.pin}, `}
                                        {customerAddress?.district}, {customerAddress?.state}, {customerAddress?.country}
                                    </p>
                                    <p className="text-sm">
                                        {customerData?.contactPerson && `Attn: ${customerData.contactPerson}, `}
                                        {customerData?.email} | {customerData?.phone}
                                    </p>
                                    <p className="text-sm font-semibold">GSTIN: {customerData?.gstin}</p>
                                </div>
                                <div className="md:text-right text-sm">
                                    <p><strong>Invoice No:</strong> {invoiceData.invoiceNumber}</p>
                                    <p><strong>Date:</strong> {format(new Date(invoiceData.date), 'dd/MM/yyyy')}</p>
                                    <p><strong>Order No:</strong> {invoiceData.orderNumber}</p>
                                </div>
                            </div>
                        </section>
        
                        <section className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead>Sr.</TableHead>
                                        <TableHead>Items</TableHead>
                                        <TableHead>HSN</TableHead>
                                        <TableHead className="text-right">QTY</TableHead>
                                        <TableHead>Unit</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item: any, index: number) => (
                                        <TableRow key={`${item.productId}-${index}`}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.hsn}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell>pcs</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatIndianCurrency(item.rate * item.quantity)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-right font-semibold py-1">Subtotal</TableCell>
                                        <TableCell className="text-right font-semibold py-1">{formatIndianCurrency(subtotal)}</TableCell>
                                    </TableRow>
                                     {totalDiscountAmount > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-right text-green-600 py-1">Discount</TableCell>
                                            <TableCell className="text-right text-green-600 py-1">- {formatIndianCurrency(totalDiscountAmount)}</TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-right font-semibold py-1">Taxable Value</TableCell>
                                        <TableCell className="text-right font-semibold py-1">{formatIndianCurrency(taxableAmount)}</TableCell>
                                    </TableRow>
                                    {isInterstate ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-right py-1">IGST</TableCell>
                                            <TableCell className="text-right py-1">{formatIndianCurrency(igst || 0)}</TableCell>
                                        </TableRow>
                                    ) : (
                                        <>
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-right py-1">CGST</TableCell>
                                                <TableCell className="text-right py-1">{formatIndianCurrency(cgst)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-right py-1">SGST</TableCell>
                                                <TableCell className="text-right py-1">{formatIndianCurrency(sgst)}</TableCell>
                                            </TableRow>
                                        </>
                                    )}
                                     <TableRow className="text-base bg-muted/50">
                                        <TableCell colSpan={6} className="text-right font-bold py-2">Grand Total</TableCell>
                                        <TableCell className="text-right font-bold py-2">{formatIndianCurrency(grandTotal)}</TableCell>
                                    </TableRow>
                                     <TableRow>
                                        <TableCell colSpan={6} className="text-right font-semibold py-1">Amount Paid</TableCell>
                                        <TableCell className="text-right font-semibold text-green-600 py-1">{formatIndianCurrency(invoiceData.amountPaid || 0)}</TableCell>
                                    </TableRow>
                                     <TableRow className="text-base">
                                        <TableCell colSpan={6} className="text-right font-bold py-1">Balance Due</TableCell>
                                        <TableCell className="text-right font-bold text-red-600 py-1">{formatIndianCurrency(invoiceData.balanceDue)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </section>
                        
                        <div className="text-right my-4 text-xs md:text-sm font-semibold italic">
                            Amount in words: {numberToWords(grandTotal)}
                        </div>
        
                        <footer className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16">
                            <div className="text-xs space-y-4">
                                <div className="flex gap-4 p-3 bg-slate-50 rounded-lg">
                                    {bankDetails && (
                                        <div className="text-xs flex-1">
                                            <h4 className="font-bold mb-2">Bank Details:</h4>
                                            <p><strong>Bank:</strong> {bankDetails.bankName}</p>
                                            <p><strong>A/C:</strong> {bankDetails.accountNumber}</p>
                                            <p><strong>IFSC:</strong> {bankDetails.ifscCode}</p>
                                            {(bankDetails as any).branch && <p><strong>Branch:</strong> {(bankDetails as any).branch}</p>}
                                        </div>
                                    )}
                                    {companyInfo?.primaryUpiId && invoiceData.balanceDue > 0 && (
                                        <div className="flex flex-col items-center">
                                            <p className="text-[10px] font-bold mb-1">Scan to Pay Balance</p>
                                            <QRCodeSVG value={`upi://pay?pa=${companyInfo.primaryUpiId}&pn=${encodeURIComponent(companyInfo.companyName || '')}&am=${invoiceData.balanceDue?.toFixed(2)}&cu=INR`} size={64} />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-right flex flex-col justify-end items-end">
                                <p className="font-semibold text-sm mb-16">For, {companyInfo?.companyName}</p>
                                <div className="h-16 w-32"></div>
                                <Separator className="w-full max-w-[200px] ml-auto"/>
                                <p className="text-xs pt-1">Authorized Signatory</p>
                            </div>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
      );
}

