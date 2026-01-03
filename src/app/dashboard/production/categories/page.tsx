

'use client';

import * as React from 'react';
import { MoreHorizontal, PlusCircle } from 'lucide-react';
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
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection } from '@/firebase';
import type { ProductCategory, Product } from '@/lib/types';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

export default function ProductCategoriesPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: categories, loading: categoriesLoading } = useCollection<ProductCategory>(collection(firestore, 'productCategories'));
  const { data: products, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<ProductCategory | null>(null);
  const [categoryName, setCategoryName] = React.useState('');

  const categoryCounts = React.useMemo(() => {
    if (!products) return {};
    return products.reduce((acc, product) => {
        const category = product.category || 'Uncategorized';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
  }, [products]);


  const handleOpenDialog = (category: ProductCategory | null = null) => {
    setEditingCategory(category);
    setCategoryName(category ? category.name : '');
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!categoryName.trim()) {
      toast({ variant: 'destructive', title: 'Category name is required' });
      return;
    }
    
    try {
        if (editingCategory) {
          const categoryRef = doc(firestore, 'productCategories', editingCategory.id);
          await updateDoc(categoryRef, { name: categoryName });
          toast({ title: 'Category Updated' });
        } else {
          await addDoc(collection(firestore, 'productCategories'), { name: categoryName });
          toast({ title: 'Category Created' });
        }
        setIsDialogOpen(false);
    } catch (error) {
        console.error("Error saving category:", error);
        toast({ variant: 'destructive', title: 'Save Failed' });
    }
  };

  const handleDelete = async (categoryId: string) => {
    await deleteDoc(doc(firestore, 'productCategories', categoryId));
    toast({ title: 'Category Deleted' });
  };
  
  const loading = categoriesLoading || productsLoading;

  return (
    <>
      <PageHeader title="Product Categories">
        <Button onClick={() => handleOpenDialog()}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Category
        </Button>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Manage Categories</CardTitle>
          <CardDescription>
            Add, edit, or delete product categories for your catalog.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category Name</TableHead>
                <TableHead>SKU Count</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={3} className="h-24 text-center">Loading categories...</TableCell></TableRow>
                ) : categories?.map((cat) => (
                    <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell>{categoryCounts[cat.name] || 0}</TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleOpenDialog(cat)}>Edit</DropdownMenuItem>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600">Delete</DropdownMenuItem>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                <AlertDialogDescription>This will permanently delete the category "{cat.name}". This action cannot be undone.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(cat.id)} className={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{editingCategory ? 'Edit' : 'Create'} Category</DialogTitle>
            </DialogHeader>
            <div className="py-4">
                <Label htmlFor="category-name">Category Name</Label>
                <Input
                    id="category-name"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="e.g., Office Chairs"
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave}>Save</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
