"use client";

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, Camera, CheckCircle2, ShieldCheck, Lock } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Vehicle, ServiceCategory } from '@/types/autolog';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { verifyServiceDocument } from '@/ai/flows/verify-service-document';
import { extractReceiptData } from '@/ai/flows/extract-receipt-data';

interface EditVehicleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
}

export function EditVehicleDialog({ isOpen, onClose, vehicle }: EditVehicleDialogProps) {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [aiVerified, setAiVerified] = useState(false);
  const [isInspectionDoc, setIsInspectionDoc] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    currentOdometerReading: vehicle.currentOdometerReading,
    description: vehicle.description || '',
  });

  const isLowering = formData.currentOdometerReading < vehicle.currentOdometerReading;
  const isBelowFloor = formData.currentOdometerReading < (vehicle.inspectionFloorOdometer || 0);
  
  // Strict rule: Lowering is ONLY allowed if it's an AI-verified Inspection AND not below the absolute floor
  const isIllegalOdometer = isLowering && (!aiVerified || !isInspectionDoc || isBelowFloor);

  useEffect(() => {
    if (vehicle) {
      setFormData({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        currentOdometerReading: vehicle.currentOdometerReading,
        description: vehicle.description || '',
      });
      setAiVerified(false);
      setIsInspectionDoc(false);
      setPhotoUrl(null);
    }
  }, [vehicle]);

  const handleNumberChange = (field: string, value: string) => {
    const parsed = parseInt(value);
    setFormData(prev => ({
      ...prev,
      [field]: isNaN(parsed) ? 0 : parsed
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVerifying(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUri = event.target?.result as string;
      setPhotoUrl(dataUri);
      
      try {
        const [verification, extraction] = await Promise.all([
          verifyServiceDocument({ photoDataUri: dataUri }),
          extractReceiptData({ receiptImageDataUri: dataUri })
        ]);

        if (verification.isServiceDocument && extraction.isInspection) {
          toast({
            title: "Besiktning verifierad!",
            description: "Mätarkorrigering godkänd via bildbevis.",
          });
          setAiVerified(true);
          setIsInspectionDoc(true);
          if (extraction.odometerReading) {
            setFormData(prev => ({ ...prev, currentOdometerReading: extraction.odometerReading || prev.currentOdometerReading }));
          }
        } else {
          toast({
            variant: "destructive",
            title: "Ogiltigt dokument",
            description: "Du måste ladda upp ett tydligt besiktningsprotokoll för att korrigera mätaren.",
          });
          setPhotoUrl(null);
        }
      } catch (error) {
        console.error("AI Error:", error);
      } finally {
        setVerifying(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db || !vehicle) return;

    if (isIllegalOdometer) {
      if (isBelowFloor) {
        toast({
          variant: "destructive",
          title: "Besiktningsgolv låst",
          description: `Mätaren kan aldrig sättas lägre än det senast verifierade värdet (${vehicle.inspectionFloorOdometer} mil).`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Mätarkorrigering kräver bildbevis",
          description: "Ladda upp ett besiktningsprotokoll för att sänka mätarställningen.",
        });
      }
      return;
    }

    setLoading(true);
    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const vehicleRef = doc(db, 'users', user.uid, 'vehicles', vehicle.id);
      const globalRef = doc(db, 'allVehicles', plate);
      
      const updates: any = {
        ...formData,
        updatedAt: serverTimestamp(),
      };

      if (isInspectionDoc && isLowering) {
        updates.inspectionFloorOdometer = formData.currentOdometerReading;
      }

      await updateDoc(vehicleRef, updates);
      await updateDoc(globalRef, {
        ...formData,
        updatedAt: serverTimestamp(),
        ...(isInspectionDoc && isLowering ? { inspectionFloorOdometer: formData.currentOdometerReading } : {})
      });

      // If it was a correction, log it in history too
      if (isLowering) {
        const logsRef = collection(db, 'vehicleHistory', plate, 'logs');
        await addDoc(logsRef, {
          vehicleId: vehicle.id,
          licensePlate: plate,
          creatorId: user.uid,
          category: 'Besiktning',
          eventDate: new Date().toISOString().split('T')[0],
          odometerReading: formData.currentOdometerReading,
          notes: 'Mätarkorrigering via verifierat besiktningsprotokoll.',
          type: 'Correction',
          isVerifiedByWorkshop: false,
          verificationSource: 'Official',
          documentProofUrls: photoUrl ? [photoUrl] : [],
          createdAt: serverTimestamp(),
        });
      }

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

        {isLowering && !aiVerified && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-4 animate-in fade-in slide-in-from-top-2">
            <Camera className="h-4 w-4" />
            <AlertTitle>Mätarkorrigering krävs</AlertTitle>
            <AlertDescription className="text-xs">
              Sänkning av mätaren kräver att du fotar ett besiktningsprotokoll som bevis.
            </AlertDescription>
          </Alert>
        )}

        {isBelowFloor && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-4">
            <Lock className="h-4 w-4" />
            <AlertTitle>Besiktningsgolv nått</AlertTitle>
            <AlertDescription className="text-xs">
              Mätaren kan inte sättas lägre än det verifierade golvet ({vehicle.inspectionFloorOdometer} mil).
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
              <Label htmlFor="edit-odometer" className={isLowering ? "text-destructive font-bold" : ""}>
                Mätare (mil)
              </Label>
              <Input 
                id="edit-odometer" 
                type="number" 
                className={`bg-white/5 ${isLowering ? 'border-destructive/50 ring-destructive/20' : ''}`}
                value={formData.currentOdometerReading || ''}
                onChange={(e) => handleNumberChange('currentOdometerReading', e.target.value)}
                required 
              />
            </div>
          </div>

          {isLowering && (
            <div 
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${aiVerified ? 'border-green-500 bg-green-500/5' : 'border-destructive bg-destructive/5'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {verifying ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : aiVerified ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <Camera className="w-6 h-6 text-destructive" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {aiVerified ? 'BEVIS GODKÄNT' : 'FOTA BESIKTNINGSPROTOKOLL'}
              </span>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
            </div>
          )}

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
            <Button type="submit" disabled={loading || isIllegalOdometer} className={isLowering ? 'bg-destructive hover:bg-destructive/90' : ''}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isLowering ? "Verifiera & Spara" : "Spara ändringar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
