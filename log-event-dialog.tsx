"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, CheckCircle2, ShieldCheck, Building2, Lock, FileText, Sparkles } from 'lucide-react';
import { VehicleLog, ServiceCategory } from '@/types/autolog';
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
  userType?: 'CarOwner' | 'Workshop';
  initialData?: Partial<VehicleLog>; // For editing existing logs
}

export function LogEventDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  currentOdometer = 0, 
  inspectionFloor = 0,
  licensePlate = "", 
  userType = 'CarOwner',
  initialData
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
    performedBy: 'Workshop' 
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isWorkshop = userType === 'Workshop';
  const isLowering = formData.odometer !== undefined && formData.odometer < currentOdometer;
  const isBelowFloor = formData.odometer !== undefined && formData.odometer < inspectionFloor;
  
  // Strict rule for owners, but workshops can override if they are the ones logging
  const isIllegalOdometer = !isWorkshop && isLowering && (!aiVerified || !isInspectionDoc || isBelowFloor);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          ...initialData,
          performedBy: 'Workshop'
        });
        setAiVerified(initialData.isVerified || false);
        setIsInspectionDoc(initialData.category === 'Besiktning');
      } else {
        setFormData(prev => ({ 
          ...prev, 
          odometer: currentOdometer, 
          performedBy: 'Workshop',
          category: 'Service',
          date: new Date().toISOString().split('T')[0],
          cost: 0,
          notes: ''
        }));
        setAiVerified(false);
        setIsInspectionDoc(false);
      }
    }
  }, [isOpen, currentOdometer, initialData]);

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
            description: extraction.isInspection ? "Mätarkorrigering godkänd via bildbevis." : "AI har fyllt i detaljerna åt dig.",
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
            isLocked: !isWorkshop, // Workshops are never locked out of editing
            performedBy: 'Workshop',
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
        toast({
          variant: "destructive",
          title: "AI-skanning misslyckades",
          description: "Kunde inte tolka dokumentet automatiskt.",
        });
      } finally {
        setVerifying(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isIllegalOdometer) {
      if (isBelowFloor) {
        toast({
          variant: "destructive",
          title: "Besiktningsgolv nått",
          description: `Mätaren kan aldrig sättas lägre än det senast verifierade värdet (${inspectionFloor} mil).`,
        });
      } else if (isLowering && !aiVerified) {
        toast({
          variant: "destructive",
          title: "Bildbevis krävs",
          description: "Du måste ladda upp ett besiktningsprotokoll för att sänka mätarställningen.",
        });
      }
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
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:max-w-[500px] h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto p-0 gap-0 border-none sm:border glass-card rounded-none sm:rounded-[2rem]">
        <div className="p-6 pb-24 sm:pb-6 space-y-6">
          <DialogHeader className="text-left">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-headline flex items-center gap-2">
                  {initialData ? 'Redigera händelse' : 'Logga service'}
                  {aiVerified && <ShieldCheck className="w-6 h-6 text-green-400" />}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {isWorkshop ? 'Som verkstad har du full kontroll att korrigera loggad data.' : 'Skapa en digital stämpel för bilens historik.'}
                </DialogDescription>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Building2 className="w-6 h-6" />
              </div>
            </div>
          </DialogHeader>

          {isLowering && !aiVerified && !isWorkshop && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 rounded-2xl animate-pulse">
              <Camera className="h-4 w-4" />
              <AlertTitle>Mätarkorrigering kräver bildbevis</AlertTitle>
              <AlertDescription className="text-xs">
                Du försöker sänka mätaren. Ladda upp ett besiktningsprotokoll för att fortsätta.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div 
              className={`border-2 border-dashed rounded-[1.5rem] p-8 flex flex-col items-center justify-center gap-3 transition-all h-40 cursor-pointer ${aiVerified ? 'border-green-500 bg-green-500/5' : isLowering && !isWorkshop ? 'border-destructive bg-destructive/5' : 'border-white/10 bg-white/5 active:scale-95'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {verifying ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-accent animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold animate-pulse text-primary uppercase tracking-widest">AI SKANNAR DOKUMENT...</p>
                    <p className="text-[10px] text-muted-foreground">Läser av datum, miltal och priser</p>
                  </div>
                </div>
              ) : aiVerified ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-green-400 uppercase tracking-widest">VERIFIERAD VERKSTADSSERVICE</p>
                    <p className="text-[10px] text-muted-foreground">Du kan manuellt överrida all data nedan</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${isLowering && !isWorkshop ? 'bg-destructive/20 text-destructive' : 'bg-primary/20 text-primary'}`}>
                    <Camera className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold uppercase tracking-widest">{isLowering && !isWorkshop ? 'FOTA BESIKTNINGSPROTOKOLL' : 'FOTA KVITTO / SERVICEUNDERLAG'}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Använd AI för att verifiera verkstadsstämpeln</p>
                  </div>
                </>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
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
                <Label className={`text-xs font-bold uppercase ml-1 ${isLowering && !isWorkshop ? "text-destructive" : "opacity-60"}`}>Mätarställning (mil)</Label>
                <Input type="number" className={`h-12 bg-white/5 rounded-xl ${isLowering && !isWorkshop ? 'border-destructive ring-destructive/20' : 'border-white/10'}`} value={formData.odometer ?? ''} onChange={(e) => handleNumberChange('odometer', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60 ml-1">Pris (kr)</Label>
                <Input type="number" className="h-12 bg-white/5 border-white/10 rounded-xl" value={formData.cost || ''} onChange={(e) => handleNumberChange('cost', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60 ml-1">Sammanfattning (Verkstadsuppgifter)</Label>
              <Textarea value={formData.notes} className="bg-white/5 border-white/10 rounded-xl min-h-[80px]" onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Vilken verkstad utförde arbetet och vad gjordes?" />
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-md sm:relative sm:p-0 sm:bg-transparent border-t border-white/5 sm:border-none flex gap-3 safe-p-bottom">
              <Button variant="ghost" type="button" onClick={onClose} className="flex-1 h-14 rounded-2xl md:hidden border-white/10">Avbryt</Button>
              <Button type="submit" disabled={loading || isIllegalOdometer} className={`flex-[2] h-14 rounded-2xl font-bold text-lg shadow-xl ${isLowering && !isWorkshop ? 'bg-destructive hover:bg-destructive/90 shadow-destructive/20' : 'shadow-primary/20'}`}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (initialData ? 'Spara ändringar' : (aiVerified ? "Spara Verifierad Service" : "Logga som Verkstad"))}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
