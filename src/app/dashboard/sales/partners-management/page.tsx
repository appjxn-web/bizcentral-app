
      
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreHorizontal, Users, UserCheck } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCollection, useFirestore } from '@/firebase';
import { collection, doc, updateDoc } from 'firebase/firestore';
import type { UserProfile, CommissionRule } from '@/lib/types';
import { MatrixDialog } from './_components/matrix-dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function PartnersManagementPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: users, loading } = useCollection<UserProfile>(collection(firestore, 'users'));
  const router = useRouter();
  
  const [isMatrixDialogOpen, setIsMatrixDialogOpen] = React.useState(false);
  const [selectedPartner, setSelectedPartner] = React.useState<UserProfile | null>(null);

  const partners = React.useMemo(() => {
    if (!users) return [];
    return users.filter(user => user.role === 'Partner');
  }, [users]);

  const kpis = React.useMemo(() => {
    if (!partners) return { total: 0, active: 0 };
    const total = partners.length;
    const active = partners.filter(p => p.status === 'Active').length;
    return { total, active };
  }, [partners]);

  const handleOpenMatrix = (partner: UserProfile) => {
    setSelectedPartner(partner);
    setIsMatrixDialogOpen(true);
  };

  const handleSaveMatrix = async (partnerId: string, matrix: CommissionRule[]) => {
    const partnerRef = doc(firestore, 'users', partnerId);
    try {
      await updateDoc(partnerRef, { partnerMatrix: matrix });
      toast({
        title: 'Matrix Updated',
        description: `Commission and discount matrix for ${selectedPartner?.name} has been saved.`,
      });
      setIsMatrixDialogOpen(false);
    } catch (error) {
      console.error("Failed to save matrix:", error);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'Could not update the partner matrix.',
      });
    }
  };

  return (
    <>
      <PageHeader title="Partners Management" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Partners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">All registered partners</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Partners</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.active}</div>
            <p className="text-xs text-muted-foreground">Partners with active status</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Partners</CardTitle>
          <CardDescription>Manage commission and discount rates for each partner.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading partners...</TableCell></TableRow>
              ) : partners.map(partner => (
                <TableRow key={partner.id}>
                  <TableCell>
                    <Link href={`/dashboard/sales/commission-report?userId=${partner.id}`} className="flex items-center gap-4 hover:underline">
                      <Avatar>
                        <AvatarImage src={partner.avatar} />
                        <AvatarFallback>{partner.name?.charAt(0) || 'P'}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{partner.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{partner.email}</TableCell>
                  <TableCell>{partner.status}</TableCell>
                  <TableCell className="text-right">
                     <Button variant="outline" size="sm" onClick={() => handleOpenMatrix(partner)}>
                        Manage Matrix
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {selectedPartner && (
        <MatrixDialog
          open={isMatrixDialogOpen}
          onOpenChange={setIsMatrixDialogOpen}
          partner={selectedPartner}
          onSave={handleSaveMatrix}
        />
      )}
    </>
  );
}
      
    