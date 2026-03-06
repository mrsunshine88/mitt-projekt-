
"use client";

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useMemoFirebase, useDoc, useCollection, useStorage } from '@/firebase';
import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp, query, where, addDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Wrench, ShieldCheck, Loader2, Gauge, Calendar, List, ArrowRight, MessageCircle, History as HistoryIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LogEventDialog } from '@/components/log-event-dialog';
import { VehicleLog, UserProfile, WorkshopNotification } from '@/types/autolog';
import { firebaseConfig } from '@/firebase/config';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function WorkshopPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
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
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user, appId]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const notifsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications'),
      where('workshopId', '==', user.uid),
      where('read', '==', false)
    );
  }, [db, user, appId]);
  const { data: unreadNotifications } = useCollection<WorkshopNotification>(notifsQuery);

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
    const targetPlate = (plate || searchPlate).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    if (!db || !targetPlate) return;
    
    setLoading(true);
    setVehicle(null);
    try {
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', targetPlate);
      const globalSnap = await getDoc(globalRef);
      if (globalSnap.exists()) {
        setVehicle({ ...globalSnap.data(), id: targetPlate, licensePlate: targetPlate });
        setSearchPlate(targetPlate);
        setIsHistoryListOpen(false);
      } else {
        toast({ variant: "destructive", title: "Fordon hittades ej" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Sökfel" });
    } finally { setLoading(false); }
  };

  const handleContactOwner = async () => {
    if (!user || !db || !vehicle || !vehicle.ownerId) return;
    setLoading(true);
    try {
      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      const q = query(
        convosRef, 
        where('carId', '==', vehicle.id), 
        where('participants', 'array-contains', user.uid)
      );
      
      const snap = await getDocs(q);
      
      const currentOwnerConvo = snap.docs.find(d => {
        const data = d.data();
        return data.participants.includes(vehicle.ownerId);
      });

      if (currentOwnerConvo) {
        router.push(`/inbox/${currentOwnerConvo.id}`);
        return;
      }

      const carTitle = `${vehicle.make} ${vehicle.model}`;
      const carImageUrl = vehicle.adMainImage || vehicle.mainImage || 'https://picsum.photos/seed/car/200/200';

      const newConvo = await addDoc(convosRef, {
        participants: [user.uid, vehicle.ownerId],
        buyerId: user.uid,
        sellerId: vehicle.ownerId,
        type: 'SERVICE',
        participantNames: { 
          [user.uid]: profile?.name || 'Verkstad', 
          [vehicle.ownerId]: vehicle.ownerName || 'Bilägare' 
        },
        carId: vehicle.id,
        carTitle: carTitle,
        carImageUrl: carImageUrl,
        lastMessage: '',
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: '',
        unreadBy: [],
        hiddenFrom: [],
        updatedAt: serverTimestamp()
      });
      router.push(`/inbox/${newConvo.id}`);
    } catch (error: any) { 
      console.error("Chat error:", error);
      toast({ variant: "destructive", title: "Kunde inte starta chatt" }); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleLogSubmit = async (newLog: Partial<VehicleLog>) => {
    if (!user || !vehicle || !db) return;
    setLoading(true);
    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const batch = writeBatch(db);
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
      const logId = editingLog?.id || doc(logsRef).id;
      const logDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', logId);

      // Vi skippar Firebase Storage helt för att undvika CORS-fel i utvecklingsmiljön.
      // Bilden sparas istället direkt i Firestore-dokumentet.
      const logData = {
        id: logId,
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
        photoUrl: newLog.photoUrl || null, // Sparas direkt i Firestore
        hasStoragePhoto: false, // Flagga för att indikera att vi inte behöver hämta från Storage
        isVerified: true, 
        approvalStatus: 'pending',
        verificationSource: 'Workshop',
        createdAt: editingLog ? (editingLog.createdAt || serverTimestamp()) : serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(logDocRef, logData, { merge: true });
      batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'workshops', user.uid, 'servicedCars', plate), {
        id: plate, licensePlate: plate, make: vehicle.make, model: vehicle.model, mainImage: vehicle.mainImage || null, lastServicedAt: serverTimestamp()
      }, { merge: true });

      if (newLog.odometer && newLog.odometer > vehicle.currentOdometerReading) {
        batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), { currentOdometerReading: newLog.odometer, updatedAt: serverTimestamp() });
      }

      if (vehicle.ownerId) {
        batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', `${plate}_${user.uid}`), {
          ownerId: vehicle.ownerId, 
          plate: plate, 
          workshopId: user.uid, 
          createdAt: serverTimestamp(),
          vehicleTitle: `${vehicle.make} ${vehicle.model}`,
          logData: { ...logData }
        });
      }
      
      await batch.commit();
      toast({ title: editingLog ? "Ändring sparad!" : "Service registrerad!" });
      
      setIsLogDialogOpen(false);
      setEditingLog(null);
      fetchServicedCars();
    } catch (error: any) { 
      console.error("Submit error:", error);
      toast({ variant: "destructive", title: "Systemfel vid sparning" }); 
    } finally { 
      setLoading(false);
    }
  };

  if (isUserLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 pb-32">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-headline font-bold text-white">Verkstadspanel</h1>
          <p className="text-muted-foreground">Hantera fordonshistorik med digitala stämplar.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild className="h-14 rounded-2xl bg-white/5 border-white/10 px-6 relative">
            <Link href="/workshop/events">
              <HistoryIcon className="w-5 h-5 mr-2" /> Händelser
              {unreadNotifications && unreadNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold animate-pulse">
                  {unreadNotifications.length}
                </span>
              )}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setIsHistoryListOpen(true)} className="h-14 rounded-2xl bg-white/5 border-white/10 px-6 font-bold"><List className="w-5 h-5 mr-2" /> Kundlista</Button>
        </div>
      </header>

      <div className="space-y-8">
        <Card className="glass-card border-white/5 rounded-3xl"><CardContent className="pt-6">
          <form onSubmit={(e) => handleSearch(e)} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input placeholder="Reg-nr (t.ex. ABC 123)" className="pl-12 uppercase h-14 rounded-2xl bg-white/5 border-white/10 text-lg font-bold" value={searchPlate} onChange={(e) => setSearchPlate(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="px-10 font-bold h-14 rounded-2xl text-lg shadow-xl shadow-primary/20">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sök fordon"}</Button>
          </form>
        </CardContent></Card>

        {vehicle && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <Card className="glass-card border-primary/20 overflow-hidden rounded-[2.5rem] shadow-2xl">
              <div className="bg-primary/10 px-8 py-6 border-b border-primary/20 flex justify-between items-center">
                <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center"><Wrench className="w-5 h-5 text-primary" /></div><h3 className="text-xl font-headline font-bold">{vehicle.make} {vehicle.model}</h3></div>
                <Badge className="text-2xl font-mono px-4 py-1.5 bg-white text-black border-2 border-slate-300 rounded-lg">{vehicle.licensePlate}</Badge>
              </div>
              <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5"><p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Mätarställning</p><div className="flex items-center gap-2 text-2xl font-bold"><Gauge className="w-5 h-5 text-primary" /> {vehicle.currentOdometerReading?.toLocaleString()} mil</div></div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5"><p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Årsmodell</p><div className="flex items-center gap-2 text-2xl font-bold"><Calendar className="w-5 h-5 text-accent" /> {vehicle.year}</div></div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button className="flex-[2] h-20 text-xl font-bold rounded-2xl shadow-2xl shadow-primary/30" onClick={() => { setEditingLog(null); setIsLogDialogOpen(true); }} disabled={loading}>{loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <ShieldCheck className="w-8 h-8 mr-3" />} Registrera ny händelse</Button>
                  {vehicle.ownerId && <Button variant="outline" className="flex-1 h-20 text-lg font-bold rounded-2xl border-white/10" onClick={handleContactOwner}><MessageCircle className="w-6 h-6 mr-2 text-primary" /> Skriv till ägare</Button>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={isHistoryListOpen} onOpenChange={setIsHistoryListOpen}>
        <DialogContent className="glass-card border-white/10 rounded-[2rem] sm:max-w-[450px] max-h-[80vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-2 border-b border-white/5">
            <DialogTitle className="text-2xl font-headline font-bold">Hanterade fordon</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {loadingServiced ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary opacity-20" /></div>
            ) : servicedVehicles.length > 0 ? (
              <div className="grid gap-3">
                {servicedVehicles.map(v => (
                  <button 
                    key={v.id} 
                    onClick={() => handleSearch(undefined, v.licensePlate)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0">
                        {v.mainImage ? <img src={v.mainImage} className="w-full h-full object-cover" alt="" /> : <Wrench className="w-full h-full p-3 opacity-20" />}
                      </div>
                      <div>
                        <p className="font-bold text-white">{v.make} {v.model}</p>
                        <Badge variant="outline" className="mt-1 font-mono text-[10px] px-2 py-0 h-5 bg-white text-black border-none">{v.licensePlate}</Badge>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground opacity-20" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 opacity-40 italic">Inga fordon har hanterats ännu.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {vehicle && <LogEventDialog isOpen={isLogDialogOpen} onClose={() => { setIsLogDialogOpen(false); setEditingLog(null); }} onSubmit={handleLogSubmit} currentOdometer={vehicle?.currentOdometerReading} userType="Workshop" initialData={editingLog || undefined} />}
    </div>
  );
}
