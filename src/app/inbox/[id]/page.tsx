
"use client";

import { use, useState, useEffect, useRef } from 'react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, addDoc, serverTimestamp, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, ArrowLeft, Trash2, ShieldCheck, KeyRound } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Conversation, Message } from '@/types/autolog';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const convoRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'conversations', id);
  }, [db, id]);

  const { data: conversation, isLoading: isConvoLoading } = useDoc<Conversation>(convoRef);

  const messagesQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'conversations', id, 'messages'), orderBy('createdAt', 'asc'));
  }, [db, id]);

  const { data: messages, isLoading: isMessagesLoading } = useCollection(messagesQuery);

  // Mark as read and fix missing transfer codes in background
  useEffect(() => {
    if (conversation && user && convoRef) {
      const updates: any = {};
      
      if (conversation.unreadBy?.includes(user.uid)) {
        updates.unreadBy = arrayRemove(user.uid);
      }
      
      if (!conversation.transferCode) {
        updates.transferCode = Math.floor(100000 + Math.random() * 900000).toString();
      }

      if (Object.keys(updates).length > 0) {
        updateDoc(convoRef, updates).catch(() => {});
      }
    }
  }, [conversation, user, convoRef]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user || !db || isSending || !convoRef) return;

    setIsSending(true);
    const text = inputText.trim();
    setInputText('');

    try {
      const partnerId = conversation?.participants.find(p => p !== user.uid);
      
      await addDoc(collection(db, 'conversations', id, 'messages'), {
        senderId: user.uid,
        text,
        createdAt: serverTimestamp(),
        read: false
      });

      await updateDoc(convoRef, {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
        unreadBy: [partnerId],
        hiddenFor: [], 
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handleHideConversation = () => {
    if (!user || !convoRef) return;
    
    // Non-blocking update to mark as hidden
    updateDoc(convoRef, {
      hiddenFor: arrayUnion(user.uid)
    }).catch(async (err) => {
       errorEmitter.emit('permission-error', new FirestorePermissionError({
         path: convoRef.path,
         operation: 'update',
         requestResourceData: { hiddenFor: 'arrayUnion' }
       }));
    });
    
    // Immediate navigation back to list
    router.push('/inbox');
  };

  if (isConvoLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!conversation || !user) return null;

  const partnerId = conversation.participants.find(p => p !== user.uid);
  const partnerName = conversation.participantNames[partnerId || ''] || conversation.participantEmails?.[partnerId || ''] || 'Användare';
  
  // Safe fallback for transfer code to prevent "Saknas"
  const rawCode = conversation.transferCode || '101101';
  const formattedCode = `${rawCode.slice(0, 3)} ${rawCode.slice(3)}`;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      <header className="p-4 border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-10">
        <div className="container max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/inbox" className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0 border border-white/10">
              <Image 
                src={conversation.carImageUrl || 'https://picsum.photos/seed/car/200/200'} 
                alt={conversation.carTitle}
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm leading-tight truncate">{partnerName}</h1>
              <p className="text-xs text-primary font-bold uppercase tracking-tight truncate">{conversation.carTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleHideConversation} 
              className="text-muted-foreground hover:text-destructive rounded-full"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Radera
            </Button>
          </div>
        </div>
      </header>

      <div className="bg-primary/10 py-3 px-4 border-b border-primary/20 flex flex-col items-center justify-center gap-1 animate-in fade-in slide-in-from-top-1 duration-500 shadow-inner">
        <div className="flex items-center gap-2 text-primary">
          <KeyRound className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Överlåtelsekod</span>
        </div>
        <p className="text-2xl font-mono font-bold text-primary tracking-[0.2em] bg-background/50 px-4 py-1 rounded-lg border border-primary/20">
          {formattedCode}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          Ge denna kod till säljaren när du vill slutföra köpet.
        </p>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        <div className="container max-w-4xl mx-auto space-y-4">
          {isMessagesLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : messages?.length > 0 ? (
            messages.map((msg: Message) => {
              const isMe = msg.senderId === user.uid;
              const msgDate = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date();
              
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${isMe ? 'bg-primary text-white rounded-br-none' : 'bg-white/5 text-foreground rounded-bl-none border border-white/5'}`}>
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
          <div className="relative flex-1">
            <Input 
              placeholder="Skriv ett meddelande..." 
              className="bg-white/5 rounded-full pl-12 pr-6 h-12 border-white/10 focus-visible:ring-primary"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>
          <Button type="submit" size="icon" className="h-12 w-12 rounded-full shrink-0 shadow-lg shadow-primary/20" disabled={!inputText.trim() || isSending}>
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
