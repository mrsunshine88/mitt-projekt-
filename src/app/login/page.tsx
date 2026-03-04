"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useFirestore, useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userType, setUserType] = useState('CarOwner');
  const [orgNumber, setOrgNumber] = useState('');
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  
  const router = useRouter();
  const db = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();

  const handleAuth = async (type: 'login' | 'signup') => {
    if (!auth || !db) return;
    setLoading(true);
    try {
      if (type === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: name });

        const batch = writeBatch(db);
        
        // Private Profile
        const userRef = doc(db, 'users', user.uid);
        batch.set(userRef, {
          id: user.uid,
          email,
          name,
          phoneNumber: phoneNumber || null,
          userType,
          organizationNumber: userType === 'Workshop' ? orgNumber : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Public "Look-up" Profile
        const publicProfileRef = doc(db, 'public_profiles', user.uid);
        batch.set(publicProfileRef, {
          id: user.uid,
          name,
          userType,
          createdAt: serverTimestamp(),
        });

        if (userType === 'Workshop') {
          const workshopRef = doc(db, 'workshops', user.uid);
          batch.set(workshopRef, {
            id: user.uid,
          });
        }

        await batch.commit();
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      toast({
        title: type === 'signup' ? "Konto skapat!" : "Välkommen tillbaka!",
        description: "Du skickas nu vidare till din dashboard.",
      });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ett fel uppstod",
        description: error.message || "Kunde inte genomföra åtgärden.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    if (!resetEmail) {
      toast({
        variant: "destructive",
        title: "E-post saknas",
        description: "Vänligen fyll i din e-postadress.",
      });
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      toast({
        title: "Begäran skickad",
        description: `Om en användare finns med e-post ${resetEmail} har en länk skickats. Kontrollera även skräpposten!`,
      });
      setIsResetDialogOpen(false);
      setResetEmail('');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Kunde inte skicka mejl",
        description: error.message || "Ett fel uppstod vid begäran om lösenordsåterställning.",
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="container max-w-md mx-auto py-20 px-4">
      <Tabs defaultValue="login" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="login">Logga in</TabsTrigger>
          <TabsTrigger value="signup">Registrera dig</TabsTrigger>
        </TabsList>
        
        <TabsContent value="login">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Logga in</CardTitle>
              <CardDescription>Välkommen tillbaka till din digitala servicebok.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@exempel.se" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Lösenord</Label>
                  <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="link" className="px-0 font-normal text-xs text-primary hover:text-primary/80">
                        Glömt lösenord?
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="glass-card sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Återställ lösenord</DialogTitle>
                        <DialogDescription>
                          Ange din e-postadress så skickar vi en länk för att återställa ditt lösenord. Kom ihåg att kontrollera skräpposten!
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleForgotPassword} className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">E-postadress</Label>
                          <Input 
                            id="reset-email" 
                            type="email" 
                            placeholder="namn@exempel.se"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            required
                          />
                        </div>
                        <DialogFooter>
                          <Button type="submit" className="w-full rounded-full" disabled={resetLoading}>
                            {resetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                            Skicka återställningslänk
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => handleAuth('login')} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Logga in
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="signup">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Skapa konto</CardTitle>
              <CardDescription>Välj din roll och börja digitalisera din historik.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Jag är...</Label>
                <RadioGroup defaultValue="CarOwner" onValueChange={setUserType} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="CarOwner" id="owner" />
                    <Label htmlFor="owner">Bilägare</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Workshop" id="workshop" />
                    <Label htmlFor="workshop">Verkstad</Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signup-name">{userType === 'Workshop' ? 'Verkstadens namn' : 'Ditt namn'}</Label>
                <Input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fullständigt namn" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-phone">Telefonnummer</Label>
                <Input id="signup-phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="070-123 45 67" />
              </div>

              {userType === 'Workshop' && (
                <div className="space-y-2">
                  <Label htmlFor="org-number">Organisationsnummer</Label>
                  <Input id="org-number" value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} placeholder="55XXXX-XXXX" />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="signup-email">E-post</Label>
                <Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@exempel.se" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signup-password">Lösenord</Label>
                <Input id="signup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => handleAuth('signup')} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Skapa konto
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}