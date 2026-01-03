

'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, setDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Product, ProductCategory } from '@/lib/types';
import { PlusCircle, AlertCircle, ListFilter, Archive, AlertTriangle, Boxes, ShoppingCart, Copy, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AddProductDialog } from './_components/add-product-dialog';
import { Switch } from '@/components/ui/switch';
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const allStatuses: Product['status'][] = ['Active', 'Pre Sale', 'R & D', 'Discontinued'];

function getStatusBadgeVariant(status: Product['status']) {
    switch (status) {
        case 'Active':
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        case 'Pre Sale':
            return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
        case 'R & D':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        case 'Discontinued':
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
}

function ProductsPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();

  const { data: products, loading } = useCollection<Product>(collection(firestore, 'products'));
  const { data: productCategories } = useCollection<ProductCategory>(collection(firestore, 'productCategories'));

  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [isDuplicating, setIsDuplicating] = React.useState(false);

  const [typeFilters, setTypeFilters] = React.useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = React.useState<string[]>([]);

  const handleTypeFilterChange = (type: string) => {
    setTypeFilters(prev => (prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]));
  };

  const handleCategoryFilterChange = (category: string) => {
    setCategoryFilters(prev => (prev.includes(category) ? prev.filter(c => c !== category) : [...prev, c]));
  };

  const filteredProducts = React.useMemo(() => {
    if (!products) return [];
    return products.filter(product => {
      const typeMatch = typeFilters.length === 0 || typeFilters.includes(product.type);
      const categoryMatch = categoryFilters.length === 0 || categoryFilters.includes(product.category);
      return typeMatch && categoryMatch;
    });
  }, [products, typeFilters, categoryFilters]);

  const allTypes = React.useMemo(() => products ? [...new Set(products.map(p => p.type))] : [], [products]);
  const allCategories = React.useMemo(() => productCategories ? productCategories.map(c => c.name) : [], [productCategories]);
  
  const categoryCounts = React.useMemo(() => {
    if (!products) return {};
    return products.reduce((acc, product) => {
      const category = product.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [products]);


  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setIsDuplicating(false);
    setIsAddDialogOpen(true);
  }
  
  const handleDuplicateClick = (product: Product) => {
    setEditingProduct(product);
    setIsDuplicating(true);
    setIsAddDialogOpen(true);
  };

  const handleAddClick = () => {
    setEditingProduct(null);
    setIsDuplicating(false);
    setIsAddDialogOpen(true);
  }
  
  const handleSaleableToggle = async (productId: string, saleable: boolean) => {
    const productRef = doc(firestore, 'products', productId);
    await setDoc(productRef, { saleable }, { merge: true });
  };
  
  const handleGenerateBOMClick = (product: Product) => {
    if (product.type !== 'Finished Goods' && product.type !== 'Assembly') {
      toast({
        variant: 'destructive',
        title: 'Invalid Product Type',
        description: 'You can only generate a Bill of Material for Finished Goods or Assemblies.',
      });
      return;
    }
    localStorage.setItem('bomProduct', JSON.stringify(product));
    router.push('/dashboard/production/bills-of-material');
  };

  const handleStatusChange = async (productId: string, newStatus: Product['status']) => {
    const productRef = doc(firestore, 'products', productId);
    await setDoc(productRef, { status: newStatus }, { merge: true });
    toast({
        title: 'Status Updated',
        description: `Product status has been changed to "${newStatus}".`,
    });
  };

  const handleDeleteProduct = async (productId: string) => {
    const productRef = doc(firestore, 'products', productId);
    await deleteDoc(productRef);
    toast({
      title: 'Product Deleted',
      description: 'The product has been successfully deleted.',
    });
  };

  const navigateToProduct = (sku: string) => {
    router.push(`/dashboard/products-services/catalogue/${encodeURIComponent(sku)}`);
  };

  return (
    <>
      <PageHeader title="Products & Services">
        <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  <ListFilter className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                    Filter
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Type</DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                             <ScrollArea className="h-48">
                                {allTypes.map(type => (
                                    <DropdownMenuCheckboxItem
                                    key={type}
                                    checked={typeFilters.includes(type)}
                                    onCheckedChange={() => handleTypeFilterChange(type)}
                                    >
                                    {type}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </ScrollArea>
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Category</DropdownMenuSubTrigger>
                     <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                             <ScrollArea className="h-48">
                                {allCategories.map(cat => (
                                    <DropdownMenuCheckboxItem
                                    key={cat}
                                    checked={categoryFilters.includes(cat)}
                                    onCheckedChange={() => handleCategoryFilterChange(cat)}
                                    >
                                    {cat}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </ScrollArea>
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="gap-1" onClick={handleAddClick}>
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Add Product
              </span>
            </Button>
        </div>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(categoryCounts).map(([category, count]) => (
            <Card key={category}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{category}</CardTitle>
                    <Boxes className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{count}</div>
                    <p className="text-xs text-muted-foreground">Total products in this category</p>
                </CardContent>
            </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Product Catalog</CardTitle>
          <CardDescription>
            Manage your products and view their sales performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-[100px] sm:table-cell">
                  <span className="sr-only">Image</span>
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                 <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Price</TableHead>
                <TableHead>Saleable</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">Loading products...</TableCell>
                </TableRow>
              ) : filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="hidden sm:table-cell cursor-pointer" onClick={() => navigateToProduct(product.sku)}>
                    <Image
                      alt={product.name}
                      className="aspect-square rounded-md object-cover"
                      height="64"
                      src={product.imageUrl || 'https://picsum.photos/seed/placeholder/64/64'}
                      width="64"
                      data-ai-hint={product.imageHint}
                    />
                  </TableCell>
                  <TableCell className="font-medium cursor-pointer" onClick={() => navigateToProduct(product.sku)}>{product.name}</TableCell>
                  <TableCell className="cursor-pointer" onClick={() => navigateToProduct(product.sku)}>{product.type}</TableCell>
                  <TableCell className="cursor-pointer" onClick={() => navigateToProduct(product.sku)}>{product.category}</TableCell>
                  <TableCell className="cursor-pointer" onClick={() => navigateToProduct(product.sku)}>
                    <Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant(product.status))}>
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell cursor-pointer" onClick={() => navigateToProduct(product.sku)}>
                    ₹{product.price.toFixed(2)}
                  </TableCell>
                   <TableCell>
                    <Switch
                      checked={product.saleable}
                      onCheckedChange={(checked) => handleSaleableToggle(product.id, checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEditClick(product)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateClick(product)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleGenerateBOMClick(product)}>
                          Generate BOM
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Change Status</DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              {allStatuses.map((status) => (
                                <DropdownMenuItem key={status} onSelect={() => handleStatusChange(product.id, status)}>
                                  <Badge variant="outline" className={cn('text-xs mr-2', getStatusBadgeVariant(status))}>{status}</Badge>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                             <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/40"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the product "{product.name}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteProduct(product.id)} className={buttonVariants({ variant: 'destructive' })}>
                                Delete
                              </AlertDialogAction>
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
        <CardFooter>
          <div className="text-xs text-muted-foreground">
            Showing <strong>1-{filteredProducts.length > 8 ? 8 : filteredProducts.length}</strong> of <strong>{filteredProducts.length}</strong> products
          </div>
        </CardFooter>
      </Card>

      <AddProductDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        productToEdit={editingProduct}
        isDuplicate={isDuplicating}
      />
    </>
  );
}


export default function ProductsPage() {
    const [isClient, setIsClient] = React.useState(false);
    
    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return (
             <>
                <PageHeader title="Products & Services" />
                <Card>
                    <CardHeader>
                        <CardTitle>Product Catalog</CardTitle>
                        <CardDescription>Manage your products and view their sales performance.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-center h-48">Loading products...</div>
                    </CardContent>
                </Card>
            </>
        )
    }

    return <ProductsPageContent />;
}
