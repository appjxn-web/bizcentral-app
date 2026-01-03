

'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

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
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, query, where, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import type { Product, Order, WorkOrder, CompanyInfo, PurchaseRequest, RequestStatus, BillOfMaterial } from '@/lib/types';
import { PlusCircle, AlertCircle, ListFilter, Archive, AlertTriangle, Boxes, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getNextDocNumber } from '@/lib/number-series';

function FilterHeader({ title, width, filterValues, allValues, onFilterChange }: { title: string, width: string, filterValues: string[], allValues: string[], onFilterChange: (value: string) => void }) {
  return (
    <TableHead className={width}>
      <div className="flex items-center gap-2">
        {title}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <ListFilter className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Filter by {title}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="h-40">
              {allValues.map(value => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={filterValues.includes(value)}
                  onCheckedChange={() => onFilterChange(value)}
                >
                  {value}
                </DropdownMenuCheckboxItem>
              ))}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TableHead>
  );
}


function StocksPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: authUser } = useUser();

  const { data: products, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
  const { data: orders, loading: ordersLoading } = useCollection<Order>(collection(firestore, 'orders'));
  const { data: workOrders, loading: workOrdersLoading } = useCollection<WorkOrder>(collection(firestore, 'workOrders'));
  const { data: boms, loading: bomsLoading } = useCollection<BillOfMaterial>(collection(firestore, 'boms'));
  const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
  const { data: requests } = useCollection<PurchaseRequest>(collection(firestore, 'purchaseRequests'));
  
  const [typeFilters, setTypeFilters] = React.useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = React.useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = React.useState<string[]>(['Bought']);
  
  const [isRequestDialogOpen, setIsRequestDialogOpen] = React.useState(false);
  const [requestingProduct, setRequestingProduct] = React.useState<{ product: Product, plannedQty: number } | null>(null);
  const [requestQuantity, setRequestQuantity] = React.useState('');

  React.useEffect(() => {
    if (requestingProduct) {
        setRequestQuantity(requestingProduct.plannedQty > 0 ? String(requestingProduct.plannedQty) : '1');
    }
  }, [requestingProduct]);

  const allTypes = React.useMemo(() => products ? [...new Set(products.map(p => p.type))] : [], [products]);
  const allCategories = React.useMemo(() => products ? [...new Set(products.map(p => p.category))] : [], [products]);
  const allSources: Product['source'][] = ['Bought', 'Made'];

  const createFilterHandler = (setFilter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
    setFilter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
  };
  
  const handleTypeFilterChange = createFilterHandler(setTypeFilters);
  const handleCategoryFilterChange = createFilterHandler(setCategoryFilters);
  const handleSourceFilterChange = createFilterHandler(setSourceFilters);


  const filteredProducts = React.useMemo(() => {
    if (!products) return [];
    return products.filter(product => {
      const typeMatch = typeFilters.length === 0 || typeFilters.includes(product.type);
      const categoryMatch = categoryFilters.length === 0 || categoryFilters.includes(product.category);
      const sourceMatch = sourceFilters.length === 0 || sourceFilters.includes(product.source);
      return typeMatch && categoryMatch && sourceMatch;
    });
  }, [products, typeFilters, categoryFilters, sourceFilters]);

  
  const getOrderInHand = React.useCallback((productId: string) => {
    if (!orders || !products || !boms) return 0;
    
    // Find all open sales orders for finished goods
    const openSalesOrders = orders.filter(o => o.status !== 'Delivered' && o.status !== 'Canceled');
    let requiredQty = 0;

    // Iterate through each open sales order
    for (const order of openSalesOrders) {
      // Iterate through items in that sales order
      for (const item of order.items) {
        // Find the BOM for the finished product in the sales order
        const bomForOrderedProduct = boms.find(b => b.productId === item.productId);
        if (bomForOrderedProduct) {
          // Check if the current component (productId) is in that BOM
          const bomItem = bomForOrderedProduct.items.find(bi => bi.productId === productId);
          if (bomItem) {
            // If it is, add the required quantity for that sales order item to our total
            requiredQty += bomItem.quantity * item.quantity;
          }
        }
      }
    }
    return requiredQty;
  }, [orders, products, boms]);


  const getAllottedForWIP = React.useCallback((product: Product) => {
    if (!workOrders) return 0;

    // If the product is a Finished Good or Assembly, WIP is the quantity in active work orders
    if (product.type === 'Finished Goods' || product.type === 'Assembly') {
      return workOrders
        .filter(wo => wo.status === 'In Progress' && wo.productId === product.id)
        .reduce((sum, wo) => sum + wo.quantity, 0);
    }

    // If the product is a Raw Material or Component, WIP is the quantity already issued to active work orders
    if (product.type === 'Raw Materials' || product.type === 'Components') {
      return workOrders
        .filter(wo => wo.status === 'In Progress')
        .flatMap(wo => wo.issuedItems || [])
        .filter(item => item.productId === product.id)
        .reduce((sum, item) => sum + item.issuedQty, 0);
    }
    
    return 0;
  }, [workOrders]);

  const getDeliveredQty = React.useCallback((productId: string) => {
    if (!orders) return 0;
    return orders
      .filter(order => order.status === 'Delivered')
      .flatMap(order => order.items)
      .filter(item => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }, [orders]);


  const handleCreatePurchaseRequest = async (product: Product, quantity: number) => {
    if (quantity <= 0) {
        toast({ variant: 'destructive', title: 'Invalid Quantity' });
        return;
    }
    if (!settingsData?.prefixes || !authUser) {
        toast({ variant: 'destructive', title: 'Configuration Error', description: 'Document prefixes not set or user not found.' });
        return;
    }

    try {
        const docTypeKey = 'Purchase Request'; 
        
        const newPrId = getNextDocNumber(docTypeKey, settingsData?.prefixes, requests || []);

        const prData = {
            id: newPrId,
            productId: product.id,
            productName: product.name,
            quantity: quantity,
            rate: product.cost || 0,
            requestDate: new Date().toISOString(),
            requestedBy: authUser.displayName || 'Admin User',
            status: 'Pending' as RequestStatus,
            createdAt: serverTimestamp(),
        };

        await setDoc(doc(firestore, 'purchaseRequests', newPrId), prData);
        
        toast({ title: "Success", description: `Created ${newPrId}` });
    } catch (error) {
        console.error("Error creating purchase request:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to create PR' });
    }
  };

  const handleOpenRequestDialog = (product: Product, plannedQty: number) => {
    setRequestingProduct({ product, plannedQty });
    setIsRequestDialogOpen(true);
  };
  
  const handleSubmitRequest = () => {
    if (requestingProduct && requestQuantity) {
        const qty = Number(requestQuantity);
        if (qty > 0) {
            handleCreatePurchaseRequest(requestingProduct.product, qty);
            setIsRequestDialogOpen(false);
        }
    }
  };
  
    const kpis = React.useMemo(() => {
    if (!products || !orders || !workOrders) return { totalProducts: 0, itemsBelowMin: 0, totalStockValue: 0, totalToProcure: 0 };

    const itemsBelowMin = products.filter(p => {
      const stockAvailable = p.openingStock - getDeliveredQty(p.id);
      return stockAvailable < (p.minStockLevel || 0);
    }).length;

    const totalStockValue = products.reduce((acc, p) => {
      const stockAvailable = p.openingStock - getDeliveredQty(p.id);
      return acc + (stockAvailable * (p.cost || 0));
    }, 0);

    const totalToProcure = products.filter(p => p.source === 'Bought').reduce((acc, p) => {
      const stockAvailable = p.openingStock - getDeliveredQty(p.id);
      const wip = getAllottedForWIP(p);
      const orderInHand = getOrderInHand(p.id);
      const minStock = p.minStockLevel || 0;
      const plannedQty = Math.max(0, (orderInHand - (stockAvailable + wip)) + minStock);
      return acc + plannedQty;
    }, 0);
    
    return {
      totalProducts: products.length,
      itemsBelowMin,
      totalStockValue,
      totalToProcure
    };
  }, [products, orders, workOrders, getDeliveredQty, getAllottedForWIP, getOrderInHand]);


  return (
    <>
      <PageHeader title="Stocks" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                    <Boxes className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.totalProducts}</div>
                    <p className="text-xs text-muted-foreground">Unique items in inventory</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Items Below Min. Stock</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.itemsBelowMin}</div>
                    <p className="text-xs text-muted-foreground">Items needing reordering</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
                    <Archive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">₹{kpis.totalStockValue.toLocaleString('en-IN')}</div>
                    <p className="text-xs text-muted-foreground">Based on cost price</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Qty. to Procure</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpis.totalToProcure}</div>
                    <p className="text-xs text-muted-foreground">Total planned purchase quantity</p>
                </CardContent>
            </Card>
        </div>
      <Card>
        <CardHeader>
          <CardTitle>Inventory Stock Levels</CardTitle>
          <CardDescription>
            Monitor stock levels for items and create purchase requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20%]">Product</TableHead>
                <FilterHeader title="Type" width="w-[10%]" filterValues={typeFilters} allValues={allTypes} onFilterChange={handleTypeFilterChange} />
                <FilterHeader title="Category" width="w-[10%]" filterValues={categoryFilters} allValues={allCategories} onFilterChange={handleCategoryFilterChange} />
                <FilterHeader title="Source" width="w-[10%]" filterValues={sourceFilters} allValues={allSources} onFilterChange={handleSourceFilterChange} />
                <TableHead className="text-center w-[8%]">Stock</TableHead>
                <TableHead className="text-center w-[8%]">Min. Stock</TableHead>
                <TableHead className="text-center w-[8%]">Req. for Order</TableHead>
                <TableHead className="text-center w-[8%]">WIP</TableHead>
                <TableHead className="text-center w-[8%]">Planned Qty</TableHead>
                <TableHead className="text-right w-[10%]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsLoading ? (
                 <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center">
                    Loading products...
                  </TableCell>
                </TableRow>
              ) : filteredProducts.map((product) => {
                const stockAvailable = product.openingStock - getDeliveredQty(product.id);
                const orderInHand = getOrderInHand(product.id);
                const wip = getAllottedForWIP(product);
                const minStock = product.minStockLevel || 0;
                
                const plannedQty = Math.max(0, (orderInHand - (stockAvailable + wip)) + minStock);
                const stockBelowMin = stockAvailable < minStock;

                return (
                  <TableRow key={product.id} className={cn(stockBelowMin && 'bg-red-50 dark:bg-red-900/20')}>
                    <TableCell>
                      <div className="flex items-center gap-4">
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          width={48}
                          height={48}
                          className="rounded-md object-cover"
                          data-ai-hint={product.imageHint}
                        />
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{product.sku}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{product.type}</TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>{product.source}</TableCell>
                    <TableCell className={cn("text-center font-mono", stockBelowMin && "text-red-600 font-bold")}>
                        <div className="flex items-center justify-center gap-2">
                            {stockBelowMin && <AlertCircle className="h-4 w-4" />}
                            {stockAvailable}
                        </div>
                    </TableCell>
                    <TableCell className="text-center font-mono">{minStock}</TableCell>
                    <TableCell className="text-center font-mono">{orderInHand}</TableCell>
                    <TableCell className="text-center font-mono">{wip}</TableCell>
                    <TableCell className="text-center font-mono font-bold text-blue-600">{plannedQty}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => handleOpenRequestDialog(product, plannedQty)} disabled={product.source === 'Made' || plannedQty <= 0}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Request
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
       <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Create Purchase Request</DialogTitle>
                <DialogDescription>
                    Enter the quantity for {requestingProduct?.product.name}.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label htmlFor="request-quantity">Quantity</Label>
                <Input 
                    id="request-quantity" 
                    type="number" 
                    value={requestQuantity}
                    onChange={(e) => setRequestQuantity(e.target.value)}
                    placeholder="Enter quantity"
                />
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleSubmitRequest}>Submit Request</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function StocksPageWrapper() {
    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return (
             <>
                <PageHeader title="Stocks" />
                <Card>
                    <CardHeader>
                        <CardTitle>Inventory Stock Levels</CardTitle>
                        <CardDescription>
                            Monitor stock levels for items you purchase and create purchase requests.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-48">Loading stock data...</div>
                    </CardContent>
                </Card>
            </>
        )
    }

    return <StocksPageContent />;
}

