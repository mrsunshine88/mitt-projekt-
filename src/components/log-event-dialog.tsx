
"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Camera, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Lock, User, Building2, Upload } from 'lucide-react';
import { VehicleLog, ServiceCategory, PerformedBy } from '@/types/autolog';
import { verifyServiceDocument } from '@/ai/flows/verify-service-document';
import { extractReceiptData } from '@/ai/flows/extract-receipt-data';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface LogEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (log: Partial<VehicleLog>) => void;
  currentOdometer?: number;
  inspectionFloor?: number; // The latest official inspection value
  licensePlate?: string;
  lastUpdateAt?: any;
}

export function LogEventDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  currentOdometer = 0, 
  inspectionFloor = 0,
  licensePlate = "", 
  lastUpdateAt 
}: LogEventDialogProps) {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [plateMismatch, setPlateMismatch] = useState<string | null>(null);
  const [manipulationAlert, setManipulationAlert] = useState<string | null>(null);
  const [aiVerified, setAiVerified] = useState(false);
  const [isInspectionDoc, setIsInspectionDoc] = useState(false);
  
  const [formData, setFormData] = useState<Partial<VehicleLog>>({
    category: 'Service',
    date: new Date().toISOString().split('T')[0],
    odometer: currentOdometer,
    cost: 0,
    notes: '',
    performedBy: 'Owner'
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isLowering = formData.odometer !== undefined && formData.odometer < currentOdometer;
  const isBelowFloor = formData.odometer !== undefined && formData.odometer < inspectionFloor;
  const isIllegalOdometer = isLowering && (!isInspectionDoc || isBelowFloor);

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({ ...prev, odometer: currentOdometer, performedBy: 'Owner' }));
      setPlateMismatch(null);
      setManipulationAlert(null);
      setAiVerified(false);
      setIsInspectionDoc(false);
    }
  }, [isOpen, currentOdometer]);

  const handleNumberChange = (field: keyof VehicleLog, value: string) => {
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
    setPlateMismatch(null);
    setManipulationAlert(null);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUri = event.target?.result as string;
      
      try {
        const [verification, extraction] = await Promise.all([
          verifyServiceDocument({ photoDataUri: dataUri }),
          extractReceiptData({ receiptImageDataUri: dataUri })
        ]);

        if (verification.isServiceDocument) {
          if (extraction.manipulationRisk !== 'low') {
            setManipulationAlert(extraction.manipulationReason || "AI har upptäckt potentiell manipulation av siffror i dokumentet.");
          }

          const extractedPlate = extraction.licensePlate?.toUpperCase().replace(/\s/g, '');
          const currentPlate = licensePlate.toUpperCase().replace(/\s/g, '');
          
          if (extractedPlate && extractedPlate !== currentPlate) {
            setPlateMismatch(extractedPlate);
          }

          const docOdo = extraction.odometerReading || 0;
          
          toast({
            title: extraction.isInspection ? "Besiktning identifierad!" : "Dokument verifierat!",
            description: "AI har fyllt i detaljerna åt dig.",
          });
          
          setAiVerified(true);
          setIsInspectionDoc(!!extraction.isInspection);
          
          setFormData(prev => ({
            ...prev,
            photoUrl: dataUri,
            category: extraction.isInspection ? 'Besiktning' : ((extraction.category as ServiceCategory) || prev.category),
            date: extraction.date || prev.date,
            odometer: docOdo || prev.odometer,
            cost: extraction.totalCost || prev.cost,
            notes: extraction.serviceSummary || prev.notes,
            orgNumber: extraction.organizationNumber,
            isVerified: true,
            isLocked: true,
            performedBy: extraction.isInspection ? 'Workshop' : 'Workshop',
            verificationSource: extraction.isInspection ? 'Official' : 'AI'
          }));
        } else {
          toast({
            variant: "destructive",
            title: "Ej ett servicedokument",
            description: "Bilden kunde inte verifieras som ett giltigt underlag.",
          });
        }
      } catch (error) {
        console.error("AI Error:", error);
      } finally {
        setVerifying(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (manipulationAlert) {
      toast({
        variant: "destructive",
        title: "Säkerhetsspärr",
        description: "Dokumentet nekas pga risk för manipulation.",
      });
      return;
    }

    if (isIllegalOdometer) {
      toast({
        variant: "destructive",
        title: "Otillåten mätarställning",
        description: isBelowFloor ? "Värdet understiger besiktningsgolvet." : "Sänkning kräver verifierad besiktning.",
      });
      return;
    }

    setLoading(true);
    onSubmit({ 
      ...formData, 
      type: isLowering ? 'Correction' : 'Update', 
      isVerified: aiVerified,
      verificationSource: aiVerified ? formData.verificationSource : 'User'
    });
    setLoading(false);
    reset();
  };

  const reset = () => {
    setFormData({
      category: 'Service',
      date: new Date().toISOString().split('T')[0],
      odometer: currentOdometer,
      cost: 0,
      notes: '',
      performedBy: 'Owner'
    });
    setAiVerified(false);
    setIsInspectionDoc(false);
    setPlateMismatch(null);
    setManipulationAlert(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-[500px] glass-card border-white/10 text-foreground overflow-y-auto max-h-[95vh] rounded-3xl p-6">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-2xl font-headline flex items-center gap-2">
            Logga händelse
            {aiVerified && <ShieldCheck className="w-6 h-6 text-green-400" />}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Fota besiktning eller kvitto för att verifiera bilens historik och mätarställning.
          </DialogDescription>
        </DialogHeader>

        {isIllegalOdometer && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-4 rounded-2xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Otillåten mätarställning</AlertTitle>
            <AlertDescription className="text-xs">
              {isBelowFloor 
                ? `Värdet understiger bilens lägsta tillåtna nivå (${inspectionFloor} mil).`
                : `Du försöker sänka miltalet utan ett besiktningsprotokoll.`}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Dokumentation</Label>
            <div 
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all touch-target h-40 ${aiVerified ? 'border-green-500 bg-green-500/5' : 'border-white/10 active:scale-[0.98] bg-white/5'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {verifying ? (
                <>
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-sm font-bold animate-pulse text-primary uppercase tracking-widest">AI Skannar...</p>
                </>
              ) : aiVerified ? (
                <>
                  <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="text-sm font-bold text-green-400 uppercase">{isInspectionDoc ? 'Besiktning klar' : 'Kvitto verifierat'}</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-lg">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold uppercase">Fota dokument</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Öppnar mobilkameran</p>
                  </div>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                capture="environment" // Forces back camera on mobile
                onChange={handleFileChange} 
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Utförd av</Label>
            <RadioGroup 
              value={formData.performedBy} 
              onValueChange={(v) => setFormData({...formData, performedBy: v as PerformedBy})}
              className="flex gap-4"
            >
              <div className="flex-1">
                <RadioGroupItem value="Owner" id="owner-diy" className="sr-only" />
                <Label 
                  htmlFor="owner-diy" 
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${formData.performedBy === 'Owner' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-transparent opacity-60'}`}
                >
                  <User className="w-4 h-4" /> Eget
                </Label>
              </div>
              <div className="flex-1">
                <RadioGroupItem value="Workshop" id="workshop-pro" className="sr-only" />
                <Label 
                  htmlFor="workshop-pro" 
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${formData.performedBy === 'Workshop' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-transparent opacity-60'}`}
                >
                  <Building2 className="w-4 h-4" /> Verkstad
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase opacity-60">Kategori</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v as ServiceCategory})}>
                <SelectTrigger className="h-12 bg-white/5 border-white/10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Service">Service</SelectItem>
                  <SelectItem value="Reparation">Reparation</SelectItem>
                  <SelectItem value="Däck">Däck</SelectItem>
                  <SelectItem value="Besiktning">Besiktning</SelectItem>
                  <SelectItem value="Uppgradering">Uppgradering</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase opacity-60">Datum</Label>
              <Input 
                type="date" 
                value={formData.date}
                className="h-12 bg-white/5 border-white/10 rounded-xl"
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={`text-[10px] font-bold uppercase ${isIllegalOdometer ? "text-destructive" : "opacity-60"}`}>Mätare (mil)</Label>
              <Input 
                type="number" 
                className={`h-12 bg-white/5 rounded-xl ${isIllegalOdometer ? 'border-destructive ring-destructive/20' : 'border-white/10'}`}
                value={formData.odometer ?? ''}
                onChange={(e) => handleNumberChange('odometer', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase opacity-60">Pris (kr)</Label>
              <Input 
                type="number" 
                className="h-12 bg-white/5 border-white/10 rounded-xl"
                value={formData.cost || ''}
                onChange={(e) => handleNumberChange('cost', e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="pt-4 gap-2 sm:flex-row flex-col">
            <Button type="submit" disabled={loading || isIllegalOdometer || !!plateMismatch} className="w-full h-14 rounded-2xl font-bold text-lg shadow-xl shadow-primary/20">
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {aiVerified ? "Spara & Verifiera" : "Spara händelse"}
            </Button>
            <Button variant="ghost" type="button" onClick={onClose} className="h-12 rounded-xl opacity-60">Avbryt</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
