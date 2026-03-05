"use client";

import { useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { getAuth, deleteUser } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import { firebaseConfig } from '@/firebase/config';

export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDeleteAccount = async () => {
    const auth = getAuth();
    if (!auth.currentUser || !db || !user?.uid) return;
    if (confirmText !== 'RADERA') {
      toast({ variant: "destructive", title: "Fel", description: "Vänligen skriv RADERA för att bekräfta." });
      return;
    }

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid));
      batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'profiles', 'user-profile'));
      await batch.commit();
      await deleteUser(auth.currentUser);
      window.location.href = '/';
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel vid radering", description: err.message });
      setIsDeleting(false);
    }
  };

  if (isUserLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  if (!user) return null;

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8">
      <header className="mb-8 flex items-center gap-4">
        <a href="/profile" className="p-2 hover:bg-white/5 rounded-full"><ArrowLeft className="w-5 h-5" /></a>
        <h1 className="text-3xl font-headline font-bold">Inställningar</h1>
      </header>
      
      <div className="grid gap-6">
        <Card className="bg-destructive/5 border-destructive/20 border-dashed rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Farlig zon</CardTitle>
            <CardDescription>Radera ditt konto och all din fordonsdata permanent.</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full h-14 rounded-2xl font-bold">Radera konto permanent</Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="glass-card border-white/10 rounded-[2rem]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Är du helt säker?</AlertDialogTitle>
                  <AlertDialogDescription>Detta kan inte ångras. All din historik försvinner.</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4 space-y-2">
                  <Label>Bekräfta genom att skriva RADERA:</Label>
                  <Input placeholder="RADERA" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="h-14 text-center font-bold tracking-widest bg-white/5" />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Avbryt</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} disabled={confirmText !== 'RADERA' || isDeleting} className="bg-destructive rounded-xl">
                    {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Radera allt
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
