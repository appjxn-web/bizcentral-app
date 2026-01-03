
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
import { PlayCircle, StopCircle, MapPin, Loader2, AlertCircle, RefreshCcw, Clock, LogIn, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearchParams } from 'next/navigation';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import type { User, Attendance, PunchLog } from '@/lib/types';
import { APIProvider, Map, AdvancedMarker, useMap, InfoWindow } from '@vis.gl/react-google-maps';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';

interface LocationLog {
  latitude: number;
  longitude: number;
  timestamp: any;
}

function MapInner({ log, selectedPin }: { log: LocationLog[], selectedPin: LocationLog | null }) {
    const path = log.map(p => ({ lat: p.latitude, lng: p.longitude }));
    const defaultCenter = { lat: 20.5937, lng: 78.9629 };
    const center = log.length > 0 ? { lat: log[log.length-1].latitude, lng: log[log.length-1].longitude } : defaultCenter;
    const zoom = log.length > 0 ? 15 : 5;
    const map = useMap();

    React.useEffect(() => {
        if (!map) return;
        const polyline = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#FF0000',
            strokeOpacity: 1.0,
            strokeWeight: 2,
        });

        polyline.setMap(map);

        return () => {
            polyline.setMap(null);
        };
    }, [map, path]);

    React.useEffect(() => {
        if (map && selectedPin) {
            map.moveCamera({ center: { lat: selectedPin.latitude, lng: selectedPin.longitude }, zoom: 16 });
        } else if (map && path.length > 0) {
            map.moveCamera({ center: path[path.length - 1], zoom: 15 });
        }
    }, [map, selectedPin, path]);


    return (
      <Map
          mapId={'f9d3a95f7a52e6a3'}
          style={{ width: '100%', height: '100%' }}
          defaultCenter={center}
          defaultZoom={zoom}
          gestureHandling={'greedy'}
          disableDefaultUI={true}
      >
          {path.length > 0 && <AdvancedMarker position={path[path.length - 1]} title={'Current Location'} />}
          {selectedPin && (
            <InfoWindow position={{ lat: selectedPin.latitude, lng: selectedPin.longitude }} onCloseClick={() => { /* This could be handled by parent state */ }}>
                <div>
                    <p className="font-bold">Logged at: {new Date(selectedPin.timestamp).toLocaleTimeString()}</p>
                </div>
            </InfoWindow>
          )}
      </Map>
    )
}


function LiveTrackingMap({ log, selectedPin }: { log: LocationLog[], selectedPin: LocationLog | null }) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        return (
            <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed text-center">
                 <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Google Maps API Key Missing</h3>
                <p className="text-sm text-muted-foreground p-4">
                Please add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to your .env file to display the map.
                </p>
            </div>
        )
    }

    return (
        <APIProvider apiKey={apiKey}>
           <MapInner log={log} selectedPin={selectedPin} />
        </APIProvider>
    )
}

export default function TrackingPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const firestore = useFirestore();

  const userRef = userId ? doc(firestore, 'users', userId) : null;
  const { data: user, loading: userLoading } = useDoc<User>(userRef);
  
  const [selectedDate, setSelectedDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));

  const attendanceDocRef = userRef && selectedDate ? doc(firestore, userRef.path, 'attendance', selectedDate) : null;
  const { data: attendanceData, loading: attendanceLoading } = useDoc<Attendance>(attendanceDocRef);

  const locationLogQuery = attendanceDocRef
    ? query(
        collection(firestore, attendanceDocRef.path, 'locations'),
        orderBy('timestamp', 'asc')
      )
    : null;

  const { data: log, loading: logLoading } = useCollection<LocationLog>(locationLogQuery);
  const [isClient, setIsClient] = React.useState(false);
  const [selectedPin, setSelectedPin] = React.useState<LocationLog | null>(null);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  const { firstPunchIn, lastPunchOut, totalDuration, punches } = React.useMemo(() => {
    if (!attendanceData?.punches) {
      return { firstPunchIn: null, lastPunchOut: null, totalDuration: '00:00:00', punches: [] };
    }

    const firstPunch = attendanceData.punches[0];
    const lastPunch = attendanceData.punches[attendanceData.punches.length - 1];
    
    const firstPunchIn = firstPunch ? format(firstPunch.inTime.toDate(), 'p') : null;
    const lastPunchOut = lastPunch.outTime ? format(lastPunch.outTime.toDate(), 'p') : null;
    
    const totalSeconds = attendanceData.totalHours ? attendanceData.totalHours * 3600 : 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const totalDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    return { firstPunchIn, lastPunchOut, totalDuration, punches: attendanceData.punches };
  }, [attendanceData]);
  
  const handleLogClick = (logEntry: PunchLog) => {
    if (logEntry.inLocation) {
        setSelectedPin({
            latitude: logEntry.inLocation.lat,
            longitude: logEntry.inLocation.lon,
            timestamp: logEntry.inTime.toDate().getTime(),
        });
    }
  }

  if (!isClient || userLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <PageHeader title={`Live Tracking: ${user?.name || 'User'}`}>
        <div className="flex items-center gap-2">
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
      </PageHeader>
      
       <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">First Punch In</CardTitle>
            <LogIn className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{firstPunchIn || 'N/A'}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Punch Out</CardTitle>
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lastPunchOut || 'N/A'}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDuration}</div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Live Map</CardTitle>
            <CardDescription>
                Employee's recorded travel path for {format(new Date(selectedDate), 'PPP')}.
            </CardDescription>
          </CardHeader>
          <CardContent>
             <div className="aspect-video w-full bg-muted rounded-lg flex items-center justify-center overflow-hidden border">
                <LiveTrackingMap log={log || []} selectedPin={selectedPin} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Tracking Log</CardTitle>
            <CardDescription>Location data points for the selected date.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Latitude</TableHead>
                    <TableHead>Longitude</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logLoading || attendanceLoading ? (
                     <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2 inline-block" /> Loading log...
                      </TableCell>
                    </TableRow>
                  ) : punches && punches.length > 0 ? (
                    punches.map((entry, index) => (
                      <TableRow key={index} onClick={() => handleLogClick(entry)} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          {entry.inTime ? new Date(entry.inTime.toDate()).toLocaleTimeString() : 'N/A'}
                        </TableCell>
                        <TableCell>{entry.type}</TableCell>
                        <TableCell>{entry.inLocation?.lat.toFixed(6)}</TableCell>
                        <TableCell>{entry.inLocation?.lon.toFixed(6)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No tracking data available for this day.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

    