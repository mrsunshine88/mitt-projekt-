
"use client";

import { use, useState, useMemo, useEffect } from 'react';
import { ShieldCheck, Gauge, Calendar, ArrowLeft, Loader2, History, FileText, Trash2, Zap, Palette, Wrench, KeyRound, Settings2, XCircle, Award, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HistoryList, calculateOverallTrust, TRUST_CONFIG } from '@/components/history-list';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { doc, collection, updateDoc, deleteDoc, serverTimestamp, writeBatch, onSnapshot } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, VehicleLog, TrustLevel, UserProfile } from '@/types/autolog';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PublishVehicleDialog } from '@/components/publish-vehicle-dialog';
import { EditVehicleDialog } from '@/components/edit-vehicle-dialog';
import { LogEventDialog } from '@/components/log-event-dialog';
import { TransferOwnershipDialog } from '@/components/transfer-ownership-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function PrivateVehicleProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  
  // Dialog States
  const [isEditAdOpen, setIsEditAdOpen] = useState(false);
  const [isEditInfoOpen, setIsEditInfoOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<VehicleLog | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const appId = firebaseConfig.projectId;
  const plate = id.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Kontrollera om vi kom hit via Admin-sök
  const isAdminContext = searchParams.get('mode') === 'admin';

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isVehicleLoading, setIsVehicleLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Vehicle;
        setVehicle({ ...data, id: snap.id });
      } else {
        router.push('/dashboard');
      }
      setIsVehicleLoading(false);
    });
    return () => unsub();
  }, [db, plate, appId, router]);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: profile } = useDoc<UserProfile>(profileRef);

  const logsRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
  }, [db, plate, appId]);
  const { data: rawLogs } = useCollection<VehicleLog>(logsRef);

  const sortedLogs = useMemo(() => {
    if (!rawLogs) return [];
    return [...rawLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [rawLogs]);

  const overallTrust = useMemo((): TrustLevel => {
    return calculateOverallTrust(rawLogs || []);
  }, [rawLogs]);

  const trustInfo = TRUST_CONFIG[overallTrust];
  
  const isHuvudAdmin = user?.email === 'apersson508@gmail.com' || profile?.role === 'Huvudadmin';
  const isOwner = user?.uid === vehicle?.ownerId;

  // Actions
  const handleRemoveAd = async () => {
    if (!user || !db || !vehicle) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), { isPublished: false, updatedAt: serverTimestamp() });
      await batch.commit();
      toast({ title: "Annons borttagen" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleResetTransfer = async () => {
    if (!db || !vehicle) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), { 
        pendingTransferTo: null, 
        pendingTransferFrom: null, 
        updatedAt: serverTimestamp() 
      });
      toast({ title: "Överlåtelse nollställd" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleLogSubmit = async (newLog: Partial<VehicleLog>) => {
    if (!user || !db || !vehicle) return;
    try {
      const batch = writeBatch(db);
      const logData = { 
        ...newLog, 
        vehicleId: plate, 
        licensePlate: plate, 
        creatorId: user.uid, 
        creatorName: user.displayName || 'Ägare', 
        approvalStatus: 'approved',
        updatedAt: serverTimestamp()
      };

      if (editingLog) {
        batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', editingLog.id), logData);
      } else {
        batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs')), { ...logData, createdAt: serverTimestamp() });
      }
      
      const vehicleUpdates: any = { updatedAt: serverTimestamp() };
      
      // Automatisk mätaruppdatering i profilen
      if (newLog.odometer && newLog.odometer > vehicle.currentOdometerReading) {
        vehicleUpdates.currentOdometerReading = newLog.odometer;
        
        // Om det är en Besiktning, låser vi även det nya golvet
        if (newLog.category === 'Besiktning') {
          vehicleUpdates.inspectionFloorOdometer = newLog.odometer;
        }
      }
      
      const newTrust = calculateOverallTrust([...(rawLogs || []), { ...logData, createdAt: { toDate: () => new Date() } } as any]);
      vehicleUpdates.overallTrust = newTrust;

      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), vehicleUpdates);
      
      await batch.commit();
      toast({ 
        title: "Historik uppdaterad", 
        description: newLog.odometer && newLog.odometer > vehicle.currentOdometerReading 
          ? `Mätaren i profilen har uppdaterats till ${newLog.odometer} mil.` 
          : undefined 
      });
      setEditingLog(null);
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleDeleteLog = async (log: VehicleLog) => {
    if (!db || !user || !vehicle) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', log.id));
      toast({ title: "Historikpost raderad" });
    } catch (e: any) { toast({ variant: "destructive", title: "Fel", description: e.message }); }
  };

  const handleDeleteFromGarage = async () => {
    if (!db || !user || !vehicle) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), { ownerId: null, isPublished: false, updatedAt: serverTimestamp() });
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      await batch.commit();
      toast({ title: "Borttagen från garaget" });
      router.push('/dashboard');
    } catch (e: any) { toast({ variant: "destructive", title: "Fel", description: e.message }); } 
    finally { setIsDeleting(false); }
  };

  if (isVehicleLoading) return <div className="flex flex-col items-center justify-center min-h-screen"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  if (!vehicle) return null;

  const images = vehicle?.imageUrls && vehicle.imageUrls.length > 0 ? vehicle.imageUrls : [vehicle?.mainImage || "https://picsum.photos/seed/car/800/600"];

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="container max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => router.push(isAdminContext ? '/admin' : '/dashboard')} className="inline-flex items-center text-xs font-bold text-muted-foreground hover:text-white uppercase tracking-widest transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> {isAdminContext ? 'TILL ADMINPANEL' : 'TILL GARAGET'}
          </button>
          
          <div className="flex items-center gap-3">
            {isOwner && !isAdminContext && (
              <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-1.5 rounded-full uppercase text-[10px] font-black tracking-widest">
                DIN BIL
              </Badge>
            )}
            
            {isHuvudAdmin && isAdminContext && (
              <Badge className="bg-accent text-black px-4 py-1.5 rounded-full uppercase text-[10px] font-black tracking-widest animate-pulse">
                ADMIN-LÄGE
              </Badge>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            {/* Bildspel */}
            <div className="relative rounded-[2.5rem] overflow-hidden glass-card border-none shadow-2xl">
              <Carousel>
                <CarouselContent>
                  {images.map((url, i) => (
                    <CarouselItem key={i}>
                      <div className="relative aspect-[16/10]">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {images.length > 1 && <><CarouselPrevious className="left-6" /><CarouselNext className="right-6" /></>}
              </Carousel>
              <div className="absolute top-8 left-8 flex flex-col gap-2">
                <Badge className={`${trustInfo.bg} ${trustInfo.color} border-none px-6 py-2.5 text-[10px] font-black uppercase rounded-full shadow-xl backdrop-blur-md`}>
                  {trustInfo.emoji} {trustInfo.label}-status
                </Badge>
              </div>
            </div>
            
            {/* Header */}
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
                <div className="space-y-4">
                  <h1 className="text-5xl md:text-7xl font-headline font-bold text-white tracking-tighter">
                    {vehicle.make} <span className="gradient-text">{vehicle.model}</span>
                  </h1>
                  <div className="flex flex-wrap items-center gap-6 mt-6">
                    <span className="flex items-center gap-2.5 font-bold text-sm text-slate-300"><Calendar className="w-5 h-5 text-primary" /> {vehicle.year}</span>
                    <span className="flex items-center gap-2.5 font-bold text-sm text-slate-300"><Gauge className="w-5 h-5 text-accent" /> {vehicle.currentOdometerReading?.toLocaleString()} mil</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="bg-white text-black font-bold px-8 py-2.5 rounded-2xl text-3xl font-mono shadow-2xl border-2 border-slate-300">
                    {vehicle.licensePlate}
                  </div>
                </div>
              </div>

              {/* Tekniska Data & Status */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-2">
                <Card className={`col-span-2 md:col-span-1 ${trustInfo.bg} ${trustInfo.border} border p-5 rounded-[2rem] flex items-center gap-4`}>
                  <div className="text-3xl">{trustInfo.emoji}</div>
                  <div>
                    <p className="text-[10px] font-bold uppercase opacity-60 mb-0.5">CarGuard Profil</p>
                    <p className={`font-black uppercase tracking-tight ${trustInfo.color}`}>{trustInfo.label}</p>
                  </div>
                </Card>
                <Card className="bg-white/5 border-white/5 p-5 rounded-[2rem]">
                  <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Växellåda</p>
                  <p className="font-bold text-white">{vehicle.gearbox || 'Automat'}</p>
                </Card>
                <Card className="bg-white/5 border-white/5 p-5 rounded-[2rem]">
                  <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Bränsle</p>
                  <p className="font-bold text-white">{vehicle.fuelType || 'Bensin'}</p>
                </Card>
                <Card className="bg-white/5 border-white/5 p-5 rounded-[2rem]">
                  <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Effekt</p>
                  <p className="font-bold text-white">{vehicle.hp ? `${vehicle.hp} hk` : '---'}</p>
                </Card>
                <Card className="bg-white/5 border-white/5 p-5 rounded-[2rem]">
                  <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Färg</p>
                  <p className="font-bold text-white">{vehicle.color || '---'}</p>
                </Card>
              </div>

              {/* Historik */}
              <div className="space-y-8 pt-4">
                <div className="flex items-center justify-between px-4">
                  <h2 className="text-3xl font-headline font-bold flex items-center gap-4 text-white">
                    <History className="text-primary w-8 h-8" /> Händelselogg
                  </h2>
                </div>
                <HistoryList 
                  logs={sortedLogs} 
                  showPrivateData={true} 
                  onDelete={handleDeleteLog}
                  onEdit={(log: VehicleLog) => { setEditingLog(log); setIsLogOpen(true); }}
                />
              </div>
            </div>
          </div>
          
          {/* Kontrollcenter (Sidomeny) */}
          <div className="space-y-8">
            <Card className="glass-card sticky top-24 border-white/5 rounded-[3rem] shadow-2xl overflow-hidden p-10 space-y-6">
              <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-center">
                <p className="text-xs font-black text-primary uppercase tracking-widest flex items-center justify-center gap-2">
                  <Award className="w-3 h-3" /> KONTROLLCENTER
                </p>
              </div>
              <div className="grid gap-3">
                <Button className="w-full h-14 rounded-2xl font-bold" onClick={() => { setEditingLog(null); setIsLogOpen(true); }}>
                  <Wrench className="mr-2 w-5 h-5" /> Logga Service
                </Button>
                <Button variant="outline" className="w-full h-14 rounded-2xl font-bold" onClick={() => setIsEditInfoOpen(true)}>
                  <Settings2 className="mr-2 w-5 h-5" /> Redigera Info
                </Button>
                <div className="h-px bg-white/5 my-2" />
                {vehicle.isPublished ? (
                  <>
                    <Button variant="outline" className="w-full h-14 rounded-2xl font-bold border-blue-500/20 text-blue-400" onClick={() => setIsEditAdOpen(true)}><Share2 className="mr-2 w-5 h-5" /> Ändra annons</Button>
                    <Button variant="destructive" className="w-full h-14 rounded-2xl font-bold" onClick={handleRemoveAd}><Trash2 className="mr-2 w-5 h-5" /> Ta bort annons</Button>
                    <Button className={`w-full h-14 rounded-2xl font-bold ${!!vehicle.pendingTransferTo ? 'bg-orange-600' : 'bg-green-600'} text-white`} onClick={() => setIsTransferOpen(true)}>
                      <KeyRound className="mr-2 w-5 h-5" /> {!!vehicle.pendingTransferTo ? 'Ändra köpare' : 'Överlåt bil'}
                    </Button>
                  </>
                ) : (
                  <Button className="w-full h-14 rounded-2xl font-bold bg-blue-600 hover:bg-blue-500" onClick={() => setIsEditAdOpen(true)}><Share2 className="mr-2 w-5 h-5" /> Sälj bil</Button>
                )}
                {vehicle.pendingTransferTo && (
                  <Button variant="outline" className="w-full h-14 rounded-2xl font-bold border-orange-500/20 text-orange-500" onClick={handleResetTransfer}><XCircle className="mr-2 w-5 h-5" /> Nollställ överlåtelse</Button>
                )}
                <Button variant="ghost" className="w-full h-14 rounded-2xl font-bold text-destructive" onClick={() => setIsDeleteDialogOpen(true)}><Trash2 className="mr-2 w-5 h-5" /> Radera från garage</Button>
              </div>
              <div className="pt-4">
                <Button variant="link" className="w-full text-[10px] text-muted-foreground uppercase font-bold" asChild>
                  <a href={`/v/${plate}`} target="_blank">Se hur annonsen ser ut <ArrowLeft className="ml-1 w-3 h-3 rotate-180" /></a>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </main>

      <LogEventDialog 
        isOpen={isLogOpen} 
        onClose={() => { setIsLogOpen(false); setEditingLog(null); }} 
        onSubmit={handleLogSubmit} 
        currentOdometer={vehicle.currentOdometerReading} 
        inspectionFloor={vehicle.inspectionFloorOdometer}
        initialData={editingLog || undefined} 
      />
      <EditVehicleDialog isOpen={isEditInfoOpen} onClose={() => setIsEditInfoOpen(false)} vehicle={vehicle} />
      <PublishVehicleDialog isOpen={isEditAdOpen} onClose={() => setIsEditAdOpen(false)} vehicle={vehicle} />
      <TransferOwnershipDialog isOpen={isTransferOpen} onClose={() => setIsTransferOpen(false)} vehicle={vehicle} />
      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="glass-card border-white/10 rounded-[2.5rem] p-8">
          <AlertDialogHeader><AlertDialogTitle className="text-2xl font-headline text-white">Ta bort fordonet?</AlertDialogTitle><AlertDialogDescription className="text-slate-300">Bilen tas bort från ditt garage men dess historik sparas permanent för framtida ägare.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="h-14 rounded-2xl">Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFromGarage} disabled={isDeleting} className="h-14 rounded-2xl bg-destructive">Bekräfta radering</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
