

'use client';

import * as React from 'react';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Percent, Save, PlusCircle, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, writeBatch, deleteDoc } from 'firebase/firestore';
import type { TdsRate } from '@/lib/types';

interface GstRate {
  id: string;
  rate: number;
}

const initialGstRates: GstRate[] = [
  { id: 'gst-0', rate: 0 },
  { id: 'gst-5', rate: 5 },
  { id: 'gst-12', rate: 12 },
  { id: 'gst-18', rate: 18 },
  { id: 'gst-28', rate: 28 },
];

const initialPfSettings = {
  applicable: true,
  employeeShare: 12,
  employerShare: 12,
  epsContribution: 8.33,
  epfContribution: 3.67,
  wageCeiling: 15000,
  edliAdminCharges: 0,
  pfAdminCharges: 0.5,
};

const initialEsiSettings = {
  applicable: true,
  employeeContribution: 0.75,
  employerContribution: 3.25,
  grossSalaryLimit: 21000,
};

export default function StatutoryMetrixPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const [effectiveDate, setEffectiveDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [gstRates, setGstRates] = React.useState(initialGstRates);
  const [pfSettings, setPfSettings] = React.useState(initialPfSettings);
  const [esiSettings, setEsiSettings] = React.useState(initialEsiSettings);
  
  const { data: fetchedTdsRates, loading: tdsLoading } = useCollection<TdsRate>(collection(firestore, 'tdsRates'));
  const [tdsRates, setTdsRates] = React.useState<TdsRate[]>([]);
  
  const [isSaving, setIsSaving] = React.useState(false);
  
  React.useEffect(() => {
    if (fetchedTdsRates) {
      setTdsRates(fetchedTdsRates);
    }
  }, [fetchedTdsRates]);

  const handleSave = async (section: 'GST' | 'TDS' | 'PF' | 'ESI') => {
    setIsSaving(true);
    try {
        if (section === 'TDS') {
            const batch = writeBatch(firestore);
            tdsRates.forEach(rate => {
                const docRef = rate.id.startsWith('tds-') ? doc(collection(firestore, 'tdsRates')) : doc(firestore, 'tdsRates', rate.id);
                batch.set(docRef, { ...rate, id: docRef.id });
            });
            await batch.commit();
        }
        // Placeholder for other settings save logic
        // localStorage.setItem(`statutory-${section.toLowerCase()}`, JSON.stringify(data));

        toast({
          title: `${section} Settings Saved`,
          description: `The changes have been saved successfully.`,
        });
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: `Failed to save ${section} settings.` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGstChange = (index: number, value: number) => {
    const newRates = [...gstRates];
    newRates[index].rate = value;
    setGstRates(newRates);
  };

  const handleTdsChange = (id: string, field: keyof TdsRate, value: string) => {
    setTdsRates(prev => 
      prev.map(rate => 
        rate.id === id ? { ...rate, [field]: value } : rate
      )
    );
  };
  
  const addTdsRow = () => {
    setTdsRates(prev => [...prev, { id: `tds-${Date.now()}`, section: '', nature: '', threshold: '', rateIndHuf: '', rateCo: '', remark: '' }]);
  };

  const removeTdsRow = async (rate: TdsRate) => {
    // If the ID is temporary, just remove from state
    if (rate.id.startsWith('tds-')) {
      setTdsRates(prev => prev.filter(row => row.id !== rate.id));
      return;
    }
    // Otherwise, remove from firestore
    try {
      await deleteDoc(doc(firestore, 'tdsRates', rate.id));
      toast({ title: 'Row Deleted', description: 'TDS rate has been removed.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete TDS rate.' });
    }
  };
  
  const handlePfChange = (field: keyof typeof pfSettings, value: number | boolean) => {
    setPfSettings(prev => ({...prev, [field]: value}));
  };

  const handleEsiChange = (field: keyof typeof esiSettings, value: number | boolean) => {
    setEsiSettings(prev => ({...prev, [field]: value}));
  };

  return (
    <>
      <PageHeader title="Statutory Matrix">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="effective-date">Effective From:</Label>
            <Input
                id="effective-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-48"
            />
          </div>
        </div>
      </PageHeader>
      
      <Accordion type="multiple" defaultValue={['gst', 'tds', 'pf', 'esi']} className="w-full space-y-4">
        
        {/* GST Section */}
        <AccordionItem value="gst">
          <Card>
            <AccordionTrigger className="p-6">
              <div className="text-left">
                <CardTitle>Goods & Services Tax (GST)</CardTitle>
                <CardDescription className="mt-2">Manage default GST slabs.</CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/2">GST Slab</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gstRates.map((slab, index) => (
                      <TableRow key={slab.id}>
                        <TableCell>Standard Rate</TableCell>
                        <TableCell className="text-right">
                          <div className="relative inline-block">
                            <Input type="number" value={slab.rate} onChange={(e) => handleGstChange(index, Number(e.target.value))} className="w-24 text-right pr-8" />
                            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-6">
                  <Button onClick={() => handleSave('GST')} disabled={isSaving}>
                     {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save GST Settings
                  </Button>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* TDS Section */}
        <AccordionItem value="tds">
          <Card>
            <AccordionTrigger className="p-6">
              <div className="text-left">
                <CardTitle>Tax Deducted at Source (TDS)</CardTitle>
                <CardDescription className="mt-2">Customize the TDS Rate Chart for your company.</CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Section</TableHead>
                      <TableHead>Nature of Payment</TableHead>
                      <TableHead>Threshold Limit</TableHead>
                      <TableHead>Rate (Ind/HUF)</TableHead>
                      <TableHead>Rate (Co.)</TableHead>
                      <TableHead>Remark</TableHead>
                      <TableHead className="w-12"><span className="sr-only">Remove</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tdsLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="animate-spin h-6 w-6" /></TableCell></TableRow>
                    ) : tdsRates.map((tds, index) => (
                      <TableRow key={tds.id || `temp-${index}`}>
                        <TableCell><Input value={tds.section ?? ''} onChange={(e) => handleTdsChange(tds.id, 'section', e.target.value)} /></TableCell>
                        <TableCell><Input value={tds.nature ?? ''} onChange={(e) => handleTdsChange(tds.id, 'nature', e.target.value)} /></TableCell>
                        <TableCell><Input value={tds.threshold ?? ''} onChange={(e) => handleTdsChange(tds.id, 'threshold', e.target.value)} /></TableCell>
                        <TableCell><Input value={tds.rateIndHuf ?? ''} onChange={(e) => handleTdsChange(tds.id, 'rateIndHuf', e.target.value)} /></TableCell>
                        <TableCell><Input value={tds.rateCo ?? ''} onChange={(e) => handleTdsChange(tds.id, 'rateCo', e.target.value)} /></TableCell>
                        <TableCell><Input value={tds.remark ?? ''} onChange={(e) => handleTdsChange(tds.id, 'remark', e.target.value)} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeTdsRow(tds)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                 <Button onClick={addTdsRow} variant="outline" className="mt-4 w-full">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Section Row
                 </Button>
                 <div className="mt-6">
                  <Button onClick={() => handleSave('TDS')} disabled={isSaving}>
                     {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save TDS Settings
                  </Button>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* PF Section */}
        <AccordionItem value="pf">
          <Card>
            <AccordionTrigger className="p-6">
              <div className="text-left">
                <CardTitle>Provident Fund (PF)</CardTitle>
                <CardDescription className="mt-2">Manage PF contribution rates and rules.</CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <div className="flex items-center justify-between rounded-lg border p-4 mb-6">
                    <div>
                      <Label htmlFor="pf-applicable">PF Applicable</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable or disable Provident Fund calculations for the company.
                      </p>
                    </div>
                    <Switch
                      id="pf-applicable"
                      checked={pfSettings.applicable}
                      onCheckedChange={(checked) => handlePfChange('applicable', checked)}
                    />
                  </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   <div className="space-y-2">
                    <Label>Employee's Share</Label>
                    <div className="relative"><Input type="number" value={pfSettings.employeeShare} onChange={(e) => handlePfChange('employeeShare', Number(e.target.value))} className="pr-8" disabled={!pfSettings.applicable} /><Percent className="absolute right-2.5 top-2.5 h-4 w-4" /></div>
                  </div>
                   <div className="space-y-2">
                    <Label>Employer's Share</Label>
                    <div className="relative"><Input type="number" value={pfSettings.employerShare} onChange={(e) => handlePfChange('employerShare', Number(e.target.value))} className="pr-8" disabled={!pfSettings.applicable} /><Percent className="absolute right-2.5 top-2.5 h-4 w-4" /></div>
                  </div>
                   <div className="space-y-2">
                    <Label>Wage Ceiling (₹)</Label>
                    <Input type="number" value={pfSettings.wageCeiling} onChange={(e) => handlePfChange('wageCeiling', Number(e.target.value))} disabled={!pfSettings.applicable} />
                  </div>
                   <div className="space-y-2">
                    <Label>EPS Contribution</Label>
                    <div className="relative"><Input type="number" value={pfSettings.epsContribution} onChange={(e) => handlePfChange('epsContribution', Number(e.target.value))} className="pr-8" disabled={!pfSettings.applicable} /><Percent className="absolute right-2.5 top-2.5 h-4 w-4" /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>PF Admin Charges</Label>
                     <div className="relative"><Input type="number" value={pfSettings.pfAdminCharges} onChange={(e) => handlePfChange('pfAdminCharges', Number(e.target.value))} className="pr-8" disabled={!pfSettings.applicable} /><Percent className="absolute right-2.5 top-2.5 h-4 w-4" /></div>
                  </div>
                   <div className="space-y-2">
                    <Label>EDLI Admin Charges</Label>
                    <div className="relative"><Input type="number" value={pfSettings.edliAdminCharges} onChange={(e) => handlePfChange('edliAdminCharges', Number(e.target.value))} className="pr-8" disabled={!pfSettings.applicable} /><Percent className="absolute right-2.5 top-2.5 h-4 w-4" /></div>
                  </div>
                </div>
                 <div className="mt-6">
                  <Button onClick={() => handleSave('PF')} disabled={isSaving}>
                     {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save PF Settings
                  </Button>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* ESI Section */}
        <AccordionItem value="esi">
          <Card>
            <AccordionTrigger className="p-6">
              <div className="text-left">
                <CardTitle>Employee's State Insurance (ESI)</CardTitle>
                <CardDescription className="mt-2">Manage ESI contribution rates and eligibility.</CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                 <div className="flex items-center justify-between rounded-lg border p-4 mb-6">
                    <div>
                      <Label htmlFor="esi-applicable">ESI Applicable</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable or disable ESI calculations for the company.
                      </p>
                    </div>
                    <Switch
                      id="esi-applicable"
                      checked={esiSettings.applicable}
                      onCheckedChange={(checked) => handleEsiChange('applicable', checked)}
                    />
                  </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   <div className="space-y-2">
                    <Label>Employee's Contribution</Label>
                    <div className="relative"><Input type="number" value={esiSettings.employeeContribution} onChange={(e) => handleEsiChange('employeeContribution', Number(e.target.value))} className="pr-8" disabled={!esiSettings.applicable} /><Percent className="absolute right-2.5 top-2.5 h-4 w-4" /></div>
                  </div>
                   <div className="space-y-2">
                    <Label>Employer's Contribution</Label>
                    <div className="relative"><Input type="number" value={esiSettings.employerContribution} onChange={(e) => handleEsiChange('employerContribution', Number(e.target.value))} className="pr-8" disabled={!esiSettings.applicable} /><Percent className="absolute right-2.5 top-2.5 h-4 w-4" /></div>
                  </div>
                   <div className="space-y-2">
                    <Label>Gross Salary Limit for Eligibility (₹)</Label>
                    <Input type="number" value={esiSettings.grossSalaryLimit} onChange={(e) => handleEsiChange('grossSalaryLimit', Number(e.target.value))} disabled={!esiSettings.applicable} />
                  </div>
                </div>
                 <div className="mt-6">
                  <Button onClick={() => handleSave('ESI')} disabled={isSaving}>
                     {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save ESI Settings
                  </Button>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>
    </>
  );
}
