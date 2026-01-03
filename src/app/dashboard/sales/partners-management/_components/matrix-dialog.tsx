
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { UserProfile, CommissionRule, ProductCategory } from '@/lib/types';
import { Percent } from 'lucide-react';

interface MatrixDialogProps {
  partner: UserProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (partnerId: string, matrix: CommissionRule[]) => void;
}

export function MatrixDialog({ partner, open, onOpenChange, onSave }: MatrixDialogProps) {
  const firestore = useFirestore();
  const { data: productCategories, loading } = useCollection<ProductCategory>(collection(firestore, 'productCategories'));
  const [matrix, setMatrix] = React.useState<CommissionRule[]>([]);

  React.useEffect(() => {
    if (partner && productCategories) {
      // Initialize matrix: use existing rules or create default ones for each category
      const initialMatrix = productCategories.map(category => {
        const existingRule = partner.partnerMatrix?.find(rule => rule.category === category.name);
        return existingRule || {
          category: category.name,
          commissionRate: 0,
          maxDiscount: 0,
        };
      });
      setMatrix(initialMatrix);
    }
  }, [partner, productCategories]);

  const handleMatrixChange = (categoryName: string, field: 'commissionRate' | 'maxDiscount', value: string) => {
    const numericValue = Number(value);
    if (isNaN(numericValue)) return;

    setMatrix(prevMatrix =>
      prevMatrix.map(rule =>
        rule.category === categoryName
          ? { ...rule, [field]: numericValue }
          : rule
      )
    );
  };

  const handleSave = () => {
    if (partner) {
      onSave(partner.id, matrix);
    }
  };

  if (!partner) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Commission & Discount Matrix for {partner.name}</DialogTitle>
          <DialogDescription>
            Set the commission and maximum discount percentages for each product category.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="py-4 px-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-48">Commission Rate</TableHead>
                  <TableHead className="w-48">Max Discount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={3} className="text-center">Loading categories...</TableCell></TableRow>
                ) : matrix.map(rule => (
                  <TableRow key={rule.category}>
                    <TableCell className="font-medium">{rule.category}</TableCell>
                    <TableCell>
                      <div className="relative">
                        <Input
                          type="number"
                          value={rule.commissionRate}
                          onChange={(e) => handleMatrixChange(rule.category, 'commissionRate', e.target.value)}
                          className="pr-7"
                        />
                        <Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="relative">
                        <Input
                          type="number"
                          value={rule.maxDiscount}
                          onChange={(e) => handleMatrixChange(rule.category, 'maxDiscount', e.target.value)}
                          className="pr-7"
                        />
                         <Percent className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleSave}>Save Matrix</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
