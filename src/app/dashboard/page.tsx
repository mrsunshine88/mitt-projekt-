
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2, Megaphone, Lock, Trash2, HandCoins, Car, Edit3, ShieldCheck, Clock, CalendarDays, Zap } from 'lucide-react';
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
import { collection, query, where, addDoc, serverTimestamp, doc, updateDoc, writeBatch, getDoc, orderBy } from 'firebase/firestore';
import { VehicleLog, Vehicle } from '@/types/autolog';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
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
  const [isUnpublishing, setIsUnpublishing] = useState(false);
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

  const globalOwnedQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'allVehicles'), where('ownerId', '==', user.uid));
  }, [db, user]);

  const { data: globalOwned, isLoading: isGlobalLoading } = useCollection<any>(globalOwnedQuery);

  const pendingVehicles = (globalOwned || []).filter(gv => 
    !vehicles?.some(v => v.licensePlate.toUpperCase().replace(/\s/g, '') === gv.licensePlate.toUpperCase().replace(/\s/g, ''))
  );

  const activeVehicle = vehicles?.find(v => v.status !== 'sold');

  const handleClaimVehicle = async (globalVehicle: any) => {
    if (!user || !db) return;
    setIsClaiming(globalVehicle.id);
    
    try {
      const listingRef = doc(db, 'public_listings', globalVehicle.id);
      const listingSnap = await getDoc(listingRef);
      const listingData = listingSnap.exists() ? listingSnap.data() : {};

      const vehicleData: Partial<Vehicle> = {
        ...listingData,
        licensePlate: globalVehicle.licensePlate,
        ownerId: user.uid,
        isPublished: false,
        status: 'private',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'users', user.uid, 'vehicles'), vehicleData);
      
      toast({
        title: "Bilen tillagd!",
        description: `${globalVehicle.licensePlate} finns nu i ditt garage.`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Kunde inte hämta bil", description: err.message });
    } finally {
      setIsClaiming(null);
    }
  };

  const handleAddLog = async (newLog: Partial<VehicleLog>) => {
    if (!user || !activeVehicle || !db) return;
    
    const logsRef = collection(db, 'vehicleHistory', activeVehicle.licensePlate, 'logs');
    const isInspection = newLog.category === 'Besiktning';
    
    addDoc(logsRef, {
      vehicleId: activeVehicle.id,
      licensePlate: activeVehicle.licensePlate,
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
    }).catch(async (err) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: logsRef.path,
        operation: 'create',
        requestResourceData: newLog
      }));
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
    const globalRef = doc(db, 'allVehicles', activeVehicle.licensePlate);
    updateDoc(vehicleRef, updates).catch(() => {});
    updateDoc(globalRef, updates).catch(() => {});

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
      {pendingVehicles.length > 0 && (
        <section className="mb-8">
          {pendingVehicles.map(pv => (
            <Card key={pv.id} className="bg-primary/5 border-primary/20 rounded-2xl overflow-hidden shadow-lg animate-in zoom-in-95 duration-500">
              <CardContent className="p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Car className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg uppercase leading-none">{pv.licensePlate}</h3>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">Ägarbyte väntar</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => handleClaimVehicle(pv)} disabled={!!isClaiming} className="rounded-full h-10 px-6">
                  {isClaiming === pv.id ? <Loader2 className="animate-spin h-4 w-4" /> : <Zap className="h-4 w-4 mr-2" />}
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
                Det är ca <strong>{daysToService} dagar</strong> kvar till nästa planerade service.
              </AlertDescription>
            </Alert>
          )}

          <section>
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-lg font-headline font-bold">Servicehistorik</h2>
              <Badge variant="outline" className="bg-white text-black font-bold uppercase px-3 h-6">{activeVehicle.licensePlate}</Badge>
            </div>
            <RealtimeHistoryList licensePlate={activeVehicle.licensePlate} />
          </section>
        </div>
      ) : (
        <div className="text-center py-20 bg-white/5 rounded-3xl border-dashed border-2 border-white/10 flex flex-col items-center gap-4">
          <Car className="w-12 h-12 opacity-20" />
          <p className="text-muted-foreground text-sm">Inget aktivt fordon i garaget.</p>
          <Button onClick={() => setIsAddVehicleOpen(true)} className="rounded-full h-12 px-8">
            Lägg till din första bil
          </Button>
        </div>
      )}

      {/* Floating Action Button - Mobile optimized */}
      <Button 
        size="icon"
        className="fixed bottom-6 right-6 h-16 w-16 rounded-full shadow-2xl z-50 shadow-primary/40 active:scale-95 transition-transform"
        onClick={() => activeVehicle ? setIsLogDialogOpen(true) : setIsAddVehicleOpen(true)}
      >
        <Plus className="w-8 h-8" />
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
    return query(collection(db, 'vehicleHistory', licensePlate, 'logs'), orderBy('eventDate', 'desc'));
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
