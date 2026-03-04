"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Vehicle, Conversation } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface TransferOwnershipDialogProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
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
      const buyerName = selectedBuyerConvo.participantNames[buyerId] || selectedBuyerConvo.participantEmails?.[buyerId] || buyerId;

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
        notes: `Ägarbyte utförd via AutoLog. Ny registrerad ägare: ${buyerName}. Verifierad med kod: ${cleanTargetCode}`,
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
        description: `Bilen har nu överförts till ${buyerName}. Grattis till affären!`,
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
      <DialogContent className="sm:max-w-[425px] glass-card border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Slutför försäljning</DialogTitle>
          <DialogDescription>
            För att byta ägare på **{normalizedPlate}** måste du välja rätt köpare och mata in deras unika kod.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px]">1</span>
              Välj köpare
            </h4>
            {isLoadingConvos ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : potentialBuyers.length > 0 ? (
              <div className="grid gap-2">
                {potentialBuyers.map((convo) => {
                  const buyerId = convo.participants.find(p => p !== user?.uid)!;
                  const buyerName = convo.participantNames[buyerId] || convo.participantEmails?.[buyerId] || buyerId;
                  const isSelected = selectedBuyerConvo?.id === convo.id;

                  return (
                    <button
                      key={convo.id}
                      onClick={() => setSelectedBuyerConvo(convo)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${
                        isSelected 
                          ? 'bg-primary/20 border-primary shadow-lg shadow-primary/10' 
                          : 'bg-white/5 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/20 text-primary text-xs">
                            {buyerName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-bold text-sm block truncate max-w-[150px]">{buyerName}</span>
                          <span className="text-[10px] text-muted-foreground">Senaste kontakt: {convo.lastMessageAt?.toDate()?.toLocaleDateString()}</span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <Alert className="bg-white/5 border-dashed">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Inga köpare har kontaktat dig om denna bil via systemet än.
                </AlertDescription>
              </Alert>
            )}
          </section>

          {selectedBuyerConvo && (
            <section className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
              <Separator className="bg-white/5" />
              <div className="space-y-3">
                <Label htmlFor="buyerCode" className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px]">2</span>
                  Ange överlåtelsekod
                </Label>
                <div className="relative">
                  <Input 
                    id="buyerCode"
                    placeholder="6 siffror (t.ex. 123456)"
                    className={`h-14 text-center text-2xl font-mono font-bold tracking-widest transition-all ${codeError ? 'border-destructive ring-2 ring-destructive/20' : 'bg-white/5'}`}
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                  />
                  {enteredCode.length === 6 && !codeError && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 animate-in zoom-in">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground text-center px-4 leading-relaxed">
                  Be köparen titta högst upp i sin chatt med dig. Där ser de en blå ruta med den 6-siffriga koden.
                </p>
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t border-white/5">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="rounded-full">Avbryt</Button>
          <Button 
            onClick={handleTransfer} 
            disabled={!selectedBuyerConvo || enteredCode.length !== 6 || loading}
            className="font-bold min-w-[160px] rounded-full shadow-lg shadow-primary/20"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            Genomför ägarbyte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
