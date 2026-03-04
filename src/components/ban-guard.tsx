
"use client";

import { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BanGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [isBanned, setIsBanned] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // If auth is still loading, we keep checking
    if (isUserLoading) return;

    // If no user is logged in, they can't be banned
    if (!user || !db) {
      setIsBanned(false);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    const banRef = doc(db, 'bannedUsers', user.uid);
    
    // Listen for ban status in real-time
    const unsubscribe = onSnapshot(banRef, (docSnap) => {
      if (docSnap.exists()) {
        setIsBanned(true);
      } else {
        setIsBanned(false);
      }
      setIsChecking(false);
    }, (error) => {
      // If we can't check (e.g. permission error on the ban check itself), 
      // we assume not banned but stop the checking state
      console.warn("Ban check failed or denied:", error.message);
      setIsChecking(false);
    });

    return () => unsubscribe();
  }, [user, db, isUserLoading]);

  // Show a clean loader while determining auth and ban status
  // This prevents children (like Dashboard) from triggering Firestore calls 
  // that would be denied for banned users.
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
        <Card className="max-w-md w-full border-destructive/50 shadow-2xl shadow-destructive/10 animate-in fade-in zoom-in duration-300">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="w-10 h-10 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-headline text-destructive">Konto avstängt</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className="text-muted-foreground">
              Ditt konto har stängts av på grund av brott mot våra regler. Du har inte längre tillgång till annonser, chattar eller dina fordon.
            </p>
            <Button 
              variant="outline" 
              className="w-full rounded-full"
              onClick={() => {
                const auth = getAuth();
                signOut(auth).then(() => {
                  window.location.href = '/';
                });
              }}
            >
              <LogOut className="w-4 h-4 mr-2" /> Logga ut
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
