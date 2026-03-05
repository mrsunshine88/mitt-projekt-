"use client";

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, ArrowRight, AlertCircle, UserCircle } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, Conversation } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
          setBuyerName(data.name || 'Användare');
          setBuyerPhoto(data.photoUrl || null);
        } else {
          setBuyerName(convo.participantNames[buyerId] || 'Användare');
        }
      } catch (err) { setBuyerName('Användare'); }
    };
    fetchBuyerProfile();
  }, [db, buyerId, convo, appId]);

  return (
    <button
      onClick={() => onSelect(convo)}
      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${
        isSelected ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center gap-4 text-left">
        <Avatar className="h-12 w-12">
          <AvatarImage src={buyerPhoto || ""} />
          <AvatarFallback className="bg-primary/20 text-primary">{buyerName[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <span className="font-bold text-base block truncate">{buyerName}</span>
          <span className="text-[10px] text-muted-foreground block uppercase">Köpare</span>
        </div>
      </div>
      {isSelected && <CheckCircle2 className="w-6 h-6 text-primary animate-in zoom-in" />}
    </button>
  );
}

export function TransferOwnershipDialog({ isOpen, onClose, vehicle }: { isOpen: boolean; onClose: () => void; vehicle: Vehicle }) {
  const [loading, setLoading] = useState(false);
  const [selectedBuyerConvo, setSelectedBuyerConvo] = useState<Conversation | null>(null);
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const normalizedPlate = vehicle.licensePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');

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
    return rawConversations.filter(c => {
      const convoPlate = (c.carId || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      const isHidden = c.hiddenFor?.includes(user.uid);
      return convoPlate === normalizedPlate && c.participants.length >= 2 && !isHidden;
    });
  }, [rawConversations, user, normalizedPlate]);

  const handleInitiate = async () => {
    if (!user || !db || !selectedBuyerConvo || !vehicle) return;
    setLoading(true);
    try {
      const buyerId = selectedBuyerConvo.participants.find(p => p !== user.uid)!;
      
      // Vi sätter "pendingTransferTo" i det globala registret.
      // Bilen stannar hos säljaren tills köparen godkänner.
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', normalizedPlate);
      await setDoc(globalRef, { 
        pendingTransferTo: buyerId,
        pendingTransferFrom: user.uid,
        updatedAt: serverTimestamp() 
      }, { merge: true });

      // Uppdatera även säljarens egna kopia
      const privateRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', normalizedPlate);
      await setDoc(privateRef, { 
        pendingTransferTo: buyerId,
        updatedAt: serverTimestamp() 
      }, { merge: true });

      toast({ 
        title: "Överlåtelse påbörjad!", 
        description: "Be köparen gå in i sitt garage för att slutföra köpet med koden i chatten." 
      });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] glass-card border-white/10 text-foreground rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Välj köpare</DialogTitle>
          <DialogDescription>Vem ska få ta över bilens digitala historik?</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          <section className="space-y-4">
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
                <AlertDescription className="text-xs">Inga aktiva köpare hittades i din inkorg för denna bil.</AlertDescription>
              </Alert>
            )}
          </section>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="rounded-full">Avbryt</Button>
          <Button onClick={handleInitiate} disabled={!selectedBuyerConvo || loading} className="font-bold h-12 rounded-full shadow-xl flex-1">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />} Skicka överlåtelseförfrågan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}