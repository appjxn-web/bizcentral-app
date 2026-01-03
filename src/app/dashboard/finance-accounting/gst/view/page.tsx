

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

interface GstTransaction {
  id: string;
  date: string;
  invoiceNo: string;
  partyName: string;
  gstin: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  totalAmount: number;
}


const companyDetails = {
  name: 'JXN Infra Equipment Private Limited',
  logo: 'https://placehold.co/350x80/eee/ccc.png?text=Your+Logo',
};

export default function GstReportViewPage() {
    const searchParams = useSearchParams();
    const year = searchParams.get('year') || new Date().getFullYear().toString();
    const month = searchParams.get('month') || (new Date().getMonth() + 1).toString();
    const pdfRef = React.useRef<HTMLDivElement>(null);
    const [isDownloading, setIsDownloading] = React.useState(false);
    
    const [reportData, setReportData] = React.useState<{gstr1: GstTransaction[], gstr2b: GstTransaction[], kpis: any, period: string} | null>(null);

    React.useEffect(() => {
        const data = localStorage.getItem('gstReportData');
        if (data) {
            setReportData(JSON.parse(data));
        }
    }, []);


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
        pdf.save(`GST-Report-${month}-${year}.pdf`);
        setIsDownloading(false);
    };

    const GstTable = ({ data, title }: { data: GstTransaction[], title: string }) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{title === 'Sales' ? 'Invoice No.' : 'Bill No.'}</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Party Name</TableHead>
              <TableHead className="text-right">Taxable Value</TableHead>
              <TableHead className="text-right">Total Tax</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length > 0 ? data.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.invoiceNo}</TableCell>
                <TableCell>{format(new Date(item.date), 'dd/MM/yyyy')}</TableCell>
                <TableCell>{item.partyName}</TableCell>
                <TableCell className="text-right font-mono">₹{item.taxableValue.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">₹{item.totalGst.toFixed(2)}</TableCell>
              </TableRow>
            )) : (
                <TableRow><TableCell colSpan={5} className="text-center h-24">No data for this period.</TableCell></TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
                <TableCell colSpan={3} className="font-bold">Total</TableCell>
                <TableCell className="text-right font-bold font-mono">₹{data.reduce((sum, i) => sum + i.taxableValue, 0).toFixed(2)}</TableCell>
                <TableCell className="text-right font-bold font-mono">₹{data.reduce((sum, i) => sum + i.totalGst, 0).toFixed(2)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      );
    
    if (!reportData) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-2">Loading report data...</p>
            </div>
        )
    }

    const { gstr1, gstr2b, kpis } = reportData;

    return (
        <>
            <PageHeader title={`GST Report`}>
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
                                <h1 className="text-2xl font-bold text-primary">GST Summary Report</h1>
                                <p><strong>Period:</strong> {new Date(parseInt(year), parseInt(month)-1).toLocaleString('default', { month: 'long' })} {year}</p>
                            </div>
                        </header>

                        <section className="my-8">
                             <h2 className="text-lg font-semibold mb-2">Outward Supplies (GSTR-1)</h2>
                             <GstTable data={gstr1} title="Sales" />
                        </section>
                        
                        <section className="my-8">
                            <h2 className="text-lg font-semibold mb-2">Inward Supplies (GSTR-2B)</h2>
                            <GstTable data={gstr2b} title="Purchases" />
                        </section>
                        
                        <Separator className="my-6" />

                        <section className="my-8">
                            <h2 className="text-lg font-semibold mb-2">GSTR-3B Summary</h2>
                             <Table>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="font-medium">Total Tax on Outward Supplies (A)</TableCell>
                                        <TableCell className="text-right font-mono">₹{kpis.taxOnSales.toFixed(2)}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium">Eligible Input Tax Credit (B)</TableCell>
                                        <TableCell className="text-right font-mono">₹{kpis.inputTaxCredit.toFixed(2)}</TableCell>
                                    </TableRow>
                                     <TableRow className="bg-muted text-base">
                                        <TableCell className="font-bold">Net GST Payable (A - B)</TableCell>
                                        <TableCell className="text-right font-bold font-mono">₹{kpis.netGstPayable.toFixed(2)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </section>
                        
                        <footer className="text-center text-xs text-muted-foreground pt-16">
                            <p>This is a system-generated document for review purposes only.</p>
                        </footer>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
