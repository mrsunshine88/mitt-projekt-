
"use client";

import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MessageSquare, Wrench } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Conversation, UserProfile } from '@/types/autolog';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * Component to display the partner's avatar and name dynamically from their profile.
 * Follows the design standard: Circular for users, Square for workshops.
 */
function PartnerInfo({ userId, fallbackName, showName = true }: { userId: string, fallbackName: string, showName?: boolean }) {
  const db = useFirestore();
  const appId = firebaseConfig.projectId;
  const profileRef = useMemoFirebase(() => {
    if (!db || !userId) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', userId);
  }, [db, userId, appId]);
  
  const { data: profile } = useDoc<UserProfile>(profileRef);
  const isWorkshop = profile?.userType === 'Workshop';
  
  if (!showName) {
    return (
      <div className="relative shrink-0">
        <Avatar className={`h-10 w-10 ${isWorkshop ? 'rounded-lg' : 'rounded-full'} border border-white/10 shadow-sm`}>
          <AvatarImage src={profile?.photoUrl} className="object-cover" />
          <AvatarFallback className={`${isWorkshop ? 'rounded-lg' : 'rounded-full'} bg-primary/10 text-primary text-[10px] font-bold`}>
            {profile?.name?.[0] || fallbackName?.[0] || 'U'}
          </AvatarFallback>
        </Avatar>
        {isWorkshop && (
          <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-sm p-0.5 border border-background">
            <Wrench className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative shrink-0">
        <Avatar className={`h-8 w-8 ${isWorkshop ? 'rounded-lg' : 'rounded-full'} border border-white/10 shadow-sm`}>
          <AvatarImage src={profile?.photoUrl} className="object-cover" />
          <AvatarFallback className={`${isWorkshop ? 'rounded-lg' : 'rounded-full'} bg-primary/10 text-primary text-[8px] font-bold`}>
            {profile?.name?.[0] || fallbackName?.[0] || 'U'}
          </AvatarFallback>
        </Avatar>
        {isWorkshop && (
          <div className="absolute -bottom-0.5 -right-0.5 bg-blue-600 rounded-sm p-0.5 border border-background">
            <Wrench className="w-2 h-2 text-white" />
          </div>
        )}
      </div>
      <span className="truncate">{profile?.name || fallbackName}</span>
    </div>
  );
}

export default function InboxPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const appId = firebaseConfig.projectId;

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/');
    }
  }, [user, isUserLoading, router]);

  const convosQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
  }, [db, user, appId]);

  const { data: rawConversations, isLoading } = useCollection<Conversation>(convosQuery);

  const myConversations = useMemo(() => {
    if (!rawConversations || !user) return [];
    
    return rawConversations
      .filter(c => !c.hiddenFrom?.includes(user.uid))
      .sort((a, b) => {
        const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
        const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
  }, [rawConversations, user]);

  if (isUserLoading || (user && isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-bold">Inkorg</h1>
        <p className="text-muted-foreground">Hantera dina samtal kring annonser och service.</p>
      </header>

      {myConversations.length > 0 ? (
        <div className="space-y-3">
          {myConversations.map((convo: Conversation) => {
            const partnerId = convo.participants.find(p => p !== user.uid);
            const fallbackPartnerName = convo.participantNames[partnerId || ''] || 'Användare';
            const isUnread = convo.unreadBy?.includes(user.uid);
            const lastDate = convo.updatedAt?.toDate ? convo.updatedAt.toDate() : new Date();

            return (
              <Link key={convo.id} href={`/inbox/${convo.id}`}>
                <Card className={`glass-card border-none hover:bg-white/5 transition-all group ${isUnread ? 'ring-1 ring-primary/50 bg-primary/5 shadow-lg shadow-primary/5' : ''}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-white/5 shrink-0 border border-white/5">
                      <Image 
                        src={convo.carImageUrl || 'https://picsum.photos/seed/car/200/200'} 
                        alt={convo.carTitle}
                        fill
                        className="object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      {isUnread && (
                        <div className="absolute top-1 right-1 h-3.5 w-3.5 bg-primary rounded-full ring-2 ring-background animate-pulse" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className={`font-bold flex items-center gap-2 truncate ${isUnread ? 'text-primary' : ''}`}>
                          <PartnerInfo userId={partnerId || ''} fallbackName={fallbackPartnerName} />
                        </h3>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2 uppercase font-bold tracking-widest">
                          {formatDistanceToNow(lastDate, { addSuffix: true, locale: sv })}
                        </span>
                      </div>
                      <p className="text-[10px] text-primary font-black uppercase mb-1 truncate tracking-wider opacity-80">{convo.carTitle}</p>
                      <p className={`text-sm truncate ${isUnread ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                        {convo.lastMessageSenderId === user.uid ? 'Du: ' : ''}{convo.lastMessage || 'Inga meddelanden än.'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 glass-card rounded-3xl border-dashed border-2 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground opacity-20">
            <MessageSquare className="w-8 h-8" />
          </div>
          <p className="text-muted-foreground italic">Din inkorg är tom.</p>
        </div>
      )}
    </div>
  );
}
