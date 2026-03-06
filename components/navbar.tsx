
"use client";

import { useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import { Search, Car, Inbox, UserCircle, ShieldAlert, Settings, LogOut, Menu, Wrench, ShieldCheck } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { UserProfile, WorkshopNotification } from '@/types/autolog';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { firebaseConfig } from '@/firebase/config';
import Link from 'next/link';

const SYSTEM_OWNER_EMAIL = 'apersson508@gmail.com';

export function Navbar() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasPendingApprovals, setHasPendingApprovals] = useState(false);
  const [hasPendingTransfers, setHasPendingTransfers] = useState(false);
  const [unreadWorkshopNotifs, setUnreadWorkshopNotifs] = useState(0);
  const [pendingCorrectionsCount, setPendingCorrectionsCount] = useState(0);
  const appId = firebaseConfig.projectId;

  const profileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);

  const { data: profile } = useDoc<UserProfile>(profileRef);

  const isAdmin = useMemo(() => 
    user?.email === SYSTEM_OWNER_EMAIL || 
    profile?.role === 'Huvudadmin' || 
    profile?.role === 'Moderator', 
  [user, profile]);

  const isWorkshop = profile?.userType === 'Workshop';

  useEffect(() => {
    if (!db || !user) return;

    // 1. Lyssna efter väntande verkstadsstämplar (för ägare)
    const pendingQuery = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'pending_approvals'),
      where('ownerId', '==', user.uid)
    );
    const unsub1 = onSnapshot(pendingQuery, (snap) => setHasPendingApprovals(!snap.empty));

    // 2. Lyssna efter inkommande bilöverlåtelser (för köpare)
    const transferQuery = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'cars'),
      where('pendingTransferTo', '==', user.uid)
    );
    const unsub2 = onSnapshot(transferQuery, (snap) => setHasPendingTransfers(!snap.empty));

    // 3. Lyssna efter verkstadsnotiser (för verkstad)
    let unsub3 = () => {};
    if (isWorkshop) {
      const workshopNotifQuery = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications'),
        where('workshopId', '==', user.uid),
        where('read', '==', false)
      );
      unsub3 = onSnapshot(workshopNotifQuery, (snap) => {
        setUnreadWorkshopNotifs(snap.size);
      });
    }

    // 4. Lyssna efter miltalsansökningar (för admin)
    let unsub4 = () => {};
    if (isAdmin) {
      const correctionsQuery = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'odometer_corrections'),
        where('status', '==', 'pending')
      );
      unsub4 = onSnapshot(correctionsQuery, (snap) => {
        setPendingCorrectionsCount(snap.size);
      });
    }

    return () => { 
      unsub1(); 
      unsub2(); 
      unsub3(); 
      unsub4();
    };
  }, [db, user, appId, isWorkshop, isAdmin]);

  const convosQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
  }, [db, user, appId]);

  const { data: conversations } = useCollection(convosQuery);
  const unreadCount = conversations?.filter(c => c.unreadBy?.includes(user?.uid)).length || 0;

  const handleLogout = async () => {
    const auth = getAuth();
    await signOut(auth);
    window.location.href = '/';
  };

  const NavLinks = () => (
    <>
      {user && (
        <>
          <Link href="/browse" className="text-sm font-bold text-slate-300 hover:text-white flex items-center gap-2 py-3 md:py-0 transition-colors">
            <Search className="w-4 h-4" /> Marknadsplats
          </Link>
          
          {isWorkshop && (
            <Link href="/workshop" className="text-sm font-bold text-blue-400 hover:text-blue-300 flex items-center gap-2 py-3 md:py-0 transition-colors relative">
              <Wrench className="w-4 h-4" /> Verkstad
              {unreadWorkshopNotifs > 0 && (
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
              )}
            </Link>
          )}

          <Link href="/dashboard" className="text-sm font-bold text-slate-300 hover:text-white flex items-center gap-2 py-3 md:py-0 transition-colors relative">
            <Car className="w-4 h-4" /> Mina bilar
            {(hasPendingApprovals || hasPendingTransfers) && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
            )}
          </Link>

          <Link href="/inbox" className="text-sm font-bold text-slate-300 hover:text-white flex items-center gap-2 py-3 md:py-0 transition-colors relative">
            <Inbox className="w-4 h-4" /> Inkorg
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-3 h-4 w-4 flex items-center justify-center p-0 bg-red-500 border-none text-[9px]">
                {unreadCount}
              </Badge>
            )}
          </Link>
          
          <Link href="/profile" className="text-sm font-bold text-slate-300 hover:text-white flex items-center gap-2 py-3 md:py-0 transition-colors">
            <UserCircle className="w-4 h-4" /> Mina sidor
          </Link>

          <Link href="/carguard" className="text-sm font-bold text-primary hover:brightness-110 flex items-center gap-2 py-3 md:py-0 transition-colors">
            <ShieldCheck className="w-4 h-4" /> CarGuard
          </Link>
          
          {isAdmin && (
            <Link href="/admin" className="text-sm font-bold text-accent hover:brightness-110 flex items-center gap-2 py-3 md:py-0 relative transition-all">
              <ShieldAlert className="w-4 h-4" /> Admin
              {pendingCorrectionsCount > 0 && (
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse shadow-lg" />
              )}
            </Link>
          )}
        </>
      )}
    </>
  );

  return (
    <nav className="border-b border-white/5 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50 h-16">
      <div className="container max-w-6xl mx-auto h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-8 h-full">
          <Link href="/" className="font-headline font-bold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
            AutoLog
          </Link>
          <div className="hidden md:flex items-center gap-8 h-full">
            <NavLinks />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <Link href="/settings" className="p-2.5 hover:bg-white/5 rounded-full text-slate-400 transition-all active:scale-90">
                <Settings className="w-5 h-5" />
              </Link>
              <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full text-xs font-bold transition-all">
                <LogOut className="w-4 h-4" /> 
                <span className="hidden sm:inline">Logga ut</span>
              </button>
            </div>
          ) : (
            <Link href="/login" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-full text-xs font-bold text-white shadow-xl shadow-blue-600/20 transition-all">
              Logga in
            </Link>
          )}
          <div className="md:hidden ml-2">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <button className="p-2 text-slate-400 relative">
                  <Menu className="w-6 h-6" />
                  {(pendingCorrectionsCount > 0 && isAdmin) && (
                    <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-slate-900 border-white/10 text-white">
                <SheetHeader className="text-left mb-8">
                  <SheetTitle className="text-blue-400 font-headline">Meny</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2">
                  <NavLinks />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
