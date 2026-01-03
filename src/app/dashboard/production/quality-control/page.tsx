

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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Check, ShieldCheck, X, Hourglass, CheckCircle, XCircle, RefreshCw, Printer, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection } from '@/firebase';
import { collection, doc, updateDoc, writeBatch, increment } from 'firebase/firestore';
import type { WorkOrder, QcCheckPoint, Task, Product } from '@/lib/types';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

type QcStatus = 'Pass' | 'Fail';
type CompletedWorkOrder = WorkOrder & { qcStatus?: 'Pending' | 'Passed' | 'Failed' };

function PrintQrDialog({ workOrder, open, onOpenChange, product }: { workOrder: CompletedWorkOrder | null; open: boolean; onOpenChange: (open: boolean) => void; product: Product | undefined; }) {
  const printRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (printContent) {
      const printWindow = window.open('', '', 'width=800,height=600');
      printWindow?.document.write(`
        <html>
          <head>
            <title>Print QR Labels</title>
            <style>
              @media print {
                @page { 
                  size: 50mm 75mm; 
                  margin: 0; 
                }
                body { 
                  margin: 0; 
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .label-container {
                  page-break-after: always;
                }
              }
              body {
                font-family: sans-serif;
              }
              .label-container {
                width: 50mm;
                height: 75mm;
                padding: 2mm;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
              }
              .product-name { 
                font-size: 12px;
                font-weight: bold; 
                margin: 0;
                line-height: 1.2;
              }
               .product-details {
                font-size: 12px;
                font-weight: bold;
                margin: 0.5mm 0 0 0;
              }
              .qr-container {
                margin: 1mm 0;
              }
              .scan-text {
                font-size: 11px;
                margin-top: 1mm;
                font-weight: 500;
              }
              .serial-no { 
                font-size: 14px;
                margin: 1mm 0 0 0;
                font-family: 'Courier New', Courier, monospace;
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            ${printContent.innerHTML}
          </body>
        </html>
      `);
      printWindow?.document.close();
      printWindow?.focus();
      printWindow?.print();
      printWindow?.close();
    }
  };

  if (!workOrder) return null;

  const labelsToPrint = Array.from({ length: workOrder.quantity || 1 }, (_, i) => ({
    productName: workOrder.productName,
    serialNumber: `${workOrder.id}-${String(i + 1).padStart(3, '0')}`,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print QR Labels</DialogTitle>
          <DialogDescription>
            {workOrder.quantity} unique labels will be printed for {workOrder.productName}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 flex justify-center">
          <div className="hidden">
            <div ref={printRef}>
              {labelsToPrint.map((label, index) => (
                <div key={index} className="label-container">
                    <p className="product-name">{label.productName}</p>
                    {product && (product.version || product.modelNumber) && (
                      <p className="product-details" style={{fontSize: '12px', fontWeight: 'bold', margin: '0.5mm 0 0 0'}}>
                        {product.version && `V: ${product.version}`}{product.version && product.modelNumber && ' | '}{product.modelNumber && `M: ${product.modelNumber}`}
                      </p>
                    )}
                    <div className="qr-container">
                        <QRCodeSVG value={label.serialNumber} size={150} includeMargin={false} />
                    </div>
                    <p className="scan-text">Scan QR for register warranty</p>
                    <p className="serial-no">{label.serialNumber}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-2 border rounded-md" style={{width: '50mm', height: '75mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
              <p className="product-name" style={{fontSize: '12px', fontWeight: 'bold', margin: '0 0 1mm 0', lineHeight: '1.2'}}>{labelsToPrint[0].productName}</p>
               {product && (product.version || product.modelNumber) && (
                <p className="product-details" style={{fontSize: '12px', fontWeight: 'bold', margin: '0.5mm 0 0 0'}}>
                  {product.version && `V: ${product.version}`}{product.version && product.modelNumber && ' | '}{product.modelNumber && `M: ${product.modelNumber}`}
                </p>
              )}
              <div className="qr-container" style={{margin: '2mm 0'}}>
                  <QRCodeSVG value={labelsToPrint[0].serialNumber} size={130} includeMargin={false} />
              </div>
              <p className="scan-text" style={{fontSize: '11px', marginTop: '2mm', fontWeight: 500}}>Scan QR for register warranty</p>
              <p className="serial-no" style={{fontSize: '14px', margin: '1mm 0 0 0', fontFamily: "'Courier New', Courier, monospace", fontWeight: 'bold'}}>{labelsToPrint[0].serialNumber}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print {workOrder.quantity} Label(s)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function getQcStatusBadge(status: CompletedWorkOrder['qcStatus']) {
    switch (status) {
      case 'Pending':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'Passed':
        return <Badge variant="outline" className="bg-green-100 text-green-800">Passed</Badge>;
      case 'Failed':
        return <Badge variant="outline" className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return null;
    }
}

function QualityControlPage() {
  const { toast } = useToast();
  const router = useRouter();
  const firestore = useFirestore();
  const { data: workOrders, loading } = useCollection<WorkOrder>(collection(firestore, 'workOrders'));
  const { data: allProducts } = useCollection<Product>(collection(firestore, 'products'));

  const [qcTasks, setQcTasks] = React.useState<CompletedWorkOrder[]>([]);
  const [inspectingTask, setInspectingTask] = React.useState<CompletedWorkOrder | null>(null);
  const [checklist, setChecklist] = React.useState<({ qcStatus?: QcStatus; remarks?: string } & QcCheckPoint)[]>([]);
  const [workOrderToPrint, setWorkOrderToPrint] = React.useState<CompletedWorkOrder | null>(null);

  React.useEffect(() => {
    if (workOrders) {
      // Initialize QC status for tasks that are "Under QC" but don't have a qcStatus yet
      setQcTasks(workOrders.filter(wo => wo.status === 'Under QC' || wo.status === 'Completed').map(wo => ({...wo, qcStatus: wo.qcStatus || 'Pending' })));
    }
  }, [workOrders]);

  const bomForInspectingTask = React.useMemo(() => {
    // This is a placeholder. In a real app, you'd fetch the specific BOM.
    if (!inspectingTask) return null;
    return { qcCheckPoints: [{ id: 'qc1', checkPoint: 'Visual Inspection', method: 'Manual', details: 'Check for scratches and dents.'}]};
  }, [inspectingTask]);

  React.useEffect(() => {
    if (inspectingTask && bomForInspectingTask) {
        setChecklist(inspectingTask.qcChecklist || bomForInspectingTask.qcCheckPoints || []);
    }
  }, [inspectingTask, bomForInspectingTask]);

  const handleStartInspection = (task: CompletedWorkOrder) => {
    setInspectingTask(task);
  };
  
  const handleChecklistChange = (index: number, field: 'qcStatus' | 'remarks', value: string) => {
    const newChecklist = [...checklist];
    newChecklist[index] = { ...newChecklist[index], [field]: value };
    setChecklist(newChecklist);
  };

  const handleSubmitQc = async () => {
    if (!inspectingTask) return;

    const isAllChecked = checklist.every(item => item.qcStatus);
    if (!isAllChecked) {
      toast({
        variant: 'destructive',
        title: 'Checklist Incomplete',
        description: 'Please mark all check points as either Pass or Fail.',
      });
      return;
    }
    
    const finalStatus = checklist.some(item => item.qcStatus === 'Fail') ? 'Failed' : 'Passed';
    const workOrderRef = doc(firestore, 'workOrders', inspectingTask.id);

    try {
        const batch = writeBatch(firestore);

        if (finalStatus === 'Passed') {
            batch.update(workOrderRef, { status: 'Completed', qcStatus: 'Passed', qcChecklist: checklist });

            const productRef = doc(firestore, 'products', inspectingTask.productId);
            batch.update(productRef, { openingStock: increment(inspectingTask.quantity) });

            toast({
                title: 'QC Passed & Stock Updated!',
                description: `Inventory for ${inspectingTask.productName} has been increased by ${inspectingTask.quantity}.`,
            });
            setWorkOrderToPrint(inspectingTask); // Trigger QR Print Dialog
        } else {
            batch.update(workOrderRef, { status: 'In Progress', qcStatus: 'Failed', qcChecklist: checklist }); // Revert status for rework
             toast({
                title: 'QC Failed',
                description: `Work order ${inspectingTask.id} has been marked for rework.`,
            });
        }
        
        await batch.commit();

        setQcTasks(prev => 
          prev.map(task => 
            task.id === inspectingTask.id ? { ...task, qcStatus: finalStatus, status: finalStatus === 'Passed' ? 'Completed' : 'In Progress' } : task
          )
        );

    } catch (error) {
        console.error("Error submitting QC:", error);
        toast({ variant: 'destructive', title: 'Submission Failed' });
    }

    setInspectingTask(null);
  };

  const kpis = React.useMemo(() => {
    const pending = qcTasks.filter(t => t.qcStatus === 'Pending').length;
    const passed = qcTasks.filter(t => t.qcStatus === 'Passed').length;
    const failed = qcTasks.filter(t => t.qcStatus === 'Failed').length;
    return { pending, passed, failed, total: qcTasks.length };
  }, [qcTasks]);
  
  const handleCreateReworkOrder = (task: CompletedWorkOrder) => {
    toast({
      title: 'Redirecting to Create Rework Order',
      description: `Creating a new work order for the failed items of ${task.productName}.`,
    });
    router.push(`/dashboard/production/create-work-order?productId=${task.productId}&rework=true&quantity=${task.quantity}`);
  };

  return (
    <>
      <PageHeader title="Quality Control" />

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending QC</CardTitle>
                <Hourglass className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.pending}</div>
                <p className="text-xs text-muted-foreground">Tasks awaiting inspection</p>
            </CardContent>
            </Card>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">QC Passed</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.passed}</div>
                <p className="text-xs text-muted-foreground">Items that passed inspection</p>
            </CardContent>
            </Card>
             <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">QC Failed</CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.failed}</div>
                <p className="text-xs text-muted-foreground">Items that failed inspection</p>
            </CardContent>
            </Card>
            <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Inspected</CardTitle>
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.passed + kpis.failed}</div>
                <p className="text-xs text-muted-foreground">Out of {kpis.total} submitted tasks</p>
            </CardContent>
            </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submitted for Quality Control</CardTitle>
          <CardDescription>
            List of production tasks that are complete and awaiting QC.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work Order ID</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead>QC Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {qcTasks.length > 0 ? (
                qcTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-mono">{task.id}</TableCell>
                    <TableCell>{task.productName}</TableCell>
                    <TableCell>{task.quantity}</TableCell>
                    <TableCell>{format(new Date(task.createdAt), 'dd/MM/yyyy p')}</TableCell>
                    <TableCell>{getQcStatusBadge(task.qcStatus)}</TableCell>
                    <TableCell className="text-right space-x-2">
                       <Button variant="outline" size="sm" onClick={() => handleStartInspection(task)}>
                        {task.qcStatus === 'Pending' ? 'Start QC' : 'View QC'}
                      </Button>
                      {task.qcStatus === 'Failed' && (
                        <Button variant="destructive" size="sm" onClick={() => handleCreateReworkOrder(task)}>
                            <RefreshCw className="h-3 w-3 mr-1.5" />
                            Create Rework Order
                        </Button>
                      )}
                      {task.qcStatus === 'Passed' && (
                        <Button variant="secondary" size="sm" onClick={() => setWorkOrderToPrint(task)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No tasks submitted for QC.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!inspectingTask} onOpenChange={(open) => !open && setInspectingTask(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>QC for Work Order: {inspectingTask?.id}</DialogTitle>
            <DialogDescription>
              Inspect <strong>{inspectingTask?.productName}</strong> (Qty: {inspectingTask?.quantity})
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] -mx-6 px-6">
            <div className="py-4 px-2 space-y-4">
              <h3 className="font-semibold">QC Checklist</h3>
              {checklist.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[35%]">Check Point</TableHead>
                            <TableHead className="w-[20%]">Method</TableHead>
                            <TableHead className="w-[20%]">Status</TableHead>
                            <TableHead className="w-[25%]">Remarks</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {checklist.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <p className="font-medium">{item.checkPoint}</p>
                                    <p className="text-xs text-muted-foreground">{item.details}</p>
                                </TableCell>
                                <TableCell>{item.method}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button 
                                            size="icon" 
                                            variant={item.qcStatus === 'Pass' ? 'default' : 'outline'}
                                            onClick={() => handleChecklistChange(index, 'qcStatus', 'Pass')}
                                            disabled={inspectingTask?.qcStatus !== 'Pending'}
                                            className={cn('h-8 w-8', item.qcStatus === 'Pass' && 'bg-green-600 hover:bg-green-700')}
                                        >
                                            <Check className="h-4 w-4" />
                                        </Button>
                                         <Button 
                                            size="icon" 
                                            variant={item.qcStatus === 'Fail' ? 'destructive' : 'outline'}
                                            onClick={() => handleChecklistChange(index, 'qcStatus', 'Fail')}
                                            disabled={inspectingTask?.qcStatus !== 'Pending'}
                                            className="h-8 w-8"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell>
                                     <Textarea 
                                        placeholder="Add remarks..."
                                        value={item.remarks}
                                        onChange={(e) => handleChecklistChange(index, 'remarks', e.target.value)}
                                        rows={1}
                                        disabled={inspectingTask?.qcStatus !== 'Pending'}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No QC checklist defined for this product in the BOM.</p>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectingTask(null)}>Close</Button>
            {inspectingTask?.qcStatus === 'Pending' && (
              <Button onClick={handleSubmitQc}>Submit QC</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PrintQrDialog
        workOrder={workOrderToPrint}
        open={!!workOrderToPrint}
        onOpenChange={() => setWorkOrderToPrint(null)}
        product={allProducts?.find(p => p.id === workOrderToPrint?.productId)}
      />
    </>
  );
}

export default QualityControlPage;
