
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
import type { Order, CompanyInfo, PickupPoint, SalesOrder } from '@/lib/types';
import { useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { format } from 'date-fns';

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

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

function PartnerPickupDetails({ pickupPointId }: { pickupPointId: string }) {
    const firestore = useFirestore();
    const pickupPointRef = pickupPointId ? doc(firestore, 'pickupPoints', pickupPointId) : null;
    const { data: pickupPoint, loading } = useDoc<PickupPoint>(pickupPointRef);

    if (loading) return <p className="text-sm text-muted-foreground">Loading details...</p>;
    if (!pickupPoint) return <p className="text-sm text-destructive">Could not load partner details.</p>;
    
    const addressString = pickupPoint.addressLine || '';
    let mapUrl = addressString ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressString)}` : '';
    if (pickupPoint.lat && pickupPoint.lng) {
        mapUrl = `https://www.google.com/maps/search/?api=1&query=${pickupPoint.lat},${pickupPoint.lng}`;
    }

    return (
        <>
            <p className="font-medium">{pickupPoint.name}</p>
            <p className="text-xs text-muted-foreground">Partner</p>
            {addressString && <p className="mt-2 text-sm">{addressString}</p>}
            <div className="flex gap-4 mt-2">
                {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm"><MapPin className="h-4 w-4" /> Get Directions</a>}
            </div>
        </>
    );
}

function CompanyPickupDetails() {
    const { data: companyInfo, loading } = useDoc<any>(doc(useFirestore(), 'company', 'info'));
    
    if (loading) return <p className="text-sm text-muted-foreground">Loading details...</p>;
    if (!companyInfo) return <p className="text-sm text-destructive">Could not load company details.</p>;

    const mainAddress = companyInfo.addresses?.find((a: any) => a.type === 'Main Office' || a.type === 'Registered Office') || companyInfo.addresses?.[0];

    if (!mainAddress) return <p className="text-sm text-destructive">Main company address not found.</p>;

    const addressString = [mainAddress.line1, mainAddress.line2, mainAddress.city, mainAddress.state, mainAddress.pin].filter(Boolean).join(', ');
    const phone = mainAddress.pickupContactPhone || companyInfo.contactNumber;
    let mapUrl = addressString ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressString)}` : '';
    if (mainAddress.latitude && mainAddress.longitude) {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${mainAddress.latitude},${mainAddress.longitude}`;
    }
    
    return (
        <>
            <p className="font-medium">{mainAddress.pickupContactName || companyInfo.companyName}</p>
            <p className="text-xs text-muted-foreground">Main Office / Factory</p>
            {addressString && <p className="mt-2 text-sm">{addressString}</p>}
            <div className="flex gap-4 mt-2">
                {phone && <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary hover:underline text-sm"><Phone className="h-4 w-4" /> Call</a>}
                {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-sm"><MapPin className="h-4 w-4" /> Get Directions</a>}
            </div>
        </>
    );
}

export default function SalesOrderViewPage() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    const firestore = useFirestore();
    const orderRef = orderId ? doc(firestore, 'orders', orderId) : null;
    const { data: orderData, loading } = useDoc<SalesOrder>(orderRef);
    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
    
    const isInterstate = false; // Simplified for now
    
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

    if (!orderId) {
        return <PageHeader title="Order Not Found" />;
    }
    
    if (loading || companyInfoLoading) {
        return (
             <PageHeader title="Loading Order...">
                <div className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                </div>
            </PageHeader>
        )
    }

    if (!orderData) {
        notFound();
    }
    
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
                                {companyInfo?.logo && <Image src={companyInfo.logo} alt="Company Logo" width={175} height={40} className="object-contain" />}
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-bold text-primary">Sales Order</h1>
                                <p><strong>Order No:</strong> {orderData.orderNumber}</p>
                                <p><strong>Date:</strong> {format(new Date(orderData.date), 'dd/MM/yyyy')}</p>
                            </div>
                        </header>

                        <section className="my-6">
                            <div className="flex justify-between">
                                <div>
                                    <h3 className="font-semibold">Customer:</h3>
                                    <p className="font-bold">{orderData.customerName}</p>
                                    <p>{orderData.customerEmail}</p>
                                </div>
                                <div>
                                    <h3 className="font-semibold">Pickup From:</h3>
                                    <div className="text-sm">
                                      {orderData.pickupPointId && orderData.pickupPointId !== 'company-main' ? (
                                          <PartnerPickupDetails pickupPointId={orderData.pickupPointId} />
                                      ) : (
                                          <CompanyPickupDetails />
                                      )}
                                    </div>
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
                                    {orderData.items.map((item: any, index: number) => (
                                        <TableRow key={`${item.productId}-${index}`}>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(item.price)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatIndianCurrency(item.price * item.quantity)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-semibold">Subtotal</TableCell>
                                        <TableCell className="text-right font-semibold">{formatIndianCurrency(orderData.subtotal)}</TableCell>
                                    </TableRow>
                                    {isInterstate ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right">IGST (18%)</TableCell>
                                            <TableCell className="text-right">{formatIndianCurrency(orderData.subtotal * 0.18)}</TableCell>
                                        </TableRow>
                                    ) : (
                                        <>
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right">CGST (9%)</TableCell>
                                                <TableCell className="text-right">{formatIndianCurrency(orderData.cgst)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right">SGST (9%)</TableCell>
                                                <TableCell className="text-right">{formatIndianCurrency(orderData.sgst)}</TableCell>
                                            </TableRow>
                                        </>
                                    )}
                                    <TableRow className="text-base bg-muted">
                                        <TableCell colSpan={3} className="text-right font-bold">Grand Total</TableCell>
                                        <TableCell className="text-right font-bold">{formatIndianCurrency(orderData.grandTotal)}</TableCell>
                                    </TableRow>
                                     <TableRow>
                                        <TableCell colSpan={3} className="text-right font-semibold">Amount Paid</TableCell>
                                        <TableCell className="text-right font-semibold text-green-600">{formatIndianCurrency(orderData.paymentReceived || 0)}</TableCell>
                                    </TableRow>
                                     <TableRow className="text-base">
                                        <TableCell colSpan={3} className="text-right font-bold">Balance Due</TableCell>
                                        <TableCell className="text-right font-bold text-red-600">{formatIndianCurrency(orderData.balance || orderData.grandTotal)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </section>
                        
                         <div className="text-right my-2 text-sm font-semibold">
                            Amount in words: {numberToWords(orderData.grandTotal)}
                        </div>
                        
                         <div className="my-4 text-sm">
                            <p className="font-semibold">Payment Details:</p>
                            <p className="text-muted-foreground">{orderData.paymentDetails || 'No details provided.'}</p>
                        </div>


                        <footer className="flex justify-between items-end mt-16">
                            <div className="text-xs space-y-4">
                                <h4 className="font-bold mb-1">Terms & Conditions:</h4>
                                <ul className="list-disc list-inside text-muted-foreground">
                                    <li>Goods once sold will not be taken back.</li>
                                    <li>Interest @ 18% p.a. will be charged if payment is not made within the due date.</li>
                                </ul>
                            </div>
                            <div className="text-right">
                                <p className="font-semibold mb-16">For, {companyInfo?.companyName}</p>
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
