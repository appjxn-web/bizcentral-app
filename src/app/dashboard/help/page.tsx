
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
} from '@/components/ui/dialog';
import { Mail, Phone, MessageSquare, Download, BookOpen, Search, Info } from 'lucide-react';
import { useFirestore, useDoc, useCollection, useUser } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { SupportSettings, FAQ, HelpGuide, HelpDownload } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

// Markdown component (simplified)
const MarkdownViewer = ({ content }: { content: string }) => (
    <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br />') }} />
);

export default function HelpPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  // Data fetching
  const { data: supportSettings, loading: settingsLoading } = useDoc<SupportSettings>(doc(firestore, 'supportSettings', 'main'));
  const { data: faqs, loading: faqsLoading } = useCollection<FAQ>(collection(firestore, 'faqs'));
  const { data: guides, loading: guidesLoading } = useCollection<HelpGuide>(collection(firestore, 'helpGuides'));
  const { data: downloads, loading: downloadsLoading } = useCollection<HelpDownload>(collection(firestore, 'helpDownloads'));

  // State for interactivity
  const [searchTerm, setSearchTerm] = React.useState('');
  const [callbackName, setCallbackName] = React.useState('');
  const [callbackMobile, setCallbackMobile] = React.useState('');
  const [callbackTopic, setCallbackTopic] = React.useState('');
  const [callbackMessage, setCallbackMessage] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);


  const filteredFaqs = React.useMemo(() => {
    if (!faqs) return [];
    return faqs.filter(faq =>
      faq.isActive &&
      (faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
       faq.answer.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [faqs, searchTerm]);

  const groupedFaqs = React.useMemo(() => {
    return filteredFaqs.reduce((acc, faq) => {
      (acc[faq.category] = acc[faq.category] || []).push(faq);
      return acc;
    }, {} as Record<string, FAQ[]>);
  }, [filteredFaqs]);

  const handleCallbackSubmit = async () => {
    if (!callbackName || !callbackMobile || !callbackTopic) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill in your name, mobile, and topic.' });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Not Authenticated', description: 'You must be logged in to request a callback.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(firestore, 'supportCallbacks'), {
        name: callbackName,
        mobile: callbackMobile,
        topic: callbackTopic,
        message: callbackMessage,
        status: 'NEW',
        createdAt: serverTimestamp(),
        createdByUid: user.uid,
      });
      toast({ title: 'Request Sent', description: "Thanks, we'll call you back soon!" });
      // Reset form
      setCallbackName('');
      setCallbackMobile('');
      setCallbackTopic('');
      setCallbackMessage('');
    } catch (error) {
      console.error('Error submitting callback request:', error);
      toast({ variant: 'destructive', title: 'Submission Failed', description: 'Could not submit your request. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeGuides = guides.filter(g => g.isActive).sort((a,b) => a.sortOrder - b.sortOrder);
  const activeDownloads = downloads.filter(d => d.isActive).sort((a,b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PageHeader title="Help & Support" />
        <CardDescription>Find answers, contact us, and download documents.</CardDescription>
      
        <div className="grid gap-6 lg:grid-cols-3">
        
            {/* Main Content: FAQs, Guides, Downloads */}
            <div className="lg:col-span-2 space-y-6">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search FAQs..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Accordion type="single" collapsible defaultValue="item-0" className="w-full">
                    {Object.entries(groupedFaqs).map(([category, items], index) => (
                        <AccordionItem value={`item-${index}`} key={category}>
                        <AccordionTrigger className="text-lg font-medium">{category}</AccordionTrigger>
                        <AccordionContent>
                             <Accordion type="single" collapsible className="w-full pl-4">
                                {items.sort((a,b) => a.sortOrder - b.sortOrder).map(faq => (
                                    <AccordionItem value={faq.id} key={faq.id}>
                                        <AccordionTrigger>{faq.question}</AccordionTrigger>
                                        <AccordionContent className="prose prose-sm dark:prose-invert">
                                            {faq.answer}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>

                {activeGuides.length > 0 && (
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Help Guides</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {activeGuides.map(guide => (
                                    <Dialog key={guide.id}>
                                        <DialogTrigger asChild>
                                            <Button variant="link" className="p-0 h-auto">{guide.title}</Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-2xl">
                                            <DialogHeader>
                                                <DialogTitle>{guide.title}</DialogTitle>
                                            </DialogHeader>
                                            <MarkdownViewer content={guide.contentMd} />
                                        </DialogContent>
                                    </Dialog>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                 {activeDownloads.length > 0 && (
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> Downloads</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                            {activeDownloads.map(download => (
                                <a key={download.id} href={download.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                                    <Download className="h-4 w-4" /> {download.title}
                                </a>
                            ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Side Content: Actions, Callback */}
            <div className="space-y-6">
                <Card>
                    <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <Button asChild className="w-full justify-start gap-3" variant="outline">
                            <a href={`tel:${supportSettings?.phone}`}><Phone className="h-5 w-5" /> Call Us</a>
                        </Button>
                        <Button asChild className="w-full justify-start gap-3" variant="outline">
                            <a href={`https://wa.me/${supportSettings?.whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-5 w-5" /> WhatsApp</a>
                        </Button>
                        <Button asChild className="w-full justify-start gap-3" variant="outline">
                            <a href={`mailto:${supportSettings?.email}`}><Mail className="h-5 w-5" /> Email Us</a>
                        </Button>
                        {supportSettings?.hours && (
                             <div className="flex items-center gap-3 p-3 rounded-md border text-sm">
                                <Info className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="font-semibold">Working Hours</p>
                                    <p className="text-muted-foreground">{supportSettings.hours}</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Request a Callback</CardTitle>
                        <CardDescription>Our team will get back to you shortly.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="cb-name">Name</Label>
                            <Input id="cb-name" placeholder="Your Name" value={callbackName} onChange={e => setCallbackName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cb-mobile">Mobile Number</Label>
                            <Input id="cb-mobile" type="tel" placeholder="Your Mobile Number" value={callbackMobile} onChange={e => setCallbackMobile(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cb-topic">Topic</Label>
                            <Select value={callbackTopic} onValueChange={setCallbackTopic}>
                                <SelectTrigger id="cb-topic"><SelectValue placeholder="Select a topic" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Orders">Orders</SelectItem>
                                    <SelectItem value="Warranty">Warranty</SelectItem>
                                    <SelectItem value="Payments">Payments</SelectItem>
                                    <SelectItem value="Dealer">Dealer</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cb-message">Message (Optional)</Label>
                            <Textarea id="cb-message" placeholder="Tell us more..." value={callbackMessage} onChange={e => setCallbackMessage(e.target.value)} />
                        </div>
                        <Button onClick={handleCallbackSubmit} disabled={isSubmitting} className="w-full">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Request Callback
                        </Button>
                    </CardContent>
                </Card>
            </div>
      </div>
    </>
  );
}

    