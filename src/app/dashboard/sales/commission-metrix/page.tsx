

'use client';

import * as React from 'react';
import { Percent, CircleDollarSign, Star, ListFilter, Save } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Product, CompanyInfo, User, UserRole } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, setDoc, writeBatch, addDoc, serverTimestamp } from 'firebase/firestore';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';

interface CategoryMetric {
  category: string;
  discountInternal: number;
}

function CommissionMetrixPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: allProducts, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
  const companyInfoRef = doc(firestore, 'company', 'info');
  const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(companyInfoRef);
  const { data: users, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
  
  const [metrics, setMetrics] = React.useState<CategoryMetric[]>([]);
  const [categoryFilters, setCategoryFilters] = React.useState<string[]>([]);
  const [effectiveDate, setEffectiveDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  
  const allCategories = React.useMemo(() => {
    if (!allProducts) return [];
    return [...new Set(allProducts.map(p => p.category))];
  }, [allProducts]);

  React.useEffect(() => {
    if (companyInfoLoading || productsLoading) return;

    if (companyInfo?.commissionMatrix?.matrix && companyInfo.commissionMatrix.matrix.length > 0) {
      setMetrics(companyInfo.commissionMatrix.matrix as CategoryMetric[]);
      if (companyInfo.commissionMatrix.effectiveDate) {
        setEffectiveDate(companyInfo.commissionMatrix.effectiveDate);
      }
    } else if (allCategories.length > 0) {
      const initialMetrics = allCategories.map(category => {
        let maxDiscount = 10;

        if (category === 'Electronics') {
          maxDiscount = 12;
        } else if (category === 'Furniture') {
          maxDiscount = 15;
        }
        
        return {
          category,
          discountInternal: 5,
        };
      });
      setMetrics(initialMetrics);
    }
  }, [allProducts, allCategories, companyInfo, companyInfoLoading, productsLoading]);

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
  };
  
  const handleMetricChange = (category: string, field: keyof CategoryMetric, value: number) => {
    setMetrics(prev => 
        prev.map(m => m.category === category ? {...m, [field]: value} : m)
    );
  };

  const handleSaveChanges = async () => {
    const commissionMatrixData = {
      effectiveDate: effectiveDate,
      matrix: metrics,
    };

    try {
        await setDoc(companyInfoRef, { commissionMatrix: commissionMatrixData }, { merge: true });

        // Notification Logic
        if (users) {
            const salesRoles: UserRole[] = ['Sales Manager', 'CEO', 'Accounts Manager'];
            const targetUsers = users.filter(user => salesRoles.includes(user.role));
            
            const batch = writeBatch(firestore);

            targetUsers.forEach(user => {
                const notificationRef = doc(collection(firestore, 'users', user.id, 'notifications'));
                batch.set(notificationRef, {
                    type: 'update',
                    title: 'Discount Rates Updated',
                    description: `The rates matrix has been revised. New rates are effective from ${format(new Date(effectiveDate), 'PPP')}.`,
                    timestamp: serverTimestamp(),
                    read: false,
                });
            });
            
            await batch.commit();
        }

        toast({
            title: "Changes Saved & Users Notified",
            description: `Your commission matrix has been updated and relevant users have been notified.`,
        });

    } catch (error) {
        console.error("Error saving commission matrix or sending notifications:", error);
        toast({
            variant: "destructive",
            title: "Save Failed",
            description: "There was an error saving your changes.",
        });
    }
  };

  const filteredMetrics = React.useMemo(() => {
    return metrics.filter(metric => {
      const categoryMatch = categoryFilters.length === 0 || categoryFilters.includes(metric.category);
      return categoryMatch;
    });
  }, [metrics, categoryFilters]);

  const kpis = React.useMemo(() => {
    if (metrics.length === 0) {
      return { avgDiscount: 0 };
    }

    let totalDiscounts = 0;
    
    metrics.forEach(metric => {
      totalDiscounts += metric.discountInternal;
    });

    return {
      avgDiscount: metrics.length > 0 ? totalDiscounts / metrics.length : 0,
    };
  }, [metrics]);


  return (
    <>
      <PageHeader title="Discount Matrix">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <Label htmlFor="effective-date" className="whitespace-nowrap">Effective From:</Label>
                <Input
                    id="effective-date"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-40"
                />
            </div>
            <div className="flex items-center gap-2">
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1">
                    <ListFilter className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Filter</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Filter by Category</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <ScrollArea className="h-32">
                    {allCategories.map(cat => (
                        <DropdownMenuCheckboxItem key={cat} checked={categoryFilters.includes(cat)} onCheckedChange={() => handleFilterChange(setCategoryFilters)(cat)}>
                        {cat}
                        </DropdownMenuCheckboxItem>
                    ))}
                    </ScrollArea>
                </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={handleSaveChanges}>
                    <Save className="mr-2 h-4 w-4"/>
                    Save Changes
                </Button>
            </div>
        </div>
      </PageHeader>
      
       <div className="grid gap-4 md:grid-cols-1">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Discount Rate</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.avgDiscount.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Average discount for internal sales</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category Discount Matrix</CardTitle>
          <CardDescription>
            A detailed matrix of discounts for all product categories.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Disc. (Internal)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsLoading || companyInfoLoading ? (
                <TableRow>
                  <TableCell colSpan={2} className="h-24 text-center">
                    Loading matrix...
                  </TableCell>
                </TableRow>
              ) : filteredMetrics.map((metric) => (
                <TableRow key={metric.category}>
                  <TableCell>
                     <div className="font-medium">{metric.category}</div>
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={metric.discountInternal} onChange={(e) => handleMetricChange(metric.category, 'discountInternal', Number(e.target.value))} className="w-24" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function CommissionMetrixWrapper() {
    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return (
             <>
                <PageHeader title="Discount Matrix" />
                <Card>
                    <CardHeader>
                        <CardTitle>Product Discount Matrix</CardTitle>
                        <CardDescription>
                            Loading data...
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-48">Loading matrix...</div>
                    </CardContent>
                </Card>
            </>
        )
    }

    return <CommissionMetrixPageContent />;
}
