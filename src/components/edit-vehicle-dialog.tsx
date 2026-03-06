"use client";

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Camera, CheckCircle2, Upload, Trash2, ImagePlus, AlertCircle, Gauge } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp, setDoc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Vehicle, VehicleLog } from '@/types/autolog';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';
import { firebaseConfig } from '@/firebase/config';
import { sanitize } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { calculateOverallTrust } from '@/components/history-list';

const processImage = (dataUri: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
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
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      } catch (e) {
        reject(e);
      }
    };
    reject;
    img.src = dataUri;
  });
};

export function EditVehicleDialog({ isOpen, onClose, vehicle }: { isOpen: boolean; onClose: () => void; vehicle: Vehicle; }) {
  const [loading, setLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [correctionProof, setCorrectionProof] = useState<string | null>(null);
  
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const correctionProofRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: 0,
    currentOdometerReading: 0,
    fuelType: 'Bensin',
    gearbox: 'Automat',
    hp: 0,
    color: '',
  });

  const isLowering = formData.currentOdometerReading < (vehicle?.currentOdometerReading || 0);

  useEffect(() => {
    if (vehicle && isOpen) {
      setFormData({
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year || 0,
        currentOdometerReading: vehicle.currentOdometerReading || 0,
        fuelType: vehicle.fuelType || 'Bensin',
        gearbox: vehicle.gearbox || 'Automat',
        hp: vehicle.hp || 0,
        color: vehicle.color || '',
      });
      setPhotoPreview(vehicle.mainImage || null);
      setCorrectionProof(null);
    }
  }, [vehicle, isOpen]);

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
            ? "Kameran används redan av ett annat program." 
            : "Kunde inte starta kameran. Kontrollera behörigheter.";
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

  const handleCorrectionProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const optimized = await processImage(event.target?.result as string);
      setCorrectionProof(optimized);
    };
    reader.readAsDataURL(file);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    if (!context) return;
    
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    
    const optimized = await processImage(canvasRef.current.toDataURL('image/jpeg', 0.8));
    setPhotoPreview(optimized);
    setIsCameraActive(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db || !vehicle) return;

    if (isLowering) {
      if (!correctionProof) {
        toast({ variant: "destructive", title: "Bevis krävs", description: "Du måste bifoga ett besiktningsprotokoll för att sänka miltalet." });
        return;
      }
      setLoading(true);
      try {
        const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'odometer_corrections', plate);
        await setDoc(requestRef, {
          id: plate,
          licensePlate: plate,
          ownerId: user.uid,
          ownerName: user.displayName || 'Ägare',
          requestedOdometer: formData.currentOdometerReading,
          currentOdometer: vehicle.currentOdometerReading,
          proofImageUrl: correctionProof,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        toast({ title: "Ansökan skickad!", description: "Huvudadmin kommer nu granska din begäran." });
        onClose();
      } catch (err: any) {
        toast({ variant: "destructive", title: "Fel", description: err.message });
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const batch = writeBatch(db);
      
      // Hämta historiken för att räkna om tillit innan sparning
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
      const logsSnap = await getDocs(logsRef);
      const logs = logsSnap.docs.map(d => d.data() as VehicleLog);
      const currentTrust = calculateOverallTrust(logs);

      const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      const privateRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
      const listingRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate);
      
      const updates: any = sanitize({ 
        ...formData, 
        mainImage: photoPreview,
        overallTrust: currentTrust,
        updatedAt: serverTimestamp() 
      });

      if (photoPreview && photoPreview !== vehicle.mainImage) {
        updates.imageUrls = [photoPreview, ...(vehicle.imageUrls?.slice(1) || [])];
      }

      if (vehicle.isPublished) {
        batch.update(listingRef, updates);
      }
      
      batch.update(globalRef, updates);
      batch.update(privateRef, updates);

      await batch.commit();
      toast({ title: "Fordon uppdaterat!" });
      onClose();
    } catch (err: any) { 
      toast({ variant: "destructive", title: "Fel", description: err.message }); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if(!o) setIsCameraActive(false); onClose(); }}>
      <DialogContent className="glass-card p-0 rounded-[2.5rem] sm:max-w-xl max-h-[90vh] overflow-y-auto border-none">
        <div className="p-6 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline">Redigera Info</DialogTitle>
            <DialogDescription>Uppdatera din {vehicle.licensePlate}. Sänkning av miltal skickas som ansökan till Huvudadmin.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase opacity-60 ml-1">Profilbild</Label>
              {isCameraActive ? (
                <div className="relative aspect-video rounded-3xl overflow-hidden bg-black">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                    <Button variant="outline" type="button" onClick={() => setIsCameraActive(false)} className="bg-black/40 border-white/20">Avbryt</Button>
                    <Button type="button" onClick={capturePhoto} className="bg-primary shadow-xl">Ta bild</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="relative aspect-video rounded-3xl overflow-hidden bg-white/5 border border-white/10 group">
                    {photoPreview ? (
                      <>
                        <img src={photoPreview} alt="Bil" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button variant="destructive" type="button" size="sm" onClick={() => setPhotoPreview(null)} className="rounded-full h-10 w-10 p-0"><Trash2 className="w-4 h-4" /></Button>
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
                    <Button variant="outline" type="button" onClick={() => setIsCameraActive(true)} className="h-12 rounded-xl bg-white/5 border-white/10"><Camera className="w-4 h-4 mr-2" /> Kamera</Button>
                    <Button variant="outline" type="button" onClick={() => fileInputRef.current?.click()} className="h-12 rounded-xl bg-white/5 border-white/10"><Upload className="w-4 h-4 mr-2" /> Välj fil</Button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 pt-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                <div className="flex justify-between items-center">
                  <Label className={`text-xs font-bold uppercase ${isLowering ? 'text-destructive animate-pulse' : 'opacity-60'}`}>Mätarställning (mil)</Label>
                  <Badge variant="outline" className="text-[10px] font-mono opacity-40">Nuvarande: {vehicle.currentOdometerReading}</Badge>
                </div>
                <div className="relative">
                  <Gauge className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isLowering ? 'text-destructive' : 'text-primary'}`} />
                  <Input 
                    type="number" 
                    value={formData.currentOdometerReading || ''} 
                    onChange={(e) => setFormData({...formData, currentOdometerReading: parseInt(e.target.value) || 0})} 
                    className={`h-14 pl-12 text-xl font-bold bg-background rounded-xl ${isLowering ? 'border-destructive ring-destructive/20' : 'border-white/10'}`} 
                  />
                </div>

                {isLowering && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3 text-destructive">
                      <AlertCircle className="w-5 h-5" />
                      <p className="text-xs font-bold uppercase tracking-tight">Mätarsänkning kräver bevis</p>
                    </div>
                    <p className="text-[10px] text-slate-400">Eftersom du sänker mätaren skickas detta som en ansökan. Bifoga foto på ditt senaste besiktningsprotokoll för verifiering.</p>
                    
                    <div 
                      onClick={() => correctionProofRef.current?.click()}
                      className={`h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${correctionProof ? 'border-green-500 bg-green-500/5' : 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10'}`}
                    >
                      {correctionProof ? (
                        <div className="flex flex-col items-center gap-1 text-green-500">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-[10px] font-bold uppercase">Dokument bifogat</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-destructive/60">
                          <Camera className="w-5 h-5" />
                          <span className="text-[10px] font-bold uppercase">Fota besiktningspapper</span>
                        </div>
                      )}
                    </div>
                    <input type="file" ref={correctionProofRef} className="hidden" accept="image/*" onChange={handleCorrectionProofUpload} />
                  </div>
                )}
              </div>
            </div>

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

            <DialogFooter className="gap-3 pt-4">
              <Button variant="ghost" type="button" onClick={onClose} className="rounded-xl flex-1">Avbryt</Button>
              <Button type="submit" disabled={loading} className={`rounded-xl flex-[2] font-bold text-lg shadow-xl ${isLowering ? 'bg-destructive hover:bg-destructive/90 shadow-destructive/20' : 'shadow-primary/20'}`}>
                {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : isLowering ? "Skicka ansökan" : "Spara ändringar"}
              </Button>
            </DialogFooter>
          </form>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
