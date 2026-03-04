
"use client";

import { useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Wrench, ShieldCheck, Loader2, History, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LogEventDialog } from '@/components/log-event-dialog';
import { VehicleLog } from '@/types/autolog';

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
    try {
      const plate = searchPlate.toUpperCase().trim().replace(/\s/g, '');
      const q = query(collection(db, 'allVehicles'), where('licensePlate', '==', plate));
      const snap = await getDocs(q);

      if (snap.empty) {
        toast({ variant: "destructive", title: "Ej hittad", description: "Inget fordon med det registreringsnumret hittades." });
        setVehicle(null);
      } else {
        const vehicleData = snap.docs[0].data();
        setVehicle({ ...vehicleData, id: snap.docs[0].id });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAddVerifiedLog = async (newLog: Partial<VehicleLog>) => {
    if (!user || !vehicle || !db) return;

    try {
      const logsRef = collection(db, 'vehicleHistory', vehicle.licensePlate, 'logs');
      
      await addDoc(logsRef, {
        vehicleId: vehicle.id,
        licensePlate: vehicle.licensePlate,
        creatorId: user.uid,
        creatorName: user.displayName || 'Verkstad',
        category: newLog.category,
        eventDate: newLog.date,
        odometerReading: newLog.odometer,
        cost: newLog.cost || null,
        notes: newLog.notes,
        isVerifiedByWorkshop: true, // AUTO-VERIFIED
        documentProofUrls: newLog.photoUrl ? [newLog.photoUrl] : [],
        createdAt: serverTimestamp(),
      });

      // Update global odometer reading
      const globalRef = doc(db, 'allVehicles', vehicle.licensePlate);
      if (newLog.odometer && newLog.odometer > (vehicle.currentOdometerReading || 0)) {
        await updateDoc(globalRef, {
          currentOdometerReading: newLog.odometer,
          updatedAt: serverTimestamp(),
        });
      }

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
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Ange registreringsnummer (t.ex. ABC 123)" 
                className="pl-10 uppercase h-12"
                value={searchPlate}
                onChange={(e) => setSearchPlate(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sök fordon"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {vehicle && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="glass-card border-primary/20">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">{vehicle.make} {vehicle.model}</CardTitle>
                  <CardDescription>Senast uppdaterad: {new Date(vehicle.updatedAt?.toDate()).toLocaleDateString()}</CardDescription>
                </div>
                <Badge className="text-xl px-4 py-1 bg-white text-black font-bold border-2">
                  {vehicle.licensePlate}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white/5 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold">Mätarställning</p>
                  <p className="text-xl font-bold">{vehicle.currentOdometerReading?.toLocaleString()} mil</p>
                </div>
                <div className="p-4 bg-white/5 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold">Ägar-ID</p>
                  <p className="text-sm font-mono truncate">{vehicle.ownerId || "Ingen registrerad ägare"}</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Button className="flex-1 h-14 text-lg font-bold" onClick={() => setIsLogDialogOpen(true)}>
                  <ShieldCheck className="w-5 h-5 mr-2" /> Sätt Digital Stämpel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!vehicle && !loading && (
        <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
          <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <p className="text-muted-foreground">Sök efter en bil för att börja logga service.</p>
        </div>
      )}

      <LogEventDialog 
        isOpen={isLogDialogOpen} 
        onClose={() => setIsLogDialogOpen(false)} 
        onSubmit={handleAddVerifiedLog}
      />
    </div>
  );
}
