

'use client';

import * as React from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, MoreHorizontal, FileText, Trash2, Box, Layers, FileUp, Camera, Save } from 'lucide-react';
import type { BillOfMaterial, BomItem, Product, QcCheckPoint, ProductCategory, ProductUnit, ProductionTask, User } from '@/lib/types';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useCollection, useDoc, useStorage } from '@/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { getNextDocNumber } from '@/lib/number-series';
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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';


const finishedGoodsTypes: Product['type'][] = ['Finished Goods', 'Assembly'];
const allUnits: ProductUnit[] = ['Kgs', 'Ltrs', 'Nos', 'Sets', 'Pairs', 'Mtr', 'Fts', 'Rmt', 'Rft'];


export default function BillsOfMaterialPage() {
    const { toast } = useToast();
    const router = useRouter();
    const firestore = useFirestore();
    const { data: boms, loading: bomsLoading } = useCollection<BillOfMaterial>(collection(firestore, 'boms'));
    const { data: productCategories, loading: categoriesLoading } = useCollection<ProductCategory>(collection(firestore, 'productCategories'));
    const { data: products, loading: productsLoading } = useCollection<Product>(collection(firestore, 'products'));
    const { data: users, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
    const { data: settingsData } = useDoc<any>(doc(firestore, 'company', 'settings'));
    const storage = useStorage();


    const [isDialogOpen, setIsDialogOpen] = React.useState(false);
    const [editingBom, setEditingBom] = React.useState<BillOfMaterial | null>(null);

    const [selectedType, setSelectedType] = React.useState<string>('');
    const [selectedCategory, setSelectedCategory] = React.useState<string>('');
    const [selectedProduct, setSelectedProduct] = React.useState('');
    const [componentItems, setComponentItems] = React.useState<Partial<BomItem>[]>([
      { productId: '', quantity: 1, unit: 'pcs', partNumber: '', rate: 0, amount: 0 }
    ]);
    const [assemblyItems, setAssemblyItems] = React.useState<Partial<BomItem>[]>([]);
    const [qcCheckPoints, setQcCheckPoints] = React.useState<Partial<QcCheckPoint>[]>([]);
    const [productionTasks, setProductionTasks] = React.useState<Partial<ProductionTask>[]>([]);
    const [taskAttachments, setTaskAttachments] = React.useState<Record<string, File | null>>({});
    
    const componentsAndRaw = React.useMemo(() => {
      if (!products) return [];
      return products.filter(p => p.type === 'Raw Materials' || p.type === 'Components' || p.type === 'Consumables');
    }, [products]);

    const assemblyProducts = React.useMemo(() => {
        if (!products) return [];
        return products.filter(p => p.type === 'Assembly');
    }, [products]);
    
    const employees = React.useMemo(() => {
      if (!users) return [];
      return users.filter(u => u.role === 'Employee' || u.role.includes('Manager'));
    }, [users]);


    const kpis = React.useMemo(() => {
        if (!boms) return { totalBoms: 0, productsWithBoms: 0, totalComponents: 0 };
        const totalBoms = boms.length;
        const productsWithBoms = new Set(boms.map(b => b.productId)).size;
        const totalComponents = boms.reduce((sum, bom) => sum + bom.items.length, 0);
        return { totalBoms, productsWithBoms, totalComponents };
    }, [boms]);

    const categoriesForType = React.useMemo(() => {
        if (!selectedType || !productCategories) return [];
        return productCategories.map(c => c.name);
    }, [selectedType, productCategories]);

    const productsForFilter = React.useMemo(() => {
        if (!selectedType || !selectedCategory || !products) return [];
        return products.filter(p => p.type === selectedType && p.category === selectedCategory);
    }, [selectedType, selectedCategory, products]);

    React.useEffect(() => {
        const bomProductJSON = localStorage.getItem('bomProduct');
        if (bomProductJSON) {
            try {
                const bomProduct: Product = JSON.parse(bomProductJSON);
                setEditingBom(null); // Ensure we're in create mode
                setSelectedType(bomProduct.type);
                // Use a timeout to allow dependent state updates to propagate
                setTimeout(() => {
                    setSelectedCategory(bomProduct.category);
                    setSelectedProduct(bomProduct.id);
                }, 0);
                setComponentItems([{ productId: '', quantity: 1, unit: 'pcs', partNumber: '', rate: 0, amount: 0 }]);
                setAssemblyItems([]);
                setQcCheckPoints([{ checkPoint: '', method: '', details: '' }]);
                setProductionTasks([{ taskName: '', assigneeId: '', duration: 0 }]);
                setIsDialogOpen(true);
            } catch (error) {
                console.error("Failed to parse BOM product data:", error);
            } finally {
                localStorage.removeItem('bomProduct');
            }
        }
    }, []);

    React.useEffect(() => {
        if (isDialogOpen) {
            if (editingBom) {
                const product = products?.find(p => p.id === editingBom.productId);
                if (product) {
                    setSelectedType(product.type);
                    setTimeout(() => {
                        setSelectedCategory(product.category);
                        setSelectedProduct(editingBom.productId);
                    }, 0);
                }
                const bomAssemblies = editingBom.items.filter(item => assemblyProducts.some(ap => ap.id === item.productId));
                const bomComponents = editingBom.items.filter(item => !assemblyProducts.some(ap => ap.id === item.productId));
                setAssemblyItems(bomAssemblies);
                setComponentItems(bomComponents);
                setQcCheckPoints(editingBom.qcCheckPoints || [{ checkPoint: '', method: '', details: '' }]);
                setProductionTasks(editingBom.productionTasks || [{ taskName: '', assigneeId: '', duration: 0 }]);
            } else if (!localStorage.getItem('bomProduct')) { // Don't reset if pre-filling
                setSelectedType('');
                setSelectedCategory('');
                setSelectedProduct('');
                setComponentItems([{ productId: '', quantity: 1, unit: 'pcs', partNumber: '', rate: 0, amount: 0 }]);
                setAssemblyItems([]);
                setQcCheckPoints([{ checkPoint: '', method: '', details: '' }]);
                setProductionTasks([{ taskName: '', assigneeId: '', duration: 0 }]);
            }
        }
    }, [isDialogOpen, editingBom, products, assemblyProducts]);
    
    const handleTypeChange = (type: string) => {
        setSelectedType(type);
        setSelectedCategory('');
        setSelectedProduct('');
    }

    const handleCategoryChange = (category: string) => {
        setSelectedCategory(category);
        setSelectedProduct('');
    }

    const handleItemChange = (
      index: number,
      field: keyof BomItem,
      value: string | number,
      itemType: 'component' | 'assembly'
    ) => {
      const setItems = itemType === 'component' ? setComponentItems : setAssemblyItems;
      setItems(prevItems => {
        const newItems = [...prevItems];
        const item = newItems[index];
        (item as any)[field] = value;

        if (field === 'productId') {
          const product = products?.find(p => p.id === value);
          if (product) {
            item.productName = product.name;
            item.rate = product.price;
          }
        }
        
        if (item.quantity && item.rate) {
            item.amount = item.quantity * item.rate;
        }

        return newItems;
      });
    };
    
    const createItemHandler = (itemType: 'component' | 'assembly') => {
        return (index: number, field: keyof BomItem, value: string | number) => {
             handleItemChange(index, field, value, itemType);
        }
    };
    const handleComponentItemChange = createItemHandler('component');
    const handleAssemblyItemChange = createItemHandler('assembly');

    const handleAddItem = (itemType: 'component' | 'assembly') => {
        const newItem: Partial<BomItem> = { productId: '', quantity: 1, unit: 'pcs', partNumber: '', rate: 0, amount: 0 };
        if (itemType === 'component') {
            setComponentItems(prev => [...prev, newItem]);
        } else {
            setAssemblyItems(prev => [...prev, newItem]);
        }
    };

    const handleRemoveItem = (index: number, itemType: 'component' | 'assembly') => {
        if (itemType === 'component') {
            setComponentItems(prev => prev.filter((_, i) => i !== index));
        } else {
            setAssemblyItems(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleQcPointChange = (index: number, field: keyof Omit<QcCheckPoint, 'id'>, value: string) => {
        const newQcPoints = [...qcCheckPoints];
        newQcPoints[index] = { ...newQcPoints[index], [field]: value };
        setQcCheckPoints(newQcPoints);
    };

    const addQcPoint = () => {
        setQcCheckPoints(prev => [...prev, { checkPoint: '', method: '', details: '' }]);
    };

    const removeQcPoint = (index: number) => {
        setQcCheckPoints(prev => prev.filter((_, i) => i !== index));
    };

    const handleTaskChange = (index: number, field: 'taskName' | 'assigneeId', value: string) => {
      const newTasks = [...productionTasks];
      (newTasks[index] as any)[field] = value;
      setProductionTasks(newTasks);
    };

    const handleDurationChange = (index: number, value: string) => {
        const newTasks = [...productionTasks];
        const cleanedValue = value.replace(/[^0-9]/g, '');
        
        let hh = cleanedValue.substring(0, 2);
        let mm = cleanedValue.substring(2, 4);

        if (parseInt(hh, 10) > 99) hh = '99';
        if (parseInt(mm, 10) > 59) mm = '59';

        const minutes = (parseInt(hh, 10) || 0) * 60 + (parseInt(mm, 10) || 0);

        (newTasks[index] as any).duration = minutes;
        setProductionTasks(newTasks);
    };
    
    const handleAttachmentChange = (index: number, file: File | null) => {
        setTaskAttachments(prev => ({...prev, [`task-${index}`]: file}));
    };

    const formatDuration = (minutes: number | undefined): string => {
        if (minutes === undefined || isNaN(minutes)) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    };

    const addTask = () => {
        setProductionTasks(prev => [...prev, { taskName: '', assigneeId: '', duration: 0 }]);
    };

    const removeTask = (index: number) => {
        setProductionTasks(prev => prev.filter((_, i) => i !== index));
        setTaskAttachments(prev => {
            const newAttachments = {...prev};
            delete newAttachments[`task-${index}`];
            return newAttachments;
        });
    };


    const totalCost = React.useMemo(() => {
        const componentsCost = componentItems.reduce((acc, item) => acc + (item.amount || 0), 0);
        const assembliesCost = assemblyItems.reduce((acc, item) => acc + (item.amount || 0), 0);
        return componentsCost + assembliesCost;
    }, [componentItems, assemblyItems]);

    const handleSaveBom = async () => {
        const allItems = [...componentItems, ...assemblyItems];
        if (!selectedProduct || allItems.length === 0 || allItems.some(item => !item.productId || !item.quantity)) {
            toast({
                variant: 'destructive',
                title: 'Missing Information',
                description: 'Please select a finished product and complete all item details.',
            });
            return;
        }

        const finishedProduct = products?.find(p => p.id === selectedProduct);
        if (!finishedProduct) return;
        
        let bomId;
        if (editingBom) {
          bomId = editingBom.id;
        } else {
          bomId = getNextDocNumber('BOM', settingsData?.prefixes, boms || []);
        }

        // Upload attachments first
        const attachmentUrls: Record<string, string> = {};
        for (const [key, file] of Object.entries(taskAttachments)) {
            if (file) {
                const storageRef = ref(storage, `boms/${bomId}/tasks/${key}-${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                attachmentUrls[key] = await getDownloadURL(snapshot.ref);
            }
        }
        
        const finalBomItems = allItems.map((item, index) => ({
            id: item.id || `item-${Date.now()}-${index}`,
            productId: item.productId!,
            productName: item.productName!,
            partNumber: item.partNumber || '',
            quantity: Number(item.quantity) || 0,
            unit: item.unit || 'pcs',
            rate: item.rate || 0,
            amount: item.amount || 0,
            assigneeId: item.assigneeId || '',
        }));
        
        const finalQcPoints = qcCheckPoints
            .filter(qc => qc.checkPoint)
            .map((qc, index) => ({
                id: qc.id || `qc-${Date.now()}-${index}`,
                checkPoint: qc.checkPoint!,
                method: qc.method!,
                details: qc.details!,
            }));
            
        const finalProductionTasks = productionTasks
            .filter(task => task.taskName && task.assigneeId && task.duration)
            .map((task, index) => ({
                id: task.id || `task-${Date.now()}-${index}`,
                taskName: task.taskName!,
                assigneeId: task.assigneeId!,
                duration: Number(task.duration) || 0,
                attachmentUrl: attachmentUrls[`task-${index}`] || task.attachmentUrl || '',
            }));
        
        const bomData = {
            id: bomId,
            productId: selectedProduct,
            productName: finishedProduct.name,
            items: finalBomItems,
            createdAt: editingBom ? editingBom.createdAt : new Date().toISOString(),
            qcCheckPoints: finalQcPoints,
            productionTasks: finalProductionTasks,
        };

        if (editingBom) {
            await setDoc(doc(firestore, 'boms', bomId), bomData, { merge: true });
            toast({ title: 'BOM Updated', description: `BOM for "${finishedProduct.name}" has been updated.` });
        } else {
            await setDoc(doc(firestore, 'boms', bomId), bomData);
            toast({ title: 'BOM Created', description: `A new BOM for "${finishedProduct.name}" has been created.` });
        }

        setIsDialogOpen(false);
        setEditingBom(null);
    };

    const handleEdit = (bom: BillOfMaterial) => {
        setEditingBom(bom);
        setIsDialogOpen(true);
    };

    const handleViewBom = (bomId: string) => {
        router.push(`/dashboard/production/bills-of-material/view?id=${bomId}`);
    };
    
    const handleDelete = async (bomId: string) => {
        if (!firestore) return;
        try {
            await deleteDoc(doc(firestore, 'boms', bomId));
            toast({
                title: 'BOM Deleted',
                description: 'The Bill of Material has been successfully deleted.',
            });
        } catch (error) {
            console.error('Error deleting BOM:', error);
            toast({
                variant: 'destructive',
                title: 'Deletion Failed',
                description: 'Could not delete the BOM. Please try again.',
            });
        }
    };

  return (
    <>
      <PageHeader title="Bills of Material">
        <Button onClick={() => setIsDialogOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create BOM
        </Button>
      </PageHeader>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total BOMs Created</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalBoms}</div>
            <p className="text-xs text-muted-foreground">All defined Bills of Material.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products with BOMs</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.productsWithBoms}</div>
            <p className="text-xs text-muted-foreground">Unique products with a defined BOM.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Components</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalComponents}</div>
            <p className="text-xs text-muted-foreground">Sum of all items across all BOMs.</p>
          </CardContent>
        </Card>
      </div>

        <Card>
            <CardHeader>
                <CardTitle>BOM Management</CardTitle>
                <CardDescription>
                Define and manage the components required for each of your products.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Finished Product</TableHead>
                            <TableHead>BOM ID</TableHead>
                            <TableHead>Number of Components</TableHead>
                            <TableHead>Created At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {bomsLoading ? (
                          <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading BOMs...</TableCell></TableRow>
                        ) : boms?.map((bom) => (
                            <TableRow key={bom.id}>
                                <TableCell className="font-medium">{bom.productName}</TableCell>
                                <TableCell className="font-mono">{bom.id}</TableCell>
                                <TableCell>{bom.items.length}</TableCell>
                                <TableCell>{format(new Date(bom.createdAt), 'dd/MM/yyyy')}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => handleViewBom(bom.id)}>View BOM</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleEdit(bom)}>Edit</DropdownMenuItem>
                                             <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/40">
                                                        Delete
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                        This action cannot be undone. This will permanently delete the BOM for "{bom.productName}".
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(bom.id)} className={buttonVariants({ variant: 'destructive' })}>
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
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>{editingBom ? 'Edit' : 'Create'} Bill of Material</DialogTitle>
                    <DialogDescription>
                        Define the list of raw materials and components for a finished product.
                    </DialogDescription>
                </DialogHeader>
                 <ScrollArea className="max-h-[70vh] -mx-6 px-6">
                    <div className="py-4 space-y-4 px-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="product-type">Type</Label>
                                <Select value={selectedType} onValueChange={handleTypeChange} disabled={editingBom !== null}>
                                    <SelectTrigger id="product-type">
                                        <SelectValue placeholder="Select a type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {finishedGoodsTypes.map(type => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="product-category">Category</Label>
                                <Select value={selectedCategory} onValueChange={handleCategoryChange} disabled={!selectedType || editingBom !== null}>
                                    <SelectTrigger id="product-category">
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categoriesForType.map(cat => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="finished-product">Finished Product</Label>
                                <Select value={selectedProduct} onValueChange={setSelectedProduct} disabled={!selectedCategory || editingBom !== null}>
                                    <SelectTrigger id="finished-product">
                                        <SelectValue placeholder="Select a product" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {productsForFilter.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t">
                            <h4 className="font-medium">Components & Raw Materials</h4>
                            <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[30%]">Component</TableHead>
                                    <TableHead className="w-[20%]">Issue To</TableHead>
                                    <TableHead className="w-[10%]">Qty</TableHead>
                                    <TableHead className="w-[10%]">Unit</TableHead>
                                    <TableHead className="w-[10%]">Rate</TableHead>
                                    <TableHead className="w-[10%]">Total</TableHead>
                                    <TableHead className="w-[10%]"></TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {componentItems.map((item, index) => (
                                    <TableRow key={`comp-${index}`}>
                                    <TableCell>
                                        <Select value={item.productId} onValueChange={(value) => handleComponentItemChange(index, 'productId', value)}>
                                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                        <SelectContent>
                                            {componentsAndRaw.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Select value={item.assigneeId} onValueChange={(value) => handleComponentItemChange(index, 'assigneeId', value)}>
                                            <SelectTrigger><SelectValue placeholder="Assign" /></SelectTrigger>
                                            <SelectContent>
                                                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Input type="number" value={item.quantity} onChange={(e) => handleComponentItemChange(index, 'quantity', Number(e.target.value))} />
                                    </TableCell>
                                    <TableCell>
                                        <Select value={item.unit || 'pcs'} onValueChange={(value) => handleComponentItemChange(index, 'unit', value)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                     <TableCell>
                                        <Input type="number" readOnly value={item.rate?.toFixed(2) || '0.00'} className="bg-muted/50" />
                                    </TableCell>
                                     <TableCell>
                                        <Input type="number" readOnly value={item.amount?.toFixed(2) || '0.00'} className="bg-muted/50" />
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(index, 'component')}><Trash2 className="h-4 w-4" /></Button>
                                    </TableCell>
                                    </TableRow>
                                ))}
                                </TableBody>
                            </Table>
                            <Button variant="outline" size="sm" onClick={() => handleAddItem('component')} className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Component
                            </Button>
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t">
                            <h4 className="font-medium">Sub-Assemblies</h4>
                            <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[30%]">Assembly</TableHead>
                                    <TableHead className="w-[20%]">Issue To</TableHead>
                                    <TableHead className="w-[10%]">Qty</TableHead>
                                    <TableHead className="w-[10%]">Unit</TableHead>
                                    <TableHead className="w-[10%]">Rate</TableHead>
                                    <TableHead className="w-[10%]">Total</TableHead>
                                    <TableHead className="w-[10%]"></TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {assemblyItems.map((item, index) => {
                                    return (
                                        <TableRow key={`asm-${index}`}>
                                            <TableCell>
                                                <Select value={item.productId} onValueChange={(value) => handleAssemblyItemChange(index, 'productId', value)}>
                                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                                <SelectContent>
                                                    {assemblyProducts.map(p => (
                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                                </Select>
                                            </TableCell>
                                             <TableCell>
                                                <Select value={item.assigneeId} onValueChange={(value) => handleAssemblyItemChange(index, 'assigneeId', value)}>
                                                    <SelectTrigger><SelectValue placeholder="Assign" /></SelectTrigger>
                                                    <SelectContent>
                                                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Input type="number" value={item.quantity} onChange={(e) => handleAssemblyItemChange(index, 'quantity', Number(e.target.value))} />
                                            </TableCell>
                                            <TableCell>
                                                <Select value={item.unit || 'pcs'} onValueChange={(value) => handleAssemblyItemChange(index, 'unit', value)}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Input type="number" readOnly value={item.rate?.toFixed(2) || '0.00'} className="bg-muted/50" />
                                            </TableCell>
                                             <TableCell>
                                                <Input type="number" readOnly value={item.amount?.toFixed(2) || '0.00'} className="bg-muted/50" />
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(index, 'assembly')}><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                                </TableBody>
                            </Table>
                            <Button variant="outline" size="sm" onClick={() => handleAddItem('assembly')} className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Assembly
                            </Button>
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t">
                            <h4 className="font-medium">QC Check Points</h4>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[30%]">Check Point</TableHead>
                                        <TableHead className="w-[30%]">Method</TableHead>
                                        <TableHead className="w-[30%]">Details</TableHead>
                                        <TableHead className="w-[10%]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {qcCheckPoints.map((qc, index) => (
                                        <TableRow key={`qc-${index}`}>
                                            <TableCell>
                                                <Input placeholder="e.g., Frame Integrity" value={qc.checkPoint} onChange={(e) => handleQcPointChange(index, 'checkPoint', e.target.value)} />
                                            </TableCell>
                                            <TableCell>
                                                <Input placeholder="e.g., Visual Inspection" value={qc.method} onChange={(e) => handleQcPointChange(index, 'method', e.target.value)} />
                                            </TableCell>
                                            <TableCell>
                                                <Textarea placeholder="e.g., Check for cracks" value={qc.details} onChange={(e) => handleQcPointChange(index, 'details', e.target.value)} rows={1} />
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeQcPoint(index)}><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Button variant="outline" size="sm" onClick={addQcPoint} className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4" /> Add QC Check Point
                            </Button>
                        </div>

                        <div className="space-y-4 pt-4 border-t">
                            <h4 className="font-medium">Production Tasks</h4>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[30%]">Task Name</TableHead>
                                        <TableHead className="w-[25%]">Assign To</TableHead>
                                        <TableHead className="w-[15%]">Duration</TableHead>
                                        <TableHead className="w-[20%]">Attachment</TableHead>
                                        <TableHead className="w-[10%]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {productionTasks.map((task, index) => (
                                        <TableRow key={`task-${index}`}>
                                            <TableCell>
                                                <Input placeholder="e.g., Assemble Frame" value={task.taskName} onChange={(e) => handleTaskChange(index, 'taskName', e.target.value)} />
                                            </TableCell>
                                            <TableCell>
                                                <Select value={task.assigneeId} onValueChange={(value) => handleTaskChange(index, 'assigneeId', value)}>
                                                    <SelectTrigger><SelectValue placeholder="Select Employee"/></SelectTrigger>
                                                    <SelectContent>
                                                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Input type="text" placeholder="00:30" value={formatDuration(task.duration)} onChange={(e) => handleDurationChange(index, e.target.value)} />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="file"
                                                    className="text-xs"
                                                    onChange={(e) => handleAttachmentChange(index, e.target.files ? e.target.files[0] : null)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeTask(index)}><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Button variant="outline" size="sm" onClick={addTask} className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Production Task
                            </Button>
                        </div>

                        <div className="pt-4 border-t">
                            <div className="flex justify-end items-center gap-4">
                                <h4 className="font-semibold">Total Production Cost:</h4>
                                <span className="text-xl font-bold font-mono">
                                    ₹{totalCost.toFixed(2)}
                                </span>
                            </div>
                        </div>

                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleSaveBom}>Save BOM</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  );
}
