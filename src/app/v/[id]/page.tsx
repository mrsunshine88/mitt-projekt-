"use client";

import { use, useState, useEffect } from 'react';
import { ShieldCheck, Gauge, Calendar, ArrowLeft, MessageCircle, Phone, Loader2, Lock, Trash2, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HistoryList } from '@/components/history-list';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, writeBatch } from 'firebase/firestore';
import Link from 'next/link';
import Image from 'next/image';
import { Vehicle, UserProfile } from '@/types/autolog';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, parseISO } from 'date-fns';

export default function PublicVehicleView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  
  const [vehicle, setVehicle] = useState<Partial<Vehicle> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isContacting, setIsContacting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showPhone, setShowPhone] = useState(false);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: myProfile } = useDoc<UserProfile>(profileRef);

  useEffect(() => {
    async function fetchVehicle() {
      if (!db || !id) return;
      
      try {
        const docRef = doc(db, 'public_listings', id);
        let docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setVehicle({ ...docSnap.data(), id: docSnap.id } as Vehicle);
        } else {
          const normalizedId = id.toUpperCase().replace(/\s/g, '');
          const q = query(collection(db, 'public_listings'), where('licensePlate', '==', normalizedId));
          const snap = await getDocs(q);
          if (!snap.empty) {
            setVehicle({ ...snap.docs[0].data(), id: snap.docs[0].id } as Vehicle);
          }
        }
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchVehicle();
  }, [db, id]);

  const handleContactSeller = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!vehicle || !db || vehicle.ownerId === user.uid) return;

    setIsContacting(true);
    try {
      const convosRef = collection(db, 'conversations');
      const normalizedPlate = vehicle.licensePlate!.toUpperCase().replace(/\s/g, '');
      const q = query(
        convosRef, 
        where('participants', 'array-contains', user.uid),
        where('carId', '==', normalizedPlate)
      );
      const querySnapshot = await getDocs(q);
      
      let convoId;
      if (!querySnapshot.empty) {
        convoId = querySnapshot.docs[0].id;
      } else {
        const transferCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        const sellerId = vehicle.ownerId!;
        const buyerId = user.uid;

        const buyerName = myProfile?.name || user.displayName || user.email?.split('@')[0] || 'Köpare';
        const sellerName = vehicle.ownerName || 'Säljare';

        const newConvo = await addDoc(convosRef, {
          participants: [buyerId, sellerId],
          participantNames: {
            [buyerId]: buyerName,
            [sellerId]: sellerName
          },
          carId: normalizedPlate,
          carTitle: `${vehicle.make} ${vehicle.model}`,
          carImageUrl: vehicle.mainImage || (vehicle.imageUrls && vehicle.imageUrls[0]) || '',
          lastMessage: 'Inga meddelanden ännu',
          lastMessageAt: serverTimestamp(),
          lastMessageSenderId: user.uid,
          unreadBy: [],
          hiddenFor: [],
          updatedAt: serverTimestamp(),
          transferCode: transferCode 
        });

        convoId = newConvo.id;
      }

      router.push(`/inbox/${convoId}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally {
      setIsContacting(false);
    }
  };

  const logsQuery = useMemoFirebase(() => {
    if (!db || !vehicle?.licensePlate) return null;
    return query(collection(db, 'vehicleHistory', vehicle.licensePlate, 'logs'));
  }, [db, vehicle?.licensePlate]);

  const { data: logsData } = useCollection(logsQuery);
  const logs = (logsData || []).map(l => ({
    id: l.id,
    category: l.category,
    date: l.eventDate || '',
    odometer: l.odometerReading || 0,
    notes: l.notes || '',
    isVerified: l.isVerifiedByWorkshop || false,
    verificationSource: l.verificationSource,
    photoUrl: l.documentProofUrls?.[0],
    type: l.type
  })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const serviceDiff = vehicle?.nextServiceDate ? differenceInDays(parseISO(vehicle.nextServiceDate), new Date()) : null;

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>;

  const displayVehicle: any = vehicle || { make: "Laddar...", licensePlate: "--- ---" };
  const images = displayVehicle.mainImage ? [displayVehicle.mainImage, ...(displayVehicle.imageUrls || [])] : ["https://picsum.photos/seed/car/800/600"];
  const isOwner = user?.uid === displayVehicle.ownerId;

  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="container max-w-5xl mx-auto px-4 py-8">
        <Link href="/browse" className="inline-flex items-center text-sm text-muted-foreground mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Tillbaka
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="relative rounded-3xl overflow-hidden glass-card">
              <Carousel>
                <CarouselContent>
                  {images.map((url: string, index: number) => (
                    <CarouselItem key={index}>
                      <div className="relative aspect-video">
                        <Image src={url} alt="Fordon" fill className="object-cover" />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {images.length > 1 && <><CarouselPrevious className="left-4" /><CarouselNext className="right-4" /></>}
              </Carousel>
              <div className="absolute top-6 left-6">
                <Badge className="bg-green-500 text-white border-none px-4 py-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 mr-2" /> AI-Verifierad
                </Badge>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-4xl font-headline font-bold uppercase">
                    {displayVehicle.make} <span className="text-primary">{displayVehicle.model}</span>
                  </h1>
                  <div className="flex items-center gap-4 mt-2 text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {displayVehicle.year}</span>
                    <span className="flex items-center gap-1.5"><Gauge className="w-4 h-4" /> {displayVehicle.currentOdometerReading?.toLocaleString()} mil</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-headline font-bold text-primary">{displayVehicle.price?.toLocaleString()} kr</p>
                  <Badge variant="outline" className="text-xl py-1 px-5 border-2 font-bold bg-white text-black mt-2">
                    {displayVehicle.licensePlate}
                  </Badge>
                </div>
              </div>

              {serviceDiff !== null && (
                <Card className={`${serviceDiff < 30 ? 'bg-destructive/5 border-destructive/20' : 'bg-green-500/5 border-green-500/20'}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Clock className={`w-5 h-5 ${serviceDiff < 30 ? 'text-destructive' : 'text-green-500'}`} />
                    <div className="text-sm">
                      <strong>Servicepåminnelse:</strong> Nästa planerade service är om ca <strong>{serviceDiff} dagar</strong> ({displayVehicle.nextServiceDate}).
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-primary/5 border-primary/20 border-2">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                    <CardTitle>Digitalt Servicecertifikat</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold uppercase opacity-60">Obruten Historik</p>
                      <p className="text-sm">Inga raderade eller manipulerade händelser.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold uppercase opacity-60">AI-Granskad</p>
                      <p className="text-sm">Extraherad data direkt från officiella dokument.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <HistoryList logs={logs} showPrivateData={false} />
            </div>
          </div>

          <div className="space-y-6">
            <Card className="glass-card sticky top-24">
              <CardContent className="p-6 space-y-4">
                {!isOwner ? (
                  <>
                    <Button className="w-full h-14 rounded-2xl font-bold text-lg" onClick={handleContactSeller} disabled={isContacting}>
                      {isContacting ? <Loader2 className="animate-spin" /> : <MessageCircle className="w-5 h-5 mr-2" />}
                      Kontakta säljaren
                    </Button>
                    <Button variant="outline" className="w-full h-14 rounded-2xl" onClick={() => setShowPhone(!showPhone)}>
                      <Phone className="w-5 h-5 mr-2" /> {showPhone ? (displayVehicle.ownerPhone || "Dolt nummer") : "Visa telefon"}
                    </Button>
                  </>
                ) : (
                  <Button variant="destructive" className="w-full h-14 rounded-2xl font-bold" onClick={() => router.push('/dashboard')}>
                    <Lock className="w-5 h-5 mr-2" /> Hantera bil
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}