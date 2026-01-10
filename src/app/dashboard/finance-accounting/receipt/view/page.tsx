
'use client';

import * as React from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Loader2, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { CompanyInfo, JournalVoucher, Party } from '@/lib/types';

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
    if (number === 0) return 'Zero Rupees Only.';

    const integerPart = Math.floor(number);
    let words = '';
    
    const numToWordsRecursive = (n: number): string => {
        let str = '';
        if (n >= 10000000) { str += numToWordsRecursive(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
        if (n >= 100000) { str += numToWordsRecursive(Math.floor(n / 100000)) + ' Lakh '; n %= 100000; }
        if (n >= 1000) { str += numToWordsRecursive(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
        if (n >= 100) { str += a[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
        if (n > 0) {
            if (n < 20) str += a[n] + ' ';
            else { str += b[Math.floor(n / 20)] + ' ' + a[n % 10] + ' '; }
        }
        return str;
    };
    words = numToWordsRecursive(integerPart);
    
    return (words.trim() + ' Rupees Only.').replace(/\s+/g, ' ');
};


export default function ReceiptViewPage() {
  const [receiptData, setReceiptData] = React.useState<any>(null);
  const pdfRef = React.useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);
  
  const firestore = useFirestore();
  const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
  
  React.useEffect(() => {
    const data = localStorage.getItem('receiptToPrint');
    if (data) {
      setReceiptData(JSON.parse(data));
      // Optional: Clear the data after reading to prevent re-opening
      // localStorage.removeItem('receiptToPrint');
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
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Receipt-${receiptData.id}.pdf`);
    setIsDownloading(false);
  };

  if (!receiptData || companyInfoLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
        <p className="ml-2">Loading Receipt...</p>
      </div>
    );
  }

  const companyAddress = companyInfo?.addresses?.[0];

  return (
    <>
      <PageHeader title={`Receipt: ${receiptData.id}`}>
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
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
              <div>{companyInfo?.logo && <Image src={companyInfo.logo} alt="Logo" width={175} height={40} crossOrigin="anonymous" />}</div>
              <div className="text-right">
                <h1 className="text-2xl font-bold text-primary">{companyInfo?.companyName}</h1>
                <p className="text-sm text-muted-foreground">
                  {[companyAddress?.line1, companyAddress?.line2].filter(Boolean).join(', ')}
                </p>
                <p className="text-sm text-muted-foreground">{companyAddress?.city} - {companyAddress?.pin}</p>
                <p className="text-sm text-muted-foreground">GSTIN: {companyInfo?.taxInfo?.gstin?.value}</p>
              </div>
            </header>

            <section className="my-6">
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold underline">PAYMENT RECEIPT</h2>
              </div>
              <div className="flex justify-between text-sm">
                <p><strong>Receipt No:</strong> {receiptData.id}</p>
                <p><strong>Date:</strong> {format(new Date(receiptData.date), 'dd/MM/yyyy')}</p>
              </div>
            </section>

            <section className="my-8 text-sm">
                <p>
                    Received with thanks from <span className="font-bold">{receiptData.partyName}</span> a sum of <span className="font-bold">{formatIndianCurrency(receiptData.amount)}</span> ({numberToWords(receiptData.amount)})
                </p>
                 <p className="mt-2">
                    on account of: <span className="italic">{receiptData.narration}</span>.
                </p>
            </section>

            <footer className="mt-16 flex justify-between items-end">
                <div className="text-xs">
                    <p className="font-bold">This is a computer-generated receipt and does not require a signature.</p>
                </div>
                <div className="text-right">
                    <p className="font-semibold mb-16">For, {companyInfo?.companyName}</p>
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

