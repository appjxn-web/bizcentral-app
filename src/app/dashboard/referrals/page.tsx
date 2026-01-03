
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Gift, Users, CircleDollarSign, TrendingUp, ListFilter, Wallet, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { useFirestore, useUser, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, writeBatch, increment } from 'firebase/firestore';
import type { Referral, UserProfile } from '@/lib/types';


type ReferralStatus = 'Pending' | 'Signed Up' | 'First Purchased' | 'Completed';

const allStatuses: ReferralStatus[] = ['Pending', 'Signed Up', 'First Purchased', 'Completed'];

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'Signed Up':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'First Purchased':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'Completed':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

export default function ReferralsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const { data: referralHistory, loading } = useCollection<Referral>(
    user ? collection(firestore, 'users', user.uid, 'referrals') : null
  );
  
  const { data: companyInfo } = useDoc<{ referralAmount?: string, commissionPercent?: string }>(doc(firestore, 'company', 'info'));
  const { data: userProfile } = useDoc<UserProfile>(user ? doc(firestore, 'users', user.uid) : null);

  const [isRedeeming, setIsRedeeming] = React.useState(false);
  const [customerName, setCustomerName] = React.useState('');
  const [mobileNumber, setMobileNumber] = React.useState('');
  const [statusFilters, setStatusFilters] = React.useState<ReferralStatus[]>([]);

  const filteredHistory = React.useMemo(() => {
    if (!referralHistory) return [];
    if (statusFilters.length === 0) {
      return referralHistory;
    }
    return referralHistory.filter(referral => statusFilters.includes(referral.status));
  }, [referralHistory, statusFilters]);

  const handleStatusFilterChange = (status: ReferralStatus) => {
    setStatusFilters(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, s]
    );
  };

  const handleSendInvite = async () => {
    if (!customerName) {
      toast({
        variant: 'destructive',
        title: 'Name is required',
        description: 'Please enter the customer\'s name.',
      });
      return;
    }
    
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobileNumber)) {
      toast({
        variant: 'destructive',
        title: 'Invalid Mobile Number',
        description: 'Please enter a valid 10-digit Indian mobile number.',
      });
      return;
    }
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Authenticated' });
        return;
    }
    
    const referralAmount = companyInfo?.referralAmount ? Number(companyInfo.referralAmount) : 100;
    const commissionPercent = companyInfo?.commissionPercent ? Number(companyInfo.commissionPercent) : 0;


    const newReferral: Omit<Referral, 'id'> = {
      name: customerName,
      mobile: mobileNumber,
      status: 'Pending',
      referredBy: user.uid,
      createdAt: serverTimestamp() as any,
      earnings: referralAmount,
      commission: commissionPercent,
    };

    try {
        await addDoc(collection(firestore, 'users', user.uid, 'referrals'), newReferral);
        
        const signupLink = `${window.location.origin}/signup?ref=${user.uid}&mobile=${mobileNumber}&name=${encodeURIComponent(customerName)}`;
        const inviterName = user.displayName || 'a friend';

        const message = `You’re Invited to JXN Infra Equipment Private Limited

Experience India’s trusted paver & block making machinery platform.
Join the JXN App to explore machines, offers, referrals, and business tools designed for manufacturers.

👉 Sign up: ${signupLink}

— By ${inviterName}`;
        
        const whatsappUrl = `https://wa.me/91${mobileNumber}?text=${encodeURIComponent(message)}`;
        
        window.open(whatsappUrl, '_blank');

        toast({
          title: 'Referral Saved & WhatsApp Opened',
          description: `Your referral for ${customerName} has been saved. Please send the message in WhatsApp.`,
        });

        setCustomerName('');
        setMobileNumber('');
    } catch (e) {
        console.error(e);
        toast({
            variant: 'destructive',
            title: 'Failed to save referral',
        });
    }

  };

  const { availableEarnings, totalEarnings } = React.useMemo(() => {
    if (!referralHistory) return { availableEarnings: 0, totalEarnings: 0 };
    
    let available = 0;
    let total = 0;

    referralHistory.forEach(r => {
        let referralTotalEarning = 0;
        if (['Signed Up', 'First Purchased', 'Completed'].includes(r.status)) {
            referralTotalEarning += r.earnings || 0;
        }
        if (['First Purchased', 'Completed'].includes(r.status)) {
            referralTotalEarning += r.commission || 0;
        }
        total += referralTotalEarning;

        if (r.status === 'First Purchased') {
            available += (r.earnings || 0) + (r.commission || 0);
        }
    });

    return { availableEarnings: available, totalEarnings: total };
  }, [referralHistory]);


  const canRedeem = availableEarnings >= 1000;

  const handleRedeem = async () => {
    if (!user || !canRedeem) {
        toast({
            variant: 'destructive',
            title: 'Redemption Failed',
            description: `You need at least ₹1000 to redeem your earnings.`,
        });
        return;
    }
    
    setIsRedeeming(true);
    const userRef = doc(firestore, 'users', user.uid);
    const referralsToUpdate = referralHistory?.filter(r => r.status === 'First Purchased') || [];
    
    if (referralsToUpdate.length === 0) {
        toast({
            variant: 'destructive',
            title: 'Nothing to Redeem',
            description: 'There are no earnings from first purchases available to redeem.',
        });
        setIsRedeeming(false);
        return;
    }

    try {
        const batch = writeBatch(firestore);
        
        batch.update(userRef, { commissionPayable: increment(availableEarnings) });

        referralsToUpdate.forEach(referral => {
            const referralRef = doc(firestore, 'users', user.uid, 'referrals', referral.id);
            batch.update(referralRef, { status: 'Completed' });
        });

        await batch.commit();

        toast({
            title: 'Redemption Successful',
            description: `₹${availableEarnings.toFixed(2)} has been moved to your commission payable account.`,
        });
    } catch (error) {
        console.error("Redemption error:", error);
        toast({
            variant: 'destructive',
            title: 'Redemption Failed',
            description: 'There was an error processing your request. Please try again.',
        });
    } finally {
        setIsRedeeming(false);
    }
  };

  const getEarningForReferral = (referral: Referral) => {
    if (['Signed Up', 'First Purchased', 'Completed'].includes(referral.status)) {
        const total = (referral.earnings || 0) + (['First Purchased', 'Completed'].includes(referral.status) ? (referral.commission || 0) : 0);
        return `₹${total.toFixed(2)}`;
    }
    if (referral.status === 'Pending') {
      return `(₹${(referral.earnings || 0).toFixed(2)})`;
    }
    return '-';
  };

  const FilterDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <ListFilter className="h-4 w-4" />
          <span className="sr-only">Filter by status</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-40">
          {allStatuses.map(status => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={statusFilters.includes(status)}
              onCheckedChange={() => handleStatusFilterChange(status)}
            >
              {status}
            </DropdownMenuCheckboxItem>
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <PageHeader title="Referrals">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Invite Customer
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite a Customer via WhatsApp</DialogTitle>
              <DialogDescription>
                Enter the details to open WhatsApp with a pre-filled invitation message.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
               <div className="space-y-2">
                <Label htmlFor="customer-name">Name</Label>
                <Input
                  id="customer-name"
                  placeholder="e.g., Jane Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile-number">Mobile Number</Label>
                <Input
                  id="mobile-number"
                  type="tel"
                  placeholder="e.g., 9876543210"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button type="button" onClick={handleSendInvite}>Send Invite</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralHistory?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Total customers invited.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful Referrals</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralHistory?.filter(r => ['Signed Up', 'First Purchased', 'Completed'].includes(r.status)).length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Friends who have successfully signed up.
            </p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalEarnings.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Includes all redeemed and available earnings.
            </p>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available for Payout</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex-grow">
            <div className="text-2xl font-bold">₹{availableEarnings.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              From referrals who made a first purchase.
            </p>
          </CardContent>
          <CardFooter className="flex-col items-start gap-2">
            <Button className="w-full" disabled={!canRedeem || isRedeeming} onClick={handleRedeem}>
                {isRedeeming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                Redeem to Commission Payable
            </Button>
            <p className="text-xs text-muted-foreground">Redeeming moves earnings to your Commission Payable account for admin payout. Min. redemption: ₹1,000.</p>
          </CardFooter>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex justify-between items-center">
          <div>
            <CardTitle>Referral History</CardTitle>
            <CardDescription>
                Track the status of your referrals and earnings.
            </CardDescription>
          </div>
          {FilterDropdown}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invited Customer</TableHead>
                <TableHead>Mobile No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Earnings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading referrals...</TableCell></TableRow>
              ) : filteredHistory.length > 0 ? (
                filteredHistory.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell className="font-medium">{referral.name}</TableCell>
                    <TableCell>{referral.mobile}</TableCell>
                    <TableCell>{referral.createdAt ? format(new Date(referral.createdAt.toDate()), 'dd/MM/yyyy') : '...'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', getStatusBadgeVariant(referral.status))}>
                        {referral.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {getEarningForReferral(referral as any)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No referrals found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
