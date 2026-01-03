
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Attendance, PunchLog, User } from '@/lib/types';
import { Trash2, PlusCircle } from 'lucide-react';
import { format, parse } from 'date-fns';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, Timestamp, setDoc } from 'firebase/firestore';

interface EditAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  attendance: Attendance | null;
  selectedDate: string;
}

export function EditAttendanceDialog({ open, onOpenChange, user, attendance, selectedDate }: EditAttendanceDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [punches, setPunches] = React.useState<Partial<PunchLog>[]>([]);

  React.useEffect(() => {
    if (attendance?.punches) {
      setPunches(attendance.punches.map(p => ({
        ...p,
        // Ensure inTime and outTime are strings for the input fields
        inTime: p.inTime ? format((p.inTime as any).toDate(), 'HH:mm:ss') : '',
        outTime: p.outTime ? format((p.outTime as any).toDate(), 'HH:mm:ss') : '',
      })) as any);
    } else {
      setPunches([]);
    }
  }, [attendance, open]);

  const handleTimeChange = (index: number, field: 'inTime' | 'outTime', value: string) => {
    const newPunches = [...punches];
    newPunches[index] = { ...newPunches[index], [field]: value };
    setPunches(newPunches);
  };

  const handleAddPunch = () => {
    setPunches(prev => [...prev, { inTime: '', outTime: '', type: 'Office', isApproved: true }]);
  };

  const handleRemovePunch = (index: number) => {
    setPunches(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleSaveChanges = async () => {
    const attendanceDocRef = doc(firestore, 'users', user.id, 'attendance', selectedDate);
    
    // Convert string times back to Timestamps
    const updatedPunches = punches.map(p => {
        const inTimeDate = parse(p.inTime as string, 'HH:mm:ss', new Date(selectedDate));
        const outTimeDate = p.outTime ? parse(p.outTime as string, 'HH:mm:ss', new Date(selectedDate)) : null;

        return {
            ...p,
            inTime: Timestamp.fromDate(inTimeDate),
            outTime: outTimeDate ? Timestamp.fromDate(outTimeDate) : null,
        } as PunchLog;
    }).filter(p => !isNaN(p.inTime.toDate().getTime())); // Filter out invalid dates

    // Recalculate totals
     const totalSeconds = updatedPunches.reduce((acc, log) => {
        if (log.outTime && log.inTime) {
            const duration = (log.outTime.toDate().getTime() - log.inTime.toDate().getTime()) / 1000;
            return acc + duration;
        }
        return acc;
    }, 0);

    const totalHours = totalSeconds / 3600;
    // Note: Re-calculating earnings would require fetching payroll settings again. 
    // This is a simplified update focusing on time correction.
    const updatedTotals = {
        totalHours: totalHours,
        standardHours: Math.min(totalHours, 8),
        otHours: Math.max(0, totalHours - 8),
        punches: updatedPunches,
        // Earnings should be recalculated, potentially in a backend function for accuracy
    };

    try {
        if (attendance) {
            await updateDoc(attendanceDocRef, updatedTotals);
        } else {
            await setDoc(attendanceDocRef, { date: selectedDate, ...updatedTotals });
        }
        toast({ title: "Attendance Updated", description: "The punch log has been corrected." });
        onOpenChange(false);
    } catch (error) {
        console.error("Error updating attendance:", error);
        toast({ variant: 'destructive', title: "Update Failed" });
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Attendance for {user.name}</DialogTitle>
          <DialogDescription>
            Manually correct punch-in and punch-out times for {format(new Date(selectedDate), 'PPP')}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {punches.map((punch, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor={`inTime-${index}`}>Punch In</Label>
                <Input
                  id={`inTime-${index}`}
                  type="time"
                  step="1"
                  value={punch.inTime as string}
                  onChange={(e) => handleTimeChange(index, 'inTime', e.target.value)}
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor={`outTime-${index}`}>Punch Out</Label>
                <Input
                  id={`outTime-${index}`}
                  type="time"
                  step="1"
                  value={punch.outTime as string}
                  onChange={(e) => handleTimeChange(index, 'outTime', e.target.value)}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleRemovePunch(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
           <Button variant="outline" size="sm" className="w-full" onClick={handleAddPunch}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Punch Entry
            </Button>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="button" onClick={handleSaveChanges}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}