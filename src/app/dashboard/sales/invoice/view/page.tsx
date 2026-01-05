
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
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const number = parseFloat(num.toFixed(2));
    if (isNaN(number)) return '';
    if (number === 0) return 'zero';

    const [integerPart, decimalPart] = number.toString().split('.');
    
    let words = '';
    // This simplified function only handles up to thousands.
    // A production-ready function would need to handle lakhs, crores, etc.
    if (integerPart.length > 3) {
      words += a[parseInt(integerPart.slice(0, -3), 10)] + ' thousand ';
    }
    const lastThree = parseInt(integerPart.slice(-3), 10);
    if (lastThree >= 100) {
      words += a[Math.floor(lastThree / 100)] + ' hundred ';
    }
    const lastTwo = lastThree % 100;
    if (lastTwo >= 20) {
      words += b[Math.floor(lastTwo / 20)] + ' ' + a[lastTwo % 10];
    } else if (lastTwo > 0) {
      words += a[lastTwo];
    }

    let finalString = words.trim() + ' rupees';
    if (decimalPart && parseInt(decimalPart) > 0) {
        finalString += ' and ' + (b[Math.floor(parseInt(decimalPart) / 10)] + ' ' + a[parseInt(decimalPart) % 10]).trim() + ' paise';
    }
    
    return finalString.charAt(0).toUpperCase() + finalString.slice(1) + ' only.';
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
    
    const [invoiceData, setInvoiceData] = React.useState<any>(null);

    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(useFirestore(), 'company', 'info'));
    
    React.useEffect(() => {
        const data = localStorage.getItem('invoiceToView');
        if (data) {
            const parsedData = JSON.parse(data);
            if (parsedData.invoiceNumber === invoiceId) {
                setInvoiceData(parsedData);
            }
        }
    }, [invoiceId]);
    
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

    if (companyInfoLoading) {
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
                                        height={40} 
                                        className="object-contain"
                                        crossOrigin="anonymous"
                                    />
                                )}
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-bold text-primary">Tax Invoice</h1>
                                <p><strong>Invoice No:</strong> {invoiceData.invoiceNumber}</p>
                                <p><strong>Date:</strong> {format(new Date(invoiceData.date), 'dd/MM/yyyy')}</p>
                            </div>
                        </header>

                        <section className="my-6">
                           <div className="flex justify-between">
                                <div>
                                    <h3 className="font-semibold text-sm">Billed To:</h3>
                                    <p className="font-bold">{invoiceData.customerName}</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted">
                                        <TableHead>Item Description</TableHead>
                                        <TableHead>HSN</TableHead>
                                        <TableHead className="text-right">QTY</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoiceData.items.map((item: any, index: number) => (
                                        <TableRow key={`${item.productId}-${index}`}>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell>{item.hsn}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatIndianCurrency(item.rate * item.quantity)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-right font-semibold">Subtotal</TableCell>
                                        <TableCell className="text-right font-semibold">{formatIndianCurrency(invoiceData.subtotal)}</TableCell>
                                    </TableRow>
                                    {invoiceData.discount > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-right text-green-600">Discount</TableCell>
                                            <TableCell className="text-right text-green-600">- {formatIndianCurrency(invoiceData.discount)}</TableCell>
                                        </TableRow>
                                    )}
                                     <TableRow>
                                        <TableCell colSpan={4} className="text-right font-semibold">Taxable Value</TableCell>
                                        <TableCell className="text-right font-semibold">{formatIndianCurrency(invoiceData.subtotal - invoiceData.discount)}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-right">CGST</TableCell>
                                        <TableCell className="text-right">{formatIndianCurrency(invoiceData.cgst)}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-right">SGST</TableCell>
                                        <TableCell className="text-right">{formatIndianCurrency(invoiceData.sgst)}</TableCell>
                                    </TableRow>
                                    <TableRow className="text-base bg-muted">
                                        <TableCell colSpan={4} className="text-right font-bold">Grand Total</TableCell>
                                        <TableCell className="text-right font-bold">{formatIndianCurrency(invoiceData.grandTotal)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </section>
                        
                         <div className="text-right my-2 text-sm font-semibold">
                            Amount in words: {numberToWords(invoiceData.grandTotal)}
                        </div>

                        <footer className="text-center text-xs text-muted-foreground pt-16">
                            <p>This is a computer-generated document.</p>
                            <p>{companyInfo?.companyName} | {companyInfo?.contactEmail}</p>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
      );
}
