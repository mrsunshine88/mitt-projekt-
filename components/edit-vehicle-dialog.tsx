"use client";

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Camera, CheckCircle2, Upload, Trash2, ImagePlus, AlertCircle } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Vehicle } from '@/types/autolog';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';
import { firebaseConfig } from '@/firebase/config';
import { sanitize } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const processImage = (dataUri: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new window.Image();
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

export function EditVehicleDialog({ isOpen, onClose, vehicle }: { isOpen: boolean; onClose: () => void; vehicle: Vehicle; }) {
  const [loading, setLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(vehicle.mainImage || null);
  const [odometerProof, setOdometerProof] = useState<string | null>(null);
  
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const odometerProofRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [formData, setFormData] = useState({
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    currentOdometerReading: vehicle.currentOdometerReading,
    fuelType: vehicle.fuelType || 'Bensin',
    gearbox: vehicle.gearbox || 'Automat',
    hp: vehicle.hp || 0,
    color: vehicle.color || '',
  });

  const isLowering = formData.currentOdometerReading < vehicle.currentOdometerReading;
  const isBelowFloor = formData.currentOdometerReading < (vehicle.inspectionFloorOdometer || 0);

  useEffect(() => {
    if (vehicle) {
      setFormData({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        currentOdometerReading: vehicle.currentOdometerReading,
        fuelType: vehicle.fuelType || 'Bensin',
        gearbox: vehicle.gearbox || 'Automat',
        hp: vehicle.hp || 0,
        color: vehicle.color || '',
      });
      setPhotoPreview(vehicle.mainImage || null);
      setOdometerProof(null);
    }
  }, [vehicle]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const optimized = await processImage(event.target?.result as string);
      setPhotoPreview(optimized);
    };
    reader.readAsDataURL(file);
  };

  const handleOdometerProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const optimized = await processImage(event.target?.result as string);
      setOdometerProof(optimized);
      toast({ title: "Mätarbevis bifogat", description: "Sänkning kan nu sparas." });
    };
    reader.readAsDataURL(file);
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
    const optimized = await processImage(canvasRef.current.toDataURL('image/jpeg', 0.8));
    setPhotoPreview(optimized);
    stopCamera();
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setIsCameraActive(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db) return;

    if (isLowering && !odometerProof) {
      toast({ variant: "destructive", title: "Bildbevis krävs", description: "Du måste ladda upp ett besiktningsprotokoll för att sänka mätaren." });
      return;
    }

    if (isBelowFloor) {
      toast({ variant: "destructive", title: "Besiktningsgolv nått", description: `Mätaren kan ej sättas lägre än verifierat golv (${vehicle.inspectionFloorOdometer} mil).` });
      return;
    }

    setLoading(true);
    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const vehicleRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      
      const updates = sanitize({ 
        ...formData, 
        mainImage: photoPreview,
        updatedAt: serverTimestamp() 
      });
      
      await updateDoc(vehicleRef, updates);
      await updateDoc(globalRef, updates);
      
      if (isLowering) {
        const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
        await addDoc(logsRef, { 
          vehicleId: plate, 
          licensePlate: plate, 
          creatorId: user.uid, 
          category: 'Besiktning', 
          odometer: formData.currentOdometerReading, 
          type: 'Correction', 
          notes: 'Mätarkorrigering utförd manuellt med bildbevis.',
          photoUrl: odometerProof,
          createdAt: serverTimestamp() 
        });
      }
      toast({ title: "Fordon uppdaterat!" });
      onClose();
    } catch (err: any) { 
      toast({ variant: "destructive", title: "Fel", description: err.message }); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if(!o) stopCamera(); onClose(); }}>
      <DialogContent className="glass-card p-0 rounded-[2.5rem] sm:max-w-xl max-h-[90vh] overflow-y-auto border-none">
        <div className="p-6 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline">Redigera Info</DialogTitle>
            <DialogDescription>Justera tekniska detaljer och profilbild för din {vehicle.licensePlate}.</DialogDescription>
          </DialogHeader>

          {isLowering && !odometerProof && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
              <Camera className="h-4 w-4" />
              <AlertTitle>Mätarkorrigering krävs</AlertTitle>
              <AlertDescription className="text-xs">
                Ladda upp ett besiktningsprotokoll för att godkänna sänkning av miltalet.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <Label className="text-xs font-bold uppercase opacity-60 ml-1">Profilbild</Label>
            {isCameraActive ? (
              <div className="relative aspect-video rounded-3xl overflow-hidden bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                  <Button variant="outline" onClick={stopCamera} className="bg-black/40 border-white/20">Avbryt</Button>
                  <Button onClick={capturePhoto} className="bg-primary shadow-xl">Ta bild</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="relative aspect-video rounded-3xl overflow-hidden bg-white/5 border border-white/10 group">
                  {photoPreview ? (
                    <>
                      <img src={photoPreview} alt="Bil" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button variant="destructive" size="sm" onClick={() => setPhotoPreview(null)} className="rounded-full h-10 w-10 p-0"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <ImagePlus className="w-10 h-10 opacity-20" />
                      <p className="text-xs italic">Ingen bild vald</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={startCamera} className="h-12 rounded-xl bg-white/5 border-white/10"><Camera className="w-4 h-4 mr-2" /> Kamera</Button>
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="h-12 rounded-xl bg-white/5 border-white/10"><Upload className="w-4 h-4 mr-2" /> Välj fil</Button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60">Märke</Label>
                <Select value={formData.make} onValueChange={(v) => setFormData({...formData, make: v})}>
                  <SelectTrigger className="bg-white/5 h-12 rounded-xl border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">{SWEDISH_CAR_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60">Modell</Label>
                <Input value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} className="bg-white/5 h-12 rounded-xl border-white/10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60">Växellåda</Label>
                <Select value={formData.gearbox} onValueChange={(v) => setFormData({...formData, gearbox: v as any})}>
                  <SelectTrigger className="bg-white/5 h-12 rounded-xl border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Automat">Automat</SelectItem><SelectItem value="Manuell">Manuell</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60">Bränsle</Label>
                <Select value={formData.fuelType} onValueChange={(v) => setFormData({...formData, fuelType: v as any})}>
                  <SelectTrigger className="bg-white/5 h-12 rounded-xl border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Bensin">Bensin</SelectItem><SelectItem value="Diesel">Diesel</SelectItem><SelectItem value="El">El</SelectItem><SelectItem value="Hybrid">Hybrid</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60">Effekt (hk)</Label>
                <Input type="number" value={formData.hp || ''} onChange={(e) => setFormData({...formData, hp: parseInt(e.target.value) || 0})} className="bg-white/5 h-12 rounded-xl border-white/10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase opacity-60">Färg</Label>
                <Input value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} className="bg-white/5 h-12 rounded-xl border-white/10" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className={`text-xs font-bold uppercase ${isLowering ? 'text-destructive' : 'opacity-60'}`}>Mätarställning (mil)</Label>
              <Input type="number" value={formData.currentOdometerReading} onChange={(e) => setFormData({...formData, currentOdometerReading: parseInt(e.target.value) || 0})} className={`bg-white/5 h-12 rounded-xl ${isLowering ? 'border-destructive ring-destructive/20' : 'border-white/10'}`} />
            </div>

            {isLowering && (
              <div 
                onClick={() => odometerProofRef.current?.click()} 
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-all ${odometerProof ? 'bg-green-500/10 border-green-500/30' : 'bg-destructive/5 border-destructive/20'}`}
              >
                {odometerProof ? <CheckCircle2 className="text-green-500 w-8 h-8" /> : <Camera className="text-destructive w-8 h-8" />}
                <span className="text-[10px] font-black uppercase tracking-widest text-center">
                  {odometerProof ? 'BILD BEKRÄFTAD' : 'LADDA UPP BESIKTNINGSPROTOKOLL FÖR ATT SÄNKA MÄTARE'}
                </span>
                <input type="file" ref={odometerProofRef} className="hidden" accept="image/*" onChange={handleOdometerProofUpload} />
              </div>
            )}

            <DialogFooter className="gap-3 pt-4">
              <Button variant="ghost" type="button" onClick={onClose} className="rounded-xl flex-1">Avbryt</Button>
              <Button type="submit" disabled={loading || (isLowering && !odometerProof)} className="rounded-xl flex-[2] font-bold text-lg shadow-xl shadow-primary/20">
                {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : "Spara ändringar"}
              </Button>
            </DialogFooter>
          </form>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
