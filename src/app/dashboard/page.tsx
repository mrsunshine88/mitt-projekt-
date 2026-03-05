"use client";

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, query, where, updateDoc, serverTimestamp, addDoc, writeBatch } from 'firebase/firestore';
import { Vehicle, VehicleLog } from '@/types/autolog';
import { Loader2, Plus, RefreshCw, Gauge, Calendar, ShieldCheck, Car, Wrench, Edit3, Share2, Trash2, KeyRound, History, Zap, Palette, ArrowRight, ShoppingCart } from 'lucide-react';
import { AddVehicleDialog } from '@/components/add-vehicle-dialog';
import { LogEventDialog } from '@/components/log-event-dialog';
import { EditVehicleDialog } from '@/components/edit-vehicle-dialog';
import { PublishVehicleDialog } from '@/components/publish-vehicle-dialog';
import { TransferOwnershipDialog } from '@/components/transfer-ownership-dialog';
import { AcceptTransferDialog } from '@/components/accept-transfer-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { firebaseConfig } from '@/firebase/config';
import { useToast } from '@/hooks/use-toast';
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
import Link from 'next/link';

export default function Dashboard() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [hiddenPlates, setHiddenPlates] = useState<string[]>([]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAcceptOpen, setIsAcceptOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Mina egna bilar (där jag är owner)
  const privateRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return collection(db, 'artifacts', appId, 'users', user.uid, 'vehicles');
  }, [db, user?.uid, appId]);
  const { data: privateVehicles, isLoading: isPrivLoading } = useCollection<Vehicle>(privateRef);

  // 2. Väntande inkommande bilar (där jag är pendingTransferTo)
  const incomingQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'cars'),
      where('pendingTransferTo', '==', user.uid)
    );
  }, [db, user?.uid, appId]);
  const { data: incomingVehicles, isLoading: isIncomingLoading } = useCollection<Vehicle>(incomingQuery);

  const myVehicles = useMemo(() => {
    if (!privateVehicles) return [];
    return privateVehicles.filter(v => {
      const plate = (v.licensePlate || v.id || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      return plate && !hiddenPlates.includes(plate);
    });
  }, [privateVehicles, hiddenPlates]);

  const handleCopyLink = (plate: string) => {
    const cleanPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const url = `${window.location.origin}/v/${cleanPlate}/history`;
    navigator.clipboard.writeText(url);
    toast({ title: "Historiklänk kopierad!" });
  };

  const handleLogSubmit = async (newLog: Partial<VehicleLog>) => {
    if (!user || !db || !selectedVehicle) return;
    try {
      const plate = selectedVehicle.licensePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
      await addDoc(logsRef, { 
        ...newLog, 
        vehicleId: plate, 
        licensePlate: plate, 
        ownerId: user.uid,
        creatorId: user.uid, 
        creatorName: user.displayName || 'Ägare', 
        approvalStatus: 'approved',
        createdAt: serverTimestamp() 
      });
      
      const batch = writeBatch(db);
      const vRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
      const gRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      
      const updates: any = { updatedAt: serverTimestamp() };
      if (newLog.odometer && newLog.odometer > selectedVehicle.currentOdometerReading) {
        updates.currentOdometerReading = newLog.odometer;
      }
      
      batch.update(vRef, updates);
      batch.update(gRef, updates);
      await batch.commit();
      
      toast({ title: "Händelse loggad!" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleUnpublish = async (v: Vehicle) => {
    if (!db || !user) return;
    try {
      const plate = v.licensePlate.toUpperCase().replace(/\s/g, '');
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      const updates = { isPublished: false, price: null, description: null, updatedAt: serverTimestamp() };
      batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate), updates);
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), updates);
      await batch.commit();
      toast({ title: "Annons borttagen!" });
    } catch (e: any) { toast({ variant: "destructive", title: "Fel", description: e.message }); }
  };

  const handleRemoveFromGarage = async () => {
    if (!db || !user || !vehicleToDelete) return;
    setIsDeleting(true);
    const plate = (vehicleToDelete.licensePlate || vehicleToDelete.id || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    try {
      setHiddenPlates(prev => [...prev, plate]);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate));
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      batch.set(globalRef, { ownerId: null, ownerName: null, ownerEmail: null, isPublished: false, pendingTransferTo: null, updatedAt: serverTimestamp() }, { merge: true });
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      await batch.commit();
      toast({ title: "Fordon borttaget" });
      setVehicleToDelete(null);
    } catch (e: any) {
      setHiddenPlates(prev => prev.filter(p => p !== plate));
      toast({ variant: "destructive", title: "Fel vid borttagning", description: e.message });
    } finally { setIsDeleting(false); }
  };

  if (isUserLoading || (isPrivLoading && isIncomingLoading)) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-12 h-12 animate-spin text-primary opacity-40" /></div>;
  }

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8 pb-32">
      <header className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-headline font-bold text-white">Mina bilar</h1>
          <p className="text-muted-foreground">Hantera dina fordon och historik</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="icon" onClick={() => window.location.reload()} className="h-14 rounded-2xl bg-white/5"><RefreshCw className="w-5 h-5" /></Button>
          <Button onClick={() => setIsAddDialogOpen(true)} className="h-14 px-8 rounded-2xl font-bold shadow-xl shadow-primary/20"><Plus className="mr-2 w-6 h-6" /> Lägg till bil</Button>
        </div>
      </header>

      {/* SECTION: Väntande inkommande köp */}
      {incomingVehicles && incomingVehicles.length > 0 && (
        <section className="mb-12 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-xl font-headline font-bold uppercase tracking-widest text-white">Väntande köp</h2>
          </div>
          <div className="grid gap-4">
            {incomingVehicles.map(v => (
              <Card key={v.id} className="glass-card border-red-500/20 bg-red-500/5 overflow-hidden rounded-3xl p-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="bg-white text-black font-bold px-6 py-2 rounded-xl text-2xl border-2 border-slate-300 font-mono shadow-xl">
                      {v.licensePlate}
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white">{v.make} {v.model}</p>
                      <p className="text-sm text-muted-foreground italic">Väntar på att du ska godkänna överlåtelsen</p>
                    </div>
                  </div>
                  <Button 
                    className="h-14 px-10 rounded-2xl font-bold bg-green-600 hover:bg-green-500 text-white shadow-xl"
                    onClick={() => { setSelectedVehicle(v); setIsAcceptOpen(true); }}
                  >
                    <ShoppingCart className="w-5 h-5 mr-2" /> Slutför köp
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {myVehicles.length > 0 ? (
        <div className="grid gap-8">
          {myVehicles.map(v => {
            const displayImage = v.mainImage || (v.imageUrls && v.imageUrls[0]) || 'https://picsum.photos/seed/car/800/600';
            const plate = (v.licensePlate || v.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const isPendingOut = !!v.pendingTransferTo;

            return (
              <div key={v.id} className="relative overflow-hidden rounded-[2.5rem] glass-card border-white/10 group transition-all hover:ring-2 ring-primary/20 shadow-2xl">
                <div className="h-64 relative overflow-hidden">
                  <img src={displayImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                  <div className="absolute top-6 left-6 flex flex-col gap-2">
                    <Badge className="bg-green-500 text-white border-none px-4 py-1.5 shadow-xl font-bold uppercase text-[10px] rounded-full"><ShieldCheck className="w-4 h-4 mr-2" /> AutoLog Verifierad</Badge>
                    {v.isPublished && <Badge className="bg-blue-500 text-white border-none px-4 py-1.5 shadow-xl font-bold uppercase text-[10px] rounded-full">Till salu</Badge>}
                    {isPendingOut && <Badge className="bg-orange-500 text-white border-none px-4 py-1.5 shadow-xl font-bold uppercase text-[10px] rounded-full animate-pulse">Överlåtelse påbörjad</Badge>}
                  </div>
                  <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
                    <div>
                      <h2 className="text-5xl font-headline font-bold text-white leading-none">{v.make}</h2>
                      <p className="text-2xl opacity-80 text-white mt-2">{v.model}</p>
                    </div>
                    <div className="bg-white text-black font-bold px-6 py-2 rounded-xl text-3xl border-2 border-slate-300 font-mono shadow-2xl transform rotate-1">{plate}</div>
                  </div>
                </div>
                <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-900/40 border-t border-white/5">
                  <div className="space-y-1">
                    <p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Mätare</p>
                    <p className="text-xl font-bold text-white flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> {v.currentOdometerReading?.toLocaleString() || 0} mil</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Teknik</p>
                    <p className="text-sm font-bold text-white flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /> {v.hp || '---'} hk / {v.fuelType || '---'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Växellåda</p>
                    <p className="text-sm font-bold text-white flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-400" /> {v.gearbox || '---'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Färg</p>
                    <p className="text-sm font-bold text-white flex items-center gap-2"><Palette className="w-4 h-4 text-pink-400" /> {v.color || '---'}</p>
                  </div>
                </div>
                <div className="p-6 bg-white/5 grid grid-cols-2 md:grid-cols-7 gap-3 border-t border-white/5">
                  <Button asChild variant="outline" className="h-14 rounded-2xl font-bold"><Link href={`/v/${plate}/history`}><History className="w-4 h-4 mr-2" /> Historik</Link></Button>
                  <Button variant="outline" className="h-14 rounded-2xl font-bold" onClick={() => { setSelectedVehicle(v); setIsLogOpen(true); }}><Wrench className="w-4 h-4 mr-2" /> Logga Service</Button>
                  <Button variant="outline" className="h-14 rounded-2xl font-bold" onClick={() => handleCopyLink(plate)}><Share2 className="w-4 h-4 mr-2" /> Dela historik</Button>
                  <Button variant="outline" className="h-14 rounded-2xl font-bold" onClick={() => { setSelectedVehicle(v); setIsEditOpen(true); }}><Edit3 className="w-4 h-4 mr-2" /> Redigera</Button>
                  
                  {v.isPublished ? (
                    <Button variant="destructive" className="h-14 rounded-2xl font-bold" onClick={() => handleUnpublish(v)}><Trash2 className="w-4 h-4 mr-2" /> Ta bort annons</Button>
                  ) : (
                    <Button className="h-14 rounded-2xl font-bold shadow-lg" onClick={() => { setSelectedVehicle(v); setIsPublishOpen(true); }}><Share2 className="w-4 h-4 mr-2" /> Sälj bil</Button>
                  )}

                  {v.isPublished && (
                    <Button 
                      variant="secondary" 
                      className={`h-14 rounded-2xl font-bold ${isPendingOut ? 'bg-orange-600' : 'bg-green-600 hover:bg-green-500'} text-white`} 
                      onClick={() => { setSelectedVehicle(v); setIsTransferOpen(true); }}
                    >
                      <KeyRound className="w-4 h-4 mr-2" /> {isPendingOut ? 'Ändra köpare' : 'Överlåt bil'}
                    </Button>
                  )}
                  
                  <Button variant="ghost" className="h-14 rounded-2xl font-bold text-destructive hover:bg-destructive/10" onClick={() => setVehicleToDelete(v)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-32 glass-card rounded-[3rem] border-2 border-dashed border-white/10 flex flex-col items-center gap-8">
          <Car className="w-16 h-16 opacity-20 text-white" /><p className="text-2xl font-headline font-bold">Garaget är tomt</p>
          <Button size="lg" onClick={() => setIsAddDialogOpen(true)} className="px-12 py-8 rounded-2xl font-bold text-xl shadow-2xl">Lägg till din första bil</Button>
        </div>
      )}

      <AlertDialog open={!!vehicleToDelete} onOpenChange={(open) => !open && setVehicleToDelete(null)}>
        <AlertDialogContent className="glass-card border-white/10 rounded-[2.5rem] p-8">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-headline text-white">Ta bort fordonet?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300 text-base leading-relaxed">
              Bilen tas bort från ditt garage, men dess historik sparas i AutoLog-registret under registreringsnumret <span className="font-bold text-white">{vehicleToDelete?.licensePlate}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-white">Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRemoveFromGarage(); }} disabled={isDeleting} className="h-14 rounded-2xl bg-destructive hover:bg-destructive/90 text-white font-bold shadow-xl shadow-destructive/20">
              {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5 mr-2" />} Bekräfta borttagning
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddVehicleDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
      {selectedVehicle && (<>
        <LogEventDialog isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} onSubmit={handleLogSubmit} currentOdometer={selectedVehicle.currentOdometerReading} licensePlate={selectedVehicle.licensePlate} />
        <EditVehicleDialog isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} vehicle={selectedVehicle} />
        <PublishVehicleDialog isOpen={isPublishOpen} onClose={() => setIsPublishOpen(false)} vehicle={selectedVehicle} />
        <TransferOwnershipDialog isOpen={isTransferOpen} onClose={() => setIsTransferOpen(false)} vehicle={selectedVehicle} />
        <AcceptTransferDialog isOpen={isAcceptOpen} onClose={() => setIsAcceptOpen(false)} vehicle={selectedVehicle} />
      </>)}
    </div>
  );
}