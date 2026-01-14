

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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface AddLedgerAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coaGroups: CoaGroup[] | null;
  coaLedgers: CoaLedger[] | null;
  loading: boolean;
}

export function AddLedgerAccountDialog({ open, onOpenChange, coaGroups, coaLedgers, loading }: AddLedgerAccountDialogProps) {
  const { toast } = useToast();
  const [accountType, setAccountType] = React.useState<CoaNature | ''>('');


  const handleSave = () => {
    // In a real app, you would handle form validation and submission here
    toast({
      title: 'Ledger Account Saved',
      description: 'The new ledger account has been successfully added to your chart of accounts.',
    });
    onOpenChange(false);
  };
  
  const structuredGroups = React.useMemo(() => {
    if (!coaGroups) return [];
  
    const groupsById: Map<string, CoaGroup & { children: CoaGroup[] }> = new Map(
      coaGroups.map(g => ({ ...g, children: [] }))
        .sort((a, b) => (a.path || '').localeCompare(b.path || ''))
        .map(g => [g.id, g as CoaGroup & { children: CoaGroup[] }])
    );

    const rootGroups: (CoaGroup & { children: CoaGroup[] })[] = [];
  
    coaGroups.forEach(g => {
      const groupWithChildren = groupsById.get(g.id);
      if (groupWithChildren) {
        if (g.parentId && groupsById.has(g.parentId)) {
          groupsById.get(g.parentId)?.children.push(groupWithChildren);
        } else if (g.level === 0) {
          rootGroups.push(groupWithChildren);
        }
      }
    });
    
    return rootGroups;
  }, [coaGroups]);

  const filteredGroups = React.useMemo(() => {
    if (!accountType) {
        return structuredGroups;
    }
    const filterByNature = (groups: (CoaGroup & { children?: CoaGroup[] })[]): (CoaGroup & { children?: CoaGroup[] })[] => {
      return groups
        .map(group => {
          // If the group itself has the correct nature, keep it and filter its children
          if (group.nature === accountType) {
            const filteredChildren = group.children ? filterByNature(group.children) : [];
            return { ...group, children: filteredChildren };
          }
          // If the group does not have the correct nature, but some children might, check them
          if (group.children) {
            const filteredChildren = filterByNature(group.children);
            if (filteredChildren.length > 0) {
              return { ...group, children: filteredChildren };
            }
          }
          return null;
        })
        .filter(Boolean) as (CoaGroup & { children?: CoaGroup[] })[];
    };
    
    // A simplified approach for top-level filtering for now.
    return structuredGroups.filter(group => group.nature === accountType);

  }, [structuredGroups, accountType]);


 const renderGroupOptions = (
    groups: (CoaGroup & { children?: CoaGroup[] })[]
  ): JSX.Element[] => {
    return groups.map((group) => (
      <SelectGroup key={group.id}>
        <SelectLabel>{group.name}</SelectLabel>
        {coaLedgers?.filter(l => l.groupId === group.id).map(ledger => (
            <SelectItem key={ledger.id} value={ledger.id} disabled>
                - {ledger.name} (Ledger)
            </SelectItem>
        ))}
        {group.children?.map(childGroup => (
            <SelectItem key={childGroup.id} value={childGroup.id}>
                &nbsp;&nbsp;↳ {childGroup.name}
            </SelectItem>
        ))}
      </SelectGroup>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Ledger Account</DialogTitle>
          <DialogDescription>
            Finance → Chart of Accounts → Add Ledger
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] -mx-6 px-6">
          <div className="py-4 space-y-6 px-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column */}
              <div className="md:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Ledger Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="ledger-name">Ledger Name</Label>
                      <Input id="ledger-name" placeholder="e.g., Office Rent, Bank – Current Account" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="ledger-code">Ledger Code</Label>
                            <Input id="ledger-code" placeholder="Auto-generated" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="account-type">Account Type</Label>
                            <Select value={accountType} onValueChange={(value: CoaNature) => setAccountType(value)}>
                                <SelectTrigger id="account-type">
                                    <SelectValue placeholder="Select type..." />
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
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parent-head">Group / Parent Head</Label>
                       <Select>
                        <SelectTrigger id="parent-head">
                          <SelectValue placeholder="Select a parent group..." />
                        </SelectTrigger>
                        <SelectContent>
                          {loading ? (
                            <SelectItem value="loading" disabled>
                              Loading groups...
                            </SelectItem>
                          ) : filteredGroups.length === 0 ? (
                            <SelectItem value="empty" disabled>
                              No groups found for selected type
                            </SelectItem>
                          ) : (
                            renderGroupOptions(filteredGroups as any)
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nature</Label>
                            <Input value={accountType ? (['ASSET', 'EXPENSE'].includes(accountType) ? 'Debit' : 'Credit') : ''} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="opening-balance">Opening Balance</Label>
                            <Input id="opening-balance" type="number" placeholder="₹0.00" />
                        </div>
                    </div>
                  </CardContent>
                </Card>

                <Tabs defaultValue="gst">
                  <TabsList>
                    <TabsTrigger value="gst">GST</TabsTrigger>
                    <TabsTrigger value="tds-tcs">TDS/TCS</TabsTrigger>
                  </TabsList>
                  <TabsContent value="gst" className="pt-4">
                    <div className="space-y-4 rounded-lg border p-4">
                         <div className="space-y-2">
                            <Label htmlFor="gst-nature">GST Nature</Label>
                            <Select>
                                <SelectTrigger id="gst-nature">
                                <SelectValue placeholder="Select GST nature..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="input">Input GST</SelectItem>
                                    <SelectItem value="output">Output GST</SelectItem>
                                    <SelectItem value="payable">GST Payable (Net)</SelectItem>
                                    <SelectItem value="rcm">RCM / Adjustment</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="tax-rate">Tax Rate (%)</Label>
                                <Input id="tax-rate" type="number" placeholder="e.g., 18" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="hsn-sac">HSN/SAC Code</Label>
                                <Input id="hsn-sac" placeholder="e.g., 9983" />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch id="itc-eligible" />
                            <Label htmlFor="itc-eligible">ITC Eligible</Label>
                        </div>
                         <div className="flex items-center space-x-2">
                            <Switch id="show-in-returns" />
                            <Label htmlFor="show-in-returns">Show in GST Returns</Label>
                        </div>
                    </div>
                  </TabsContent>
                   <TabsContent value="tds-tcs" className="pt-4">
                     <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center space-x-2">
                            <Switch id="enable-tds" />
                            <Label htmlFor="enable-tds">Enable TDS</Label>
                        </div>
                         <div className="flex items-center space-x-2">
                            <Switch id="enable-tcs" />
                            <Label htmlFor="enable-tcs">Enable TCS</Label>
                        </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Accounting Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="direct-posting">Allow Direct Posting</Label>
                      <Switch id="direct-posting" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="requires-approval">Requires Approval</Label>
                      <Switch id="requires-approval" />
                    </div>
                     <div className="flex items-center justify-between">
                      <Label htmlFor="cost-center">Cost Center Required</Label>
                      <Switch id="cost-center" />
                    </div>
                  </CardContent>
                </Card>
                 <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Status &amp; Lock</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="status-active">Status: Active</Label>
                      <Switch id="status-active" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="system-locked">System / Locked Ledger</Label>
                      <Switch id="system-locked" />
                    </div>
                  </CardContent>
                </Card>
                 <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea placeholder="Add any relevant notes here..." />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="border-t pt-6">
          <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="button" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
