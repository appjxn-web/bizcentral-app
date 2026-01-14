
'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, PlusCircle, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Party, Product, ProductCategory, ProductUnit, CoaGroup, CoaLedger } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileUp, Camera, Image as ImageIcon, ChevronsUpDown, Check } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Image from 'next/image';
import { Switch } from '@/components/ui/switch';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useRole } from '../../_components/role-provider';
import { useFirestore, useCollection, useStorage } from '@/firebase';
import { collection, query, where, addDoc, doc, updateDoc, setDoc, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';


type ChildPart = {
  name: string;
  months: number;
}

export type ProductFormData = Omit<Product, 'id' | 'imageUrl'> & {
    price: string | number;
    cost: string | number;
    warrantyMonths: number | string;
    childParts: ChildPart[];
    saleable: boolean;
    minStockLevel: number | string;
    preferredSupplierIds?: string[];
    brand?: string;
    hsn?: string;
    heroLine?: string;
};

interface AddCategoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (categoryName: string) => void;
}

function AddCategoryDialog({ open, onOpenChange, onSave }: AddCategoryDialogProps) {
    const [name, setName] = React.useState('');

    const handleSave = () => {
        if (name.trim()) {
            onSave(name.trim());
            onOpenChange(false);
            setName('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create New Category</DialogTitle>
                    <DialogDescription>
                        Enter the name for the new product category.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="category-name">Category Name</Label>
                    <Input 
                        id="category-name" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Laptops, Keyboards"
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button type="button" onClick={handleSave}>Save Category</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productToEdit: Product | null;
  isDuplicate: boolean;
}

const defaultState: ProductFormData = {
  name: '',
  heroLine: '',
  brand: '',
  description: '',
  price: '',
  cost: '',
  type: 'Finished Goods',
  category: '',
  sku: '',
  hsn: '',
  source: 'Bought',
  openingStock: 0,
  unit: 'Nos',
  minStockLevel: '',
  status: 'Active',
  version: '',
  modelNumber: '',
  warrantyMonths: '',
  childParts: [],
  saleable: true,
  coaAccountId: '',
  preferredSupplierIds: [],
  videoUrl: '',
};

const allUnits: ProductUnit[] = ['Kgs', 'Ltrs', 'Nos', 'Sets', 'Pairs', 'Mtr', 'Fts', 'Rmt', 'Rft'];

export function AddProductDialog({ open, onOpenChange, productToEdit, isDuplicate }: AddProductDialogProps) {
  const { toast } = useToast();
  const { currentRole } = useRole();
  const firestore = useFirestore();
  const storage = useStorage();
  const { data: parties } = useCollection<Party>(collection(firestore, 'parties'));
  const { data: productCategories } = useCollection<ProductCategory>(collection(firestore, 'productCategories'));
  
  const { data: coaGroups } = useCollection<CoaGroup>(query(collection(firestore, 'coa_groups'), orderBy('path')));
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const [productData, setProductData] = React.useState<ProductFormData>(defaultState);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = React.useState(false);
  
  const isEditMode = !!productToEdit && !isDuplicate;

  // Camera state
  const [isCameraDialogOpen, setIsCameraDialogOpen] = React.useState(false);
  const [cameraFor, setCameraFor] = React.useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | undefined>(undefined);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  
  const [imageFiles, setImageFiles] = React.useState<Record<string, File | null>>({});
  const [imagePreviews, setImagePreviews] = React.useState<Record<string, string>>({});
  const [supplierComboboxOpen, setSupplierComboboxOpen] = React.useState(false);

  const fileInputRefs = {
    hero: React.useRef<HTMLInputElement>(null),
    optional1: React.useRef<HTMLInputElement>(null),
    optional2: React.useRef<HTMLInputElement>(null),
    optional3: React.useRef<HTMLInputElement>(null),
  };

  React.useEffect(() => {
    if (open) {
      if (productToEdit) {
        setProductData({
          ...productToEdit,
          name: isDuplicate ? `${productToEdit.name} (Copy)` : productToEdit.name,
          sku: isDuplicate ? '' : productToEdit.sku,
          price: productToEdit.price.toString(),
          cost: productToEdit.cost?.toString() || '',
          warrantyMonths: productToEdit.warranty?.months.toString() || '',
          childParts: productToEdit.warranty?.childParts || [],
          saleable: productToEdit.saleable ?? true,
          minStockLevel: productToEdit.minStockLevel?.toString() || '',
          coaAccountId: productToEdit.coaAccountId || '',
          preferredSupplierIds: productToEdit.preferredSupplierIds || [],
          brand: productToEdit.brand || '',
          hsn: productToEdit.hsn || '',
          heroLine: productToEdit.heroLine || '',
          videoUrl: productToEdit.videoUrl || '',
        });
        const previews: Record<string, string> = {};
        if (productToEdit.imageUrl) previews.hero = productToEdit.imageUrl;
        if (productToEdit.imageUrl2) previews.optional1 = productToEdit.imageUrl2;
        if (productToEdit.imageUrl3) previews.optional2 = productToEdit.imageUrl3;
        if (productToEdit.imageUrl4) previews.optional3 = productToEdit.imageUrl4;
        setImagePreviews(previews);

      } else {
        setProductData(defaultState);
        setImagePreviews({});
        setImageFiles({});
      }
    }
  }, [open, productToEdit, isDuplicate]);
  
  React.useEffect(() => {
    if (isCameraDialogOpen) {
      const getCameraPermission = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          setHasCameraPermission(true);

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error('Error accessing camera:', error);
          setHasCameraPermission(false);
        }
      };

      getCameraPermission();

      return () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
      }
    }
  }, [isCameraDialogOpen]);

  const handleInputChange = (field: keyof ProductFormData, value: string | number | boolean) => {
    setProductData(prev => ({ ...prev, [field]: value }));
  };
  
  const handleSelectChange = (field: keyof Omit<ProductFormData, 'childParts' | 'preferredSupplierIds'>) => (value: string) => {
      setProductData(prev => ({ ...prev, [field]: value as any}));
  }

  const handleMultiSelectChange = (field: 'preferredSupplierIds', id: string) => {
    setProductData(prev => {
        const currentSelection = prev[field] || [];
        const newSelection = currentSelection.includes(id)
            ? currentSelection.filter(selectedId => selectedId !== id)
            : [...currentSelection, id];
        return { ...prev, [field]: newSelection };
    });
  };

  const uploadImage = async (productId: string, imageKey: string, imageFile: File): Promise<string> => {
    const storageRef = ref(storage, `products/${productId}/${imageKey}-${imageFile.name}`);
    const snapshot = await uploadBytes(storageRef, imageFile);
    return await getDownloadURL(snapshot.ref);
  };

  const handleSave = async () => {
    if (!productData.name || !productData.price || !productData.sku) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill in the product name, price, and SKU.',
      });
      return;
    }

    let productId: string;
    let successMessage: { title: string, description: string };

    const newDocRef = doc(collection(firestore, 'products'));
    if (isEditMode) {
      productId = productToEdit.id;
      successMessage = { title: 'Product Updated', description: `The product "${productData.name}" has been successfully updated.` };
    } else {
      productId = newDocRef.id;
      if (isDuplicate) {
          successMessage = { title: 'Product Duplicated', description: `A new product "${productData.name}" has been created.` };
      } else {
          successMessage = { title: 'Product Created', description: `The product "${productData.name}" has been successfully created.` };
      }
    }
    
    // Image upload logic
    const imageUrls: Partial<Record<keyof Product, string>> = {};
    const uploadPromises = Object.entries(imageFiles).map(async ([key, file]) => {
      if (file) {
        toast({ title: `Uploading ${key} image...` });
        const url = await uploadImage(productId, key, file);
        const firestoreKey = key === 'hero' ? 'imageUrl' : `imageUrl${Number(key.replace('optional', '')) + 1}`;
        imageUrls[firestoreKey as keyof Product] = url;
      }
    });

    await Promise.all(uploadPromises);


    const { warrantyMonths, childParts, ...restOfData } = productData;

    const finalProductData: Omit<Product, 'id'> = {
      ...restOfData,
      price: Number(productData.price) || 0,
      cost: Number(productData.cost) || 0,
      openingStock: Number(productData.openingStock) || 0,
      minStockLevel: Number(productData.minStockLevel) || 0,
      warranty: {
        months: Number(warrantyMonths) || 0,
        childParts: childParts.filter(p => p.name && p.months > 0),
      },
      imageUrl: imageUrls.imageUrl || productData.imageUrl || '',
      imageUrl2: imageUrls.imageUrl2 || productData.imageUrl2 || '',
      imageUrl3: imageUrls.imageUrl3 || productData.imageUrl3 || '',
      imageUrl4: imageUrls.imageUrl4 || productData.imageUrl4 || '',
      imageHint: productData.imageHint || '',
    };
    
    try {
        const productRef = doc(firestore, 'products', productId);
        await setDoc(productRef, { ...finalProductData, id: productId }, { merge: true });
        toast(successMessage);
        onOpenChange(false);

    } catch (error) {
        console.error("Error saving product:", error);
        toast({ variant: 'destructive', title: 'Save Failed' });
    }
  };

  const handleSaveCategory = async (newCategoryName: string) => {
    if (productCategories?.some(c => c.name.toLowerCase() === newCategoryName.toLowerCase())) {
        toast({ variant: 'destructive', title: 'Category exists' });
        return;
    }
    await addDoc(collection(firestore, 'productCategories'), { name: newCategoryName });
    handleSelectChange('category')(newCategoryName);
  };

  const openCameraDialog = (field: string) => {
    setCameraFor(field);
    setIsCameraDialogOpen(true);
  };
  
  const handleCapture = () => {
    if (videoRef.current && cameraFor) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setImagePreviews(prev => ({ ...prev, [cameraFor]: dataUrl }));

        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], `${cameraFor}.jpg`, { type: 'image/jpeg' });
            setImageFiles(prev => ({ ...prev, [cameraFor]: file }));
          });
        
        toast({ title: 'Image Captured' });
        setIsCameraDialogOpen(false);
      }
    }
  };

  const handleFileChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => ({ ...prev, [field]: reader.result as string }));
        setImageFiles(prev => ({ ...prev, [field]: file }));
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleChildPartChange = (index: number, field: 'name' | 'months', value: string | number) => {
    const newChildParts = [...productData.childParts];
    newChildParts[index] = { ...newChildParts[index], [field]: value };
    setProductData(prev => ({ ...prev, childParts: newChildParts }));
  };

  const addChildPart = () => {
    setProductData(prev => ({ ...prev, childParts: [...prev.childParts, { name: '', months: 0 }] }));
  };

  const removeChildPart = (index: number) => {
    setProductData(prev => ({ ...prev, childParts: prev.childParts.filter((_, i) => i !== index) }));
  };
  
  const suppliers = parties?.filter(p => p.type === 'Supplier' || p.type === 'Vendor') || [];

  const renderAccountOptions = (
      groups: CoaGroup[],
      ledgers: CoaLedger[],
      parentId: string | null = null,
      level = 0
    ): React.ReactNode[] => {
      const children = groups.filter(g => g.parentId === parentId);
      return children.flatMap(group => {
        const groupLedgers = ledgers.filter(l => l.groupId === group.id);
        
        return [
          <SelectGroup key={group.id}>
            <SelectLabel style={{ paddingLeft: `${level * 1.5}rem` }} className="font-semibold">
              {group.name}
            </SelectLabel>
            {groupLedgers.map(ledger => (
              <SelectItem key={ledger.id} value={ledger.id} style={{ paddingLeft: `${(level + 1) * 1.5}rem` }}>
                {ledger.name}
              </SelectItem>
            ))}
          </SelectGroup>,
          ...renderAccountOptions(groups, ledgers, group.id, level + 1),
        ];
      });
  };

  const coaOptions = React.useMemo(() => {
    if (!coaGroups || !coaLedgers) return [];
    const rootGroups = coaGroups.filter(g => g.level === 0);
    return rootGroups.flatMap(root => 
        renderAccountOptions(coaGroups, coaLedgers, root.id, 1)
    );
  }, [coaGroups, coaLedgers]);

  const topLevelCoaOptions = React.useMemo(() => {
    if (!coaGroups || !coaLedgers) return [];
    return coaGroups
      .filter(g => g.level === 0)
      .map(rootGroup => (
        <SelectGroup key={rootGroup.id}>
          <SelectLabel className="font-extrabold text-foreground">{rootGroup.name}</SelectLabel>
          {renderAccountOptions(coaGroups, coaLedgers, rootGroup.id, 0)}
        </SelectGroup>
      ));
  }, [coaGroups, coaLedgers]);
  
  const ImageInput = ({ field, label }: { field: string, label: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="w-20 h-20 rounded-md border flex items-center justify-center bg-muted/50 overflow-hidden">
          {imagePreviews[field] ? (
            <Image src={imagePreviews[field]} alt={`${label} preview`} width={80} height={80} className="object-cover" />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input type="file" ref={fileInputRefs[field as keyof typeof fileInputRefs]} onChange={handleFileChange(field)} accept="image/*" className="hidden" />
          <div className="flex gap-2">
             <Button type="button" variant="outline" size="icon" onClick={() => fileInputRefs[field as keyof typeof fileInputRefs].current?.click()}>
                <FileUp className="h-4 w-4" />
                 <span className="sr-only">Upload</span>
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => openCameraDialog(field)}>
                <Camera className="h-4 w-4" />
                <span className="sr-only">Camera</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
        <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Product' : (isDuplicate ? 'Duplicate Product' : 'Add New Product')}</DialogTitle>
            <DialogDescription>
                {isEditMode ? 'Update the details for this product.' : 'Enter the details for the new product to add it to your catalog.'}
            </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] -mx-6 px-6">
            <div className="grid gap-6 py-4 px-1">
                {/* Product Details Section */}
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="product-name">Product Name</Label>
                            <Input id="product-name" placeholder="e.g., Ergonomic Office Chair" value={productData.name} onChange={(e) => handleInputChange('name', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <Label htmlFor="product-sku">SKU</Label>
                              <Input id="product-sku" placeholder="e.g., SKU-CHAIR-001" value={productData.sku} onChange={(e) => handleInputChange('sku', e.target.value)} />
                          </div>
                           <div className="space-y-2">
                              <Label htmlFor="product-hsn">HSN Code</Label>
                              <Input id="product-hsn" placeholder="e.g., 9401" value={productData.hsn} onChange={(e) => handleInputChange('hsn', e.target.value)} />
                          </div>
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="product-hero-line">Product Hero Line (Optional)</Label>
                        <Input id="product-hero-line" placeholder="e.g., Unmatched comfort, peak productivity." value={productData.heroLine} onChange={(e) => handleInputChange('heroLine', e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="product-brand">Brand (Optional)</Label>
                        <Input id="product-brand" placeholder="e.g., Apple, Samsung" value={productData.brand} onChange={(e) => handleInputChange('brand', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="product-description">Description</Label>
                    <Textarea id="product-description" placeholder="Describe the product..." value={productData.description} onChange={(e) => handleInputChange('description', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="product-type">Type</Label>
                            <Select value={productData.type} onValueChange={handleSelectChange('type')}>
                                <SelectTrigger id="product-type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Finished Goods">Finished Goods</SelectItem>
                                    <SelectItem value="Raw Materials">Raw Materials</SelectItem>
                                    <SelectItem value="Assembly">Assembly</SelectItem>
                                    <SelectItem value="Components">Components</SelectItem>
                                    <SelectItem value="Consumables">Consumables</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="product-category">Category</Label>
                            <div className="flex items-center gap-2">
                                <Select value={productData.category} onValueChange={handleSelectChange('category')}>
                                    <SelectTrigger id="product-category">
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {productCategories?.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="outline" size="icon" onClick={() => setIsAddCategoryOpen(true)}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="product-coa">Inventory Account</Label>
                        <Select value={productData.coaAccountId} onValueChange={handleSelectChange('coaAccountId')}>
                            <SelectTrigger id="product-coa"><SelectValue placeholder="Select a COA Account" /></SelectTrigger>
                            <SelectContent>
                                {topLevelCoaOptions}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="product-source">Source</Label>
                            <Select value={productData.source} onValueChange={handleSelectChange('source')}>
                                <SelectTrigger id="product-source"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Bought">We Buy</SelectItem>
                                    <SelectItem value="Made">We Make</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2 col-span-2">
                                <Label htmlFor="opening-stock">Opening Stock</Label>
                                <Input id="opening-stock" type="number" placeholder="e.g., 100" value={productData.openingStock} onChange={(e) => handleInputChange('openingStock', e.target.value)} disabled={currentRole !== 'Admin'} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="product-unit">Unit</Label>
                                <Select value={productData.unit} onValueChange={handleSelectChange('unit')}>
                                    <SelectTrigger id="product-unit"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="min-stock-level">Min. Stock Level</Label>
                        <Input id="min-stock-level" type="number" placeholder="e.g., 20" value={productData.minStockLevel} onChange={(e) => handleInputChange('minStockLevel', e.target.value)} />
                    </div>
                    {productData.source === 'Bought' && (
                        <div className="space-y-2">
                            <Label>Preferred Suppliers/Vendors</Label>
                            <Popover open={supplierComboboxOpen} onOpenChange={setSupplierComboboxOpen}>
                                <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={supplierComboboxOpen}
                                    className="w-full justify-between h-auto min-h-10"
                                >
                                    <div className="flex gap-1 flex-wrap">
                                    {productData.preferredSupplierIds && productData.preferredSupplierIds.length > 0
                                        ? productData.preferredSupplierIds.map(id => {
                                            const supplier = suppliers.find(s => s.id === id);
                                            return <Badge key={id} variant="secondary">{supplier?.name}</Badge>;
                                        })
                                        : "Select suppliers..."}
                                    </div>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                    <CommandInput placeholder="Search suppliers..." />
                                    <CommandList>
                                    <CommandEmpty>No suppliers found.</CommandEmpty>
                                    <CommandGroup>
                                        {suppliers.map(supplier => (
                                        <CommandItem
                                            key={supplier.id}
                                            value={supplier.name}
                                            onSelect={() => handleMultiSelectChange('preferredSupplierIds', supplier.id)}
                                        >
                                            <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                productData.preferredSupplierIds?.includes(supplier.id) ? "opacity-100" : "opacity-0"
                                            )}
                                            />
                                            {supplier.name}
                                        </CommandItem>
                                        ))}
                                    </CommandGroup>
                                    </CommandList>
                                </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="product-version">Version</Label>
                            <Input id="product-version" placeholder="e.g., v1.2" value={productData.version} onChange={(e) => handleInputChange('version', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="product-model">Model #</Label>
                            <Input id="product-model" placeholder="e.g., MD-CH-ERG-24" value={productData.modelNumber} onChange={(e) => handleInputChange('modelNumber', e.target.value)} />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="product-cost">Cost</Label>
                            <Input id="product-cost" type="number" placeholder="e.g., 149.99" value={productData.cost} onChange={(e) => handleInputChange('cost', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="product-price">Price</Label>
                            <Input id="product-price" type="number" placeholder="e.g., 299.99" value={productData.price} onChange={(e) => handleInputChange('price', e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="product-status">Status</Label>
                            <Select value={productData.status} onValueChange={handleSelectChange('status')}>
                                <SelectTrigger id="product-status"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Active">Active</SelectItem>
                                    <SelectItem value="Pre Sale">Pre Sale</SelectItem>
                                    <SelectItem value="R & D">R & D</SelectItem>
                                    <SelectItem value="Discontinued">Discontinued</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end pb-2">
                            <div className="flex items-center space-x-2">
                                <Switch id="saleable" checked={productData.saleable} onCheckedChange={(checked) => handleInputChange('saleable', checked)} />
                                <Label htmlFor="saleable">This item is for sale</Label>
                            </div>
                        </div>
                    </div>
                </div>

                <Separator />
                
                {/* Media Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-medium">Media</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ImageInput field="hero" label="Hero Image" />
                      <ImageInput field="optional1" label="Optional Image 1" />
                      <ImageInput field="optional2" label="Optional Image 2" />
                      <ImageInput field="optional3" label="Optional Image 3" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="video-url">Short Video Link (Optional)</Label>
                      <Input id="video-url" placeholder="e.g., https://youtube.com/watch?v=..." value={productData.videoUrl} onChange={(e) => handleInputChange('videoUrl', e.target.value)} />
                  </div>
                </div>

                <Separator />

                {/* Warranty Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Warranty</h3>
                  <div className="space-y-2">
                    <Label htmlFor="warranty-months">Product Warranty (in months)</Label>
                    <Input id="warranty-months" type="number" placeholder="e.g., 12" value={productData.warrantyMonths} onChange={(e) => handleInputChange('warrantyMonths', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Child Part Warranties (Optional)</Label>
                    <div className="space-y-2 rounded-md border p-4">
                      {productData.childParts.map((part, index) => (
                        <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
                          <Input placeholder="Part Name" value={part.name} onChange={(e) => handleChildPartChange(index, 'name', e.target.value)} />
                          <Input type="number" placeholder="Months" value={part.months || ''} onChange={(e) => handleChildPartChange(index, 'months', Number(e.target.value))} />
                          <Button variant="ghost" size="icon" onClick={() => removeChildPart(index)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addChildPart} className="w-full">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Child Part
                      </Button>
                    </div>
                  </div>
                </div>

            </div>
            </ScrollArea>
            <DialogFooter className="pt-4 border-t">
            <DialogClose asChild>
                <Button type="button" variant="outline">
                Cancel
                </Button>
            </DialogClose>
            <Button type="button" onClick={handleSave}>
                Save Product
            </Button>
            </DialogFooter>
        </DialogContent>
        </Dialog>

        <AddCategoryDialog 
            open={isAddCategoryOpen}
            onOpenChange={setIsAddCategoryOpen}
            onSave={handleSaveCategory}
        />

        <Dialog open={isCameraDialogOpen} onOpenChange={setIsCameraDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Capture Image</DialogTitle>
                    <DialogDescription>
                        Position the product and capture a clear image.
                    </DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <video ref={videoRef} className="w-full aspect-video rounded-md bg-muted" autoPlay muted playsInline />
                    {hasCameraPermission === false && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md">
                            <Alert variant="destructive" className="w-auto">
                                <AlertTitle>Camera Access Required</AlertTitle>
                                <AlertDescription>
                                    Please allow camera permissions in your browser settings to use this feature.
                                </AlertDescription>
                            </Alert>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleCapture} disabled={!hasCameraPermission}>
                        <Camera className="mr-2 h-4 w-4" />
                        Capture
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
  );
}