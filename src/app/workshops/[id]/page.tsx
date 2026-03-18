"use client";

import { use, useState } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { UserProfile } from '@/types/autolog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Phone, Mail, MapPin, Globe, Clock, UserCircle, Wrench, MessageCircle, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

const OPENING_HOURS_DAYS = [
  { key: 'monday', label: 'Måndag' },
  { key: 'tuesday', label: 'Tisdag' },
  { key: 'wednesday', label: 'Onsdag' },
  { key: 'thursday', label: 'Torsdag' },
  { key: 'friday', label: 'Fredag' },
  { key: 'saturday', label: 'Lördag' },
  { key: 'sunday', label: 'Söndag' },
];

export default function WorkshopProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const workshopRef = useMemoFirebase(() => {
    if (!db || !id) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', id);
  }, [db, id, appId]);

  const { data: workshop, isLoading } = useDoc<UserProfile>(workshopRef);
  
  const currentUserRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: currentUserProfile } = useDoc<UserProfile>(currentUserRef);

  const handleContactWorkshop = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!db || !workshop) return;

    setIsCreatingChat(true);
    try {
      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      const q = query(
        convosRef,
        where('type', '==', 'WORKSHOP_INQUIRY'),
        where('buyerId', '==', user.uid),
        where('sellerId', '==', workshop.id)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        router.push(`/inbox/${snap.docs[0].id}`);
        return;
      }

      const newConvo = await addDoc(convosRef, {
        participants: [user.uid, workshop.id],
        buyerId: user.uid,
        sellerId: workshop.id,
        type: 'WORKSHOP_INQUIRY',
        participantNames: {
          [user.uid]: currentUserProfile?.name || user.displayName || 'Kund',
          [workshop.id]: workshop.name || 'Verkstad'
        },
        carId: '',
        carTitle: 'Förfrågan om Service',
        carImageUrl: workshop.photoUrl || 'https://picsum.photos/seed/car/200/200',
        lastMessage: '',
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: '',
        unreadBy: [],
        hiddenFrom: [],
        updatedAt: serverTimestamp(),
      });

      router.push(`/inbox/${newConvo.id}`);
    } catch (e: any) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Något gick fel', description: 'Kunde inte starta chatten.' });
    } finally {
      setIsCreatingChat(false);
    }
  };

  if (isLoading) return <div className="flex justify-center min-h-[60vh] items-center"><Loader2 className="w-12 h-12 animate-spin text-primary opacity-40" /></div>;
  if (!workshop || workshop.userType !== 'Workshop') {
    return (
      <div className="container max-w-4xl mx-auto py-20 text-center space-y-6 text-white">
        <h1 className="text-4xl font-headline font-bold">Verkstaden hittades inte</h1>
        <p className="text-muted-foreground">Kontrollera länken eller sök via katalogen.</p>
        <Button onClick={() => router.back()}>Tillbaka</Button>
      </div>
    );
  }

  const isOwner = user?.uid === workshop.id;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 pb-32 text-white">
      <button onClick={() => router.back()} className="inline-flex items-center text-xs font-bold text-muted-foreground hover:text-white uppercase tracking-widest transition-colors mb-8">
        <ArrowLeft className="w-4 h-4 mr-2" /> TILLBAKA TILL FÖREGÅENDE SIDA
      </button>

      <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-12">
        <div className="w-32 h-32 rounded-[2rem] bg-primary/10 border-4 border-white/5 flex items-center justify-center text-primary shadow-2xl overflow-hidden shrink-0">
          {workshop.photoUrl ? (
            <img src={workshop.photoUrl} alt="Profil" className="w-full h-full object-cover" />
          ) : (
            <UserCircle className="w-20 h-20" />
          )}
        </div>
        <div>
          <h1 className="text-4xl md:text-5xl font-headline font-bold mb-3">{workshop.name}</h1>
          <Badge className="bg-blue-500 text-white border-none px-4 py-1 text-[10px] font-black uppercase rounded-full shadow-lg">
            <Wrench className="w-3 h-3 mr-1.5" /> Verifierad Verkstad
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Vänster kolumn: Kontakt och Plats */}
        <div className="space-y-6">
          <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
            <CardContent className="p-8 space-y-8">
              <div>
                <h3 className="text-lg font-bold font-headline mb-4 opacity-80 flex items-center tracking-widest uppercase text-[10px]"><Phone className="w-4 h-4 mr-2" /> Kontaktuppgifter</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Telefon</p>
                      <p className="font-medium text-lg">{workshop.phoneNumber || 'Ej angivet'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">E-post</p>
                      <p className="font-medium text-lg">{workshop.email}</p>
                    </div>
                  </div>
                  {workshop.website && (
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Webbplats</p>
                        <a href={workshop.website.startsWith('http') ? workshop.website : `https://${workshop.website}`} target="_blank" className="font-medium text-lg text-primary hover:underline block">
                          {workshop.website}
                        </a>
                      </div>
                    </div>
                  )}
                  {workshop.organizationNumber && (
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Org. nummer</p>
                        <p className="font-medium text-lg">{workshop.organizationNumber}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden">
            <CardContent className="p-8">
              <h3 className="text-lg font-bold font-headline mb-4 opacity-80 flex items-center tracking-widest uppercase text-[10px]"><MapPin className="w-4 h-4 mr-2" /> Adress</h3>
              <p className="text-xl font-medium leading-relaxed">
                {workshop.address ? (
                  <>
                    {workshop.address} <br/>
                    {workshop.postalCode} {workshop.city}
                  </>
                ) : 'Ej angivet'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Höger kolumn: Öppettider och Action */}
        <div className="space-y-6">
          <Card className="glass-card border-none shadow-xl rounded-3xl overflow-hidden h-fit">
            <CardContent className="p-8">
              <h3 className="text-lg font-bold font-headline mb-6 opacity-80 flex items-center tracking-widest uppercase text-[10px]"><Clock className="w-4 h-4 mr-2" /> Öppettider</h3>
              
              {typeof workshop.openingHours === 'object' ? (
                <div className="space-y-3">
                  {OPENING_HOURS_DAYS.map(day => {
                    const value = (workshop.openingHours as any)[day.key] || 'Stängt';
                    const isClosed = value.toLowerCase() === 'stängt' || value === '';
                    
                    return (
                      <div key={day.key} className={`flex justify-between items-center py-2 ${!isClosed ? 'border-b border-white/5' : 'opacity-40'}`}>
                        <span className="font-medium">{day.label}</span>
                        <span className={`font-bold ${isClosed ? 'text-rose-400' : 'text-slate-200'}`}>{value}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-lg font-medium whitespace-pre-line">{workshop.openingHours || "Ej angivet"}</p>
              )}
            </CardContent>
          </Card>

          {isOwner ? (
            <Button disabled className="w-full h-16 rounded-[1.5rem] font-bold text-lg bg-white/5 text-slate-400">
              Det här är din egen profil
            </Button>
          ) : (
            <Button 
              className="w-full h-20 rounded-[1.5rem] font-black text-xl shadow-xl shadow-primary/20" 
              onClick={handleContactWorkshop}
              disabled={isCreatingChat}
            >
              {isCreatingChat ? <Loader2 className="w-6 h-6 animate-spin" /> : <MessageCircle className="mr-3 w-6 h-6" />} 
              Skicka meddelande
            </Button>
          )}
        </div>
      </div>
      
      {workshop.description && (
        <Card className="glass-card border-none shadow-xl rounded-3xl mt-6 p-8">
          <h3 className="text-lg font-bold font-headline mb-4 opacity-80 flex items-center tracking-widest uppercase text-[10px]">Om oss</h3>
          <p className="text-lg text-slate-300 leading-relaxed whitespace-pre-wrap">
            {workshop.description}
          </p>
        </Card>
      )}
    </div>
  );
}
