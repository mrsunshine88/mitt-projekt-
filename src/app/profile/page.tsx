"use client";

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { updateProfile, getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, User, Phone, Mail, Edit2, Check, X, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserProfile } from '@/types/autolog';

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const userRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userRef);

  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    email: '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        phoneNumber: profile.phoneNumber || '',
        email: profile.email || '',
      });
    } else if (user) {
      setFormData(prev => ({ ...prev, email: user.email || '' }));
    }
  }, [profile, user]);

  const handleSave = async () => {
    if (!user || !db) return;

    setLoading(true);
    try {
      const auth = getAuth();
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: formData.name });
      }

      const batch = writeBatch(db);
      
      const privateRef = doc(db, 'users', user.uid);
      batch.update(privateRef, {
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        updatedAt: serverTimestamp(),
      });

      const publicRef = doc(db, 'public_profiles', user.uid);
      batch.set(publicRef, {
        id: user.uid,
        name: formData.name,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      toast({
        title: "Profil uppdaterad",
        description: "Dina ändringar har sparats.",
      });
      setIsEditing(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Kunde inte spara",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container max-w-2xl mx-auto px-4 py-12 md:py-20">
      <div className="flex flex-col items-center mb-12">
        <div className="relative group">
          <Avatar className="w-32 h-32 md:w-40 md:h-40 border-4 border-background shadow-2xl">
            <AvatarImage src={user.photoURL || ""} alt={formData.name} />
            <AvatarFallback className="bg-primary/10 text-primary text-4xl md:text-5xl font-headline">
              {formData.name?.substring(0, 1).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          {isEditing && (
            <button className="absolute bottom-2 right-2 p-2 bg-primary text-white rounded-full shadow-lg hover:scale-110 transition-transform">
              <Camera className="w-5 h-5" />
            </button>
          )}
        </div>
        <h1 className="mt-6 text-3xl font-headline font-bold">{formData.name || "Anonym Användare"}</h1>
        <p className="text-muted-foreground">{profile?.userType === 'Workshop' ? 'Certifierad Verkstad' : 'Privat Bilägare'}</p>
      </div>

      <Card className="glass-card border-none overflow-hidden shadow-2xl">
        <CardContent className="p-8 md:p-12">
          {!isEditing ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-1">
                  <div className="flex items-center gap-3 text-muted-foreground mb-1">
                    <User className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest">Namn</span>
                  </div>
                  <p className="text-lg font-medium">{formData.name || "Ej angivet"}</p>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-3 text-muted-foreground mb-1">
                    <Phone className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest">Telefon</span>
                  </div>
                  <p className="text-lg font-medium">{formData.phoneNumber || "Ej angivet"}</p>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <div className="flex items-center gap-3 text-muted-foreground mb-1">
                    <Mail className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest">E-post</span>
                  </div>
                  <p className="text-lg font-medium">{formData.email}</p>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5">
                <Button 
                  onClick={() => setIsEditing(true)} 
                  className="w-full h-12 rounded-full font-bold shadow-lg shadow-primary/20"
                >
                  <Edit2 className="w-4 h-4 mr-2" /> Redigera profil
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest opacity-60">Fullständigt namn</Label>
                  <Input 
                    id="name" 
                    value={formData.name} 
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="h-12 bg-white/5 border-white/10 rounded-xl"
                    placeholder="Erik Johansson"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest opacity-60">Telefonnummer</Label>
                  <Input 
                    id="phone" 
                    value={formData.phoneNumber} 
                    onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                    className="h-12 bg-white/5 border-white/10 rounded-xl"
                    placeholder="070-123 45 67"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest opacity-60">E-post (kan ej ändras)</Label>
                  <Input 
                    value={formData.email} 
                    disabled 
                    className="h-12 bg-white/5 border-white/5 rounded-xl opacity-50 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-6">
                <Button 
                  onClick={handleSave} 
                  disabled={loading}
                  className="flex-1 h-12 rounded-full font-bold shadow-lg shadow-primary/20"
                >
                  {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Spara ändringar
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)} 
                  disabled={loading}
                  className="flex-1 h-12 rounded-full border-white/10 hover:bg-white/5"
                >
                  <X className="w-4 h-4 mr-2" /> Avbryt
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
