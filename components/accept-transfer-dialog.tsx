"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';

export function AcceptTransferDialog({ isOpen, onClose, vehicle }: { isOpen: boolean; onClose: () => void; vehicle: Vehicle }) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [sellerName, setSellerName] = useState<string>('Säljaren');
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const normalizedPlate = vehicle.licensePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');

  useEffect(() => {
    async function fetchSellerInfo() {
      if (!db || !vehicle.pendingTransferFrom) return;
      try {
        const sellerRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', vehicle.pendingTransferFrom);
        const snap = await getDoc(sellerRef);
        if (snap.exists()) {
          setSellerName(snap.data().name || 'Säljaren');
        }
      } catch (e) {
        console.error("Kunde inte hämta säljarinfo", e);
      }
    }
    if (isOpen) fetchSellerInfo();
  }, [isOpen, vehicle.pendingTransferFrom, db, appId]);

  const handleAccept = async () => {
    if (!user || !db || !vehicle) return;
    setLoading(true);
    setError(false);

    try {
      // 1. Verifiera koden genom att leta upp konversationen i rätt sökväg
      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      const q = query(convosRef, where('carId', '==', normalizedPlate), where('participants', 'array-contains', user.uid));
      const snap = await getDocs(q);
      
      const convo = snap.docs.find(d => d.data().transferCode === code.trim());

      if (!convo) {
        setError(true);
        toast({ variant: "destructive", title: "Fel kod", description: "Koden stämmer inte. Be säljaren kontrollera sin kod." });
        setLoading(false);
        return;
      }

      const batch = writeBatch(db);
      
      // 2. Uppdatera det globala registret med den nya ägaren
      const vehicleUpdate = {
        ownerId: user.uid,
        ownerName: user.displayName || 'Bilägare',
        ownerEmail: user.email,
        pendingTransferTo: null,
        pendingTransferFrom: null,
        inspectionFloorOdometer: vehicle.currentOdometerReading, 
        updatedAt: serverTimestamp(),
        isPublished: false 
      };
      
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', normalizedPlate);
      batch.update(globalRef, vehicleUpdate);

      // 3. Logga händelsen i bilens permanenta historik
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', normalizedPlate, 'logs');
      batch.set(doc(logsRef), {
        vehicleId: normalizedPlate,
        licensePlate: normalizedPlate,
        category: 'Ägarbyte',
        date: new Date().toISOString().split('T')[0],
        odometer: vehicle.currentOdometerReading,
        notes: `Ägarbyte slutfört via AutoLog. Ny ägare verifierad med kod. Mätarställning låst vid ${vehicle.currentOdometerReading} mil.`,
        creatorId: user.uid,
        creatorName: user.displayName || 'Ny ägare',
        createdAt: serverTimestamp(),
        approvalStatus: 'approved',
        verificationSource: 'Official'
      });

      // 4. Radera annonsen från marknadsplatsen
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', normalizedPlate));

      await batch.commit();
      toast({ title: "Affären slutförd!", description: "Bilen finns nu i ditt garage och mätaren är säkrad." });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] glass-card border-white/10 text-foreground rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Verifiera köp</DialogTitle>
          <DialogDescription>Mata in din överlåtelsekod för att ta över bilen från <span className="text-primary font-bold">{sellerName}</span>.</DialogDescription>
        </DialogHeader>
        
        <div className="py-6 space-y-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <KeyRound className="w-8 h-8" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Be säljaren om koden. Denna ges vanligtvis ut muntligt eller via meddelande när betalningen är klar.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest ml-1 opacity-60">Ange 6-siffrig kod</Label>
            <Input 
              placeholder="000 000" 
              className={`h-16 text-center text-3xl font-mono font-bold tracking-[0.3em] rounded-2xl ${error ? 'border-destructive ring-destructive/20' : 'bg-white/5 border-white/10'}`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="rounded-full flex-1">Avbryt</Button>
          <Button 
            onClick={handleAccept} 
            disabled={code.length !== 6 || loading} 
            className="font-bold h-14 rounded-full shadow-xl flex-[2]"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />} Slutför ägarbyte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}