

'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  CircleDollarSign,
  ShoppingCart,
  Hourglass,
  Megaphone,
  RotateCcw,
  Maximize,
  ThumbsUp,
  ThumbsDown,
  Ban,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where, doc, updateDoc, orderBy, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { PurchaseRequest, ReimbursementRequest, PostRequest, Order, CoaLedger, OrderStatus, SalesOrder, RefundRequest, SalaryAdvanceRequest } from '@/lib/types';


type PurchaseRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Ordered';

type ReimbursementStatus = 'Pending Approval' | 'Approved' | 'Rejected' | 'Paid';

type PostStatus = 'Pending' | 'Approved' | 'Rejected';


function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'Pending':
    case 'Pending Approval':
    case 'Cancellation Requested':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'Approved':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'Rejected':
    case 'Canceled':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'Ordered':
    case 'Paid':
    case 'Completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

function MediaViewerDialog({ mediaUrl, mediaType, alt, open, onOpenChange }: { mediaUrl: string; mediaType: 'image' | 'video'; alt: string; open: boolean; onOpenChange: (open: boolean) => void; }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Media Viewer</DialogTitle>
          <DialogDescription>Displays the selected image or video in a larger view.</DialogDescription>
        </DialogHeader>
        {mediaType === 'image' ? (
          <Image src={mediaUrl} alt={alt} width={1200} height={900} className="rounded-lg object-contain" />
        ) : (
          <video src={mediaUrl} className="w-full rounded-lg" controls autoPlay />
        )}
      </DialogContent>
    </Dialog>
  );
}


export default function ApprovalsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { data: purchaseRequests } = useCollection<PurchaseRequest>(collection(firestore, 'purchaseRequests'));
  const { data: reimbursementRequests } = useCollection<ReimbursementRequest>(collection(firestore, 'reimbursementRequests'));
  const { data: salaryAdvanceRequests } = useCollection<SalaryAdvanceRequest>(collection(firestore, 'salaryAdvanceRequests'));
  
  const postsQuery = query(collection(firestore, 'posts'), orderBy('submittedAt', 'desc'));
  const { data: postRequests } = useCollection<PostRequest>(postsQuery);

  const cancellationRequestsQuery = query(collection(firestore, 'orders'), where('status', '==', 'Cancellation Requested'));
  const { data: cancellationRequests } = useCollection<Order>(cancellationRequestsQuery);

  const [selectedMedia, setSelectedMedia] = React.useState<{ url: string; type: 'image' | 'video'; alt: string} | null>(null);

  const pendingPurchaseCount = purchaseRequests?.filter(r => r.status === 'Pending').length || 0;
  const pendingReimbursementCount = reimbursementRequests?.filter(r => r.status === 'Pending Approval').length || 0;
  const pendingSalaryAdvanceCount = salaryAdvanceRequests?.filter(r => r.status === 'Pending Approval').length || 0;
  const pendingPostCount = postRequests?.filter(p => p.status === 'Pending').length || 0;
  const pendingCancellationCount = cancellationRequests?.length || 0;

  const kpis = React.useMemo(() => {
    const pendingPurchaseValue = (purchaseRequests || [])
      .filter(r => r.status === 'Pending')
      .reduce((sum, r) => sum + (r.quantity || 0) * (r.rate || 0), 0);

    const pendingReimbursementValue = (reimbursementRequests || [])
      .filter(r => r.status === 'Pending Approval')
      .reduce((sum, r) => sum + r.requestAmount, 0);
    
    return {
      totalPending: pendingPurchaseCount + pendingReimbursementCount + pendingPostCount + pendingCancellationCount + pendingSalaryAdvanceCount,
      pendingPurchaseValue,
      pendingReimbursementValue,
    };
  }, [purchaseRequests, reimbursementRequests, salaryAdvanceRequests, postRequests, cancellationRequests, pendingPurchaseCount, pendingReimbursementCount, pendingSalaryAdvanceCount, pendingPostCount, pendingCancellationCount]);


  const handlePurchaseUpdate = async (requestId: string, status: PurchaseRequestStatus) => {
    const requestRef = doc(firestore, 'purchaseRequests', requestId);
    await updateDoc(requestRef, { status });
    toast({ title: 'Purchase Request Updated', description: `Request ${requestId} marked as ${status}.` });
  };
  
  const handleReimbursementUpdate = async (requestId: string, status: ReimbursementStatus) => {
    const requestRef = doc(firestore, 'reimbursementRequests', requestId);
    await updateDoc(requestRef, { status });
    toast({ title: 'Reimbursement Updated', description: `Request ${requestId} marked as ${status}.` });
  };

  const handleSalaryAdvanceUpdate = async (requestId: string, status: 'Approved' | 'Rejected') => {
    const requestRef = doc(firestore, 'salaryAdvanceRequests', requestId);
    await updateDoc(requestRef, { status });
    toast({ title: 'Salary Advance Updated', description: `Request has been ${status}.` });
  };
  
  const handlePostUpdate = async (postId: string, status: PostStatus) => {
    const postRef = doc(firestore, 'posts', postId);
    try {
      await updateDoc(postRef, { status });
      toast({ title: 'Post Updated', description: `The post has been ${status}.` });
    } catch (error) {
      console.error('Error updating post status:', error);
      toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not update post status.' });
    }
  };

  const handleCancellationApproval = async (order: Order, approve: boolean) => {
    const orderRef = doc(firestore, 'orders', order.id);
    
    const batch = writeBatch(firestore);

    if (approve) {
        batch.update(orderRef, { status: 'Canceled' });
        
        if (order.paymentReceived && order.paymentReceived > 0) {
            const refundRequestRef = doc(collection(firestore, 'refundRequests'));
            const orderDisplayId = (order as SalesOrder).orderNumber || order.id;
            const refundRequestData: Omit<RefundRequest, 'id'> = {
                orderId: order.id,
                orderNumber: orderDisplayId,
                customerId: order.userId,
                customerName: order.customerName,
                refundAmount: order.paymentReceived,
                requestDate: new Date().toISOString(),
                status: 'Pending',
            };
            batch.set(refundRequestRef, refundRequestData);
            toast({ title: 'Cancellation Approved & Refund Queued', description: `Order ${orderDisplayId} canceled. A refund request has been sent to accounts.` });
        } else {
            toast({ title: 'Cancellation Approved', description: `Order ${(order as SalesOrder).orderNumber || order.id} has been canceled.` });
        }

    } else {
        // Reverting to 'Ordered' as a safe default. A more complex system might store the 'previousStatus'.
        batch.update(orderRef, { status: 'Ordered' });
        toast({ title: 'Cancellation Rejected', description: `Order ${(order as SalesOrder).orderNumber || order.id} has been restored to 'Ordered' status.` });
    }

    try {
        await batch.commit();
    } catch(e) {
        console.error(e);
        toast({variant: 'destructive', title: 'Error', description: 'Could not update order status.'});
    }
  };

  return (
    <>
      <PageHeader title="Approvals" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pending</CardTitle>
            <Hourglass className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalPending}</div>
            <p className="text-xs text-muted-foreground">Items awaiting your approval</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Posts</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingPostCount}</div>
            <p className="text-xs text-muted-foreground">Community posts to review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Purchase Value</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.pendingPurchaseValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Value of {pendingPurchaseCount} purchase requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reimbursement Value</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{kpis.pendingReimbursementValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Value of {pendingReimbursementCount} expense requests</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="posts">
        <TabsList className="grid w-full grid-cols-5">
           <TabsTrigger value="posts">
            Posts
            {pendingPostCount > 0 && <Badge className="ml-2">{pendingPostCount}</Badge>}
          </TabsTrigger>
           <TabsTrigger value="order-cancellations">
            Order Cancellations
            {pendingCancellationCount > 0 && <Badge className="ml-2">{pendingCancellationCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="purchase-requests">
            Purchase Requests
            {pendingPurchaseCount > 0 && <Badge className="ml-2">{pendingPurchaseCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="reimbursements">
            Reimbursements
            {pendingReimbursementCount > 0 && <Badge className="ml-2">{pendingReimbursementCount}</Badge>}
          </TabsTrigger>
           <TabsTrigger value="salary-advances">
            Salary Advances
            {pendingSalaryAdvanceCount > 0 && <Badge className="ml-2">{pendingSalaryAdvanceCount}</Badge>}
          </TabsTrigger>
        </TabsList>
         <TabsContent value="posts">
          <Card>
            <CardHeader>
              <CardTitle>Community Post Approvals</CardTitle>
              <CardDescription>Review and approve user-submitted posts for the public feed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Author</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Media</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Likes</TableHead>
                    <TableHead className="text-center">Dislikes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {postRequests?.map(req => (
                    <TableRow key={req.id}>
                       <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={req.authorAvatar} />
                              <AvatarFallback>{req.authorName.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{req.authorName}</span>
                          </div>
                        </TableCell>
                      <TableCell className="max-w-sm">
                        <p className="whitespace-pre-wrap">{req.content}</p>
                      </TableCell>
                      <TableCell>
                        {req.mediaUrl && req.mediaType && (
                           <div 
                              className="relative h-16 w-16 cursor-pointer rounded-md border overflow-hidden group"
                              onClick={() => setSelectedMedia({ url: req.mediaUrl!, type: req.mediaType!, alt: `Media for post by ${req.authorName}`})}
                           >
                              <Image src={req.mediaUrl} alt="Post media" layout="fill" className="object-cover" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize className="h-6 w-6 text-white" />
                              </div>
                           </div>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>{req.status}</Badge></TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <ThumbsUp className="h-4 w-4 text-green-500" />
                          {req.status === 'Approved' ? req.likes : 'N/A'}
                        </div>
                      </TableCell>
                       <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <ThumbsDown className="h-4 w-4 text-red-500" />
                          {req.status === 'Approved' ? req.dislikes : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            {req.status !== 'Approved' && (
                                <DropdownMenuItem onClick={() => handlePostUpdate(req.id, 'Approved')}>
                                <CheckCircle className="mr-2 h-4 w-4" /> Approve
                                </DropdownMenuItem>
                            )}
                            {req.status !== 'Rejected' && (
                                <DropdownMenuItem onClick={() => handlePostUpdate(req.id, 'Rejected')} className="text-red-500">
                                <XCircle className="mr-2 h-4 w-4" /> Reject
                                </DropdownMenuItem>
                            )}
                            {req.status === 'Approved' && (
                                <DropdownMenuItem onClick={() => handlePostUpdate(req.id, 'Pending')} className="text-yellow-600">
                                <RotateCcw className="mr-2 h-4 w-4" /> Revoke Approval
                                </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
         <TabsContent value="order-cancellations">
          <Card>
            <CardHeader>
              <CardTitle>Order Cancellation Requests</CardTitle>
              <CardDescription>Approve or reject customer requests to cancel orders.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancellationRequests?.map(order => (
                    <TableRow key={order.id}>
                        <TableCell className="font-mono">{(order as SalesOrder).orderNumber || order.id}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{format(new Date(order.date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{(order as any).cancellationReason || 'No reason provided'}</TableCell>
                        <TableCell className="text-right space-x-2">
                           <Button variant="outline" size="sm" onClick={() => handleCancellationApproval(order, false)}>
                                <XCircle className="mr-2 h-4 w-4" /> Reject
                            </Button>
                             <Button variant="destructive" size="sm" onClick={() => handleCancellationApproval(order, true)}>
                                <CheckCircle className="mr-2 h-4 w-4" /> Approve Cancellation
                            </Button>
                        </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="purchase-requests">
          <Card>
            <CardHeader>
              <CardTitle>Pending Purchase Requests</CardTitle>
              <CardDescription>Review and approve internal requests for procurement.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request ID</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseRequests?.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono">{req.id}</TableCell>
                      <TableCell>{req.productName}</TableCell>
                      <TableCell>{req.quantity}</TableCell>
                      <TableCell>{req.requestedBy}</TableCell>
                      <TableCell>{req.supplierName || 'N/A'}</TableCell>
                      <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>{req.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" disabled={req.status !== 'Pending'}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handlePurchaseUpdate(req.id, 'Approved')}>
                              <CheckCircle className="mr-2 h-4 w-4" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePurchaseUpdate(req.id, 'Rejected')} className="text-red-500">
                              <XCircle className="mr-2 h-4 w-4" /> Reject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reimbursements">
          <Card>
            <CardHeader>
              <CardTitle>Pending Reimbursement Requests</CardTitle>
              <CardDescription>Review and approve employee expense reimbursements.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request ID</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reimbursementRequests?.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono">{req.id}</TableCell>
                      <TableCell>{req.requestedBy}</TableCell>
                      <TableCell>{format(new Date(req.date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{req.description}</TableCell>
                      <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>{req.status}</Badge></TableCell>
                      <TableCell className="text-right font-mono">₹{req.requestAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                         <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" disabled={req.status !== 'Pending Approval'}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleReimbursementUpdate(req.id, 'Approved')}>
                              <CheckCircle className="mr-2 h-4 w-4" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleReimbursementUpdate(req.id, 'Rejected')} className="text-red-500">
                              <XCircle className="mr-2 h-4 w-4" /> Reject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="salary-advances">
            <Card>
                <CardHeader>
                    <CardTitle>Salary Advance Requests</CardTitle>
                    <CardDescription>Approve or reject salary advance requests from employees.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee Name</TableHead>
                                <TableHead>Request Date</TableHead>
                                <TableHead>Remarks</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {salaryAdvanceRequests?.map(req => (
                                <TableRow key={req.id}>
                                    <TableCell>{req.employeeName}</TableCell>
                                    <TableCell>{format(new Date(req.requestDate), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>{req.remarks}</TableCell>
                                    <TableCell><Badge variant="outline" className={cn(getStatusBadgeVariant(req.status))}>{req.status}</Badge></TableCell>
                                    <TableCell className="text-right font-mono">₹{req.amount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">
                                         <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="icon" variant="ghost" disabled={req.status !== 'Pending Approval'}><MoreHorizontal className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => handleSalaryAdvanceUpdate(req.id, 'Approved')}>
                                                <CheckCircle className="mr-2 h-4 w-4" /> Approve
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleSalaryAdvanceUpdate(req.id, 'Rejected')} className="text-red-500">
                                                <XCircle className="mr-2 h-4 w-4" /> Reject
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>

      {selectedMedia && (
        <MediaViewerDialog
          mediaUrl={selectedMedia.url}
          mediaType={selectedMedia.type}
          alt={selectedMedia.alt}
          open={!!selectedMedia}
          onOpenChange={() => setSelectedMedia(null)}
        />
      )}
    </>
  );
}
