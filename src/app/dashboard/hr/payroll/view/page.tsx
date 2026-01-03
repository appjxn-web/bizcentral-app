
'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Download, Loader2, Printer } from 'lucide-react';
import { format, endOfMonth } from 'date-fns';
import { useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { CompanyInfo, PayrollConfig, User } from '@/lib/types';


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


const companyDetails = {
  name: 'JXN Infra Equipment Private Limited',
  logo: 'https://placehold.co/350x80/eee/ccc.png?text=Your+Logo',
};

const formatIndianCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num || 0);
};

const getSalaryDetails = (user: User, payrollConfig: PayrollConfig | undefined) => {
    const details = (user as any).salaryDetails || {};
    const ctc = details.ctc || 0;
    const monthlyConfig = payrollConfig?.monthly || { basicPercent: 50, hraPercent: 40, pfContributionPercent: 12, professionalTax: 200 };
    
    let grossSalary = 0;
    if (details.type === 'monthly') {
        grossSalary = ctc / 12;
    } 

    const basic = grossSalary * (monthlyConfig.basicPercent / 100);
    const hra = basic * (monthlyConfig.hraPercent / 100);
    const specialAllowance = grossSalary - basic - hra;
    
    let tds = 0;
    if (details.tdsEnabled) {
        const annualGross = (ctc || (details.hourlyRate || 0) * 8 * 26 * 12); 
        const tdsRate = details.tdsRate || 0;
        const annualTds = annualGross * (tdsRate / 100);
        tds = annualTds / 12;
    }
    
    const pf = (details?.pfEnabled && details.type === 'monthly') ? basic * (monthlyConfig.pfContributionPercent / 100) : 0;
    const professionalTax = (details.type === 'monthly') ? monthlyConfig.professionalTax : 0;

    const totalDeductions = pf + professionalTax + tds;

    return {
        annualCTC: ctc,
        grossSalary,
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
        netSalary: grossSalary - totalDeductions,
        type: details.type || 'monthly',
        hourlyRate: details.hourlyRate || 0,
        basicHourlyRate: details.basicHourlyRate || 0,
        skills: details.skills || [],
        allowances: details.allowances || [],
    };
};

export default function PayslipViewPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [payslipData, setPayslipData] = React.useState<any>(null);
    const [isPrinting, setIsPrinting] = React.useState(false);
    const pdfRef = React.useRef<HTMLDivElement>(null);

    const firestore = useFirestore();
    const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(doc(firestore, 'company', 'info'));
    
    React.useEffect(() => {
        const data = localStorage.getItem('payslipData');
        if (data) {
            setPayslipData(JSON.parse(data));
        } else {
            // Redirect or show error if no data is found
        }
    }, []);

    const handlePrint = async () => {
        const element = pdfRef.current;
        if (!element) return;
        setIsPrinting(true);
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = imgWidth / imgHeight;
        let imgPdfWidth = pdfWidth;
        let imgPdfHeight = pdfWidth / ratio;
        if (imgPdfHeight > pdfHeight) {
            imgPdfHeight = pdfHeight;
            imgPdfWidth = pdfHeight * ratio;
        }
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgPdfHeight);
        pdf.save(`Payslip-${payslipData.user.name}-${payslipData.payPeriod}.pdf`);
        setIsPrinting(false);
    };
    
    if (!payslipData || companyInfoLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-2">Loading report data...</p>
            </div>
        )
    }
    
    const { user, attendanceLog, payPeriod } = payslipData;
    const salary = getSalaryDetails(user, companyInfo?.payrollConfig);
    const totalHours = attendanceLog?.reduce((acc: number, log: any) => acc + (log.totalHours || 0), 0) || 0;
    const totalStdHours = attendanceLog?.reduce((acc: number, log: any) => acc + (log.standardHours || 0), 0) || 0;
    const otMultipliers = companyInfo?.payrollConfig?.overtime || { slot1Multiplier: 1.5, slot2Multiplier: 2.0, slot3Multiplier: 2.5 };

    const dailyEarningsData = (attendanceLog || []).map((log: any) => {
        const standardEarning = (log.standardHours || 0) * salary.basicHourlyRate;
        const skillEarning = (log.standardHours || 0) * (salary.hourlyRate - salary.basicHourlyRate);
        const otHours = log.otHours || 0;
        let otEarning = 0;
        
        if (otHours > 0) {
            let remainingOt = otHours;
            const slot1Hours = Math.min(remainingOt, 2);
            otEarning += slot1Hours * salary.hourlyRate * otMultipliers.slot1Multiplier;
            remainingOt -= slot1Hours;

            const slot2Hours = Math.min(remainingOt, 2);
            otEarning += slot2Hours * salary.hourlyRate * otMultipliers.slot2Multiplier;
            remainingOt -= slot2Hours;

            if (remainingOt > 0) {
                otEarning += remainingOt * salary.hourlyRate * otMultipliers.slot3Multiplier;
            }
        }

        const totalDailyEarning = standardEarning + skillEarning + otEarning;
        return {
            ...log,
            slot1: Math.min(otHours, 2),
            slot2: Math.min(Math.max(0, otHours - 2), 2),
            slot3: Math.max(0, otHours - 4),
            totalDailyEarning: totalDailyEarning,
        };
    });

    const totalOtPay = dailyEarningsData.reduce((sum, day) => {
        const otHours = day.otHours || 0;
        let otEarning = 0;
        if (otHours > 0) {
            let remainingOt = otHours;
            const slot1Hours = Math.min(remainingOt, 2);
            otEarning += slot1Hours * salary.hourlyRate * otMultipliers.slot1Multiplier;
            remainingOt -= slot1Hours;

            if (remainingOt > 0) {
                const slot2Hours = Math.min(remainingOt, 2);
                otEarning += slot2Hours * salary.hourlyRate * otMultipliers.slot2Multiplier;
                remainingOt -= slot2Hours;
            }

            if (remainingOt > 0) {
                otEarning += remainingOt * salary.hourlyRate * otMultipliers.slot3Multiplier;
            }
        }
        return sum + otEarning;
    }, 0);
    
    const totalCalculatedEarnings = salary.type === 'monthly'
        ? salary.grossSalary + totalOtPay
        : dailyEarningsData.reduce((sum, day) => sum + day.totalDailyEarning, 0);

    const totalWithdrawals = dailyEarningsData.reduce((acc, log) => acc + (log.withdrawal || 0), 0);
    const openingBalance = (user as any).salaryDetails?.openingBalance || 0;
    const totalDeductions = salary.deductions.totalDeductions + totalWithdrawals;
    const netSalary = totalCalculatedEarnings + openingBalance - totalDeductions;
    
    const totalOtHours = dailyEarningsData.reduce((acc, log) => acc + (log.otHours || 0), 0);
    const totalOtSlot1 = dailyEarningsData.reduce((acc, log) => acc + log.slot1, 0);
    const totalOtSlot2 = dailyEarningsData.reduce((acc, log) => acc + log.slot2, 0);
    const totalOtSlot3 = dailyEarningsData.reduce((acc, log) => acc + log.slot3, 0);

    const primaryAddress = user.addresses?.[0];

  return (
    <>
      <PageHeader title={`Payslip for ${payPeriod}`}>
        <Button onClick={handlePrint} disabled={isPrinting}>
          {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
          Print Payslip
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="p-4 sm:p-6 md:p-8">
          <div ref={pdfRef} className="p-4 bg-white text-black">
            <header className="flex justify-between items-start border-b pb-4">
              <div className="w-[150px]">
                <Image src={companyInfo?.logo || companyDetails.logo} alt="Company Logo" width={150} height={50} />
              </div>
              <div className="text-right">
                <h1 className="text-2xl font-bold">{companyInfo?.companyName || companyDetails.name}</h1>
                <h2 className="text-lg font-semibold text-gray-700">Salary Slip for {payPeriod}</h2>
                 <p><strong>Pay Date:</strong> {format(endOfMonth(new Date()), 'MMMM do, yyyy')}</p>
                 <p><strong>Salary Structure:</strong> <span className="capitalize">{salary.type}</span></p>
              </div>
            </header>
            
            <section className="my-6 grid grid-cols-2 gap-4 text-sm">
               <div>
                <p><strong>Employee Name:</strong> {user.name}</p>
                <p><strong>Designation:</strong> {user.role}</p>
                 {primaryAddress && (
                  <div className="text-xs mt-1">
                    <p className="font-semibold">Address:</p>
                    <p>{[primaryAddress.line1, primaryAddress.line2].filter(Boolean).join(', ')}</p>
                    <p>{primaryAddress.city}-{primaryAddress.pin}, {primaryAddress.district}, {primaryAddress.state}, {primaryAddress.country}</p>
                  </div>
                )}
              </div>
               <div className="text-right">
                    <p><strong>Mobile:</strong> {user.mobile}</p>
                    <p><strong>Email:</strong> {user.email}</p>
                    {user.pan && <p><strong>PAN:</strong> {user.pan}</p>}
               </div>
            </section>
            
            <section className="grid grid-cols-2 gap-8 my-6">
              <div>
                <h3 className="font-bold text-base mb-2 underline">Earnings</h3>
                <Table>
                  <TableBody>
                    {openingBalance > 0 && <TableRow><TableCell>Opening Balance</TableCell><TableCell className="text-right">{formatIndianCurrency(openingBalance)}</TableCell></TableRow>}
                    {salary.type === 'monthly' ? (
                        <>
                            <TableRow><TableCell>Basic Salary</TableCell><TableCell className="text-right">{formatIndianCurrency(salary.earnings.basic)}</TableCell></TableRow>
                            <TableRow><TableCell>House Rent Allowance (HRA)</TableCell><TableCell className="text-right">{formatIndianCurrency(salary.earnings.hra)}</TableCell></TableRow>
                            <TableRow><TableCell>Special Allowance</TableCell><TableCell className="text-right">{formatIndianCurrency(salary.earnings.specialAllowance)}</TableCell></TableRow>
                            <TableRow><TableCell>Overtime Pay</TableCell><TableCell className="text-right">{formatIndianCurrency(totalOtPay)}</TableCell></TableRow>
                        </>
                    ) : (
                        <>
                            <TableRow><TableCell>Standard Hours Pay ({totalStdHours.toFixed(2)} hrs @ ₹{salary.basicHourlyRate}/hr)</TableCell><TableCell className="text-right">{formatIndianCurrency(totalStdHours * salary.basicHourlyRate)}</TableCell></TableRow>
                            {salary.skills?.map((skill: any, i: number) => (
                                <TableRow key={i}><TableCell>{skill.skill} Pay ({totalStdHours.toFixed(2)} hrs @ ₹{skill.rate}/hr)</TableCell><TableCell className="text-right">{formatIndianCurrency(skill.rate * totalStdHours)}</TableCell></TableRow>
                            ))}
                            <TableRow><TableCell>Overtime Pay ({totalOtHours.toFixed(2)} hrs)</TableCell><TableCell className="text-right">{formatIndianCurrency(totalOtPay)}</TableCell></TableRow>
                             {salary.allowances?.map((allowance: any, i: number) => (
                                <TableRow key={i}><TableCell>{allowance.name} Allowance</TableCell><TableCell className="text-right">{formatIndianCurrency(allowance.value)}</TableCell></TableRow>
                            ))}
                        </>
                    )}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-bold bg-gray-100"><TableCell>Gross Earnings</TableCell><TableCell className="text-right">{formatIndianCurrency(totalCalculatedEarnings)}</TableCell></TableRow>
                  </TableFooter>
                </Table>
              </div>
              <div>
                <h3 className="font-bold text-base mb-2 underline">Deductions</h3>
                <Table>
                  <TableBody>
                    <TableRow><TableCell>Provident Fund (PF)</TableCell><TableCell className="text-right">{formatIndianCurrency(salary.deductions.pf)}</TableCell></TableRow>
                    <TableRow><TableCell>Professional Tax</TableCell><TableCell className="text-right">{formatIndianCurrency(salary.deductions.professionalTax)}</TableCell></TableRow>
                    <TableRow><TableCell>TDS</TableCell><TableCell className="text-right">{formatIndianCurrency(salary.deductions.tds)}</TableCell></TableRow>
                    {totalWithdrawals > 0 && <TableRow><TableCell>Salary Advance / Withdrawal</TableCell><TableCell className="text-right">{formatIndianCurrency(totalWithdrawals)}</TableCell></TableRow>}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-bold bg-gray-100"><TableCell>Total Deductions</TableCell><TableCell className="text-right">{formatIndianCurrency(totalDeductions)}</TableCell></TableRow>
                  </TableFooter>
                </Table>
              </div>
            </section>
            
            <section className="my-6 p-4 bg-blue-50 border border-blue-200 rounded-md text-center">
              <p className="text-lg font-semibold">Net Salary Payable</p>
              <p className="text-3xl font-bold text-blue-700">{formatIndianCurrency(netSalary)}</p>
            </section>

            <Separator />
            
            <section className="my-6">
              <h3 className="font-bold text-base mb-2 underline">Attendance Log for {payPeriod}</h3>
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
                  {dailyEarningsData?.map((log: any) => {
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
                  })}
                </TableBody>
                <TableFooter>
                    <TableRow className="font-bold bg-gray-100 dark:bg-gray-800">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{totalStdHours.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{totalOtSlot1.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{totalOtSlot2.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{totalOtSlot3.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{(totalHours).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatIndianCurrency(dailyEarningsData.reduce((acc: any, log: any) => acc + log.totalDailyEarning, 0))}</TableCell>
                        <TableCell className="text-right font-mono">{formatIndianCurrency(totalWithdrawals)}</TableCell>
                    </TableRow>
                </TableFooter>
              </Table>
            </section>
            
            <footer className="text-center text-xs text-gray-500 pt-8 mt-8 border-t">
              <p>This is a computer-generated payslip and does not require a signature.</p>
            </footer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
