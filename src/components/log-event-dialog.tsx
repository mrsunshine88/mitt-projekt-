"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Camera, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, User, Building2 } from 'lucide-react';
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
  inspectionFloor?: number;
  licensePlate?: string;
}

export function LogEventDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  currentOdometer = 0, 
  inspectionFloor = 0,
  licensePlate = "", 
}: LogEventDialogProps) {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
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
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUri = event.target?.result as string;
      
      try {
        const [verification, extraction] = await Promise.all([
          verifyServiceDocument({ photoDataUri: dataUri }),
          extractReceiptData({ receiptImageDataUri: dataUri })
        ]);

        if (verification.isServiceDocument) {
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
            odometer: extraction.odometerReading || prev.odometer,
            cost: extraction.totalCost || prev.cost,
            notes: extraction.serviceSummary || prev.notes,
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
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:max-w-[500px] h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto p-0 gap-0 border-none sm:border glass-card rounded-none sm:rounded-[2rem]">
        <div className="p-6 pb-24 sm:pb-6 space-y-6">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-headline flex items-center gap-2">
              Logga händelse
              {aiVerified && <ShieldCheck className="w-6 h-6 text-green-400" />}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Fota kvitto eller protokoll för att verifiera historiken.
            </DialogDescription>
          </DialogHeader>

          {isIllegalOdometer && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 rounded-2xl">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Problem med mätaren</AlertTitle>
              <AlertDescription className="text-xs">
                Mätarställningen kan inte vara lägre än nuvarande nivå utan verifierad besiktning.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div 
              className={`border-2 border-dashed rounded-[1.5rem] p-8 flex flex-col items-center justify-center gap-3 transition-all h-36 ${aiVerified ? 'border-green-500 bg-green-500/5' : 'border-white/10 bg-white/5 active:scale-95'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {verifying ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-bold animate-pulse text-primary">AI SKANNAR...</p>
                </>
              ) : aiVerified ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                  <p className="text-sm font-bold text-green-400 uppercase">Dokument verifierat</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold">FOTA DOKUMENT</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Kvitto eller Besiktning</p>
                  </div>
                </>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60 ml-1">Utförd av</Label>
              <RadioGroup value={formData.performedBy} onValueChange={(v) => setFormData({...formData, performedBy: v as PerformedBy})} className="flex gap-3">
                <div className="flex-1">
                  <RadioGroupItem value="Owner" id="owner-diy" className="sr-only" />
                  <Label htmlFor="owner-diy" className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer h-12 ${formData.performedBy === 'Owner' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-transparent opacity-60'}`}>
                    <User className="w-4 h-4" /> Eget
                  </Label>
                </div>
                <div className="flex-1">
                  <RadioGroupItem value="Workshop" id="workshop-pro" className="sr-only" />
                  <Label htmlFor="workshop-pro" className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer h-12 ${formData.performedBy === 'Workshop' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-transparent opacity-60'}`}>
                    <Building2 className="w-4 h-4" /> Verkstad
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60 ml-1">Kategori</Label>
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
                <Label className="text-xs font-bold uppercase opacity-60 ml-1">Datum</Label>
                <Input type="date" value={formData.date} className="h-12 bg-white/5 border-white/10 rounded-xl" onChange={(e) => setFormData({...formData, date: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className={`text-xs font-bold uppercase ml-1 ${isIllegalOdometer ? "text-destructive" : "opacity-60"}`}>Mätare (mil)</Label>
                <Input type="number" className={`h-12 bg-white/5 rounded-xl ${isIllegalOdometer ? 'border-destructive ring-destructive/20' : 'border-white/10'}`} value={formData.odometer ?? ''} onChange={(e) => handleNumberChange('odometer', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60 ml-1">Pris (kr)</Label>
                <Input type="number" className="h-12 bg-white/5 border-white/10 rounded-xl" value={formData.cost || ''} onChange={(e) => handleNumberChange('cost', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60 ml-1">Anteckningar</Label>
              <Textarea value={formData.notes} className="bg-white/5 border-white/10 rounded-xl min-h-[80px]" onChange={(e) => setFormData({...formData, notes: e.target.value})} />
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-md sm:relative sm:p-0 sm:bg-transparent border-t border-white/5 sm:border-none flex gap-3 safe-p-bottom">
              <Button variant="ghost" type="button" onClick={onClose} className="flex-1 h-14 rounded-2xl md:hidden">Avbryt</Button>
              <Button type="submit" disabled={loading || isIllegalOdometer} className="flex-[2] h-14 rounded-2xl font-bold text-lg shadow-xl shadow-primary/20">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : aiVerified ? "Verifiera & Spara" : "Spara"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}