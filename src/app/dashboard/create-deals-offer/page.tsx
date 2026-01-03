

'use client';

import * as React from 'react';
import {
  MoreHorizontal,
  ListFilter,
  PlusCircle,
  Tag,
  CalendarCheck,
  CalendarX,
  Clock,
  Share2,
  Loader2,
  Image as ImageIcon,
  FileUp,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { cn } from '@/lib/utils';
import type { UserRole, Offer as OfferType } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ShareOfferDialog } from './_components/share-offer-dialog';
import { Separator } from '@/components/ui/separator';
import { useFirestore, useCollection, useStorage } from '@/firebase';
import { collection, doc, addDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Checkbox } from '@/components/ui/checkbox';

const allOfferTypes: OfferType['type'][] = [
  'Discount',
  'Coupon',
  'Target Achievement',
  'Performance Boost',
];

const allRoles: UserRole[] = [
  'Admin', 'Manager', 'Employee', 'Customer', 'CEO', 'Sales Manager', 'Production Manager', 'Purchase Manager', 'Service Manager', 'Accounts Manager', 'HR Manager', 'Gate Keeper', 'Inventory Manager',
];

const defaultNewOfferState = {
  title: '',
  type: 'Discount' as OfferType['type'],
  code: '',
  singleUse: false,
  valueType: 'percent' as 'percent' | 'amount',
  value: '',
  terms: '',
  applicableOn: 'Goodwill & Relationship' as OfferType['applicableOn'],
  targetType: '' as OfferType['targetType'],
  targetValue: '',
  redeem: '' as OfferType['redeem'],
  validFrom: '',
  validTo: '',
  targetRoles: [] as UserRole[],
  imageUrl: '',
  previewText: '',
};

function getStatusBadgeVariant(status: OfferType['status']) {
  const variants: Record<OfferType['status'], string> = {
    Active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    Upcoming: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    Expired: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    Draft:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  };
  return variants[status] || 'bg-gray-100 text-gray-800';
}

function OfferDetailsRow({ offer }: { offer: OfferType }) {
  return (
    <TableRow>
      <TableCell colSpan={7} className="p-0">
        <div className="p-4 bg-muted/50">
          <h4 className="font-semibold mb-2">Offer Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <p>{offer.description}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Validity</Label>
              <p>
                {new Date(offer.validFrom).toLocaleDateString()} -{' '}
                {new Date(offer.validTo).toLocaleDateString()}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Applicable On
              </Label>
              <p>{offer.applicableOn}</p>
            </div>

            {offer.code ? (
              <div>
                <Label className="text-xs text-muted-foreground">Code</Label>
                <p className="font-mono">{offer.code}</p>
              </div>
            ) : null}

            {offer.limit ? (
              <div>
                <Label className="text-xs text-muted-foreground">Usage Limit</Label>
                <p>{offer.limit}</p>
              </div>
            ) : null}

            {offer.used > 0 ? (
              <div>
                <Label className="text-xs text-muted-foreground">Used</Label>
                <p>{offer.used} times</p>
              </div>
            ) : null}

            {offer.targetType ? (
              <div>
                <Label className="text-xs text-muted-foreground">Target</Label>
                <p>
                  {offer.targetType}: {offer.targetValue}
                </p>
              </div>
            ) : null}

            {offer.redeem ? (
              <div>
                <Label className="text-xs text-muted-foreground">
                  Redeemable as
                </Label>
                <p>{offer.redeem}</p>
              </div>
            ) : null}

            <div className="md:col-span-full">
              <Label className="text-xs text-muted-foreground">Target Roles</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {offer.targetRoles.length > 0 ? offer.targetRoles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                )) : (
                    <Badge variant="outline">Private / Shareable</Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function CreateDealsOfferPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const storage = useStorage();

  const { data: offers, loading } = useCollection<OfferType>(
    collection(firestore, 'offers')
  );

  const [roleFilters, setRoleFilters] = React.useState<UserRole[]>([]);
  const [typeFilters, setTypeFilters] = React.useState<OfferType['type'][]>([]);

  const [isNewOfferDialogOpen, setIsNewOfferDialogOpen] = React.useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = React.useState(false);
  const [sharingOffer, setSharingOffer] = React.useState<OfferType | null>(null);

  const [newOffer, setNewOffer] = React.useState(defaultNewOfferState);
  const [editingOffer, setEditingOffer] = React.useState<OfferType | null>(null);

  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

  const showCodeFields = newOffer.type === 'Coupon' || newOffer.type === 'Discount';

  const [openOfferIds, setOpenOfferIds] = React.useState<Record<string, boolean>>({});

  const toggleOffer = (id: string) => {
    setOpenOfferIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  React.useEffect(() => {
    if (!isNewOfferDialogOpen) {
      setNewOffer(defaultNewOfferState);
      setEditingOffer(null);
      setImageFile(null);
      setImagePreview(null);
    }
  }, [isNewOfferDialogOpen]);

  const handleInputChange = (field: keyof typeof newOffer, value: string | boolean) => {
    setNewOffer((prev) => ({ ...prev, [field]: value }));
  };

  const handleTargetRoleChange = (role: UserRole) => {
    setNewOffer((prev) => {
      const currentRoles = prev.targetRoles;
      const newRoles = currentRoles.includes(role)
        ? currentRoles.filter((r) => r !== role)
        : [...currentRoles, role];
      return { ...prev, targetRoles: newRoles };
    });
  };

  const handleSelectAllRoles = () => setNewOffer((prev) => ({ ...prev, targetRoles: allRoles }));
  const handleClearAllRoles = () => setNewOffer((prev) => ({ ...prev, targetRoles: [] }));

  const handleSelectChange = (field: keyof typeof newOffer) => (value: string) => {
    setNewOffer((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateOffer = async () => {
    if (!newOffer.title || !newOffer.type || !newOffer.validFrom || !newOffer.validTo) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill out all required fields.',
      });
      return;
    }

    let imageUrl = editingOffer?.imageUrl || '';

    if (imageFile) {
      toast({ title: 'Uploading image...' });
      const imageRef = ref(storage, `offers/${Date.now()}_${imageFile.name}`);
      const snapshot = await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(snapshot.ref);
    }

    const newOfferData: Omit<OfferType, 'id'> = {
      title: newOffer.title,
      type: newOffer.type,
      code: newOffer.code,
      description: newOffer.terms,
      status: new Date(newOffer.validFrom) > new Date() ? 'Upcoming' : 'Active',
      targetRoles: newOffer.targetRoles,
      validFrom: newOffer.validFrom,
      validTo: newOffer.validTo,
      used: 0,
      limit: newOffer.singleUse ? 1 : 'unlimited',
      value: Number(newOffer.value) || 0,
      valueType: newOffer.valueType,
      applicableOn: newOffer.applicableOn,
      targetType: newOffer.targetType,
      targetValue: Number(newOffer.targetValue) || 0,
      redeem: newOffer.redeem,
      imageUrl,
      previewText: newOffer.previewText,
    };

    if (editingOffer) {
      await setDoc(doc(firestore, 'offers', editingOffer.id), newOfferData, { merge: true });
      toast({ title: 'Offer Updated' });
    } else {
      await addDoc(collection(firestore, 'offers'), newOfferData);
      toast({ title: 'Offer Created' });
    }

    setIsNewOfferDialogOpen(false);
  };

  const handleRoleFilterChange = (role: UserRole) => {
    setRoleFilters((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const handleTypeFilterChange = (type: OfferType['type']) => {
    setTypeFilters((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const filteredOffers = React.useMemo(() => {
    if (!offers) return [];
    return offers.filter((offer) => {
      const roleMatch =
        roleFilters.length === 0 || offer.targetRoles.some((role) => roleFilters.includes(role));
      const typeMatch = typeFilters.length === 0 || typeFilters.includes(offer.type);
      return roleMatch && typeMatch;
    });
  }, [offers, roleFilters, typeFilters]);

  const kpis = React.useMemo(() => {
    if (!offers) return { total: 0, active: 0, expired: 0, upcoming: 0 };
    return {
      total: offers.length,
      active: offers.filter((o) => o.status === 'Active').length,
      expired: offers.filter((o) => o.status === 'Expired').length,
      upcoming: offers.filter((o) => o.status === 'Upcoming').length,
    };
  }, [offers]);

  const handleDelete = async (offerId: string) => {
    await deleteDoc(doc(firestore, 'offers', offerId));
    toast({ title: 'Offer Deleted', description: 'The offer has been permanently deleted.' });
  };

  const handleShareClick = (offer: OfferType) => {
    setSharingOffer(offer);
    setIsShareDialogOpen(true);
  };

  const handleEdit = (offer: OfferType) => {
    setEditingOffer(offer);
    setNewOffer({
      title: offer.title,
      type: offer.type,
      code: offer.code || '',
      singleUse: offer.limit === 1,
      valueType: offer.valueType,
      value: offer.value.toString(),
      terms: offer.description,
      applicableOn: offer.applicableOn,
      targetType: offer.targetType,
      targetValue: offer.targetValue?.toString() || '',
      redeem: offer.redeem,
      validFrom: offer.validFrom,
      validTo: offer.validTo,
      targetRoles: offer.targetRoles,
      imageUrl: offer.imageUrl || '',
      previewText: offer.previewText || '',
    });
    setImagePreview(offer.imageUrl || null);
    setIsNewOfferDialogOpen(true);
  };

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <>
      <PageHeader title="Create Deals &amp; Offer">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Filter</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Offer Type</DropdownMenuLabel>
              {allOfferTypes.map((type) => (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={typeFilters.includes(type)}
                  onCheckedChange={() => handleTypeFilterChange(type)}
                >
                  {type}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Target Role</DropdownMenuLabel>
              <ScrollArea className="h-48">
                {allRoles.map((role) => (
                  <DropdownMenuCheckboxItem
                    key={role}
                    checked={roleFilters.includes(role)}
                    onCheckedChange={() => handleRoleFilterChange(role)}
                  >
                    {role}
                  </DropdownMenuCheckboxItem>
                ))}
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={isNewOfferDialogOpen} onOpenChange={setIsNewOfferDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Create New Offer</span>
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingOffer ? 'Edit Offer' : 'Create New Offer'}</DialogTitle>
                <DialogDescription>Design a new deal, coupon, or benefit for your users.</DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[70vh] p-4 -mx-4">
                <div className="grid gap-6 px-2">
                  <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
                    <div className="space-y-2">
                      <Label htmlFor="offer-type">Type</Label>
                      <Select value={newOffer.type} onValueChange={handleSelectChange('type')}>
                        <SelectTrigger id="offer-type">
                          <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Coupon">Coupons</SelectItem>
                          <SelectItem value="Discount">Discount</SelectItem>
                          <SelectItem value="Target Achievement">Target Achievement</SelectItem>
                          <SelectItem value="Performance Boost">Performance Boost</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="offer-name">Name</Label>
                      <Input
                        id="offer-name"
                        placeholder="e.g., Summer Sale"
                        value={newOffer.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="preview-text">Preview Text</Label>
                      <Input
                        id="preview-text"
                        placeholder="e.g., Catchy headline for the offer"
                        value={newOffer.previewText}
                        onChange={(e) => handleInputChange('previewText', e.target.value)}
                      />
                    </div>

                    {showCodeFields ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="offer-code">Code</Label>
                          <Input
                            id="offer-code"
                            placeholder="e.g., SUMMER20"
                            value={newOffer.code}
                            onChange={(e) => handleInputChange('code', e.target.value)}
                          />
                        </div>
                        <div className="flex items-end pb-2 space-x-2">
                          <Switch
                            id="usage-type"
                            checked={newOffer.singleUse}
                            onCheckedChange={(checked) => handleInputChange('singleUse', checked)}
                          />
                          <Label htmlFor="usage-type">Single Use</Label>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label>Value</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Select value={newOffer.valueType} onValueChange={handleSelectChange('valueType')}>
                          <SelectTrigger id="value-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">%</SelectItem>
                            <SelectItem value="amount">Amount</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          id="value"
                          type="number"
                          placeholder="e.g., 10 or 100"
                          className="col-span-2"
                          value={newOffer.value}
                          onChange={(e) => handleInputChange('value', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="terms">Terms</Label>
                      <Textarea
                        id="terms"
                        placeholder="Terms and conditions..."
                        value={newOffer.terms}
                        onChange={(e) => handleInputChange('terms', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="applicable-on">Applicable on</Label>
                      <Select value={newOffer.applicableOn} onValueChange={handleSelectChange('applicableOn')}>
                        <SelectTrigger id="applicable-on">
                          <SelectValue placeholder="Select a condition" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="First time purchase">First time purchase</SelectItem>
                          <SelectItem value="Target Achievement">Target Achievement</SelectItem>
                          <SelectItem value="Performances Boost">Performances Boost</SelectItem>
                          <SelectItem value="Goodwill &amp; Relationship">Goodwill &amp; Relationship</SelectItem>
                          <SelectItem value="Referral">Referral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Target</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={newOffer.targetType} onValueChange={handleSelectChange('targetType')}>
                          <SelectTrigger id="target-type">
                            <SelectValue placeholder="Select a target" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="purchase">Purchase</SelectItem>
                            <SelectItem value="sales">Sales</SelectItem>
                            <SelectItem value="production">Production</SelectItem>
                          </SelectContent>
                        </Select>

                        <Input
                          id="target-value"
                          type="number"
                          placeholder="Value"
                          value={newOffer.targetValue}
                          onChange={(e) => handleInputChange('targetValue', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="redeem">Redeem</Label>
                      <Select value={newOffer.redeem} onValueChange={handleSelectChange('redeem' as any)}>
                        <SelectTrigger id="redeem">
                          <SelectValue placeholder="Select redeem option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="purchase">Purchase</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="valid-from">Valid From</Label>
                        <Input
                          id="valid-from"
                          type="date"
                          value={newOffer.validFrom}
                          onChange={(e) => handleInputChange('validFrom', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="valid-to">Valid To</Label>
                        <Input
                          id="valid-to"
                          type="date"
                          value={newOffer.validTo}
                          onChange={(e) => handleInputChange('validTo', e.target.value)}
                        />
                      </div>
                    </div>
                  </form>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label>Target Roles</Label>
                      <div className="flex gap-2">
                        <Button variant="link" size="sm" className="h-auto p-0" onClick={handleSelectAllRoles}>
                          Select All
                        </Button>
                        <Button variant="link" size="sm" className="h-auto p-0" onClick={handleClearAllRoles}>
                          Clear All
                        </Button>
                      </div>
                    </div>

                    <ScrollArea className="h-32 border rounded-md p-2">
                      <div className="grid grid-cols-2 gap-2">
                        {allRoles.map((role) => (
                          <div key={role} className="flex items-center space-x-2">
                            <Checkbox
                              id={`role-${role}`}
                              checked={newOffer.targetRoles.includes(role)}
                              onCheckedChange={() => handleTargetRoleChange(role)}
                            />
                            <Label htmlFor={`role-${role}`} className="text-sm font-normal cursor-pointer">
                              {role}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Offer Image</h4>
                    <div className="flex items-center gap-4">
                      <div className="w-32 h-32 rounded-lg border border-dashed flex items-center justify-center bg-muted overflow-hidden">
                        {imagePreview ? (
                          <Image src={imagePreview} alt="Offer preview" width={128} height={128} className="object-cover" />
                        ) : (
                          <ImageIcon className="h-12 w-12 text-muted-foreground" />
                        )}
                      </div>

                      <input
                        type="file"
                        ref={imageInputRef}
                        onChange={handleImageFileChange}
                        accept="image/*"
                        className="hidden"
                      />

                      <Button type="button" variant="outline" onClick={() => imageInputRef.current?.click()}>
                        <FileUp className="mr-2 h-4 w-4" />
                        Upload Image
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="button" onClick={handleCreateOffer}>
                  Save Offer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Offers</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All created offers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Offers</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.active}</div>
            <p className="text-xs text-muted-foreground">Currently live offers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Offers</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.upcoming}</div>
            <p className="text-xs text-muted-foreground">Scheduled to go live</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired Offers</CardTitle>
            <CalendarX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.expired}</div>
            <p className="text-xs text-muted-foreground">Past promotions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Deals &amp; Offers</CardTitle>
          <CardDescription>Manage all company-wide deals and offers.</CardDescription>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <span className="sr-only">Toggle</span>
                </TableHead>
                <TableHead className="w-20">Image</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Value</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : filteredOffers && filteredOffers.length > 0 ? (
                filteredOffers.map((offer) => {
                  const isOpen = !!openOfferIds[offer.id];
                  return (
                    <React.Fragment key={offer.id}>
                      <TableRow>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleOffer(offer.id)}
                          >
                            <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                            <span className="sr-only">Toggle details</span>
                          </Button>
                        </TableCell>

                        <TableCell>
                          <div className="relative h-16 w-16 bg-muted rounded-md overflow-hidden">
                            {offer.imageUrl ? (
                              <Image
                                src={offer.imageUrl}
                                alt={offer.title}
                                fill
                                className="object-cover"
                                sizes="64px"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full w-full">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="font-medium">{offer.title}</TableCell>
                        <TableCell className="hidden sm:table-cell">{offer.type}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge
                            variant="outline"
                            className={cn('text-xs', getStatusBadgeVariant(offer.status))}
                          >
                            {offer.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {offer.valueType === 'percent'
                            ? `${offer.value}%`
                            : `₹${offer.value.toFixed(2)}`}
                        </TableCell>

                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleEdit(offer)}>Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleShareClick(offer)}>
                                <Share2 className="mr-2 h-4 w-4" />
                                Share
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/40"
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>

                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone. This will permanently delete the offer "{offer.title}".
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>

                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(offer.id)}
                                      className={buttonVariants({ variant: 'destructive' })}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>

                      {isOpen && <OfferDetailsRow offer={offer} />}
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No offers found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {sharingOffer ? (
        <ShareOfferDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          offer={sharingOffer}
        />
      ) : null}
    </>
  );
}
