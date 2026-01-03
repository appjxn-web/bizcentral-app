
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup, sendEmailVerification } from 'firebase/auth';
import { setDoc, doc, collection, query, where, getDocs, writeBatch, serverTimestamp, updateDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore, useDoc } from '@/firebase';
import { Chrome, Loader2 } from 'lucide-react';
import type { UserRole, CoaNature, CoaLedger, PartyType, Party, UserProfile } from '@/lib/types';


const formSchema = z.object({
  contactPerson: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  businessName: z.string().min(2, { message: 'Business Name is required.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  mobile: z.string().min(10, { message: 'Please enter a valid 10-digit mobile number.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

export default function SignupPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = React.useState(false);
  const companyInfoRef = doc(firestore, 'company', 'info');
  const { data: companyInfo } = useDoc<{ logo?: string }>(companyInfoRef);
  
  const refId = searchParams.get('ref');
  const referredByMobile = searchParams.get('mobile');
  const referredByName = searchParams.get('name');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contactPerson: referredByName || '',
      businessName: '',
      email: '',
      mobile: referredByMobile || '',
      password: '',
    },
  });

  const createUserProfile = async (userId: string, name: string, email: string | null, businessName?: string | null, mobile?: string | null) => {
    const userRole: UserRole = email && ADMIN_EMAILS.includes(email) ? 'Admin' : 'Customer';
    const batch = writeBatch(firestore);
    
    const ledgerName = businessName || name;

    // 1. Create a new Ledger account for the customer under Trade Receivables
    const newLedgerRef = doc(collection(firestore, 'coa_ledgers'));
    const newLedgerData: Omit<CoaLedger, 'id' | 'createdAt' | 'updatedAt'> = {
        name: ledgerName,
        groupId: '1.1.2', // Trade Receivables group ID
        nature: 'ASSET' as CoaNature,
        type: 'RECEIVABLE',
        posting: { isPosting: true, normalBalance: 'DEBIT', isSystem: false, allowManualJournal: true },
        openingBalance: { amount: 0, drCr: 'DR', asOf: new Date().toISOString() },
        status: 'ACTIVE',
    };
    batch.set(newLedgerRef, {...newLedgerData, id: newLedgerRef.id});

    // 2. Create the user profile with the new ledger ID
    const userProfileRef = doc(firestore, 'users', userId);
    const profileData: any = {
        uid: userId,
        displayName: name,
        name: ledgerName,
        email,
        role: userRole,
        status: 'Active',
        createdAt: new Date().toISOString(),
        coaLedgerId: newLedgerRef.id,
    };
    if (businessName) profileData.businessName = businessName;
    if (mobile) profileData.mobile = mobile;
    
    // 3. Create a corresponding Party record
    const partyRef = doc(firestore, 'parties', userId);
    const partyData: Omit<Party, 'id'> = {
        name: ledgerName,
        contactPerson: name,
        type: 'Customer' as PartyType,
        email: email || '',
        phone: mobile || '',
        status: 'Active',
        createdAt: new Date().toISOString(),
        createdBy: 'Self-Signup',
        coaLedgerId: newLedgerRef.id,
    };
    batch.set(partyRef, { ...partyData, id: userId });

    // 4. Handle referral logic
    if (refId && referredByMobile && mobile === referredByMobile) {
        const referralsRef = collection(firestore, 'users', refId, 'referrals');
        const q = query(referralsRef, where('mobile', '==', referredByMobile), where('status', '==', 'Pending'));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const referralDoc = querySnapshot.docs[0];
            batch.update(referralDoc.ref, { status: 'Signed Up' });
            profileData.referredBy = refId;
        }
    }
    
    batch.set(userProfileRef, profileData, { merge: true });

    // 5. Commit all operations
    await batch.commit();
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      await updateProfile(userCredential.user, { displayName: values.contactPerson });
      
      await sendEmailVerification(userCredential.user);

      await createUserProfile(userCredential.user.uid, values.contactPerson, values.email, values.businessName, values.mobile);
      
      toast({
        title: 'Account Created & Verification Email Sent',
        description: "You've been successfully signed up! Please check your email to verify your account.",
      });
      router.push('/dashboard');
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Sign Up Failed',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      await createUserProfile(user.uid, user.displayName || 'Google User', user.email, user.displayName || 'Google User', user.phoneNumber);

      toast({
        title: 'Sign Up Successful',
        description: 'Welcome!',
      });
      router.push('/dashboard');
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const ADMIN_EMAILS = ['care@jxnindia.com', 'appjxn@gmail.com'];

  return (
    <div className="flex items-center justify-center p-4 min-h-screen">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader className="text-center">
            {companyInfo?.logo && (
                <Link href="/" className="flex justify-center mb-4">
                    <Image src={companyInfo.logo} alt="Company Logo" width={140} height={32} />
                </Link>
            )}
          <CardTitle className="text-2xl">Sign Up</CardTitle>
          <CardDescription>
            Enter your information to create an account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Person</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name * (As per ID/PAN)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Acme Inc." {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="m@example.com" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+91 1234567890" {...field} disabled={isLoading || !!referredByMobile} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create an account
              </Button>
              <Button variant="outline" type="button" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading}>
                <Chrome className="mr-2 h-4 w-4" />
                Sign up with Google
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            Already have an account?{' '}
            <Link href="/login" className="underline">
              Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
