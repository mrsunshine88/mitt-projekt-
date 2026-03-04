"use client";

import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2, RefreshCw, Car, Zap, Clock, CalendarDays, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogEventDialog } from '@/components/log-event-dialog';
import { AddVehicleDialog } from '@/components/add-vehicle-dialog';
import { EditVehicleDialog } from '@/components/edit-vehicle-dialog';
import { PublishVehicleDialog } from '@/components/publish-vehicle-dialog';
import { TransferOwnershipDialog } from '@/components/transfer-ownership-dialog';
import { HistoryList } from '@/components/history-list';
import { VehicleCard } from '@/components/vehicle-card';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, getDoc, orderBy, setDoc } from 'firebase/firestore';
import { VehicleLog, Vehicle } from '@/types/autolog';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { differenceInDays, parseISO } from 'date-fns';

export default function Dashboard() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [isEditVehicleOpen, setIsEditVehicleOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClaiming, setIsClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  const vehiclesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'users', user.uid, 'vehicles'), where('ownerId', '==', user.uid));
  }, [db, user]);

  const { data: vehicles, isLoading: isVehiclesLoading } = useCollection<Vehicle>(vehiclesQuery);

  useEffect(() => {
    const syncAll = async () => {
      if (db && user && vehicles && vehicles.length > 0) {
        for (const v of vehicles) {
          if (v.licensePlate) {
            const plate = v.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const globalRef = doc(db, 'allVehicles', plate);
            
            setDoc(globalRef, {
              licensePlate: plate,
              make: v.make,
              model: v.model,
              year: v.year,
              currentOdometerReading: v.currentOdometerReading,
              ownerId: user.uid,
              updatedAt: serverTimestamp()
            }, { merge: true }).catch(err => console.error("Sync error:", err));
          }
        }
      }
    };
    syncAll();
  }, [db, user, vehicles]);

  const globalOwnedQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'allVehicles'), where('ownerId', '==', user.uid));
  }, [db, user]);

  const { data: globalOwned, isLoading: isGlobalLoading } = useCollection<any>(globalOwnedQuery);

  const pendingVehicles = (globalOwned || []).filter(gv => 
    !vehicles?.some(v => v.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '') === gv.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  );

  const activeVehicle = vehicles?.find(v => v.status !== 'sold');

  const handleSyncManually = async () => {
    if (!db || !user || !vehicles || vehicles.length === 0) return;
    setIsSyncing(true);
    try {
      for (const v of vehicles) {
        const plate = v.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        await setDoc(doc(db, 'allVehicles', plate), {
          licensePlate: plate,
          make: v.make,
          model: v.model,
          year: v.year,
          currentOdometerReading: v.currentOdometerReading,
          ownerId: user.uid,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      toast({ title: "Synkroniserad!", description: "Dina bilar är nu sökbara för verkstäder." });
    } catch (err) {
      toast({ variant: "destructive", title: "Synk misslyckades" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClaimVehicle = async (globalVehicle: any) => {
    if (!user || !db) return;
    setIsClaiming(globalVehicle.id);
    
    try {
      const plate = globalVehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const listingRef = doc(db, 'public_listings', plate);
      const listingSnap = await getDoc(listingRef);
      const listingData = listingSnap.exists() ? listingSnap.data() : {};

      const vehicleData: Partial<Vehicle> = {
        ...listingData,
        licensePlate: plate,
        ownerId: user.uid,
        isPublished: false,
        status: 'private',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'users', user.uid, 'vehicles'), vehicleData);
      
      toast({
        title: "Bilen tillagd!",
        description: `${plate} finns nu i ditt garage.`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Kunde inte hämta bil", description: err.message });
    } finally {
      setIsClaiming(null);
    }
  };

  const handleAddLog = async (newLog: Partial<VehicleLog>) => {
    if (!user || !activeVehicle || !db) return;
    
    const plate = activeVehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const logsRef = collection(db, 'vehicleHistory', plate, 'logs');
    const isInspection = newLog.category === 'Besiktning';
    
    await addDoc(logsRef, {
      vehicleId: activeVehicle.id,
      licensePlate: plate,
      creatorId: user.uid,
      category: newLog.category,
      eventDate: newLog.date,
      odometerReading: newLog.odometer,
      cost: newLog.cost || null,
      notes: newLog.notes,
      type: newLog.type || 'Update',
      performedBy: newLog.performedBy || 'Owner',
      verificationSource: newLog.verificationSource || 'User',
      isVerifiedByWorkshop: !!newLog.isVerified,
      documentProofUrls: newLog.photoUrl ? [newLog.photoUrl] : [],
      createdAt: serverTimestamp(),
    });

    const updates: any = {
      currentOdometerReading: Math.max(activeVehicle.currentOdometerReading, newLog.odometer || 0),
      updatedAt: serverTimestamp(),
    };

    if (isInspection) {
      updates.inspectionFloorOdometer = Math.max(activeVehicle.inspectionFloorOdometer || 0, newLog.odometer || 0);
    }

    if (newLog.category === 'Service') {
      const nextDate = new Date();
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      updates.nextServiceDate = nextDate.toISOString().split('T')[0];
    }

    const vehicleRef = doc(db, 'users', user.uid, 'vehicles', activeVehicle.id);
    const globalRef = doc(db, 'allVehicles', plate);
    await updateDoc(vehicleRef, updates);
    await updateDoc(globalRef, updates);

    setIsLogDialogOpen(false);
    toast({ title: "Händelse sparad", description: "Historiken har uppdaterats permanent." });
  };

  const daysToService = useMemo(() => {
    if (!activeVehicle?.nextServiceDate) return null;
    const diff = differenceInDays(parseISO(activeVehicle.nextServiceDate), new Date());
    return diff;
  }, [activeVehicle?.nextServiceDate]);

  if (isUserLoading || isVehiclesLoading || isGlobalLoading || !db) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary opacity-20" /></div>;
  }

  if (!user) return null;

  return (
    <div className="container max-w-2xl mx-auto px-4 py-6 pb-32">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-headline font-bold">Garage</h1>
          <p className="text-sm text-muted-foreground">Hantera dina fordon</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSyncManually} disabled={isSyncing} className="text-[10px] h-10 px-4 uppercase font-bold tracking-widest bg-white/5 rounded-full">
          {isSyncing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          Synka
        </Button>
      </header>

      {pendingVehicles.length > 0 && (
        <section className="mb-8 space-y-4">
          {pendingVehicles.map(pv => (
            <Card key={pv.id} className="bg-primary/5 border-primary/20 rounded-2xl overflow-hidden shadow-lg animate-in zoom-in-95 duration-500">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Car className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base leading-none">{pv.licensePlate}</h3>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">Väntar på dig</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => handleClaimVehicle(pv)} disabled={!!isClaiming} className="rounded-full h-10 px-4 font-bold">
                  Lägg till
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {activeVehicle ? (
        <div className="space-y-6">
          <VehicleCard vehicle={activeVehicle} />

          {daysToService !== null && (
            <Alert className={`rounded-2xl border-none shadow-md ${daysToService < 30 ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-500'}`}>
              <Clock className="h-4 w-4" />
              <AlertTitle className="text-xs font-bold uppercase tracking-widest mb-1">Service på väg</AlertTitle>
              <AlertDescription className="text-sm font-medium">
                Det är ca <strong>{daysToService} dagar</strong> kvar till nästa service.
              </AlertDescription>
            </Alert>
          )}

          <section>
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-lg font-headline font-bold flex items-center gap-2">
                <History className="w-5 h-5 opacity-40" />
                Historik
              </h2>
              <Badge variant="outline" className="bg-white text-black font-bold uppercase px-3 h-6 border-2">{activeVehicle.licensePlate}</Badge>
            </div>
            <RealtimeHistoryList licensePlate={activeVehicle.licensePlate} />
          </section>
        </div>
      ) : (
        <div className="text-center py-20 bg-white/5 rounded-3xl border-dashed border-2 border-white/10 flex flex-col items-center gap-4">
          <Car className="w-12 h-12 opacity-20" />
          <p className="text-muted-foreground text-sm px-8">Inget aktivt fordon i ditt garage ännu.</p>
          <Button onClick={() => setIsAddVehicleOpen(true)} className="rounded-full h-14 px-8 font-bold text-lg shadow-xl shadow-primary/20">
            Lägg till din bil
          </Button>
        </div>
      )}

      {/* FAB - Fixed Action Button for mobile */}
      <Button 
        size="icon"
        className="fixed bottom-6 right-6 h-16 w-16 rounded-full shadow-2xl z-50 shadow-primary/40 active:scale-90 transition-transform md:h-20 md:w-20"
        onClick={() => activeVehicle ? setIsLogDialogOpen(true) : setIsAddVehicleOpen(true)}
      >
        <Plus className="w-8 h-8 md:w-10 md:h-10" />
      </Button>

      <LogEventDialog 
        isOpen={isLogDialogOpen} 
        onClose={() => setIsLogDialogOpen(false)} 
        onSubmit={handleAddLog}
        currentOdometer={activeVehicle?.currentOdometerReading}
        inspectionFloor={activeVehicle?.inspectionFloorOdometer}
        licensePlate={activeVehicle?.licensePlate}
      />

      <AddVehicleDialog isOpen={isAddVehicleOpen} onClose={() => setIsAddVehicleOpen(false)} />
      {activeVehicle && (
        <>
          <EditVehicleDialog isOpen={isEditVehicleOpen} onClose={() => setIsEditVehicleOpen(false)} vehicle={activeVehicle} />
          <PublishVehicleDialog isOpen={isPublishDialogOpen} onClose={() => setIsPublishDialogOpen(false)} vehicle={activeVehicle} />
          <TransferOwnershipDialog isOpen={isTransferDialogOpen} onClose={() => setIsTransferDialogOpen(false)} vehicle={activeVehicle} />
        </>
      )}
    </div>
  );
}

function RealtimeHistoryList({ licensePlate }: { licensePlate: string }) {
  const db = useFirestore();
  const logsQuery = useMemoFirebase(() => {
    if (!db || !licensePlate) return null;
    const plate = licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return query(collection(db, 'vehicleHistory', plate, 'logs'), orderBy('eventDate', 'desc'));
  }, [db, licensePlate]);

  const { data: logs, isLoading } = useCollection(logsQuery);
  if (isLoading) return <div className="flex justify-center py-10 opacity-20"><Loader2 className="animate-spin h-6 w-6" /></div>;

  const formattedLogs: VehicleLog[] = (logs || []).map(l => ({
    id: l.id,
    category: l.category,
    date: l.eventDate || '',
    odometer: l.odometerReading || 0,
    cost: l.cost,
    notes: l.notes || '',
    type: l.type || 'Update',
    performedBy: l.performedBy || 'Owner',
    isVerified: l.isVerifiedByWorkshop || false,
    verificationSource: l.verificationSource || 'User',
    photoUrl: l.documentProofUrls?.[0]
  }));

  return <HistoryList logs={formattedLogs} showPrivateData={true} />;
}