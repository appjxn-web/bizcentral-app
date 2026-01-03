
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
import { Rocket, FileText, Printer, CheckCircle, Banknote, Users, TrendingDown, Clock, Loader2, ChevronRight, ChevronDown, MoreHorizontal, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, lastDayOfMonth } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, query, where, doc, writeBatch, addDoc, serverTimestamp, increment, getDocs, limit } from 'firebase/firestore';
import type { User, UserRole, PayrollConfig, Attendance, CoaLedger, JournalVoucher } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useRouter } from 'next/navigation';

const salariedRoles: UserRole[] = [
  'Admin', 'Manager', 'Employee', 'CEO', 'Sales Manager', 'Production Manager', 
  'Purchase Manager', 'Service Manager', 'Accounts Manager', 'HR Manager'
];

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

function calculateOtEarnings(totalHours: number, perHourRate: number, otMultipliers: PayrollConfig['overtime'] | undefined) {
    const otHours = Math.max(0, totalHours - 8);
    let otEarning = 0;
    if (otHours > 0) {
        let remainingOt = otHours;
        const slot1Hours = Math.min(remainingOt, 2);
        otEarning += slot1Hours * perHourRate * (otMultipliers?.slot1Multiplier || 1.5);
        remainingOt -= slot1Hours;

        if (remainingOt > 0) {
            const slot2Hours = Math.min(remainingOt, 2);
            otEarning += slot2Hours * perHourRate * (otMultipliers?.slot2Multiplier || 2.0);
            remainingOt -= slot2Hours;
        }

        if (remainingOt > 0) {
            // As per user request, any remaining hours go into the last slot.
            otEarning += remainingOt * perHourRate * (otMultipliers?.slot3Multiplier || 2.5);
        }
    }
    return otEarning;
}

const getSalaryDetails = (user: User, otPay: number, payrollConfig: PayrollConfig | undefined) => {
    const salaryDetails = (user as any).salaryDetails || {};
    const ctc = salaryDetails.ctc || 0;
    const hourlyRate = salaryDetails.hourlyRate || 0;

    const monthlyConfig = payrollConfig?.monthly || { basicPercent: 50, hraPercent: 40, pfContributionPercent: 12, professionalTax: 200 };
    
    let grossSalary = 0;
    if (salaryDetails.type === 'monthly') {
        grossSalary = ctc / 12;
    } else if (salaryDetails.type === 'hourly') {
        // This is a simplification; real calculation needs attendance data for total hours.
        grossSalary = hourlyRate * 160; // Assuming 160 hours/month
    }
    
    const basic = grossSalary * (monthlyConfig.basicPercent / 100);
    const hra = basic * (monthlyConfig.hraPercent / 100);
    const specialAllowance = grossSalary - basic - hra;
    
    const totalEarnings = grossSalary + otPay;
    
    const pf = (salaryDetails?.pfEnabled && salaryDetails.type === 'monthly') ? basic * (monthlyConfig.pfContributionPercent / 100) : 0;
    const professionalTax = (salaryDetails.type === 'monthly') ? monthlyConfig.professionalTax : 0;
    const tds = totalEarnings > 60000 ? (totalEarnings - 50000) * 0.1 : 0; // Simplified TDS
    const totalDeductions = pf + professionalTax + tds;

    return {
        annualCTC: ctc,
        grossSalary,
        totalEarnings,
        earnings: {
        basic,
        hra,
        specialAllowance,
        },
        deductions: {
        pf,
        professionalTax,
        tds,
        totalDeductions,
        },
        netSalary: totalEarnings - totalDeductions,
        type: salaryDetails.type || 'monthly',
        hourlyRate: salaryDetails.hourlyRate || 0,
        basicHourlyRate: salaryDetails.basicHourlyRate || 0,
        skills: salaryDetails.skills || [],
        allowances: salaryDetails.allowances || [],
    };
};

function PayrollRow({ user, payrollConfig }: { user: User, payrollConfig: PayrollConfig | undefined }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const router = useRouter();
  const firestore = useFirestore();
  
  const perHourRate = React.useMemo(() => {
    const details = (user as any).salaryDetails || {};
    if (details.type === 'hourly') {
        const base = details.basicHourlyRate || 0;
        const skillBonus = (details.skills || []).reduce((acc: number, skill: {rate: number}) => acc + (skill.rate || 0), 0);
        return base + skillBonus;
    }
    // For monthly, calculate an approximate hourly rate for OT
    return ((details.ctc || 0) / 12) / (26 * 8);
  }, [user]);

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const attendanceQuery = React.useMemo(() => {
    if (!user || !firestore) return null;
    return query(
      collection(firestore, 'users', user.id, 'attendance'),
      where('date', '>=', format(monthStart, 'yyyy-MM-dd')),
      where('date', '<=', format(monthEnd, 'yyyy-MM-dd'))
    );
  }, [user, firestore, monthStart, monthEnd]);

  const { data: attendanceLog } = useCollection<Attendance>(attendanceQuery);

  const totalOtHours = attendanceLog?.reduce((acc, log) => acc + (log.otHours || 0), 0) || 0;
  const otPay = calculateOtEarnings(totalOtHours + ((attendanceLog?.length || 0) * 8), perHourRate, payrollConfig?.overtime);
  
  const salary = getSalaryDetails(user, otPay, payrollConfig);

  const handleViewPayslip = () => {
    const payslipData = {
        user,
        salary,
        attendanceLog,
        payPeriod: format(new Date(), 'MMMM yyyy'),
    };
    localStorage.setItem('payslipData', JSON.stringify(payslipData));
    router.push(`/dashboard/hr/payroll/view?userId=${user.id}`);
  };

  return (
    <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
      <TableBody>
        <TableRow data-state={isOpen ? 'open' : 'closed'}>
          <TableCell className="w-12">
             <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                    <span className="sr-only">Toggle details</span>
                </Button>
            </CollapsibleTrigger>
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={(user as any).avatar} />
                <AvatarFallback>{user.name ? user.name.charAt(0) : user.email ? user.email.charAt(0) : 'U'}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{user.name}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
            </div>
          </TableCell>
          <TableCell className="font-mono capitalize">{salary.type}</TableCell>
          <TableCell className="text-right">
              <Button variant="outline" size="sm" onClick={handleViewPayslip}>
                <Eye className="mr-2 h-4 w-4" />
                View Payslip
              </Button>
          </TableCell>
        </TableRow>
        {isOpen && (
            <TableRow>
                <TableCell colSpan={4} className="p-0">
                    <div className="p-6 bg-muted/50">
                        <h4 className="font-semibold mb-4 text-base">Salary Structure Details</h4>
                        {salary.type === 'monthly' ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div><p className="text-muted-foreground">CTC (Annual)</p><p className="font-medium">{formatIndianCurrency(salary.annualCTC)}</p></div>
                                <div><p className="text-muted-foreground">Gross Monthly</p><p className="font-medium">{formatIndianCurrency(salary.grossSalary)}</p></div>
                                <div><p className="text-muted-foreground">Basic</p><p className="font-medium">{formatIndianCurrency(salary.earnings.basic)}</p></div>
                                <div><p className="text-muted-foreground">HRA</p><p className="font-medium">{formatIndianCurrency(salary.earnings.hra)}</p></div>
                            </div>
                        ) : (
                             <div className="space-y-4 text-sm">
                               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div><p className="text-muted-foreground">Total Hourly Rate</p><p className="font-medium">{formatIndianCurrency(salary.hourlyRate)}</p></div>
                                  <div><p className="text-muted-foreground">Basic Hourly Rate</p><p className="font-medium">{formatIndianCurrency(salary.basicHourlyRate)}</p></div>
                               </div>
                               {salary.skills && salary.skills.length > 0 && (
                                 <div>
                                   <p className="font-medium text-muted-foreground mb-1">Skill-based Rates:</p>
                                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {salary.skills.map((skill: any, i: number) => (
                                      <div key={i}><p className="text-muted-foreground">{skill.skill} Rate</p><p className="font-medium">{formatIndianCurrency(skill.rate)}</p></div>
                                    ))}
                                   </div>
                                 </div>
                               )}
                                {salary.allowances && salary.allowances.length > 0 && (
                                 <div>
                                   <p className="font-medium text-muted-foreground mb-1">Allowances:</p>
                                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {salary.allowances.map((allowance: any, i: number) => (
                                      <div key={i}><p className="text-muted-foreground">{allowance.name}</p><p className="font-medium">{formatIndianCurrency(allowance.value)}</p></div>
                                    ))}
                                   </div>
                                 </div>
                               )}
                             </div>
                        )}
                    </div>
                </TableCell>
            </TableRow>
        )}
      </TableBody>
    </Collapsible>
  );
}


export default function PayrollPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isProcessing, setIsProcessing] = React.useState(false);

  const { data: users, loading: usersLoading } = useCollection<User>(collection(firestore, 'users'));
  const { data: companyInfo, loading: companyInfoLoading } = useDoc<any>(doc(firestore, 'company', 'info'));
  const { data: coaLedgers } = useCollection<CoaLedger>(collection(firestore, 'coa_ledgers'));
  
  const salariedUsers = React.useMemo(() => {
    return users?.filter(user => salariedRoles.includes(user.role)) || [];
  }, [users]);
  
  const payrollConfig = companyInfo?.payrollConfig;

  const { totalSalaries, totalDeductions, totalNet, totalOtPay } = React.useMemo(() => {
    let salaries = 0, deductions = 0, net = 0, ot = 0;
    salariedUsers.forEach(user => {
      // Note: OT calculation here is a simplified estimate for the KPI card.
      // The detailed calculation happens inside each PayrollRow.
      const salary = getSalaryDetails(user, 0, payrollConfig);
      salaries += salary.grossSalary;
      deductions += salary.deductions.totalDeductions;
      net += salary.netSalary;
    });
    return { totalSalaries: salaries, totalDeductions: deductions, totalNet: net, totalOtPay: ot };
  }, [salariedUsers, payrollConfig]);
  
   const handleProcessPayroll = async () => {
    if (!salariedUsers.length || !coaLedgers) {
      toast({ variant: 'destructive', title: 'Data Missing', description: 'Cannot process payroll without employee or accounts data.' });
      return;
    }
    
    setIsProcessing(true);

    const currentMonthYear = format(new Date(), 'MMMM yyyy');
    const narrationForMonth = `Salary for the month of ${currentMonthYear}`;
    
    // Check if payroll JV for this month already exists
    const q = query(collection(firestore, 'journalVouchers'), where('narration', '==', narrationForMonth), limit(1));
    const existingJv = await getDocs(q);
    
    if (!existingJv.empty) {
        toast({
            variant: 'destructive',
            title: 'Payroll Already Processed',
            description: `A payroll journal voucher for ${currentMonthYear} already exists.`,
        });
        setIsProcessing(false);
        return;
    }
    
    let totalGross = 0;
    let totalNetPayable = 0;
    let totalPF = 0;
    let totalESI = 0; // Assuming ESI might be added later
    let totalPT = 0;
    let totalTDS = 0;

    salariedUsers.forEach(user => {
      const salary = getSalaryDetails(user, 0, payrollConfig); // OT pay is 0 for this JV
      totalGross += salary.grossSalary;
      totalNetPayable += salary.netSalary;
      totalPF += salary.deductions.pf;
      totalPT += salary.deductions.professionalTax;
      totalTDS += salary.deductions.tds;
    });
    
    const salaryLedger = coaLedgers.find(l => l.name === 'Salaries & Wages');
    const salaryPayableLedger = coaLedgers.find(l => l.name === 'Salary Payable');
    const pfPayableLedger = coaLedgers.find(l => l.name === 'PF Payable');
    const ptPayableLedger = coaLedgers.find(l => l.name === 'Professional Tax Payable');
    const tdsPayableLedger = coaLedgers.find(l => l.name === 'TDS Payable');

    if (!salaryLedger || !salaryPayableLedger || !pfPayableLedger || !ptPayableLedger || !tdsPayableLedger) {
        toast({ variant: 'destructive', title: 'Accounts Missing', description: 'One or more required payroll ledgers are not found in your Chart of Accounts.'});
        setIsProcessing(false);
        return;
    }
    
    const jvEntries = [
        { accountId: salaryLedger.id, debit: totalGross, credit: 0 },
        { accountId: salaryPayableLedger.id, debit: 0, credit: totalNetPayable },
        { accountId: pfPayableLedger.id, debit: 0, credit: totalPF },
        { accountId: ptPayableLedger.id, debit: 0, credit: totalPT },
        { accountId: tdsPayableLedger.id, debit: 0, credit: totalTDS },
    ].filter(e => e.debit > 0 || e.credit > 0);

    const jvData = {
        date: format(new Date(), 'yyyy-MM-dd'),
        narration: narrationForMonth,
        voucherType: 'Journal Voucher',
        entries: jvEntries,
        createdAt: serverTimestamp(),
    };

    try {
        await addDoc(collection(firestore, 'journalVouchers'), jvData);
        toast({ title: 'Payroll Processed', description: 'Journal voucher for this month\'s salary has been created.' });
    } catch(e) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Processing Failed' });
    } finally {
        setIsProcessing(false);
    }
  };


  return (
    <>
      <PageHeader title="Payroll">
         <Button onClick={handleProcessPayroll} disabled={isProcessing}>
          {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Process Payroll for {format(new Date(), 'MMMM')}
        </Button>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Net Payroll</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(totalNet)}</div>
            <p className="text-xs text-muted-foreground">For the current pay period.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salariedUsers.length}</div>
            <p className="text-xs text-muted-foreground">Included in this payroll run.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deductions</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(totalDeductions)}</div>
            <p className="text-xs text-muted-foreground">Includes PF and Professional Tax.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Overtime Pay</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(totalOtPay)}</div>
            <p className="text-xs text-muted-foreground">Based on recorded overtime hours.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee Salary Details</CardTitle>
          <CardDescription>
            An overview of employee salaries for the current pay period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"><span className="sr-only">Toggle</span></TableHead>
                <TableHead className="w-[40%]">Employee</TableHead>
                <TableHead>Salary Structure</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            {(usersLoading || companyInfoLoading) ? (
              <TableBody>
                <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading payroll data...</TableCell></TableRow>
              </TableBody>
            ) : salariedUsers.map((user) => (
                <PayrollRow 
                    key={user.id} 
                    user={user} 
                    payrollConfig={payrollConfig}
                />
            ))}
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

