"use client";

import { useState } from 'react';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, writeBatch, collection, getDocs, serverTimestamp, query, where, addDoc, arrayUnion } from 'firebase/firestore';
import { getAuth, deleteUser, updatePassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Trash2, AlertTriangle, ArrowLeft, KeyRound, MessageSquare, ShieldCheck, Mail } from 'lucide-react';
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
import { useRouter } from 'next/navigation';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';

export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const appId = firebaseConfig.projectId;

  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [supportMessage, setSupportMessage] = useState('');
  const [isSendingSupport, setIsSendingSupport] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const auth = getAuth();
    if (!auth.currentUser || newPassword.length < 6) {
      toast({ variant: "destructive", title: "För kort lösenord", description: "Lösenordet måste vara minst 6 tecken." });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      toast({ title: "Lösenordet uppdaterat!", description: "Ditt nya lösenord är nu aktivt." });
      setNewPassword('');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        toast({ 
          variant: "destructive", 
          title: "Säkerhetsverifiering krävs", 
          description: "Vänligen logga ut och in igen för att kunna byta lösenord (säkerhetskrav)." 
        });
      } else {
        toast({ variant: "destructive", title: "Fel", description: err.message });
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleContactAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user || !supportMessage.trim()) return;

    setIsSendingSupport(true);
    try {
      // KRITISKT: Sök efter administratören via den fasta e-postadressen
      const adminEmail = 'apersson508@gmail.com'.toLowerCase();
      const profilesRef = collection(db, 'artifacts', appId, 'public', 'data', 'public_profiles');
      
      const q = query(profilesRef, where('email', '==', adminEmail));
      const adminSnap = await getDocs(q);

      if (adminSnap.empty) {
        throw new Error("Kunde inte hitta administratören i systemet.");
      }

      const adminDoc = adminSnap.docs[0];
      const adminId = adminDoc.id;
      const adminData = adminDoc.data();

      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      const chatQuery = query(
        convosRef,
        where('participants', 'array-contains', user.uid),
        where('carId', '==', 'SUPPORT')
      );
      const chatSnap = await getDocs(chatQuery);

      let convoId;
      if (!chatSnap.empty) {
        convoId = chatSnap.docs[0].id;
      } else {
        const newConvo = await addDoc(convosRef, {
          participants: [user.uid, adminId],
          participantNames: {
            [user.uid]: user.displayName || 'Användare',
            [adminId]: adminData.name || 'AutoLog Support'
          },
          buyerId: user.uid,
          sellerId: adminId,
          carId: 'SUPPORT',
          carTitle: 'SUPPORT & KONTAKT',
          carImageUrl: 'https://picsum.photos/seed/support/200/200',
          lastMessage: '',
          lastMessageAt: serverTimestamp(),
          unreadBy: [adminId],
          hiddenFrom: [],
          updatedAt: serverTimestamp()
        });
        convoId = newConvo.id;
      }

      const messagesRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations', convoId, 'messages');
      await addDoc(messagesRef, {
        senderId: user.uid,
        text: supportMessage,
        createdAt: serverTimestamp(),
        read: false
      });

      // Uppdatera samtalsstatus
      updateDocumentNonBlocking(doc(db, 'artifacts', appId, 'public', 'data', 'conversations', convoId), {
        lastMessage: supportMessage,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
        unreadBy: arrayUnion(adminId),
        hiddenFrom: [], 
        updatedAt: serverTimestamp()
      });

      toast({ title: "Meddelande skickat!", description: "Vi svarar så snart vi kan." });
      setSupportMessage('');
      router.push(`/inbox/${convoId}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Kunde inte skicka", description: err.message });
    } finally {
      setIsSendingSupport(false);
    }
  };

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
      const vehiclesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vehicles');
      const vehiclesSnap = await getDocs(vehiclesRef);
      
      vehiclesSnap.forEach(vDoc => {
        const plate = vDoc.id;
        const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
        batch.set(globalRef, {
          ownerId: null,
          ownerName: null,
          ownerEmail: null,
          isPublished: false,
          updatedAt: serverTimestamp()
        }, { merge: true });
        batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      });

      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid));
      batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'profiles', 'user-profile'));
      
      await batch.commit();
      await deleteUser(auth.currentUser);
      window.location.href = '/';
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel vid radering", description: "Logga ut och in igen innan du raderar kontot." });
      setIsDeleting(false);
    }
  };

  if (isUserLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  if (!user) return null;

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 space-y-8 pb-32">
      <header className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-white/5 rounded-full"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-3xl font-headline font-bold">Inställningar</h1>
      </header>
      
      <div className="grid gap-6">
        <Card className="glass-card border-white/5 rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> Säkerhet
            </CardTitle>
            <CardDescription>Uppdatera ditt lösenord.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nytt lösenord</Label>
                <Input 
                  id="new-password"
                  type="password" 
                  placeholder="Minst 6 tecken" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-white/5 h-12 rounded-xl"
                />
              </div>
              <Button type="submit" disabled={isUpdatingPassword || newPassword.length < 6} className="w-full h-12 rounded-xl font-bold">
                {isUpdatingPassword ? <Loader2 className="animate-spin" /> : "Spara nytt lösenord"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/5 rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-accent" /> Support & Kontakt
            </CardTitle>
            <CardDescription>Behöver du hjälp? Skriv till oss här.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleContactAdmin} className="space-y-4">
              <div className="space-y-2">
                <Label>Ditt meddelande</Label>
                <Textarea 
                  placeholder="Beskriv ditt ärende..." 
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  className="bg-white/5 rounded-xl min-h-[120px]"
                />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-white/5 p-3 rounded-lg border border-white/5">
                <Mail className="w-3 h-3" /> Kontaktar: apersson508@gmail.com
              </div>
              <Button type="submit" variant="outline" disabled={isSendingSupport || !supportMessage.trim()} className="w-full h-12 rounded-xl font-bold border-accent/20 text-accent hover:bg-accent/10">
                {isSendingSupport ? <Loader2 className="animate-spin" /> : "Skicka till Support"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20 border-dashed rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Farlig zon</CardTitle>
            <CardDescription>Radera ditt konto permanent.</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full h-14 rounded-2xl font-bold">Radera konto permanent</Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="glass-card border-white/10 rounded-[2rem]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Är du helt säker?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ditt konto försvinner permanent. Skriv RADERA för att bekräfta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4 space-y-2">
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
