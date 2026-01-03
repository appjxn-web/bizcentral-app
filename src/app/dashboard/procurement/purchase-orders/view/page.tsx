

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
import { Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';
import { parties } from '@/lib/data';

const companyDetails = {
  name: 'JXN Infra Equipment Private Limited',
  address: {
    line1: '123 Industrial Area',
    line2: 'BizTown',
    city: 'Metropolis',
    pin: '12345',
  },
  contact: {
    email: 'contact@jxninfra.com',
    phone: '+91-9876543210',
    website: 'www.jxninfra.com'
  },
  gstin: '08AAFCJ5369P1ZR',
  logo: 'https://placehold.co/350x80/eee/ccc.png?text=Your+Logo',
};

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const numberToWords = (num: number): string => {
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const number = parseFloat(num.toFixed(2));
    if (isNaN(number)) return '';
    if (number === 0) return 'zero';

    const [integerPart, decimalPart] = number.toString().split('.');
    
    let words = '';
    // This simplified function only handles up to thousands.
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


export default function PurchaseOrderViewPage() {
    const searchParams = useSearchParams();
    const poId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [poData, setPoData] = React.useState<any>(null);
    
    React.useEffect(() => {
        if (poId) {
            const allPOs = JSON.parse(localStorage.getItem('draftPOs') || '[]');
            const foundPO = allPOs.find((po: any) => po.id === poId);
            if (foundPO) {
                const supplier = parties.find(p => p.id === foundPO.supplierId);
                setPoData({...foundPO, supplier});
            }
        }
    }, [poId]);

    const isInterstate = React.useMemo(() => {
      if (!poData?.supplier?.gstin) return false;
      return !companyDetails.gstin.startsWith(poData.supplier.gstin.substring(0, 2));
    }, [poData?.supplier]);
    
    const calculations = React.useMemo(() => {
        if (!poData) return { subtotal: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 0, items: [] };

        const subtotal = poData.items.reduce((sum: number, item: any) => sum + (item.rate * item.quantity), 0);
        // Assume a flat 18% GST for all items for this example
        const totalGst = subtotal * 0.18;
        const grandTotal = subtotal + totalGst;
        const cgst = isInterstate ? 0 : totalGst / 2;
        const sgst = isInterstate ? 0 : totalGst / 2;
        const igst = isInterstate ? totalGst : 0;
        
        return { subtotal, cgst, sgst, igst, grandTotal, items: poData.items };
    }, [poData, isInterstate]);


    const handleDownloadPdf = async () => {
        const element = pdfRef.current;
        if (!element) return;
        setIsDownloading(true);
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = imgWidth / imgHeight;
        let imgPdfWidth = pdfWidth;
        let imgPdfHeight = pdfWidth / ratio;
        if (imgPdfHeight > pdfHeight) {
            imgPdfHeight = pdfHeight;
            imgPdfWidth = pdfHeight * ratio;
        }
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgPdfHeight);
        pdf.save(`PO-${poData.id}.pdf`);
        setIsDownloading(false);
    };

    if (!poId) {
        return <PageHeader title="Purchase Order Not Found" />;
    }
    
    if (!poData) {
        return (
             <PageHeader title="Loading Purchase Order...">
                <div className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                </div>
            </PageHeader>
        )
    }
    
    return (
        <>
            <PageHeader title={`Purchase Order: ${poId}`}>
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
                                <Image src={companyDetails.logo} alt="Company Logo" width={175} height={40} className="object-contain" />
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-bold text-primary">Purchase Order</h1>
                                <p><strong>PO No:</strong> {poData.id}</p>
                                <p><strong>Date:</strong> {format(new Date(poData.date), 'dd/MM/yyyy')}</p>
                            </div>
                        </header>

                        <section className="my-6">
                            <div className="flex justify-between">
                                <div>
                                    <h3 className="font-semibold">Supplier:</h3>
                                    <p className="font-bold">{poData.supplier.name}</p>
                                    <p>{poData.supplier.address}</p>
                                    <p>{poData.supplier.email} | {poData.supplier.phone}</p>
                                    <p>GSTIN: {poData.supplier.gstin || 'N/A'}</p>
                                </div>
                                <div>
                                    <h3 className="font-semibold">Deliver To:</h3>
                                    <p className="font-bold">{companyDetails.name}</p>
                                    <p>{companyDetails.address.line1}, {companyDetails.address.line2}</p>
                                    <p>{companyDetails.address.city} - {companyDetails.address.pin}</p>
                                    <p>GSTIN: {companyDetails.gstin}</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted">
                                        <TableHead>Item Description</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {calculations.items.map((item: any, index: number) => (
                                        <TableRow key={`${item.productId}-${index}`}>
                                            <TableCell>{item.productName}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatIndianCurrency(item.rate * item.quantity)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-semibold">Subtotal</TableCell>
                                        <TableCell className="text-right font-semibold">{formatIndianCurrency(calculations.subtotal)}</TableCell>
                                    </TableRow>
                                    {isInterstate ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right">IGST (18%)</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(calculations.igst)}</TableCell>
                                        </TableRow>
                                    ) : (
                                        <>
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right">CGST (9%)</TableCell>
                                                <TableCell className="text-right">{formatIndianCurrency(calculations.cgst)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right">SGST (9%)</TableCell>
                                                <TableCell className="text-right">{formatIndianCurrency(calculations.sgst)}</TableCell>
                                            </TableRow>
                                        </>
                                    )}
                                    <TableRow className="text-base bg-muted">
                                        <TableCell colSpan={3} className="text-right font-bold">Grand Total</TableCell>
                                        <TableCell className="text-right font-bold">{formatIndianCurrency(calculations.grandTotal)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </section>
                        
                         <div className="text-right my-2 text-sm font-semibold">
                            Amount in words: {numberToWords(calculations.grandTotal)}
                        </div>

                        <footer className="flex justify-between items-end mt-16">
                            <div className="text-xs space-y-4">
                                <h4 className="font-bold mb-1">Terms & Conditions:</h4>
                                <ul className="list-disc list-inside text-muted-foreground">
                                    <li>Payment within 30 days of invoice.</li>
                                    <li>Please mention PO number on all invoices.</li>
                                    <li>Goods must be delivered to the specified address.</li>
                                </ul>
                            </div>
                            <div className="text-right">
                                <p className="font-semibold mb-16">For, {companyDetails.name}</p>
                                <div className="h-16 w-32"></div>
                                <Separator />
                                <p className="text-sm pt-1">Authorized Signatory</p>
                            </div>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
