
"use client";

import { useState, useEffect, useRef } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { updateProfile, getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, UserCircle, Camera, Upload, Trash2, Globe, MapPin, Building2, Phone, Mail, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserProfile } from '@/types/autolog';
import { sanitize } from '@/lib/utils';
import { firebaseConfig } from '@/firebase/config';

const processImage = (dataUri: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 400; 
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
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUri;
  });
};

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const userRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'users', user.uid, 'profiles', 'user-profile');
  }, [db, user?.uid, appId]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userRef);

  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    email: '',
    organizationNumber: '',
    address: '',
    website: '',
    description: '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        phoneNumber: profile.phoneNumber || '',
        email: profile.email || '',
        organizationNumber: profile.organizationNumber || '',
        address: profile.address || '',
        website: profile.website || '',
        description: profile.description || '',
      });
      setPhotoPreview(profile.photoUrl || null);
    } else if (user) {
      setFormData(p => ({ ...p, email: user.email || '', name: user.displayName || '' }));
    }
  }, [profile, user]);

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

  const handleSave = async () => {
    if (!user?.uid || !db || !userRef) return;
    setLoading(true);
    try {
      const auth = getAuth();
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { 
          displayName: formData.name,
          photoURL: photoPreview 
        });
      }

      const batch = writeBatch(db);
      const updateData = sanitize({
        ...formData,
        id: user.uid,
        userType: profile?.userType || 'CarOwner',
        photoUrl: photoPreview,
        updatedAt: serverTimestamp(),
      });

      batch.set(userRef, updateData, { merge: true });
      const publicRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
      batch.set(publicRef, sanitize({ ...updateData, updatedAt: serverTimestamp() }), { merge: true });

      // 1. Uppdatera alla annonser
      const listingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'public_listings');
      const qListings = query(listingsRef, where('ownerId', '==', user.uid));
      const listingsSnap = await getDocs(qListings);
      listingsSnap.forEach((d) => batch.update(d.ref, { ownerName: formData.name, ownerPhone: formData.phoneNumber || null }));

      // 2. Uppdatera alla konversationer (FIX: Namn i inkorgen)
      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      const qConvos = query(convosRef, where('participants', 'array-contains', user.uid));
      const convosSnap = await getDocs(qConvos);
      convosSnap.forEach((d) => {
        const convoData = d.data();
        const updatedNames = { ...(convoData.participantNames || {}), [user.uid]: formData.name };
        batch.update(d.ref, { 
          participantNames: updatedNames,
          updatedAt: serverTimestamp()
        });
      });

      // 3. Uppdatera alla historiska stämplar
      const carsListRef = collection(db, 'artifacts', appId, 'public', 'data', 'cars');
      const carsSnap = await getDocs(carsListRef);
      for (const carDoc of carsSnap.docs) {
        const plate = carDoc.id;
        const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
        const logsQuery = query(logsRef, where('creatorId', '==', user.uid));
        const logsSnap = await getDocs(logsQuery);
        logsSnap.forEach(l => batch.update(l.ref, { creatorName: formData.name }));
      }

      await batch.commit();
      toast({ title: "Profil och register uppdaterade!" });
      setIsEditing(false);
    } catch (err: any) { 
      toast({ variant: "destructive", title: "Fel", description: err.message }); 
    } finally { 
      setLoading(false); 
    }
  };

  if (isUserLoading || isProfileLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  if (!user) return null;

  const isWorkshop = profile?.userType === 'Workshop';

  return (
    <div className="container max-w-3xl mx-auto px-4 py-12 text-white">
      <div className="flex flex-col items-center mb-12">
        <div className="relative group">
          <div className="w-32 h-32 rounded-full bg-primary/10 border-4 border-white/5 flex items-center justify-center text-primary shadow-2xl overflow-hidden">
            {photoPreview ? (
              <img src={photoPreview} alt="Profil" className="w-full h-full object-cover" />
            ) : (
              <UserCircle className="w-20 h-20" />
            )}
          </div>
          {isEditing && (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Camera className="w-6 h-6 text-white mb-1" />
              <span className="text-[10px] font-bold text-white uppercase">Ändra</span>
            </button>
          )}
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
        </div>
        <h1 className="mt-6 text-3xl font-headline font-bold lowercase">{formData.name || "Användare"}</h1>
        <p className="text-muted-foreground uppercase text-[10px] font-bold tracking-widest mt-1">
          {isWorkshop ? 'Verifierad Verkstad' : 'Privat Bilägare'}
        </p>
      </div>

      <Card className="glass-card border-none shadow-2xl rounded-[2rem] overflow-hidden">
        <CardContent className="p-8">
          {!isEditing ? (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-1.5">
                  <Label className="text-[10px] opacity-50 uppercase font-bold tracking-wider flex items-center gap-2"><Building2 className="w-3 h-3" /> Namn</Label>
                  <p className="text-lg font-medium">{formData.name}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] opacity-50 uppercase font-bold tracking-wider flex items-center gap-2"><Phone className="w-3 h-3" /> Telefon</Label>
                  <p className="text-lg font-medium">{formData.phoneNumber || "Ej angivet"}</p>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-[10px] opacity-50 uppercase font-bold tracking-wider flex items-center gap-2"><Mail className="w-3 h-3" /> E-post</Label>
                  <p className="text-lg font-medium">{formData.email}</p>
                </div>

                {isWorkshop && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] opacity-50 uppercase font-bold tracking-wider flex items-center gap-2"><FileText className="w-3 h-3" /> Organisationsnummer</Label>
                      <p className="text-lg font-medium">{formData.organizationNumber || "Ej angivet"}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] opacity-50 uppercase font-bold tracking-wider flex items-center gap-2"><MapPin className="w-3 h-3" /> Adress</Label>
                      <p className="text-lg font-medium">{formData.address || "Ej angivet"}</p>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-[10px] opacity-50 uppercase font-bold tracking-wider flex items-center gap-2"><Globe className="w-3 h-3" /> Webbplats</Label>
                      {formData.website ? (
                        <a href={formData.website.startsWith('http') ? formData.website : `https://${formData.website}`} target="_blank" className="text-primary hover:underline text-lg font-medium block">
                          {formData.website}
                        </a>
                      ) : <p className="text-lg opacity-40">Ej angivet</p>}
                    </div>
                    {formData.description && (
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-[10px] opacity-50 uppercase font-bold tracking-wider">Om verkstaden</Label>
                        <p className="text-sm leading-relaxed text-slate-300 italic">"{formData.description}"</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <Button onClick={() => setIsEditing(true)} className="w-full h-14 rounded-2xl font-bold bg-primary text-white shadow-xl shadow-primary/20">Redigera profil</Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase opacity-60 ml-1">Namn / Företag</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="h-12 bg-white/5 rounded-xl border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase opacity-60 ml-1">Telefon</Label>
                  <Input value={formData.phoneNumber} onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})} className="h-12 bg-white/5 rounded-xl border-white/10" />
                </div>
                
                {isWorkshop && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase opacity-60 ml-1">Organisationsnummer</Label>
                      <Input value={formData.organizationNumber} onChange={(e) => setFormData({...formData, organizationNumber: e.target.value})} className="h-12 bg-white/5 rounded-xl border-white/10" placeholder="123456-7890" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase opacity-60 ml-1">Webbplats</Label>
                      <Input value={formData.website} onChange={(e) => setFormData({...formData, website: e.target.value})} className="h-12 bg-white/5 rounded-xl border-white/10" placeholder="www.verkstad.se" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs font-bold uppercase opacity-60 ml-1">Gatuadress</Label>
                      <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="h-12 bg-white/5 rounded-xl border-white/10" placeholder="Gatan 1, 123 45 Stad" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs font-bold uppercase opacity-60 ml-1">Beskrivning / Om oss</Label>
                      <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="bg-white/5 rounded-xl border-white/10 min-h-[100px]" placeholder="Berätta kort om er verkstad..." />
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex gap-3 pt-6">
                <Button onClick={handleSave} disabled={loading} className="flex-1 h-14 rounded-2xl font-bold bg-primary text-white shadow-lg">
                  {loading ? <Loader2 className="animate-spin" /> : 'Spara ändringar'}
                </Button>
                <Button variant="ghost" onClick={() => setIsEditing(false)} className="flex-1 h-14 rounded-2xl border border-white/10">Avbryt</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
