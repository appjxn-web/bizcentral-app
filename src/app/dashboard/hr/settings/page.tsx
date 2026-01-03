

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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MapPin, LocateFixed, Loader2, FileUp, Camera, Percent, User, Clock, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { User as UserType, UserRole, CompanyInfo, PayrollConfig, AttendanceConfig } from '@/lib/types';
import { ReviseSalaryDialog } from './_components/revise-salary-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GoogleMapsProvider } from '@/app/_components/google-map-provider';
import { Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';


function HRSettingsPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const companyInfoRef = doc(firestore, 'company', 'info');
  const { data: companyInfo, loading: companyInfoLoading } = useDoc<CompanyInfo>(companyInfoRef);
  const { data: allUsers, loading: usersLoading } = useCollection<UserType>(collection(firestore, 'users'));
  
  // States from original component
  const [latitude, setLatitude] = React.useState('');
  const [longitude, setLongitude] = React.useState('');
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserType | null>(null);

  // New state for payroll settings
  const [payrollConfig, setPayrollConfig] = React.useState<Partial<PayrollConfig>>({
    monthly: {
      basicPercent: 50,
      hraPercent: 40,
      pfContributionPercent: 12,
      professionalTax: 200,
    },
    hourly: {
      defaultRate: 200,
    },
    overtime: {
      slot1Multiplier: 1.5,
      slot2Multiplier: 2.0,
      slot3Multiplier: 2.5,
    },
  });
  
  // State for Auto Punch settings
  const [attendanceConfig, setAttendanceConfig] = React.useState<Partial<AttendanceConfig>>({
    autoPunchOutForLunch: false,
    punchInGracePeriod: 0,
    lunchOutTime: '13:00',
    lunchInTime: '13:30',
  });

  const [isSaving, setIsSaving] = React.useState(false);

  const salariedRoles: UserRole[] = [
    'Admin', 'Manager', 'Employee', 'CEO', 'Sales Manager', 'Production Manager',
    'Purchase Manager', 'Service Manager', 'Accounts Manager', 'HR Manager'
  ];
  
  const salariedUsers = React.useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter(user => salariedRoles.includes(user.role));
  }, [allUsers]);

  React.useEffect(() => {
    if (companyInfo) {
        if(companyInfo.latitude) setLatitude(companyInfo.latitude.toString());
        if(companyInfo.longitude) setLongitude(companyInfo.longitude.toString());
        if (companyInfo.payrollConfig) {
            setPayrollConfig(companyInfo.payrollConfig);
        }
        if (companyInfo.attendanceConfig) {
            setAttendanceConfig(companyInfo.attendanceConfig);
        }
    }
  }, [companyInfo]);


  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude.toString());
          setLongitude(position.coords.longitude.toString());
          toast({
            title: 'Location Fetched',
            description: 'Your current location has been updated.',
          });
        },
        (error) => {
          console.error("Error getting location: ", error);
          toast({
            variant: 'destructive',
            title: 'Location Error',
            description:
              'Could not fetch your current location. Please check your browser permissions.',
          });
        }
      );
    } else {
      toast({
        variant: 'destructive',
        title: 'Geolocation not supported',
        description: 'Your browser does not support geolocation.',
      });
    }
  };
  
    const mapCenter = {
    lat: latitude ? parseFloat(latitude) : 20.5937,
    lng: longitude ? parseFloat(longitude) : 78.9629,
  };


  const handleReviseClick = (user: UserType) => {
    setSelectedUser(user);
    setIsRevisionDialogOpen(true);
  };
  
  const handlePayrollConfigChange = (section: 'monthly' | 'hourly' | 'overtime', field: string, value: number) => {
    setPayrollConfig(prev => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        [field]: value
      }
    }));
  };
  
  const handleSavePayrollSettings = async () => {
    setIsSaving(true);
    try {
        await setDoc(companyInfoRef, { payrollConfig }, { merge: true });
        toast({
            title: "Settings Saved",
            description: "Payroll and overtime structure has been updated."
        });
    } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: "Save Failed" });
    } finally {
        setIsSaving(false);
    }
  };

  const handleAttendanceConfigChange = (field: keyof AttendanceConfig, value: string | number | boolean) => {
    setAttendanceConfig(prev => ({
        ...prev,
        [field]: value,
    }));
  };

  const handleSaveAutoPunchSettings = async () => {
    setIsSaving(true);
    try {
        await setDoc(companyInfoRef, { attendanceConfig }, { merge: true });
        toast({
            title: 'Auto Punch Settings Saved',
            description: 'Your attendance rules have been updated successfully.',
        });
    } catch (e) {
        console.error("Error saving auto punch settings:", e);
        toast({ variant: 'destructive', title: 'Save Failed' });
    } finally {
        setIsSaving(false);
    }
  };

  const handleLocationSave = async () => {
    if (!latitude || !longitude) {
      toast({ variant: 'destructive', title: 'Missing Coordinates', description: 'Please set a location on the map first.' });
      return;
    }
    setIsSaving(true);
    try {
      await setDoc(companyInfoRef, {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      }, { merge: true });
      toast({ title: 'Location Saved', description: 'Company geo-fence location has been updated.' });
    } catch (error) {
      console.error('Error saving location:', error);
      toast({ variant: 'destructive', title: 'Save Failed' });
    } finally {
        setIsSaving(false);
    }
  };

  const getSalaryDisplay = (user: UserType) => {
    const details = (user as any).salaryDetails;
    if (!details) return 'N/A';
    if (details.type === 'monthly') {
        return `₹${details.ctc?.toLocaleString() || 0} / year`;
    }
    return `₹${details.hourlyRate?.toFixed(2) || 0} / hour`;
  };

  if (usersLoading || companyInfoLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin h-8 w-8" /></div>
  }

  return (
    <>
      <PageHeader title="HR Settings" />
      <Accordion
        type="single"
        collapsible
        defaultValue="geo-location"
        className="w-full space-y-4"
      >
        <AccordionItem value="geo-location">
          <Card>
            <AccordionTrigger className="p-6">
              <div className="text-left">
                <CardTitle>Geo Location</CardTitle>
                <CardDescription className="mt-2">
                  Set your company's location for attendance geo-fencing.
                </CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleLocationSave(); }}>
                  <div className="aspect-video w-full bg-muted rounded-lg">
                           <GoogleMapsProvider>
                                <Map
                                    style={{ width: '100%', height: '100%' }}
                                    defaultCenter={mapCenter}
                                    defaultZoom={latitude && longitude ? 15 : 4}
                                    gestureHandling={'greedy'}
                                    disableDefaultUI={true}
                                    mapId={'f9d3a95f7a52e6a3'}
                                >
                                    {latitude && longitude && (
                                        <AdvancedMarker
                                            position={mapCenter}
                                            draggable={true}
                                            onDragEnd={(e) => {
                                                const newLat = e.latLng?.lat();
                                                const newLng = e.latLng?.lng();
                                                if (newLat && newLng) {
                                                    setLatitude(newLat.toString());
                                                    setLongitude(newLng.toString());
                                                }
                                            }}
                                        >
                                            <MapPin className="h-8 w-8 text-primary" />
                                        </AdvancedMarker>
                                    )}
                                </Map>
                            </GoogleMapsProvider>
                        </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="latitude">Office Latitude</Label>
                      <Input
                        id="latitude"
                        placeholder="e.g., 26.8467"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="longitude">Office Longitude</Label>
                      <Input
                        id="longitude"
                        placeholder="e.g., 80.9462"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Location
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGetCurrentLocation}
                    >
                      <LocateFixed className="mr-2 h-4 w-4" />
                      Use My Current Location
                    </Button>
                  </div>
                </form>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
        <AccordionItem value="auto-punch">
          <Card>
            <AccordionTrigger className="p-6">
              <div className="text-left">
                <CardTitle>Auto Punch Settings</CardTitle>
                <CardDescription className="mt-2">
                  Configure automatic attendance rules for your employees.
                </CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSaveAutoPunchSettings(); }}>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label htmlFor="auto-punch-out-lunch">
                        Auto Punch Out for Lunch
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically clock out employees at a specific time for lunch.
                      </p>
                    </div>
                    <Switch
                      id="auto-punch-out-lunch"
                      checked={attendanceConfig.autoPunchOutForLunch}
                      onCheckedChange={(checked) => handleAttendanceConfigChange('autoPunchOutForLunch', checked)}
                    />
                  </div>
                  {attendanceConfig.autoPunchOutForLunch && (
                    <div className="grid grid-cols-2 gap-4 pl-4">
                        <div className="space-y-2">
                            <Label htmlFor="lunch-out-time">Punch Out Time</Label>
                            <Input id="lunch-out-time" type="time" value={attendanceConfig.lunchOutTime} onChange={(e) => handleAttendanceConfigChange('lunchOutTime', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lunch-in-time">Punch In Time</Label>
                            <Input id="lunch-in-time" type="time" value={attendanceConfig.lunchInTime} onChange={(e) => handleAttendanceConfigChange('lunchInTime', e.target.value)} />
                        </div>
                    </div>
                  )}
                   <div className="space-y-2 rounded-lg border p-4">
                      <Label htmlFor="punch-in-grace">Punch-in Grace Period (minutes)</Label>
                       <p className="text-sm text-muted-foreground pb-2">
                        Allow employees a grace period for their morning punch-in.
                      </p>
                      <Input id="punch-in-grace" type="number" value={attendanceConfig.punchInGracePeriod} onChange={(e) => handleAttendanceConfigChange('punchInGracePeriod', Number(e.target.value))} />
                  </div>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Auto Punch Settings
                  </Button>
                </form>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
        <AccordionItem value="salary-structure">
          <Card>
            <AccordionTrigger className="p-6">
              <div className="text-left">
                <CardTitle>Salary &amp; Overtime Structure</CardTitle>
                <CardDescription className="mt-2">
                  Define salary components and overtime rules for employees.
                </CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <Tabs defaultValue="monthly">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="monthly">Monthly Structure</TabsTrigger>
                    <TabsTrigger value="hourly">Hourly Rate</TabsTrigger>
                  </TabsList>
                  <TabsContent value="monthly" className="pt-4">
                     <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSavePayrollSettings(); }}>
                        <div>
                            <h4 className="text-md font-medium mb-2">Earnings</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border p-4">
                                <div className="space-y-2">
                                    <Label htmlFor="basic-percent">Basic Salary (% of CTC)</Label>
                                    <div className="relative">
                                        <Input id="basic-percent" type="number" value={payrollConfig.monthly?.basicPercent || ''} onChange={(e) => handlePayrollConfigChange('monthly', 'basicPercent', Number(e.target.value))} className="pr-8" />
                                        <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hra-percent">HRA (% of Basic)</Label>
                                     <div className="relative">
                                        <Input id="hra-percent" type="number" value={payrollConfig.monthly?.hraPercent || ''} onChange={(e) => handlePayrollConfigChange('monthly', 'hraPercent', Number(e.target.value))} className="pr-8" />
                                        <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Special Allowance</Label>
                                    <Input value="Calculated automatically (CTC - Basic - HRA)" disabled />
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-md font-medium mb-2">Deductions</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border p-4">
                               <div className="space-y-2">
                                    <Label>Provident Fund (% of Basic)</Label>
                                    <div className="relative">
                                        <Input type="number" value={payrollConfig.monthly?.pfContributionPercent || ''} onChange={(e) => handlePayrollConfigChange('monthly', 'pfContributionPercent', Number(e.target.value))} className="pr-8" />
                                        <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="prof-tax">Professional Tax (₹ per month)</Label>
                                    <Input id="prof-tax" type="number" value={payrollConfig.monthly?.professionalTax || ''} onChange={(e) => handlePayrollConfigChange('monthly', 'professionalTax', Number(e.target.value))} />
                                </div>
                            </div>
                        </div>
                        <Button type="submit" disabled={isSaving}>
                          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save Monthly Structure
                        </Button>
                     </form>
                  </TabsContent>
                  <TabsContent value="hourly" className="pt-4">
                    <form className="space-y-4 max-w-sm" onSubmit={(e) => { e.preventDefault(); handleSavePayrollSettings(); }}>
                        <div className="space-y-2">
                            <Label htmlFor="hourly-rate">Default Hourly Rate (₹)</Label>
                            <Input id="hourly-rate" type="number" value={payrollConfig.hourly?.defaultRate || ''} onChange={(e) => handlePayrollConfigChange('hourly', 'defaultRate', Number(e.target.value))} />
                        </div>
                        <Button type="submit" disabled={isSaving}>
                          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save Hourly Rate
                        </Button>
                    </form>
                  </TabsContent>
                </Tabs>

                <form className="mt-6 pt-6 border-t" onSubmit={(e) => { e.preventDefault(); handleSavePayrollSettings(); }}>
                    <h4 className="text-md font-medium mb-2">Overtime Settings</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                        Define pay multipliers for overtime work performed after the standard 8-hour duty.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border p-4">
                         <div className="space-y-2">
                            <Label htmlFor="ot-slot-1">1st Slot: First 2 Hours</Label>
                            <div className="relative">
                                <Input id="ot-slot-1" type="number" step="0.1" value={payrollConfig.overtime?.slot1Multiplier || ''} onChange={(e) => handlePayrollConfigChange('overtime', 'slot1Multiplier', Number(e.target.value))} />
                                <span className="absolute right-2.5 top-2.5 text-sm text-muted-foreground">x</span>
                            </div>
                         </div>
                         <div className="space-y-2">
                            <Label htmlFor="ot-slot-2">2nd Slot: Next 2 Hours</Label>
                            <div className="relative">
                                <Input id="ot-slot-2" type="number" step="0.1" value={payrollConfig.overtime?.slot2Multiplier || ''} onChange={(e) => handlePayrollConfigChange('overtime', 'slot2Multiplier', Number(e.target.value))} />
                                <span className="absolute right-2.5 top-2.5 text-sm text-muted-foreground">x</span>
                            </div>
                         </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="ot-slot-3">3rd Slot: Next 4 Hours</Label>
                            <div className="relative">
                                <Input id="ot-slot-3" type="number" step="0.1" value={payrollConfig.overtime?.slot3Multiplier || ''} onChange={(e) => handlePayrollConfigChange('overtime', 'slot3Multiplier', Number(e.target.value))} />
                                <span className="absolute right-2.5 top-2.5 text-sm text-muted-foreground">x</span>
                            </div>
                         </div>
                    </div>
                    <Button className="mt-4" type="submit" disabled={isSaving}>
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Overtime Settings
                    </Button>
                </form>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
         <AccordionItem value="salary-revisions">
          <Card>
            <AccordionTrigger className="p-6">
              <div className="text-left">
                <CardTitle>Salary Revisions</CardTitle>
                <CardDescription className="mt-2">
                  Manage and record salary changes for employees.
                </CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Current Salary</TableHead>
                            <TableHead>Last Revision</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {usersLoading ? (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                        ) : salariedUsers.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src={(user as any).avatar} />
                                        <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-medium">{user.name}</div>
                                        <div className="text-sm text-muted-foreground">{user.role}</div>
                                    </div>
                                    </div>
                                </TableCell>
                                <TableCell className="font-mono">{getSalaryDisplay(user)}</TableCell>
                                <TableCell>{(user as any).salaryDetails?.lastRevised ? format(new Date((user as any).salaryDetails.lastRevised), 'PPP') : 'N/A'}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => handleReviseClick(user)}>
                                        Revise
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>
      <ReviseSalaryDialog 
        user={selectedUser}
        open={isRevisionDialogOpen}
        onOpenChange={setIsRevisionDialogOpen}
      />
    </>
  );
}


export default function HRSettingsPage() {
    const [isClient, setIsClient] = React.useState(false);

    React.useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return null;
    }

    return <HRSettingsPageContent />;
}

    
