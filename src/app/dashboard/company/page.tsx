
'use client';

import * as React from 'react';
import Image from 'next/image';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { PlusCircle, FileUp, Paperclip, Sparkles, Loader2, Youtube, Instagram, Facebook, Linkedin, Twitter, Trash2, Edit, Save, MapPin, LocateFixed, Database, RefreshCw, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useDoc, useStorage, useCollection } from '@/firebase';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Separator } from '@/components/ui/separator';
import type { CompanyInfo, Address, TaxInfo, Personnel, Faq, SocialLinks, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { GoogleMapsProvider } from '@/app/_components/google-map-provider';
import { Map, AdvancedMarker, useMap, APIProvider } from '@vis.gl/react-google-maps';
import { collection, getDocs, query, where } from "firebase/firestore";


class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: any) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: (error: any) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      // The parent component will render the error UI
      return null;
    }
    return this.props.children;
  }
}

function CompanyPageContent() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const storage = useStorage();
    const companyInfoRef = doc(firestore, 'company', 'info');
    const { data: companyInfo, loading } = useDoc<CompanyInfo>(companyInfoRef);

    const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
    const [logoFile, setLogoFile] = React.useState<File | null>(null);
    const logoInputRef = React.useRef<HTMLInputElement>(null);
    
    const [companyName, setCompanyName] = React.useState('');
    const [companyType, setCompanyType] = React.useState('');
    const [incorporationDate, setIncorporationDate] = React.useState('');
    const [website, setWebsite] = React.useState('');
    const [contactEmail, setContactEmail] = React.useState('');
    const [contactNumber, setContactNumber] = React.useState('');
    const [aboutUs, setAboutUs] = React.useState('');
    
    // Social media state
    const [socials, setSocials] = React.useState<Partial<SocialLinks>>({});
    
    // Addresses
    const [addresses, setAddresses] = React.useState<Address[]>([]);
    const [isAddressDialogOpen, setIsAddressDialogOpen] = React.useState(false);
    const [editingAddress, setEditingAddress] = React.useState<Address | null>(null);

    const [taxInfo, setTaxInfo] = React.useState<Record<string, TaxInfo>>({});
    
    // Banner state
    const [desktopBannerFile, setDesktopBannerFile] = React.useState<File | null>(null);
    const [mobileBannerFile, setMobileBannerFile] = React.useState<File | null>(null);
    const [desktopBannerPreview, setDesktopBannerPreview] = React.useState<string | null>(null);
    const [mobileBannerPreview, setMobileBannerPreview] = React.useState<string | null>(null);
    const desktopBannerInputRef = React.useRef<HTMLInputElement>(null);
    const mobileBannerInputRef = React.useRef<HTMLInputElement>(null);
    const [headline, setHeadline] = React.useState('');
    const [subheadline, setSubheadline] = React.useState('');
    const [textAlign, setTextAlign] = React.useState<'left' | 'center' | 'right'>('center');
    const [textPosition, setTextPosition] = React.useState<'top' | 'center' | 'bottom'>('center');
    const [headlineStyle, setHeadlineStyle] = React.useState({ bold: true, italic: false });
    const [subheadlineStyle, setSubheadlineStyle] = React.useState({ bold: false, italic: false });

    // Directors & Shareholders State
    const [personnel, setPersonnel] = React.useState<Personnel[]>([]);
    const [isPersonnelDialogOpen, setIsPersonnelDialogOpen] = React.useState(false);
    const [editingPersonnel, setEditingPersonnel] = React.useState<Personnel | null>(null);
    
    // Referral Settings State
    const [referralAmount, setReferralAmount] = React.useState('');
    const [commissionPercent, setCommissionPercent] = React.useState('');
    
    // Help/Support State
    const [faqs, setFaqs] = React.useState<Faq[]>([]);
    const [supportEmail, setSupportEmail] = React.useState('');
    const [supportPhone, setSupportPhone] = React.useState('');
    
    const [isSaving, setIsSaving] = React.useState(false);
    
    const hydratedRef = React.useRef(false);

    React.useEffect(() => {
        if (!companyInfo) return;

        // Only hydrate once, OR allow hydrate when address dialog is closed
        if (hydratedRef.current && isAddressDialogOpen) return;

        setCompanyName(companyInfo.companyName || '');
        setCompanyType(companyInfo.companyType || '');
        setIncorporationDate(companyInfo.incorporationDate || '');
        setWebsite(companyInfo.website || '');
        setContactEmail(companyInfo.contactEmail || '');
        setContactNumber(companyInfo.contactNumber || '');
        setAboutUs(companyInfo.aboutUs || '');
        setLogoPreview(companyInfo.logo || null);
        setSocials(companyInfo.socials || {});
        setAddresses(companyInfo.addresses || []);
        setTaxInfo(companyInfo.taxInfo || {});
        setPersonnel(companyInfo.personnel || []);
        setReferralAmount(companyInfo.referralAmount || '');
        setCommissionPercent(companyInfo.commissionPercent || '');
        setFaqs(companyInfo.faqs || []);
        setSupportEmail(companyInfo.supportEmail || '');
        setSupportPhone(companyInfo.supportPhone || '');
        setDesktopBannerPreview(companyInfo.customHomepageBanner?.desktopImageUrl || null);
        setMobileBannerPreview(companyInfo.customHomepageBanner?.mobileImageUrl || null);
        setHeadline(companyInfo.customHomepageBanner?.headline || '');
        setSubheadline(companyInfo.customHomepageBanner?.subheadline || '');
        setTextAlign(companyInfo.customHomepageBanner?.textAlign || 'center');
        setTextPosition(companyInfo.customHomepageBanner?.textPosition || 'center');
        setHeadlineStyle(companyInfo.customHomepageBanner?.headlineStyle || { bold: true, italic: false });
        setSubheadlineStyle(companyInfo.customHomepageBanner?.subheadlineStyle || { bold: false, italic: false });
        
        hydratedRef.current = true;
    }, [companyInfo, isAddressDialogOpen]);

    
    const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                setLogoPreview(dataUrl);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleBannerFileChange = (type: 'desktop' | 'mobile') => (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                if (type === 'desktop') {
                    setDesktopBannerFile(file);
                    setDesktopBannerPreview(dataUrl);
                } else {
                    setMobileBannerFile(file);
                    setMobileBannerPreview(dataUrl);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveChanges = async () => {
      setIsSaving(true);
      
      let logoUrl = companyInfo?.logo;
      if (logoFile) {
        toast({ title: 'Uploading logo...' });
        const logoStorageRef = ref(storage, `company/logo/${logoFile.name}`);
        const snapshot = await uploadBytes(logoStorageRef, logoFile);
        logoUrl = await getDownloadURL(snapshot.ref);
        setLogoFile(null);
      }
    
      let desktopImageUrl = companyInfo?.customHomepageBanner?.desktopImageUrl;
      if (desktopBannerFile) {
        toast({ title: 'Uploading desktop banner...' });
        const desktopRef = ref(storage, 'company/banners/desktop.jpg');
        const snapshot = await uploadBytes(desktopRef, desktopBannerFile);
        desktopImageUrl = await getDownloadURL(snapshot.ref);
      }
    
      let mobileImageUrl = companyInfo?.customHomepageBanner?.mobileImageUrl;
      if (mobileBannerFile) {
        toast({ title: 'Uploading mobile banner...' });
        const mobileRef = ref(storage, 'company/banners/mobile.jpg');
        const snapshot = await uploadBytes(mobileRef, mobileBannerFile);
        mobileImageUrl = await getDownloadURL(snapshot.ref);
      }
    
      const updatedData: Partial<CompanyInfo> = {
        companyName,
        companyType,
        incorporationDate,
        website,
        contactEmail,
        contactNumber,
        aboutUs,
        socials,
        logo: logoUrl,
        addresses: addresses,
        taxInfo,
        personnel,
        referralAmount,
        commissionPercent,
        faqs,
        supportEmail,
        supportPhone,
        primaryUpiId: "mxcrete3@ybl",
        customHomepageBanner: {
          desktopImageUrl: desktopImageUrl || companyInfo?.customHomepageBanner?.desktopImageUrl || '',
          mobileImageUrl: mobileImageUrl || companyInfo?.customHomepageBanner?.mobileImageUrl || '',
          headline: headline,
          subheadline: subheadline,
          textAlign: textAlign,
          textPosition: textPosition,
          headlineStyle: headlineStyle,
          subheadlineStyle: subheadlineStyle,
        },
      };
    
      try {
        await setDoc(companyInfoRef, updatedData, { merge: true });
        toast({
          title: 'Company Details Saved',
          description: `Your company information has been updated.`,
        });
      } catch (error) {
        console.error('Error saving data:', error);
        toast({ variant: 'destructive', title: 'Save Failed' });
      } finally {
        setIsSaving(false);
      }
    };
    
    const handleTaxInfoChange = (field: string, value: string) => {
        setTaxInfo(prev => ({ ...prev, [field]: { ...prev[field], id: field, value } }));
    };
    
    const handleTaxFileChange = async (field: string, event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            toast({ title: 'Uploading document...' });
            const taxDocRef = ref(storage, `company/taxDocs/${field}/${file.name}`);
            const snapshot = await uploadBytes(taxDocRef, file);
            const fileUrl = await getDownloadURL(snapshot.ref);
            setTaxInfo(prev => ({ ...prev, [field]: { ...prev[field], fileUrl } }));
            toast({
                title: `${field} Document Uploaded`,
                description: file.name,
            });
        }
    };

    const handleSaveAddress = async (addressData: Omit<Address, 'id'>) => {
      const normalized: Omit<Address, 'id'> = {
        ...addressData,
        line2: addressData.line2 || '',
        digitalPin: addressData.digitalPin || '',
        isPickupPoint: !!addressData.isPickupPoint,
      };

      let updatedAddresses: Address[];
      let newOrUpdatedAddress: Address;

      if (editingAddress) {
        newOrUpdatedAddress = { ...editingAddress, ...normalized };
        updatedAddresses = addresses.map(addr =>
          addr.id === editingAddress.id ? newOrUpdatedAddress : addr
        );
      } else {
        newOrUpdatedAddress = { id: `addr-${Date.now()}`, ...normalized };
        updatedAddresses = [...addresses, newOrUpdatedAddress];
      }
      
      setAddresses(updatedAddresses);
      setIsAddressDialogOpen(false);
      setEditingAddress(null);
      
      try {
        await setDoc(companyInfoRef, { addresses: updatedAddresses }, { merge: true });
        
        if (newOrUpdatedAddress.isPickupPoint && newOrUpdatedAddress.latitude && newOrUpdatedAddress.longitude) {
            const locationRef = doc(firestore, 'locations', newOrUpdatedAddress.id);
            await setDoc(locationRef, {
              name: newOrUpdatedAddress.type || 'Company Location',
              latitude: newOrUpdatedAddress.latitude,
              longitude: newOrUpdatedAddress.longitude,
            });
        }

        toast({ title: 'Address Saved', description: 'Address updated successfully.' });
      } catch (e) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save address.' });
      }
    };

    const handleEditAddress = (address: Address) => {
        setEditingAddress(address);
        setIsAddressDialogOpen(true);
    };
    
    const handleSavePersonnel = (personnelData: Omit<Personnel, 'id'>) => {
      if (editingPersonnel) {
        const updatedPersonnel = personnel.map(p => p.id === editingPersonnel.id ? { ...editingPersonnel, ...personnelData } : p);
        setPersonnel(updatedPersonnel);
      } else {
        const newPersonnel: Personnel = { id: `person-${Date.now()}`, ...personnelData };
        setPersonnel(prev => [...prev, newPersonnel]);
      }
      setIsPersonnelDialogOpen(false);
      setEditingPersonnel(null);
    };

    const handleEditPersonnel = (person: Personnel) => {
        setEditingPersonnel(person);
        setIsPersonnelDialogOpen(true);
    };
    
    const handleFaqChange = (index: number, field: 'question' | 'answer', value: string) => {
        const newFaqs = [...faqs];
        newFaqs[index][field] = value;
        setFaqs(newFaqs);
    };

    const addFaq = () => {
        setFaqs(prev => [...prev, { id: `faq-${Date.now()}`, question: '', answer: '' }]);
    };
    
    const removeFaq = (id: string) => {
        setFaqs(prev => prev.filter(faq => faq.id !== id));
    };

    const handleSyncPartners = async () => {
      if (!firestore) return;
      toast({ title: 'Syncing Partners', description: 'Fetching active partners...' });
      
      const partnersQuery = query(collection(firestore, 'users'), where('role', '==', 'Partner'), where('status', '==', 'Active'));
      const partnersSnapshot = await getDocs(partnersQuery);
      
      if (partnersSnapshot.empty) {
        toast({ variant: 'destructive', title: 'No Active Partners Found' });
        return;
      }

      const batch = writeBatch(firestore);
      let syncCount = 0;

      partnersSnapshot.forEach(userDoc => {
        const partner = userDoc.data() as User;
        const pickupAddress = (partner as any).addresses?.find((addr: Address) => addr.type === 'Pickup point' || addr.isPickupPoint) || (partner as any).addresses?.[0];

        if (pickupAddress) {
          const pickupPointRef = doc(firestore, 'pickupPoints', userDoc.id);
          const pickupPointData = {
            name: (partner as any).businessName || partner.name,
            type: 'Partner',
            active: true,
            city: pickupAddress.city,
            state: pickupAddress.state,
            addressLine: [pickupAddress.line1, pickupAddress.line2, pickupAddress.city, pickupAddress.pin].filter(Boolean).join(', '),
            lat: pickupAddress.latitude || null,
            lng: pickupAddress.longitude || null,
            ownerUid: userDoc.id,
            visibility: 'public',
          };
          batch.set(pickupPointRef, pickupPointData, { merge: true });
          syncCount++;
        }
      });

      try {
        await batch.commit();
        toast({ title: 'Sync Complete', description: `${syncCount} partner locations have been synced to public pickup points.` });
      } catch (error) {
        console.error("Error syncing partners:", error);
        toast({ variant: 'destructive', title: 'Sync Failed' });
      }
    };
    
    if (loading) return <div>Loading...</div>;

    const bannerPreviewClasses = {
      position: {
        top: 'justify-start pt-4',
        center: 'justify-center',
        bottom: 'justify-end pb-4',
      },
      alignment: {
        left: 'items-start text-left',
        center: 'items-center text-center',
        right: 'items-end text-right',
      }
    };
    const BannerPreviewOverlay = () => (
      <div className={cn('absolute inset-0 flex flex-col p-2 bg-black/30', bannerPreviewClasses.position[textPosition], bannerPreviewClasses.alignment[textAlign])}>
        <div className="max-w-full truncate">
          <h1 className={cn('text-white text-lg md:text-xl drop-shadow-md', headlineStyle.bold && 'font-bold', headlineStyle.italic && 'italic')}>
            {headline || 'Headline'}
          </h1>
          <p className={cn('text-white text-xs md:text-sm drop-shadow-md', subheadlineStyle.bold && 'font-bold', subheadlineStyle.italic && 'italic')}>
            {subheadline || 'Sub-headline'}
          </p>
        </div>
      </div>
    );

    return (
        <>
        <PageHeader title="Company Information">
             <Button onClick={handleSaveChanges} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save All Changes
             </Button>
        </PageHeader>
        <Accordion type="single" collapsible defaultValue="item-1" className="w-full space-y-4">
            <AccordionItem value="item-1">
            <Card>
                <AccordionTrigger className="p-6">
                    <div className="text-left">
                        <CardTitle>Company Details</CardTitle>
                        <CardDescription className="mt-2">
                        Update your company's information.
                        </CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                <CardContent>
                    <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Company Logo</Label>
                        <div className="flex items-center gap-4">
                            <div className="w-48 h-auto rounded-md border flex items-center justify-center p-2 bg-muted/30">
                                <Image 
                                    src={logoPreview || "https://placehold.co/1052x237/eee/ccc.png?text=Your+Logo"}
                                    alt="Company Logo" 
                                    width={1052} 
                                    height={237}
                                    className="object-contain h-full w-full"
                                />
                            </div>
                            <input type="file" ref={logoInputRef} onChange={handleLogoChange} accept="image/*" className="hidden" />
                            <Button type="button" variant="outline" onClick={() => logoInputRef.current?.click()}>
                                <FileUp className="h-4 w-4 mr-2" />
                                Upload Logo
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Recommended size: 1052 x 237px</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="name">Company Name</Label>
                        <Input id="name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="type">Type</Label>
                            <Input id="type" value={companyType} onChange={(e) => setCompanyType(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="date-of-incorporation">Date of Incorporation</Label>
                            <Input id="date-of-incorporation" value={incorporationDate} onChange={(e) => setIncorporationDate(e.target.value)} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input id="website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Contact Email</Label>
                        <Input
                        id="email"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contact-number">Contact Number</Label>
                        <Input
                        id="contact-number"
                        type="tel"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description">About Us</Label>
                        <Textarea
                        id="description"
                        value={aboutUs}
                        onChange={(e) => setAboutUs(e.target.value)}
                        />
                    </div>
                    </div>
                </CardContent>
                </AccordionContent>
            </Card>
            </AccordionItem>
            

            <AccordionItem value="item-8">
            <Card>
                <AccordionTrigger className="p-6">
                    <div className="text-left">
                        <CardTitle>Social Media</CardTitle>
                        <CardDescription className="mt-2">Enter your company's social media profile URLs.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="youtube-url">YouTube Channel URL</Label>
                            <div className="relative flex items-center">
                                <Youtube className="absolute left-3 h-5 w-5 text-muted-foreground" />
                                <Input id="youtube-url" className="pl-10" placeholder="https://www.youtube.com/your-channel" value={socials.youtube || ''} onChange={(e) => setSocials(s => ({...s, youtube: e.target.value}))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="instagram-url">Instagram Profile URL</Label>
                            <div className="relative flex items-center">
                                <Instagram className="absolute left-3 h-5 w-5 text-muted-foreground" />
                                <Input id="instagram-url" className="pl-10" placeholder="https://www.instagram.com/your-profile" value={socials.instagram || ''} onChange={(e) => setSocials(s => ({...s, instagram: e.target.value}))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="facebook-url">Facebook Page URL</Label>
                            <div className="relative flex items-center">
                                <Facebook className="absolute left-3 h-5 w-5 text-muted-foreground" />
                                <Input id="facebook-url" className="pl-10" placeholder="https://www.facebook.com/your-page" value={socials.facebook || ''} onChange={(e) => setSocials(s => ({...s, facebook: e.target.value}))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="linkedin-url">LinkedIn Page URL</Label>
                            <div className="relative flex items-center">
                                <Linkedin className="absolute left-3 h-5 w-5 text-muted-foreground" />
                                <Input id="linkedin-url" className="pl-10" placeholder="https://www.linkedin.com/company/your-company" value={socials.linkedin || ''} onChange={(e) => setSocials(s => ({...s, linkedin: e.target.value}))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="x-url">X (Twitter) Profile URL</Label>
                            <div className="relative flex items-center">
                                <Twitter className="absolute left-3 h-5 w-5 text-muted-foreground" />
                                <Input id="x-url" className="pl-10" placeholder="https://www.x.com/your-profile" value={socials.x || ''} onChange={(e) => setSocials(s => ({...s, x: e.target.value}))} />
                            </div>
                        </div>
                    </div>
                </CardContent>
                </AccordionContent>
            </Card>
            </AccordionItem>
            

            <AccordionItem value="item-2">
            <Card>
                <AccordionTrigger className="p-6">
                    <div className="text-left">
                        <CardTitle>Addresses</CardTitle>
                        <CardDescription className="mt-2">Manage company addresses and public pickup points.</CardDescription>
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
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold">{addr.type}</p>
                                                {addr.isPickupPoint && <Badge variant="secondary">Pickup Point</Badge>}
                                            </div>
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
                         <Separator />
                        <div className="space-y-2">
                            <h4 className="font-medium">Manage Pickup Points</h4>
                            <p className="text-sm text-muted-foreground">
                                Why sync? This action copies partner addresses from their private user profiles to a separate, public `pickupPoints` collection.
                                This is a secure way to make their locations visible on the homepage map without exposing sensitive user data.
                            </p>
                            <Button onClick={handleSyncPartners}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Sync Partner Locations
                            </Button>
                        </div>
                    </div>
                </CardContent>
                </AccordionContent>
            </Card>
            </AccordionItem>

            <AccordionItem value="item-6">
            <Card>
                <AccordionTrigger className="p-6">
                    <div className="text-left">
                        <CardTitle>Homepage Banner</CardTitle>
                        <CardDescription className="mt-2">Customize the main banner on your public homepage.</CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                <CardContent>
                    <div className="space-y-6">
                       <div className="space-y-4 rounded-lg border p-4">
                         <h4 className="font-medium">Text Content &amp; Styling</h4>
                         <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <Label htmlFor="headline">Headline</Label>
                              <Input id="headline" placeholder="e.g., Welcome to Our Company" value={headline} onChange={(e) => setHeadline(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="subheadline">Sub-headline</Label>
                              <Input id="subheadline" placeholder="e.g., Your trusted partner" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} />
                          </div>
                         </div>
                         <div className="grid md:grid-cols-2 gap-4">
                           <div className="space-y-2">
                              <Label>Headline Style</Label>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2"><Switch id="headline-bold" checked={headlineStyle.bold} onCheckedChange={(checked) => setHeadlineStyle(s => ({...s, bold: checked}))} /><Label htmlFor="headline-bold">Bold</Label></div>
                                <div className="flex items-center gap-2"><Switch id="headline-italic" checked={headlineStyle.italic} onCheckedChange={(checked) => setHeadlineStyle(s => ({...s, italic: checked}))} /><Label htmlFor="headline-italic">Italic</Label></div>
                              </div>
                           </div>
                            <div className="space-y-2">
                              <Label>Sub-headline Style</Label>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2"><Switch id="subheadline-bold" checked={subheadlineStyle.bold} onCheckedChange={(checked) => setSubheadlineStyle(s => ({...s, bold: checked}))} /><Label htmlFor="subheadline-bold">Bold</Label></div>
                                <div className="flex items-center gap-2"><Switch id="subheadline-italic" checked={subheadlineStyle.italic} onCheckedChange={(checked) => setSubheadlineStyle(s => ({...s, italic: checked}))} /><Label htmlFor="subheadline-italic">Italic</Label></div>
                              </div>
                           </div>
                         </div>
                         <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Text Alignment</Label>
                              <Select value={textAlign} onValueChange={(value: 'left' | 'center' | 'right') => setTextAlign(value)}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="left">Left</SelectItem>
                                  <SelectItem value="center">Center</SelectItem>
                                  <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Text Position</Label>
                               <Select value={textPosition} onValueChange={(value: 'top' | 'center' | 'bottom') => setTextPosition(value)}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="top">Top</SelectItem>
                                  <SelectItem value="center">Center</SelectItem>
                                  <SelectItem value="bottom">Bottom</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                         </div>
                       </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Desktop Banner (16:9)</Label>
                                <div className="relative aspect-video w-full rounded-lg border border-dashed bg-muted/30">
                                  {desktopBannerPreview && <Image src={desktopBannerPreview} alt="Desktop banner preview" layout="fill" className="object-cover rounded-lg" />}
                                  <BannerPreviewOverlay />
                                </div>
                                <input type="file" ref={desktopBannerInputRef} onChange={handleBannerFileChange('desktop')} className="hidden" accept="image/*" />
                                <Button type="button" variant="outline" className="w-full" onClick={() => desktopBannerInputRef.current?.click()}>
                                    <FileUp className="h-4 w-4 mr-2" /> Upload Desktop
                                </Button>
                                <p className="text-xs text-muted-foreground text-center">Recommended size: 1920x1080</p>
                            </div>
                             <div className="space-y-2">
                                <Label>Mobile Banner (3:4)</Label>
                                <div className="relative aspect-[3/4] w-full rounded-lg border border-dashed bg-muted/30">
                                   {mobileBannerPreview && <Image src={mobileBannerPreview} alt="Mobile banner preview" layout="fill" className="object-cover rounded-lg" />}
                                   <BannerPreviewOverlay />
                                </div>
                                <input type="file" ref={mobileBannerInputRef} onChange={handleBannerFileChange('mobile')} className="hidden" accept="image/*" />
                                <Button type="button" variant="outline" className="w-full" onClick={() => mobileBannerInputRef.current?.click()}>
                                    <FileUp className="h-4 w-4 mr-2" /> Upload Mobile
                                </Button>
                                <p className="text-xs text-muted-foreground text-center">Recommended size: 600x800</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
                </AccordionContent>
            </Card>
            </AccordionItem>

            <AccordionItem value="item-3">
            <Card>
                <AccordionTrigger className="p-6">
                    <div className="text-left">
                        <CardTitle>Tax and Statutory</CardTitle>
                        <CardDescription className="mt-2">
                        Manage tax and statutory information as per Indian rules.
                        </CardDescription>
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.entries({
                            cin: 'CIN',
                            pan: 'PAN',
                            tan: 'TAN',
                            gstin: 'GSTIN',
                            'msme-no': 'MSME No.',
                            'startup-india': 'Startup India ID',
                            'san-number': 'SAN Number',
                            trademark: 'Trademark',
                        }).map(([field, label]) => (
                            <div key={field} className="space-y-2">
                                <Label htmlFor={field}>{label}</Label>
                                <div className="relative">
                                    <Input 
                                        id={field} 
                                        value={taxInfo[field]?.value || ''}
                                        onChange={(e) => handleTaxInfoChange(field, e.target.value)}
                                        className="pr-10" 
                                    />
                                    <input 
                                        type="file" 
                                        onChange={(e) => handleTaxFileChange(field, e)} 
                                        className="hidden"
                                        id={`file-${field}`}
                                    />
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon" 
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                                        onClick={() => document.getElementById(`file-${field}`)?.click()}
                                    >
                                        <FileUp className="h-4 w-4" />
                                        <span className="sr-only">Upload</span>
                                    </Button>
                                </div>
                                {taxInfo[field]?.fileUrl && <a href={taxInfo[field]?.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline flex items-center gap-1"><Paperclip className="h-3 w-3" /> View Document</a>}
                            </div>
                        ))}
                    </div>
                    </CardContent>
                </AccordionContent>
            </Card>
            </AccordionItem>

            <AccordionItem value="item-5">
            <Card>
                <AccordionTrigger className="p-6">
                <div className="text-left">
                    <CardTitle>Directors &amp; Shareholders</CardTitle>
                    <CardDescription className="mt-2">
                    Manage your company's key personnel.
                    </CardDescription>
                </div>
                </AccordionTrigger>
                <AccordionContent>
                <CardContent>
                    <div className="space-y-4">
                        {personnel.length > 0 ? (
                            personnel.map(p => (
                                <Card key={p.id} className="p-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold">{p.name} <span className="text-sm font-normal text-muted-foreground">({p.designation})</span></p>
                                            <p className="text-sm text-muted-foreground">Shareholding: {p.shareholding}%</p>
                                        </div>
                                        <div>
                                            <Button variant="ghost" size="icon" onClick={() => handleEditPersonnel(p)}><Edit className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No personnel have been added yet.
                            </p>
                        )}
                        <Button size="sm" className="gap-1" onClick={() => { setEditingPersonnel(null); setIsPersonnelDialogOpen(true); }}>
                            <PlusCircle className="h-3.5 w-3.5" />
                            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                            Add Person
                            </span>
                        </Button>
                    </div>
                </CardContent>
                </AccordionContent>
            </Card>
            </AccordionItem>
            
            <AccordionItem value="item-7">
            <Card>
                <AccordionTrigger className="p-6">
                <div className="text-left">
                    <CardTitle>Referral Settings</CardTitle>
                    <CardDescription className="mt-2">
                    Configure the referral program settings.
                    </CardDescription>
                </div>
                </AccordionTrigger>
                <AccordionContent>
                <CardContent>
                    <div className="space-y-4">
                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="referral-amount">Referral Amount (₹)</Label>
                        <Input id="referral-amount" type="number" value={referralAmount} onChange={e => setReferralAmount(e.target.value)} />
                    </div>
                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="commission-percent">First Purchase Commission (%)</Label>
                        <Input id="commission-percent" type="number" value={commissionPercent} onChange={e => setCommissionPercent(e.target.value)} />
                    </div>
                    </div>
                </CardContent>
                </AccordionContent>
            </Card>
            </AccordionItem>
        </Accordion>
        
        {/* Address Dialog */}
        <AddressDialog 
            open={isAddressDialogOpen}
            onOpenChange={setIsAddressDialogOpen}
            onSave={handleSaveAddress}
            initialData={editingAddress}
        />
        
        {/* Personnel Dialog */}
        <PersonnelDialog
            open={isPersonnelDialogOpen}
            onOpenChange={setIsPersonnelDialogOpen}
            onSave={handleSavePersonnel}
            initialData={editingPersonnel}
        />
        </>
    );
}

type AddressFormState = Partial<Omit<Address, 'id'>>;

function MapErrorDisplay({ error }: { error: any }) {
    const message = error?.message || '';
    const isAuthOrRefererError = /AuthFailure|RefererNotAllowedMapError/i.test(message);
    const isApiNotActivated = message.includes('ApiNotActivatedMapError');

    if (isAuthOrRefererError) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-destructive/10">
                <AlertCircle className="h-10 w-10 text-destructive mb-2" />
                <h3 className="text-base font-semibold text-destructive">Google Maps API Key Error</h3>
                <p className="text-xs text-destructive/80 mt-1">
                    The API key is missing, invalid, or not authorized for this URL.
                </p>
                <a 
                    href="https://console.cloud.google.com/google/maps-apis/credentials" 
                    target="_blank" 
                    rel="noopener noreferrer"
                >
                    <Button variant="link" className="text-xs h-auto p-0 mt-2">Go to Google Cloud Credentials</Button>
                </a>
            </div>
        );
    }

    if (isApiNotActivated) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-destructive/10">
                <AlertCircle className="h-10 w-10 text-destructive mb-2" />
                <h3 className="text-base font-semibold text-destructive">Google Maps API Not Enabled</h3>
                <p className="text-xs text-destructive/80 mt-1">
                    The "Maps JavaScript API" needs to be enabled in your Google Cloud project.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-2" />
            <h3 className="text-base font-semibold">Map Unavailable</h3>
            <p className="text-xs text-muted-foreground mt-1">
                Could not load the map. Please ensure the API key is correctly configured.
            </p>
        </div>
    );
}


function AddressMap({ onPositionChange, initialPosition }: { onPositionChange: (pos: { lat: number; lng: number }) => void, initialPosition: { lat: number, lng: number }}) {
  const map = useMap();
  const [markerPosition, setMarkerPosition] = React.useState(initialPosition);

  React.useEffect(() => {
    // Only update marker from props if it's different to avoid re-centering during drag
    if (initialPosition.lat !== markerPosition.lat || initialPosition.lng !== markerPosition.lng) {
      setMarkerPosition(initialPosition);
    }
  }, [initialPosition, markerPosition.lat, markerPosition.lng]);

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setMarkerPosition(newPos);
          onPositionChange(newPos);
          if (map) map.moveCamera({ center: newPos, zoom: 15 });
        },
        () => alert('Could not fetch location.')
      );
    } else {
      alert('Geolocation not supported.');
    }
  };

  const onMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
    const newPos = { lat: e.latLng!.lat(), lng: e.latLng!.lng() };
    setMarkerPosition(newPos);
    onPositionChange(newPos);
  };

  return (
    <div className="w-full h-full bg-muted rounded-lg relative overflow-hidden border">
      <Map
        center={initialPosition}
        zoom={initialPosition.lat === 20.5937 ? 4 : 15}
        gestureHandling={'greedy'}
        disableDefaultUI={true}
        mapId={'f9d3a95f7a52e6a3'}
        className="w-full h-full"
      >
        <AdvancedMarker
          position={markerPosition}
          draggable={true}
          onDragEnd={onMarkerDragEnd}
        >
          <MapPin className="h-8 w-8 text-primary" />
        </AdvancedMarker>
      </Map>
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
  );
}

function AddressDialog({
  open,
  onOpenChange,
  onSave,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Omit<Address, 'id'>) => void;
  initialData: Address | null;
}) {
  const empty: AddressFormState = {
    type: 'Registered Office', line1: '', line2: '', city: '', district: '', state: '', country: 'India', pin: '', digitalPin: '',
    isPickupPoint: false, pickupContactName: '', pickupContactPhone: '', latitude: 20.5937, longitude: 78.9629,
  };

  const [addressData, setAddressData] = React.useState<AddressFormState>(empty);
  const [mapError, setMapError] = React.useState<any>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;


  React.useEffect(() => {
    if (open) {
      setMapError(null);
      if (initialData) {
        const { id, ...rest } = initialData;
        setAddressData({
          ...empty,
          ...rest,
          line2: rest.line2 ?? '',
          digitalPin: rest.digitalPin ?? '',
          isPickupPoint: !!rest.isPickupPoint,
          pickupContactName: rest.pickupContactName ?? '',
          pickupContactPhone: rest.pickupContactPhone ?? '',
          latitude: rest.latitude ?? 20.5937,
          longitude: rest.longitude ?? 78.9629,
        });
      } else {
        setAddressData(empty);
      }
    }
  }, [initialData, open]);

  const handleInputChange = <K extends keyof AddressFormState>(field: K, value: AddressFormState[K]) => {
    setAddressData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => onSave(addressData as Omit<Address, 'id'>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-full md:h-auto md:max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Address' : 'Add New Address'}</DialogTitle>
          <DialogDescription>Fill in the details for the address. Pinpoint on the map for accuracy.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 grid md:grid-cols-2 gap-6 overflow-hidden">
            <ScrollArea className="h-full pr-4 -mr-4">
              <form className="grid gap-4 py-4" onSubmit={(e) => e.preventDefault()}>
                <div className="space-y-2">
                    <Label htmlFor="address-type">Address Type</Label>
                    <Select value={addressData.type} onValueChange={(value) => handleInputChange('type', value)}>
                        <SelectTrigger id="address-type"><SelectValue placeholder="Select an address type" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Registered Office">Registered Office</SelectItem>
                            <SelectItem value="Main Office">Main Office</SelectItem>
                            <SelectItem value="Branch Office">Branch Office</SelectItem>
                            <SelectItem value="Factory">Factory</SelectItem>
                            <SelectItem value="Warehouse">Warehouse</SelectItem>
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
                    <div className="space-y-2"><Label htmlFor="digital-pin">Digital PIN</Label><Input id="digital-pin" value={addressData.digitalPin || ''} onChange={(e) => handleInputChange('digitalPin', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label htmlFor="latitude">Latitude</Label><Input id="latitude" type="number" value={addressData.latitude || ''} onChange={(e) => handleInputChange('latitude', Number(e.target.value))} /></div>
                    <div className="space-y-2"><Label htmlFor="longitude">Longitude</Label><Input id="longitude" type="number" value={addressData.longitude || ''} onChange={(e) => handleInputChange('longitude', Number(e.target.value))} /></div>
                </div>
                <div className="flex items-center space-x-2 pt-4"><Checkbox id="is-pickup-point" checked={!!addressData.isPickupPoint} onCheckedChange={(checked) => handleInputChange('isPickupPoint', checked === true)} /><Label htmlFor="is-pickup-point" className="text-sm font-normal">Show this address as a pickup point in checkout.</Label></div>
                 {addressData.isPickupPoint && (
                    <div className="space-y-4 pt-4 border-t">
                        <h4 className="font-medium text-sm">Pickup Point Details</h4>
                        <div className="space-y-2">
                            <Label htmlFor="pickup-contact-name">Contact Person Name</Label>
                            <Input id="pickup-contact-name" value={addressData.pickupContactName || ''} onChange={(e) => handleInputChange('pickupContactName', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pickup-contact-phone">Contact Phone</Label>
                            <Input id="pickup-contact-phone" type="tel" value={addressData.pickupContactPhone || ''} onChange={(e) => handleInputChange('pickupContactPhone', e.target.value)} />
                        </div>
                    </div>
                )}
              </form>
            </ScrollArea>
             <div className="space-y-2 flex flex-col min-h-[250px] md:min-h-0">
                <Label>Pinpoint Location</Label>
                 <div className="w-full flex-grow bg-muted rounded-lg relative overflow-hidden border">
                    {!apiKey ? (
                       <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                          <AlertCircle className="h-10 w-10 text-destructive mb-2" />
                          <h3 className="text-base font-semibold text-destructive">API Key Missing</h3>
                          <p className="text-xs text-destructive/80 mt-1">
                              Please provide a Google Maps API key to use this feature.
                          </p>
                      </div>
                    ) : (
                      <MapErrorBoundary onError={setMapError}>
                        {mapError ? (
                          <MapErrorDisplay error={mapError} />
                        ) : (
                            <APIProvider apiKey={apiKey}>
                                <AddressMap 
                                    initialPosition={{lat: addressData.latitude || 20.5937, lng: addressData.longitude || 78.9629}}
                                    onPositionChange={(pos) => { handleInputChange('latitude', pos.lat); handleInputChange('longitude', pos.lng); }} 
                                />
                            </APIProvider>
                        )}
                      </MapErrorBoundary>
                    )}
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


function PersonnelDialog({ open, onOpenChange, onSave, initialData }: { open: boolean, onOpenChange: (open: boolean) => void, onSave: (data: Omit<Personnel, 'id'>) => void, initialData: Personnel | null }) {
    const [personnelData, setPersonnelData] = React.useState<Omit<Personnel, 'id'>>({ name: '', designation: '', shareholding: 0 });

    React.useEffect(() => {
        if (initialData) {
            const { id, ...data } = initialData;
            setPersonnelData(data);
        } else {
            setPersonnelData({ name: '', designation: '', shareholding: 0 });
        }
    }, [initialData, open]);

    const handleInputChange = (field: keyof typeof personnelData, value: string | number) => {
        setPersonnelData(prev => ({...prev, [field]: value}));
    };

    const handleSubmit = () => {
        onSave(personnelData);
    }

    return (
         <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Person' : 'Add Person'}</DialogTitle>
                    <DialogDescription>Add a director, shareholder, or other key person.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="person-name">Name</Label>
                        <Input id="person-name" value={personnelData.name} onChange={(e) => handleInputChange('name', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="person-designation">Designation</Label>
                        <Input id="person-designation" value={personnelData.designation} onChange={(e) => handleInputChange('designation', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="shareholding">Shareholding (%)</Label>
                        <Input id="shareholding" type="number" value={personnelData.shareholding} onChange={(e) => handleInputChange('shareholding', Number(e.target.value))} />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" onClick={handleSubmit}>Save Person</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export default function CompanyPage() {
    return <CompanyPageContent />;
}
