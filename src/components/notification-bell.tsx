"use client";

import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { firebaseConfig } from '@/firebase/config';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';

export function NotificationBell() {
  const { user } = useUser();
  const db = useFirestore();
  const appId = firebaseConfig.projectId;
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!db || !user?.uid) return;
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'user_notifications'),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      notifs.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setNotifications(notifs);
    });
    return () => unsub();
  }, [db, user?.uid, appId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAsRead = async (notifId: string) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'user_notifications', notifId), {
      read: true
    });
  };

  if (!user) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-slate-300 hover:text-white hover:bg-white/10 shrink-0">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 hover:bg-red-500 border-none justify-center p-0 text-[10px] flex items-center font-bold shadow-lg shadow-red-500/50">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-2xl border-white/10 glass-card shadow-2xl z-50 overflow-hidden" align="end" sideOffset={8}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <h3 className="font-bold text-sm text-white">Notiser</h3>
          <span className="text-xs font-bold text-muted-foreground">{unreadCount} olästa</span>
        </div>
        <div className="max-h-[350px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Bell className="w-8 h-8 opacity-20" />
              <p className="text-sm font-bold opacity-60">Inga nya notiser</p>
            </div>
          ) : (
            notifications.map((n) => (
              <Link 
                key={n.id} 
                href={n.link} 
                onClick={() => handleMarkAsRead(n.id)}
                className={`p-4 border-b border-white/5 flex flex-col gap-1 transition-colors hover:bg-white/5 ${!n.read ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <p className={`text-xs leading-relaxed ${!n.read ? 'font-bold text-white' : 'text-slate-300'}`}>
                    {n.message}
                  </p>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1 shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)]" />}
                </div>
                {n.createdAt && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true, locale: sv })}
                  </span>
                )}
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
