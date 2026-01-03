
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { User, UserRole, TdsRate } from '@/lib/types';
import { PlusCircle, Trash2, Percent } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, setDoc, addDoc, serverTimestamp, query, orderBy, updateDoc } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


type SalaryType = 'monthly' | 'hourly';

interface SalaryRevision {
    id: string;
    effectiveDate: string;
    reason: string;
    ctc?: number;
    hourlyRate?: number;
    previousCtc?: number;
    previousHourlyRate?: number;
    createdAt: any;
}


// Mock salary details - in a real app, this would come from a database
const getSalaryDetails = (user: User | null) => {
    const details = (user as any)?.salaryDetails || {};
    return {
        ctc: details.ctc || 0,
        type: details.type || 'monthly',
        hourlyRate: details.hourlyRate || 0,
        basicHourlyRate: details.basicHourlyRate || '',
        skills: details.skills || [],
        allowances: details.allowances || [],
        tdsEnabled: details.tdsEnabled ?? true, // Default to true
        tdsSection: details.tdsSection || '',
        tdsApplicability: details.tdsApplicability || 'Ind/HUF',
        tdsRate: details.tdsRate ?? 10, // Default to 10%
    };
};


interface ReviseSalaryDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviseSalaryDialog({ user, open, onOpenChange }: ReviseSalaryDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const [salaryType, setSalaryType] = React.useState<SalaryType>('monthly');
  const [ctc, setCtc] = React.useState<number | undefined>();
  const [basicHourlyRate, setBasicHourlyRate] = React.useState('');
  const [skills, setSkills] = React.useState<{ skill: string, rate: string }[]>([]);
  const [allowances, setAllowances] = React.useState<{ name: string, value: string }[]>([]);
  const [effectiveDate, setEffectiveDate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [tdsEnabled, setTdsEnabled] = React.useState(true);
  const [tdsSection, setTdsSection] = React.useState('');
  const [tdsApplicability, setTdsApplicability] = React.useState<'Ind/HUF' | 'Co'>('Ind/HUF');
  const [tdsRate, setTdsRate] = React.useState(0);

  const revisionsQuery = user ? query(collection(firestore, 'users', user.id, 'salaryRevisions'), orderBy('createdAt', 'desc')) : null;
  const { data: revisionHistory, loading } = useCollection<SalaryRevision>(revisionsQuery);
  const { data: tdsRates, loading: tdsRatesLoading } = useCollection<TdsRate>(collection(firestore, 'tdsRates'));
  
  const totalHourlyRate = React.useMemo(() => {
    const basic = parseFloat(basicHourlyRate) || 0;
    const skillsTotal = skills.reduce((acc, skill) => acc + (parseFloat(skill.rate) || 0), 0);
    return basic + skillsTotal;
  }, [basicHourlyRate, skills]);
  
  React.useEffect(() => {
    if (user && open) {
        const details = getSalaryDetails(user);
        setSalaryType(details.type);
        setCtc(details.ctc);
        setBasicHourlyRate(details.basicHourlyRate);
        setSkills(details.skills);
        setAllowances(details.allowances);
        setTdsEnabled(details.tdsEnabled);
        setTdsSection(details.tdsSection);
        setTdsApplicability(details.tdsApplicability);
        setTdsRate(details.tdsRate);
        // Reset revision-specific fields
        setEffectiveDate('');
        setReason('');
    } else {
        // Reset form when dialog is closed or user is null
        setSalaryType('monthly');
        setCtc(undefined);
        setBasicHourlyRate('');
        setSkills([]);
        setAllowances([]);
        setEffectiveDate('');
        setReason('');
        setTdsEnabled(true);
        setTdsSection('');
        setTdsApplicability('Ind/HUF');
        setTdsRate(0);
    }
  }, [user, open]);

  React.useEffect(() => {
    if (tdsSection && tdsRates) {
        const selectedRate = tdsRates.find(r => r.section === tdsSection);
        if (selectedRate) {
            const rateStr = tdsApplicability === 'Co' ? selectedRate.rateCo : selectedRate.rateIndHuf;
            setTdsRate(parseFloat(rateStr) || 0);
        }
    }
  }, [tdsSection, tdsApplicability, tdsRates]);


  const handleSaveRevision = async () => {
    if (!user || !effectiveDate || !reason) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please provide an effective date and a reason for the revision.',
      });
      return;
    }

    const currentSalaryDetails = getSalaryDetails(user);
    
    const newRevision: Partial<SalaryRevision> = {
        effectiveDate,
        reason,
        previousCtc: currentSalaryDetails.ctc,
        previousHourlyRate: currentSalaryDetails.hourlyRate,
        createdAt: serverTimestamp(),
    };
    
    const newSalaryDetails: any = {
        type: salaryType,
        lastRevised: effectiveDate,
        tdsEnabled,
        tdsSection,
        tdsApplicability,
        tdsRate,
    };
    
    if (salaryType === 'monthly') {
        newRevision.ctc = ctc;
        newSalaryDetails.ctc = ctc;
    } else { // hourly
        newRevision.hourlyRate = totalHourlyRate;
        newSalaryDetails.hourlyRate = totalHourlyRate;
        newSalaryDetails.basicHourlyRate = basicHourlyRate;
        newSalaryDetails.skills = skills;
        newSalaryDetails.allowances = allowances;
    }


    try {
        const userRef = doc(firestore, 'users', user.id);
        const revisionRef = doc(collection(firestore, 'users', user.id, 'salaryRevisions'));
        
        await setDoc(userRef, { salaryDetails: newSalaryDetails }, { merge: true });
        await setDoc(revisionRef, { ...newRevision, id: revisionRef.id });

        toast({
          title: 'Salary Revision Saved',
          description: `A new salary revision for ${user.name} has been recorded.`,
        });
        
        onOpenChange(false);
    } catch(error) {
         console.error("Error saving salary revision:", error);
         toast({
            variant: "destructive",
            title: "Save Failed",
            description: "There was an error saving the salary details.",
        });
    }
  };
  
  const handleSkillChange = (index: number, field: 'skill' | 'rate', value: string) => {
    const newSkills = [...skills];
    newSkills[index][field] = value;
    setSkills(newSkills);
  };
  const addSkill = () => setSkills([...skills, { skill: '', rate: '' }]);
  const removeSkill = (index: number) => setSkills(skills.filter((_, i) => i !== index));

  const handleAllowanceChange = (index: number, field: 'name' | 'value', value: string) => {
    const newAllowances = [...allowances];
    newAllowances[index][field] = value;
    setAllowances(newAllowances);
  };
  const addAllowance = () => setAllowances([...allowances, { name: '', value: '' }]);
  const removeAllowance = (index: number) => setAllowances(allowances.filter((_, i) => i !== index));

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Revise Salary for {user.name}</DialogTitle>
          <DialogDescription>
            Create a new salary revision. The changes will apply from the effective date.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] -mx-6 px-6">
            <div className="py-4 space-y-6">
                {/* Revision Details Form */}
                <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="effective-date">Effective Date</Label>
                            <Input id="effective-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="reason">Reason for Revision</Label>
                            <Select value={reason} onValueChange={setReason}>
                                <SelectTrigger id="reason">
                                    <SelectValue placeholder="Select a reason" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="New Joining">New Joining</SelectItem>
                                    <SelectItem value="Annual Appraisal">Annual Appraisal</SelectItem>
                                    <SelectItem value="Promotion">Promotion</SelectItem>
                                    <SelectItem value="Market Correction">Market Correction</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Tabs value={salaryType} onValueChange={(v) => setSalaryType(v as SalaryType)}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="monthly">Monthly</TabsTrigger>
                            <TabsTrigger value="hourly">Hourly</TabsTrigger>
                        </TabsList>
                        <TabsContent value="monthly" className="pt-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="ctc">New Cost to Company (CTC) per Annum</Label>
                                <Input id="ctc" type="number" placeholder="e.g., 900000" value={ctc} onChange={(e) => setCtc(Number(e.target.value))} />
                            </div>
                        </TabsContent>
                        <TabsContent value="hourly" className="pt-4">
                            <div className="space-y-4 rounded-md border p-4">
                                <div className="space-y-2">
                                    <Label>Hourly Rate Breakdown</Label>
                                    <div className="space-y-2">
                                        <Label htmlFor="basic-hourly-rate" className="text-xs font-normal text-muted-foreground">Basic Hourly Rate (₹)</Label>
                                        <Input id="basic-hourly-rate" type="number" placeholder="e.g., 400" value={basicHourlyRate} onChange={(e) => setBasicHourlyRate(e.target.value)} />
                                    </div>
                                    {skills.map((skill, index) => (
                                        <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
                                            <Input placeholder="Skill Name" value={skill.skill} onChange={(e) => handleSkillChange(index, 'skill', e.target.value)} />
                                            <Input type="number" placeholder="Rate (₹)" value={skill.rate} onChange={(e) => handleSkillChange(index, 'rate', e.target.value)} />
                                             <Button variant="ghost" size="icon" onClick={() => removeSkill(index)}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={addSkill} className="w-full">
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Skill Rate
                                    </Button>
                                </div>
                                <div className="space-y-2 border-t pt-4">
                                    <Label>Total Offered Hourly Rate (₹)</Label>
                                    <Input value={totalHourlyRate.toFixed(2)} disabled className="font-semibold" />
                                </div>
                                <div className="space-y-2 border-t pt-4">
                                    <Label>Fixed Allowances</Label>
                                    {allowances.map((allowance, index) => (
                                        <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
                                            <Input placeholder="Allowance Name" value={allowance.name} onChange={(e) => handleAllowanceChange(index, 'name', e.target.value)} />
                                            <Input type="number" placeholder="Amount (₹)" value={allowance.value} onChange={(e) => handleAllowanceChange(index, 'value', e.target.value)} />
                                            <Button variant="ghost" size="icon" onClick={() => removeAllowance(index)}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={addAllowance} className="w-full">
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Allowance
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                    
                    <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="tds-enabled" className="flex flex-col space-y-1">
                                <span>TDS Applicable</span>
                                <span className="font-normal leading-snug text-muted-foreground">
                                    Enable Tax Deducted at Source for this employee.
                                </span>
                            </Label>
                            <Switch id="tds-enabled" checked={tdsEnabled} onCheckedChange={setTdsEnabled} />
                        </div>
                        {tdsEnabled && (
                            <div className="space-y-4 pl-2 pt-4 border-t">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="tds-section">TDS Section</Label>
                                        <Select value={tdsSection} onValueChange={setTdsSection} disabled={tdsRatesLoading}>
                                            <SelectTrigger id="tds-section">
                                                <SelectValue placeholder="Select a TDS section" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {tdsRates?.map(rate => (
                                                    <SelectItem key={rate.id} value={rate.section}>{rate.section} - {rate.nature}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Applicability</Label>
                                        <RadioGroup
                                            value={tdsApplicability}
                                            onValueChange={(v: 'Ind/HUF' | 'Co') => setTdsApplicability(v)}
                                            className="flex items-center space-x-4 pt-2"
                                        >
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="Ind/HUF" id="ind-huf" />
                                                <Label htmlFor="ind-huf">Individual/HUF</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="Co" id="co" />
                                                <Label htmlFor="co">Company</Label>
                                            </div>
                                        </RadioGroup>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tds-rate">TDS Rate (%)</Label>
                                    <div className="relative">
                                    <Input
                                        id="tds-rate"
                                        type="number"
                                        value={tdsRate}
                                        readOnly
                                        className="bg-muted/50 font-bold"
                                    />
                                    <Percent className="absolute right-2.5 top-2.5 h-4 w-4" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                <Separator />

                {/* Revision History */}
                <div className="space-y-4">
                    <h4 className="font-medium">Revision History for {user.name}</h4>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading history...</p>
                    ) : revisionHistory && revisionHistory.length > 0 ? (
                        <div className="space-y-2">
                        {revisionHistory.map(rev => (
                            <div key={rev.id} className="text-sm p-3 rounded-md border bg-muted/30">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold">{rev.reason}</p>
                                    <p className="text-xs text-muted-foreground">{rev.effectiveDate}</p>
                                </div>
                                <p className="text-muted-foreground">
                                    Salary changed from ₹{rev.previousCtc?.toLocaleString() || rev.previousHourlyRate?.toFixed(2)} to ₹{rev.ctc?.toLocaleString() || rev.hourlyRate?.toFixed(2)}
                                </p>
                            </div>
                        ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No past revisions found.</p>
                    )}
                </div>
            </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="button" onClick={handleSaveRevision}>Save Revision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
