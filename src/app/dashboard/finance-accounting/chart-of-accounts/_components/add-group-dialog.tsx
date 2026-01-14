
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CoaGroup, CoaNature } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AddGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<CoaGroup>) => void;
  coaGroups: CoaGroup[] | null;
  editingGroup: CoaGroup | null;
}

export function AddGroupDialog({ open, onOpenChange, onSave, coaGroups, editingGroup }: AddGroupDialogProps) {
  const [name, setName] = React.useState('');
  const [nature, setNature] = React.useState<CoaNature | ''>('');
  const [parentId, setParentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (editingGroup) {
      setName(editingGroup.name);
      setNature(editingGroup.nature);
      setParentId(editingGroup.parentId);
    } else {
      setName('');
      setNature('');
      setParentId(null);
    }
  }, [editingGroup, open]);

  const handleSubmit = () => {
    if (!name || !nature) return;

    const parentGroup = coaGroups?.find(g => g.id === parentId);
    const level = parentGroup ? parentGroup.level + 1 : 0;
    // Path generation should ideally be handled server-side, but for client-side demo:
    const path = parentGroup ? `${parentGroup.path}.${name.toLowerCase().replace(/ /g, '-')}` : name.toLowerCase().replace(/ /g, '-');

    onSave({
      name,
      nature,
      parentId,
      level,
      path,
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
          <DialogTitle>{editingGroup ? 'Edit' : 'Create'} Account Group</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Group Name</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-nature">Nature</Label>
            <Select value={nature} onValueChange={(value: CoaNature) => setNature(value)}>
              <SelectTrigger id="group-nature">
                <SelectValue placeholder="Select nature..." />
              </SelectTrigger>
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
            <Label htmlFor="parent-group">Parent Group (Optional)</Label>
            <Select value={parentId || 'root'} onValueChange={(value) => setParentId(value === 'root' ? null : value)}>
              <SelectTrigger id="parent-group">
                <SelectValue placeholder="Select a parent..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">None (Top-level)</SelectItem>
                {coaGroups && renderGroupOptions(coaGroups)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleSubmit}>Save Group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
