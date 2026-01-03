

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
import type { Quotation, CompanyInfo, Party, CoaLedger, Address } from '@/lib/types';
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

export default function QuotationViewPage() {
    const searchParams = useSearchParams();
    const techId = searchParams.get('id'); 
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    const firestore = useFirestore();

    const directDocRef = techId ? doc(firestore, 'quotations', techId) : null;
    const { data: directData, loading: directLoading } = useDoc<Quotation>(directDocRef);

    const fallbackQuery = React.useMemo(() => {
        if (!techId || directData || !firestore) return null;
        return query(
            collection(firestore, 'quotations'),
            where('quotationNumber', '==', techId),
            limit(1)
        );
    }, [techId, directData, firestore]);

    const { data: fallbackResult, loading: fallbackLoading } = useCollection<Quotation>(fallbackQuery);

    const quotationData = directData || fallbackResult?.[0];
    const quotationLoading = directLoading || (fallbackLoading && !directData);

    const { data: customerData, loading: customerLoading } = useDoc<Party>(
        quotationData?.customerId ? doc(firestore, 'parties', quotationData.customerId) : null
    );

    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
    
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

    const isInterstate = React.useMemo(() => {
        const companyGstin = companyInfo?.taxInfo?.gstin?.value;
        if (!companyGstin || !customerData?.gstin) return false;
        return !companyGstin.startsWith(customerData.gstin.substring(0, 2));
    }, [companyInfo, customerData]);
    
    const calculations = React.useMemo(() => {
        if (!quotationData?.items) return { items: [], subtotal: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 0, totalDiscountAmount: 0, taxableAmount: 0 };
    
        let subtotal = 0;
        let totalGst = 0;
        let totalDiscount = 0;
        const overallDiscountPercent = quotationData.overallDiscount || 0;
    
        const items = quotationData.items.map(item => {
          const totalAmountBeforeDiscount = item.rate * item.qty;
          const itemDiscountAmount = totalAmountBeforeDiscount * (overallDiscountPercent / 100);
          totalDiscount += itemDiscountAmount;
    
          const amountAfterDiscount = totalAmountBeforeDiscount - itemDiscountAmount;
          const gstAmount = amountAfterDiscount * (item.gstRate / 100);
          
          subtotal += amountAfterDiscount;
          totalGst += gstAmount;
          
          return { ...item, amount: totalAmountBeforeDiscount, gstAmount };
        });
        
        const taxableAmount = items.reduce((acc, item) => acc + item.amount, 0) - totalDiscount;

        const grandTotal = taxableAmount + totalGst;
        const cgst = isInterstate ? 0 : totalGst / 2;
        const sgst = isInterstate ? 0 : totalGst / 2;
        const igst = isInterstate ? totalGst : 0;
        
        return { items, subtotal: items.reduce((acc, item) => acc + item.amount, 0), totalDiscountAmount: totalDiscount, taxableAmount, cgst, sgst, igst, grandTotal };
      }, [quotationData, isInterstate]);


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
        pdf.save(`Quotation-${quotationData?.quotationNumber || techId}.pdf`);
        setIsDownloading(false);
    };

    const isLoading = quotationLoading || customerLoading || companyInfoLoading || bankLedgerLoading;

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!quotationData) {
        return (
            <div className="p-8 text-center space-y-4">
                <h1 className="text-2xl font-bold text-destructive">Quotation Not Found</h1>
                <p className="text-muted-foreground">The Quotation "{techId}" does not exist.</p>
                <Button variant="outline" onClick={() => window.history.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </div>
        );
    }
  
    const advanceAmount = (quotationData.bookingAmount || 0) > 0 ? quotationData.bookingAmount : calculations.grandTotal * 0.25;

    return (
        <>
            <PageHeader title={`Quotation: ${quotationData.quotationNumber || 'View'}`}>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => window.history.back()}>
                        Back
                    </Button>
                    <Button onClick={handleDownloadPdf} disabled={isDownloading}>
                        {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                    </Button>
                </div>
            </PageHeader>
            <Card className="border-none shadow-none lg:border lg:shadow-sm">
                <CardContent className="p-0 lg:p-6">
                    <div className="max-w-4xl mx-auto p-4 md:p-8 bg-white" ref={pdfRef}>
                        {/* Header */}
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
        
                        {/* Quotation Info */}
                        <section className="my-6">
                            <h2 className="text-right text-lg font-bold mb-4 underline">QUOTATION</h2>
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div>
                                    <h3 className="font-semibold text-sm">Billed To:</h3>
                                    <p className="font-bold">{customerData?.name}</p>
                                    <p className="text-sm">
                                        {[customerData?.address?.line1, customerData?.address?.line2].filter(Boolean).join(', ')}
                                    </p>
                                    <p className="text-sm">
                                        {customerData?.address?.city && `${customerData.address.city} - ${customerData.address.pin}, `}
                                        {customerData?.address?.district}, {customerData?.address?.state}, {customerData?.address?.country}
                                    </p>
                                    <p className="text-sm">
                                        {customerData?.contactPerson && `Attn: ${customerData.contactPerson}, `}
                                        {customerData?.email} | {customerData?.phone}
                                    </p>
                                    <p className="text-sm font-semibold">GSTIN: {customerData?.gstin}</p>
                                </div>
                                <div className="md:text-right text-sm">
                                    <p><strong>Quotation No:</strong> {quotationData.quotationNumber}</p>
                                    <p><strong>Date:</strong> {quotationData.date ? format(new Date(quotationData.date), 'dd/MM/yyyy') : 'N/A'}</p>
                                </div>
                            </div>
                        </section>
        
                        {/* Table */}
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
                                    {calculations.items.map((item, index) => (
                                        <TableRow key={`${item.productId}-${index}`}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.hsn}</TableCell>
                                            <TableCell className="text-right">{item.qty}</TableCell>
                                            <TableCell>{item.unit}</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatIndianCurrency(item.amount)}</TableCell>
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
                                            <TableCell colSpan={6} className="text-right text-green-600">Discount ({quotationData.overallDiscount}%)</TableCell>
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
                                     <TableRow className="text-base bg-muted/50">
                                        <TableCell colSpan={6} className="text-right font-bold">Grand Total</TableCell>
                                        <TableCell className="text-right font-bold">{formatIndianCurrency(calculations.grandTotal)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </section>
                        
                        <div className="text-right my-4 text-xs md:text-sm font-semibold italic">
                            Amount in words: {numberToWords(calculations.grandTotal)}
                        </div>
        
                        <Separator className="my-6" />
        
                        {/* Footer Section */}
                        <footer className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                            <div className="space-y-4">
                                <div>
                                    <h4 className="font-bold text-sm mb-1">Terms &amp; Conditions:</h4>
                                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">{quotationData.terms || 'Standard terms apply.'}</div>
                                </div>
                                <div className="flex gap-4 p-3 bg-slate-50 rounded-lg">
                                    {bankDetails && (
                                        <div className="text-xs flex-1">
                                            <h4 className="font-bold mb-2">Booking Advance ({formatIndianCurrency(advanceAmount)}):</h4>
                                            <p><strong>Bank:</strong> {bankDetails.bankName}</p>
                                            <p><strong>A/C:</strong> {bankDetails.accountNumber}</p>
                                            <p><strong>IFSC:</strong> {bankDetails.ifscCode}</p>
                                            {(bankDetails as any).branch && <p><strong>Branch:</strong> {(bankDetails as any).branch}</p>}
                                        </div>
                                    )}
                                    {companyInfo?.primaryUpiId && advanceAmount > 0 && (
                                        <div className="flex flex-col items-center">
                                            <p className="text-[10px] font-bold mb-1">Scan to Pay Advance</p>
                                            <QRCodeSVG value={`upi://pay?pa=${companyInfo.primaryUpiId}&pn=${encodeURIComponent(companyInfo.companyName || '')}&am=${advanceAmount.toFixed(2)}&cu=INR`} size={64} />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-right flex flex-col justify-end items-end">
                                <p className="font-semibold text-sm mb-16">For, {companyInfo?.companyName}</p>
                                <div className="h-16 w-32"></div>
                                <Separator className="w-full max-w-[200px] ml-auto"/>
                                <p className="text-xs pt-1">Authorized Signatory</p>
                                <p className="text-[10px] text-muted-foreground">Created by: {quotationData.createdBy}</p>
                            </div>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
      );
}
