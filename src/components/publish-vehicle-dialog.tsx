
"use client";

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Camera, X, AlertCircle } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Vehicle } from '@/types/autolog';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAuth } from 'firebase/auth';

const compressImage = (file: File, maxWidth = 800, quality = 0.4): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

interface PublishVehicleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
}

export function PublishVehicleDialog({ isOpen, onClose, vehicle }: PublishVehicleDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const db = useFirestore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    price: 0,
    description: '',
    tires: '',
    lastInspection: '',
  });

  const handlePriceChange = (value: string) => {
    const parsed = parseInt(value);
    setFormData(prev => ({ ...prev, price: isNaN(parsed) ? 0 : parsed }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const newImages = [...images, ...selectedFiles].slice(0, 5);
      setImages(newImages);
      const newPreviews = newImages.map(file => URL.createObjectURL(file));
      setPreviews(newPreviews);
      setError(null);
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviews(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      const auth = getAuth();
      if (!auth.currentUser || !db || !vehicle) {
        throw new Error("Systemet är inte redo.");
      }
      
      if (images.length === 0) {
        throw new Error("Minst en bild krävs.");
      }

      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      
      const base64Images = await Promise.all(images.map(img => compressImage(img)));
      
      const normalizedPlate = (vehicle.licensePlate || '').toUpperCase().replace(/\s/g, '');
      const listingId = normalizedPlate || vehicle.id;
      
      const commonData = {
        id: listingId,
        ownerId: auth.currentUser.uid,
        ownerName: userData.name || auth.currentUser.displayName || auth.currentUser.email || 'Säljare',
        ownerPhone: userData.phoneNumber || 'Inget nummer angivet',
        make: vehicle.make,
        model: vehicle.model,
        licensePlate: normalizedPlate,
        year: vehicle.year,
        currentOdometerReading: vehicle.currentOdometerReading,
        price: formData.price,
        description: formData.description,
        mainImage: base64Images[0], 
        imageUrls: base64Images,
        tires: formData.tires,
        lastInspection: formData.lastInspection,
        isPublished: true,
        publicShareId: vehicle.publicShareId || Math.random().toString(36).substring(2, 8).toUpperCase(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'public_listings', listingId), commonData, { merge: true });
      
      // Also ensure global registry is updated with descriptive data
      await setDoc(doc(db, 'allVehicles', normalizedPlate), {
        licensePlate: normalizedPlate,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        currentOdometerReading: vehicle.currentOdometerReading,
        ownerId: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'vehicles', vehicle.id), {
        isPublished: true,
        price: formData.price,
        mainImage: base64Images[0],
        imageUrls: base64Images,
        updatedAt: serverTimestamp(),
      });

      toast({ title: "Publicerad!" });
      onClose();
    } catch (err: any) {
      console.error("Publiceringsfel:", err);
      setError(err.message || "Ett fel uppstod vid bildhanteringen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !loading && onClose()}>
      <DialogContent className="sm:max-w-[550px] glass-card border-white/10 text-foreground overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline">Publicera annons</DialogTitle>
          <DialogDescription>
            Bilen: {vehicle?.make} {vehicle?.model} ({vehicle?.licensePlate})
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Pris (SEK)</Label>
              <Input id="price" type="number" value={formData.price || ''} onChange={(e) => handlePriceChange(e.target.value)} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insp">Senaste besiktning</Label>
              <Input id="insp" placeholder="ÅÅÅÅ-MM-DD" value={formData.lastInspection} onChange={(e) => setFormData({...formData, lastInspection: e.target.value})} disabled={loading} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Beskrivning</Label>
            <Textarea id="desc" className="h-32" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required disabled={loading} />
          </div>

          <div className="space-y-4">
            <Label>Bilder (1-5)</Label>
            <div className="grid grid-cols-5 gap-2">
              {previews.map((p, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-white/5">
                  <Image src={p} alt="Preview" fill className="object-cover" />
                  {!loading && (
                    <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 bg-black/60 p-1 rounded-full">
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>
              ))}
              {images.length < 5 && !loading && (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center hover:bg-white/5 transition-all">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageChange} disabled={loading} />
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>Avbryt</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Publicera"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
