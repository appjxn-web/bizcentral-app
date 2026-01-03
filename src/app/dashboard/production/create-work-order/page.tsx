

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { products as allProducts } from '@/lib/product-data';
import { boms as allBoms } from '@/lib/bom-data';
import { initialAssignedTasks, users, initialTemplates } from '@/lib/data';
import { Save } from 'lucide-react';
import { notFound } from 'next/navigation';
import type { ProductionAssignment, ProductionTaskTemplate } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

const initialAssignedTasksData: ProductionAssignment[] = [
  {
    id: 'assign-1',
    productId: 'prod_1',
    productName: 'Ergonomic Office Chair',
    templateId: 'template-1',
    templateName: 'Chair Assembly',
    assigneeId: 'usr-3',
    assigneeName: 'Isabella Nguyen',
    standardDuration: 30,
    status: 'In Progress',
  },
    {
    id: 'assign-2',
    productId: 'prod_4',
    productName: '4K Ultra-Wide Monitor',
    templateId: 'template-2',
    templateName: 'Monitor Quality Control',
    assigneeId: 'usr-9',
    assigneeName: 'Sophia Hernandez',
    standardDuration: 25,
    status: 'Pending',
  },
];


export default function CreateWorkOrderPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const rework = searchParams.get('rework');
  const quantity = searchParams.get('quantity');

  const [workOrderQty, setWorkOrderQty] = React.useState(1);
  const [assigneeId, setAssigneeId] = React.useState('');

  const product = React.useMemo(() => {
    return allProducts.find(p => p.id === productId);
  }, [productId]);
  
  const assignmentData = React.useMemo(() => {
    return initialAssignedTasks.find(task => task.productId === productId) || null;
  }, [productId]);

  React.useEffect(() => {
    if (assignmentData) {
      setAssigneeId(assignmentData.assigneeId);
    }
    if (rework && quantity) {
      setWorkOrderQty(Number(quantity));
    }
  }, [assignmentData, rework, quantity]);

  const productionTemplate = React.useMemo(() => {
      if (!assignmentData) return null;
      // This is a mock association. In a real app, you'd link products to templates.
      const foundTemplate = initialTemplates.find(t => t.id === assignmentData.templateId);
      return foundTemplate;
  }, [assignmentData]);
  
  const bom = React.useMemo(() => {
    if (!product) return null;
    return allBoms.find(b => b.productId === product.id);
  }, [product]);


  if (!product) {
    return (
        <PageHeader title="Product not found" />
    )
  }
  
  if (!assignmentData) {
      return (
          <PageHeader title={`No task assignment found for ${product.name}`} />
      )
  }

  const handleCreate = () => {
    toast({
        title: 'Work Order Created',
        description: `A work order for ${workOrderQty} x ${product.name} has been created.`
    })
  }

  const employees = users.filter(u => u.role === 'Employee' || u.role === 'Manager' || u.role === 'Production Manager');

  return (
    <>
      <PageHeader title={rework ? "Create Rework Order" : "Create Work Order"}>
        <Button onClick={handleCreate}>
          <Save className="mr-2 h-4 w-4" /> Save Work Order
        </Button>
      </PageHeader>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
             <Card>
                <CardHeader>
                    <CardTitle>Production Tasks & Assignments</CardTitle>
                    <CardDescription>Tasks required for this work order.</CardDescription>
                </CardHeader>
                <CardContent>
                     {productionTemplate ? (
                        <div className="space-y-4">
                            <div className="p-4 border rounded-md grid grid-cols-3 gap-4 items-end">
                                <div>
                                    <Label>Product Name</Label>
                                    <p className="font-semibold">{assignmentData.productName}</p>
                                </div>
                                <div>
                                    <Label htmlFor="wo-qty">Qty to be manufactured</Label>
                                    <Input id="wo-qty" type="number" value={workOrderQty} onChange={(e) => setWorkOrderQty(Number(e.target.value))} />
                                </div>
                                <p><strong>Total Standard Duration:</strong> {assignmentData.standardDuration * workOrderQty} minutes</p>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Task Template Name</TableHead>
                                        <TableHead>Assign To</TableHead>
                                        <TableHead>Standard Duration (Minutes)</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Unit #</TableHead>
                                        <TableHead>Work Station</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>{assignmentData.templateName}</TableCell>
                                        <TableCell>
                                             <Select value={assigneeId} onValueChange={setAssigneeId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select an employee" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {employees.map(user => (
                                                        <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>{assignmentData.standardDuration * workOrderQty}</TableCell>
                                        <TableCell>{productionTemplate.department}</TableCell>
                                        <TableCell>{productionTemplate.unit}</TableCell>
                                        <TableCell>{productionTemplate.workstation}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No production template found for this product.</p>
                    )}
                </CardContent>
            </Card>
         </div>
          <div className="lg:col-span-3">
             <Card>
                <CardHeader>
                    <CardTitle>Linked Bill of Material (BOM)</CardTitle>
                    <CardDescription>
                        Components and raw materials required for this work order.
                    </CardDescription>
                </CardHeader>
                 <CardContent>
                    {bom ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Component Name</TableHead>
                                    <TableHead>Part Number</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead className="text-right">Required Qty. per unit</TableHead>
                                    <TableHead className="text-right">Total Req. Qty.</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bom.items.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.productName}</TableCell>
                                        <TableCell>{item.partNumber || 'N/A'}</TableCell>
                                        <TableCell>{item.unit}</TableCell>
                                        <TableCell className="text-right font-mono">{item.quantity.toFixed(2)}</TableCell>
                                        <TableCell className="text-right font-mono font-bold">{(item.quantity * workOrderQty).toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-sm text-muted-foreground">No Bill of Material found for this product.</p>
                    )}
                </CardContent>
            </Card>
          </div>
      </div>
    </>
  );
}

    