

'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, UserRole, Party, CoaLedger, PartyType, CoaNature } from '@/lib/types';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, writeBatch, serverTimestamp, query, where, addDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useAuth } from '@/firebase';


const allRoles: UserRole[] = [
  'Admin', 'Manager', 'Employee', 'Customer', 'CEO', 'Sales Manager', 'Production Manager', 'Purchase Manager', 'Service Manager', 'Accounts Manager', 'HR Manager', 'Gate Keeper', 'Inventory Manager', 'Partner',
];

const formSchema = z.object({
  contactPerson: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email(),
  role: z.enum(allRoles),
  businessName: z.string().optional(),
  mobile: z.string().optional(),
  password: z.string().optional(),
});

export type UserFormValues = z.infer<typeof formSchema>;

interface UserFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: UserProfile | null;
  onSave: (data: UserFormValues, userId?: string) => void;
}

export function UserFormSheet({ open, onOpenChange, initialData, onSave }: UserFormSheetProps) {
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();

  const { data: coaLedgers, loading: ledgersLoading } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));


  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contactPerson: '',
      email: '',
      role: 'Customer',
      businessName: '',
      mobile: '',
      password: '',
    },
  });

  React.useEffect(() => {
    if (initialData) {
      form.reset({
        contactPerson: initialData.displayName || '',
        email: initialData.email,
        role: initialData.role,
        businessName: (initialData as any).businessName || '',
        mobile: (initialData as any).mobile || '',
        password: '',
      });
    } else {
      form.reset(form.formState.defaultValues);
    }
  }, [initialData, form, open]);

  const onSubmit = (data: UserFormValues) => {
    onSave(data, initialData?.id);
    onOpenChange(false);
  };
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{initialData ? 'Edit User' : 'Add New User'}</SheetTitle>
          <SheetDescription>
            {initialData ? "Update the user's details." : 'Fill in the details for the new user.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              <Form {...form}>
                <form id="user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
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
                          <Input placeholder="Acme Inc." {...field} />
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
                          <Input type="email" placeholder="m@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!initialData && (
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormDescription>
                            A temporary password for the new user.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="mobile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobile (Optional)</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="+91 1234567890" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {allRoles.map(role => (
                                <SelectItem key={role} value={role}>{role}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </div>
          </ScrollArea>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button type="submit" form="user-form">
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
