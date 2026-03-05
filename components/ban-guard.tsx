"use client";

import { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BanGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [isBanned, setIsBanned] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (isUserLoading || !user || !db) {
      if (!isUserLoading && !user) setIsChecking(false);
      return;
    }

    const checkBanStatus = async () => {
      setIsChecking(true);
      const appId = firebaseConfig.projectId;
      const banRef = doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', user.uid);
      
      try {
        // Vi använder getDoc istället för onSnapshot för att undvika ca9-krascher
        const docSnap = await getDoc(banRef);
        setIsBanned(docSnap.exists());
      } catch (e) {
        console.warn("Ban check failed (probably no ban):", e);
      } finally {
        setIsChecking(false);
      }
    };

    checkBanStatus();
  }, [user, db, isUserLoading]);

  if (isUserLoading || (user && isChecking)) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  if (isBanned) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-destructive/50 shadow-2xl shadow-destructive/10">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="w-10 h-10 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-headline text-destructive">Konto avstängt</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className="text-muted-foreground">
              Ditt konto har stängts av på grund av brott mot våra regler.
            </p>
            <Button variant="outline" className="w-full rounded-full" onClick={() => {
                const auth = getAuth();
                signOut(auth).then(() => { window.location.href = '/'; });
              }}>
              <LogOut className="w-4 h-4 mr-2" /> Logga ut
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
