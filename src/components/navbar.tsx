
"use client";

import Link from 'next/link';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Car, Search, LogOut, Inbox, Wrench, Settings, UserCircle, ShieldAlert } from 'lucide-react';
import { getAuth, signOut } from 'firebase/auth';
import { collection, query, where, doc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';

export function Navbar() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  // Fetch user profile to check userType
  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile } = useDoc(userProfileRef);

  // Check admin status
  const isAdmin = user?.email === 'apersson508@gmail.com';

  const convosQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
  }, [db, user]);

  const { data: conversations } = useCollection(convosQuery);
  const unreadCount = conversations?.filter(c => c.unreadBy?.includes(user?.uid)).length || 0;

  const handleLogout = () => {
    const auth = getAuth();
    signOut(auth);
  };

  return (
    <nav className="border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-headline font-bold text-xl gradient-text">
            AutoLog
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link href="/browse" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
              <Search className="w-4 h-4" /> Marknadsplats
            </Link>
            
            {profile?.userType === 'Workshop' ? (
              <Link href="/workshop" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                <Wrench className="w-4 h-4" /> Verkstad
              </Link>
            ) : (
              <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                <Car className="w-4 h-4" /> Mina fordon
              </Link>
            )}

            {user && (
              <>
                <Link href="/inbox" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors relative">
                  <Inbox className="w-4 h-4" /> Inkorg
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-2 -right-4 h-5 w-5 flex items-center justify-center p-0 bg-red-500 border-none">
                      {unreadCount}
                    </Badge>
                  )}
                </Link>
                <Link href="/profile" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                  <UserCircle className="w-4 h-4" /> Min profil
                </Link>
                {isAdmin && (
                  <Link href="/admin" className="flex items-center gap-2 text-sm font-bold text-accent hover:text-accent/80 transition-colors">
                    <ShieldAlert className="w-4 h-4" /> Admin
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isUserLoading ? (
            <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/settings">
                  <Settings className="w-4 h-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button size="sm" asChild className="rounded-full px-6">
              <Link href="/login">Logga in</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
