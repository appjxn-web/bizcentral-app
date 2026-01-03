
'use client';

import * as React from 'react';
import { doc, setDoc, updateDoc, writeBatch, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { updateProfile }from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, MapPin, LocateFixed, Loader2, FileUp, Camera, Edit, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from 'next-themes';
import { useFirestore, useUser, useDoc, useStorage, useAuth, useCollection } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GoogleMapsProvider } from '@/app/_components/google-map-provider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UserRole, Party, CoaLedger, CoaNature, UserProfile } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';


interface Address {
    id: string;
    type: string;
    line1: string;
    line2: string;
    city: string;
    district: string;
    state: string;
    country: string;
    pin: string;
    digitalPin?: string;
    isPickupPoint?: boolean;
    latitude?: number;
    longitude?: number;
}

interface BankAccount {
    id: string;
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    upiId?: string;
}

function getDashboardPathForRole(role: UserRole): string {
    switch (role) {
        case 'Admin':
        case 'CEO':
            return '/dashboard';
        case 'Customer':
            return '/dashboard/dashboards/customer';
        case 'Employee':
            return '/dashboard/dashboards/employee';
        case 'Partner':
            return '/dashboard/dashboards/partner';
        default:
            return '/dashboard/my-account'; // A safe default
    }
}

function AddressDialog({ open, onOpenChange, onSave, initialData }: { open: boolean, onOpenChange: (open: boolean) => void, onSave: (data: Omit<Address, 'id'>) => void, initialData: Address | null }) {
    const emptyAddress: Omit<Address, 'id'> = {
        type: 'Home', line1: '', line2: '', city: '', district: '', state: '', country: 'India', pin: '', digitalPin: '',
        isPickupPoint: false, latitude: 20.5937, longitude: 78.9629,
    };
    const [addressData, setAddressData] = React.useState<Omit<Address, 'id'>>(emptyAddress);

    React.useEffect(() => {
        if(initialData) {
            const { id, ...data } = initialData;
            setAddressData({ ...emptyAddress, ...data });
        } else {
            setAddressData(emptyAddress);
        }
    }, [initialData, open]);

    const handleInputChange = (field: keyof typeof addressData, value: string | boolean | number) => {
        setAddressData(prev => ({...prev, [field]: value}));
    };

    const handleGetCurrentLocation = () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setAddressData(prev => ({
                ...prev,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              }));
            },
            () => alert('Could not fetch location.')
          );
        }
      };

    const handleSubmit = () => {
        onSave(addressData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-full md:h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Address' : 'Add New Address'}</DialogTitle>
                    <DialogDescription>Fill in the details for the address. Pinpoint on the map for accuracy.</DialogDescription>
                </DialogHeader>
                 <div className="flex-1 grid md:grid-cols-2 gap-6 overflow-hidden">
                    <ScrollArea className="h-full pr-4 -mr-4">
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="address-type">Address Type</Label>
                                <Select value={addressData.type} onValueChange={(value) => handleInputChange('type', value)}>
                                <SelectTrigger id="address-type"><SelectValue placeholder="Select an address type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Home">Home</SelectItem>
                                    <SelectItem value="Office">Office</SelectItem>
                                    <SelectItem value="Billing">Billing Address</SelectItem>
                                    <SelectItem value="Shipping">Shipping Address</SelectItem>
                                    <SelectItem value="Pickup point">Pickup point</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2"> <Label htmlFor="address-line1">Line 1</Label> <Input id="address-line1" value={addressData.line1} onChange={(e) => handleInputChange('line1', e.target.value)} /></div>
                            <div className="space-y-2"> <Label htmlFor="address-line2">Line 2</Label> <Input id="address-line2" value={addressData.line2} onChange={(e) => handleInputChange('line2', e.target.value)} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"><Label htmlFor="city">City</Label><Input id="city" value={addressData.city} onChange={(e) => handleInputChange('city', e.target.value)} /></div>
                                <div className="space-y-2"><Label htmlFor="district">District</Label><Input id="district" value={addressData.district} onChange={(e) => handleInputChange('district', e.target.value)} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"><Label htmlFor="state">State</Label><Input id="state" value={addressData.state} onChange={(e) => handleInputChange('state', e.target.value)} /></div>
                                <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" value={addressData.country} onChange={(e) => handleInputChange('country', e.target.value)} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"><Label htmlFor="pin">PIN</Label><Input id="pin" value={addressData.pin} onChange={(e) => handleInputChange('pin', e.target.value)} /></div>
                                <div className="space-y-2"><Label htmlFor="digital-pin">Digital PIN</Label><Input id="digital-pin" placeholder="e.g., 1234" value={addressData.digitalPin} onChange={(e) => handleInputChange('digitalPin', e.target.value)} /></div>
                            </div>
                            <div className="flex items-center space-x-2 pt-4">
                                <Checkbox id="is-pickup-point" checked={addressData.isPickupPoint} onCheckedChange={(checked) => handleInputChange('isPickupPoint', !!checked)} />
                                <Label htmlFor="is-pickup-point" className="text-sm font-normal">Show this address as a pickup point in checkout.</Label>
                            </div>
                        </div>
                    </ScrollArea>
                    <div className="space-y-4 flex flex-col">
                        <Label>Pinpoint Location</Label>
                        <div className="w-full flex-grow bg-muted rounded-lg relative overflow-hidden border">
                            <GoogleMapsProvider>
                               <Map
                                    style={{ width: '100%', height: '100%' }}
                                    defaultCenter={{ lat: addressData.latitude || 20.5937, lng: addressData.longitude || 78.9629 }}
                                    defaultZoom={addressData.latitude ? 15 : 4}
                                    gestureHandling={'greedy'}
                                    disableDefaultUI={true}
                                    mapId={'f9d3a95f7a52e6a3'}
                                >
                                    <AdvancedMarker
                                        position={{ lat: addressData.latitude || 20.5937, lng: addressData.longitude || 78.9629 }}
                                        draggable={true}
                                        onDragEnd={(e) => {
                                            const newPos = { lat: e.latLng!.lat(), lng: e.latLng!.lng() };
                                            handleInputChange('latitude', newPos.lat);
                                            handleInputChange('longitude', newPos.lng);
                                        }}
                                    >
                                      <MapPin className="h-8 w-8 text-primary" />
                                    </AdvancedMarker>
                                </Map>
                            </GoogleMapsProvider>
                             <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="absolute bottom-2 right-2 shadow-lg"
                                onClick={handleGetCurrentLocation}
                            >
                                <LocateFixed className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
                <DialogFooter className="mt-4 pt-4 border-t">
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="button" onClick={handleSubmit}>Save Address</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function BankAccountDialog({ open, onOpenChange, onSave, initialData }: { open: boolean, onOpenChange: (open: boolean) => void, onSave: (data: Omit<BankAccount, 'id'>) => void, initialData: BankAccount | null }) {
    const [accountData, setAccountData] = React.useState<Omit<BankAccount, 'id'>>({ accountHolderName: '', bankName: '', accountNumber: '', ifscCode: '', upiId: '' });

    React.useEffect(() => {
        if(initialData) {
            const { id, ...data } = initialData;
            setAccountData(data);
        } else {
            setAccountData({ accountHolderName: '', bankName: '', accountNumber: '', ifscCode: '', upiId: '' });
        }
    }, [initialData, open]);

    const handleInputChange = (field: keyof typeof accountData, value: string) => {
        setAccountData(prev => ({...prev, [field]: value}));
    };

    const handleSubmit = () => {
        onSave(accountData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit' : 'Add'} Bank Account or UPI</DialogTitle>
                    <DialogDescription>Add your financial details for payments.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="account-holder-name">Account Holder Name</Label>
                        <Input id="account-holder-name" placeholder="John Doe" value={accountData.accountHolderName} onChange={e => handleInputChange('accountHolderName', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="bank-name">Bank Name</Label>
                        <Input id="bank-name" placeholder="e.g., State Bank of India" value={accountData.bankName} onChange={e => handleInputChange('bankName', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="account-number">Account Number</Label>
                        <Input id="account-number" placeholder="e.g., 1234567890" value={accountData.accountNumber} onChange={e => handleInputChange('accountNumber', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ifsc-code">IFSC Code</Label>
                        <Input id="ifsc-code" placeholder="e.g., SBIN0001234" value={accountData.ifscCode} onChange={e => handleInputChange('ifscCode', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="upi-id">UPI ID (Optional)</Label>
                        <Input id="upi-id" placeholder="e.g., username@upi" value={accountData.upiId} onChange={e => handleInputChange('upiId', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="upi-qr">UPI QR Code (Optional)</Label>
                        <Input id="upi-qr" type="file" className="h-auto" accept="image/*" />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="button" onClick={handleSubmit}>Save Account</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function ProfilesSettingsPage() {
  const { user: authUser, loading: userLoading } = useUser();
  const searchParams = useSearchParams();
  const userIdFromParams = searchParams.get('userId');
  const router = useRouter();

  const firestore = useFirestore();
  const storage = useStorage();
  const auth = useAuth();
  
  const targetUserId = userIdFromParams || authUser?.uid;

  const userDocRef = React.useMemo(
    () => (targetUserId ? doc(firestore, 'users', targetUserId) : null),
    [targetUserId, firestore]
  );
  
  const { data: userProfile, loading: profileLoading } = useDoc<any>(userDocRef);
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));

  const [contactPerson, setContactPerson] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [pan, setPan] = React.useState('');
  const [gstin, setGstin] = React.useState('');
  
  const [addresses, setAddresses] = React.useState<Address[]>([]);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = React.useState(false);
  const [editingAddress, setEditingAddress] = React.useState<Address | null>(null);
  
  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([]);
  const [isBankAccountDialogOpen, setIsBankAccountDialogOpen] = React.useState(false);
  const [editingBankAccount, setEditingBankAccount] = React.useState<BankAccount | null>(null);

  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { setTheme } = useTheme();
  
  const isNewUser = !userProfile?.coaLedgerId && !profileLoading;

  React.useEffect(() => {
    if (userProfile) {
      setContactPerson(userProfile.displayName || '');
      setEmail(userProfile.email || '');
      setAvatarPreview(userProfile.avatar || userProfile.photoURL || null);
      setBusinessName(userProfile.businessName || '');
      setMobile(userProfile.mobile || '');
      setPan(userProfile.pan || '');
      setGstin(userProfile.gstin || '');
      setAddresses(userProfile.addresses || []);
      setBankAccounts(userProfile.bankAccounts || []);
    }
  }, [userProfile]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileSave = async () => {
    if (!targetUserId) {
      toast({ variant: 'destructive', title: 'Not authenticated' });
      return;
    }
    
    // Check for mandatory fields for new users
    if (isNewUser && (!businessName || !contactPerson || !mobile)) {
        toast({
            variant: 'destructive',
            title: 'Missing Information',
            description: 'Please fill out Business Name, Contact Person, and Contact Phone to proceed.'
        });
        return;
    }

    let avatarUrl = avatarPreview;
    const batch = writeBatch(firestore);

    if (avatarFile) {
        toast({ title: 'Uploading avatar...' });
        const storageRef = ref(storage, `avatars/${targetUserId}/${avatarFile.name}`);
        try {
            const snapshot = await uploadBytes(storageRef, avatarFile);
            avatarUrl = await getDownloadURL(snapshot.ref);
            if (auth.currentUser && targetUserId === auth.currentUser.uid) {
              await updateProfile(auth.currentUser, { photoURL: avatarUrl || undefined, displayName: contactPerson });
            }
        } catch (error) {
            console.error("Error uploading avatar:", error);
            toast({ variant: 'destructive', title: 'Avatar Upload Failed' });
            return;
        }
    } else {
        if(auth.currentUser && targetUserId === auth.currentUser.uid && auth.currentUser.displayName !== contactPerson) {
             await updateProfile(auth.currentUser, { displayName: contactPerson });
        }
    }

    const userDocRef = doc(firestore, 'users', targetUserId);
    try {
      const profileData: Partial<UserProfile> = {
        name: businessName,
        displayName: contactPerson,
        email,
        avatar: avatarUrl,
        photoURL: avatarUrl,
        businessName,
        mobile,
        pan,
        gstin,
      };
      batch.set(userDocRef, profileData, { merge: true });

      // If it's a new user, create their ledger account
      if (isNewUser) {
        const partyRef = doc(firestore, 'parties', targetUserId);
        const partyData: Partial<Party> = {
            id: targetUserId, name: businessName, type: 'Customer',
            email, phone: mobile, status: 'Active',
            createdAt: new Date().toISOString(), createdBy: 'Self-Signup',
        };
        
        const newLedgerRef = doc(collection(firestore, 'coa_ledgers'));
        const newLedgerData: Omit<CoaLedger, 'id' | 'createdAt' | 'updatedAt'> = {
            name: businessName,
            groupId: '1.1.2', // Trade Receivables
            nature: 'ASSET' as CoaNature,
            type: 'RECEIVABLE',
            posting: { isPosting: true, normalBalance: 'DEBIT', isSystem: false, allowManualJournal: true },
            status: 'ACTIVE',
            openingBalance: { amount: 0, drCr: 'DR', asOf: new Date().toISOString() },
        };
        batch.set(newLedgerRef, {...newLedgerData, id: newLedgerRef.id});
        batch.update(userDocRef, { coaLedgerId: newLedgerRef.id });
        batch.set(partyRef, { ...partyData, coaLedgerId: newLedgerRef.id }, { merge: true });
      }

      await batch.commit();
      
      toast({ title: 'Profile Updated', description: 'Your information has been saved.' });
      setAvatarFile(null);

      // Redirect to the correct dashboard after saving
      const dashboardPath = getDashboardPathForRole(userProfile.role);
      router.push(dashboardPath);

    } catch (error) {
      console.error('Error saving profile:', error);
      toast({ variant: 'destructive', title: 'Save Failed' });
    }
  };
  
    const handleSaveAddress = async (addressData: Omit<Address, 'id'>) => {
        if (!userDocRef) return;

        let updatedAddresses: Address[];
        if(editingAddress) {
            updatedAddresses = addresses.map(addr => addr.id === editingAddress.id ? { ...editingAddress, ...addressData } : addr);
        } else {
            const newAddress: Address = { id: `addr-${Date.now()}`, ...addressData };
            updatedAddresses = [...addresses, newAddress];
        }
        
        try {
            await updateDoc(userDocRef, { addresses: updatedAddresses });
            setAddresses(updatedAddresses);
            toast({ title: 'Address Saved', description: 'Your address has been successfully saved.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save address.' });
        }

        setIsAddressDialogOpen(false);
        setEditingAddress(null);
    };

    const handleEditAddress = (address: Address) => {
        setEditingAddress(address);
        setIsAddressDialogOpen(true);
    };

    const handleSaveBankAccount = async (accountData: Omit<BankAccount, 'id'>) => {
        if (!userDocRef) return;

        let updatedAccounts: BankAccount[];
        if (editingBankAccount) {
            updatedAccounts = bankAccounts.map(acc => acc.id === editingBankAccount.id ? { ...editingBankAccount, ...accountData } : acc);
        } else {
            const newAccount: BankAccount = { id: `bank-${Date.now()}`, ...accountData };
            updatedAccounts = [...bankAccounts, newAccount];
        }
        
        try {
            await updateDoc(userDocRef, { bankAccounts: updatedAccounts });
            setBankAccounts(updatedAccounts);
            toast({ title: 'Bank Account Saved', description: 'Your bank details have been successfully saved.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save bank account details.' });
        }
        setIsBankAccountDialogOpen(false);
        setEditingBankAccount(null);
    };

    const handleEditBankAccount = (account: BankAccount) => {
        setEditingBankAccount(account);
        setIsBankAccountDialogOpen(true);
    };


  if (userLoading || profileLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }

  return (
    <>
      <PageHeader title="Profiles & Settings" />
      {isNewUser && (
        <Alert variant="destructive" className="mb-4">
            <AlertTitle>Complete Your Profile</AlertTitle>
            <AlertDescription>
                Please fill in the mandatory fields (Business Name, Contact Person, Contact Phone) to activate all features, including your financial ledger.
            </AlertDescription>
        </Alert>
      )}
       <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
          <CardDescription>Update your personal and business information.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="general">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="tax">Tax</TabsTrigger>
              <TabsTrigger value="bank">Bank</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="pt-6">
                <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleProfileSave(); }}>
                    <div className="space-y-2">
                        <Label>Profile Picture</Label>
                        <div className="flex items-center gap-4">
                            <Avatar className="h-20 w-20">
                                <AvatarImage src={avatarPreview || ''} alt={contactPerson} />
                                <AvatarFallback>{contactPerson?.charAt(0) || email?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                            <input type="file" ref={avatarInputRef} onChange={handleAvatarChange} className="hidden" accept="image/*" />
                            <Button type="button" variant="outline" onClick={() => avatarInputRef.current?.click()}>
                                <FileUp className="h-4 w-4 mr-2" /> Upload Image
                            </Button>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="businessName">Business Name * (As per ID/PAN)</Label>
                            <Input id="businessName" placeholder="e.g., Acme Inc." value={businessName} onChange={(e) => setBusinessName(e.target.value)} required/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contactPerson">Contact Person *</Label>
                            <Input id="contactPerson" placeholder="John Doe" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} required/>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="registered-mobile">Contact Phone *</Label>
                            <Input id="registered-mobile" type="tel" placeholder="+91 98765 43210" value={mobile} onChange={(e) => setMobile(e.target.value)} required/>
                        </div>
                     </div>
                      <div className="pt-4">
                        <Button type="submit">Save General Info</Button>
                    </div>
                </form>
            </TabsContent>
            <TabsContent value="tax" className="pt-6">
                 <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleProfileSave(); }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="pan">PAN</Label>
                            <Input id="pan" placeholder="ABCDE1234F" value={pan} onChange={(e) => setPan(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gstin">GSTIN</Label>
                            <Input id="gstin" placeholder="22AAAAA0000A1Z5" value={gstin} onChange={(e) => setGstin(e.target.value)} />
                        </div>
                    </div>
                     <div className="pt-4">
                        <Button type="submit">Save Tax Info</Button>
                    </div>
                 </form>
            </TabsContent>
            <TabsContent value="bank" className="pt-6">
                <div className="space-y-4">
                    {bankAccounts.map(acc => (
                        <Card key={acc.id} className="p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-semibold">{acc.accountHolderName} - {acc.bankName}</p>
                                    <p className="text-sm text-muted-foreground">A/C: {acc.accountNumber} | IFSC: {acc.ifscCode}</p>
                                    {acc.upiId && <p className="text-sm text-muted-foreground">UPI: {acc.upiId}</p>}
                                </div>
                                <div>
                                    <Button variant="ghost" size="icon" onClick={() => handleEditBankAccount(acc)}><Edit className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => { setEditingBankAccount(null); setIsBankAccountDialogOpen(true); }}>
                        <PlusCircle className="h-3.5 w-3.5" /> Add Bank/UPI
                    </Button>
                </div>
            </TabsContent>
          </Tabs>
        </CardContent>
       </Card>
      
      <Accordion type="single" collapsible className="w-full space-y-4 mt-6">
        {/* Addresses */}
        <AccordionItem value="addresses">
          <Card>
            <AccordionTrigger className="p-6">
                <div className="text-left">
                    <CardTitle>Addresses</CardTitle>
                    <CardDescription className="mt-2">Manage your saved addresses.</CardDescription>
                </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <div className="space-y-4">
                    {addresses.length > 0 ? (
                       addresses.map(addr => (
                           <Card key={addr.id} className="p-4">
                               <div className="flex justify-between items-start">
                                   <div>
                                        <p className="font-semibold">{addr.type}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {addr.line1}, {addr.line2 && `${addr.line2}, `}{addr.city}, {addr.state} - {addr.pin}
                                        </p>
                                   </div>
                                   <div>
                                       <Button variant="ghost" size="icon" onClick={() => handleEditAddress(addr)}><Edit className="h-4 w-4" /></Button>
                                   </div>
                               </div>
                           </Card>
                       ))
                    ) : (
                       <p className="text-sm text-muted-foreground">No addresses have been added yet.</p>
                    )}
                    <Button size="sm" className="gap-1" onClick={() => { setEditingAddress(null); setIsAddressDialogOpen(true); }}>
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                        Add New Address
                        </span>
                    </Button>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Appearance */}
        <AccordionItem value="appearance">
            <Card>
                <AccordionTrigger className="p-6">
                <div className="text-left">
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription className="mt-2">Customize the look and feel of the application.</CardDescription>
                </div>
                </AccordionTrigger>
                <AccordionContent>
                <CardContent>
                    <div className="space-y-2">
                    <Label>Theme</Label>
                    <div className="flex items-center space-x-2">
                        <Button variant="outline" onClick={() => setTheme('light')}>Light</Button>
                        <Button variant="secondary" onClick={() => setTheme('dark')}>Dark</Button>
                    </div>
                    </div>
                </CardContent>
                </AccordionContent>
            </Card>
        </AccordionItem>

      </Accordion>
      
      <AddressDialog 
        open={isAddressDialogOpen} 
        onOpenChange={setIsAddressDialogOpen} 
        onSave={handleSaveAddress}
        initialData={editingAddress}
      />

       <BankAccountDialog 
        open={isBankAccountDialogOpen} 
        onOpenChange={setIsBankAccountDialogOpen} 
        onSave={handleSaveBankAccount}
        initialData={editingBankAccount}
      />
    </>
  );
}
