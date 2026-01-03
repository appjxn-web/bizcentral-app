
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { DocPrefixConfig } from '@/lib/types';

const defaultDocPrefixes: DocPrefixConfig[] = [
  { id: 'sq', type: 'Sales Quotation', prefix: 'SQ', useDate: true, startNumber: 1, digits: 4 },
  { id: 'so', type: 'Sales Order', prefix: 'SO', useDate: true, startNumber: 1, digits: 4 },
  { id: 'si', type: 'Sales Invoice', prefix: 'SI', useDate: true, startNumber: 1, digits: 4 },
  { id: 'pr', type: 'Purchase Request', prefix: 'PR', useDate: true, startNumber: 1, digits: 4 },
  { id: 'po', type: 'Purchase Order', prefix: 'PO', useDate: true, startNumber: 1, digits: 4 },
  { id: 'grn', type: 'Goods Received Note', prefix: 'GRN', useDate: true, startNumber: 1, digits: 4 },
  { id: 'pv', type: 'Payment Voucher', prefix: 'PV', useDate: true, startNumber: 1, digits: 4 },
  { id: 'rv', type: 'Receipt Voucher', prefix: 'RV', useDate: true, startNumber: 1, digits: 4 },
  { id: 'jv', type: 'Journal Voucher', prefix: 'JV', useDate: true, startNumber: 1, digits: 4 },
  { id: 'cn', type: 'Credit Note', prefix: 'CN', useDate: true, startNumber: 1, digits: 4 },
  { id: 'dn', type: 'Debit Note', prefix: 'DN', useDate: true, startNumber: 1, digits: 4 },
  { id: 'wo', type: 'Work Order', prefix: 'WO', useDate: true, startNumber: 1, digits: 4 },
  { id: 'ge', type: 'Gate Entry', prefix: 'GE', useDate: true, startNumber: 1, digits: 4 },
  { id: 'sr', type: 'Service Request', prefix: 'SR', useDate: true, startNumber: 1, digits: 4 },
  { id: 'rr', type: 'Reimbursement Request', prefix: 'RR', useDate: true, startNumber: 1, digits: 4 },
  { id: 'ld', type: 'Lead', prefix: 'LD', useDate: true, startNumber: 1, digits: 4 },
  { id: 'bom', type: 'BOM', prefix: 'BOM', useDate: true, startNumber: 1, digits: 4 },
];

export default function PrefixesPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const settingsRef = doc(firestore, 'company', 'settings');
  const { data: settingsData, loading } = useDoc<{ prefixes?: DocPrefixConfig[] }>(settingsRef);

  const [prefixDocTypes, setPrefixDocTypes] = React.useState<DocPrefixConfig[]>(defaultDocPrefixes);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (settingsData && settingsData.prefixes?.length) {
      // Merge defaults with saved data to ensure all types are present
      const mergedPrefixes = defaultDocPrefixes.map(def => {
        const saved = settingsData.prefixes?.find(s => s.type === def.type);
        return saved ? { ...def, ...saved } : def;
      });
      setPrefixDocTypes(mergedPrefixes);
    }
  }, [settingsData]);

  const handlePrefixChange = (type: string, field: keyof DocPrefixConfig, value: any) => {
    setPrefixDocTypes(prev => prev.map(doc => doc.type === type ? {...doc, [field]: value} : doc));
  };
  
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      await setDoc(settingsRef, { prefixes: prefixDocTypes }, { merge: true });
      toast({
        title: 'Settings Saved',
        description: 'Document prefixes and numbering have been updated.',
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({ variant: 'destructive', title: 'Save Failed' });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Prefixes and Numbering">
        <Button onClick={handleSaveChanges} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </PageHeader>
      
      <Card>
        <CardHeader>
          <CardTitle>Document Numbering</CardTitle>
          <CardDescription>
            Manage prefixes and auto-numbering sequences for various documents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Document Type</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead className="w-[180px]">Use Date (mm-yy)</TableHead>
                <TableHead>Starting Number</TableHead>
                <TableHead className="w-[100px]">Digits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prefixDocTypes.map((docType) => (
                <TableRow key={docType.id || docType.type}>
                  <TableCell className="font-medium">{docType.type}</TableCell>
                  <TableCell>
                    <Input value={docType.prefix} onChange={(e) => handlePrefixChange(docType.type, 'prefix', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Switch checked={docType.useDate} onCheckedChange={(checked) => handlePrefixChange(docType.type, 'useDate', checked)} />
                      <Label>mm-yy-</Label>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={docType.startNumber} onChange={(e) => handlePrefixChange(docType.type, 'startNumber', Number(e.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={docType.digits} min={1} max={10} onChange={(e) => handlePrefixChange(docType.type, 'digits', Number(e.target.value))} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
