
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Loader2, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { QRCodeSVG } from 'qrcode.react';
import Image from 'next/image';
import { useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { CompanyInfo, SalesInvoice, Party } from '@/lib/types';
import { format } from 'date-fns';

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

export default function GatePassPage() {
    const searchParams = useSearchParams();
    const orderNumber = searchParams.get('id'); // This is the Sales Order number
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    
    const firestore = useFirestore();
    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
    
    // We need to find the invoice that corresponds to this order number
    const [invoiceData, setInvoiceData] = React.useState<SalesInvoice | null>(null);
    const [partyData, setPartyData] = React.useState<Party | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        if (orderNumber && firestore) {
            const findInvoice = async () => {
                setIsLoading(true);
                const invoicesRef = collection(firestore, 'salesInvoices');
                const q = query(invoicesRef, where('orderNumber', '==', orderNumber), limit(1));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const invoiceDoc = querySnapshot.docs[0];
                    const invoice = { id: invoiceDoc.id, ...invoiceDoc.data() } as SalesInvoice;
                    setInvoiceData(invoice);

                    // Now fetch the party using the customerId from the invoice
                    const partyRef = doc(firestore, 'parties', invoice.customerId);
                    const partySnap = await getDoc(partyRef);
                    if (partySnap.exists()) {
                        setPartyData(partySnap.data() as Party);
                    }
                }
                setIsLoading(false);
            };
            findInvoice();
        } else {
            setIsLoading(false);
        }
    }, [orderNumber, firestore]);

    const handleDownloadPdf = async () => {
        const element = pdfRef.current;
        if (!element) return;
        setIsDownloading(true);
        const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`GatePass-${orderNumber}.pdf`);
        setIsDownloading(false);
    };

    const loading = companyInfoLoading || isLoading;
    
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8" />
            </div>
        )
    }

    if (!invoiceData) {
        return (
             <div className="p-8 text-center space-y-4">
                <h1 className="text-2xl font-bold text-destructive">Gate Pass Data Not Found</h1>
                <p className="text-muted-foreground">Could not load the delivery details for order {orderNumber}.</p>
            </div>
        )
    }

    const { deliveryDetails, items } = invoiceData;

    return (
        <>
            <PageHeader title={`Gate Pass for Order: ${orderData.orderNumber}`}>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => window.print()}>
                        <Printer className="mr-2 h-4 w-4" /> Print
                    </Button>
                    <Button onClick={handleDownloadPdf} disabled={isDownloading}>
                        {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                    </Button>
                </div>
            </PageHeader>
            <Card>
                <CardContent>
                    <div className="max-w-4xl mx-auto p-8 font-sans" ref={pdfRef}>
                        <header className="flex justify-between items-start border-b pb-4">
                            <div>
                                {companyInfo?.logo && <Image src={companyInfo.logo} alt="Logo" width={150} height={40} crossOrigin="anonymous" />}
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-bold text-primary">Delivery Note / Gate Pass</h1>
                                <p><strong>Order No:</strong> {orderData.orderNumber}</p>
                                <p><strong>Date:</strong> {format(new Date(), 'dd/MM/yyyy')}</p>
                            </div>
                        </header>
                        
                        <section className="my-6 grid grid-cols-2 gap-4">
                             <div>
                                <h3 className="font-semibold text-sm">Deliver To:</h3>
                                <p className="font-bold">{deliveryDetails?.customerName || partyData?.name}</p>
                                <p className="text-sm">{deliveryDetails?.shippingAddress || [partyData?.address?.line1, partyData?.address?.line2, partyData?.address?.city].filter(Boolean).join(', ')}</p>
                            </div>
                            <div className="text-right">
                                <h3 className="font-semibold text-sm">Shipping Details:</h3>
                                <p className="text-sm"><strong>Method:</strong> {deliveryDetails?.shippingMethod}</p>
                                <p className="text-sm"><strong>Vehicle:</strong> {deliveryDetails?.vehicleNumber}</p>
                                <p className="text-sm"><strong>Driver:</strong> {deliveryDetails?.driverName} ({deliveryDetails?.driverPhone})</p>
                            </div>
                        </section>

                        <section>
                            <h3 className="font-semibold text-lg mb-2">Items for Dispatch</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Sr.</TableHead>
                                        <TableHead>Item Name</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item, index) => (
                                        <TableRow key={item.productId}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </section>
                        
                        <footer className="mt-16 flex justify-between items-end">
                            <div className="text-xs space-y-4">
                               <p className="text-muted-foreground">Goods are received in good condition.</p>
                                <div className="pt-12">
                                    <Separator className="w-48"/>
                                    <p className="pt-1 font-semibold">Receiver's Signature</p>
                                </div>
                            </div>
                             <div className="flex flex-col items-center">
                                <QRCodeSVG value={`GATEPASS:${orderData.orderNumber}`} size={80} />
                                <p className="text-xs mt-2">Scan for Gate Out</p>
                            </div>
                            <div className="text-right">
                                <p className="font-semibold mb-12">For, {companyInfo?.companyName}</p>
                                <div className="h-16 w-32"></div>
                                <Separator />
                                <p className="text-xs pt-1">Authorized Signatory</p>
                            </div>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
