

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
import { Download, Loader2, Phone, MapPin } from 'lucide-react';
import { notFound } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import type { Order, CompanyInfo, PickupPoint, SalesOrder, Party, Address, CoaLedger } from '@/lib/types';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { collection, doc, query, where, limit } from 'firebase/firestore';
import { format } from 'date-fns';

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
};

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


export default function SalesOrderViewPage() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    const firestore = useFirestore();
    
    const orderRef = orderId ? doc(firestore, 'orders', orderId) : null;
    const { data: orderData, loading: orderLoading } = useDoc<SalesOrder>(orderRef);

    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));

    const { data: customerData, loading: customerLoading } = useDoc<Party>(
        orderData?.userId ? doc(firestore, 'parties', orderData.userId) : null
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
        pdf.save(`Order-${orderData?.orderNumber}.pdf`);
        setIsDownloading(false);
    };

    const isLoading = orderLoading || companyInfoLoading || customerLoading || bankLedgerLoading;

    if (isLoading) {
        return (
             <PageHeader title="Loading Order...">
                <div className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                </div>
            </PageHeader>
        )
    }

    if (!orderData) {
        return <PageHeader title="Order Not Found" />;
    }
    
    const { grandTotal, subtotal, discount, cgst, sgst, igst, items } = orderData;
    const taxableAmount = subtotal - discount;

    return (
        <>
            <PageHeader title={`Sales Order: ${orderData.orderNumber}`}>
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
                                {companyInfo?.logo && <Image src={companyInfo.logo} alt="Company Logo" width={175} height={40} className="object-contain" crossOrigin="anonymous" />}
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-bold text-primary">{companyInfo?.companyName}</h1>
                                <p className="text-sm text-muted-foreground">
                                    {[companyAddress?.line1, companyAddress?.line2].filter(Boolean).join(', ')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {companyAddress?.city && `${companyAddress.city} - ${companyAddress.pin}, `}
                                    {companyAddress?.district}, {companyAddress?.state}, {companyAddress?.country}
                                </p>
                                <p className="text-sm text-muted-foreground">{companyInfo?.contactEmail} | {companyInfo?.contactNumber}</p>
                                <div className="text-sm mt-2">
                                    <p><strong>GSTIN:</strong> {companyInfo?.taxInfo?.gstin?.value}</p>
                                    <p><strong>CIN:</strong> {companyInfo?.taxInfo?.cin?.value}</p>
                                </div>
                            </div>
                        </header>
        
                        <section className="my-6">
                            <h2 className="text-right text-xl font-semibold mb-4 underline">SALES ORDER</h2>
                            <div className="flex justify-between">
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
                                <div className="text-right text-sm">
                                    <p><strong>Order No:</strong> {orderData.orderNumber}</p>
                                    <p><strong>Date:</strong> {format(new Date(orderData.date), 'dd/MM/yyyy')}</p>
                                    {orderData.quotationId && <p><strong>Quotation No:</strong> {orderData.quotationId}</p>}
                                </div>
                            </div>
                        </section>
        
                        <section>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted">
                                        <TableHead>Sr.</TableHead>
                                        <TableHead>Items</TableHead>
                                        <TableHead className="text-right">QTY</TableHead>
                                        <TableHead>Unit</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item, index) => (
                                        <TableRow key={index}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell>pcs</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(item.price)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatIndianCurrency(item.price * item.quantity)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-right font-semibold">Subtotal</TableCell>
                                        <TableCell className="text-right font-semibold">{formatIndianCurrency(subtotal)}</TableCell>
                                    </TableRow>
                                     {discount > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-right text-green-600">Discount</TableCell>
                                            <TableCell className="text-right text-green-600">- {formatIndianCurrency(discount)}</TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-right font-semibold">Taxable Value</TableCell>
                                        <TableCell className="text-right font-semibold">{formatIndianCurrency(taxableAmount)}</TableCell>
                                    </TableRow>
                                    {isInterstate ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-right">IGST</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(igst || 0)}</TableCell>
                                        </TableRow>
                                    ) : (
                                        <>
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-right">CGST</TableCell>
                                                <TableCell className="text-right">{formatIndianCurrency(cgst)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-right">SGST</TableCell>
                                                <TableCell className="text-right">{formatIndianCurrency(sgst)}</TableCell>
                                            </TableRow>
                                        </>
                                    )}
                                     <TableRow className="text-base bg-muted">
                                        <TableCell colSpan={5} className="text-right font-bold">Grand Total</TableCell>
                                        <TableCell className="text-right font-bold">{formatIndianCurrency(grandTotal)}</TableCell>
                                    </TableRow>
                                     <TableRow>
                                        <TableCell colSpan={5} className="text-right font-semibold">Amount Paid</TableCell>
                                        <TableCell className="text-right font-semibold text-green-600">{formatIndianCurrency(orderData.paymentReceived || 0)}</TableCell>
                                    </TableRow>
                                     <TableRow className="text-base">
                                        <TableCell colSpan={5} className="text-right font-bold">Balance Due</TableCell>
                                        <TableCell className="text-right font-bold text-red-600">{formatIndianCurrency(orderData.balance || grandTotal)}</TableCell>
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
                                    {companyInfo?.primaryUpiId && (orderData.balance || 0) > 0 && (
                                        <div className="flex flex-col items-center">
                                            <p className="text-[10px] font-bold mb-1">Scan to Pay Balance</p>
                                            <QRCodeSVG value={`upi://pay?pa=${companyInfo.primaryUpiId}&pn=${encodeURIComponent(companyInfo.companyName || '')}&am=${orderData.balance?.toFixed(2)}&cu=INR`} size={64} />
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

