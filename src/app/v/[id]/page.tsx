
"use client";

import { use, useState, useMemo, useEffect } from 'react';
import { ShieldCheck, Gauge, Calendar, ArrowLeft, MessageCircle, Phone, Loader2, History, FileText, Share2, Award, Check, AlertCircle, Maximize2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HistoryList, calculateOverallTrust, TRUST_CONFIG } from '@/components/history-list';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, onSnapshot, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, VehicleLog, TrustLevel, UserProfile } from '@/types/autolog';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function PublicVehicleAdView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  
  const [showPhone, setShowPhone] = useState(false);
  const [isVehicleLoading, setIsVehicleLoading] = useState(true);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const appId = firebaseConfig.projectId;
  const plate = id.toUpperCase().replace(/[^A-Z0-9]/g, '');

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), (snap) => {
      if (snap.exists()) setVehicle({ ...snap.data(), id: snap.id } as Vehicle);
      setIsVehicleLoading(false);
    });
    return () => unsub();
  }, [db, plate, appId]);

  // Hämta säljarens profil dynamiskt för att få med bild och användartyp
  const sellerProfileRef = useMemoFirebase(() => {
    if (!db || !vehicle?.ownerId) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', vehicle.ownerId);
  }, [db, vehicle?.ownerId, appId]);
  const { data: sellerProfile } = useDoc<UserProfile>(sellerProfileRef);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: currentUserProfile } = useDoc<UserProfile>(userProfileRef);

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

  const isOwner = user?.uid === vehicle?.ownerId;
  const displaySellerName = sellerProfile?.name || vehicle?.ownerName || 'Verifierad medlem';
  const isWorkshopSeller = sellerProfile?.userType === 'Workshop';

  const images = useMemo(() => {
    const adImages = (vehicle?.adImageUrls || []).filter(url => !!url && typeof url === 'string');
    if (adImages.length > 0) return adImages;
    if (vehicle?.adMainImage) return [vehicle.adMainImage];
    const profileImages = (vehicle?.imageUrls || []).filter(url => !!url && typeof url === 'string');
    if (profileImages.length > 0) return profileImages;
    if (vehicle?.mainImage) return [vehicle.mainImage];
    return ["https://picsum.photos/seed/car/800/600"];
  }, [vehicle]);

  const handleContactSeller = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!db || !vehicle || !vehicle.ownerId) return;

    setIsCreatingChat(true);
    try {
      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      
      const q = query(
        convosRef,
        where('carId', '==', plate),
        where('buyerId', '==', user.uid),
        where('sellerId', '==', vehicle.ownerId),
        where('type', '==', 'MARKETPLACE')
      );
      
      const snap = await getDocs(q);

      if (!snap.empty) {
        router.push(`/inbox/${snap.docs[0].id}`);
        return;
      }

      const carTitle = `${vehicle.make} ${vehicle.model}`;
      const carImageUrl = vehicle.adMainImage || vehicle.mainImage || 'https://picsum.photos/seed/car/200/200';

      const newConvo = await addDoc(convosRef, {
        participants: [user.uid, vehicle.ownerId],
        buyerId: user.uid,
        sellerId: vehicle.ownerId,
        type: 'MARKETPLACE',
        participantNames: {
          [user.uid]: currentUserProfile?.name || user.displayName || 'Köpare',
          [vehicle.ownerId]: sellerProfile?.name || vehicle.ownerName || 'Säljare'
        },
        carId: plate,
        carTitle: carTitle,
        carImageUrl: carImageUrl,
        lastMessage: '',
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: '',
        unreadBy: [],
        hiddenFrom: [],
        updatedAt: serverTimestamp(),
        transferCode: Math.floor(100000 + Math.random() * 900000).toString()
      });

      router.push(`/inbox/${newConvo.id}`);
    } catch (error: any) {
      console.error("Chat error:", error);
      toast({ variant: "destructive", title: "Kunde inte starta chatt", description: error.message });
    } finally {
      setIsCreatingChat(false);
    }
  };

  if (isVehicleLoading) return <div className="flex flex-col items-center justify-center min-h-screen"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  if (!vehicle) return (
    <div className="container max-w-4xl mx-auto py-20 text-center space-y-6">
      <h1 className="text-4xl font-headline font-bold">Fordonet hittades inte</h1>
      <p className="text-muted-foreground">Kontrollera länken eller sök på marknadsplatsen.</p>
      <Button asChild><a href="/browse">Till marknadsplatsen</a></Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="container max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => router.back()} className="inline-flex items-center text-xs font-bold text-muted-foreground hover:text-white uppercase tracking-widest transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> TILLBAKA
          </button>
          <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-1 rounded-full uppercase text-[10px] font-black">
            OFFICIELL BILANNONS
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            <div className="relative rounded-[2.5rem] overflow-hidden glass-card border-none shadow-2xl">
              <Carousel>
                <CarouselContent>
                  {images.map((url, i) => (
                    <CarouselItem key={i}>
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="relative aspect-[16/10] cursor-zoom-in group">
                            <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                              <Maximize2 className="w-10 h-10 text-white" />
                            </div>
                          </div>
                        </DialogTrigger>
                        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/90 border-none rounded-none overflow-hidden">
                          <DialogHeader className="sr-only">
                            <DialogTitle>Bildförstoring</DialogTitle>
                          </DialogHeader>
                          <div className="relative w-full h-full flex items-center justify-center p-4">
                            <img src={url} alt="Fullskärmsbild" className="max-w-full max-h-[90vh] object-contain" />
                          </div>
                        </DialogContent>
                      </Dialog>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {images.length > 1 && <><CarouselPrevious className="left-6" /><CarouselNext className="right-6" /></>}
              </Carousel>
              <div className="absolute top-8 left-8 flex flex-col gap-2 pointer-events-none">
                <Badge className="bg-green-500 text-white border-none px-6 py-2.5 text-[10px] font-black uppercase rounded-full shadow-xl">
                  <ShieldCheck className="w-4 h-4 mr-2" /> AutoLog Verifierad
                </Badge>
                <Badge className={`${trustInfo.bg} ${trustInfo.color} border-none px-6 py-2.5 text-[10px] font-black uppercase rounded-full shadow-xl backdrop-blur-md`}>
                  {trustInfo.emoji} CarGuard {trustInfo.label}
                </Badge>
              </div>
            </div>
            
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
                <div className="space-y-4">
                  <div className="inline-block bg-primary text-white font-black px-6 py-2 rounded-2xl text-2xl shadow-xl shadow-primary/20 mb-2">
                    {vehicle.price ? `${vehicle.price.toLocaleString()} kr` : 'Ring för pris'}
                  </div>
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

              <Card className={`mx-4 p-8 rounded-[2rem] border-2 ${trustInfo.border} ${trustInfo.bg} flex flex-col md:flex-row items-center gap-8 shadow-2xl`}>
                <div className="text-7xl">{trustInfo.emoji}</div>
                <div className="text-center md:text-left flex-1 space-y-2">
                  <h2 className={`text-3xl font-headline font-black uppercase tracking-tight ${trustInfo.color}`}>CarGuard {trustInfo.label}</h2>
                  <p className="text-slate-300 text-sm leading-relaxed max-w-md">
                    {trustLevelExplanation(overallTrust)}
                  </p>
                </div>
                <div className="px-6 py-3 bg-black/20 rounded-2xl border border-white/5 text-center">
                  <p className="text-[10px] font-bold uppercase opacity-50 mb-1">Historikstatus</p>
                  <p className="font-black text-xl text-white uppercase">{trustInfo.label} ✅</p>
                </div>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-2">
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

              <div className="px-4 py-6 space-y-4">
                <h3 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6 text-primary" /> Säljarens beskrivning</h3>
                <p className="text-slate-300 text-lg leading-relaxed whitespace-pre-wrap italic">
                  {vehicle.description || "Säljaren har inte lagt till någon beskrivning än."}
                </p>
              </div>

              <div className="space-y-8 pt-4">
                <div className="flex items-center justify-between px-4">
                  <h2 className="text-3xl font-headline font-bold flex items-center gap-4 text-white"><History className="text-primary w-8 h-8" /> Komplett historik</h2>
                </div>
                <HistoryList 
                  logs={sortedLogs} 
                  showPrivateData={false} 
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-8">
            <Card className="glass-card sticky top-24 border-white/5 rounded-[3rem] p-10 space-y-6 shadow-2xl">
              <div className="space-y-4">
                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 text-center">
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Annonserat pris</p>
                  <p className="text-4xl font-headline font-black text-white">
                    {vehicle.price ? `${vehicle.price.toLocaleString()} kr` : 'Ring för pris'}
                  </p>
                </div>
              </div>

              {isOwner ? (
                <Alert className="bg-blue-500/10 border-blue-500/20 rounded-2xl">
                  <AlertCircle className="h-4 w-4 text-blue-400" />
                  <AlertTitle className="text-blue-400">Din egen annons</AlertTitle>
                  <AlertDescription className="text-xs text-slate-300">
                    Som ägare kan du inte skicka meddelanden till dig själv. Hantera bilen via din profil istället.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3 pt-4">
                  <Button 
                    className="w-full h-20 rounded-[1.5rem] font-black text-xl shadow-xl shadow-primary/20" 
                    onClick={handleContactSeller}
                    disabled={isCreatingChat}
                  >
                    {isCreatingChat ? <Loader2 className="w-6 h-6 animate-spin" /> : <MessageCircle className="mr-3 w-6 h-6" />} 
                    Skicka meddelande
                  </Button>
                  <Button variant="outline" className="w-full h-16 rounded-[1.5rem] border-white/10 text-lg font-bold" onClick={() => setShowPhone(!showPhone)}>
                    <Phone className="mr-3 w-5 h-5 text-accent" /> {showPhone ? (vehicle.ownerPhone || "Inget nummer angivet") : "Visa telefonnummer"}
                  </Button>
                </div>
              )}

              <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center gap-4">
                <p className="text-[10px] font-bold uppercase opacity-40 text-center">Säljs av</p>
                <div className="relative">
                  <Avatar className={`h-24 w-24 ${isWorkshopSeller ? 'rounded-[1.5rem]' : 'rounded-full'} border-4 border-background shadow-xl`}>
                    <AvatarImage src={sellerProfile?.photoUrl} className="object-cover" />
                    <AvatarFallback className={`${isWorkshopSeller ? 'rounded-[1.5rem]' : 'rounded-full'} bg-primary/10 text-primary text-2xl font-black`}>
                      {displaySellerName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {isWorkshopSeller && (
                    <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white rounded-lg p-1.5 border-4 border-background shadow-lg">
                      <Wrench className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="font-black text-lg">{displaySellerName}</p>
                  {isWorkshopSeller && <Badge className="mt-1 bg-blue-500/10 text-blue-400 border-none uppercase text-[8px] font-black">Verifierad Verkstad</Badge>}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function trustLevelExplanation(level: TrustLevel) {
  switch (level) {
    case 'Gold': return 'Bilen har en obruten kedja av realtidsloggad verkstadshistorik. De senaste posterna har loggats i direkt anslutning till utförandet.';
    case 'Silver': return 'Bilen har en god historik där majoriteten av händelserna är verifierade via kvitto eller snabb registrering.';
    default: return 'Historiken innehåller efterhandsregistreringar eller manuella inmatningar som gjorts långt efter utförandedatumet.';
  }
}
