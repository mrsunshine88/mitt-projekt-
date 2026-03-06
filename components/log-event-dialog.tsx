
"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, CheckCircle2, Upload, FileText, Lock } from 'lucide-react';
import { VehicleLog, ServiceCategory } from '@/types/autolog';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { addMonths, format, parseISO } from 'date-fns';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { firebaseConfig } from '@/firebase/config';
import { doc } from 'firebase/firestore';

interface LogEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (log: Partial<VehicleLog>) => Promise<void>;
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
  const { user } = useUser();
  const db = useFirestore();
  const appId = firebaseConfig.projectId;

  const profileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: profile } = useDoc<any>(profileRef);
  const isAdmin = profile?.role === 'Huvudadmin' || profile?.role === 'Moderator' || user?.email === 'apersson508@gmail.com';
  
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
  
  const isIllegalOdometer = !isAdmin && !isWorkshop && isLowering && (!photoUrl || isBelowFloor);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
        setPhotoUrl(initialData.photoUrl || null);
      } else {
        setFormData({
          category: 'Service',
          date: new Date().toISOString().split('T')[0],
          odometer: Math.max(currentOdometer, inspectionFloor),
          cost: 0,
          notes: '',
        });
        setPhotoUrl(null);
      }
      setIsCameraActive(false);
    }
  }, [isOpen, currentOdometer, inspectionFloor, initialData]);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      if (isCameraActive && videoRef.current) {
        try {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: { ideal: 'environment' } } 
            });
          } catch (e) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err: any) {
          console.error("Camera error:", err);
          const msg = err.name === 'NotReadableError' 
            ? "Kameran används redan." 
            : "Kunde inte starta kameran.";
          toast({ variant: "destructive", title: "Kamerafel", description: msg });
          setIsCameraActive(false);
        }
      }
    };

    if (isCameraActive) {
      const timer = setTimeout(startCamera, 150);
      return () => {
        clearTimeout(timer);
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
        }
      };
    }
  }, [isCameraActive, toast]);

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
      toast({ title: "Dokument bifogat!" });
    } catch (error) {
      toast({ variant: "destructive", title: "Fel vid bildbehandling" });
    } finally {
      setLoading(false);
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
    await handleImageSelection(dataUri);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAdmin) {
      if (isBelowFloor) {
        toast({ variant: "destructive", title: "Besiktningsgolv nått", description: `Mätaren kan aldrig sänkas under det verifierade värdet (${inspectionFloor} mil).` });
        return;
      }
      if (!isWorkshop && isLowering && !photoUrl) {
        toast({ variant: "destructive", title: "Bildbevis saknas", description: "Du måste bifoga ett besiktningsprotokoll för att sänka mätaren." });
        return;
      }
    }

    setLoading(true);
    try {
      let nextServiceDate = undefined;
      if (formData.category === 'Service' && formData.date) {
        nextServiceDate = format(addMonths(parseISO(formData.date), 12), 'yyyy-MM-dd');
      }

      await onSubmit({ 
        ...formData, 
        photoUrl: photoUrl || undefined,
        nextServiceDate,
        type: isWorkshop ? 'Proposal' : (isLowering ? 'Correction' : 'Update'),
        approvalStatus: isWorkshop ? 'pending' : 'approved',
        isVerified: !!photoUrl, 
        verificationSource: isWorkshop ? 'Workshop' : (photoUrl ? 'AI' : 'User'),
        performedBy: isWorkshop ? 'Workshop' : 'Owner'
      });
      onClose();
    } catch (err) {
      console.error("Submit error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if(!o) onClose(); }}>
      <DialogContent className="sm:max-w-[500px] glass-card border-white/10 rounded-[2rem] p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline flex items-center gap-2">
            {isWorkshop ? 'Registrera service' : 'Logga händelse'}
            {photoUrl && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          </DialogTitle>
          <DialogDescription>
            {isWorkshop ? 'Fyll i utfört arbete.' : 'Fyll i detaljerna för händelsen.'}
          </DialogDescription>
        </DialogHeader>

        {!isAdmin && isBelowFloor && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-4">
            <Lock className="h-4 w-4" />
            <AlertTitle>Mätarsäkring aktiv</AlertTitle>
            <AlertDescription className="text-xs">
              Mätarställningen kan ej sättas lägre än verifierat golv ({inspectionFloor} mil).
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
            {isCameraActive ? (
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                  <Button variant="outline" type="button" onClick={() => setIsCameraActive(false)} className="bg-black/40 border-white/20">Avbryt</Button>
                  <Button type="button" onClick={capturePhoto} className="bg-primary shadow-xl">Ta bild</Button>
                </div>
              </div>
            ) : photoUrl ? (
              <div className="border-2 border-green-500/30 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 bg-green-500/5 h-40">
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl">
                  <img src={photoUrl} alt="Bifogat dokument" className="max-h-full object-contain" />
                </div>
                <Button variant="ghost" size="sm" type="button" onClick={() => setPhotoUrl(null)} className="mt-2 h-8 text-[10px] uppercase font-bold tracking-widest">Byt bild</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant="outline" onClick={() => setIsCameraActive(true)} className="h-32 rounded-2xl border-2 border-dashed flex flex-col gap-2 bg-white/5 border-white/10 hover:border-primary/50 transition-all">
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
                  <SelectItem value="Ägarbyte">Ägarbyte</SelectItem>
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
              <Label className={`text-xs uppercase ${isLowering && !isAdmin ? 'text-destructive font-bold' : 'opacity-60'}`}>Mätarställning (mil)</Label>
              <Input type="number" className={`h-12 bg-white/5 rounded-xl ${isLowering && !isAdmin ? 'border-destructive ring-destructive/20' : 'border-white/10'}`} value={formData.odometer ?? ''} onChange={(e) => setFormData({...formData, odometer: parseInt(e.target.value) || 0})} required />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase opacity-60">Kostnad (kr)</Label>
              <Input type="number" className="h-12 bg-white/5 border-white/10 rounded-xl" value={formData.cost || ''} onChange={(e) => setFormData({...formData, cost: parseInt(e.target.value) || 0})} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase opacity-60">Anteckningar</Label>
            <Textarea value={formData.notes} className="bg-white/5 rounded-xl min-h-[100px] border-white/10" onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Beskriv vad som gjorts..." />
          </div>

          <Button type="submit" disabled={loading || (!isAdmin && isBelowFloor)} className={`w-full h-14 rounded-2xl font-bold shadow-xl transition-all ${isLowering && !isAdmin ? 'bg-destructive hover:bg-destructive/90 shadow-destructive/20' : 'shadow-primary/20'}`}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isWorkshop ? 'Registrera för godkännande' : 'Spara i historiken')}
          </Button>
        </form>
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
