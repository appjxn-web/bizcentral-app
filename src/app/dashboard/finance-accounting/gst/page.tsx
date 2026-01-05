

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { FileText, ShoppingCart, CircleDollarSign, ArrowRightLeft, Send, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { SalesInvoice, JournalVoucher, Party, Product } from '@/lib/types';


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


export default function GstPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const [year, setYear] = React.useState(new Date().getFullYear().toString());
  const [month, setMonth] = React.useState((new Date().getMonth() + 1).toString());

  // Corrected to fetch from salesInvoices collection
  const { data: invoicesData } = useCollection<SalesInvoice>(collection(firestore, 'salesInvoices'));
  const { data: jvData } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));
  const { data: partiesData } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: productsData } = useCollection<any>(collection(firestore, 'products'));

  const gstr1 = React.useMemo(() => {
    if (!invoicesData) return [];
    return invoicesData
      .filter(d => new Date(d.date).getFullYear().toString() === year && (new Date(d.date).getMonth() + 1).toString() === month)
      .map(invoice => ({
        id: invoice.id,
        date: invoice.date,
        invoiceNo: invoice.invoiceNumber,
        partyName: invoice.customerName,
        gstin: partiesData?.find(p => p.id === invoice.customerId)?.gstin || 'N/A',
        taxableValue: invoice.taxableAmount,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        igst: invoice.igst || 0,
        totalGst: invoice.cgst + invoice.sgst + (invoice.igst || 0),
        totalAmount: invoice.grandTotal
      }));
  }, [invoicesData, year, month, partiesData]);

  const gstr2b = React.useMemo(() => {
    if (!jvData || !partiesData) return [];
    return jvData
      .filter(jv => {
          const jvDate = new Date(jv.date);
          return jv.narration.toLowerCase().includes('purchase') && 
                 jvDate.getFullYear().toString() === year &&
                 (jvDate.getMonth() + 1).toString() === month;
      })
      .map(jv => {
          const debitEntry = jv.entries.find(e => e.debit > 0);
          const creditEntry = jv.entries.find(e => e.credit > 0);
          const party = partiesData?.find(p => p.coaLedgerId === creditEntry?.accountId);
          
          if (!debitEntry || !party) return null;

          const taxableValue = debitEntry.debit;
          // Assuming 18% GST for all purchases for simplicity
          const totalGst = taxableValue * 0.18;
          const isInterstate = companyDetails.gstin.substring(0, 2) !== party.gstin?.substring(0, 2);

          return {
              id: jv.id,
              date: jv.date,
              invoiceNo: jv.id, // Using JV ID as a proxy
              partyName: party.name,
              gstin: party.gstin || 'N/A',
              taxableValue,
              cgst: isInterstate ? 0 : totalGst / 2,
              sgst: isInterstate ? 0 : totalGst / 2,
              igst: isInterstate ? totalGst : 0,
              totalGst,
              totalAmount: taxableValue + totalGst
          };
      }).filter(Boolean) as GstTransaction[];
  }, [jvData, partiesData, year, month]);

  const kpis = React.useMemo(() => {
    const totalSales = gstr1.reduce((sum, item) => sum + item.taxableValue, 0);
    const taxOnSales = gstr1.reduce((sum, item) => sum + item.totalGst, 0);
    const inputTaxCredit = gstr2b.reduce((sum, item) => sum + item.totalGst, 0);
    const netGstPayable = Math.max(0, taxOnSales - inputTaxCredit);
    return { totalSales, taxOnSales, inputTaxCredit, netGstPayable };
  }, [gstr1, gstr2b]);
  
  const handleFileReturn = () => {
    toast({
        title: 'GST Return Filed (Simulation)',
        description: `Your GSTR-3B for ${new Date(parseInt(year), parseInt(month)-1).toLocaleString('default', { month: 'long' })} ${year} has been filed successfully. Net payment: ₹${kpis.netGstPayable.toFixed(2)}`,
    });
  }

  const GstTable = ({ data, title }: { data: GstTransaction[], title: string }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{title === 'Sales' ? 'Invoice No.' : 'Bill No.'}</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Party Name</TableHead>
          <TableHead>GSTIN</TableHead>
          <TableHead className="text-right">Taxable Value</TableHead>
          <TableHead className="text-right">CGST</TableHead>
          <TableHead className="text-right">SGST</TableHead>
          <TableHead className="text-right">IGST</TableHead>
          <TableHead className="text-right">Total Tax</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length > 0 ? data.map(item => (
          <TableRow key={item.id}>
            <TableCell className="font-mono text-xs">{item.invoiceNo}</TableCell>
            <TableCell>{format(new Date(item.date), 'dd/MM/yyyy')}</TableCell>
            <TableCell>{item.partyName}</TableCell>
            <TableCell>{item.gstin}</TableCell>
            <TableCell className="text-right font-mono">₹{item.taxableValue.toFixed(2)}</TableCell>
            <TableCell className="text-right font-mono">₹{item.cgst.toFixed(2)}</TableCell>
            <TableCell className="text-right font-mono">₹{item.sgst.toFixed(2)}</TableCell>
            <TableCell className="text-right font-mono">₹{item.igst.toFixed(2)}</TableCell>
            <TableCell className="text-right font-mono font-semibold">₹{item.totalGst.toFixed(2)}</TableCell>
          </TableRow>
        )) : (
            <TableRow><TableCell colSpan={9} className="text-center h-24">No data for this period.</TableCell></TableRow>
        )}
      </TableBody>
      <TableFooter>
        <TableRow>
            <TableCell colSpan={4} className="font-bold">Total</TableCell>
            <TableCell className="text-right font-bold font-mono">₹{data.reduce((sum, i) => sum + i.taxableValue, 0).toFixed(2)}</TableCell>
            <TableCell className="text-right font-bold font-mono">₹{data.reduce((sum, i) => sum + i.cgst, 0).toFixed(2)}</TableCell>
            <TableCell className="text-right font-bold font-mono">₹{data.reduce((sum, i) => sum + i.sgst, 0).toFixed(2)}</TableCell>
            <TableCell className="text-right font-bold font-mono">₹{data.reduce((sum, i) => sum + i.igst, 0).toFixed(2)}</TableCell>
            <TableCell className="text-right font-bold font-mono">₹{data.reduce((sum, i) => sum + i.totalGst, 0).toFixed(2)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );

  return (
    <>
      <PageHeader title="GST Filing">
        <Button 
            variant="outline"
            onClick={() => {
                localStorage.setItem('gstReportData', JSON.stringify({ gstr1, gstr2b, kpis, period: `${month}-${year}` }));
                router.push(`/dashboard/finance-accounting/gst/view?year=${year}&month=${month}`);
            }}
        >
            <Printer className="mr-2 h-4 w-4" /> View Report
        </Button>
      </PageHeader>
        <Card>
            <CardHeader>
                <CardTitle>Select Filing Period</CardTitle>
                 <div className="flex items-center gap-4 pt-2">
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select Year" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2025">2025</SelectItem>
                            <SelectItem value="2024">2024</SelectItem>
                            <SelectItem value="2023">2023</SelectItem>
                        </SelectContent>
                    </Select>
                     <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select Month" />
                        </SelectTrigger>
                        <SelectContent>
                            {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                                <SelectItem key={m} value={m.toString()}>
                                    {new Date(0, m-1).toLocaleString('default', { month: 'long' })}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
        </Card>
      
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.totalSales.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Taxable value of outward supplies</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tax on Sales</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.taxOnSales.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Total GST collected (Output Tax)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Input Tax Credit (ITC)</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.inputTaxCredit.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Total GST paid on purchases</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net GST Payable</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">₹{kpis.netGstPayable.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Tax on Sales - ITC</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="gstr1">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="gstr1">Sales (GSTR-1)</TabsTrigger>
          <TabsTrigger value="gstr2b">Purchases (GSTR-2B)</TabsTrigger>
        </TabsList>
        <TabsContent value="gstr1">
          <Card>
            <CardHeader>
              <CardTitle>Outward Supplies (GSTR-1)</CardTitle>
              <CardDescription>Details of all sales invoices created in the selected period.</CardDescription>
            </CardHeader>
            <CardContent>
                <GstTable data={gstr1} title="Sales" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="gstr2b">
          <Card>
            <CardHeader>
              <CardTitle>Inward Supplies (GSTR-2B)</CardTitle>
              <CardDescription>Details of all purchases made, eligible for Input Tax Credit.</CardDescription>
            </CardHeader>
            <CardContent>
                <GstTable data={gstr2b} title="Purchases" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
       <Card>
        <CardHeader>
          <CardTitle>File GSTR-3B</CardTitle>
          <CardDescription>
            Review your consolidated tax summary and file your monthly return.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="grid md:grid-cols-2 gap-6">
                <Table>
                    <TableBody>
                        <TableRow>
                            <TableCell className="font-medium">Total Tax on Outward Supplies</TableCell>
                            <TableCell className="text-right font-mono">₹{kpis.taxOnSales.toFixed(2)}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="font-medium">Eligible Input Tax Credit (ITC)</TableCell>
                            <TableCell className="text-right font-mono">₹{kpis.inputTaxCredit.toFixed(2)}</TableCell>
                        </TableRow>
                         <TableRow className="bg-muted">
                            <TableCell className="font-bold">Net GST Payable</TableCell>
                            <TableCell className="text-right font-bold text-lg font-mono">₹{kpis.netGstPayable.toFixed(2)}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <div className="flex flex-col items-center justify-center p-4 border rounded-md">
                    <p className="text-center text-muted-foreground mb-4">This action will simulate filing your GSTR-3B return. Ensure all data is correct.</p>
                     <Button size="lg" onClick={handleFileReturn}>
                        <Send className="mr-2 h-4 w-4" />
                        Proceed to File Return
                    </Button>
                </div>
           </div>
        </CardContent>
      </Card>
    </>
  );
}

// Mock details needed for calculations
const companyDetails = {
  gstin: '08AAFCJ5369P1ZR',
};
