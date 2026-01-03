
'use client';

import * as React from 'react';
import { PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import type { Quotation } from '@/lib/types';

type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected';

function getStatusBadgeVariant(status: QuotationStatus) {
    switch (status) {
        case 'Draft': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        case 'Sent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
        case 'Accepted': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        case 'Rejected': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
}

function QuotationPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: quotations, loading } = useCollection<Quotation>(collection(firestore, 'quotations'));

  const handleCreateQuotation = () => {
    router.push('/dashboard/sales/create-quotation');
  };

  const handleConvertToSO = (quotation: Quotation) => {
    localStorage.setItem('quotationToConvert', JSON.stringify(quotation));
    router.push('/dashboard/sales/create-order');
  };
  
  return (
    <>
      <PageHeader title="Quotations">
        <Button onClick={handleCreateQuotation}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Quotation
        </Button>
      </PageHeader>
      
      <Card>
          <CardHeader>
              <CardTitle>All Quotations</CardTitle>
              <CardDescription>Manage and track all your created quotations.</CardDescription>
          </CardHeader>
          <CardContent>
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Quotation ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading quotations...</TableCell></TableRow>
                      ) : quotations && quotations.length > 0 ? (
                        quotations.map((q) => (
                          <TableRow key={q.id}> 
                            <TableCell className="font-mono font-bold text-blue-600">
                              {q.quotationNumber || "Generating..."}
                            </TableCell>
                            <TableCell>{q.customerName}</TableCell>
                            <TableCell>{q.date ? new Date(q.date).toLocaleDateString('en-IN') : 'N/A'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn(getStatusBadgeVariant(q.status as QuotationStatus))}>
                                  {q.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">₹{(q.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <Button variant="secondary" size="sm" onClick={() => handleConvertToSO(q)}>
                                    Convert to SO
                                </Button>
                                <Button variant="outline" size="sm" asChild>
                                  <Link href={`/dashboard/sales/quotation/view?id=${q.id}`}>
                                      View
                                  </Link>
                                </Button>
                                <Button variant="ghost" size="sm" asChild>
                                  <Link href={`/dashboard/sales/create-quotation?id=${q.id}`}>
                                      Edit
                                  </Link>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No quotations found.</TableCell>
                        </TableRow>
                      )}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>
    </>
  );
}

export default function QuotationWrapper() {
  const [isClient, setIsClient] = React.useState(false);
  React.useEffect(() => { setIsClient(true); }, []);
  if (!isClient) return null;
  return <QuotationPageContent />;
}
