
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, CircleDollarSign, Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, updateDoc, writeBatch, serverTimestamp, addDoc, increment } from 'firebase/firestore';
import type { PayoutRequest, CoaLedger } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';


function getStatusBadgeVariant(status: string) {
  const variants: Record<string, string> = {
    'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    'Paid': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  };
  return variants[status];
}

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
};

export default function PayoutsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const { data: payoutRequests, loading } = useCollection<PayoutRequest>(collection(firestore, 'payoutRequests'));
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const [paymentDialog, setPaymentDialog] = React.useState<{ isOpen: boolean; request: PayoutRequest | null; }>({ isOpen: false, request: null });
  const [paymentDate, setPaymentDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentAccountId, setPaymentAccountId] = React.useState('');
  const [paymentRef, setPaymentRef] = React.useState('');
  const [isProcessingPayment, setIsProcessingPayment] = React.useState(false);

  const bankAndCashAccounts = React.useMemo(() => {
    if (!coaLedgers) return [];
    return coaLedgers.filter(l => l.groupId === '1.1.1');
  }, [coaLedgers]);
  
  const openPaymentDialog = (request: PayoutRequest) => {
    setPaymentDialog({ isOpen: true, request });
  };

  const handleProcessPayment = async () => {
    if (!paymentDialog.request || !paymentAccountId) {
      toast({ variant: 'destructive', title: 'Missing Fields' });
      return;
    }
    setIsProcessingPayment(true);
    const { request } = paymentDialog;
    
    try {
      const batch = writeBatch(firestore);

      const jvRef = doc(collection(firestore, 'journalVouchers'));
      const partnerWalletRef = doc(firestore, 'users', request.partnerId, 'wallet', 'main');
      const payoutRequestRef = doc(firestore, 'payoutRequests', request.id);
      
      const commissionLedger = coaLedgers?.find(l => l.name === 'Commission Payable');
      if (!commissionLedger) throw new Error("Commission Payable ledger not found.");

      const jvData = {
        date: paymentDate,
        narration: `Payout to partner ${request.partnerName} for request ${request.id}`,
        entries: [
          { accountId: commissionLedger.id, debit: request.amount, credit: 0 },
          { accountId: paymentAccountId, debit: 0, credit: request.amount }
        ],
        createdAt: serverTimestamp(),
      };
      batch.set(jvRef, jvData);

      batch.update(partnerWalletRef, {
        commissionPayable: increment(-request.amount),
        walletBalance: increment(request.amount)
      });
      
      batch.update(payoutRequestRef, {
        status: 'Paid',
        transactionRef: paymentRef,
        transactionDate: paymentDate,
        paymentAccountId: paymentAccountId
      });

      await batch.commit();

      toast({ title: 'Payment Processed', description: 'Commission payout has been successfully recorded.' });
      setPaymentDialog({ isOpen: false, request: null });
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <>
      <PageHeader title="Partner Payouts" />
      <Card>
        <CardHeader>
          <CardTitle>Payout Requests</CardTitle>
          <CardDescription>
            Process withdrawal requests for partner commissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request Date</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="animate-spin" /></TableCell></TableRow>
              ) : payoutRequests?.map(request => (
                <TableRow key={request.id}>
                  <TableCell>{format(new Date(request.requestDate), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{request.partnerName}</TableCell>
                  <TableCell><Badge className={cn(getStatusBadgeVariant(request.status))}>{request.status}</Badge></TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatIndianCurrency(request.amount)}</TableCell>
                  <TableCell className="text-right">
                    {request.status === 'Pending' && (
                      <Button size="sm" onClick={() => openPaymentDialog(request)}>
                        Process Payout
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <Dialog open={paymentDialog.isOpen} onOpenChange={(open) => setPaymentDialog(prev => ({...prev, isOpen: open}))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payout for {paymentDialog.request?.partnerName}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-lg border bg-muted p-4">
              <p className="text-sm text-muted-foreground">Amount to be Paid</p>
              <p className="text-2xl font-bold">{formatIndianCurrency(paymentDialog.request?.amount || 0)}</p>
            </div>
             <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input id="payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
             <div className="space-y-2">
                <Label htmlFor="payment-account">Paid From Account</Label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                    <SelectTrigger id="payment-account"><SelectValue placeholder="Select bank/cash account..." /></SelectTrigger>
                    <SelectContent>
                        {bankAndCashAccounts.map(acc => (
                          <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label htmlFor="payment-ref">Transaction Reference</Label>
                <Input id="payment-ref" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="e.g., UTR, Cheque No." />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleProcessPayment} disabled={isProcessingPayment}>
                {isProcessingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

    