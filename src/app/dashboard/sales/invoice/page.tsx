

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button, buttonVariants } from '@/components/ui/button';
import { MoreHorizontal, FileText, CircleDollarSign, Receipt, Edit, Trash2, CheckCircle, PlusCircle } from 'lucide-react';
import type { SalesInvoice, UserRole } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUser, useFirestore, useCollection } from '@/firebase';
import { useRole } from '../../_components/role-provider';
import { collection, query, where, orderBy, deleteDoc, doc } from 'firebase/firestore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

function getStatusBadgeVariant(status: SalesInvoice['status']) {
  const variants: Record<SalesInvoice['status'], string> = {
    Paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Unpaid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    Overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
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

function InvoicePageContent() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();
  const { currentRole } = useRole();
  const { toast } = useToast();

  const invoicesQuery = React.useMemo(() => {
    if (!user || !currentRole) return null;
    const invoicesRef = collection(firestore, 'salesInvoices');

    if (['Admin', 'CEO', 'Sales Manager', 'Accounts Manager'].includes(currentRole)) {
        return query(invoicesRef, orderBy('date', 'desc'));
    }

    if (currentRole === 'Partner') {
        return query(
            invoicesRef, 
            where('assignedToUid', '==', user.uid),
            orderBy('date', 'desc')
        );
    }

    return query(
        invoicesRef, 
        where('customerId', '==', user.uid),
        orderBy('date', 'desc')
    );
  }, [user, currentRole, firestore]);
  
  const { data: invoices, loading } = useCollection<SalesInvoice>(invoicesQuery);

  const kpis = React.useMemo(() => {
    if (!invoices) return { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 };
    
    const totalBilled = invoices.reduce((sum, invoice) => sum + invoice.grandTotal, 0);
    const totalPaid = invoices.filter(inv => inv.status === 'Paid').reduce((sum, invoice) => sum + invoice.grandTotal, 0);
    const totalOutstanding = totalBilled - totalPaid;

    return { totalBilled, totalPaid, totalOutstanding };
  }, [invoices]);

  const handleDelete = async (invoiceId: string) => {
    await deleteDoc(doc(firestore, 'salesInvoices', invoiceId));
    toast({ title: "Invoice Deleted" });
  };
  
  const canCreateInvoice = ['Admin', 'CEO', 'Sales Manager', 'Partner'].includes(currentRole);

  return (
    <>
      <PageHeader title="Sales Invoices">
        {canCreateInvoice && (
          <Button onClick={() => router.push('/dashboard/sales/create-invoice')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Invoice
          </Button>
        )}
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Billed Amount</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(kpis.totalBilled)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatIndianCurrency(kpis.totalPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatIndianCurrency(kpis.totalOutstanding)}</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
          <CardDescription>
            Manage and track all customer invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading invoices...</TableCell></TableRow>
              ) : invoices && invoices.length > 0 ? (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell>{format(new Date(invoice.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(getStatusBadgeVariant(invoice.status))}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatIndianCurrency(invoice.grandTotal)}</TableCell>
                    <TableCell className="text-right">
                       <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                               <DropdownMenuItem onClick={() => router.push(`/dashboard/sales/invoice/view?id=${invoice.invoiceNumber}`)}>View & Print</DropdownMenuItem>
                               <DropdownMenuItem onClick={() => router.push(`/dashboard/sales/create-invoice?id=${invoice.invoiceNumber}`)}>Edit</DropdownMenuItem>
                               <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600">Delete</DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>This will permanently delete invoice {invoice.invoiceNumber}.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(invoice.id)} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                               </AlertDialog>
                            </DropdownMenuContent>
                       </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No invoices found.
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

export default function InvoicePageWrapper() {
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
      setIsClient(true);
  }, []);

  if (!isClient) {
      return null;
  }

  return <InvoicePageContent />;
}


