

'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { User, UserRole, Attendance, PunchLog } from '@/lib/types';
import { User as UserIcon, UserCheck, UserX, MapPin, AlertCircle, CheckCircle, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EditAttendanceDialog } from './_components/edit-attendance-dialog';
import { Input } from '@/components/ui/input';

const salariedRoles: UserRole[] = [
  'Admin', 'Manager', 'Employee', 'CEO', 'Sales Manager', 'Production Manager', 
  'Purchase Manager', 'Service Manager', 'Accounts Manager', 'HR Manager'
];

const formatDuration = (totalSeconds: number) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

function AttendanceRow({ user, selectedDate }: { user: User, selectedDate: string }) {
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const attendanceDocRef = React.useMemo(() => {
    return doc(firestore, 'users', user.id, 'attendance', selectedDate);
  }, [firestore, user.id, selectedDate]);
  
  const { data: attendance, loading } = useDoc<Attendance>(attendanceDocRef);

  const { isPresent, totalHours, totalEarnings, punches, needsApproval, punchForApprovalIndex } = React.useMemo(() => {
    if (!attendance?.punches || attendance.punches.length === 0) {
      return { isPresent: false, totalHours: '00:00:00', totalEarnings: 0, punches: [], needsApproval: false, punchForApprovalIndex: -1 };
    }

    const punchesAsDates = attendance.punches.map(p => ({
        ...p,
        inTime: (p.inTime as any).toDate ? (p.inTime as any).toDate() : new Date(p.inTime),
        outTime: p.outTime ? ((p.outTime as any).toDate ? (p.outTime as any).toDate() : new Date(p.outTime)) : null
    }));

    const totalSeconds = attendance.totalHours ? attendance.totalHours * 3600 : 0;
    
    const needsApproval = punchesAsDates.some(p => p.type === 'Field' && !p.isApproved);
    const punchForApprovalIndex = punchesAsDates.findIndex(p => p.type === 'Field' && !p.isApproved);


    return {
        isPresent: true,
        totalHours: formatDuration(totalSeconds),
        totalEarnings: attendance.totalEarning || 0,
        punches: punchesAsDates,
        needsApproval,
        punchForApprovalIndex
    };
  }, [attendance]);
  
  const handleApprove = async () => {
    if (!attendance || punchForApprovalIndex === -1) return;

    const newPunches = [...attendance.punches];
    const punchToApprove = newPunches[punchForApprovalIndex];
    
    if (punchToApprove) {
      newPunches[punchForApprovalIndex] = { ...punchToApprove, isApproved: true };
      await updateDoc(attendanceDocRef, { punches: newPunches });
      toast({ title: "Attendance Approved", description: `Field punch-in for ${user.name} has been approved.` });
    }
  };
  
  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={(user as any).avatar} />
              <AvatarFallback>{user.name?.charAt(0) || user.email?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{user.name}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col text-xs text-muted-foreground">
             {punches.length > 0 ? (
                punches.map((p, i) => (
                    <div key={i} className="flex items-center gap-1">
                        {p.type === 'Field' && <MapPin className="h-3 w-3 text-blue-500" />}
                        <span>{format(p.inTime, 'HH:mm')} - {p.outTime ? format(p.outTime, 'HH:mm') : '...'}</span>
                    </div>
                ))
             ) : 'Absent'}
          </div>
        </TableCell>
        <TableCell className="font-mono">{totalHours}</TableCell>
        <TableCell className="text-right font-mono">₹{(totalEarnings).toFixed(2)}</TableCell>
        <TableCell className="text-center">
            {isPresent ? (
                needsApproval ? (
                    <Button size="sm" variant="outline" onClick={handleApprove}>Approve</Button>
                ) : (
                    <UserCheck className="h-5 w-5 text-green-500 mx-auto" />
                )
            ) : <UserX className="h-5 w-5 text-red-500 mx-auto" />}
        </TableCell>
        <TableCell className="text-right space-x-2">
            <Button size="sm" variant="ghost" onClick={() => setIsEditDialogOpen(true)}>
                <Edit className="h-4 w-4" />
            </Button>
        </TableCell>
      </TableRow>
      <EditAttendanceDialog 
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        user={user}
        attendance={attendance}
        selectedDate={selectedDate}
      />
    </>
  );
}


export default function AttendancePage() {
    const firestore = useFirestore();
    const { data: allUsers, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
    const [selectedDate, setSelectedDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
    
    const salariedUsers = React.useMemo(() => {
        if (!allUsers) return [];
        return allUsers.filter(user => salariedRoles.includes(user.role));
    }, [allUsers]);

    const kpis = React.useMemo(() => {
        if (!allUsers) return { present: 0, onLeave: 0 };
        // This is a placeholder. Real-time presence would require a more complex query.
        const present = salariedUsers.filter(u => (u as any).attendanceStatus === 'Present').length;
        const onLeave = salariedUsers.filter(u => (u as any).attendanceStatus === 'On Leave').length;
        return { present, onLeave };
    }, [allUsers, salariedUsers]);


    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }


  return (
    <>
      <PageHeader title="Employee Attendance">
        <div className="flex items-center gap-2">
          <Input 
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
        </div>
      </PageHeader>
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <UserIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salariedUsers.length}</div>
            <p className="text-xs text-muted-foreground">Total salaried employees.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present Today</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.present}</div>
            <p className="text-xs text-muted-foreground">Employees currently clocked in.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Leave</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.onLeave}</div>
            <p className="text-xs text-muted-foreground">Approved leaves for today.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live Attendance Log</CardTitle>
          <CardDescription>
            A live overview of employee punch times and earnings for today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">Employee</TableHead>
                <TableHead className="w-[25%]">Punch Times</TableHead>
                <TableHead className="w-[15%]">Total Hours Today</TableHead>
                <TableHead className="w-[15%] text-right">Estimated Earnings</TableHead>
                <TableHead className="w-[8%] text-center">Status</TableHead>
                <TableHead className="w-[12%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersLoading ? (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">Loading employees...</TableCell>
                </TableRow>
              ) : salariedUsers.map((user) => (
                <AttendanceRow key={user.id} user={user} selectedDate={selectedDate} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
