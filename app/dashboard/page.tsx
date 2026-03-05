
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, getDocs, query, where, updateDoc, deleteDoc, serverTimestamp, addDoc, writeBatch } from 'firebase/firestore';
import { Vehicle, VehicleLog } from '@/types/autolog';
import { Loader2, Plus, RefreshCw, Gauge, Calendar, ShieldCheck, Car, Wrench, Edit3, Share2, Trash2, KeyRound, History, Zap, Palette, Check, X, AlertCircle, FileText, Banknote } from 'lucide-react';
import { AddVehicleDialog } from '@/components/add-vehicle-dialog';
import { LogEventDialog } from '@/components/log-event-dialog';
import { EditVehicleDialog } from '@/components/edit-vehicle-dialog';
import { PublishVehicleDialog } from '@/components/publish-vehicle-dialog';
import { TransferOwnershipDialog } from '@/components/transfer-ownership-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { firebaseConfig } from '@/firebase/config';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function Dashboard() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  
  const [recoveredVehicles, setRecoveredVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    async function hardDiscovery() {
      if (!db || !user) return;
      try {
        const carsRef = collection(db, 'artifacts', appId, 'public', 'data', 'cars');
        const q = query(carsRef, where('ownerId', '==', user.uid));
        const snap = await getDocs(q);
        const vehicles: Vehicle[] = [];
        snap.forEach(d => vehicles.push({ ...d.data(), id: d.id } as Vehicle));
        setRecoveredVehicles(vehicles);
      } catch (e) { console.warn("Discovery failed:", e); }
    }
    hardDiscovery();
  }, [db, user, appId]);

  const privateRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return collection(db, 'artifacts', appId, 'users', user.uid, 'vehicles');
  }, [db, user?.uid, appId]);
  
  const { data: privateVehicles, isLoading: isVehiclesLoading } = useCollection<Vehicle>(privateRef);

  const allVehicles = useMemo(() => {
    const combined = [...(privateVehicles || []), ...recoveredVehicles];
    const unique = new Map();
    combined.forEach(v => {
      const plate = (v.licensePlate || v.id || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      if (plate) unique.set(plate, v);
    });
    return Array.from(unique.values()) as Vehicle[];
  }, [privateVehicles, recoveredVehicles]);

  const [pendingLogs, setPendingLogs] = useState<VehicleLog[]>([]);
  
  useEffect(() => {
    if (!db || allVehicles.length === 0) {
      setPendingLogs([]);
      return;
    }
    
    const fetchPending = async () => {
      const allPending: VehicleLog[] = [];
      for (const v of allVehicles) {
        const plate = v.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
        const q = query(logsRef, where('approvalStatus', '==', 'pending'));
        const snap = await getDocs(q);
        snap.forEach(d => allPending.push({ ...d.data(), id: d.id } as VehicleLog));
      }
      setPendingLogs(allPending);
    };
    
    fetchPending();
  }, [db, allVehicles, appId]);

  const handleCopyLink = (plate: string) => {
    const cleanPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const url = `${window.location.origin}/v/${cleanPlate}/history`;
    navigator.clipboard.writeText(url);
    toast({ title: "Historiklänk kopierad!", description: "Köpare kan nu se hela den verifierade historiken direkt." });
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
      
      if (newLog.odometer && newLog.odometer > selectedVehicle.currentOdometerReading) {
        const batch = writeBatch(db);
        const vRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
        const gRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
        batch.update(vRef, { currentOdometerReading: newLog.odometer, updatedAt: serverTimestamp() });
        batch.update(gRef, { currentOdometerReading: newLog.odometer, updatedAt: serverTimestamp() });
        await batch.commit();
      }
      toast({ title: "Händelse loggad!" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleApproveLog = async (log: VehicleLog) => {
    if (!db || !user || !log.id) return;
    try {
      const plate = log.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', log.id);
      
      const batch = writeBatch(db);
      batch.update(logRef, { 
        approvalStatus: 'approved', 
        isVerified: true, 
        isLocked: true,
        updatedAt: serverTimestamp() 
      });

      const notificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', `${plate}_${log.creatorId}`);
      batch.delete(notificationRef);

      const v = allVehicles.find(v => v.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '') === plate);
      if (v && log.odometer > v.currentOdometerReading) {
        const vRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
        const gRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
        batch.update(vRef, { currentOdometerReading: log.odometer });
        batch.update(gRef, { currentOdometerReading: log.odometer });
      }

      await batch.commit();
      setPendingLogs(prev => prev.filter(l => l.id !== log.id));
      toast({ title: "Service godkänd och låst!" });
    } catch (e: any) { toast({ variant: "destructive", title: "Behörighet saknas", description: "Du har inte rättigheter att godkänna detta dokument." }); }
  };

  const handleRejectLog = async (log: VehicleLog) => {
    if (!db || !log.id) return;
    try {
      const plate = log.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', log.id);
      
      const batch = writeBatch(db);
      batch.delete(logRef);
      
      const notificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', `${plate}_${log.creatorId}`);
      batch.delete(notificationRef);

      await batch.commit();
      setPendingLogs(prev => prev.filter(l => l.id !== log.id));
      toast({ title: "Serviceförslag nekat och raderat" });
    } catch (e: any) { toast({ variant: "destructive", title: "Neka misslyckades", description: "Systemet kunde inte ta bort förslaget." }); }
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

  if (isUserLoading || (isVehiclesLoading && allVehicles.length === 0)) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-12 h-12 animate-spin text-primary opacity-40" /></div>;
  }

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8 pb-32">
      <header className="flex items-center justify-between mb-12">
        <div><h1 className="text-4xl font-headline font-bold text-white">Garage</h1><p className="text-muted-foreground">Hantera dina fordon och historik</p></div>
        <div className="flex gap-3">
          <Button variant="outline" size="icon" onClick={() => window.location.reload()} className="h-14 rounded-2xl bg-white/5"><RefreshCw className="w-5 h-5" /></Button>
          <Button onClick={() => setIsAddDialogOpen(true)} className="h-14 px-8 rounded-2xl font-bold shadow-xl shadow-primary/20"><Plus className="mr-2 w-6 h-6" /> Lägg till bil</Button>
        </div>
      </header>

      {pendingLogs.length > 0 && (
        <section className="mb-12 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 animate-pulse">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-headline font-bold">Väntande godkännanden</h2>
          </div>
          <div className="grid gap-4">
            {pendingLogs.map(log => (
              <Card key={log.id} className="glass-card border-red-500/20 bg-red-500/5 overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-6 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4 w-full">
                      <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                        <Wrench className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-lg leading-tight">{log.category} på {log.licensePlate}</p>
                            <p className="text-sm text-muted-foreground mt-1">Registrerat av {log.creatorName} • {log.date}</p>
                          </div>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-lg py-1 px-3">
                            {log.odometer?.toLocaleString()} mil
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 bg-white/5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
                          <Banknote className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase opacity-50">Kostnad</p>
                          <p className="font-bold text-lg">{log.cost ? `${log.cost.toLocaleString()} kr` : 'Ej angivet'}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 mt-1">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-bold uppercase opacity-50">Sammanfattning</p>
                          <p className="text-sm italic text-slate-300 mt-1">"{log.notes || 'Inga anteckningar medföljde.'}"</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 justify-center">
                      <Button className="w-full h-14 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold shadow-lg shadow-green-600/20" onClick={() => handleApproveLog(log)}>
                        <Check className="w-5 h-5 mr-2" /> Godkänn och lås
                      </Button>
                      <Button variant="ghost" className="w-full h-12 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => handleRejectLog(log)}>
                        <X className="w-4 h-4 mr-2" /> Neka registrering
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {allVehicles.length > 0 ? (
        <div className="grid gap-8">
          {allVehicles.map(v => {
            const displayImage = v.mainImage || (v.imageUrls && v.imageUrls[0]) || 'https://picsum.photos/seed/car/800/600';
            const plate = v.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
            return (
              <div key={v.id} className="relative overflow-hidden rounded-[2.5rem] glass-card border-white/10 group transition-all hover:ring-2 ring-primary/20 shadow-2xl">
                <div className="h-64 relative overflow-hidden">
                  <img src={displayImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                  <div className="absolute top-6 left-6 flex flex-col gap-2">
                    <Badge className="bg-green-500 text-white border-none px-4 py-1.5 shadow-xl font-bold uppercase text-[10px] rounded-full"><ShieldCheck className="w-4 h-4 mr-2" /> AutoLog Verifierad</Badge>
                    {v.isPublished && <Badge className="bg-blue-500 text-white border-none px-4 py-1.5 shadow-xl font-bold uppercase text-[10px] rounded-full animate-in zoom-in">Till salu</Badge>}
                  </div>
                  <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
                    <div><h2 className="text-5xl font-headline font-bold text-white leading-none">{v.make}</h2><p className="text-2xl opacity-80 text-white mt-2">{v.model}</p></div>
                    <div className="bg-white text-black font-bold px-6 py-2 rounded-xl text-3xl border-2 border-slate-300 font-mono shadow-2xl transform rotate-1">{v.licensePlate}</div>
                  </div>
                </div>
                <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-900/40 border-t border-white/5">
                  <div className="space-y-1"><p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Mätare</p><p className="text-xl font-bold text-white flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> {v.currentOdometerReading?.toLocaleString() || 0} mil</p></div>
                  <div className="space-y-1"><p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Teknik</p><p className="text-sm font-bold text-white flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /> {v.hp || '---'} hk / {v.fuelType || '---'}</p></div>
                  <div className="space-y-1"><p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Växellåda</p><p className="text-sm font-bold text-white flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-400" /> {v.gearbox || '---'}</p></div>
                  <div className="space-y-1"><p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Färg</p><p className="text-sm font-bold text-white flex items-center gap-2"><Palette className="w-4 h-4 text-pink-400" /> {v.color || '---'}</p></div>
                </div>
                <div className="p-6 bg-white/5 grid grid-cols-2 md:grid-cols-6 gap-3 border-t border-white/5">
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
                    <Button variant="secondary" className="h-14 rounded-2xl font-bold bg-green-600 hover:bg-green-500 text-white" onClick={() => { setSelectedVehicle(v); setIsTransferOpen(true); }}>
                      <KeyRound className="w-4 h-4 mr-2" /> Slutför köp
                    </Button>
                  )}
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
      <AddVehicleDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
      {selectedVehicle && (<>
        <LogEventDialog isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} onSubmit={handleLogSubmit} currentOdometer={selectedVehicle.currentOdometerReading} licensePlate={selectedVehicle.licensePlate} />
        <EditVehicleDialog isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} vehicle={selectedVehicle} />
        <PublishVehicleDialog isOpen={isPublishOpen} onClose={() => setIsPublishOpen(false)} vehicle={selectedVehicle} />
        <TransferOwnershipDialog isOpen={isTransferOpen} onClose={() => setIsTransferOpen(false)} vehicle={selectedVehicle} />
      </>)}
    </div>
  );
}
