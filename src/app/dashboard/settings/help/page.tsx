
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { doc, setDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { SupportSettings, FAQ, HelpGuide, HelpDownload, SupportCallbackRequest } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Edit, Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function HelpSettingsPage() {
    const { toast } = useToast();
    const firestore = useFirestore();

    // Data states
    const { data: supportSettings, loading: settingsLoading } = useDoc<SupportSettings>(doc(firestore, 'supportSettings', 'main'));
    const { data: faqs, loading: faqsLoading } = useCollection<FAQ>(collection(firestore, 'faqs'));
    const { data: guides, loading: guidesLoading } = useCollection<HelpGuide>(collection(firestore, 'helpGuides'));
    const { data: downloads, loading: downloadsLoading } = useCollection<HelpDownload>(collection(firestore, 'helpDownloads'));
    const { data: callbacks, loading: callbacksLoading } = useCollection<SupportCallbackRequest>(collection(firestore, 'supportCallbacks'));

    // Component states
    const [isSaving, setIsSaving] = React.useState(false);
    const [activeSection, setActiveSection] = React.useState<string | undefined>('contact');

    // Contact form state
    const [contactForm, setContactForm] = React.useState<Partial<SupportSettings>>({});
    
    React.useEffect(() => {
        if(supportSettings) {
            setContactForm(supportSettings);
        }
    }, [supportSettings]);

    const handleContactFormChange = (field: keyof SupportSettings, value: any) => {
        setContactForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveContact = async () => {
        setIsSaving(true);
        await setDoc(doc(firestore, 'supportSettings', 'main'), {
            ...contactForm,
            updatedAt: serverTimestamp(),
            // updatedBy: user.uid // Add user ID
        }, { merge: true });
        toast({ title: 'Contact Settings Saved' });
        setIsSaving(false);
    };

    const handleCallbackStatusUpdate = async (id: string, status: SupportCallbackRequest['status']) => {
        await updateDoc(doc(firestore, 'supportCallbacks', id), { status });
        toast({ title: 'Callback Status Updated' });
    };
    
    function getStatusBadgeVariant(status: SupportCallbackRequest['status']) {
        const variants: Record<SupportCallbackRequest['status'], string> = {
          NEW: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
          CALLED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
          CLOSED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        };
        return variants[status];
    }

  return (
    <>
      <PageHeader title="Help Settings" />
       <Accordion type="single" collapsible className="w-full space-y-4" value={activeSection} onValueChange={setActiveSection}>
            <AccordionItem value="contact">
                <Card>
                    <AccordionTrigger className="p-6">
                        <div className="text-left">
                        <CardTitle>Contact Details & Socials</CardTitle>
                        <CardDescription className="mt-2">Manage public contact information.</CardDescription>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <CardContent>
                           <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="support-phone">Support Phone</Label>
                                        <Input id="support-phone" value={contactForm.phone || ''} onChange={(e) => handleContactFormChange('phone', e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="support-whatsapp">WhatsApp Number</Label>
                                        <Input id="support-whatsapp" value={contactForm.whatsapp || ''} onChange={(e) => handleContactFormChange('whatsapp', e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="support-email">Support Email</Label>
                                        <Input id="support-email" type="email" value={contactForm.email || ''} onChange={(e) => handleContactFormChange('email', e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="support-hours">Working Hours</Label>
                                        <Input id="support-hours" value={contactForm.hours || ''} onChange={(e) => handleContactFormChange('hours', e.target.value)} />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="support-address">Office Address</Label>
                                        <Textarea id="support-address" value={contactForm.address || ''} onChange={(e) => handleContactFormChange('address', e.target.value)} />
                                    </div>
                                </div>
                                <Button onClick={handleSaveContact} disabled={isSaving}>
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Contact Details
                                </Button>
                           </div>
                        </CardContent>
                    </AccordionContent>
                </Card>
            </AccordionItem>
            
             <AccordionItem value="faqs">
                <Card>
                    <AccordionTrigger className="p-6">
                        <div className="text-left">
                        <CardTitle>FAQs Manager</CardTitle>
                        <CardDescription className="mt-2">Add, edit, and manage frequently asked questions.</CardDescription>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <CardContent>
                             <div className="text-right mb-4">
                                <Button><PlusCircle className="mr-2 h-4 w-4" /> Add FAQ</Button>
                            </div>
                           <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Question</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Active</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {faqsLoading ? (
                                        <TableRow><TableCell colSpan={4} className="text-center">Loading FAQs...</TableCell></TableRow>
                                    ) : (
                                        faqs?.map(faq => (
                                            <TableRow key={faq.id}>
                                                <TableCell className="font-medium">{faq.question}</TableCell>
                                                <TableCell>{faq.category}</TableCell>
                                                <TableCell><Switch checked={faq.isActive} /></TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                           </Table>
                        </CardContent>
                    </AccordionContent>
                </Card>
            </AccordionItem>

            <AccordionItem value="callback-requests">
                <Card>
                    <AccordionTrigger className="p-6">
                        <div className="text-left">
                            <CardTitle>Callback Requests</CardTitle>
                            <CardDescription className="mt-2">View and manage user requests for a callback.</CardDescription>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Mobile</TableHead>
                                        <TableHead>Topic</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                     {callbacksLoading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center">Loading requests...</TableCell></TableRow>
                                    ) : (
                                        callbacks?.map(cb => (
                                            <TableRow key={cb.id}>
                                                <TableCell>{format(new Date(cb.createdAt.toDate()), 'dd/MM/yyyy p')}</TableCell>
                                                <TableCell>{cb.name}</TableCell>
                                                <TableCell>{cb.mobile}</TableCell>
                                                <TableCell>{cb.topic}</TableCell>
                                                <TableCell>
                                                    <Select value={cb.status} onValueChange={(value: SupportCallbackRequest['status']) => handleCallbackStatusUpdate(cb.id, value)}>
                                                        <SelectTrigger className={cn("w-32", getStatusBadgeVariant(cb.status))}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="NEW">New</SelectItem>
                                                            <SelectItem value="CALLED">Called</SelectItem>
                                                            <SelectItem value="CLOSED">Closed</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </AccordionContent>
                </Card>
            </AccordionItem>

       </Accordion>
    </>
  );
}
