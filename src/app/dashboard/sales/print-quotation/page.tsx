

'use client';

import * as React from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

const quotationData = {
  id: 'QU-2023-001',
  date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD
  customer: {
    name: 'Innovate Logistics',
    address: {
        line1: '456 Venture Drive',
        line2: 'Innovation City',
        city: 'Metropolis',
        pin: '54321',
        district: 'Central District',
        state: 'StateName',
        country: 'India',
        digitalPin: '1234'
    },
    contact: {
        email: 'contact@innovatelogistics.com',
        phone: '+1-555-123-4567'
    },
    gstin: '29ABCDE1234F1Z5',
  },
  items: [
    { id: '1', srNo: 1, name: 'Ergonomic Office Chair', hsn: '9401', qty: 10, unit: 'pcs', discount: 5, rate: 299.99, gstRate: 18 },
    { id: '2', srNo: 2, name: 'Adjustable Standing Desk', hsn: '9403', qty: 5, unit: 'pcs', discount: 0, rate: 499.99, gstRate: 18 },
    { id: '3', srNo: 3, name: '4K Ultra-Wide Monitor', hsn: '8528', qty: 10, unit: 'pcs', discount: 10, rate: 799.99, gstRate: 28 },
  ],
  createdBy: 'Olivia Martin',
  terms: '50% advance payment required. Delivery within 15 working days. Warranty: 1 year on all products.',
  bookingAmount: 5000,
};

const companyDetails = {
  name: 'JXN Infra Equipment Private Limited',
  address: {
    line1: '123 Industrial Area',
    line2: 'BizTown',
    city: 'Metropolis',
    pin: '12345',
    district: 'Central District',
    state: 'StateName',
    country: 'India',
    digitalPin: '9876'
  },
  contact: {
    email: 'contact@jxninfra.com',
    phone: '+91-9876543210',
    website: 'www.jxninfra.com'
  },
  gstin: '08AAFCJ5369P1ZR',
  cin: 'U29307RJ2022PTC080243',
  logo: 'https://placehold.co/350x80/eee/ccc.png?text=Your+Logo',
  bankDetails: {
    name: 'State Bank of India',
    accountNo: '12345678901',
    ifsc: 'SBIN0001234',
    branch: 'Industrial Area Branch',
  },
  upiQrCode: 'https://placehold.co/120x120/eee/ccc.png?text=UPI+QR'
};


const numberToWords = (num: number): string => {
    // This is a simplified version. A full version would be more complex.
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const number = parseFloat(num.toFixed(2));
    if (isNaN(number)) return '';
    if (number === 0) return 'zero';

    const [integerPart, decimalPart] = number.toString().split('.');
    
    let words = '';
    // This simplified function only handles up to thousands.
    // A production-ready function would need to handle lakhs, crores, etc.
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
    maximumFractionDigits: 2,
  }).format(num);
};

export default function QuotationViewPage() {
    const searchParams = useSearchParams();
    const quotationId = searchParams.get('id');

  const isInterstate = !companyDetails.gstin.startsWith(quotationData.customer.gstin.substring(0, 2));

  const calculations = React.useMemo(() => {
    let subtotal = 0;
    let totalGst = 0;
    let totalDiscount = 0;
    
    const items = quotationData.items.map(item => {
        const totalAmountBeforeDiscount = item.rate * item.qty;
        const discountAmount = totalAmountBeforeDiscount * (item.discount / 100);
        totalDiscount += discountAmount;

        const discountedRate = item.rate * (1 - item.discount / 100);
        const amount = item.qty * discountedRate;
        const gstAmount = amount * (item.gstRate / 100);
        subtotal += amount;
        totalGst += gstAmount;
        return { ...item, discountedRate, amount, gstAmount };
    });

    const grandTotal = subtotal + totalGst;
    const cgst = isInterstate ? 0 : totalGst / 2;
    const sgst = isInterstate ? 0 : totalGst / 2;
    const igst = isInterstate ? totalGst : 0;
    
    return { items, subtotal, cgst, sgst, igst, grandTotal, totalDiscount };
  }, [isInterstate]);

  // If no quotation is found (in a real app), show a message
  if (!quotationId) {
      return (
        <>
            <PageHeader title="Quotation Not Found" />
            <p>The requested quotation could not be found.</p>
        </>
      )
  }

  return (
    <>
    <PageHeader title={`Quotation: ${quotationId}`} />
      <Card className="p-8 print-container mx-auto max-w-4xl">
        {/* Header */}
        <header className="flex justify-between items-start border-b pb-4">
            <div className="flex items-center gap-4">
                <Image src={companyDetails.logo} alt="Company Logo" width={175} height={40} className="object-contain" />
            </div>
            <div className="text-right">
                <h1 className="text-2xl font-bold text-primary">{companyDetails.name}</h1>
                <p className="text-sm text-muted-foreground">{companyDetails.address.line1}, {companyDetails.address.line2}</p>
                <p className="text-sm text-muted-foreground">{companyDetails.address.city} - {companyDetails.address.pin}, {companyDetails.address.district}, {companyDetails.address.state}, {companyDetails.address.country}</p>
                <p className="text-sm text-muted-foreground">{companyDetails.contact.email} | {companyDetails.contact.phone} | {companyDetails.contact.website}</p>
                <div className="text-sm mt-2">
                    <p><strong>GSTIN:</strong> {companyDetails.gstin}</p>
                    <p><strong>CIN:</strong> {companyDetails.cin}</p>
                </div>
            </div>
        </header>

        {/* Quotation Details */}
        <section className="my-6">
            <h2 className="text-right text-xl font-semibold mb-4 underline">QUOTATION</h2>
            <div className="flex justify-between">
                <div>
                    <h3 className="font-semibold">Billed To:</h3>
                    <p className="font-bold">{quotationData.customer.name}</p>
                    <p>{quotationData.customer.address.line1}, {quotationData.customer.address.line2}</p>
                    <p>{quotationData.customer.address.city} - {quotationData.customer.address.pin}, {quotationData.customer.address.district}, {quotationData.customer.address.state}, {quotationData.customer.address.country}</p>
                    <p>{quotationData.customer.contact.email} | {quotationData.customer.contact.phone}</p>
                    <p>GSTIN: {quotationData.customer.gstin}</p>
                </div>
                <div className="text-right">
                    <p><strong>Quotation No:</strong> {quotationData.id}</p>
                    <p><strong>Date:</strong> {new Date(quotationData.date).toLocaleDateString()}</p>
                </div>
            </div>
        </section>

        {/* Items Table */}
        <section>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted">
                <TableHead className="w-[50px]">Sr. No.</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">QTY</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Disc. (%)</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">GST (%)</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculations.items.map(item => (
                <TableRow key={item.id}>
                    <TableCell>{item.srNo}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.hsn}</TableCell>
                    <TableCell className="text-right">{item.qty}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-right">{item.discount}%</TableCell>
                    <TableCell className="text-right">{formatIndianCurrency(item.rate)}</TableCell>
                    <TableCell className="text-right">{item.gstRate}%</TableCell>
                    <TableCell className="text-right font-medium">{formatIndianCurrency(item.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={8} className="text-right font-bold">Subtotal</TableCell>
                    <TableCell className="text-right font-bold">{formatIndianCurrency(calculations.subtotal)}</TableCell>
                </TableRow>
                {isInterstate ? (
                    <TableRow>
                        <TableCell colSpan={8} className="text-right">IGST</TableCell>
                        <TableCell className="text-right">{formatIndianCurrency(calculations.igst)}</TableCell>
                    </TableRow>
                ) : (
                    <>
                        <TableRow>
                            <TableCell colSpan={8} className="text-right">CGST</TableCell>
                            <TableCell className="text-right">{formatIndianCurrency(calculations.cgst)}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell colSpan={8} className="text-right">SGST</TableCell>
                            <TableCell className="text-right">{formatIndianCurrency(calculations.sgst)}</TableCell>
                        </TableRow>
                    </>
                )}
                 <TableRow className="text-lg bg-muted">
                    <TableCell colSpan={4} className="text-left font-bold text-green-600">Your total saving on this order is {formatIndianCurrency(calculations.totalDiscount)}</TableCell>
                    <TableCell colSpan={4} className="text-right font-bold">Grand Total</TableCell>
                    <TableCell className="text-right font-bold">{formatIndianCurrency(calculations.grandTotal)}</TableCell>
                </TableRow>
            </TableFooter>
          </Table>
        </section>
        
        <div className="text-right my-2 text-sm font-semibold">
          Amount in words: {numberToWords(calculations.grandTotal)}
        </div>

        <Separator className="my-6" />

        {/* Footer */}
        <footer className="flex justify-between items-end mt-16">
            <div className="text-xs space-y-4">
                <div>
                    <h4 className="font-bold mb-1">Terms & Conditions:</h4>
                    <div className="text-muted-foreground min-h-[4.5rem]">{quotationData.terms}</div>
                </div>
                 <div className="flex gap-4">
                    <div>
                        <h4 className="font-bold mb-1">Bank Details for Booking Payment ({formatIndianCurrency(quotationData.bookingAmount)}):</h4>
                        <div className="text-muted-foreground">
                            <p><strong>Bank:</strong> {companyDetails.bankDetails.name}</p>
                            <p><strong>Account No:</strong> {companyDetails.bankDetails.accountNo}</p>
                            <p><strong>IFSC:</strong> {companyDetails.bankDetails.ifsc}</p>
                            <p><strong>Branch:</strong> {companyDetails.bankDetails.branch}</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center">
                        <h4 className="font-bold mb-1">Scan to Pay:</h4>
                        <QRCodeSVG value={`upi://pay?pa=${companyDetails.contact.email}&pn=JXN%20Infra%20Equipment&am=${quotationData.bookingAmount.toFixed(2)}&cu=INR`} size={80} />
                    </div>
                </div>
            </div>
            <div className="text-right">
                <p className="font-semibold mb-16">For, {companyDetails.name}</p>
                <div className="h-16 w-32"></div>
                <Separator />
                <p className="text-sm pt-1">Signature (Created by {quotationData.createdBy})</p>
            </div>
        </footer>
      </Card>
    </>
  );
}
