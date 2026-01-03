
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
import { Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { initialTemplates, users } from '@/lib/data';
import { products } from '@/lib/product-data';

const companyDetails = {
  name: 'JXN Infra Equipment Private Limited',
  address: {
    line1: '123 Industrial Area',
    line2: 'BizTown',
    city: 'Metropolis',
    pin: '12345',
  },
  logo: 'https://placehold.co/350x80/eee/ccc.png?text=Your+Logo',
};

// This would typically be fetched based on the ID
const assignmentData = {
    id: 'assign-1',
    productId: 'prod_1',
    productName: 'Ergonomic Office Chair',
    templateId: 'template-1',
    templateName: 'Chair Assembly',
    assigneeId: 'usr-3',
    assigneeName: 'Isabella Nguyen',
    standardDuration: 30,
    status: 'In Progress',
    createdAt: new Date().toISOString(),
};

export default function ProductionTaskViewPage() {
    const searchParams = useSearchParams();
    const assignmentId = searchParams.get('id');
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);

    const template = initialTemplates.find(t => t.id === assignmentData.templateId);

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
        pdf.save(`Task-Assignment-${assignmentData.id}.pdf`);
        setIsDownloading(false);
    };

    if (!assignmentId) {
        return <PageHeader title="Assignment Not Found" />;
    }

    return (
        <>
            <PageHeader title={`Task Assignment: ${assignmentId}`}>
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
                                <h1 className="text-2xl font-bold text-primary">{companyDetails.name}</h1>
                                <p className="text-sm text-muted-foreground">{companyDetails.address.line1}, {companyDetails.address.line2}, {companyDetails.address.city} - {companyDetails.address.pin}</p>
                            </div>
                        </header>

                        <section className="my-6">
                             <div className="text-center mb-4">
                                <h2 className="text-xl font-semibold underline">PRODUCTION TASK ASSIGNMENT</h2>
                            </div>
                            <div className="p-4 border rounded-md grid grid-cols-3 gap-4">
                                <p><strong>Product Name:</strong> {assignmentData.productName}</p>
                                <p><strong>Assignment ID:</strong> {assignmentData.id}</p>
                                <p><strong>Total Standard Duration:</strong> {assignmentData.standardDuration} minutes</p>
                            </div>
                        </section>

                        <section>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted">
                                        <TableHead>Task Template Name</TableHead>
                                        <TableHead>Assign To</TableHead>
                                        <TableHead>Standard Duration (Minutes)</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Unit #</TableHead>
                                        <TableHead>Work Station</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {template && (
                                        <TableRow>
                                            <TableCell>{assignmentData.templateName}</TableCell>
                                            <TableCell>{assignmentData.assigneeName}</TableCell>
                                            <TableCell>{assignmentData.standardDuration}</TableCell>
                                            <TableCell>{template.department}</TableCell>
                                            <TableCell>{template.unit}</TableCell>
                                            <TableCell>{template.workstation}</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </section>
                        
                        <footer className="text-center text-xs text-muted-foreground pt-16">
                            <p>This is a system-generated document.</p>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
