

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
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LogIn, LogOut, Loader2, MapPin, Calendar, Clock, CircleDollarSign, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, lastDayOfMonth } from 'date-fns';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, setDoc, updateDoc, arrayUnion, query, orderBy, limit, Timestamp, getDoc, addDoc, writeBatch, increment } from 'firebase/firestore';
import type { Attendance, PunchLog, UserProfile, PayrollConfig } from '@/lib/types';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};


type DailyLog = {
  date: string;
  logs: PunchLog[];
  totalHours: number;
  standardHours: number;
  otHours: number;
  totalEarning: number;
  withdrawal?: number;
};

const safeCreateDate = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    if (typeof timestamp === 'object' && 'seconds' in timestamp && 'nanoseconds' in timestamp) {
        return new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000);
    }
    return null;
};


function MyAttendancePageContent() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  
  const userProfileRef = user ? doc(firestore, 'users', user.uid) : null;
  const { data: userProfile, loading: userProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const companyInfoRef = doc(firestore, 'company', 'info');
  const { data: companyInfo, loading: companyInfoLoading } = useDoc<{ latitude?: number, longitude?: number, payrollConfig?: PayrollConfig }>(companyInfoRef);

  const todayDocRef = user ? doc(firestore, 'users', user.uid, 'attendance', todayStr) : null;
  const attendanceHistoryQuery = user ? query(collection(firestore, 'users', user.uid, 'attendance'), orderBy('date', 'desc'), limit(60)) : null;

  const { data: todayAttendance, loading: todayLoading } = useDoc<Attendance>(todayDocRef as any);
  const { data: attendanceHistory, loading: historyLoading } = useCollection<Attendance>(attendanceHistoryQuery as any);

  const [liveEarnings, setLiveEarnings] = React.useState(0);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const watchIdRef = React.useRef<number | null>(null);

  const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = React.useState(false);
  const [advanceAmount, setAdvanceAmount] = React.useState('');
  const [advanceRemark, setAdvanceRemark] = React.useState('');
  const [isSubmittingAdvance, setIsSubmittingAdvance] = React.useState(false);

  const salaryDetails = React.useMemo(() => {
    if (!userProfile) return { rate: 0, type: 'monthly', basicHourlyRate: 0, skills: [], allowances: [] };
    const details = (userProfile as any).salaryDetails || {};

    const baseHourlyRate = details.type === 'hourly' 
      ? (details.basicHourlyRate || 0) 
      : ((details.ctc || 0) / 12) / (26 * 8);

    const skillRate = (details.skills || []).reduce((acc: number, skill: {rate: number}) => acc + (skill.rate || 0), 0);
    
    return {
      type: details.type || 'monthly',
      hourlyRate: details.hourlyRate || companyInfo?.payrollConfig?.hourly?.defaultRate || 0,
      basicHourlyRate: baseHourlyRate,
      skills: details.skills || [],
      allowances: details.allowances || [],
    };
  }, [userProfile, companyInfo]);
  
  const otMultipliers = React.useMemo(() => companyInfo?.payrollConfig?.overtime || {
      slot1Multiplier: 1.5,
      slot2Multiplier: 2.0,
      slot3Multiplier: 2.5,
  }, [companyInfo]);


  const calculateDailyEarnings = React.useCallback((totalHours: number) => {
    const hourlyRate = salaryDetails.hourlyRate;
    if (hourlyRate === 0) return { standardHours: totalHours, otHours: 0, totalEarning: 0 };

    const standardHours = Math.min(totalHours, 8);
    const otHours = Math.max(0, totalHours - 8);
  
    const standardEarning = standardHours * hourlyRate;
  
    let otEarning = 0;
    if (otHours > 0) {
      let remainingOt = otHours;
      
      const slot1Hours = Math.min(remainingOt, 2);
      otEarning += slot1Hours * hourlyRate * (otMultipliers.slot1Multiplier || 1.5);
      remainingOt -= slot1Hours;
  
      if (remainingOt > 0) {
        const slot2Hours = Math.min(remainingOt, 2);
        otEarning += slot2Hours * hourlyRate * (otMultipliers.slot2Multiplier || 2.0);
        remainingOt -= slot2Hours;
      }
  
      if (remainingOt > 0) {
        const slot3Hours = Math.min(remainingOt, 4);
        otEarning += slot3Hours * hourlyRate * (otMultipliers.slot3Multiplier || 2.5);
      }
    }
  
    const totalEarning = standardEarning + otEarning;
  
    return { standardHours, otHours, totalEarning };
  }, [salaryDetails.hourlyRate, otMultipliers]);
  
  const timeLog = React.useMemo(() => {
    if (!todayAttendance?.punches) return [];
    return todayAttendance.punches.map(p => ({
        ...p,
        inTime: (p.inTime as any)?.toDate ? (p.inTime as any).toDate() : new Date(p.inTime),
        outTime: p.outTime && ((p.outTime as any)?.toDate ? (p.outTime as any).toDate() : new Date(p.outTime)),
    }));
  }, [todayAttendance]);

  const lastLog = React.useMemo(() => timeLog.length > 0 ? timeLog[timeLog.length - 1] : null, [timeLog]);
  const punchStatus = React.useMemo(() => (lastLog && !lastLog.outTime) ? 'in' : 'out', [lastLog]);
  
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (punchStatus === 'in' && lastLog && lastLog.inTime) {
      interval = setInterval(() => {
        const now = new Date();
        const diffInSeconds = (now.getTime() - new Date(lastLog.inTime).getTime()) / 1000;
        
        const totalSecondsToday = timeLog.reduce((acc, log) => {
            if (log.outTime) {
                return acc + (new Date(log.outTime).getTime() - new Date(log.inTime).getTime()) / 1000;
            }
            return acc;
        }, 0);
        
        const totalHours = (totalSecondsToday + diffInSeconds) / 3600;
        const { totalEarning } = calculateDailyEarnings(totalHours);
        setLiveEarnings(totalEarning);
      }, 1000);
    } else {
        const totalSecondsToday = timeLog.reduce((acc, log) => {
            if (log.outTime && log.inTime) {
                return acc + (new Date(log.outTime).getTime() - new Date(log.inTime).getTime()) / 1000;
            }
            return acc;
        }, 0);
        const totalHours = totalSecondsToday / 3600;
        const { totalEarning } = calculateDailyEarnings(totalHours);
        setLiveEarnings(totalEarning);
    }
    return () => clearInterval(interval);
  }, [punchStatus, timeLog, lastLog, calculateDailyEarnings]);
  
  const getDistance = (lat1:number, lon1:number, lat2:number, lon2:number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  const startFieldTracking = () => {
    if (!todayDocRef) return;
    const locationsCollectionRef = collection(firestore, todayDocRef.path, 'locations');

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        await addDoc(locationsCollectionRef, {
            latitude,
            longitude,
            accuracy,
            timestamp: Timestamp.now(),
        });
      },
      (err) => {
        console.warn(`ERROR(${err.code}): ${err.message}`);
        toast({
            variant: 'destructive',
            title: 'Location Tracking Error',
            description: 'Could not get location. Tracking may be interrupted.',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 60000,
        maximumAge: 30000,
      }
    );
  };
  
  const stopFieldTracking = () => {
    if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        toast({ title: "Field Tracking Stopped", description: "You are no longer sharing your location."});
    }
  };

  const handlePunch = () => {
    if (isProcessing || !todayDocRef) return;

    const now = new Date();
    setIsProcessing(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const officeLat = companyInfo?.latitude || 26.8467;
        const officeLon = companyInfo?.longitude || 80.9462;
        const distance = getDistance(latitude, longitude, officeLat, officeLon);
        const geoBoundary = 0.1; // 100 meters
        const punchType = distance > geoBoundary ? 'Field' : 'Office';
        
        if (punchStatus === 'out') {
          const newPunch: PunchLog = {
            inTime: Timestamp.fromDate(now),
            outTime: null,
            type: punchType,
            inLocation: { lat: latitude, lon: longitude },
            isApproved: punchType === 'Office' ? true : false,
          };
          
          await setDoc(todayDocRef, {
            date: todayStr,
            punches: arrayUnion(newPunch)
          }, { merge: true });

          if (punchType === 'Field') {
            startFieldTracking();
            toast({
              variant: 'default',
              title: 'Field Punch-In Recorded',
              description: 'You are outside the office boundary. Your location is now being tracked. This entry will require HR approval.',
            });
          } else {
            toast({ title: 'Punched In', description: `You clocked in at ${format(now, 'p')} (${punchType}).` });
          }
        } else { // Punching out
            stopFieldTracking();
            const attendanceDoc = await getDoc(todayDocRef);
            const currentPunches = attendanceDoc.data()?.punches || [];
            const lastPunchIndex = currentPunches.length - 1;

            if (lastPunchIndex >= 0) {
                const newPunches = [...currentPunches];
                const updatedPunch = { ...newPunches[lastPunchIndex], outTime: Timestamp.fromDate(now) };
                if (updatedPunch.type === 'Field') {
                  updatedPunch.outLocation = { lat: latitude, lon: longitude };
                }
                newPunches[lastPunchIndex] = updatedPunch;
                
                const totalSecondsToday = newPunches.reduce((acc, log) => {
                    if (log.outTime && log.inTime) {
                         const inTime = (log.inTime as Timestamp).toDate();
                         const outTime = (log.outTime as Timestamp).toDate();
                         return acc + (outTime.getTime() - inTime.getTime()) / 1000;
                    }
                    return acc;
                }, 0);

                const totalHours = totalSecondsToday / 3600;
                const { standardHours, otHours, totalEarning } = calculateDailyEarnings(totalHours);
                
                await updateDoc(todayDocRef, { punches: newPunches, totalHours, standardHours, otHours, totalEarning });
            }
          toast({ title: 'Punched Out', description: `You clocked out at ${format(now, 'p')}` });
        }

        setIsProcessing(false);
      },
      (error) => {
        console.error("Error getting location: ", error);
        toast({
          variant: 'destructive',
          title: 'Location Error',
          description: 'Could not fetch your location. Please enable location services.',
        });
        setIsProcessing(false);
      }
    );
  };
  

  const dailyEarningsData = React.useMemo(() => {
    if (!attendanceHistory) return [];
    return attendanceHistory.map((log: any) => {
        const totalHours = log.totalHours || 0;
        const standardEarning = (log.standardHours || 0) * salaryDetails.basicHourlyRate;
        const skillEarning = (log.standardHours || 0) * (salaryDetails.hourlyRate - salaryDetails.basicHourlyRate);
        const otHours = log.otHours || 0;

        let otEarning = 0;
        if (otHours > 0) {
            let remainingOt = otHours;
            const slot1 = Math.min(remainingOt, 2);
            otEarning += slot1 * salaryDetails.hourlyRate * (otMultipliers.slot1Multiplier || 1.5);
            remainingOt -= slot1;
            
            const slot2 = Math.min(remainingOt, 2);
            otEarning += slot2 * salaryDetails.hourlyRate * (otMultipliers.slot2Multiplier || 2.0);
            remainingOt -= slot2;

            const slot3 = Math.max(0, remainingOt);
            otEarning += slot3 * salaryDetails.hourlyRate * (otMultipliers.slot3Multiplier || 2.5);
        }

        const totalDailyEarning = log.totalEarning || (standardEarning + skillEarning + otEarning);
        return {
            ...log,
            totalDailyEarning,
            slot1: Math.min(otHours, 2),
            slot2: Math.min(Math.max(0, otHours - 2), 2),
            slot3: Math.max(0, otHours - 4),
        };
    });
  }, [attendanceHistory, salaryDetails, otMultipliers]);
  
  const { salaryBreakdown, kpis } = React.useMemo(() => {
    const defaultBreakdown = {
      workingDays: 0,
      totalOT: 0,
      standardPay: 0,
      drivingPay: 0,
      otPay: 0,
      foodAllowance: 2000, // Mock, should come from settings
      grossEarnings: 0,
      pf: 0,
      pt: 0,
      tds: 0,
      withdrawals: 0,
      totalDeductions: 0,
      netSalary: 0,
      totalStdHours: 0,
      totalOtSlot1: 0,
      totalOtSlot2: 0,
      totalOtSlot3: 0,
    };
    if (!dailyEarningsData || !userProfile || !companyInfo) return { salaryBreakdown: defaultBreakdown, kpis: { totalEarnings: 0, totalWithdrawals: 0, totalOT: 0, workingDays: 0 }};

    const totalStdHours = dailyEarningsData.reduce((acc, log) => acc + (log.standardHours || 0), 0);
    const totalOtHours = dailyEarningsData.reduce((acc, log) => acc + (log.otHours || 0), 0);
    const totalWithdrawals = dailyEarningsData.reduce((acc, log) => acc + (log.withdrawal || 0), 0);

    const standardPay = totalStdHours * (salaryDetails.basicHourlyRate || 0);
    const drivingPay = totalStdHours * (salaryDetails.skills.find((s: any) => s.skill === 'Driving')?.rate || 0);
    
    const totalOtSlot1 = dailyEarningsData.reduce((acc, log) => acc + log.slot1, 0);
    const totalOtSlot2 = dailyEarningsData.reduce((acc, log) => acc + log.slot2, 0);
    const totalOtSlot3 = dailyEarningsData.reduce((acc, log) => acc + log.slot3, 0);
    
    const otPay = (totalOtSlot1 * salaryDetails.hourlyRate * otMultipliers.slot1Multiplier) + 
                  (totalOtSlot2 * salaryDetails.hourlyRate * otMultipliers.slot2Multiplier) +
                  (totalOtSlot3 * salaryDetails.hourlyRate * otMultipliers.slot3Multiplier);

    const foodAllowance = salaryDetails.allowances.find((a: any) => a.name === 'Food')?.value || 2000;
    
    const grossEarnings = standardPay + drivingPay + otPay + foodAllowance;
    
    const details = (userProfile as any).salaryDetails || {};
    const ctc = details.ctc || 0;
    const monthlyConfig = companyInfo?.payrollConfig?.monthly;
    
    const monthlyGross = (details.type === 'monthly' && ctc > 0) ? ctc / 12 : grossEarnings;

    const pf = (details.pfEnabled && details.type === 'monthly') ? (monthlyGross * ((monthlyConfig?.basicPercent || 50) / 100)) * ((monthlyConfig?.pfContributionPercent || 12) / 100) : 0;
    const pt = (details.type === 'monthly') ? (monthlyConfig?.professionalTax || 0) : 0;

    const annualGrossEstimate = (details.type === 'monthly') ? ctc : grossEarnings * 12;
    const tdsRate = details.tdsRate || 0;
    const tds = details.tdsEnabled ? (annualGrossEstimate / 12) * (tdsRate / 100) : 0;
    
    const totalDeductions = pf + pt + tds + totalWithdrawals;
    const netSalary = grossEarnings - totalDeductions;
    
    const breakdown = {
      workingDays: dailyEarningsData.length,
      totalOT: totalOtHours,
      standardPay,
      drivingPay,
      otPay,
      foodAllowance,
      grossEarnings,
      pf,
      pt,
      tds,
      withdrawals: totalWithdrawals,
      totalDeductions,
      netSalary,
      totalStdHours,
      totalOtSlot1,
      totalOtSlot2,
      totalOtSlot3,
    };
    
    const kpis = { 
        workingDays: dailyEarningsData.length, 
        totalOT: totalOtHours,
        totalEarnings: grossEarnings, 
        totalWithdrawals,
    };

    return { salaryBreakdown: breakdown, kpis };

  }, [dailyEarningsData, userProfile, salaryDetails, companyInfo, otMultipliers]);


  const handleAdvanceRequestSubmit = async () => {
    if (!user || !userProfile) {
        toast({ variant: "destructive", title: "User not found" });
        return;
    }
    if (!advanceAmount || Number(advanceAmount) <= 0) {
        toast({ variant: "destructive", title: "Invalid Amount" });
        return;
    }

    setIsSubmittingAdvance(true);
    const requestData = {
        employeeId: user.uid,
        employeeName: userProfile.name,
        requestDate: new Date().toISOString(),
        amount: Number(advanceAmount),
        remarks: advanceRemark,
        status: 'Pending Approval',
    };

    try {
        await addDoc(collection(firestore, 'salaryAdvanceRequests'), requestData);
        toast({ title: "Request Submitted", description: "Your advance salary request has been sent for HR approval." });
        setIsAdvanceDialogOpen(false);
        setAdvanceAmount('');
        setAdvanceRemark('');
    } catch (error) {
        console.error("Error submitting advance request:", error);
        toast({ variant: "destructive", title: "Submission Failed" });
    } finally {
        setIsSubmittingAdvance(false);
    }
  };

  return (
    <>
      <PageHeader title="My Attendance">
        <Dialog open={isAdvanceDialogOpen} onOpenChange={setIsAdvanceDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">Request Advance Salary</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Advance Salary</DialogTitle>
              <DialogDescription>
                Request an advance on your salary. This will be sent for HR approval.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="advance-amount">Amount</Label>
                <Input
                  id="advance-amount"
                  type="number"
                  placeholder="₹0.00"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="advance-remark">Reason / Remark</Label>
                <Textarea
                  id="advance-remark"
                  placeholder="Enter a brief reason for your request..."
                  value={advanceRemark}
                  onChange={(e) => setAdvanceRemark(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleAdvanceRequestSubmit} disabled={isSubmittingAdvance}>
                {isSubmittingAdvance && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>
       <div className="grid gap-6 lg:grid-cols-4">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Working Days</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.workingDays}</div>
                <p className="text-xs text-muted-foreground">Days punched in this month</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total OT Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{kpis.totalOT.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Overtime logged this month</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatIndianCurrency(kpis.totalEarnings)}</div>
                <p className="text-xs text-muted-foreground">Estimated for this month</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Withdrawals</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatIndianCurrency(kpis.totalWithdrawals)}</div>
                <p className="text-xs text-muted-foreground">Amount withdrawn this month</p>
            </CardContent>
        </Card>
      </div>

       <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Today's Log</CardTitle>
                    <CardDescription>Your punch-in and punch-out times for today.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Punch In</TableHead>
                                <TableHead>Punch Out</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {timeLog.length > 0 ? timeLog.map((log, index) => (
                                <TableRow key={index}>
                                    <TableCell>{format(new Date(log.inTime), 'p')}</TableCell>
                                    <TableCell>{log.outTime ? format(new Date(log.outTime), 'p') : '...'}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            {log.type}
                                            {log.type === 'Field' && <MapPin className="h-4 w-4 text-blue-500" />}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {log.type === 'Field' && (
                                            log.isApproved ? (
                                                <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Approved</span>
                                            ) : (
                                                <span className="text-orange-500 text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Pending Approval</span>
                                            )
                                        )}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24">Not punched in today.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
        <div>
            <Card className="h-full flex flex-col">
                 <CardHeader>
                    <CardTitle>Live Earnings</CardTitle>
                    <CardDescription>Your estimated earnings for today so far.</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow flex items-center justify-center">
                    <p className="text-4xl font-bold text-primary">{formatIndianCurrency(liveEarnings)}</p>
                </CardContent>
            </Card>
        </div>
      </div>
      
        <Button size="lg" className="w-full h-16 text-lg gap-2" onClick={handlePunch} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (punchStatus === 'out' ? <LogIn /> : <LogOut />)}
            {punchStatus === 'out' ? 'Punch In' : 'Punch Out'}
        </Button>
      
        <Card>
        <CardHeader>
          <CardTitle>Monthly Salary Summary</CardTitle>
          <CardDescription>Estimated salary for {format(new Date(), 'MMMM yyyy')}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <h4 className="font-semibold">Earnings</h4>
              <div className="border rounded-md p-4 space-y-2">
                {salaryDetails.type === 'monthly' ? (
                  <>
                    <div className="flex justify-between"><span>Gross Salary</span><span>{formatIndianCurrency(salaryBreakdown.grossSalary)}</span></div>
                    <div className="flex justify-between"><span>Overtime Pay ({kpis.totalOT.toFixed(2)} hrs)</span><span>{formatIndianCurrency(salaryBreakdown.otPay)}</span></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span>Standard Hours Pay ({salaryBreakdown.totalStdHours.toFixed(2)} hrs @ ₹{salaryDetails.basicHourlyRate}/hr)</span><span>{formatIndianCurrency(salaryBreakdown.standardPay)}</span></div>
                    {salaryBreakdown.drivingPay > 0 && <div className="flex justify-between"><span>Driving Pay ({salaryBreakdown.totalStdHours.toFixed(2)} hrs @ ₹{(salaryDetails.skills.find((s:any) => s.skill === 'Driving')?.rate || 0)}/hr)</span><span>{formatIndianCurrency(salaryBreakdown.drivingPay)}</span></div>}
                    <div className="flex justify-between"><span>Overtime Pay ({kpis.totalOT.toFixed(2)} hrs)</span><span>{formatIndianCurrency(salaryBreakdown.otPay)}</span></div>
                    {salaryBreakdown.foodAllowance > 0 && <div className="flex justify-between"><span>Food Allowance</span><span>{formatIndianCurrency(salaryBreakdown.foodAllowance)}</span></div>}
                  </>
                )}
                <Separator />
                <div className="flex justify-between font-bold"><span>Gross Earnings</span><span>{formatIndianCurrency(salaryBreakdown.grossEarnings)}</span></div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Deductions</h4>
              <div className="border rounded-md p-4 space-y-2">
                <div className="flex justify-between"><span>Provident Fund (PF)</span><span>{formatIndianCurrency(salaryBreakdown.pf)}</span></div>
                <div className="flex justify-between"><span>Professional Tax</span><span>{formatIndianCurrency(salaryBreakdown.pt)}</span></div>
                <div className="flex justify-between"><span>TDS</span><span>{formatIndianCurrency(salaryBreakdown.tds)}</span></div>
                <div className="flex justify-between"><span>Salary Advance / Withdrawal</span><span>{formatIndianCurrency(salaryBreakdown.withdrawals)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold"><span>Total Deductions</span><span>{formatIndianCurrency(salaryBreakdown.totalDeductions)}</span></div>
              </div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-primary/10 rounded-md flex justify-between items-center">
            <span className="text-lg font-bold text-primary">Net Salary Payable</span>
            <span className="text-2xl font-bold text-primary">{formatIndianCurrency(salaryBreakdown.netSalary)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance Log for {format(new Date(), 'MMMM yyyy')}</CardTitle>
          <CardDescription>Detailed attendance log for the current month.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Std. Hours</TableHead>
                    <TableHead className="text-right">OT Slot 1 ({otMultipliers.slot1Multiplier}x)</TableHead>
                    <TableHead className="text-right">OT Slot 2 ({otMultipliers.slot2Multiplier}x)</TableHead>
                    <TableHead className="text-right">OT Slot 3 ({otMultipliers.slot3Multiplier}x)</TableHead>
                    <TableHead className="text-right">Total Hours</TableHead>
                    <TableHead className="text-right">Total Earning</TableHead>
                    <TableHead className="text-right">Withdrawal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyLoading ? (
                       <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center">
                            Loading attendance history...
                        </TableCell>
                      </TableRow>
                  ) : dailyEarningsData.length > 0 ? (
                     dailyEarningsData.map((log) => {
                       const logDate = safeCreateDate(log.date);
                       return (
                          <TableRow key={log.date}>
                            <TableCell>{logDate ? format(logDate, 'MMMM do, yyyy') : 'Invalid Date'}</TableCell>
                            <TableCell className="text-right">{(log.standardHours || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right">{log.slot1.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{log.slot2.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{log.slot3.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{(log.totalHours || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">{formatIndianCurrency(log.totalDailyEarning)}</TableCell>
                            <TableCell className="text-right font-mono">{formatIndianCurrency(log.withdrawal || 0)}</TableCell>
                          </TableRow>
                       );
                     })
                  ) : (
                       <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center">
                              No attendance history for this month yet.
                          </TableCell>
                      </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                    <TableRow className="font-bold bg-gray-100 dark:bg-gray-800">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{salaryBreakdown.totalStdHours.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{salaryBreakdown.totalOtSlot1.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{salaryBreakdown.totalOtSlot2.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{salaryBreakdown.totalOtSlot3.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{(kpis.totalOT + salaryBreakdown.totalStdHours).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatIndianCurrency(kpis.totalEarnings)}</TableCell>
                        <TableCell className="text-right font-mono">{formatIndianCurrency(kpis.totalWithdrawals)}</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </CardContent>
    </Card>
    </>
  );
}

export default function MyAttendancePage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <MyAttendancePageContent />;
}

