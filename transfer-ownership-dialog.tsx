
"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
import { Vehicle, Conversation } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

/**
 * En underkomponent för att hämta och visa köparens information dynamiskt.
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
  const [buyerName, setBuyerName] = useState<string>('Hämtar namn...');
  const [buyerPhoto, setBuyerPhoto] = useState<string | null>(null);
  const buyerId = convo.participants.find(p => p !== currentUserId)!;

  useEffect(() => {
    const fetchBuyerProfile = async () => {
      if (!db || !buyerId) return;
      
      try {
        // 1. Försök hämta namnet från den publika profilen
        const profileRef = doc(db, 'public_profiles', buyerId);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          const actualName = data.name || data.displayName || data.fullName;
          if (actualName && actualName !== 'Köpare' && actualName !== 'User') {
            setBuyerName(actualName);
            setBuyerPhoto(data.photoUrl || data.photoURL || null);
            return;
          }
        }

        // 2. Fallback 1: Använd namnet som lagrades i konversationen vid skapandet
        const nameFromConvo = convo.participantNames[buyerId];
        if (nameFromConvo && nameFromConvo !== 'Köpare' && nameFromConvo !== 'Säljare') {
          setBuyerName(nameFromConvo);
          return;
        }

        // 3. Fallback 2: Använd e-postadressens första del
        const email = convo.participantEmails?.[buyerId];
        if (email) {
          setBuyerName(email.split('@')[0]);
          return;
        }

        // 4. Sista utväg
        setBuyerName('Användare');
      } catch (err) {
        console.error("Fel vid hämtning av köparprofil:", err);
        setBuyerName('Användare');
      }
    };

    fetchBuyerProfile();
  }, [db, buyerId, convo]);

  const initials = buyerName
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'KÖ';

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
      {isSelected && <CheckCircle2 className="w-6 h-6 text-primary animate-in zoom-in duration-300" />}
    </button>
  );
}

export function TransferOwnershipDialog({ isOpen, onClose, vehicle }: TransferOwnershipDialogProps) {
  const [loading, setLoading] = useState(false);
  const [selectedBuyerConvo, setSelectedBuyerConvo] = useState<Conversation | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const normalizedPlate = vehicle.licensePlate.toUpperCase().replace(/\s/g, '');

  const convosQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'conversations'), 
      where('carId', '==', normalizedPlate),
      where('participants', 'array-contains', user.uid)
    );
  }, [db, normalizedPlate, user?.uid]);

  const { data: conversations, isLoading: isLoadingConvos } = useCollection<Conversation>(convosQuery);

  const potentialBuyers = (conversations || []).filter(c => c.participants.length >= 2);

  const handleTransfer = async () => {
    if (!user || !db || !selectedBuyerConvo || !vehicle) return;
    
    const cleanEnteredCode = enteredCode.trim();
    const cleanTargetCode = (selectedBuyerConvo.transferCode || '').trim();

    if (!cleanTargetCode || cleanEnteredCode !== cleanTargetCode) {
      setCodeError(true);
      setTimeout(() => setCodeError(false), 2000);
      toast({ 
        variant: "destructive", 
        title: "Fel överlåtelsekod", 
        description: "Koden stämmer inte överens med köparens kod. Be köparen kontrollera sin chatt." 
      });
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const buyerId = selectedBuyerConvo.participants.find(p => p !== user.uid)!;
      
      const globalRef = doc(db, 'allVehicles', normalizedPlate);
      batch.update(globalRef, {
        ownerId: buyerId,
        updatedAt: serverTimestamp()
      });

      const logsRef = collection(db, 'vehicleHistory', normalizedPlate, 'logs');
      const logDocRef = doc(logsRef);
      batch.set(logDocRef, {
        vehicleId: vehicle.id,
        licensePlate: normalizedPlate,
        creatorId: user.uid,
        creatorName: user.displayName || user.email || 'Tidigare ägare',
        category: 'Service', 
        eventDate: new Date().toISOString().split('T')[0],
        odometerReading: vehicle.currentOdometerReading,
        notes: `Ägarbyte slutfört via AutoLog. Verifierad med kod: ${cleanTargetCode}`,
        isVerifiedByWorkshop: false,
        createdAt: serverTimestamp(),
      });

      const listingRef = doc(db, 'public_listings', normalizedPlate);
      batch.delete(listingRef);

      const privateRef = doc(db, 'users', user.uid, 'vehicles', vehicle.id);
      batch.update(privateRef, {
        isPublished: false,
        status: 'sold',
        transferredTo: buyerId,
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      toast({
        title: "Ägarbyte slutfört!",
        description: `Bilen har nu överförts till den nya ägaren.`,
      });
      onClose();
      reset();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Överföringen misslyckades",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelectedBuyerConvo(null);
    setEnteredCode('');
    setCodeError(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) reset(); onClose(); }}>
      <DialogContent className="sm:max-w-[450px] glass-card border-white/10 text-foreground rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Slutför försäljning</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Välj köparen i listan nedan och mata in deras överlåtelsekod.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <section className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-60 flex items-center gap-2 px-1">
              <span className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center">1</span>
              Identifiera köpare
            </h4>
            {isLoadingConvos ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary opacity-20" /></div>
            ) : potentialBuyers.length > 0 ? (
              <div className="grid gap-3 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                {potentialBuyers.map((convo) => (
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
              <Alert className="bg-white/5 border-dashed border-white/10 rounded-2xl">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Inga köpare har kontaktat dig om denna bil än. Köparen måste skicka ett meddelande i chatten först.
                </AlertDescription>
              </Alert>
            )}
          </section>

          {selectedBuyerConvo && (
            <section className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
              <Separator className="bg-white/5" />
              <div className="space-y-3">
                <Label htmlFor="buyerCode" className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2 px-1">
                  <span className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center">2</span>
                  Verifiera överlåtelsekod
                </Label>
                <div className="relative">
                  <Input 
                    id="buyerCode"
                    placeholder="6 siffror"
                    className={`h-14 text-center text-3xl font-mono font-bold tracking-[0.3em] transition-all rounded-2xl border-2 ${codeError ? 'border-destructive ring-4 ring-destructive/10' : 'bg-white/5 border-white/10 focus:border-primary/50 focus:ring-primary/20'}`}
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                  />
                  {enteredCode.length === 6 && !codeError && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500 animate-in zoom-in">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground text-center px-4 leading-relaxed italic opacity-70">
                  Köparen hittar sin unika kod längst upp i chatten med dig.
                </p>
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-6 border-t border-white/5">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="rounded-full h-12 flex-1 md:flex-none">Avbryt</Button>
          <Button 
            onClick={handleTransfer} 
            disabled={!selectedBuyerConvo || enteredCode.length !== 6 || loading}
            className="font-bold h-12 rounded-full shadow-xl shadow-primary/20 flex-1 md:flex-none md:min-w-[180px]"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            Slutför ägarbyte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
