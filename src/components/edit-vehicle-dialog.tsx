
"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Vehicle } from '@/types/autolog';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EditVehicleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
}

export function EditVehicleDialog({ isOpen, onClose, vehicle }: EditVehicleDialogProps) {
  const [loading, setLoading] = useState(false);
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    currentOdometerReading: vehicle.currentOdometerReading,
    description: vehicle.description || '',
  });

  const isInvalidOdometer = formData.currentOdometerReading < vehicle.currentOdometerReading;

  useEffect(() => {
    if (vehicle) {
      setFormData({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        currentOdometerReading: vehicle.currentOdometerReading,
        description: vehicle.description || '',
      });
    }
  }, [vehicle]);

  const handleNumberChange = (field: string, value: string) => {
    const parsed = parseInt(value);
    setFormData(prev => ({
      ...prev,
      [field]: isNaN(parsed) ? 0 : parsed
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db || !vehicle) return;

    if (isInvalidOdometer) {
      toast({
        variant: "destructive",
        title: "Mätarskruvning ej tillåten",
        description: `Mätarställningen kan inte vara lägre än den senast registrerade (${vehicle.currentOdometerReading} mil).`,
      });
      return;
    }

    setLoading(true);
    try {
      const vehicleRef = doc(db, 'users', user.uid, 'vehicles', vehicle.id);
      await updateDoc(vehicleRef, {
        ...formData,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Fordon uppdaterat",
        description: "Dina ändringar har sparats.",
      });
      onClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Kunde inte spara",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] glass-card border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Redigera fordon</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Uppdatera informationen om din {vehicle.licensePlate}.
          </DialogDescription>
        </DialogHeader>

        {isInvalidOdometer && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-4 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Ogiltig mätarställning</AlertTitle>
            <AlertDescription>
              Mätarställningen kan inte vara lägre än den senast registrerade ({vehicle.currentOdometerReading} mil).
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-make">Märke</Label>
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
              <Label htmlFor="edit-model">Modell</Label>
              <Input 
                id="edit-model" 
                className="bg-white/5"
                value={formData.model}
                onChange={(e) => setFormData({...formData, model: e.target.value})}
                required 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-year">Årsmodell</Label>
              <Input 
                id="edit-year" 
                type="number" 
                className="bg-white/5"
                value={formData.year || ''}
                onChange={(e) => handleNumberChange('year', e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-odometer" className={isInvalidOdometer ? "text-destructive font-bold" : ""}>
                Mätarställning (mil)
              </Label>
              <Input 
                id="edit-odometer" 
                type="number" 
                className={`bg-white/5 ${isInvalidOdometer ? 'border-destructive/50 ring-destructive/20' : ''}`}
                value={formData.currentOdometerReading || ''}
                onChange={(e) => handleNumberChange('currentOdometerReading', e.target.value)}
                required 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-desc">Beskrivning</Label>
            <Textarea 
              id="edit-desc"
              className="bg-white/5 min-h-[100px]"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Beskriv bilen..."
            />
          </div>

          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={onClose}>Avbryt</Button>
            <Button type="submit" disabled={loading || isInvalidOdometer}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spara ändringar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
