
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, Conversation } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

function BuyerItem({ 
  convo, 
  currentUserId, 
  isSelected, 
  onSelect 
}: { 
  convo: Conversation; 
  currentUserId: string; 
  isSelected: boolean;
  onSelect: (convo: Conversation) => void;
}) {
  const db = useFirestore();
  const [buyerName, setBuyerName] = useState<string>('Hämtar namn...');
  const [buyerPhoto, setBuyerPhoto] = useState<string | null>(null);
  const buyerId = convo.participants.find(p => p !== currentUserId)!;
  const appId = firebaseConfig.projectId;

  useEffect(() => {
    const fetchBuyerProfile = async () => {
      if (!db || !buyerId) return;
      try {
        const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', buyerId);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          setBuyerName(data.name || data.displayName || 'Användare');
          setBuyerPhoto(data.photoUrl || null);
        } else {
          setBuyerName(convo.participantNames[buyerId] || 'Användare');
        }
      } catch (err) {
        setBuyerName('Användare');
      }
    };
    fetchBuyerProfile();
  }, [db, buyerId, convo, appId]);

  const initials = buyerName.substring(0, 2).toUpperCase();

  return (
    <button
      onClick={() => onSelect(convo)}
      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${
        isSelected 
          ? 'bg-primary/10 border-primary shadow-lg shadow-primary/5' 
          : 'bg-white/5 border-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center gap-4 text-left">
        <Avatar className="h-12 w-12 border border-white/10 shadow-sm">
          <AvatarImage src={buyerPhoto || ""} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <span className="font-bold text-base block truncate max-w-[200px]">{buyerName}</span>
          <span className="text-[10px] text-muted-foreground block uppercase tracking-wider mt-0.5">
            Senaste kontakt: {convo.lastMessageAt?.toDate ? convo.lastMessageAt.toDate().toLocaleDateString() : 'Nyligen'}
          </span>
        </div>
      </div>
      {isSelected && <CheckCircle2 className="w-6 h-6 text-primary animate-in zoom-in" />}
    </button>
  );
}

export function TransferOwnershipDialog({ isOpen, onClose, vehicle }: { isOpen: boolean; onClose: () => void; vehicle: Vehicle }) {
  const [loading, setLoading] = useState(false);
  const [selectedBuyerConvo, setSelectedBuyerConvo] = useState<Conversation | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const normalizedPlate = vehicle.licensePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  const appId = firebaseConfig.projectId;

  const convosRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
  }, [db, user?.uid, appId]);

  const { data: rawConversations, isLoading: isLoadingConvos } = useCollection<Conversation>(convosRef);

  const potentialBuyers = useMemo(() => {
    if (!rawConversations || !user) return [];
    // Filtrera fram köpare som pratat om JUST denna bil OCH som inte har raderat chatten (hiddenFor)
    return rawConversations.filter(c => {
      const convoPlate = (c.carId || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      const isHidden = c.hiddenFor?.includes(user.uid);
      return convoPlate === normalizedPlate && c.participants.length >= 2 && !isHidden;
    });
  }, [rawConversations, user, normalizedPlate]);

  const handleTransfer = async () => {
    if (!user || !db || !selectedBuyerConvo || !vehicle) return;
    
    const cleanEnteredCode = enteredCode.trim();
    const cleanTargetCode = (selectedBuyerConvo.transferCode || '').trim();

    if (!cleanTargetCode || cleanEnteredCode !== cleanTargetCode) {
      setCodeError(true);
      setTimeout(() => setCodeError(false), 2000);
      toast({ variant: "destructive", title: "Fel överlåtelsekod" });
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const buyerId = selectedBuyerConvo.participants.find(p => p !== user.uid)!;
      
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', normalizedPlate), { ownerId: buyerId, updatedAt: serverTimestamp() });
      
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', normalizedPlate, 'logs');
      batch.set(doc(logsRef), {
        vehicleId: normalizedPlate, 
        licensePlate: normalizedPlate, 
        creatorId: user.uid, 
        creatorName: user.displayName || 'Tidigare ägare',
        category: 'Service', 
        date: new Date().toISOString().split('T')[0], 
        odometer: vehicle.currentOdometerReading,
        notes: `Ägarbyte slutfört med kod: ${cleanTargetCode}`, 
        createdAt: serverTimestamp(),
      });
      
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', normalizedPlate));
      batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', normalizedPlate), { isPublished: false, status: 'sold', transferredTo: buyerId, updatedAt: serverTimestamp() });

      await batch.commit();
      toast({ title: "Ägarbyte slutfört!" });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setSelectedBuyerConvo(null); setEnteredCode(''); setCodeError(false); };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) reset(); onClose(); }}>
      <DialogContent className="sm:max-w-[450px] glass-card border-white/10 text-foreground rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Slutför försäljning</DialogTitle>
          <DialogDescription>Välj köparen och mata in deras överlåtelsekod.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          <section className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-60">1. Identifiera köpare</h4>
            {isLoadingConvos ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
            ) : potentialBuyers.length > 0 ? (
              <div className="grid gap-3 max-h-[280px] overflow-y-auto pr-2">
                {potentialBuyers.map((convo) => (
                  <BuyerItem key={convo.id} convo={convo} currentUserId={user?.uid || ''} isSelected={selectedBuyerConvo?.id === convo.id} onSelect={setSelectedBuyerConvo} />
                ))}
              </div>
            ) : (
              <Alert className="bg-white/5 border-dashed rounded-2xl">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Inga aktiva köpare hittades för denna bil. Köparen måste ha en öppen chatt med dig.
                </AlertDescription>
              </Alert>
            )}
          </section>
          {selectedBuyerConvo && (
            <section className="space-y-4 animate-in fade-in slide-in-from-top-2">
              <Separator className="bg-white/5" />
              <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">2. Verifiera överlåtelsekod</Label>
              <Input placeholder="6 siffror" className={`h-14 text-center text-3xl font-mono font-bold tracking-[0.3em] rounded-2xl ${codeError ? 'border-destructive' : 'bg-white/5'}`} value={enteredCode} onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </section>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="rounded-full h-12">Avbryt</Button>
          <Button onClick={handleTransfer} disabled={!selectedBuyerConvo || enteredCode.length !== 6 || loading} className="font-bold h-12 rounded-full shadow-xl shadow-primary/20 flex-1">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />} Slutför ägarbyte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
