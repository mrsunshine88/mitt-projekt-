
"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';

interface AddVehicleDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddVehicleDialog({ isOpen, onClose }: AddVehicleDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingHistoryFound, setExistingHistoryFound] = useState(false);
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    licensePlate: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    currentOdometerReading: 0,
  });

  const handleNumberChange = (field: string, value: string) => {
    const parsed = parseInt(value);
    setFormData(prev => ({
      ...prev,
      [field]: isNaN(parsed) ? 0 : parsed
    }));
  };

  const checkExistingVehicle = async (plate: string) => {
    if (!db) return;
    const normalizedPlate = plate.toUpperCase().trim().replace(/\s/g, '');
    if (normalizedPlate.length < 4) return;

    try {
      const globalRef = doc(db, 'allVehicles', normalizedPlate);
      const globalSnap = await getDoc(globalRef);
      if (globalSnap.exists()) {
        const data = globalSnap.data();
        if (!data.ownerId) {
          setExistingHistoryFound(true);
        } else if (data.ownerId !== user?.uid) {
          setError("Detta fordon är redan registrerat av en annan aktiv användare.");
        } else {
          setError("Du har redan detta fordon i ditt garage.");
        }
      } else {
        setExistingHistoryFound(false);
        setError(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db) return;
    setError(null);

    if (!formData.make) {
      setError("Vänligen välj ett bilmärke.");
      return;
    }

    setLoading(true);
    try {
      const plate = formData.licensePlate.toUpperCase().trim().replace(/\s/g, '');
      const globalRef = doc(db, 'allVehicles', plate);
      const globalSnap = await getDoc(globalRef);
      
      if (globalSnap.exists()) {
        const existingData = globalSnap.data();
        if (existingData.ownerId && existingData.ownerId !== user.uid) {
          setError("Detta fordon är redan registrerat av en annan användare. Kontakta support om detta är felaktigt.");
          setLoading(false);
          return;
        }
      }

      const vehiclesRef = collection(db, 'users', user.uid, 'vehicles');
      const publicShareId = Math.random().toString(36).substring(2, 9).toUpperCase();

      await addDoc(vehiclesRef, {
        ...formData,
        licensePlate: plate,
        ownerId: user.uid,
        publicShareId,
        isPublished: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(globalRef, {
        licensePlate: plate,
        ownerId: user.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      toast({
        title: existingHistoryFound ? "Historik återställd!" : "Fordon tillagt!",
        description: existingHistoryFound 
          ? `Bilen hittades i systemet och dess tidigare historik har nu kopplats till ditt konto.`
          : `${formData.make} ${formData.model} har sparats i ditt garage.`,
      });
      onClose();
      resetForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ett fel uppstod",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      licensePlate: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      currentOdometerReading: 0,
    });
    setError(null);
    setExistingHistoryFound(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open) resetForm(); onClose(); }}>
      <DialogContent className="sm:max-w-[425px] glass-card border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Lägg till fordon</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Registrera din bil för att hämta dess historik eller börja logga nytt.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {existingHistoryFound && !error && (
          <Alert className="bg-green-500/10 border-green-500/20 text-green-400">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Historik hittad!</AlertTitle>
            <AlertDescription>Det finns tidigare verifierad historik för detta fordon som kommer att kopplas till ditt konto.</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="licensePlate">Registreringsnummer</Label>
            <Input 
              id="licensePlate" 
              placeholder="ABC 123" 
              className="bg-white/5 uppercase"
              value={formData.licensePlate}
              onChange={(e) => {
                setFormData({...formData, licensePlate: e.target.value.toUpperCase()});
                checkExistingVehicle(e.target.value);
              }}
              required 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="make">Märke</Label>
              <Select value={formData.make} onValueChange={(v) => setFormData({...formData, make: v})}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Välj märke" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {SWEDISH_CAR_BRANDS.map(brand => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modell</Label>
              <Input 
                id="model" 
                placeholder="T.ex. Model 3" 
                className="bg-white/5"
                value={formData.model}
                onChange={(e) => setFormData({...formData, model: e.target.value})}
                required 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Årsmodell</Label>
              <Input 
                id="year" 
                type="number" 
                className="bg-white/5"
                value={formData.year || ''}
                onChange={(e) => handleNumberChange('year', e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="odometer">Mätarställning (mil)</Label>
              <Input 
                id="odometer" 
                type="number" 
                className="bg-white/5"
                value={formData.currentOdometerReading || ''}
                onChange={(e) => handleNumberChange('currentOdometerReading', e.target.value)}
                required 
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={onClose}>Avbryt</Button>
            <Button type="submit" disabled={loading || !!error}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingHistoryFound ? "Hämta & Spara" : "Spara fordon"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
