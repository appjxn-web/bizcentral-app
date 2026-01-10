

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
} from '@/components/ui/table';
import { Download, Loader2, ArrowLeft, Printer, Phone, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { collection, query, where, doc, getDocs, limit, getDoc } from 'firebase/firestore';
import type { StockTransferRequest, CompanyInfo, Party, Address, UserProfile } from '@/lib/types';


const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

export default function GatePassPage() {
    const searchParams = useSearchParams();
    const requestId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    
    const firestore = useFirestore();
    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
    
    const requestRef = requestId ? doc(firestore, 'stockTransferRequests', requestId) : null;
    const { data: request, loading: requestLoading } = useDoc<StockTransferRequest>(requestRef);

    const { data: partyData, loading: partnerLoading } = useDoc<Party>(
        request?.partnerId ? doc(firestore, 'parties', request.partnerId) : null
    );

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
        pdf.save(`GatePass-${request?.id}.pdf`);
        setIsDownloading(false);
    };

    const loading = companyInfoLoading || requestLoading || partnerLoading;
    
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8" />
            </div>
        )
    }

    if (!request) {
        return (
             <div className="p-8 text-center space-y-4">
                <h1 className="text-2xl font-bold text-destructive">Request Data Not Found</h1>
                <p className="text-muted-foreground">Could not load the details for request {requestId}.</p>
            </div>
        )
    }
    
    const { shippingDetails, items } = request as any;
    const customerAddress = (partyData?.address as Address);

    return (
        <>
            <PageHeader title={`Gate Pass for Request: ${requestId}`}>
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
                                {companyInfo?.logo && <Image src={companyInfo.logo} alt="Logo" width={175} height={40} crossOrigin="anonymous" />}
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-bold text-primary">{companyInfo?.companyName}</h1>
                                {companyInfo?.addresses?.[0] && (
                                    <p className="text-sm text-muted-foreground">
                                    {[companyInfo.addresses[0].line1, companyInfo.addresses[0].line2, companyInfo.addresses[0].city, companyInfo.addresses[0].pin].filter(Boolean).join(', ')}
                                    </p>
                                )}
                                <div className="text-xs mt-2">
                                    {companyInfo?.taxInfo?.gstin?.value && <p><strong>GSTIN:</strong> {companyInfo.taxInfo.gstin.value}</p>}
                                    {companyInfo?.taxInfo?.cin?.value && <p><strong>CIN:</strong> {companyInfo.taxInfo.cin.value}</p>}
                                </div>
                            </div>
                        </header>
                        
                        <section className="my-6">
                             <h2 className="text-right text-lg font-bold mb-4 underline">GATE PASS / STOCK TRANSFER</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h3 className="font-semibold text-sm">Dispatch To:</h3>
                                    <p className="font-bold">{(partyData as UserProfile)?.businessName || partyData?.name || request.partnerName}</p>
                                    {customerAddress && (
                                        <p className="text-sm">
                                            {[customerAddress.line1, customerAddress.line2, customerAddress.city, customerAddress.state, customerAddress.pin].filter(Boolean).join(', ')}
                                        </p>
                                    )}
                                    {partyData?.contactPerson && (
                                    <p className="text-sm"><strong>Attn:</strong> {partyData.contactPerson}</p>
                                    )}
                                    {partyData?.phone && (
                                    <p className="text-sm"><strong>Phone:</strong> {partyData.phone}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <h3 className="font-semibold text-sm">Shipping Details:</h3>
                                    <p className="text-sm"><strong>Vehicle:</strong> {shippingDetails?.vehicleNo}</p>
                                    <p className="text-sm"><strong>Driver:</strong> {shippingDetails?.driverName} ({shippingDetails?.driverPhone})</p>
                                </div>
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
                                    {items.map((item: any, index: number) => (
                                        <TableRow key={item.productId}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{item.productName}</TableCell>
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
                                    <div className="border-t border-slate-900 w-48"/>
                                    <p className="pt-1 font-semibold">Receiver's Signature</p>
                                </div>
                            </div>
                             <div className="flex flex-col items-center">
                                <QRCodeSVG value={`GATEPASS:${request.id}`} size={80} />
                                <p className="text-xs mt-2">Scan for Gate Out</p>
                            </div>
                            <div className="text-right">
                                <p className="font-semibold mb-12">For, {companyInfo?.companyName}</p>
                                <div className="h-16 w-32"></div>
                                <div className="border-t border-slate-900"/>
                                <p className="text-xs pt-1">Authorized Signatory</p>
                            </div>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
