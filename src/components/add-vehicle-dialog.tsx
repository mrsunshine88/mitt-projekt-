"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Camera, ArrowRight, Upload, CheckCircle2, AlertCircle, ShieldAlert, Gauge, Lock } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { collection, serverTimestamp, doc, setDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';
import { firebaseConfig } from '@/firebase/config';
import { sanitize } from '@/lib/utils';
import { verifyVehiclePlate } from '@/ai/flows/verify-vehicle-plate';

type Step = 'info' | 'confirm-odometer' | 'photo-choice' | 'camera' | 'ready';

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
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [inspectionDoc, setInspectionDoc] = useState<string | null>(null);
  const [existingHistoryFound, setExistingHistoryFound] = useState(false);
  const [isSearchingPlate, setIsSearchingPlate] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
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
    fuelType: 'Bensin',
    gearbox: 'Automat',
    hp: 0,
    color: '',
  });

  const checkExistingVehicle = async (plateInput: string) => {
    if (!db) return;
    const normalizedPlate = plateInput.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    if (normalizedPlate.length < 3) return;

    setIsSearchingPlate(true);
    try {
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', normalizedPlate);
      const globalSnap = await getDoc(globalRef);
      
      if (globalSnap.exists()) {
        const data = globalSnap.data();
        setExistingHistoryFound(true);
        
        const lockedOdometer = data.inspectionFloorOdometer || data.currentOdometerReading || 0;
        
        setFormData(prev => ({
          ...prev,
          make: data.make || prev.make,
          model: data.model || prev.model,
          year: data.year || prev.year,
          currentOdometerReading: lockedOdometer
        }));

        if (data.ownerId && data.ownerId !== user?.uid) {
          setError("Detta fordon är redan registrerat av en annan aktiv användare.");
        } else {
          setError(null);
        }
      } else {
        setExistingHistoryFound(false);
        setError(null);
      }
    } catch (e) {
      console.error("Fel vid sökning:", e);
    } finally {
      setIsSearchingPlate(false);
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      if (step === 'camera' && videoRef.current) {
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
            ? "Kameran används redan av ett annat program." 
            : "Kunde inte starta kameran.";
          setError(msg);
          setStep('photo-choice');
        }
      }
    };

    if (step === 'camera') {
      const timer = setTimeout(startCamera, 150);
      return () => {
        clearTimeout(timer);
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
        }
      };
    }
  }, [step]);

  const processPhoto = async (dataUri: string) => {
    setProcessingImage(true);
    try {
      const optimized = await processImage(dataUri);
      
      const shouldAiScan = isScanning;
      
      if (shouldAiScan && formData.licensePlate) {
        toast({ title: "AI Granskar dokument...", description: "Detta tar upp till 6 sekunder. Lämna inte rutan." });
        try {
          const result = await verifyVehiclePlate({ photoDataUri: optimized, expectedPlate: formData.licensePlate });
          
          if (!result.isInspectionDocument) {
            setError(result.reasoning !== 'Kort förklaring' && result.reasoning ? result.reasoning : "Dokumentet verkar inte vara ett giltigt Besiktningsprotokoll.");
            setStep('info');
            return;
          }

          if (result.match) {
            toast({ title: "Dokument Godkänt!", description: `Reg-nr matchar. ${result.odometer ? `Avläst miltal: ${result.odometer} mil` : ''}` });
            setInspectionDoc(optimized);
            setError(null);
            if (result.odometer && result.odometer >= (formData.currentOdometerReading || 0)) {
               setFormData(prev => ({ ...prev, currentOdometerReading: result.odometer! }));
            }
            setStep('info');
          } else {
             setError(result.reasoning || `Reg-numret på dokumentet stämmer ej överens med ${formData.licensePlate}.`);
             setStep('info');
          }
        } catch (e) {
          setError("AI kunde inte läsa dokumentet ordentligt. Försök att ta en tydligare bild.");
          setStep('info');
        }
      } else {
        setPhotoPreview(optimized);
        setStep('ready');
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Fel", description: "Behandlingen av bilden misslyckades."});
      setStep(isScanning ? 'info' : 'photo-choice');
    } finally {
      setIsScanning(false);
      setProcessingImage(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUri = event.target?.result as string;
      await processPhoto(dataUri);
    };
    reader.readAsDataURL(file);
  };

  const captureFromCamera = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    if (!context) return;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    const dataUri = canvasRef.current.toDataURL('image/jpeg', 0.8);
    await processPhoto(dataUri);
  };

  const handleSubmit = async () => {
    if (!user || !db) return;
    setLoading(true);
    setError(null);

    const plate = formData.licensePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    
    try {
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      const globalSnap = await getDoc(globalRef);
      
      let finalFloor = formData.currentOdometerReading;
      let finalCurrent = formData.currentOdometerReading;

      if (globalSnap.exists()) {
        const existingData = globalSnap.data();
        if (existingData.ownerId && existingData.ownerId !== user.uid) {
          setError("Detta fordon är redan registrerat av en annan aktiv användare.");
          setLoading(false);
          return;
        }
        finalFloor = Math.max(existingData.inspectionFloorOdometer || 0, existingData.currentOdometerReading || 0) || finalFloor;
        finalCurrent = existingData.currentOdometerReading || finalCurrent;
      }

      const payload = sanitize({ 
        ...formData, 
        id: plate,
        licensePlate: plate, 
        ownerId: user.uid, 
        ownerEmail: user.email,
        ownerName: user.displayName || 'Bilägare',
        mainImage: photoPreview || (globalSnap.exists() ? globalSnap.data().mainImage : null),
        imageUrls: photoPreview ? [photoPreview] : (globalSnap.exists() ? (globalSnap.data().imageUrls || []) : []),
        createdAt: globalSnap.exists() ? globalSnap.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
        inspectionFloorOdometer: finalFloor,
        currentOdometerReading: finalCurrent 
      });

      const privateVehicleRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
      await setDoc(privateVehicleRef, payload);
      await setDoc(globalRef, payload, { merge: true });
      
      toast({ 
        title: existingHistoryFound ? "Historik återställd!" : "Fordon tillagt!", 
        description: `Mätarsäkring aktiv vid ${finalFloor} mil.` 
      });
      onClose(); 
      resetForm();
    } catch (err: any) { 
      toast({ variant: "destructive", title: "Fel vid spara", description: err.message }); 
    } finally { 
      setLoading(false); 
    }
  };

  const resetForm = () => { 
    setFormData({ licensePlate: '', make: '', model: '', year: new Date().getFullYear(), currentOdometerReading: 0, fuelType: 'Bensin', gearbox: 'Automat', hp: 0, color: '' }); 
    setStep('info'); 
    setPhotoPreview(null); 
    setInspectionDoc(null);
    setError(null);
    setExistingHistoryFound(false);
    setIsScanning(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o: boolean) => { if(!o) resetForm(); onClose(); }}>
      <DialogContent className="sm:max-w-[450px] glass-card border-white/10 rounded-[2rem] p-0 overflow-hidden">
        <div className="p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-headline flex items-center gap-2">
              {step === 'info' ? 'Lägg till fordon' : step === 'confirm-odometer' ? 'Bekräfta mätare' : step === 'ready' ? 'Klart att spara' : (isScanning ? 'Ladda upp Besiktningspapper' : 'Ladda upp en bild på din bil')}
            </DialogTitle>
            <DialogDescription>
              {step === 'confirm-odometer' ? 'Kontrollera att miltalet stämmer. Det går inte att ändra efteråt.' : step === 'photo-choice' || step === 'camera' ? (isScanning ? `Ladda upp ett tydligt foto på det senaste besiktningsprotokollet för ${formData.licensePlate || 'bilen'}.` : `Ladda upp en snygg bild på din ${formData.licensePlate || 'bil'}. Detta syns på bilens profilsida.`) : `Fyll i uppgifter för din ${formData.licensePlate || 'bil'}.`}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert className="mb-4 bg-orange-500/10 border-orange-500/30 text-orange-200">
              <AlertCircle className="h-5 w-5 text-orange-400" />
              <div className="ml-2">
                <AlertTitle className="text-sm font-bold text-orange-400 mb-1">AI-Granskning</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">{error}</AlertDescription>
              </div>
            </Alert>
          )}

          <div className="space-y-6">
            {step === 'info' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase opacity-60 ml-1">Registreringsnummer</Label>
                  <div className="relative">
                    <Input 
                      placeholder="ABC 123" 
                      className="h-14 text-xl font-bold uppercase bg-white/5 text-center" 
                      value={formData.licensePlate} 
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setFormData({...formData, licensePlate: val});
                        checkExistingVehicle(val);
                      }} 
                    />
                    {isSearchingPlate && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin opacity-40" />}
                  </div>
                  {formData.licensePlate && !inspectionDoc && (
                    <Button variant="outline" className="w-full text-white border-primary/50 border-2 border-dashed h-16 bg-primary/10 hover:bg-primary/20 hover:text-white" onClick={() => { setIsScanning(true); setStep('photo-choice'); }}>
                      <Camera className="w-5 h-5 mr-3 text-primary animate-pulse" /> Obligatoriskt: Ladda upp besiktningspapper
                    </Button>
                  )}
                  {inspectionDoc && (
                     <div className="text-xs text-green-500 font-bold px-1 flex items-center justify-center gap-1.5 p-3 rounded-xl bg-green-500/10 border border-green-500/20"><CheckCircle2 className="w-4 h-4" /> AI: Besiktningsprotokoll Verifierat!</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Märke</Label>
                    <Select value={formData.make} onValueChange={(v: string) => setFormData({...formData, make: v})}>
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
                    <Label className={`text-xs font-bold uppercase ml-1 ${existingHistoryFound ? 'text-primary' : 'opacity-60'}`}>
                      {existingHistoryFound ? 'Låst mätare (mil)' : 'Mätare (mil)'}
                    </Label>
                    <div className="relative">
                      <Input 
                        type="number" 
                        className={`h-12 bg-white/5 ${existingHistoryFound ? 'border-primary/50 text-primary font-black' : ''}`} 
                        value={formData.currentOdometerReading || ''} 
                        onChange={(e) => setFormData({...formData, currentOdometerReading: parseInt(e.target.value) || 0})} 
                        disabled={existingHistoryFound}
                      />
                      {existingHistoryFound && <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Växellåda</Label>
                    <Select value={formData.gearbox} onValueChange={(v: string) => setFormData({...formData, gearbox: v})}>
                      <SelectTrigger className="bg-white/5 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Automat">Automat</SelectItem><SelectItem value="Manuell">Manuell</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Bränsle</Label>
                    <Select value={formData.fuelType} onValueChange={(v: string) => setFormData({...formData, fuelType: v})}>
                      <SelectTrigger className="bg-white/5 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Bensin">Bensin</SelectItem><SelectItem value="Diesel">Diesel</SelectItem><SelectItem value="El">El</SelectItem><SelectItem value="Hybrid">Hybrid</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Effekt (hk)</Label>
                    <Input type="number" value={formData.hp || ''} onChange={(e) => setFormData({...formData, hp: parseInt(e.target.value) || 0})} className="bg-white/5 h-12 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase opacity-60 ml-1">Färg</Label>
                    <Input value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} className="bg-white/5 h-12 rounded-xl" />
                  </div>
                </div>
                <Button onClick={() => setStep('confirm-odometer')} className="w-full h-14 rounded-2xl font-bold text-lg mt-4" disabled={!formData.licensePlate || !formData.make || isSearchingPlate || !!error || !inspectionDoc}>
                  Gå vidare <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </div>
            )}

            {step === 'confirm-odometer' && (
              <div className="space-y-8 py-4">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Gauge className="w-10 h-10" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground uppercase font-bold tracking-widest">Inskrivet miltal</p>
                    <p className="text-5xl font-black text-white mt-1">{formData.currentOdometerReading.toLocaleString()} <span className="text-xl">mil</span></p>
                  </div>
                </div>
                <Alert className="bg-primary/5 border-primary/20 rounded-2xl">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-xs text-slate-300">
                    {existingHistoryFound 
                      ? 'Detta miltal är verifierat från bilens tidigare historik och kan inte sänkas.' 
                      : 'När du bekräftar detta låses mätarställningen som bilens nya "golv". Du kan aldrig sänka mätaren under detta värde själv.'}
                  </AlertDescription>
                </Alert>
                <div className="flex flex-col gap-3">
                  <Button onClick={() => setStep(photoPreview ? 'ready' : 'photo-choice')} className="h-16 rounded-2xl font-bold text-xl shadow-xl shadow-primary/20">Ja, det stämmer</Button>
                  {!existingHistoryFound && <Button variant="ghost" onClick={() => setStep('info')} className="h-12">Nej, ändra värdet</Button>}
                </div>
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
                <Button variant="ghost" onClick={() => setStep('confirm-odometer')}>Tillbaka</Button>
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
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Spara bil'}
            </Button>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}