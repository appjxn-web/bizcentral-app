
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { PlusCircle, Repeat, MoreHorizontal, Edit, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import { collection, query, where, addDoc, serverTimestamp, writeBatch, doc, updateDoc, setDoc } from 'firebase/firestore';
import type { CoaLedger, UserRole, JournalVoucher, CompanyInfo } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type TransferMode = 'Cash Withdrawal' | 'Cash Deposit' | 'Bank to Bank Transfer';


export default function BankAndCashPage() {
  const { toast } = useToast();
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();
  
  const bankAndCashQuery = query(
    collection(firestore, 'coa_ledgers'),
    where('groupId', '==', '1.1.1')
  );
  const { data: accounts, loading } = useCollection<CoaLedger>(bankAndCashQuery);
  const { data: journalVouchers } = useCollection<JournalVoucher>(collection(firestore, 'journalVouchers'));

  const companyInfoRef = doc(firestore, 'company', 'info');
  const { data: companyInfo } = useDoc<CompanyInfo>(companyInfoRef);

  const [isAddAccountDialogOpen, setIsAddAccountDialogOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<CoaLedger | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = React.useState(false);
  
  const [primaryUpiId, setPrimaryUpiId] = React.useState('');

  // State for new bank account
  const [bankAccountHolder, setBankAccountHolder] = React.useState('');
  const [bankName, setBankName] = React.useState('');
  const [bankBranch, setBankBranch] = React.useState('');
  const [bankAccountNo, setBankAccountNo] = React.useState('');
  const [bankIfsc, setBankIfsc] = React.useState('');
  const [adCode, setAdCode] = React.useState('');
  const [upiId, setUpiId] = React.useState('');
  const [bankOpeningBalance, setBankOpeningBalance] = React.useState('');
  
  // State for new cash account
  const [cashAccountName, setCashAccountName] = React.useState('');
  const [cashOpeningBalance, setCashOpeningBalance] = React.useState('');
  const [accountLocation, setAccountLocation] = React.useState('');
  const [linkedUserEmail, setLinkedUserEmail] = React.useState('');

  // State for internal transfer
  const [transferMode, setTransferMode] = React.useState<TransferMode | ''>('');
  const [fromAccountId, setFromAccountId] = React.useState('');
  const [toAccountId, setToAccountId] = React.useState('');
  const [transferAmount, setTransferAmount] = React.useState('');
  const [transferDate, setTransferDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [transferDescription, setTransferDescription] = React.useState('');
  
  React.useEffect(() => {
    if (companyInfo) {
      setPrimaryUpiId(companyInfo.primaryUpiId || '');
    }
  }, [companyInfo]);

  const liveBalances = React.useMemo(() => {
    const balances = new Map<string, number>();
    if (!accounts) return balances;

    // Initialize with opening balances
    accounts.forEach(acc => {
      const openingBal = acc.openingBalance?.amount || 0;
      const balance = acc.openingBalance?.drCr === 'CR' ? -openingBal : openingBal;
      balances.set(acc.id, balance);
    });

    // Apply transactions
    if (journalVouchers) {
      journalVouchers.forEach(jv => {
        jv.entries.forEach(entry => {
          if (balances.has(entry.accountId)) {
            const currentBal = balances.get(entry.accountId)!;
            const newBal = currentBal + (entry.debit || 0) - (entry.credit || 0);
            balances.set(entry.accountId, newBal);
          }
        });
      });
    }

    return balances;
  }, [accounts, journalVouchers]);


  const resetForms = () => {
    setBankAccountHolder(''); setBankName(''); setBankBranch(''); setBankAccountNo(''); setBankIfsc(''); setBankOpeningBalance('');
    setCashAccountName(''); setCashOpeningBalance(''); setAccountLocation(''); setLinkedUserEmail('');
    setAdCode(''); setUpiId('');
    setEditingAccount(null);
  };
  
  React.useEffect(() => {
    if (!isAddAccountDialogOpen) {
      resetForms();
    }
  }, [isAddAccountDialogOpen]);
  
  const handleOpenDialog = (account: CoaLedger | null) => {
    if (account) {
        setEditingAccount(account);
        if(account.type === 'BANK') {
            setBankAccountHolder(account.bank?.accountHolderName || account.name);
            setBankName(account.bank?.bankName || '');
            setBankBranch(account.bank?.branch || '');
            setBankAccountNo(account.bank?.accountNumber || '');
            setBankIfsc(account.bank?.ifscCode || '');
            setAdCode(account.bank?.adCode || '');
            setUpiId(account.bank?.upiId || '');
            setBankOpeningBalance(account.openingBalance?.amount.toString() || '');
        } else {
            setCashAccountName(account.name);
            setCashOpeningBalance(account.openingBalance?.amount.toString() || '');
            setAccountLocation(account.tags?.[0] || '');
            setLinkedUserEmail(account.tags?.[1] || '');
        }
    } else {
        resetForms();
    }
    setIsAddAccountDialogOpen(true);
  };

  const handleAddAccount = async (type: 'Bank' | 'Cash') => {
    let ledgerData: Partial<CoaLedger>;
    let accountName = '';

    if (type === 'Bank') {
        if (!bankAccountHolder || !bankName || !bankAccountNo || !bankIfsc) {
            toast({ variant: 'destructive', title: 'Missing fields', description: 'Please fill all required bank account details.' });
            return;
        }
        accountName = `${bankName} - ${bankAccountNo.slice(-4)}`;
        ledgerData = {
            name: accountName,
            groupId: '1.1.1', // Cash & Bank group
            nature: 'ASSET',
            type: 'BANK',
            posting: { isPosting: true, normalBalance: 'DEBIT', isSystem: false, allowManualJournal: true },
            bank: {
                accountHolderName: bankAccountHolder,
                bankName: bankName,
                branch: bankBranch,
                accountNumber: bankAccountNo,
                accountNumberMasked: `****${bankAccountNo.slice(-4)}`,
                ifscCode: bankIfsc,
                adCode: adCode,
                upiId: upiId,
                accountType: 'CURRENT'
            },
            openingBalance: {
                amount: Number(bankOpeningBalance) || 0,
                drCr: 'DR',
                asOf: editingAccount?.openingBalance?.asOf || new Date().toISOString()
            },
            status: 'ACTIVE',
        };
    } else { // Cash
        if (!cashAccountName) {
            toast({ variant: 'destructive', title: 'Missing fields', description: 'Please provide a name for the cash account.' });
            return;
        }
        accountName = cashAccountName;
        ledgerData = {
            name: cashAccountName,
            groupId: '1.1.1', // Cash & Bank group
            nature: 'ASSET',
            type: 'CASH',
            posting: { isPosting: true, normalBalance: 'DEBIT', isSystem: false, allowManualJournal: true },
            openingBalance: {
                amount: Number(cashOpeningBalance) || 0,
                drCr: 'DR',
                asOf: editingAccount?.openingBalance?.asOf || new Date().toISOString()
            },
            status: 'ACTIVE',
            tags: [accountLocation, linkedUserEmail].filter(Boolean)
        };
    }
    
    try {
        if (editingAccount) {
            const accountRef = doc(firestore, 'coa_ledgers', editingAccount.id);
            // When editing, don't change the opening balance
            const { openingBalance, ...updateData } = ledgerData;
            await updateDoc(accountRef, { ...updateData, updatedAt: serverTimestamp() });
            toast({ title: 'Account Updated', description: `${accountName} has been updated.` });
        } else {
            await addDoc(collection(firestore, 'coa_ledgers'), { ...ledgerData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            toast({ title: `${type} Account Added`, description: `${accountName} has been added.` });
        }
        setIsAddAccountDialogOpen(false);
    } catch (e) {
        console.error("Error saving account:", e);
        toast({ variant: 'destructive', title: 'Error', description: `Could not save ${type} account.` });
    }
  };
  
  
  const handleInternalTransfer = () => {
    const fromAccount = accounts?.find(a => a.id === fromAccountId);
    if (!fromAccountId || !toAccountId || !transferAmount || !fromAccount) {
      toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please select from/to accounts and an amount.' });
      return;
    }
    if (fromAccountId === toAccountId) {
      toast({ variant: 'destructive', title: 'Invalid Transfer', description: 'Cannot transfer funds to the same account.' });
      return;
    }
    const amount = Number(transferAmount);
    const balance = liveBalances.get(fromAccountId) || 0;
    if (balance < amount) {
        toast({ variant: 'destructive', title: 'Insufficient Funds', description: `Account ${fromAccount.name} only has ₹${balance.toFixed(2)}.` });
        return;
    }

    const jvData = {
        date: transferDate,
        narration: transferDescription || `Internal transfer from ${fromAccount.name} to ${accounts?.find(a => a.id === toAccountId)?.name}`,
        entries: [
            { accountId: toAccountId, debit: amount, credit: 0 },
            { accountId: fromAccountId, debit: 0, credit: amount },
        ],
        createdAt: serverTimestamp(),
    };
    
    const jvCollectionRef = collection(firestore, 'journalVouchers');
    addDoc(jvCollectionRef, jvData).then(() => {
        toast({
            title: 'Transfer Recorded',
            description: `A journal voucher for ₹${amount.toFixed(2)} has been created.`
        });
        
        setIsTransferDialogOpen(false);
        setFromAccountId('');
        setToAccountId('');
        setTransferAmount('');
        setTransferDescription('');
        setTransferDate(format(new Date(), 'yyyy-MM-dd'));
        setTransferMode('');
    }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: jvCollectionRef.path, operation: 'create', requestResourceData: jvData
        }));
    });
  };
  
  const handleSavePrimaryUpi = async () => {
    await updateDoc(companyInfoRef, { primaryUpiId });
    toast({ title: 'Primary UPI Saved', description: 'This UPI ID will be used for QR code payments.' });
  }

  const fromAccounts = React.useMemo(() => {
    if (!accounts) return [];
    if (!transferMode) return accounts;
    if (transferMode === 'Cash Withdrawal') return accounts.filter(acc => acc.type === 'BANK');
    if (transferMode === 'Cash Deposit') return accounts.filter(acc => acc.type === 'CASH');
    if (transferMode === 'Bank to Bank Transfer') return accounts.filter(acc => acc.type === 'BANK');
    return [];
  }, [transferMode, accounts]);

  const toAccounts = React.useMemo(() => {
    if (!accounts) return [];
    if (!transferMode) return accounts;
    if (transferMode === 'Cash Withdrawal') return accounts.filter(acc => acc.type === 'CASH');
    if (transferMode === 'Cash Deposit') return accounts.filter(acc => acc.type === 'BANK');
    if (transferMode === 'Bank to Bank Transfer') return accounts.filter(acc => acc.type === 'BANK');
    return [];
  }, [transferMode, accounts]);


  const handleRowClick = (accountId: string) => {
    router.push(`/dashboard/finance-accounting/bank-cash/view?accountId=${accountId}`);
  };

  const bankAccounts = React.useMemo(() => accounts?.filter(acc => acc.type === 'BANK') || [], [accounts]);
  const cashAccounts = React.useMemo(() => accounts?.filter(acc => acc.type === 'CASH') || [], [accounts]);

  const renderAccountOption = (acc: CoaLedger) => (
    <SelectItem key={acc.id} value={acc.id}>
      <div className="flex justify-between w-full">
        <span>{acc.name} ({acc.type})</span>
        <span className="text-muted-foreground font-mono">₹{(liveBalances.get(acc.id) || 0).toFixed(2)}</span>
      </div>
    </SelectItem>
  );

  return (
    <>
      <PageHeader title="Bank & Cash">
        <div className="flex gap-2">
            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Repeat className="mr-2 h-4 w-4" /> Internal Transfer</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Internal Fund Transfer</DialogTitle>
                  <DialogDescription>
                    Move funds between your bank and cash accounts.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="transfer-mode">Mode</Label>
                    <Select value={transferMode} onValueChange={(value: TransferMode) => { setTransferMode(value); setFromAccountId(''); setToAccountId(''); }}>
                        <SelectTrigger id="transfer-mode"><SelectValue placeholder="Select transfer mode" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Cash Withdrawal">Cash Withdrawal</SelectItem>
                            <SelectItem value="Cash Deposit">Cash Deposit</SelectItem>
                            <SelectItem value="Bank to Bank Transfer">Bank to Bank Transfer</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="from-account">From Account</Label>
                    <Select value={fromAccountId} onValueChange={setFromAccountId} disabled={!transferMode}>
                        <SelectTrigger id="from-account"><SelectValue placeholder="Select source account" /></SelectTrigger>
                        <SelectContent>
                            {fromAccounts.map(renderAccountOption)}
                        </SelectContent>
                    </Select>
                  </div>
                   <div className="space-y-2">
                    <Label htmlFor="to-account">To Account</Label>
                    <Select value={toAccountId} onValueChange={setToAccountId} disabled={!transferMode}>
                        <SelectTrigger id="to-account"><SelectValue placeholder="Select destination account" /></SelectTrigger>
                        <SelectContent>
                            {toAccounts.map(acc => (
                              <SelectItem key={acc.id} value={acc.id} disabled={acc.id === fromAccountId}>
                                <div className="flex justify-between w-full">
                                  <span>{acc.name}</span>
                                  <span className="text-muted-foreground font-mono">₹{(liveBalances.get(acc.id) || 0).toFixed(2)}</span>
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  </div>
                   <div className="space-y-2">
                    <Label htmlFor="transfer-amount">Amount</Label>
                    <Input id="transfer-amount" type="number" placeholder="₹0.00" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
                  </div>
                   <div className="space-y-2">
                    <Label htmlFor="transfer-date">Date</Label>
                    <Input id="transfer-date" type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer-description">Description (Optional)</Label>
                    <Input id="transfer-description" placeholder="e.g., Cash withdrawal for office expenses" value={transferDescription} onChange={e => setTransferDescription(e.target.value)} />
                  </div>
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleInternalTransfer}>Record Transfer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddAccountDialogOpen} onOpenChange={setIsAddAccountDialogOpen}>
            <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog(null)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Account
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                <DialogTitle>{editingAccount ? 'Edit' : 'Add New'} Account</DialogTitle>
                <DialogDescription>
                    {editingAccount ? 'Update the details for this account.' : 'Create a new bank or cash account to track transactions.'}
                </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="bank">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="bank">Bank Account</TabsTrigger>
                        <TabsTrigger value="cash">Cash Account</TabsTrigger>
                    </TabsList>
                    <TabsContent value="bank">
                        <ScrollArea className="h-[60vh]">
                            <div className="space-y-4 py-4 pr-6">
                                <div className="space-y-2">
                                    <Label htmlFor="bank-holder-name">Account Holder Name</Label>
                                    <Input id="bank-holder-name" placeholder="e.g., JXN Infra Pvt. Ltd." value={bankAccountHolder} onChange={e => setBankAccountHolder(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bank-name">Bank Name</Label>
                                    <Input id="bank-name" placeholder="e.g., HDFC Bank" value={bankName} onChange={e => setBankName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bank-branch">Branch</Label>
                                    <Input id="bank-branch" placeholder="e.g., Main Branch, Jaipur" value={bankBranch} onChange={e => setBankBranch(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bank-account-no">Account Number</Label>
                                    <Input id="bank-account-no" placeholder="Enter account number" value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bank-ifsc">IFSC Code</Label>
                                    <Input id="bank-ifsc" placeholder="Enter IFSC code" value={bankIfsc} onChange={e => setBankIfsc(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ad-code">AD CODE (Optional)</Label>
                                    <Input id="ad-code" placeholder="Enter AD Code" value={adCode} onChange={e => setAdCode(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="upi-id">UPI ID (Optional)</Label>
                                    <Input id="upi-id" placeholder="e.g., username@upi" value={upiId} onChange={e => setUpiId(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bank-opening-balance">Opening Balance</Label>
                                    <Input id="bank-opening-balance" type="number" placeholder="₹0.00" value={bankOpeningBalance} onChange={e => setBankOpeningBalance(e.target.value)} disabled={!!editingAccount} />
                                </div>
                            </div>
                        </ScrollArea>
                        <DialogFooter className="pt-4 border-t">
                            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                            <Button onClick={() => handleAddAccount('Bank')}>Save Bank Account</Button>
                        </DialogFooter>
                    </TabsContent>
                    <TabsContent value="cash">
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="cash-account-name">Account Name</Label>
                                <Input id="cash-account-name" placeholder="e.g., Petty Cash, Main Cash" value={cashAccountName} onChange={e => setCashAccountName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="account-location">Account Location</Label>
                                <Input id="account-location" placeholder="e.g., Main Office Drawer" value={accountLocation} onChange={e => setAccountLocation(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="link-user">Link to User</Label>
                                <Input id="link-user" type="email" placeholder="Enter user's email" value={linkedUserEmail} onChange={e => setLinkedUserEmail(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cash-opening-balance">Opening Balance</Label>
                                <Input id="cash-opening-balance" type="number" placeholder="₹0.00" value={cashOpeningBalance} onChange={e => setCashOpeningBalance(e.target.value)} disabled={!!editingAccount}/>
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                            <Button onClick={() => handleAddAccount('Cash')}>Save Cash Account</Button>
                        </DialogFooter>
                    </TabsContent>
                </Tabs>
            </DialogContent>
            </Dialog>
        </div>
      </PageHeader>
      
      <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Primary UPI for Payments</CardTitle>
                <CardDescription>Select the default UPI ID to be used for generating QR codes on invoices and checkout.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-end gap-4">
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="primary-upi">Primary UPI ID</Label>
                        <Select value={primaryUpiId} onValueChange={setPrimaryUpiId}>
                            <SelectTrigger id="primary-upi">
                                <SelectValue placeholder="Select a UPI ID" />
                            </SelectTrigger>
                            <SelectContent>
                                {bankAccounts.filter(acc => acc.bank?.upiId).map(acc => (
                                    <SelectItem key={acc.id} value={acc.bank!.upiId!}>
                                        {acc.bank!.upiId} ({acc.name})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleSavePrimaryUpi}>
                        <Save className="mr-2 h-4 w-4" /> Save Primary UPI
                    </Button>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Bank Accounts</CardTitle>
                <CardDescription>A list of all your company bank accounts.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Account Name</TableHead>
                            <TableHead>Bank Name</TableHead>
                            <TableHead>Account No.</TableHead>
                            <TableHead className="text-right">Current Balance</TableHead>
                            <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                             <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
                        ) : bankAccounts.length > 0 ? (
                            bankAccounts.map(acc => (
                                <TableRow key={acc.id} >
                                    <TableCell className="font-medium cursor-pointer" onClick={() => handleRowClick(acc.id)}>{acc.name}</TableCell>
                                    <TableCell className="cursor-pointer" onClick={() => handleRowClick(acc.id)}>{acc.bank?.bankName}</TableCell>
                                    <TableCell className="font-mono cursor-pointer" onClick={() => handleRowClick(acc.id)}>{acc.bank?.accountNumberMasked}</TableCell>
                                    <TableCell className="text-right font-mono cursor-pointer" onClick={() => handleRowClick(acc.id)}>₹{(liveBalances.get(acc.id) || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(acc)}>
                                            <Edit className="h-4 w-4" />
                                            <span className="sr-only">Edit</span>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No bank accounts added yet.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Cash Accounts</CardTitle>
                <CardDescription>A list of all your physical cash accounts.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Account Name</TableHead>
                            <TableHead>Location / Linked User</TableHead>
                            <TableHead className="text-right">Current Balance</TableHead>
                            <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                             <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading...</TableCell></TableRow>
                        ) : cashAccounts.length > 0 ? (
                            cashAccounts.map(acc => (
                                <TableRow key={acc.id}>
                                    <TableCell className="font-medium cursor-pointer" onClick={() => handleRowClick(acc.id)}>{acc.name}</TableCell>
                                    <TableCell className="cursor-pointer" onClick={() => handleRowClick(acc.id)}>{acc.tags?.join(', ') || 'N/A'}</TableCell>
                                    <TableCell className="text-right font-mono cursor-pointer" onClick={() => handleRowClick(acc.id)}>₹{(liveBalances.get(acc.id) || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(acc)}>
                                            <Edit className="h-4 w-4" />
                                            <span className="sr-only">Edit</span>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No cash accounts added yet.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </>
  );
}
