
"use client";

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { collection, query, where, doc, writeBatch, getDocs, deleteDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';
import { WorkshopNotification, UserProfile } from '@/types/autolog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Clock, CheckCircle2, XCircle, ChevronRight, FileText, Calendar, Gauge, Banknote, Maximize2, History as HistoryIcon, Trash2, Wrench } from 'lucide-react';
import Link from 'next/link';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * Visar profilbild för den som triggat händelsen.
 * Följer designstandard: Cirkulär för ägare, Kvadratisk för verkstad.
 */
function EventAvatar({ userId, userType, name }: { userId: string, userType?: string, name?: string }) {
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
      <Avatar className={`h-12 w-12 ${isWorkshop ? 'rounded-xl' : 'rounded-full'} border border-white/10 shadow-lg bg-background`}>
        <AvatarImage src={profile?.photoUrl} className="object-cover" />
        <AvatarFallback className={`${isWorkshop ? 'rounded-xl' : 'rounded-full'} bg-primary/10 text-primary font-bold uppercase`}>
          {profile?.name?.[0] || name?.[0] || 'U'}
        </AvatarFallback>
      </Avatar>
      {isWorkshop && (
        <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-md p-0.5 border-2 border-background">
          <Wrench className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}

export default function WorkshopEventsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Hämta notiser (svar från ägare)
  const notifsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications'),
      where('workshopId', '==', user.uid)
    );
  }, [db, user, appId]);
  const { data: notifications, isLoading: isNotifsLoading } = useCollection<WorkshopNotification>(notifsQuery);

  // Hämta väntande godkännanden (förslag som ännu inte besvarats)
  const pendingQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'pending_approvals'),
      where('workshopId', '==', user.uid)
    );
  }, [db, user, appId]);
  const { data: pending, isLoading: isPendingLoading } = useCollection<any>(pendingQuery);

  const allEvents = useMemo(() => {
    const combined: any[] = [];
    
    if (pending) {
      pending.forEach(p => combined.push({
        id: p.id,
        status: 'pending',
        plate: p.plate,
        vehicleTitle: p.vehicleTitle || 'Okänt fordon',
        ownerName: 'Bilägare',
        ownerId: p.ownerId,
        createdAt: p.createdAt,
        logData: p.logData,
        isRead: true 
      }));
    }

    if (notifications) {
      notifications.forEach(n => combined.push({
        id: n.id,
        status: n.status,
        plate: n.plate,
        vehicleTitle: n.vehicleTitle,
        ownerName: n.ownerName,
        ownerId: n.ownerId,
        createdAt: n.createdAt,
        logData: n.logData,
        isRead: n.read,
        isResponse: true
      }));
    }

    return combined.sort((a, b) => {
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return timeB - timeA;
    });
  }, [notifications, pending]);

  const markAsRead = async (event: any) => {
    if (!db || !event.isResponse || event.isRead) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications', event.id), { read: true });
      await batch.commit();
    } catch (e) {
      console.error("Mark read error:", e);
    }
  };

  const handleDeleteEvent = async (event: any) => {
    if (!db || !user) return;
    
    setIsDeleting(true);
    try {
      const plate = event.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const batch = writeBatch(db);
      
      if (event.isResponse) {
        batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications', event.id));
      } else {
        batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', event.id));
      }

      if (event.logData?.id) {
        const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', event.logData.id);
        batch.delete(logRef);
      }

      await batch.commit();
      
      // Städa kundlista om det behövs
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
      const q = query(logsRef, where('creatorId', '==', user.uid));
      const snap = await getDocs(q);
      const remainingLogs = snap.docs.filter(d => d.id !== event.logData?.id);
      
      if (remainingLogs.length === 0) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'workshops', user.uid, 'servicedCars', plate));
      }

      toast({ title: "Händelse raderad" });
      setSelectedEvent(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fel vid radering", description: e.message });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isUserLoading || (isNotifsLoading && isPendingLoading)) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 pb-32">
      <header className="mb-10 flex items-center gap-4">
        <Button variant="ghost" asChild className="rounded-full h-12 w-12 p-0"><Link href="/workshop"><ArrowLeft className="w-6 h-6" /></Link></Button>
        <div>
          <h1 className="text-4xl font-headline font-bold text-white">Händelser</h1>
          <p className="text-muted-foreground">Status på dina inskickade förslag.</p>
        </div>
      </header>

      <div className="space-y-4">
        {allEvents.length > 0 ? (
          allEvents.map((event) => (
            <Card 
              key={event.id} 
              onClick={() => { setSelectedEvent(event); markAsRead(event); }}
              className={`glass-card border-none hover:bg-white/5 transition-all cursor-pointer group ${!event.isRead ? 'ring-1 ring-primary/50 bg-primary/5' : ''}`}
            >
              <CardContent className="p-6 flex items-center gap-6">
                <div className="relative">
                  <EventAvatar userId={event.ownerId} name={event.ownerName} />
                  <div className="absolute -top-2 -right-2">
                    <StatusIcon status={event.status} size="sm" />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-lg truncate">
                      {event.logData?.category || 'Service'} 
                      {!event.isRead && <Badge className="ml-2 bg-primary text-[8px] h-4 px-1.5 font-black uppercase">Ny</Badge>}
                    </h3>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2 uppercase font-bold tracking-widest">
                      {event.createdAt?.toDate ? format(event.createdAt.toDate(), 'yyyy-MM-dd HH:mm', { locale: sv }) : 'Nyss'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="font-mono text-[10px] tracking-widest px-2 py-0 h-5 bg-white/5 border-white/10">{event.plate}</Badge>
                    <span className="text-muted-foreground truncate">{event.vehicleTitle}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <StatusBadge status={event.status} />
                    <span className="text-[10px] text-muted-foreground opacity-60">Ägare: {event.ownerName}</span>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-muted-foreground opacity-20 group-hover:opacity-100 transition-all" />
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-32 glass-card rounded-[2rem] border-2 border-dashed border-white/5">
            <HistoryIcon className="w-16 h-16 mx-auto opacity-10 mb-4" />
            <p className="text-muted-foreground">Inga händelser hittades.</p>
          </div>
        )}
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => { if(!open) setSelectedEvent(null); }}>
        <DialogContent className="glass-card border-white/10 rounded-[2.5rem] sm:max-w-xl p-0 overflow-hidden outline-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Händelsedetaljer</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="flex flex-col">
              <div className={`p-8 ${selectedEvent.status === 'approved' ? 'bg-green-500/10' : selectedEvent.status === 'rejected' ? 'bg-red-500/10' : 'bg-yellow-500/10'} border-b border-white/5`}>
                <div className="flex items-center gap-4 mt-4">
                  <StatusIcon status={selectedEvent.status} />
                  <div>
                    <p className="text-sm opacity-60 uppercase tracking-widest font-bold">{selectedEvent.plate} • {selectedEvent.vehicleTitle}</p>
                    <p className="text-xs text-muted-foreground italic">Ägare: {selectedEvent.ownerName || 'Bilägare'}</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Kategori" icon={<FileText className="text-primary" />} value={selectedEvent.logData?.category} />
                  <InfoItem label="Datum" icon={<Calendar className="text-accent" />} value={selectedEvent.logData?.date} />
                  <InfoItem label="Mätarställning" icon={<Gauge className="text-orange-400" />} value={`${selectedEvent.logData?.odometer?.toLocaleString()} mil`} />
                  <InfoItem label="Kostnad" icon={<Banknote className="text-green-400" />} value={`${selectedEvent.logData?.cost?.toLocaleString()} kr`} />
                </div>

                {selectedEvent.logData?.notes && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase opacity-40">Beskrivning / Anteckningar</p>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-sm italic opacity-80 leading-relaxed">
                      "{selectedEvent.logData.notes}"
                    </div>
                  </div>
                )}

                <EvidenceImageSection plate={selectedEvent.plate} logId={selectedEvent.logData?.id} photoUrl={selectedEvent.logData?.photoUrl} />
              </div>

              <div className="p-6 bg-white/5 border-t border-white/5 flex gap-3">
                <Button variant="ghost" onClick={() => setSelectedEvent(null)} className="flex-1 h-14 rounded-2xl font-bold">Stäng</Button>
                <Button 
                  variant="destructive" 
                  onClick={() => handleDeleteEvent(selectedEvent)} 
                  disabled={isDeleting}
                  className="flex-1 h-14 rounded-2xl font-bold bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  {isDeleting ? <Loader2 className="animate-spin w-5 h-5" /> : <><Trash2 className="w-5 h-5 mr-2" /> Radera</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusIcon({ status, size = "md" }: { status: string, size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-6 w-6" : "h-14 w-14";
  const i = size === "sm" ? "w-3.5 h-3.5" : "w-8 h-8";
  
  if (status === 'approved') return <div className={`${s} rounded-full bg-green-500 flex items-center justify-center text-white shrink-0 border-2 border-background shadow-lg`}><CheckCircle2 className={i} /></div>;
  if (status === 'rejected') return <div className={`${s} rounded-full bg-red-500 flex items-center justify-center text-white shrink-0 border-2 border-background shadow-lg`}><XCircle className={i} /></div>;
  return <div className={`${s} rounded-full bg-yellow-500 flex items-center justify-center text-black shrink-0 border-2 border-background shadow-lg`}><Clock className={i} /></div>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge className="bg-green-500/10 text-green-500 border-none px-3 py-1 font-black uppercase text-[10px]">Godkänd</Badge>;
  if (status === 'rejected') return <Badge className="bg-red-500/10 text-red-500 border-none px-3 py-1 font-black uppercase text-[10px]">Nekad</Badge>;
  return <Badge className="bg-yellow-500/10 text-yellow-500 border-none px-3 py-1 font-black uppercase text-[10px]">Väntar</Badge>;
}

function InfoItem({ label, icon, value }: { label: string, icon: any, value: any }) {
  return (
    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
      <p className="text-[10px] font-bold uppercase opacity-40 mb-1">{label}</p>
      <p className="font-bold flex items-center gap-2">{icon} {value || '---'}</p>
    </div>
  );
}

function EvidenceImageSection({ plate, logId, photoUrl }: { plate: string, logId: string, photoUrl?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const storage = useStorage();

  useEffect(() => {
    if (!storage) return;
    
    if (photoUrl && (photoUrl.startsWith('data:') || photoUrl.startsWith('http'))) {
      setUrl(photoUrl);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      try {
        const dUrl = await getDownloadURL(ref(storage, `receipts/${plate}/${logId}`));
        setUrl(dUrl);
      } catch (e) {
        setUrl(photoUrl || null);
      } finally { setLoading(false); }
    };

    if (logId && plate) fetch();
    else { setUrl(photoUrl || null); setLoading(false); }
  }, [storage, plate, logId, photoUrl]);

  const finalUrl = url || (photoUrl?.startsWith('data:') ? photoUrl : null);
  
  if (loading && !finalUrl) return <div className="h-40 rounded-2xl bg-white/5 animate-pulse flex items-center justify-center border border-white/5 text-[10px] font-bold uppercase opacity-20">Hämtar kvitto...</div>;
  if (!finalUrl) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase opacity-40">Bifogat bildbevis (Klicka för fullskärm)</p>
      <Dialog>
        <DialogTrigger asChild>
          <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black cursor-zoom-in group">
            <img src={finalUrl} alt="Kvitto" className="w-full h-full object-contain transition-transform group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 className="w-10 h-10 text-white" />
            </div>
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none outline-none overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Bildförstoring</DialogTitle>
          </DialogHeader>
          <div className="w-full h-full flex items-center justify-center p-4">
            <img src={finalUrl} alt="Fullskärmsbild" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
