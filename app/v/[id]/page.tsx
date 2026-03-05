
"use client";

import { use, useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Gauge, Calendar, ArrowLeft, MessageCircle, Phone, Loader2, History, Shield, FileText, Trash2, Zap, Palette, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HistoryList, calculateOverallTrust, TRUST_CONFIG } from '@/components/history-list';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, getDoc, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, VehicleLog, TrustLevel } from '@/types/autolog';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PublishVehicleDialog } from '@/components/publish-vehicle-dialog';
import Link from 'next/link';

export default function PublicVehicleView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isContacting, setIsContacting] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditAdOpen, setIsEditAdOpen] = useState(false);

  const appId = firebaseConfig.projectId;

  useEffect(() => {
    async function fetchVehicle() {
      if (!db || !id) return;
      try {
        const plate = id.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const adRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate);
        const adSnap = await getDoc(adRef);
        
        if (adSnap.exists()) {
          setVehicle({ ...adSnap.data(), id: adSnap.id } as Vehicle);
        } else {
          const carRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
          const carSnap = await getDoc(carRef);
          if (carSnap.exists()) {
            setVehicle({ ...carSnap.data(), id: carSnap.id } as Vehicle);
          } else {
            setError("Fordonet kunde inte hittas.");
          }
        }
      } catch (err) {
        setError("Ett fel uppstod vid hämtning.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchVehicle();
  }, [db, id, appId]);

  const logsRef = useMemoFirebase(() => {
    if (!db || !vehicle?.licensePlate) return null;
    const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
  }, [db, vehicle?.licensePlate, appId]);

  const { data: rawLogs } = useCollection<VehicleLog>(logsRef);

  const sortedLogs = useMemo(() => {
    if (!rawLogs) return [];
    return [...rawLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [rawLogs]);

  const overallTrust = useMemo((): TrustLevel => {
    return calculateOverallTrust(rawLogs || []);
  }, [rawLogs]);

  const trustInfo = TRUST_CONFIG[overallTrust];

  const handleRemoveAd = async () => {
    if (!user || !db || !vehicle) return;
    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/\s/g, '');
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      const vRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
      await updateDoc(vRef, { isPublished: false, updatedAt: serverTimestamp() });
      const gRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      await updateDoc(gRef, { isPublished: false, updatedAt: serverTimestamp() });
      
      toast({ title: "Annons borttagen" });
      router.push('/dashboard');
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  const handleContactSeller = async () => {
    if (!user || !db) { router.push('/login'); return; }
    if (!vehicle?.ownerId) return;
    setIsContacting(true);
    const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const convoId = `${user.uid}_${vehicle.ownerId}_${plate}`;
    
    try {
      const convoRef = doc(db, 'artifacts', appId, 'public', 'data', 'conversations', convoId);
      const convoSnap = await getDoc(convoRef);

      if (!convoSnap.exists()) {
        await setDoc(convoRef, {
          id: convoId,
          participants: [user.uid, vehicle.ownerId],
          participantNames: { [user.uid]: user.displayName || 'Köpare', [vehicle.ownerId]: vehicle.ownerName || 'Säljare' },
          carId: plate,
          carTitle: `${vehicle.make} ${vehicle.model}`,
          carImageUrl: vehicle.mainImage || 'https://picsum.photos/seed/car/200/200',
          lastMessage: '',
          lastMessageAt: serverTimestamp(),
          lastMessageSenderId: '',
          unreadBy: [],
          hiddenFor: [],
          transferCode: Math.floor(100000 + Math.random() * 900000).toString(),
          updatedAt: serverTimestamp()
        });
      }

      router.push(`/inbox/${convoId}`);
    } catch (err) { 
      console.error(err);
      toast({ variant: "destructive", title: "Kunde inte starta chatt" }); 
    } finally { 
      setIsContacting(false); 
    }
  };

  if (isLoading) return <div className="flex flex-col items-center justify-center min-h-screen"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  if (error) return <div className="container py-20 text-center text-white"><h1 className="text-2xl font-bold">{error}</h1><Button variant="ghost" onClick={() => router.push('/browse')} className="mt-4">Tillbaka</Button></div>;

  const images = vehicle?.imageUrls && vehicle.imageUrls.length > 0 ? vehicle.imageUrls : [vehicle?.mainImage || "https://picsum.photos/seed/car/800/600"];
  const isOwner = user?.uid === vehicle?.ownerId;

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="container max-w-6xl mx-auto px-4 py-8">
        <button onClick={() => router.back()} className="inline-flex items-center text-xs font-bold text-muted-foreground mb-8 hover:text-white uppercase tracking-widest">
          <ArrowLeft className="w-4 h-4 mr-2" /> TILLBAKA
        </button>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            <div className="relative rounded-[3rem] overflow-hidden glass-card border-none shadow-2xl">
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
                {images.length > 1 && (
                  <><CarouselPrevious className="left-6 bg-black/40 border-none h-12 w-12" /><CarouselNext className="right-6 bg-black/40 border-none h-12 w-12" /></>
                )}
              </Carousel>
              <div className="absolute top-8 left-8">
                <Badge className="bg-green-500 text-white border-none shadow-2xl px-6 py-2.5 text-[10px] font-black uppercase flex items-center gap-2 rounded-full">
                  <ShieldCheck className="w-4 h-4" /> AutoLog Verifierad
                </Badge>
              </div>
            </div>
            
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
                <div>
                  <h1 className="text-5xl md:text-7xl font-headline font-bold text-white tracking-tighter leading-none">
                    {vehicle?.make} <span className="gradient-text">{vehicle?.model}</span>
                  </h1>
                  <div className="flex flex-wrap items-center gap-6 mt-6">
                    <span className="flex items-center gap-2.5 font-bold text-sm text-slate-300"><Calendar className="w-5 h-5 text-primary" /> {vehicle?.year}</span>
                    <span className="flex items-center gap-2.5 font-bold text-sm text-slate-300"><Gauge className="w-5 h-5 text-accent" /> {vehicle?.currentOdometerReading?.toLocaleString()} mil</span>
                    <span className="flex items-center gap-2.5 font-bold text-sm text-slate-300"><Palette className="w-5 h-5 text-pink-400" /> {vehicle?.color || 'Ej angivet'}</span>
                  </div>
                </div>
                <div className="text-right">
                  {vehicle?.price && <p className="text-5xl md:text-6xl font-headline font-bold text-primary mb-2 tracking-tighter">{vehicle.price.toLocaleString()} kr</p>}
                  <div className="inline-block bg-white text-black font-bold px-8 py-2.5 rounded-2xl text-3xl border-2 border-slate-300 font-mono shadow-2xl transform -rotate-1">
                    {vehicle?.licensePlate}
                  </div>
                </div>
              </div>

              <Card className={`bg-transparent border-2 ${trustInfo.border} rounded-[2.5rem] overflow-hidden relative shadow-2xl`}>
                <div className={`absolute inset-0 ${trustInfo.bg} opacity-20 pointer-none`} />
                <div className="p-8 relative z-10 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center text-primary shadow-inner"><Shield className="w-7 h-7" /></div>
                      <div><h2 className="text-xl font-bold text-white">Bilens Tillitsprofil</h2><p className="text-xs text-muted-foreground">Status baserat på dina regler</p></div>
                    </div>
                    <Badge className="bg-black/60 border border-white/10 px-6 py-2.5 rounded-2xl text-sm font-black flex items-center gap-2.5 shadow-xl">
                      <span className="text-2xl leading-none">{trustInfo.emoji}</span>{trustInfo.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">{trustInfo.desc}</p>
                </div>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-2">
                <div className="glass-card p-5 rounded-[2rem] space-y-1"><p className="text-[10px] font-bold uppercase opacity-40">Växellåda</p><p className="font-bold text-white">{vehicle?.gearbox || 'Automat'}</p></div>
                <div className="glass-card p-5 rounded-[2rem] space-y-1"><p className="text-[10px] font-bold uppercase opacity-40">Bränsle</p><p className="font-bold text-white">{vehicle?.fuelType || 'Bensin'}</p></div>
                <div className="glass-card p-5 rounded-[2rem] space-y-1"><p className="text-[10px] font-bold uppercase opacity-40">Effekt</p><p className="font-bold text-white">{vehicle?.hp ? `${vehicle.hp} hk` : 'Ej angivet'}</p></div>
                <div className="glass-card p-5 rounded-[2rem] space-y-1"><p className="text-[10px] font-bold uppercase opacity-40">Senaste insp.</p><p className="font-bold text-white">{vehicle?.lastInspection || 'Ej angivet'}</p></div>
              </div>

              {vehicle?.description && (
                <Card className="glass-card border-white/5 rounded-[2.5rem] shadow-xl overflow-hidden">
                  <CardContent className="p-10">
                    <h2 className="text-2xl font-headline font-bold mb-6 flex items-center gap-3 text-white"><FileText className="w-7 h-7 text-primary" /> Säljarens beskrivning</h2>
                    <p className="text-slate-300 whitespace-pre-wrap leading-relaxed text-lg">{vehicle.description}</p>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-8 pt-4">
                <div className="flex items-center justify-between px-4">
                  <h2 className="text-3xl font-headline font-bold flex items-center gap-4 text-white"><History className="text-primary w-8 h-8" /> Servicehistorik</h2>
                  <Button asChild variant="outline" className="rounded-full border-white/10 h-10 px-6 font-bold"><Link href={`/v/${vehicle?.licensePlate}/history`}>Visa allt</Link></Button>
                </div>
                <HistoryList logs={sortedLogs.slice(0, 3)} showPrivateData={false} />
              </div>
            </div>
          </div>
          
          <div className="space-y-8">
            <Card className="glass-card sticky top-24 border-white/5 rounded-[3rem] shadow-2xl overflow-hidden">
              <CardContent className="p-10 space-y-10">
                {isOwner ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-center"><p className="text-xs font-black text-primary uppercase tracking-widest">DIN AKTIVA ANNONS</p></div>
                    <Button className="w-full h-16 rounded-[1.5rem] font-bold text-lg" onClick={() => setIsEditAdOpen(true)}><Edit3 className="mr-3 w-5 h-5" /> Redigera annons</Button>
                    <Button variant="destructive" className="w-full h-16 rounded-[1.5rem] font-bold text-lg" onClick={handleRemoveAd}><Trash2 className="mr-3 w-5 h-5" /> Ta bort annons</Button>
                    <Button variant="outline" className="w-full h-16 rounded-[1.5rem] border-white/10 text-slate-300 font-bold" onClick={() => router.push('/dashboard')}>Hantera i garage</Button>
                  </div>
                ) : (
                  <>
                    <Button className="w-full h-20 rounded-[1.5rem] font-black text-xl shadow-2xl shadow-primary/30 active:scale-95 transition-all" onClick={handleContactSeller} disabled={isContacting}>
                      {isContacting ? <Loader2 className="animate-spin" /> : <MessageCircle className="mr-3 w-6 h-6" />} Kontakta säljaren
                    </Button>
                    <Button variant="outline" className="w-full h-16 rounded-[1.5rem] border-white/10 text-lg font-bold text-slate-300 hover:text-white" onClick={() => setShowPhone(!showPhone)}>
                      <Phone className="mr-3 w-5 h-5 text-accent" /> {showPhone ? (vehicle?.ownerPhone || "Dolt nummer") : "Visa telefon"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {vehicle && <PublishVehicleDialog isOpen={isEditAdOpen} onClose={() => setIsEditAdOpen(false)} vehicle={vehicle} />}
    </div>
  );
}
