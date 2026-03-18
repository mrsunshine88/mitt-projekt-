
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, ArrowRight, AlertCircle, UserCircle, Search, Clock } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, Conversation } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';

/**
 * En underkomponent för att hämta och visa köparens information dynamiskt.
 * Designad för touch-vänlighet (min 48px höjd).
 */
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
  const [buyerName, setBuyerName] = useState<string>('Hämtar...');
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

  const lastActive = convo.updatedAt?.toDate ? convo.updatedAt.toDate() : new Date();

  return (
    <button
      type="button"
      onClick={() => onSelect(convo)}
      className={`w-full flex items-center justify-between p-4 min-h-[72px] rounded-2xl transition-all border mb-2 outline-none focus:ring-2 ring-primary/50 ${
        isSelected ? 'bg-primary/10 border-primary shadow-lg shadow-primary/5' : 'bg-white/5 border-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center gap-4 text-left min-w-0">
        <Avatar className="h-12 w-12 border border-white/10 shrink-0">
          <AvatarImage src={buyerPhoto || ""} />
          <AvatarFallback className="bg-primary/20 text-primary font-bold">
            {buyerName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex flex-col">
          <span className="font-bold text-base text-white truncate">{buyerName}</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            Aktiv {formatDistanceToNow(lastActive, { addSuffix: true, locale: sv })}
          </span>
        </div>
      </div>
      <div className="shrink-0 ml-4">
        {isSelected ? (
          <CheckCircle2 className="w-6 h-6 text-primary animate-in zoom-in" />
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-white/10" />
        )}
      </div>
    </button>
  );
}

export function TransferOwnershipDialog({ isOpen, onClose, vehicle }: { isOpen: boolean; onClose: () => void; vehicle: Vehicle }) {
  const [loading, setLoading] = useState(false);
  const [selectedBuyerConvo, setSelectedBuyerConvo] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const normalizedPlate = vehicle.licensePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');

  // KRITISKT: Vi filtrerar på 'sellerId' så att gamla chattar (där nuvarande ägare var köpare) döljs.
  const convosRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'conversations'),
      where('carId', '==', normalizedPlate),
      where('sellerId', '==', user.uid)
    );
  }, [db, user?.uid, appId, normalizedPlate]);

  const { data: rawConversations, isLoading: isLoadingConvos } = useCollection<Conversation>(convosRef);

  // Kontextstyrd filtrering: Ta endast med marknadsplats-chattar och dölj raderade/service-chattar
  const filteredBuyers = useMemo(() => {
    if (!rawConversations || !user) return [];
    return rawConversations.filter(c => {
      // 1. Filtrera bort service-chattar och support-chattar
      if (c.type === 'SERVICE' || c.type === 'SUPPORT' || c.carId === 'SUPPORT') {
        return false;
      }

      const buyerId = c.participants.find(p => p !== user.uid);
      const buyerName = (c.participantNames[buyerId || ''] || '').toLowerCase();
      
      // 2. Kontrollera om användaren har raderat/dolt chatten
      const isHidden = c.hiddenFrom?.includes(user.uid);
      
      return !isHidden && buyerName.includes(searchQuery.toLowerCase());
    });
  }, [rawConversations, user, searchQuery]);

  const handleInitiate = async () => {
    if (!user || !db || !selectedBuyerConvo || !vehicle) return;
    setLoading(true);
    try {
      const buyerId = selectedBuyerConvo.participants.find(p => p !== user.uid)!;
      
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', normalizedPlate);
      await setDoc(globalRef, { 
        pendingTransferTo: buyerId,
        pendingTransferFrom: user.uid,
        updatedAt: serverTimestamp() 
      }, { merge: true });

      const privateRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', normalizedPlate);
      await setDoc(privateRef, { 
        pendingTransferTo: buyerId,
        updatedAt: serverTimestamp() 
      }, { merge: true });

      toast({ 
        title: "Överlåtelse påbörjad!", 
        description: "Be köparen godkänna i sitt garage med koden i chatten." 
      });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally { setLoading(false); }
  };

  const reset = () => {
    setSearchQuery('');
    setSelectedBuyerConvo(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[480px] glass-card border-white/10 text-foreground rounded-[2.5rem] p-0 overflow-hidden flex flex-col h-[90vh] sm:h-auto sm:max-h-[85vh]">
        <div className="p-8 pb-4">
          <DialogHeader>
            <DialogTitle className="text-3xl font-headline font-bold text-white">Välj köpare</DialogTitle>
            <DialogDescription className="text-slate-400">
              Endast personer du pratat med gällande <span className="text-primary font-bold">{vehicle.licensePlate}</span> via marknadsplatsen visas här.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-8 pb-4">
          <div className="relative sticky top-0 z-10 bg-background/50 backdrop-blur-md rounded-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Sök bland intresserade köpare..." 
              className="h-12 pl-11 bg-white/5 border-white/10 rounded-xl focus:ring-primary/20 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-2 custom-scrollbar">
          {isLoadingConvos ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="animate-spin text-primary w-8 h-8 opacity-40" />
              <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Hämtar intressenter...</p>
            </div>
          ) : filteredBuyers.length > 0 ? (
            <div className="pb-4">
              {filteredBuyers.map((convo) => (
                <BuyerItem 
                  key={convo.id} 
                  convo={convo} 
                  currentUserId={user?.uid || ''} 
                  isSelected={selectedBuyerConvo?.id === convo.id} 
                  onSelect={setSelectedBuyerConvo} 
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4 bg-white/5 rounded-3xl border-dashed border-2 border-white/5">
              <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground opacity-20" />
              </div>
              <div className="px-6">
                <p className="font-bold text-slate-300">Inga köpare hittades</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Köparen måste ha kontaktat dig via bilannonsen för att visas här. Service-chattar med verkstäder döljs automatiskt för din säkerhet.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 pt-4 bg-white/5 border-t border-white/10 mt-auto">
          <DialogFooter className="gap-3 sm:gap-2">
            <Button 
              variant="ghost" 
              onClick={() => { reset(); onClose(); }} 
              disabled={loading} 
              className="h-14 rounded-2xl flex-1 hover:bg-white/5"
            >
              Avbryt
            </Button>
            <Button 
              onClick={handleInitiate} 
              disabled={!selectedBuyerConvo || loading} 
              className="h-14 rounded-2xl font-bold text-lg shadow-xl shadow-primary/20 flex-[2]"
            >
              {loading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <><ArrowRight className="mr-2 w-5 h-5" /> Skicka förfrågan</>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
