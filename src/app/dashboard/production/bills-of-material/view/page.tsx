

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Download, Loader2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { boms as allBoms } from '@/lib/bom-data';
import { products } from '@/lib/product-data';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

export default function ViewBomPage() {
    const searchParams = useSearchParams();
    const bomId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);

    const bom = React.useMemo(() => {
        return allBoms.find(b => b.id === bomId);
    }, [bomId]);

    const finishedProduct = React.useMemo(() => {
        if (!bom) return null;
        return products.find(p => p.id === bom.productId);
    }, [bom]);
    
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
        pdf.save(`BOM-${bom?.id}.pdf`);
        setIsDownloading(false);
    };

    if (!bomId) {
        return <PageHeader title="BOM Not Found" />;
    }

    if (!bom || !finishedProduct) {
        notFound();
    }

    const assemblyItems = bom.items.filter(item => item.productName.includes('Assembly'));
    const componentItems = bom.items.filter(item => !item.productName.includes('Assembly'));
    const totalCost = bom.items.reduce((acc, item) => acc + (item.amount || 0), 0);

    return (
        <>
            <PageHeader title={`Bill of Material: ${bom.id}`}>
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
                                <h1 className="text-2xl font-bold text-primary">Bill of Material</h1>
                                <p className="text-sm text-muted-foreground">BOM ID: {bom.id}</p>
                            </div>
                            <div className="text-right">
                                <p><strong>Created At:</strong> {format(new Date(bom.createdAt), 'dd/MM/yyyy')}</p>
                            </div>
                        </header>

                        <section className="my-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Finished Product</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4">
                                        <p><strong>Product Name:</strong> {finishedProduct.name}</p>
                                        <p><strong>Product ID:</strong> {finishedProduct.id}</p>
                                        <p><strong>Category:</strong> {finishedProduct.category}</p>
                                        <p><strong>Type:</strong> {finishedProduct.type}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </section>
                        
                        <Separator className="my-6" />

                        {componentItems.length > 0 && (
                            <section>
                                <h3 className="text-lg font-semibold mb-2">Components & Raw Materials</h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Component Name</TableHead>
                                            <TableHead>Part # / Dwg. #</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead>Unit</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {componentItems.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.productName}</TableCell>
                                                <TableCell>{item.partNumber || 'N/A'}</TableCell>
                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                <TableCell>{item.unit}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </section>
                        )}
                        
                        {assemblyItems.length > 0 && (
                            <section className="mt-6">
                                <h3 className="text-lg font-semibold mb-2">Sub-Assemblies</h3>
                                 <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Assembly Name</TableHead>
                                            <TableHead>BOM #</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead>Unit</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {assemblyItems.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.productName}</TableCell>
                                                <TableCell>{allBoms.find(b => b.productId === item.productId)?.id || 'N/A'}</TableCell>
                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                <TableCell>{item.unit}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </section>
                        )}
                        
                        {bom.qcCheckPoints && bom.qcCheckPoints.length > 0 && (
                            <section className="mt-6">
                                <h3 className="text-lg font-semibold mb-2">Quality Control Check Points</h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Check Point</TableHead>
                                            <TableHead>Method</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {bom.qcCheckPoints.map(qc => (
                                            <TableRow key={qc.id}>
                                                <TableCell>{qc.checkPoint}</TableCell>
                                                <TableCell>{qc.method}</TableCell>
                                                <TableCell>{qc.details}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </section>
                        )}

                        <footer className="text-center text-xs text-muted-foreground pt-16">
                            <p>This is a system-generated document.</p>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
