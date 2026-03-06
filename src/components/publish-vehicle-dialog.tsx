
"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Camera, X, ShieldCheck } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Vehicle } from '@/types/autolog';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { sanitize } from '@/lib/utils';

const compressImage = (dataUri: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
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

export function PublishVehicleDialog({ isOpen, onClose, vehicle }: { isOpen: boolean; onClose: () => void; vehicle: Vehicle; }) {
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [hasNewImages, setHasNewImages] = useState(false);
  const db = useFirestore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appId = firebaseConfig.projectId;

  const [formData, setFormData] = useState({
    price: 0,
    description: '',
    fuelType: 'Bensin',
    gearbox: 'Manuell',
    hp: 0,
    color: '',
    lastInspection: '',
  });

  useEffect(() => {
    if (vehicle && isOpen) {
      const isNewAd = !vehicle.isPublished;

      setFormData({
        price: isNewAd ? 0 : (vehicle.price || 0),
        description: isNewAd ? '' : (vehicle.description || ''),
        fuelType: vehicle.fuelType || 'Bensin',
        gearbox: vehicle.gearbox || 'Manuell',
        hp: vehicle.hp || 0,
        color: vehicle.color || '',
        lastInspection: vehicle.lastInspection || '',
      });
      
      if (!isNewAd && vehicle.adImageUrls && vehicle.adImageUrls.length > 0) {
        setPreviews(vehicle.adImageUrls);
      } else {
        setPreviews([]);
      }
      setHasNewImages(false);
    }
  }, [vehicle, isOpen]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setHasNewImages(true);
      const files = Array.from(e.target.files);
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = await compressImage(ev.target?.result as string);
          setPreviews(prev => [...prev, base64].slice(0, 5));
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const auth = getAuth();
    if (!auth.currentUser || !db || !vehicle) return;
    setLoading(true);
    
    try {
      const plate = (vehicle.licensePlate || vehicle.id || '').toUpperCase().replace(/\s/g, '');
      if (!plate) throw new Error("Fordonet saknar identifierare.");

      const carRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      const carSnap = await getDoc(carRef);
      const carData = carSnap.exists() ? carSnap.data() : vehicle;
      
      const finalAdMainImage = hasNewImages ? (previews.length > 0 ? previews[0] : null) : (vehicle.adMainImage || null);
      const finalAdImageUrls = hasNewImages ? (previews.length > 0 ? previews : null) : (vehicle.adImageUrls || null);

      const updatePayload = sanitize({
        make: carData.make || vehicle.make || 'Bil',
        model: carData.model || vehicle.model || '',
        year: carData.year || vehicle.year || 0,
        licensePlate: plate,
        currentOdometerReading: carData.currentOdometerReading || vehicle.currentOdometerReading || 0,
        mainImage: carData.mainImage || vehicle.mainImage || null,
        ownerId: carData.ownerId || vehicle.ownerId || auth.currentUser.uid,
        ...formData,
        adMainImage: finalAdMainImage,
        adImageUrls: finalAdImageUrls,
        isPublished: true,
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate), updatePayload, { merge: true });
      await setDoc(carRef, updatePayload, { merge: true });
      
      const ownerToUpdate = carData.ownerId || vehicle.ownerId || auth.currentUser.uid;
      const privateRef = doc(db, 'artifacts', appId, 'users', ownerToUpdate, 'vehicles', plate);
      await setDoc(privateRef, updatePayload, { merge: true });
      
      toast({ title: vehicle.isPublished ? "Annons ändrad!" : "Annons publicerad!" });
      onClose();
    } catch (err: any) { 
      console.error("Publish error:", err);
      toast({ variant: "destructive", title: "Fel vid publicering", description: err.message });
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-card p-6 rounded-[2.5rem] sm:max-w-[550px] max-h-[90vh] overflow-y-auto border-none">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline flex items-center gap-2">
            {vehicle?.isPublished ? 'Redigera annons' : 'Publicera annons'} <ShieldCheck className="w-6 h-6 text-primary" />
          </DialogTitle>
          <DialogDescription>Justera annonsens innehåll. Fordonets fasta profilbild i garaget påverkas inte.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60">Pris (SEK)</Label>
              <Input 
                type="number" 
                value={formData.price || ''} 
                onChange={(e) => setFormData({...formData, price: parseInt(e.target.value) || 0})} 
                className="bg-white/5 h-12 rounded-xl" 
                required 
                placeholder="Ange pris..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60">Färg</Label>
              <Input value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} className="bg-white/5 h-12 rounded-xl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60">Bränsle</Label>
              <Select value={formData.fuelType} onValueChange={(v) => setFormData({...formData, fuelType: v})}>
                <SelectTrigger className="bg-white/5 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bensin">Bensin</SelectItem>
                  <SelectItem value="Diesel">Diesel</SelectItem>
                  <SelectItem value="El">El</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60">Växellåda</Label>
              <Select value={formData.gearbox} onValueChange={(v) => setFormData({...formData, gearbox: v})}>
                <SelectTrigger className="bg-white/5 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Automat">Automat</SelectItem>
                  <SelectItem value="Manuell">Manuell</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase opacity-60">Säljtext (Beskrivning)</Label>
            <Textarea 
              value={formData.description} 
              onChange={(e) => setFormData({...formData, description: e.target.value})} 
              className="h-32 bg-white/5 rounded-xl border-white/10" 
              placeholder="Beskriv bilen för köparen..." 
              required 
            />
          </div>

          <div className="space-y-4">
            <Label className="text-xs font-bold uppercase opacity-60">Annonsbilder (Max 5)</Label>
            <p className="text-[10px] text-muted-foreground italic -mt-2">Om du tar bort alla annonsbilder visas bilens profilbild istället.</p>
            <div className="grid grid-cols-5 gap-3">
              {previews.map((p, i) => (
                <div key={i} className="aspect-square relative rounded-xl overflow-hidden border border-white/10 group">
                  <img src={p} alt="Preview" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => {
                    const newPreviews = previews.filter((_, idx) => idx !== i);
                    setPreviews(newPreviews);
                    setHasNewImages(true);
                  }} className="absolute top-1 right-1 bg-black/60 p-1 rounded-full"><X className="w-3 h-3 text-white" /></button>
                </div>
              ))}
              {previews.length < 5 && (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center hover:bg-white/5 transition-all text-muted-foreground">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[8px] font-bold">LÄGG TILL</span>
                </button>
              )}
            </div>
            <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleImageChange} />
          </div>

          <DialogFooter className="gap-3 pt-4">
            <Button variant="ghost" type="button" onClick={onClose} className="rounded-xl flex-1">Avbryt</Button>
            <Button type="submit" disabled={loading} className="rounded-xl flex-[2] font-bold text-lg shadow-xl shadow-primary/20">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : (vehicle?.isPublished ? "Spara ändringar" : "Publicera annons")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
