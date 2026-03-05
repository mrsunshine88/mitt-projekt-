
"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Camera, ArrowRight, Upload, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { collection, serverTimestamp, doc, setDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';
import { firebaseConfig } from '@/firebase/config';
import { sanitize } from '@/lib/utils';

type Step = 'info' | 'photo-choice' | 'camera' | 'ready';

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

export function AddVehicleDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) {
  const [step, setStep] = useState<Step>('info');
  const [loading, setLoading] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appId = firebaseConfig.projectId;

  const [formData, setFormData] = useState({
    licensePlate: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    currentOdometerReading: 0,
  });

  useEffect(() => {
    if (step === 'camera' && !hasCameraPermission) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          setHasCameraPermission(true);
          if (videoRef.current) videoRef.current.srcObject = stream;
        }).catch(() => {
          setHasCameraPermission(false);
          setError("Kunde inte starta kameran.");
          setStep('photo-choice');
        });
    }
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [step, hasCameraPermission]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingImage(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUri = event.target?.result as string;
      const optimized = await processImage(dataUri);
      setPhotoPreview(optimized);
      setProcessingImage(false);
      setStep('ready');
    };
    reader.readAsDataURL(file);
  };

  const captureFromCamera = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    if (!context) return;
    setProcessingImage(true);
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    const optimized = await processImage(canvasRef.current.toDataURL('image/jpeg', 0.8));
    setPhotoPreview(optimized);
    setProcessingImage(false);
    setStep('ready');
  };

  const handleSubmit = async () => {
    if (!user || !db) return;
    setLoading(true);
    setError(null);

    const plate = formData.licensePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    
    try {
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      const globalSnap = await getDoc(globalRef);
      
      if (globalSnap.exists()) {
        const existingData = globalSnap.data();
        // SPÄRR: Om bilen har en annan ownerId som inte är null, och det inte är jag själv.
        if (existingData.ownerId && existingData.ownerId !== user.uid) {
          setError("Detta fordon är redan registrerat av en annan aktiv användare.");
          setLoading(false);
          return;
        }
        
        // Om bilen fanns men saknar ownerId, då återställer vi den!
        if (!existingData.ownerId) {
          toast({ title: "Historik hittad!", description: "Bilens tidigare data har återställts till ditt garage." });
          // Uppdatera formulär med gammal data om den saknas
          if (!formData.make) formData.make = existingData.make;
          if (!formData.model) formData.model = existingData.model;
        }
      }

      const payload = sanitize({ 
        ...formData, 
        id: plate,
        licensePlate: plate, 
        ownerId: user.uid, 
        ownerEmail: user.email,
        ownerName: user.displayName || 'Bilägare',
        mainImage: photoPreview || (globalSnap.exists() ? globalSnap.data().mainImage : null), 
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        inspectionFloorOdometer: globalSnap.exists() ? (globalSnap.data().inspectionFloorOdometer || 0) : 0
      });

      const privateVehicleRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
      await setDoc(privateVehicleRef, payload);
      await setDoc(globalRef, payload, { merge: true });
      
      toast({ title: "Fordon tillagt!" });
      onClose(); 
      resetForm();
    } catch (err: any) { 
      toast({ variant: "destructive", title: "Fel vid spara", description: err.message }); 
    } finally { 
      setLoading(false); 
    }
  };

  const resetForm = () => { 
    setFormData({ licensePlate: '', make: '', model: '', year: new Date().getFullYear(), currentOdometerReading: 0 }); 
    setStep('info'); 
    setPhotoPreview(null); 
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if(!o) resetForm(); onClose(); }}>
      <DialogContent className="sm:max-w-[450px] glass-card border-white/10 rounded-[2rem] p-0 overflow-hidden">
        <div className="p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-headline flex items-center gap-2">
              {step === 'info' ? 'Lägg till fordon' : step === 'ready' ? 'Klart att spara' : 'Ladda upp bild'}
            </DialogTitle>
            <DialogDescription>Fyll i uppgifter för din {formData.licensePlate || 'bil'}.</DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive" className="mb-4 bg-destructive/10 border-destructive/20">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            {step === 'info' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase opacity-60 ml-1">Registreringsnummer</Label>
                  <Input placeholder="ABC 123" className="h-14 text-xl font-bold uppercase bg-white/5 text-center" value={formData.licensePlate} onChange={(e) => setFormData({...formData, licensePlate: e.target.value.toUpperCase()})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Märke</Label>
                    <Select value={formData.make} onValueChange={(v) => setFormData({...formData, make: v})}>
                      <SelectTrigger className="h-12 bg-white/5"><SelectValue placeholder="Välj..." /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">{SWEDISH_CAR_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Modell</Label>
                    <Input className="h-12 bg-white/5" value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Årsmodell</Label>
                    <Input type="number" className="h-12 bg-white/5" value={formData.year} onChange={(e) => setFormData({...formData, year: parseInt(e.target.value) || 0})} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Mätare (mil)</Label>
                    <Input type="number" className="h-12 bg-white/5" value={formData.currentOdometerReading || ''} onChange={(e) => setFormData({...formData, currentOdometerReading: parseInt(e.target.value) || 0})} />
                  </div>
                </div>
                <Button onClick={() => setStep('photo-choice')} className="w-full h-14 rounded-2xl font-bold text-lg mt-4" disabled={!formData.licensePlate || !formData.make}>
                  Gå vidare <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </div>
            )}

            {step === 'photo-choice' && (
              <div className="grid grid-cols-1 gap-4">
                <Button variant="outline" className="h-20 rounded-2xl border-2 border-dashed border-white/10 flex flex-col gap-1" onClick={() => setStep('camera')}>
                  <Camera className="w-5 h-5 text-primary" />
                  <span className="font-bold">Använd kameran</span>
                </Button>
                <div className="relative">
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                  <Button variant="outline" className="w-full h-20 rounded-2xl border-2 border-dashed border-white/10 flex flex-col gap-1" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-5 h-5 text-accent" />
                    <span className="font-bold">Välj från enhet</span>
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => setStep('info')}>Tillbaka</Button>
              </div>
            )}

            {step === 'camera' && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-3xl overflow-hidden bg-black">
                  <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                  {processingImage && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep('photo-choice')} className="flex-1 h-12 rounded-xl">Avbryt</Button>
                  <Button onClick={captureFromCamera} className="flex-[2] h-12 rounded-xl font-bold bg-primary text-white">Ta bild</Button>
                </div>
              </div>
            )}

            {step === 'ready' && photoPreview && (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-3xl overflow-hidden border-2 border-green-500/50">
                  <img src={photoPreview} className="w-full h-full object-cover" alt="Preview" />
                </div>
                <Button variant="outline" onClick={() => setStep('photo-choice')} className="w-full h-12 rounded-xl">Byt bild</Button>
              </div>
            )}
          </div>
        </div>

        {step === 'ready' && (
          <div className="p-6 bg-white/5 border-t border-white/10">
            <Button onClick={handleSubmit} disabled={loading} className="w-full h-16 rounded-2xl font-bold text-xl bg-green-600 hover:bg-green-500 text-white">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Spara bil'}
            </Button>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
