'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RegisteredProduct } from '@/lib/types';
import { format, parseISO, differenceInMonths } from 'date-fns';
import { Separator } from '@/components/ui/separator';

interface ProductLogDialogProps {
  product: RegisteredProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductLogDialog({ product, open, onOpenChange }: ProductLogDialogProps) {
  const getRemainingWarranty = (endDate: string) => {
    const remaining = differenceInMonths(parseISO(endDate), new Date());
    return remaining > 0 ? `${remaining} months` : 'Expired';
  };

  const getChildPartWarrantyEnd = (installDate: string, warrantyMonths: number) => {
    const endDate = new Date(installDate);
    endDate.setMonth(endDate.getMonth() + warrantyMonths);
    return format(endDate, 'PPP');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Warranty & Service Log</DialogTitle>
          <DialogDescription>
            {product.productName} - (SN: {product.serialNumber})
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="p-4 space-y-6">
            
            {/* Child Part Warranties */}
            {product.childParts && product.childParts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Child Part Warranty</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Name</TableHead>
                      <TableHead>Warranty Period</TableHead>
                      <TableHead>Warranty End Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.childParts.map((part) => (
                      <TableRow key={part.id}>
                        <TableCell className="font-medium">{part.name}</TableCell>
                        <TableCell>{part.warrantyMonths} months</TableCell>
                        <TableCell>{getChildPartWarrantyEnd(part.installDate, part.warrantyMonths)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {/* Main Product Warranty */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Product Warranty Details</h3>
               <div className="grid grid-cols-2 gap-4 text-sm">
                  <p><strong>Purchase Date:</strong> {format(parseISO(product.purchaseDate), 'PPP')}</p>
                  <p><strong>Warranty End Date:</strong> {format(parseISO(product.warrantyEndDate), 'PPP')}</p>
                  <p><strong>Remaining Warranty:</strong> {getRemainingWarranty(product.warrantyEndDate)}</p>
               </div>
            </div>

            <Separator />

            {/* Service Logs */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Service History</h3>
              {product.serviceLogs && product.serviceLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Request No.</TableHead>
                       <TableHead>Invoice No.</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.serviceLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{format(parseISO(log.date), 'PPP')}</TableCell>
                        <TableCell>{log.requestNo}</TableCell>
                        <TableCell>{log.invoiceNo}</TableCell>
                        <TableCell>{log.description}</TableCell>
                        <TableCell>
                          <Badge variant={log.status === 'Completed' ? 'default' : 'secondary'}>{log.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No service history found for this product.</p>
              )}
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
