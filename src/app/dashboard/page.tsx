
"use client";

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Vehicle } from '@/types/autolog';
import { Loader2, Plus, RefreshCw, Car, ShieldCheck, ShoppingCart, ArrowRight, X } from 'lucide-react';
import { AddVehicleDialog } from '@/components/add-vehicle-dialog';
import { AcceptTransferDialog } from '@/components/accept-transfer-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  const [isAcceptOpen, setIsAcceptOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // 1. Mina egna bilar - Hämtas direkt från det globala registret baserat på ägarskap
  const myVehiclesQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'cars'),
      where('ownerId', '==', user.uid)
    );
  }, [db, user?.uid, appId]);
  
  const { data: rawVehicles, isLoading: isVehiclesLoading } = useCollection<Vehicle>(myVehiclesQuery);

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
    if (!rawVehicles) return [];
    return [...rawVehicles].sort((a, b) => {
      const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
      const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
      return timeB - timeA;
    });
  }, [rawVehicles]);

  const handleCancelIncomingTransfer = async (v: Vehicle) => {
    if (!db || !user) return;
    setCancellingId(v.id);
    try {
      const plate = v.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      
      await updateDoc(globalRef, {
        pendingTransferTo: null,
        pendingTransferFrom: null,
        updatedAt: serverTimestamp()
      });

      toast({ title: "Överlåtelse nekad", description: "Du har tackat nej till detta fordonsköp." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fel", description: e.message });
    } finally {
      setCancellingId(null);
    }
  };

  if (isUserLoading || (isVehiclesLoading && isIncomingLoading)) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-12 h-12 animate-spin text-primary opacity-40" /></div>;
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 pb-32">
      <header className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-headline font-bold text-white">Mina bilar</h1>
          <p className="text-muted-foreground">Klicka på en bil för att se profil och historik</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="icon" onClick={() => window.location.reload()} className="h-14 rounded-2xl bg-white/5 border-white/10"><RefreshCw className="w-5 h-5" /></Button>
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
                  <div className="flex gap-3">
                    <Button 
                      variant="ghost" 
                      className="h-14 px-6 rounded-2xl font-bold text-destructive hover:bg-destructive/10"
                      onClick={() => handleCancelIncomingTransfer(v)}
                      disabled={cancellingId === v.id}
                    >
                      {cancellingId === v.id ? <Loader2 className="animate-spin" /> : <X className="w-5 h-5 mr-2" />} Neka
                    </Button>
                    <Button 
                      className="h-14 px-10 rounded-2xl font-bold bg-green-600 hover:bg-green-500 text-white shadow-xl"
                      onClick={() => { setSelectedVehicle(v); setIsAcceptOpen(true); }}
                    >
                      <ShoppingCart className="w-5 h-5 mr-2" /> Slutför köp
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {myVehicles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {myVehicles.map(v => {
            const displayImage = v.mainImage || (v.imageUrls && v.imageUrls[0]) || 'https://picsum.photos/seed/car/800/600';
            const plate = (v.licensePlate || v.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const isPendingOut = !!v.pendingTransferTo;

            return (
              <Link href={`/dashboard/vehicle/${plate}`} key={v.id} className="block group">
                <Card className="glass-card border-white/10 overflow-hidden rounded-[2rem] transition-all hover:ring-2 ring-primary/20 shadow-xl h-full flex flex-col">
                  <div className="aspect-[16/10] relative overflow-hidden">
                    <img src={displayImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent" />
                    
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      {v.isPublished && <Badge className="bg-blue-500 text-white border-none px-3 py-1 shadow-lg font-bold uppercase text-[8px] rounded-full">Till salu</Badge>}
                      {isPendingOut && <Badge className="bg-orange-500 text-white border-none px-3 py-1 shadow-lg font-bold uppercase text-[8px] rounded-full animate-pulse">Överlåtelse</Badge>}
                    </div>

                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                      <div className="min-w-0">
                        <h2 className="text-xl font-headline font-bold text-white leading-tight truncate">{v.make} {v.model}</h2>
                        <p className="text-xs opacity-60 text-white">{v.year}</p>
                      </div>
                      <div className="bg-white text-black font-bold px-2 py-0.5 rounded-md text-sm border border-slate-300 font-mono shadow-lg shrink-0">
                        {plate}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between mt-auto bg-white/5">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verifierad
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-white transition-colors">
                      Hantera profil <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Card>
              </Link>
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
      {selectedVehicle && (
        <AcceptTransferDialog isOpen={isAcceptOpen} onClose={() => setIsAcceptOpen(false)} vehicle={selectedVehicle} />
      )}
    </div>
  );
}
