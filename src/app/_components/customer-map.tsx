
'use client';

import * as React from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { Location, PickupPoint } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { LocateFixed, Loader2, AlertCircle, Building, Handshake } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

function CurrentLocationButton() {
  const map = useMap();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast({
        variant: 'destructive',
        title: 'Geolocation not supported',
        description: 'Your browser does not support location services.',
      });
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        if (map) {
          map.moveCamera({ center: { lat, lng }, zoom: 12 });
          
           toast({
            title: 'Location Found',
            description: 'The map has been centered on your current location.',
          });
        }
        setLoading(false);
      },
      (error) => {
        toast({
          variant: 'destructive',
          title: 'Location Error',
          description: 'Could not fetch your location. Please check your browser permissions.',
        });
        setLoading(false);
      }
    );
  };
  
  return (
      <Button
        size="icon"
        variant="secondary"
        className="absolute bottom-4 right-4 shadow-lg"
        onClick={handleGetLocation}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
        <span className="sr-only">My Location</span>
      </Button>
  );
}

function MapErrorDisplay({ error }: { error: any }) {
  const isApiNotActivated = error?.message?.includes('ApiNotActivatedMapError');
  // Explicitly check for AuthFailure using a case-insensitive regex
  const isAuthFailure = /AuthFailure/i.test(error?.message || '');
  
  if (isAuthFailure) {
    return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold">Google Maps API Key Error</h3>
            <p className="text-muted-foreground mb-4">
                The map failed to load due to an authentication issue. This usually happens when the API key is not authorized for the current website URL.
            </p>
             <p className="text-sm text-muted-foreground mb-4">
               To fix this, go to your Google Cloud Console, find your Maps API Key, and add your preview URL to the list of allowed "Website restrictions".
            </p>
            <a 
            href="https://console.cloud.google.com/google/maps-apis/credentials" 
            target="_blank" 
            rel="noopener noreferrer"
            >
                <Button>Go to Google Cloud Credentials</Button>
            </a>
      </div>
    )
  }

  if (isApiNotActivated) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">Google Maps API Not Activated</h3>
        <p className="text-muted-foreground mb-4">
          The "Maps JavaScript API" is not enabled for your project. Please enable it in the Google Cloud Console to display the map.
        </p>
        <a 
          href="https://console.cloud.google.com/google/maps-apis/overview" 
          target="_blank" 
          rel="noopener noreferrer"
        >
            <Button>Enable Maps API</Button>
        </a>
      </div>
    );
  }

  return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">Map Loading Error</h3>
        <p className="text-muted-foreground">
          An unexpected error occurred while loading the map.
        </p>
        <pre className="mt-2 text-xs text-left bg-muted p-2 rounded-md overflow-auto">
          {error?.message || 'No error message available.'}
        </pre>
      </div>
  );
}


export function CustomerMap() {
  const [selectedLocation, setSelectedLocation] = React.useState<(Location & { isPartner?: boolean }) | null>(null);
  const [locations, setLocations] = React.useState<(Location & { isPartner?: boolean })[]>([]);
  const [locationsLoading, setLocationsLoading] = React.useState(true);
  const [locationsError, setLocationsError] = React.useState<any>(null);
  const [mapError, setMapError] = React.useState<any>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  React.useEffect(() => {
    async function fetchLocations() {
      if (!apiKey) {
        setLocationsLoading(false);
        return;
      }
      try {
        const { firestore } = initializeFirebase();
        const locationsQuery = collection(firestore, 'locations');
        const pickupPointsQuery = query(collection(firestore, 'pickupPoints'), where('active', '==', true));
        
        const [locationsSnapshot, pickupPointsSnapshot] = await Promise.all([
            getDocs(locationsQuery),
            getDocs(pickupPointsQuery)
        ]);

        const fetchedCustomerLocations = locationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Location[];
        const fetchedPartnerLocations = pickupPointsSnapshot.docs.map(doc => {
            const data = doc.data() as PickupPoint;
            return {
                id: doc.id,
                name: data.name,
                latitude: data.lat || 0,
                longitude: data.lng || 0,
                isPartner: true
            };
        }) as (Location & { isPartner: boolean })[];

        const combinedLocations = [...fetchedCustomerLocations, ...fetchedPartnerLocations];
        setLocations(combinedLocations);

      } catch (error) {
        console.error("Error fetching locations:", error);
        setLocationsError(error);
      } finally {
        setLocationsLoading(false);
      }
    }
    fetchLocations();
  }, [apiKey]);
  
  const center = React.useMemo(() => {
    if (!locations || locations.length === 0) return { lat: 20.5937, lng: 78.9629 }; // Default to India center
    
    const validLocations = locations.filter(l => typeof l.latitude === 'number' && typeof l.longitude === 'number');
    if (validLocations.length === 0) return { lat: 20.5937, lng: 78.9629 };
    
    return {
      lat: validLocations.reduce((sum, c) => sum + c.latitude, 0) / validLocations.length,
      lng: validLocations.reduce((sum, c) => sum + c.longitude, 0) / validLocations.length,
    }
  }, [locations]);
  
  const zoom = !locations || locations.length === 0 ? 4 : 5;
  
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-2xl font-bold tracking-tight">Where Our Machines Run</h2>
      <p className="text-muted-foreground">
        A look at our customer and partner locations across the map.
      </p>
      <div className="relative w-full h-[75vh] md:h-[500px] bg-muted md:rounded-lg overflow-hidden border">
        {!apiKey ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold">API Key Missing</h3>
            <p className="text-muted-foreground">
              Google Maps API key is missing. Please add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to your .env file to display the map.
            </p>
          </div>
        ) : mapError || locationsError ? (
           <MapErrorDisplay error={mapError || locationsError} />
        ) : locationsLoading ? (
           <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <APIProvider apiKey={apiKey} onApiLoadError={(error) => setMapError(error)}>
            <Map
              style={{ width: '100%', height: '100%' }}
              defaultCenter={center}
              defaultZoom={zoom}
              gestureHandling={'cooperative'}
              disableDefaultUI={true}
              mapId={'f9d3a95f7a52e6a3'}
              onClick={() => setSelectedLocation(null)}
            >
              {locations?.map((location) => (
                    location.latitude && location.longitude && (
                        <AdvancedMarker
                            key={location.id}
                            position={{ lat: location.latitude, lng: location.longitude }}
                            onClick={() => setSelectedLocation(location)}
                        >
                           {location.isPartner ? (
                                <Handshake className="h-6 w-6 text-green-600 drop-shadow-lg" />
                            ) : (
                                <Building className="h-6 w-6 text-primary drop-shadow-lg" />
                            )}
                        </AdvancedMarker>
                    )
              ))}

              {selectedLocation && (
                <InfoWindow
                  position={{ lat: selectedLocation.latitude!, lng: selectedLocation.longitude! }}
                  onCloseClick={() => setSelectedLocation(null)}
                >
                  <div className="p-1 font-medium">
                    <p>{selectedLocation.name}</p>
                    {selectedLocation.isPartner && <p className="text-xs text-green-600">Partner Location</p>}
                  </div>
                </InfoWindow>
              )}
            </Map>
            <CurrentLocationButton />
          </APIProvider>
        )}
      </div>
    </div>
  );
}
