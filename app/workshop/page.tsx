
"use client";

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useMemoFirebase, useDoc, useCollection } from '@/firebase';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Wrench, ShieldCheck, Loader2, Gauge, Calendar, RefreshCw, Edit3, Trash2, List, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LogEventDialog } from '@/components/log-event-dialog';
import { VehicleLog, UserProfile } from '@/types/autolog';
import { firebaseConfig } from '@/firebase/config';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Image from 'next/image';

export default function WorkshopPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;
  
  const [searchPlate, setSearchPlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicle, setVehicle] = useState<any>(null);
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<VehicleLog | null>(null);
  const [servicedVehicles, setServicedVehicles] = useState<any[]>([]);
  const [loadingServiced, setLoadingServiced] = useState(false);
  const [isHistoryListOpen, setIsHistoryListOpen] = useState(false);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'artifacts', appId, 'users', user.uid, 'profiles', 'user-profile');
  }, [db, user, appId]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const fetchServicedCars = async () => {
    if (!db || !user) return;
    setLoadingServiced(true);
    try {
      const customersRef = collection(db, 'artifacts', appId, 'public', 'data', 'workshops', user.uid, 'servicedCars');
      const snap = await getDocs(customersRef);
      const results: any[] = [];
      snap.forEach(d => results.push({ ...d.data(), id: d.id }));
      setServicedVehicles(results);
    } catch (e) {
      console.error("Kunde inte hämta kundlista:", e);
    } finally {
      setLoadingServiced(false);
    }
  };

  useEffect(() => {
    fetchServicedCars();
  }, [db, user, appId]);

  const handleSearch = async (e?: React.FormEvent, plate?: string) => {
    if (e) e.preventDefault();
    const targetPlate = plate || searchPlate;
    if (!db || !targetPlate) return;
    
    setLoading(true);
    setVehicle(null);
    try {
      const cleanPlate = targetPlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', cleanPlate);
      const globalSnap = await getDoc(globalRef);
      if (globalSnap.exists()) {
        setVehicle({ ...globalSnap.data(), id: cleanPlate, licensePlate: cleanPlate });
        setSearchPlate(cleanPlate);
        setIsHistoryListOpen(false);
      } else {
        toast({ variant: "destructive", title: "Fordon hittades ej", description: "Kontrollera registreringsnumret." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Sökfel" });
    } finally { setLoading(false); }
  };

  const handleLogSubmit = async (newLog: Partial<VehicleLog>) => {
    if (!user || !vehicle || !db) return;
    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const batch = writeBatch(db);
      
      const logData = {
        vehicleId: plate,
        licensePlate: plate,
        ownerId: vehicle.ownerId || null,
        creatorId: user.uid,
        creatorName: profile?.name || 'Verkstad',
        category: newLog.category,
        date: newLog.date,
        odometer: newLog.odometer,
        cost: newLog.cost || null,
        notes: newLog.notes || '',
        photoUrl: newLog.photoUrl || null,
        isVerified: newLog.isVerified || false,
        approvalStatus: 'pending',
        verificationSource: newLog.verificationSource || 'Workshop',
        createdAt: serverTimestamp(),
      };

      if (editingLog && editingLog.id) {
        const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', editingLog.id);
        batch.update(logRef, { 
          ...logData, 
          updatedAt: serverTimestamp() 
        });
      } else {
        const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
        const newLogRef = doc(logsRef);
        batch.set(newLogRef, logData);
        
        const customerRef = doc(db, 'artifacts', appId, 'public', 'data', 'workshops', user.uid, 'servicedCars', plate);
        batch.set(customerRef, {
          id: plate,
          licensePlate: plate,
          make: vehicle.make,
          model: vehicle.model,
          mainImage: vehicle.mainImage || null,
          lastServicedAt: serverTimestamp()
        }, { merge: true });

        // Automatisk mätaruppdatering från verkstaden
        if (newLog.odometer && newLog.odometer > vehicle.currentOdometerReading) {
          const vehicleRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
          const vehicleUpdates: any = {
            currentOdometerReading: newLog.odometer,
            updatedAt: serverTimestamp(),
          };
          
          // Om verkstaden loggar Besiktning, låses golvet direkt
          if (newLog.category === 'Besiktning') {
            vehicleUpdates.inspectionFloorOdometer = newLog.odometer;
          }
          
          batch.update(vehicleRef, vehicleUpdates);
        }

        if (vehicle.ownerId) {
          const notificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', `${plate}_${user.uid}`);
          batch.set(notificationRef, {
            ownerId: vehicle.ownerId,
            plate: plate,
            workshopId: user.uid,
            createdAt: serverTimestamp()
          });
        }
      }
      
      await batch.commit();
      toast({ title: editingLog ? "Ändring sparad!" : "Service registrerad!" });
      fetchServicedCars();
      setIsLogDialogOpen(false);
      setEditingLog(null);
    } catch (error: any) { toast({ variant: "destructive", title: "Fel", description: error.message }); }
  };

  const handleDeleteLog = async (log: VehicleLog) => {
    if (!db || !vehicle || !user || !log.id) return;
    
    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', log.id);
      
      await deleteDoc(logRef);
      
      try {
        const notificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', `${plate}_${user.uid}`);
        await deleteDoc(notificationRef);
      } catch (e) {}

      toast({ title: "Registrering raderad." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Kunde inte radera", description: e.message });
    }
  };

  if (isUserLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 pb-32">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-headline font-bold text-white">Verkstadspanel</h1>
          <p className="text-muted-foreground">Hantera fordonshistorik med digitala stämplar.</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setIsHistoryListOpen(true)}
          className="h-14 rounded-2xl bg-white/5 border-white/10 px-6 font-bold"
        >
          <List className="w-5 h-5 mr-2" /> Mina hanterade fordon
        </Button>
      </header>

      <div className="space-y-8">
        <Card className="glass-card border-white/5 rounded-3xl">
          <CardContent className="pt-6">
            <form onSubmit={(e) => handleSearch(e)} className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  placeholder="Reg-nr (t.ex. ABC 123)" 
                  className="pl-12 uppercase h-14 rounded-2xl bg-white/5 border-white/10 text-lg font-bold" 
                  value={searchPlate} 
                  onChange={(e) => setSearchPlate(e.target.value)} 
                />
              </div>
              <Button type="submit" disabled={loading} className="px-10 font-bold h-14 rounded-2xl text-lg shadow-xl shadow-primary/20">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sök fordon"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {vehicle && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <Card className="glass-card border-primary/20 overflow-hidden rounded-[2.5rem] shadow-2xl">
              <div className="bg-primary/10 px-8 py-6 border-b border-primary/20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-xl font-headline font-bold">{vehicle.make} {vehicle.model}</h3>
                </div>
                <Badge className="text-2xl font-mono px-4 py-1.5 bg-white text-black border-2 border-slate-300 rounded-lg">
                  {vehicle.licensePlate}
                </Badge>
              </div>
              
              <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Mätarställning</p>
                    <div className="flex items-center gap-2 text-2xl font-bold">
                      <Gauge className="w-5 h-5 text-primary" /> {vehicle.currentOdometerReading?.toLocaleString()} mil
                    </div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Årsmodell</p>
                    <div className="flex items-center gap-2 text-2xl font-bold">
                      <Calendar className="w-5 h-5 text-accent" /> {vehicle.year}
                    </div>
                  </div>
                </div>

                <Button 
                  className="w-full h-20 text-2xl font-bold rounded-2xl shadow-2xl shadow-primary/30" 
                  onClick={() => { setEditingLog(null); setIsLogDialogOpen(true); }}
                >
                  <ShieldCheck className="w-8 h-8 mr-3" /> Registrera ny händelse
                </Button>

                <div className="pt-4">
                  <h3 className="text-lg font-bold mb-6">Senaste historik för fordonet</h3>
                  <RealtimeHistoryList 
                    licensePlate={vehicle.licensePlate} 
                    appId={appId} 
                    currentUserId={user?.uid}
                    onEdit={(log: VehicleLog) => { setEditingLog(log); setIsLogDialogOpen(true); }}
                    onDelete={handleDeleteLog}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={isHistoryListOpen} onOpenChange={setIsHistoryListOpen}>
        <DialogContent className="glass-card border-white/10 rounded-[2rem] sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline">Mina hanterade fordon</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-4">
            {loadingServiced ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
            ) : servicedVehicles.length > 0 ? (
              servicedVehicles.map(v => (
                <button 
                  key={v.id} 
                  onClick={() => handleSearch(undefined, v.licensePlate)}
                  className="w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 flex items-center gap-4 group"
                >
                  <div className="h-12 w-12 rounded-xl overflow-hidden bg-white/5 shrink-0 relative border border-white/10">
                    {v.mainImage ? (
                      <Image src={v.mainImage} alt="" fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-20"><Wrench className="w-5 h-5" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{v.make} {v.model}</p>
                    <Badge variant="outline" className="mt-1 font-mono text-[10px] tracking-widest">{v.licensePlate}</Badge>
                  </div>
                  <ArrowRight className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-all mr-2" />
                </button>
              ))
            ) : (
              <p className="text-center py-10 text-muted-foreground italic">Du har inte registrerat service på några fordon än.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {vehicle && (
        <LogEventDialog 
          isOpen={isLogDialogOpen} 
          onClose={() => { setIsLogDialogOpen(false); setEditingLog(null); }} 
          onSubmit={handleLogSubmit} 
          currentOdometer={vehicle?.currentOdometerReading} 
          userType="Workshop" 
          initialData={editingLog || undefined} 
        />
      )}
    </div>
  );
}

function RealtimeHistoryList({ licensePlate, appId, currentUserId, onEdit, onDelete }: any) {
  const db = useFirestore();
  const logsQuery = useMemoFirebase(() => {
    if (!db || !licensePlate) return null;
    const plate = licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
  }, [db, licensePlate, appId]);
  
  const { data: logs, isLoading } = useCollection<VehicleLog>(logsQuery);
  const sortedLogs = useMemo(() => logs ? [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [], [logs]);
  
  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin h-8 w-8 text-primary opacity-20" /></div>;
  
  return (
    <div className="space-y-4">
      {sortedLogs.map((log: any) => {
        // En verkstad kan endast ändra loggar de själva skapat.
        const canModify = currentUserId === log.creatorId;

        return (
          <Card key={log.id} className={`glass-card border-none overflow-hidden ${log.approvalStatus === 'pending' ? 'ring-1 ring-yellow-500/20' : ''}`}>
            <div className="p-4 flex justify-between items-center">
              <div className="flex gap-4 items-center">
                <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-primary">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm">
                    {log.category} 
                    {log.approvalStatus === 'pending' && <span className="text-[10px] text-yellow-500 ml-2 uppercase font-black">Väntar...</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{log.date} • {log.odometer} mil</p>
                </div>
              </div>
              {canModify && (
                <div className="flex gap-2 relative z-50">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEdit(log);
                    }} 
                    className="h-10 w-10 rounded-full hover:bg-white/10"
                  >
                    <Edit3 className="w-4 h-4 opacity-40 hover:opacity-100" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(log);
                    }} 
                    className="h-10 w-10 rounded-full text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 opacity-40 hover:opacity-100" />
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}
      {sortedLogs.length === 0 && <p className="text-center py-10 text-muted-foreground text-sm">Ingen historik registrerad.</p>}
    </div>
  );
}
