

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
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
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { MoreHorizontal, FileText, CircleDollarSign, Receipt, CheckCircle, PlusCircle } from 'lucide-react';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, query, orderBy, where, doc, setDoc } from 'firebase/firestore';
import type { Order, OrderStatus, WorkOrder, SalesOrder, ServiceInvoice, ServiceRequest } from '@/lib/types';
import { getNextDocNumber } from '@/lib/number-series';
import { useToast } from '@/hooks/use-toast';


function getStatusBadgeVariant(status: ServiceRequest['status']) {
  const variants: Record<ServiceRequestStatus, string> = {
    Delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Shipped: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Ordered: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    Manufacturing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    'Ready for Dispatch': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    'Awaiting Payment': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    Canceled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    'Cancellation Requested': 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
    'Pending': 'bg-yellow-100 text-yellow-800',
    'In Progress': 'bg-blue-100 text-blue-800',
    'Completed': 'bg-green-100 text-green-800',
    'Quotation Sent': 'bg-purple-100 text-purple-800',
    'Work Complete': 'bg-yellow-100 text-yellow-800',
    'Invoice Sent': 'bg-blue-100 text-blue-800',
    'Paid': 'bg-green-100 text-green-800',
    'Awaiting Parts': 'bg-orange-100 text-orange-800'
  };
  return variants[status];
}

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
};


export default function InvoicePage() {
    const router = useRouter();
    const firestore = useFirestore();
    const { toast } = useToast();
    const { data: serviceRequests, loading: requestsLoading } = useCollection<ServiceRequest>(query(collection(firestore, 'serviceRequests'), orderBy('dateSubmitted', 'desc')));
    const { data: allServiceInvoices } = useCollection<ServiceInvoice>(collection(firestore, 'serviceInvoices'));
    const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));

    const kpis = React.useMemo(() => {
        if (!allServiceInvoices) return { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 };
        
        const totalBilled = allServiceInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
        const totalPaid = allServiceInvoices.filter(inv => inv.status === 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0);
        const totalOutstanding = totalBilled - totalPaid;

        return { totalBilled, totalPaid, totalOutstanding };
    }, [allServiceInvoices]);

    const handleGenerateInvoice = async (request: ServiceRequest) => {
      if (!settingsData?.prefixes || !allServiceInvoices) {
        toast({ variant: 'destructive', title: 'Error', description: 'Document numbering settings not found.' });
        return;
      }
      const newInvoiceId = getNextDocNumber('Service Invoice', settingsData.prefixes, allServiceInvoices);

      const invoiceData: Omit<ServiceInvoice, 'id'> = {
        invoiceNumber: newInvoiceId,
        serviceRequestId: request.id,
        customerId: request.customer.id,
        customerName: request.customer.name,
        date: new Date().toISOString(),
        amount: request.quotation?.items.reduce((acc, item) => acc + item.quantity * item.rate * (1 + item.gstRate/100), 0) || 0,
        status: 'Unpaid'
      };

      await setDoc(doc(firestore, 'serviceInvoices', newInvoiceId), { ...invoiceData, id: newInvoiceId });
      await updateDoc(doc(firestore, 'serviceRequests', request.id), { status: 'Invoice Sent' });

      toast({
        title: 'Invoice Generated',
        description: `Invoice ${newInvoiceId} created successfully.`,
      });

      localStorage.setItem('serviceInvoiceData', JSON.stringify({ ...request, ...invoiceData, id: newInvoiceId }));
      router.push(`/dashboard/service-warranty/invoice/view?id=${newInvoiceId}`);
    };

    const loading = requestsLoading;

  return (
    <>
      <PageHeader title="Service Invoices" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Billed Amount</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.totalBilled)}</div>
            <p className="text-xs text-muted-foreground">Sum of all service invoices.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatIndianCurrency(kpis.totalPaid)}</div>
            <p className="text-xs text-muted-foreground">Total payments received.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatIndianCurrency(kpis.totalOutstanding)}</div>
            <p className="text-xs text-muted-foreground">Total balance to be collected.</p>
          </CardContent>
        </Card>
      </div>

       <Card>
        <CardHeader>
          <CardTitle>Completed Service Requests</CardTitle>
          <CardDescription>
            List of all completed services. You can generate an invoice for them here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quoted Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading requests...</TableCell></TableRow>
              ) : serviceRequests && serviceRequests.length > 0 ? (
                serviceRequests.map((request) => {
                  const amount = request.quotation?.items.reduce((acc, item) => acc + item.quantity * item.rate * (1 + item.gstRate/100), 0) || 0;
                  return (
                  <TableRow key={request.id}>
                    <TableCell className="font-mono">{request.id}</TableCell>
                    <TableCell>{request.customer.name}</TableCell>
                    <TableCell>{format(new Date(request.dateSubmitted), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <Badge className={cn('text-xs', getStatusBadgeVariant(request.status))} variant="outline">
                        {request.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatIndianCurrency(amount)}</TableCell>
                    <TableCell className="text-right">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={request.status !== 'Work Complete'}
                            onClick={() => handleGenerateInvoice(request)}
                        >
                            Generate Invoice
                        </Button>
                    </TableCell>
                  </TableRow>
                )})
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No completed service requests found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
