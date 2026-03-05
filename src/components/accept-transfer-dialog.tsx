"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck, ArrowRight, KeyRound } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, writeBatch, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, Conversation } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';
import { sanitize } from '@/lib/utils';

export function AcceptTransferDialog({ isOpen, onClose, vehicle }: { isOpen: boolean; onClose: () => void; vehicle: Vehicle }) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const normalizedPlate = vehicle.licensePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');

  const handleAccept = async () => {
    if (!user || !db || !vehicle) return;
    setLoading(true);
    setError(false);

    try {
      // 1. Hämta konversationen för att verifiera koden
      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      const q = query(convosRef, where('carId', '==', normalizedPlate), where('participants', 'array-contains', user.uid));
      const snap = await getDocs(q);
      
      const convo = snap.docs.find(d => d.data().transferCode === code.trim());

      if (!convo) {
        setError(true);
        toast({ variant: "destructive", title: "Fel kod", description: "Koden stämmer inte. Kontrollera din chatt." });
        setLoading(false);
        return;
      }

      const convoData = convo.data();
      const sellerId = convoData.participants.find((p: string) => p !== user.uid);

      const batch = writeBatch(db);
      
      // 2. Uppdatera det globala registret: Ny ägare, nolla pending
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', normalizedPlate);
      const vehicleUpdate = {
        ownerId: user.uid,
        ownerName: user.displayName || 'Bilägare',
        ownerEmail: user.email,
        pendingTransferTo: null,
        pendingTransferFrom: null,
        updatedAt: serverTimestamp(),
        isPublished: false
      };
      batch.update(globalRef, vehicleUpdate);

      // 3. Lägg till i Köparens privata garage
      const buyerPrivateRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', normalizedPlate);
      batch.set(buyerPrivateRef, sanitize({ ...vehicle, ...vehicleUpdate }), { merge: true });

      // 4. Radera från Säljarens privata garage
      if (sellerId) {
        const sellerPrivateRef = doc(db, 'artifacts', appId, 'users', sellerId, 'vehicles', normalizedPlate);
        batch.delete(sellerPrivateRef);
      }

      // 5. Logga ägarbytet i historiken
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', normalizedPlate, 'logs');
      batch.set(doc(logsRef), {
        vehicleId: normalizedPlate,
        licensePlate: normalizedPlate,
        category: 'Service',
        date: new Date().toISOString().split('T')[0],
        odometer: vehicle.currentOdometerReading,
        notes: `Ägarbyte slutfört via AutoLog. Ny ägare verifierad med kod.`,
        creatorId: user.uid,
        creatorName: user.displayName || 'Ny ägare',
        createdAt: serverTimestamp(),
        approvalStatus: 'approved'
      });

      // 6. Ta bort annonsen om den fanns
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', normalizedPlate));

      await batch.commit();
      toast({ title: "Affären slutförd!", description: "Bilen finns nu i ditt garage." });
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
          <DialogDescription>Mata in din överlåtelsekod för att ta över {vehicle.licensePlate}.</DialogDescription>
        </DialogHeader>
        
        <div className="py-6 space-y-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <KeyRound className="w-8 h-8" />
            </div>
            <p className="text-xs text-muted-foreground">Koden hittar du längst upp i din chatt med säljaren.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest ml-1">Överlåtelsekod</Label>
            <Input 
              placeholder="6 siffror" 
              className={`h-16 text-center text-3xl font-mono font-bold tracking-[0.3em] rounded-2xl ${error ? 'border-destructive' : 'bg-white/5'}`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="rounded-full">Avbryt</Button>
          <Button 
            onClick={handleAccept} 
            disabled={code.length !== 6 || loading} 
            className="font-bold h-14 rounded-full shadow-xl flex-1"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />} Slutför ägarbyte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}