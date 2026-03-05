
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
import { useFirestore, useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, KeyRound, Building2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { firebaseConfig } from '@/firebase/config';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [userType, setUserType] = useState('CarOwner');
  const [orgNumber, setOrgNumber] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  
  const router = useRouter();
  const db = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  // Validering: Svenska org-nummer är 10 siffror (ex 123456-7890)
  const isOrgNumberValid = orgNumber.trim().replace(/[^0-9]/g, '').length === 10;

  const handleAuth = async (type: 'login' | 'signup') => {
    if (!auth || !db) return;
    
    if (type === 'signup' && userType === 'Workshop' && !isOrgNumberValid) {
      setAuthError("Ett fullständigt organisationsnummer (10 siffror) krävs.");
      return;
    }

    setLoading(true);
    setAuthError(null);
    try {
      if (type === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });

        const batch = writeBatch(db);
        const userRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profiles', 'user-profile');
        const publicProfileRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
        
        const profileData = {
          id: user.uid,
          email,
          name,
          userType,
          organizationNumber: userType === 'Workshop' ? orgNumber : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        batch.set(userRef, profileData);
        batch.set(publicProfileRef, profileData);

        if (userType === 'Workshop') {
          const workshopRef = doc(db, 'artifacts', appId, 'public', 'data', 'workshops', user.uid);
          batch.set(workshopRef, { 
            id: user.uid, 
            name, 
            organizationNumber: orgNumber, 
            verified: true,
            createdAt: serverTimestamp()
          });
        }
        
        await batch.commit();
        
        if (userType === 'Workshop') {
          router.push('/workshop');
        } else {
          router.push('/dashboard');
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists() && profileSnap.data().userType === 'Workshop') {
          router.push('/workshop');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (error: any) {
      let msg = "Ett oväntat fel uppstod.";
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        msg = "Fel lösenord eller e-postadress. Försök igen.";
      } else if (error.code === 'auth/network-request-failed') {
        msg = "Nätverksfel, kontrollera din anslutning.";
      } else if (error.code === 'auth/email-already-in-use') {
        msg = "E-postadressen används redan.";
      }
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email || !auth) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Återställningslänk skickad!", description: "Kontrollera din inkorg." });
      setShowForgot(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: "Kunde inte skicka länk. Kontrollera e-postadressen." });
    } finally {
      setLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="container max-w-md mx-auto py-20 px-4">
        <Card className="glass-card border-none rounded-[2rem]">
          <CardHeader className="pt-8 px-8">
            <CardTitle className="text-2xl font-headline flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-primary" /> Återställ lösenord
            </CardTitle>
          </CardHeader>
          <CardContent className="px-8 space-y-4">
            <div className="space-y-2">
              <Label>Din e-postadress</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@exempel.se" className="bg-white/5 h-12 rounded-xl" />
            </div>
          </CardContent>
          <CardFooter className="px-8 pb-8 flex flex-col gap-3">
            <Button className="w-full h-14 rounded-full font-bold" onClick={handleResetPassword} disabled={loading || !email}>
              {loading ? <Loader2 className="animate-spin" /> : "Skicka återställningslänk"}
            </Button>
            <Button variant="ghost" onClick={() => setShowForgot(false)} className="w-full h-12 rounded-full">Avbryt</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-md mx-auto py-20 px-4">
      <Tabs defaultValue="login" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8 bg-white/5 p-1 rounded-xl">
          <TabsTrigger value="login" className="rounded-lg">Logga in</TabsTrigger>
          <TabsTrigger value="signup" className="rounded-lg">Registrera dig</TabsTrigger>
        </TabsList>
        
        <TabsContent value="login">
          <Card className="glass-card border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="pt-8 px-8"><CardTitle className="text-2xl font-headline">Välkommen</CardTitle></CardHeader>
            <CardContent className="space-y-4 px-8 pb-4">
              {authError && (
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 animate-in fade-in zoom-in">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Problem</AlertTitle>
                  <AlertDescription className="text-xs">{authError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-white/5 rounded-xl h-12" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Lösenord</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-white/5 rounded-xl h-12" />
              </div>
              <button onClick={() => setShowForgot(true)} className="text-xs text-primary hover:underline font-bold">Glömt lösenord?</button>
            </CardContent>
            <CardFooter className="px-8 pb-8">
              <Button className="w-full h-14 rounded-full font-bold text-lg shadow-xl shadow-primary/20" onClick={() => handleAuth('login')} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Logga in'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="signup">
          <Card className="glass-card border-none rounded-[2rem] overflow-hidden">
            <CardHeader className="pt-8 px-8"><CardTitle className="text-2xl font-headline">Skapa konto</CardTitle></CardHeader>
            <CardContent className="space-y-4 px-8 pb-4">
              {authError && (
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{authError}</AlertDescription>
                </Alert>
              )}
              <RadioGroup value={userType} onValueChange={setUserType} className="flex gap-4 mb-6">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="CarOwner" id="owner" />
                  <Label htmlFor="owner">Bilägare</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Workshop" id="workshop" />
                  <Label htmlFor="workshop">Verkstad</Label>
                </div>
              </RadioGroup>

              <div className="space-y-2">
                <Label>Namn / Företag</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white/5 rounded-xl h-12" placeholder="Ditt namn eller företagsnamn" />
              </div>

              {userType === 'Workshop' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label className="flex items-center gap-2">Organisationsnummer <span className="text-destructive">*</span></Label>
                  <Input 
                    value={orgNumber} 
                    onChange={(e) => setOrgNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} 
                    className={`bg-white/5 rounded-xl h-12 border-primary/20 ${orgNumber && !isOrgNumberValid ? 'border-destructive' : ''}`} 
                    placeholder="1234567890" 
                    required
                  />
                  <p className="text-[10px] text-muted-foreground italic px-1">
                    {isOrgNumberValid ? '✅ Giltigt format' : 'Krävs för att verifiera verkstadsbehörighet (10 siffror).'}
                  </p>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Label>E-post</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-white/5 rounded-xl h-12" placeholder="din@epost.se" />
              </div>
              <div className="space-y-2">
                <Label>Lösenord</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-white/5 rounded-xl h-12" placeholder="Minst 6 tecken" />
              </div>
            </CardContent>
            <CardFooter className="px-8 pb-8">
              <Button 
                className="w-full h-14 rounded-full font-bold text-lg shadow-xl shadow-primary/20" 
                onClick={() => handleAuth('signup')} 
                disabled={loading || (userType === 'Workshop' && !isOrgNumberValid)}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Skapa konto'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
