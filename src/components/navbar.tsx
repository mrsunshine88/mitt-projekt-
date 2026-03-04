"use client";

import Link from 'next/link';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Car, Search, LogOut, Inbox, Wrench, Settings, UserCircle, ShieldAlert, Menu, X } from 'lucide-react';
import { getAuth, signOut } from 'firebase/auth';
import { collection, query, where, doc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState } from 'react';

export function Navbar() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [isOpen, setIsOpen] = useState(false);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile } = useDoc(userProfileRef);
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
    setIsOpen(false);
  };

  const NavLinks = () => (
    <>
      <Link href="/browse" onClick={() => setIsOpen(false)} className="flex items-center gap-3 py-3 md:py-0 text-lg md:text-sm font-medium hover:text-primary transition-colors">
        <Search className="w-5 h-5 md:w-4 md:h-4 text-primary/60" /> Marknadsplats
      </Link>
      
      {profile?.userType === 'Workshop' ? (
        <Link href="/workshop" onClick={() => setIsOpen(false)} className="flex items-center gap-3 py-3 md:py-0 text-lg md:text-sm font-medium hover:text-primary transition-colors">
          <Wrench className="w-5 h-5 md:w-4 md:h-4 text-primary/60" /> Verkstad
        </Link>
      ) : (
        <Link href="/dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-3 py-3 md:py-0 text-lg md:text-sm font-medium hover:text-primary transition-colors">
          <Car className="w-5 h-5 md:w-4 md:h-4 text-primary/60" /> Mina fordon
        </Link>
      )}

      {user && (
        <>
          <Link href="/inbox" onClick={() => setIsOpen(false)} className="flex items-center gap-3 py-3 md:py-0 text-lg md:text-sm font-medium hover:text-primary transition-colors relative">
            <Inbox className="w-5 h-5 md:w-4 md:h-4 text-primary/60" /> Inkorg
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-3 h-5 w-5 flex items-center justify-center p-0 bg-red-500 border-none text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </Link>
          <Link href="/profile" onClick={() => setIsOpen(false)} className="flex items-center gap-3 py-3 md:py-0 text-lg md:text-sm font-medium hover:text-primary transition-colors">
            <UserCircle className="w-5 h-5 md:w-4 md:h-4 text-primary/60" /> Min profil
          </Link>
          {isAdmin && (
            <Link href="/admin" onClick={() => setIsOpen(false)} className="flex items-center gap-3 py-3 md:py-0 text-lg md:text-sm font-bold text-accent hover:text-accent/80 transition-colors">
              <ShieldAlert className="w-5 h-5 md:w-4 md:h-4" /> Admin
            </Link>
          )}
        </>
      )}
    </>
  );

  return (
    <nav className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50 px-4 md:px-0">
      <div className="container max-w-6xl mx-auto h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-headline font-bold text-xl gradient-text">
            AutoLog
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <NavLinks />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Nav Trigger */}
          <div className="md:hidden flex items-center gap-2">
             {unreadCount > 0 && (
               <Link href="/inbox" className="p-2 relative">
                 <Inbox className="w-6 h-6 text-muted-foreground" />
                 <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-background" />
               </Link>
             )}
             <Sheet open={isOpen} onOpenChange={setIsOpen}>
               <SheetTrigger asChild>
                 <Button variant="ghost" size="icon" className="h-10 w-10">
                   <Menu className="w-6 h-6" />
                 </Button>
               </SheetTrigger>
               <SheetContent side="right" className="bg-background border-white/10 w-[80%] max-w-[300px]">
                 <SheetHeader className="text-left mb-8">
                   <SheetTitle className="gradient-text font-headline text-2xl">Meny</SheetTitle>
                 </SheetHeader>
                 <div className="flex flex-col gap-2">
                   <NavLinks />
                   <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                     {user ? (
                       <>
                        <Link href="/settings" onClick={() => setIsOpen(false)} className="flex items-center gap-3 py-3 text-lg font-medium text-muted-foreground">
                          <Settings className="w-5 h-5" /> Inställningar
                        </Link>
                        <Button variant="destructive" onClick={handleLogout} className="w-full justify-start h-12 rounded-xl text-lg">
                          <LogOut className="w-5 h-5 mr-3" /> Logga ut
                        </Button>
                       </>
                     ) : (
                       <Button asChild className="w-full h-12 rounded-xl" onClick={() => setIsOpen(false)}>
                         <Link href="/login">Logga in</Link>
                       </Button>
                     )}
                   </div>
                 </div>
               </SheetContent>
             </Sheet>
          </div>

          {/* Desktop Right Nav */}
          <div className="hidden md:flex items-center gap-3">
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
      </div>
    </nav>
  );
}