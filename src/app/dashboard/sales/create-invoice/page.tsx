

'use client';

import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { salesInvoiceSchema, type SalesInvoiceInput } from '@/features/sales/schemas/sales.schema';
import { salesInvoiceDraftRepo } from '@/features/sales/services/sales-invoice-draft.repo';
import { postInvoice } from '@/features/sales/services/post-invoice.client';
import { InvoiceStatusChip } from '@/features/sales/components/invoice-status-chip';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle, Save, Trash2, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Party, Product, UserRole } from '@/lib/types';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirestore, useCollection, useUser } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";


const companyGstin = '08AAFCJ5369P1ZR';

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
};

type FormValues = SalesInvoiceInput;

const defaultValues: Omit<FormValues, 'invoiceNo'> & { invoiceNo: string | undefined } = {
  invoiceDate: new Date().toISOString().slice(0, 10),
  invoiceNo: undefined, // Let the system generate it
  customerId: "",
  warehouseId: "main_warehouse", // Default warehouse
  items: [{ productId: "", qty: 1, rate: 0, gstRate: 18 }],
  discount: 0,
  shipping: 0,
  note: "",
};


export default function CreateInvoicePage() {
    const { toast } = useToast();
    const router = useRouter();
    const firestore = useFirestore();
    const { user: authUser } = useUser();
    const searchParams = useSearchParams();
    const fromOrderId = searchParams.get('orderId');

    const { data: parties, loading: partiesLoading } = useCollection<Party>(query(collection(firestore, 'parties'), where('type', '==', 'Customer')));
    const { data: products, loading: productsLoading } = useCollection<Product>(query(collection(firestore, 'products'), where('saleable', '==', true)));
    
    // UI State
    const [invoiceId, setInvoiceId] = React.useState<string | null>(null);
    const [status, setStatus] = React.useState<"DRAFT" | "POSTING" | "POSTED" | "FAILED">("DRAFT");
    const [postError, setPostError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [openCustomerCombobox, setOpenCustomerCombobox] = React.useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(salesInvoiceSchema),
        defaultValues: defaultValues as FormValues,
        mode: "onChange",
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const watchedItems = form.watch("items");
    const watchedDiscount = form.watch("discount");
    const watchedShipping = form.watch("shipping");
    const selectedPartyId = form.watch("customerId");
    const selectedParty = React.useMemo(() => parties?.find(p => p.id === selectedPartyId), [selectedPartyId, parties]);
    const isInterstate = React.useMemo(() => selectedParty?.gstin && !companyGstin.startsWith(selectedParty.gstin.substring(0, 2)), [selectedParty]);
    
    const calculations = React.useMemo(() => {
        const subtotal = watchedItems.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0);
        const totalDiscountAmount = subtotal * ((Number(watchedDiscount) || 0) / 100);
        const taxableAmount = subtotal - totalDiscountAmount;
        const totalGst = watchedItems.reduce((acc, item) => {
            const itemSubtotal = (Number(item.qty) || 0) * (Number(item.rate) || 0);
            const itemDiscount = itemSubtotal * ((Number(watchedDiscount) || 0) / 100);
            const discountedAmount = itemSubtotal - itemDiscount;
            return acc + (discountedAmount * ((Number(item.gstRate) || 0) / 100));
        }, 0);
        const grandTotal = taxableAmount + totalGst + (Number(watchedShipping) || 0);
        const cgst = isInterstate ? 0 : totalGst / 2;
        const sgst = isInterstate ? 0 : totalGst / 2;
        const igst = isInterstate ? totalGst : 0;
        return { subtotal, totalDiscountAmount, taxableAmount, grandTotal, totalGst, cgst, sgst, igst };
    }, [watchedItems, watchedDiscount, watchedShipping, isInterstate]);


    async function saveDraft() {
        setBusy(true);
        setPostError(null);
        try {
            const values = salesInvoiceSchema.parse(form.getValues());
            if (!invoiceId) {
                const id = await salesInvoiceDraftRepo.createDraft("default", values, authUser!.uid);
                setInvoiceId(id);
                // Also update the form with the generated invoice number if it's empty
                 if (!values.invoiceNo) {
                    form.setValue('invoiceNo', id);
                }
                toast({ title: "Draft Saved", description: "Your invoice has been saved as a draft." });
            } else {
                await salesInvoiceDraftRepo.updateDraft("default", invoiceId, values, authUser!.uid);
                toast({ title: "Draft Updated", description: "Your changes have been saved." });
            }
            setStatus("DRAFT");
        } catch (e: any) {
            setPostError(e?.message ?? "Draft save failed");
        } finally {
            setBusy(false);
        }
    }

    async function postNow() {
        if (!invoiceId) {
            toast({ variant: "destructive", title: "Save a draft first", description: "You must save a draft before you can post the invoice." });
            return;
        }
        setBusy(true);
        setPostError(null);
        try {
            setStatus("POSTING");
            const res = await postInvoice("default", invoiceId);

            if (res?.ok) {
                setStatus("POSTED");
                toast({ title: "Invoice Posted Successfully!", description: `Voucher ID: ${res.voucherId}` });
                // Redirect after successful post
                setTimeout(() => router.push('/dashboard/sales/invoice'), 1500);
            } else {
                throw new Error(res?.message || "Posting failed due to an unknown error from the server.");
            }
        } catch (e: any) {
            setStatus("FAILED");
            setPostError(e?.message ?? "Posting failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="p-4 space-y-4">
        <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle className="text-xl">New Sales Invoice</CardTitle>
                 <div className="text-xs text-muted-foreground mt-1">
                    {invoiceId ? `Draft ID: ${invoiceId}` : "Not saved yet"}
                </div>
            </div>
            <InvoiceStatusChip status={status} />
            </CardHeader>

            <CardContent className="space-y-6">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(postNow)}>
                        <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <FormField
                            control={form.control}
                            name="customerId"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Customer</FormLabel>
                                <Popover open={openCustomerCombobox} onOpenChange={setOpenCustomerCombobox}>
                                    <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                        variant="outline"
                                        role="combobox"
                                        className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                                        >
                                        {field.value ? parties?.find(p => p.id === field.value)?.name : "Select a customer..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                    <Command>
                                        <CommandInput placeholder="Search customer..." />
                                        <CommandList>
                                        <CommandEmpty>No customer found.</CommandEmpty>
                                        <CommandGroup>
                                            {(parties || []).filter(p => p.type === 'Customer').map((party) => (
                                            <CommandItem
                                                key={party.id}
                                                value={party.name}
                                                onSelect={() => { form.setValue("customerId", party.id); setOpenCustomerCombobox(false); }}
                                            >
                                                <Check className={cn("mr-2 h-4 w-4", field.value === party.id ? "opacity-100" : "opacity-0")} />
                                                {party.name}
                                            </CommandItem>
                                            ))}
                                        </CommandGroup>
                                        </CommandList>
                                    </Command>
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                        </div>
                        <div className="space-y-4">
                            <FormField
                            control={form.control}
                            name="invoiceDate"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Invoice Date</FormLabel>
                                <Input type="date" {...field} />
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                        </div>
                        </div>

                        <Separator className="my-6" />

                        <div>
                            <h3 className="text-lg font-medium mb-2">Items</h3>
                            <div className="space-y-2">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-12 gap-2 border rounded-md p-3 items-end">
                                        <div className="col-span-12 md:col-span-5">
                                            <FormField 
                                                control={form.control}
                                                name={`items.${index}.productId`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Product</FormLabel>
                                                        <FormControl>
                                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                <SelectTrigger><SelectValue placeholder="Select an item" /></SelectTrigger>
                                                                <SelectContent>
                                                                    {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        <div className="col-span-6 md:col-span-2"><FormField name={`items.${index}.qty`} render={({field}) => (
                                            <FormItem><FormLabel>Qty</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
                                        )}/></div>
                                        <div className="col-span-6 md:col-span-2"><FormField name={`items.${index}.rate`} render={({field}) => (
                                            <FormItem><FormLabel>Rate</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
                                        )}/></div>
                                        <div className="col-span-6 md:col-span-2"><FormField name={`items.${index}.gstRate`} render={({field}) => (
                                            <FormItem><FormLabel>GST %</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
                                        )}/></div>
                                        <div className="col-span-12 md:col-span-1 flex justify-end">
                                            <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4"/></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: "", qty: 1, rate: 0, gstRate: 18 })} className="mt-4"><PlusCircle className="mr-2 h-4 w-4"/>Add Item</Button>
                        </div>

                        <Separator className="my-6" />

                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <FormField control={form.control} name="note" render={({field}) => (
                                    <FormItem><FormLabel>Note / Terms</FormLabel><FormControl><Textarea {...field}/></FormControl></FormItem>
                                )}/>
                            </div>
                             <div className="space-y-3 p-4 border rounded-md bg-muted/50">
                                <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatIndianCurrency(calculations.subtotal)}</span></div>
                                <div className="flex justify-between items-center"><FormLabel>Discount (%)</FormLabel><FormField control={form.control} name="discount" render={({field}) => (
                                    <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} className="w-24 h-8 text-right"/>
                                )}/></div>
                                <div className="flex justify-between items-center"><FormLabel>Shipping</FormLabel><FormField control={form.control} name="shipping" render={({field}) => (
                                    <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} className="w-24 h-8 text-right"/>
                                )}/></div>
                                <Separator/>
                                <div className="flex justify-between font-semibold"><span>Taxable Amount</span><span className="font-mono">{formatIndianCurrency(calculations.taxableAmount)}</span></div>
                                <div className="flex justify-between"><span>GST</span><span className="font-mono">{formatIndianCurrency(calculations.totalGst)}</span></div>
                                <Separator/>
                                <div className="flex justify-between font-bold text-lg"><span>Grand Total</span><span className="font-mono">{formatIndianCurrency(calculations.grandTotal)}</span></div>
                            </div>
                        </div>

                         {postError && <div className="text-sm text-destructive font-medium p-4 bg-destructive/10 rounded-md">{postError}</div>}
                        
                         <div className="flex gap-2 pt-6">
                            <Button type="button" variant="secondary" onClick={saveDraft} disabled={busy || !form.formState.isValid}>
                                {invoiceId ? "Update Draft" : "Save Draft"}
                            </Button>
                            <Button type="button" onClick={postNow} disabled={busy || !invoiceId || status === 'POSTED'}>
                                {status === "POSTING" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Posting...</> : "Post Invoice"}
                            </Button>
                            {status === "FAILED" && invoiceId && (
                                <Button type="button" variant="destructive" onClick={postNow} disabled={busy}>Retry Post</Button>
                            )}
                        </div>

                    </form>
                </Form>
            </CardContent>
        </Card>
        </div>
    );
}
