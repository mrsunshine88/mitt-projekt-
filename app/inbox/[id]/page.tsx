
"use client";

import { use, useState, useEffect, useRef, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, serverTimestamp, arrayRemove, arrayUnion } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, ArrowLeft, Trash2, ShieldCheck, KeyRound, Lock, MessageSquare, Wrench } from 'lucide-react';
import Link from 'next/link';
import { Conversation, UserProfile } from '@/types/autolog';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { updateDocumentNonBlocking, addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

function ChatAvatar({ userId, userType, name }: { userId: string, userType?: string, name?: string }) {
  const db = useFirestore();
  const appId = firebaseConfig.projectId;
  const profileRef = useMemoFirebase(() => {
    if (!db || !userId) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', userId);
  }, [db, userId, appId]);
  
  const { data: profile } = useDoc<UserProfile>(profileRef);
  const isWorkshop = profile?.userType === 'Workshop' || userType === 'Workshop';

  return (
    <div className="relative shrink-0">
      <Avatar className={`h-8 w-8 ${isWorkshop ? 'rounded-lg' : 'rounded-full'} border border-white/10 shadow-sm`}>
        <AvatarImage src={profile?.photoUrl} className="object-cover" />
        <AvatarFallback className={`${isWorkshop ? 'rounded-lg' : 'rounded-full'} bg-primary/10 text-primary text-[10px] font-bold`}>
          {profile?.name?.[0] || name?.[0] || 'U'}
        </AvatarFallback>
      </Avatar>
      {isWorkshop && (
        <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-sm p-0.5 border border-background">
          <Wrench className="w-2 h-2 text-white" />
        </div>
      )}
    </div>
  );
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusUpdatedForId = useRef<string | null>(null);

  const appId = firebaseConfig.projectId;

  const convoRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'conversations', id);
  }, [db, id, appId]);

  const { data: conversation, isLoading: isConvoLoading } = useDoc<Conversation>(convoRef);

  const isSeller = conversation?.sellerId === user?.uid;
  const isSupportChat = conversation?.carId === 'SUPPORT';
  const isServiceChat = conversation?.type === 'SERVICE';
  const isSalesChat = !isSupportChat && !isServiceChat;

  const partnerId = conversation?.participants.find(p => p !== user?.uid);
  
  const partnerProfileRef = useMemoFirebase(() => {
    if (!db || !partnerId) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', partnerId);
  }, [db, partnerId, appId]);
  
  const { data: partnerProfile } = useDoc<UserProfile>(partnerProfileRef);

  const messagesRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'conversations', id, 'messages');
  }, [db, id, appId]);

  const { data: rawMessages, isLoading: isMessagesLoading } = useCollection<any>(messagesRef);

  const visibleMessages = useMemo(() => {
    if (!rawMessages || !user || !conversation) return [];
    
    const userDeletedAt = conversation.deletedAt?.[user.uid]?.toDate?.() || null;
    
    return rawMessages
      .filter((msg: any) => {
        if (!userDeletedAt) return true;
        const msgCreatedAt = msg.createdAt?.toDate?.() || new Date();
        return msgCreatedAt > userDeletedAt;
      })
      .sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeA - timeB;
      });
  }, [rawMessages, user, conversation]);

  useEffect(() => {
    if (conversation && user && convoRef && statusUpdatedForId.current !== id) {
      const isParticipant = conversation.participants.includes(user.uid);
      if (!isParticipant) return;

      const updates: any = {};
      let needsUpdate = false;

      if (conversation.unreadBy?.includes(user.uid)) {
        updates.unreadBy = arrayRemove(user.uid);
        needsUpdate = true;
      }
      
      if (isSeller && !conversation.transferCode && isSalesChat) {
        updates.transferCode = Math.floor(100000 + Math.random() * 900000).toString();
        needsUpdate = true;
      }

      if (needsUpdate) {
        statusUpdatedForId.current = id;
        updateDocumentNonBlocking(convoRef, {
          ...updates,
          updatedAt: serverTimestamp()
        });
      }
    }
  }, [conversation, user, convoRef, id, isSeller, isSalesChat]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user || !db || isSending || !convoRef) return;

    setIsSending(true);
    const text = inputText.trim();
    setInputText('');

    const targetPartnerId = conversation?.participants.find(p => p !== user.uid);
    const messagesColRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations', id, 'messages');
    
    addDocumentNonBlocking(messagesColRef, {
      senderId: user.uid,
      text,
      createdAt: serverTimestamp(),
      read: false
    });

    updateDocumentNonBlocking(convoRef, {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: user.uid,
      unreadBy: targetPartnerId ? arrayUnion(targetPartnerId) : [],
      hiddenFrom: [], 
      updatedAt: serverTimestamp()
    });

    setIsSending(false);
  };

  const handleHideConversation = () => {
    if (!user || !convoRef) return;
    
    const updates: any = {
      hiddenFrom: arrayUnion(user.uid),
      [`deletedAt.${user.uid}`]: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    updateDocumentNonBlocking(convoRef, updates);
    router.push('/inbox');
  };

  if (isConvoLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!conversation || !user) return null;

  const partnerName = partnerProfile?.name || conversation.participantNames[partnerId || ''] || 'Användare';
  const rawCode = conversation.transferCode || '------';
  const formattedCode = rawCode.length === 6 ? `${rawCode.slice(0, 3)} ${rawCode.slice(3)}` : rawCode;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      <header className="p-4 border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-10">
        <div className="container max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/inbox" className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <ChatAvatar userId={partnerId || ''} userType={isServiceChat ? 'Workshop' : 'CarOwner'} name={partnerName} />
            <div className="min-w-0">
              <h1 className="font-bold text-sm leading-tight truncate">{partnerName}</h1>
              <p className={`text-xs font-bold uppercase tracking-tight truncate ${isSupportChat ? 'text-accent' : isServiceChat ? 'text-blue-400' : 'text-primary'}`}>
                {conversation.carTitle}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleHideConversation} className="text-muted-foreground hover:text-destructive rounded-full">
            <Trash2 className="w-4 h-4 mr-2" /> Radera
          </Button>
        </div>
      </header>

      {isSalesChat && (
        <div className={`py-4 px-4 border-b flex flex-col items-center justify-center gap-1 transition-colors ${isSeller ? 'bg-primary/10 border-primary/20' : 'bg-white/5 border-white/5'}`}>
          {isSeller ? (
            <>
              <div className="flex items-center gap-2 text-primary">
                <KeyRound className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Din Överlåtelsekod</span>
              </div>
              <p className="text-2xl font-mono font-bold text-primary tracking-[0.2em] bg-background/50 px-4 py-1 rounded-lg border border-primary/20">
                {formattedCode}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 text-center font-medium">
                Ge denna kod till köparen när ni slutför affären.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-muted-foreground opacity-60">
                <Lock className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Väntar på bekräftelse</span>
              </div>
              <p className="text-sm text-center text-muted-foreground mt-1 max-w-[250px] italic">
                Vänta på att säljaren ger dig överlåtelsekoden när affären slutförs.
              </p>
            </>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="container max-w-4xl mx-auto space-y-6">
          {isMessagesLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : visibleMessages.length > 0 ? (
            visibleMessages.map((msg: any) => {
              const isMe = msg.senderId === user.uid;
              const msgDate = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date();
              return (
                <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <ChatAvatar userId={msg.senderId} name={isMe ? (user.displayName || 'Jag') : partnerName} />
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${isMe ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 text-foreground rounded-tl-none border border-white/5'}`}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    <p className={`text-[10px] mt-1 opacity-60 ${isMe ? 'text-right' : 'text-left'}`}>
                      {format(msgDate, 'HH:mm', { locale: sv })}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full opacity-20 pointer-events-none py-20">
              <ShieldCheck className="w-16 h-16 mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest">Inga meddelanden ännu</p>
            </div>
          )}
        </div>
      </div>

      <footer className="p-4 border-t border-white/5 bg-background">
        <form onSubmit={handleSendMessage} className="container max-w-4xl mx-auto flex gap-2">
          <Input 
            placeholder={isSupportChat ? "Skriv till supporten..." : isServiceChat ? "Skriv till ägaren..." : "Skriv ett meddelande..."}
            className="bg-white/5 rounded-full px-6 h-12 border-white/10"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <Button type="submit" size="icon" className="h-12 w-12 rounded-full shrink-0" disabled={!inputText.trim() || isSending}>
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
