
"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, CheckCircle2, Upload, FileText } from 'lucide-react';
import { VehicleLog, ServiceCategory } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { addMonths, format, parseISO } from 'date-fns';

interface LogEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (log: Partial<VehicleLog>) => void;
  currentOdometer?: number;
  inspectionFloor?: number;
  licensePlate?: string;
  userType?: 'CarOwner' | 'Workshop';
  initialData?: Partial<VehicleLog>;
}

const processImage = (dataUri: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = (MAX_WIDTH / width) * height;
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    img.src = dataUri;
  });
};

export function LogEventDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  currentOdometer = 0, 
  inspectionFloor = 0,
  userType = 'CarOwner',
  initialData
}: LogEventDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<VehicleLog>>({
    category: 'Service',
    date: new Date().toISOString().split('T')[0],
    odometer: currentOdometer,
    cost: 0,
    notes: '',
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const isWorkshop = userType === 'Workshop';

  const isLowering = formData.odometer !== undefined && formData.odometer < currentOdometer;
  const isBelowFloor = formData.odometer !== undefined && formData.odometer < inspectionFloor;
  
  // Krav: Om man sänker mätaren som ägare måste en bild bifogas
  const isIllegalOdometer = !isWorkshop && isLowering && (!photoUrl || isBelowFloor);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
        setPhotoUrl(initialData.photoUrl || null);
      } else {
        setFormData({
          category: 'Service',
          date: new Date().toISOString().split('T')[0],
          odometer: currentOdometer,
          cost: 0,
          notes: '',
        });
        setPhotoUrl(null);
      }
      setIsCameraActive(false);
    }
  }, [isOpen, currentOdometer, initialData]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUri = event.target?.result as string;
      await handleImageSelection(dataUri);
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelection = async (dataUri: string) => {
    setLoading(true);
    try {
      const optimized = await processImage(dataUri);
      setPhotoUrl(optimized);
      toast({ 
        title: "Dokument bifogat!", 
        description: "Fyll i detaljerna nedan manuellt för att spara." 
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Fel", description: "Kunde inte hantera bilden." });
    } finally {
      setLoading(false);
      setIsCameraActive(false);
    }
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      toast({ variant: "destructive", title: "Kamerafel", description: "Kunde inte starta kameran." });
      setIsCameraActive(false);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context?.drawImage(videoRef.current, 0, 0);
    const dataUri = canvasRef.current.toDataURL('image/jpeg');
    
    if (videoRef.current.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    
    await handleImageSelection(dataUri);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isIllegalOdometer) {
      toast({ 
        variant: "destructive", 
        title: "Mätarsäkring aktiv", 
        description: isBelowFloor 
          ? `Mätarställningen kan ej sättas lägre än verifierat golv (${inspectionFloor} mil).` 
          : "Sänkning av mätarställning kräver att du bifogar en bild på ett besiktningsprotokoll." 
      });
      return;
    }

    setLoading(true);
    
    let nextServiceDate = undefined;
    if (formData.category === 'Service' && formData.date) {
      nextServiceDate = format(addMonths(parseISO(formData.date), 12), 'yyyy-MM-dd');
    }

    onSubmit({ 
      ...formData, 
      photoUrl: photoUrl || undefined,
      nextServiceDate,
      type: isWorkshop ? 'Proposal' : (isLowering ? 'Correction' : 'Update'),
      approvalStatus: isWorkshop ? 'pending' : 'approved',
      isVerified: !!photoUrl, 
      verificationSource: isWorkshop ? 'Workshop' : 'User',
      performedBy: isWorkshop ? 'Workshop' : 'Owner'
    });
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if(!o) { if(videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); onClose(); } }}>
      <DialogContent className="sm:max-w-[500px] glass-card border-white/10 rounded-[2rem] p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline flex items-center gap-2">
            {isWorkshop ? 'Registrera service' : 'Logga händelse'}
            {photoUrl && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          </DialogTitle>
          <DialogDescription>
            {isWorkshop 
              ? 'Fyll i utfört arbete. Ägaren måste godkänna registreringen.' 
              : 'Ladda upp bildbevis och fyll i detaljerna manuellt.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
            {isCameraActive ? (
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                  <Button variant="outline" onClick={() => setIsCameraActive(false)} className="bg-black/40 border-white/20">Avbryt</Button>
                  <Button type="button" onClick={capturePhoto} className="bg-primary shadow-xl">Ta bild</Button>
                </div>
              </div>
            ) : photoUrl ? (
              <div className="border-2 border-green-500/30 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 bg-green-500/5 h-40">
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl">
                  <img src={photoUrl} alt="Bifogat dokument" className="max-h-full object-contain" />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPhotoUrl(null)} className="mt-2 h-8 text-[10px] uppercase font-bold tracking-widest">Byt bild</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" onClick={startCamera} className="h-32 rounded-2xl border-2 border-dashed flex flex-col gap-2 bg-white/5 border-white/10 hover:border-primary/50 transition-all">
                  <Camera className="w-6 h-6 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-center">Fota Kvitto / Dokument</span>
                </Button>
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-32 rounded-2xl border-2 border-dashed flex flex-col gap-2 bg-white/5 border-white/10 hover:border-accent/50 transition-all">
                  <Upload className="w-6 h-6 text-accent" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-center">Välj från enhet</span>
                </Button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase opacity-60">Kategori</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v as ServiceCategory})}>
                <SelectTrigger className="h-12 bg-white/5 rounded-xl border-white/10">
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
              <Label className="text-xs uppercase opacity-60">Datum</Label>
              <Input type="date" value={formData.date} className="h-12 bg-white/5 rounded-xl border-white/10" onChange={(e) => setFormData({...formData, date: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={`text-xs uppercase ${isLowering && !isWorkshop ? 'text-destructive font-bold' : 'opacity-60'}`}>Mätarställning (mil)</Label>
              <Input type="number" className={`h-12 bg-white/5 rounded-xl ${isLowering && !isWorkshop ? 'border-destructive ring-destructive/20' : 'border-white/10'}`} value={formData.odometer ?? ''} onChange={(e) => setFormData({...formData, odometer: parseInt(e.target.value) || 0})} required />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase opacity-60">Kostnad (kr)</Label>
              <Input type="number" className="h-12 bg-white/5 rounded-xl border-white/10" value={formData.cost || ''} onChange={(e) => setFormData({...formData, cost: parseInt(e.target.value) || 0})} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase opacity-60">Utförda åtgärder / Anteckningar</Label>
            <Textarea value={formData.notes} className="bg-white/5 rounded-xl min-h-[100px] border-white/10" onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Beskriv vad som gjorts..." />
          </div>

          <Button type="submit" disabled={loading || isIllegalOdometer} className={`w-full h-14 rounded-2xl font-bold shadow-xl transition-all ${isLowering && !isWorkshop ? 'bg-destructive hover:bg-destructive/90 shadow-destructive/20' : 'shadow-primary/20'}`}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isWorkshop ? 'Registrera för godkännande' : 'Spara i historiken')}
          </Button>
        </form>
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
