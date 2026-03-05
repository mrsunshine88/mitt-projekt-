
"use client";

import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Conversation } from '@/types/autolog';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

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

  // VIKTIGT: Vi måste filtrera queryn för att matcha säkerhetsreglerna, 
  // annars nekas hela lyssnaren åtkomst.
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
      .filter(c => !c.hiddenFor?.includes(user.uid))
      .sort((a, b) => {
        const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
        const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
  }, [rawConversations, user]);

  if (isUserLoading || (user && isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-headline font-bold">Inkorg</h1>
        <p className="text-muted-foreground">Hanterade samtal kring dina annonser eller bilar du vill köpa.</p>
      </header>

      {myConversations.length > 0 ? (
        <div className="space-y-3">
          {myConversations.map((convo: Conversation) => {
            const partnerId = convo.participants.find(p => p !== user.uid);
            const partnerName = convo.participantNames[partnerId || ''] || 'Användare';
            const isUnread = convo.unreadBy?.includes(user.uid);
            const lastDate = convo.updatedAt?.toDate ? convo.updatedAt.toDate() : new Date();

            return (
              <Link key={convo.id} href={`/inbox/${convo.id}`}>
                <Card className={`glass-card border-none hover:bg-white/5 transition-all group ${isUnread ? 'ring-1 ring-primary/50 bg-primary/5' : ''}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-white/5 shrink-0">
                      <Image 
                        src={convo.carImageUrl || 'https://picsum.photos/seed/car/200/200'} 
                        alt={convo.carTitle}
                        fill
                        className="object-cover"
                      />
                      {isUnread && (
                        <div className="absolute top-1 right-1 h-3 w-3 bg-primary rounded-full ring-2 ring-background" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className={`font-bold flex items-center gap-2 truncate ${isUnread ? 'text-primary' : ''}`}>
                          {partnerName}
                        </h3>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {formatDistanceToNow(lastDate, { addSuffix: true, locale: sv })}
                        </span>
                      </div>
                      <p className="text-xs text-primary font-bold uppercase mb-1 truncate">{convo.carTitle}</p>
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
        <div className="text-center py-20 glass-card rounded-2xl border-dashed border-2 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground">
            <MessageSquare className="w-8 h-8" />
          </div>
          <p className="text-muted-foreground">Du har inga meddelanden ännu.</p>
        </div>
      )}
    </div>
  );
}
