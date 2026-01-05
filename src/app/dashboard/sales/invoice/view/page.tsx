
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
    if (number === 0) return 'zero';

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
            str += b[Math.floor(n / 20)] + ' ' + a[n % 10];
        } else if (n > 0) {
            str += a[n];
        }
        return str.trim();
    };

    let words = numToWords(integerPart);
    if (!words) words = "zero";
    let finalString = words.trim() + ' rupees';
    if (decimalPart > 0) {
        finalString += ' and ' + numToWords(decimalPart) + ' paise';
    }
    
    return finalString.charAt(0).toUpperCase() + finalString.slice(1) + ' only.';
};

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
};

export default function InvoiceViewPage() {
    const searchParams = useSearchParams();
    const invoiceId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    
    const [invoiceData, setInvoiceData] = React.useState<any>(null);
    const firestore = useFirestore();

    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
    
    React.useEffect(() => {
        const data = localStorage.getItem('invoiceToView');
        if (data) {
            const parsedData = JSON.parse(data);
            if (parsedData.invoiceNumber === invoiceId) {
                setInvoiceData(parsedData);
            }
        }
    }, [invoiceId]);

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

    const isLoading = companyInfoLoading || customerLoading || bankLedgerLoading;

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
                <p className="text-muted-foreground">Could not load the invoice details from the previous page.</p>
                <Button variant="outline" onClick={() => window.history.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </div>
        );
    }

    const { grandTotal } = calculations;

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
                            <div className="w-[175px]">
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
                                <h1 className="text-2xl font-bold text-primary">Tax Invoice</h1>
                                <p><strong>Invoice No:</strong> {invoiceData.invoiceNumber}</p>
                                <p><strong>Date:</strong> {format(new Date(invoiceData.date), 'dd/MM/yyyy')}</p>
                                <p><strong>Order No:</strong> {invoiceData.orderNumber}</p>
                            </div>
                        </header>

                        <section className="my-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h3 className="font-semibold text-sm text-muted-foreground">BILLED FROM:</h3>
                                    <p className="font-bold">{companyInfo?.companyName}</p>
                                    <p className="text-sm">
                                        {[companyAddress?.line1, companyAddress?.line2].filter(Boolean).join(', ')}
                                    </p>
                                    <p className="text-sm">
                                        {companyAddress?.city && `${companyAddress.city} - ${companyAddress.pin}, `}
                                        {companyAddress?.district}, {companyAddress?.state}, {companyAddress?.country}
                                    </p>
                                    <p className="text-sm font-semibold">GSTIN: {companyInfo?.taxInfo?.gstin?.value}</p>
                                </div>
                                <div className="text-right">
                                    <h3 className="font-semibold text-sm text-muted-foreground">BILLED TO:</h3>
                                    <p className="font-bold">{customerData?.name}</p>
                                    <p className="text-sm">
                                        {[customerAddress?.line1, customerAddress?.line2].filter(Boolean).join(', ')}
                                    </p>
                                    <p className="text-sm">
                                        {customerAddress?.city && `${customerAddress.city} - ${customerAddress.pin}, `}
                                        {customerAddress?.district}, {customerAddress?.state}, {customerAddress?.country}
                                    </p>
                                    <p className="text-sm font-semibold">GSTIN: {customerData?.gstin}</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted">
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
                                    {calculations.items.map((item: any, index: number) => (
                                        <TableRow key={`${item.productId}-${index}`}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.hsn}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell>{item.unit || 'pcs'}</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatIndianCurrency(item.rate * item.quantity)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-right font-semibold">Subtotal</TableCell>
                                        <TableCell className="text-right font-semibold">{formatIndianCurrency(calculations.subtotal)}</TableCell>
                                    </TableRow>
                                     {calculations.totalDiscountAmount > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-right text-green-600">Discount</TableCell>
                                            <TableCell className="text-right text-green-600">- {formatIndianCurrency(calculations.totalDiscountAmount)}</TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-right font-semibold">Taxable Value</TableCell>
                                        <TableCell className="text-right font-semibold">{formatIndianCurrency(calculations.taxableAmount)}</TableCell>
                                    </TableRow>
                                    {isInterstate ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-right">IGST</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(calculations.igst)}</TableCell>
                                        </TableRow>
                                    ) : (
                                        <>
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-right">CGST</TableCell>
                                                <TableCell className="text-right">{formatIndianCurrency(calculations.cgst)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-right">SGST</TableCell>
                                                <TableCell className="text-right">{formatIndianCurrency(calculations.sgst)}</TableCell>
                                            </TableRow>
                                        </>
                                    )}
                                     <TableRow className="text-base bg-muted">
                                        <TableCell colSpan={6} className="text-right font-bold">Grand Total</TableCell>
                                        <TableCell className="text-right font-bold">{formatIndianCurrency(grandTotal)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </section>
                        
                         <div className="text-right my-2 text-sm font-semibold italic">
                            Amount in words: {numberToWords(grandTotal)}
                        </div>
                        
                         <footer className="flex justify-between items-end mt-16">
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
                            <div className="text-right">
                                <p className="font-semibold mb-16">For, {companyInfo?.companyName}</p>
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
