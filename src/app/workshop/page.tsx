
"use client";

import { useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, getDoc, setDoc, limit } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Wrench, ShieldCheck, Loader2, History, Plus, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LogEventDialog } from '@/components/log-event-dialog';
import { VehicleLog } from '@/types/autolog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function WorkshopPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [searchPlate, setSearchPlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicle, setVehicle] = useState<any>(null);
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !searchPlate) return;

    setLoading(true);
    setVehicle(null);
    try {
      // 1. Normalisera söksträngen (utan mellanslag)
      const cleanPlate = searchPlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      
      if (cleanPlate.length < 2) {
        toast({ variant: "destructive", title: "För kort", description: "Vänligen ange ett giltigt registreringsnummer." });
        setLoading(false);
        return;
      }

      // 2. Försök hitta bilen via direkt ID i allVehicles (rekommenderat sätt)
      const globalRef = doc(db, 'allVehicles', cleanPlate);
      const globalSnap = await getDoc(globalRef);

      if (globalSnap.exists()) {
        const data = globalSnap.data();
        setVehicle({ ...data, id: cleanPlate, licensePlate: cleanPlate });
        toast({ title: "Fordon hittat!", description: "Hämtat från det globala registret." });
        setLoading(false);
        return;
      }

      // 3. Fallback: Sök på fältet licensePlate (som kan innehålla mellanslag)
      const qAll = query(collection(db, 'allVehicles'), where('licensePlate', 'in', [cleanPlate, searchPlate.toUpperCase().trim()]), limit(1));
      const snapAll = await getDocs(qAll);

      if (!snapAll.empty) {
        const data = snapAll.docs[0].data();
        setVehicle({ ...data, id: snapAll.docs[0].id, licensePlate: cleanPlate });
        toast({ title: "Fordon hittat!", description: "Hämtat via fältsökning." });
        setLoading(false);
        return;
      }

      // 4. Fallback: Sök i public_listings (marknadsplatsen)
      const listingRef = doc(db, 'public_listings', cleanPlate);
      const listingSnap = await getDoc(listingRef);

      if (listingSnap.exists()) {
        const data = listingSnap.data();
        setVehicle({ ...data, id: cleanPlate, licensePlate: cleanPlate });
        toast({ title: "Fordon hittat!", description: "Hämtat från marknadsplatsen." });
        setLoading(false);
        return;
      }

      // Sista försöket: Sök i public_listings via fält
      const qPub = query(collection(db, 'public_listings'), where('licensePlate', 'in', [cleanPlate, searchPlate.toUpperCase().trim()]), limit(1));
      const snapPub = await getDocs(qPub);

      if (!snapPub.empty) {
        const data = snapPub.docs[0].data();
        setVehicle({ ...data, id: snapPub.docs[0].id, licensePlate: cleanPlate });
        toast({ title: "Fordon hittat!", description: "Hämtat från marknadsplatsen via fältsökning." });
      } else {
        toast({ 
          variant: "destructive", 
          title: "Fordonet hittades inte", 
          description: "Kontrollera stavningen eller be ägaren logga in i appen en gång för att synkronisera fordonet." 
        });
      }
    } catch (err: any) {
      console.error("Search error:", err);
      toast({ variant: "destructive", title: "Fel vid sökning", description: "Ett tekniskt fel uppstod vid sökningen." });
    } finally {
      setLoading(false);
    }
  };

  const handleAddVerifiedLog = async (newLog: Partial<VehicleLog>) => {
    if (!user || !vehicle || !db) return;

    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const logsRef = collection(db, 'vehicleHistory', plate, 'logs');
      
      await addDoc(logsRef, {
        vehicleId: vehicle.id,
        licensePlate: plate,
        creatorId: user.uid,
        creatorName: user.displayName || 'Verkstad',
        category: newLog.category,
        eventDate: newLog.date,
        odometerReading: newLog.odometer,
        cost: newLog.cost || null,
        notes: newLog.notes,
        isVerifiedByWorkshop: true,
        documentProofUrls: newLog.photoUrl ? [newLog.photoUrl] : [],
        createdAt: serverTimestamp(),
      });

      // Uppdatera mätarställning i globala registret
      const globalRef = doc(db, 'allVehicles', plate);
      const updates: any = {
        updatedAt: serverTimestamp(),
      };
      
      if (newLog.odometer && newLog.odometer > (vehicle.currentOdometerReading || 0)) {
        updates.currentOdometerReading = newLog.odometer;
      }

      if (vehicle.make) updates.make = vehicle.make;
      if (vehicle.model) updates.model = vehicle.model;

      await setDoc(globalRef, {
        licensePlate: plate,
        ...updates
      }, { merge: true });

      setIsLogDialogOpen(false);
      toast({
        title: "Digital stämpel satt!",
        description: "Servicen har verifierats och sparats i bilens permanenta historik.",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Fel", description: error.message });
    }
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-bold">Verkstadspanel</h1>
        <p className="text-muted-foreground">Sök upp ett fordon för att sätta en digital service-stämpel</p>
      </header>

      <Card className="glass-card mb-8">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Ange registreringsnummer (t.ex. ABC 123)" 
                className="pl-10 uppercase h-12 rounded-xl"
                value={searchPlate}
                onChange={(e) => setSearchPlate(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" disabled={loading} className="px-8 font-bold h-12 rounded-xl">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sök fordon"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {vehicle && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="glass-card border-primary/20 overflow-hidden rounded-3xl">
            <div className="bg-primary/10 px-6 py-4 border-b border-primary/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Wrench className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold uppercase tracking-widest text-primary">Fordon identifierat</span>
              </div>
              <Badge className="text-xl px-4 py-1 bg-white text-black font-bold border-2 font-mono">
                {vehicle.licensePlate}
              </Badge>
            </div>
            <CardHeader>
              <CardTitle className="text-3xl">
                {vehicle.make && vehicle.model ? `${vehicle.make} ${vehicle.model}` : "Fordon hittat"}
              </CardTitle>
              <CardDescription>
                {vehicle.year ? `Årsmodell ${vehicle.year} • ` : ''}
                {vehicle.ownerId ? 'Registrerad i AutoLog' : 'Oregistrerat fordon'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Nuvarande mätare</p>
                  <p className="text-2xl font-bold">{vehicle.currentOdometerReading?.toLocaleString() || 0} mil</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Verifierad historik</p>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-500" /> Systemverifierad
                  </p>
                </div>
              </div>

              <Button className="w-full h-16 text-xl font-bold rounded-2xl shadow-xl shadow-primary/20" onClick={() => setIsLogDialogOpen(true)}>
                <ShieldCheck className="w-6 h-6 mr-2" /> Sätt Digital Stämpel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {!vehicle && !loading && (
        <div className="text-center py-24 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10">
          <Wrench className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-10" />
          <p className="text-muted-foreground font-medium">Sök efter en bil via registreringsnummer för att börja logga service.</p>
        </div>
      )}

      <LogEventDialog 
        isOpen={isLogDialogOpen} 
        onClose={() => setIsLogDialogOpen(false)} 
        onSubmit={handleAddVerifiedLog}
        currentOdometer={vehicle?.currentOdometerReading}
        licensePlate={vehicle?.licensePlate}
      />
    </div>
  );
}
