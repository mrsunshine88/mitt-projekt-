
"use client";

import { useState } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';
import { getAuth, deleteUser } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserProfile } from '@/types/autolog';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const userRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userRef);

  const handleDeleteAccount = async () => {
    const auth = getAuth();
    if (!auth.currentUser || !db || !user) return;

    if (confirmText !== 'RADERA') {
      toast({ variant: "destructive", title: "Fel bekräftelsekod", description: "Du måste skriva RADERA för att fortsätta." });
      return;
    }

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);

      // 1. Find all vehicles owned by user in allVehicles and mark them as ownerless
      const globalVehiclesQuery = query(collection(db, 'allVehicles'), where('ownerId', '==', user.uid));
      const globalSnap = await getDocs(globalVehiclesQuery);
      globalSnap.forEach((docSnap) => {
        batch.update(docSnap.ref, { 
          ownerId: null, // Separates history from user but keeps it linked to license plate
          previousOwnerId: user.uid 
        });
      });

      // 2. Delete private profile records
      batch.delete(doc(db, 'users', user.uid));
      batch.delete(doc(db, 'public_profiles', user.uid));
      
      // 3. Delete any workshop entry if applicable
      batch.delete(doc(db, 'workshops', user.uid));

      await batch.commit();

      // 4. Finally delete the auth user
      await deleteUser(auth.currentUser);
      
      toast({
        title: "Konto raderat",
        description: "Ditt konto har tagits bort. Bilarnas historik har bevarats i systemet.",
      });
      router.push('/');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        toast({
          variant: "destructive",
          title: "Säkerhetskontroll",
          description: "För att radera ditt konto måste du ha loggat in nyligen. Logga ut och in igen, försök sedan på nytt.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Fel vid radering",
          description: err.message || "Kunde inte radera kontot just nu.",
        });
      }
    } finally {
      setIsDeleting(false);
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
    <div className="container max-w-2xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-bold">Inställningar</h1>
        <p className="text-muted-foreground">Hantera ditt konto och säkerhet</p>
      </header>

      <div className="grid gap-6">
        <Card className="bg-card/30 border-white/5">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest opacity-60">Kontoinformation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Inloggad som</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Kontotyp</p>
              <p className="text-sm text-muted-foreground">
                {profile?.userType === 'Workshop' ? 'Certifierad Verkstad' : 'Privat Bilägare'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20 border-dashed">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Farlig zon
            </CardTitle>
            <CardDescription>Åtgärder här är permanenta och kan inte ångras.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Varning: Ditt personliga konto raderas. Bilens historik sparas i systemet kopplat till fordonets ID för framtida ägare eller nyregistrering. Detta säkerställer att fordonets andrahandsvärde bevaras.
            </p>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full sm:w-auto">
                  <Trash2 className="w-4 h-4 mr-2" /> Radera mitt konto
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="glass-card border-destructive/20">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl">Är du helt säker?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    Ditt personliga konto raderas permanent. Bilens historik sparas i systemet kopplat till fordonets ID för framtida ägare.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                
                <div className="py-4 space-y-2">
                  <Label htmlFor="confirmDelete" className="text-sm font-bold">Skriv "RADERA" för att bekräfta:</Label>
                  <Input 
                    id="confirmDelete" 
                    placeholder="RADERA" 
                    value={confirmText} 
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="bg-white/5"
                  />
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/5 border-white/10 hover:bg-white/10">Avbryt</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteAccount}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={isDeleting || confirmText !== 'RADERA'}
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Ja, radera kontot
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
