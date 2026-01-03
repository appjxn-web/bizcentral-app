
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
import { useToast } from '@/hooks/use-toast';
import type { CoaGroup, CoaLedger, CoaNature } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AddLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coaGroups: CoaGroup[] | null;
  onSave: (data: Partial<CoaLedger>) => void;
  editingLedger: CoaLedger | null;
}

export function AddLedgerDialog({ open, onOpenChange, coaGroups, onSave, editingLedger }: AddLedgerDialogProps) {
  const { toast } = useToast();
  
  const [name, setName] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [nature, setNature] = React.useState<CoaNature | ''>('');
  const [openingBalance, setOpeningBalance] = React.useState('');

  React.useEffect(() => {
    if (editingLedger) {
        setName(editingLedger.name);
        setGroupId(editingLedger.groupId);
        setNature(editingLedger.nature);
        setOpeningBalance(editingLedger.openingBalance?.amount.toString() || '');
    } else {
        setName('');
        setGroupId('');
        setNature('');
        setOpeningBalance('');
    }
  }, [editingLedger, open]);
  
  const handleSubmit = () => {
    if(!name || !groupId || !nature) {
        toast({ variant: 'destructive', title: 'Missing Information' });
        return;
    }
    onSave({
        name,
        groupId,
        nature,
        openingBalance: {
            amount: Number(openingBalance) || 0,
            drCr: ['ASSET', 'EXPENSE'].includes(nature) ? 'DR' : 'CR',
            asOf: new Date().toISOString(),
        }
    });
  };
  
  const renderGroupOptions = (groups: CoaGroup[], parentId: string | null = null, level = 0) => {
    return groups
      .filter(g => g.parentId === parentId)
      .flatMap(group => [
        <SelectItem key={group.id} value={group.id}>
          {'\u00A0'.repeat(level * 4)}
          {group.name}
        </SelectItem>,
        ...renderGroupOptions(groups, group.id, level + 1),
      ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingLedger ? 'Edit' : 'Create'} Ledger Account</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="ledger-name">Ledger Name</Label>
                <Input id="ledger-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="group-id">Group</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger id="group-id"><SelectValue placeholder="Select a group" /></SelectTrigger>
                    <SelectContent>
                        {coaGroups && renderGroupOptions(coaGroups)}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="ledger-nature">Nature</Label>
                <Select value={nature} onValueChange={(value: CoaNature) => setNature(value)}>
                    <SelectTrigger id="ledger-nature"><SelectValue placeholder="Select nature" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ASSET">Asset</SelectItem>
                        <SelectItem value="LIABILITY">Liability</SelectItem>
                        <SelectItem value="EQUITY">Equity</SelectItem>
                        <SelectItem value="INCOME">Income</SelectItem>
                        <SelectItem value="EXPENSE">Expense</SelectItem>
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label htmlFor="opening-balance">Opening Balance</Label>
                <Input id="opening-balance" type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
            </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleSubmit}>Save Ledger</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
