
"use client";

import { VehicleLog, TrustLevel, UserProfile } from '@/types/autolog';
import { Wrench, Settings, CircleDashed, Search, FileText, History as HistoryIcon, ChevronRight, Edit3, Clock, ShieldCheck, Trash2, ArrowLeftRight, CalendarCheck, AlertCircle, Maximize2, ImageIcon, Lock, Check, X, Loader2, Building2, User, Hammer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { differenceInDays, parseISO, isValid, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { useUser, useFirestore, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { doc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const CATEGORY_ICONS: any = {
  'Service': Wrench,
  'Reparation': Settings,
  'Däck': CircleDashed,
  'Besiktning': Search,
  'Uppgradering': FileText,
  'Ägarbyte': ArrowLeftRight
};

export const TRUST_CONFIG = {
  'Gold': { label: 'Guld', emoji: '🏆', color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', description: 'Verifierad realtidslogg' },
  'Silver': { label: 'Silver', emoji: '🥈', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/20', description: 'Godkänd historik' },
  'Bronze': { label: 'Brons', emoji: '🥉', color: 'text-orange-600', bg: 'bg-orange-600/10', border: 'border-orange-600/20', description: 'Efterhandsregistrering' }
};

export const calculateTrustLevel = (log: VehicleLog): TrustLevel => {
  try {
    const sysDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
    const eventDate = parseISO(log.date);
    
    if (!isValid(sysDate) || !isValid(eventDate)) return 'Bronze';
    
    const diffDays = Math.abs(differenceInDays(sysDate, eventDate));
    const isOfficial = log.verificationSource === 'Workshop' || log.verificationSource === 'Official';

    if (isOfficial && diffDays <= 7) return 'Gold';
    if (log.verificationSource === 'AI' || (!isOfficial && diffDays <= 2)) return 'Silver';
    return 'Bronze';
  } catch {
    return 'Bronze';
  }
};

export const calculateOverallTrust = (logs: VehicleLog[]): TrustLevel => {
  if (!logs || logs.length === 0) return 'Bronze';
  const approvedLogs = logs.filter(l => l.approvalStatus !== 'pending');
  if (approvedLogs.length < 3) return 'Bronze';

  const sorted = [...approvedLogs].sort((a, b) => b.date.localeCompare(a.date));
  const logLevels = approvedLogs.map(l => calculateTrustLevel(l));
  const goldCount = logLevels.filter(l => l === 'Gold').length;
  const goldRatio = goldCount / approvedLogs.length;

  const latest3 = sorted.slice(0, 3);
  const latest3AreQuick = latest3.length === 3 && latest3.every(log => {
    const sysDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
    const eventDate = parseISO(log.date);
    const diff = Math.abs(differenceInDays(sysDate, eventDate));
    return diff <= 7;
  });

  if (approvedLogs.length >= 3 && goldRatio >= 0.9 && latest3AreQuick) return 'Gold';
  
  const silverOrGoldCount = logLevels.filter(l => l === 'Gold' || l === 'Silver').length;
  if (approvedLogs.length >= 3 && silverOrGoldCount / approvedLogs.length >= 0.5) return 'Silver';

  return 'Bronze';
};

function EvidenceImage({ plate, logId, fallbackUrl }: { plate: string, logId: string, fallbackUrl?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const storage = useStorage();

  useEffect(() => {
    if (!storage) return;

    if (fallbackUrl && fallbackUrl.startsWith('data:')) {
      setUrl(fallbackUrl);
      setLoading(false);
      return;
    }

    const fetchSecureUrl = async () => {
      if (!plate || !logId) {
        setLoading(false);
        return;
      }
      try {
        const storageRef = ref(storage, `receipts/${plate}/${logId}`);
        const downloadUrl = await getDownloadURL(storageRef);
        setUrl(downloadUrl);
      } catch (e) {
        setUrl(fallbackUrl || null);
      } finally {
        setLoading(false);
      }
    };

    fetchSecureUrl();
  }, [storage, plate, logId, fallbackUrl]);

  const finalDisplayUrl = url || (fallbackUrl?.startsWith('data:') ? fallbackUrl : null);

  if (loading && !finalDisplayUrl) return <div className="w-24 h-24 rounded-xl bg-white/5 flex items-center justify-center border border-white/5"><Loader2 className="w-4 h-4 animate-spin opacity-20" /></div>;
  if (!finalDisplayUrl) return null;

  return (
    <div className="mt-4">
      <Dialog>
        <DialogTrigger asChild>
          <div className="relative w-24 h-24 rounded-xl overflow-hidden cursor-zoom-in border border-white/10 group shadow-lg">
            <img src={finalDisplayUrl} alt="Verifierat dokument" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 className="w-5 h-5 text-white" />
            </div>
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/95 border-none rounded-none overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Dokumentförstoring</DialogTitle>
          </DialogHeader>
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <img src={finalDisplayUrl} alt="Dokument i fullskärm" className="max-w-full max-h-[85vh] object-contain shadow-2xl" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkshopAvatar({ workshopId, fallbackName }: { workshopId?: string, fallbackName?: string }) {
  const db = useFirestore();
  const appId = firebaseConfig.projectId;
  const profileRef = useMemoFirebase(() => {
    if (!db || !workshopId) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', workshopId);
  }, [db, workshopId, appId]);
  const { data: profile } = useDoc<UserProfile>(profileRef);

  return (
    <div className="relative">
      <Avatar className="h-14 w-14 rounded-xl border border-white/10 shrink-0 shadow-lg bg-background">
        <AvatarImage src={profile?.photoUrl} className="object-cover" />
        <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-black uppercase text-xs">
          {profile?.name?.[0] || fallbackName?.[0] || 'W'}
        </AvatarFallback>
      </Avatar>
      <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-md p-0.5 border-2 border-background shadow-lg">
        <Wrench className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}

export function HistoryList({ logs, showPrivateData = false, onEdit, onDelete, onApprove, onReject }: any) {
  const { user } = useUser();
  const db = useFirestore();
  const appId = firebaseConfig.projectId;

  const adminProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: adminProfile } = useDoc<UserProfile>(adminProfileRef);
  
  const isHuvudAdmin = user?.email === 'apersson508@gmail.com' || adminProfile?.role === 'Huvudadmin';

  const displayLogs = showPrivateData 
    ? (logs || [])
    : (logs || []).filter((l: any) => l.approvalStatus !== 'pending');

  if (!displayLogs || displayLogs.length === 0) {
    return (
      <div className="text-center py-20 bg-white/5 rounded-[2rem] border-dashed border-2 border-white/10">
        <p className="text-muted-foreground text-sm italic">Ingen verifierad historik tillgänglig.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {displayLogs.map((log: VehicleLog) => {
        const isPending = log.approvalStatus === 'pending';
        const trustLevel = calculateTrustLevel(log);
        const trust = TRUST_CONFIG[trustLevel];
        const CategoryIcon = CATEGORY_ICONS[log.category] || Wrench;
        
        const sysDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
        
        const isCreator = user?.uid === log.creatorId;
        const isOfficial = log.verificationSource === 'Workshop' || log.verificationSource === 'Official';
        const isOwnershipTransfer = log.category === 'Ägarbyte';
        
        const isOwnerAtTime = user?.uid === log.ownerId;
        const canSeeSensitive = isOwnerAtTime || isHuvudAdmin || isCreator;

        const canDelete = onDelete && (
          isHuvudAdmin || 
          (isCreator && !isOwnershipTransfer) || 
          (!isOfficial && isOwnerAtTime && !isOwnershipTransfer)
        );

        const canEdit = onEdit && (isHuvudAdmin || (isCreator && !isOwnershipTransfer));
        
        return (
          <Card key={log.id} className={`glass-card border-none overflow-hidden rounded-[2.5rem] group transition-all ${isPending ? 'ring-2 ring-yellow-500/30 bg-yellow-500/5' : isOfficial ? 'ring-1 ring-primary/20' : 'hover:ring-1 ring-white/10'}`}>
            <div className="p-6 md:p-8 flex flex-col sm:flex-row gap-6">
              <div className={`hidden sm:block w-2 rounded-full ${isPending ? 'bg-yellow-500' : isOfficial ? 'bg-primary' : 'bg-slate-700'}`} />
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-5">
                    {isOfficial && !isOwnershipTransfer ? (
                      <WorkshopAvatar workshopId={log.creatorId} fallbackName={log.creatorName} />
                    ) : (
                      <div className={`h-14 w-14 rounded-full flex items-center justify-center ${isPending ? 'bg-yellow-500/20 text-yellow-500' : 'bg-white/5 text-slate-400'} border border-white/5 shrink-0`}>
                        {isOwnershipTransfer ? <ArrowLeftRight className="w-7 h-7" /> : <User className="w-7 h-7" />}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-headline font-bold text-2xl">
                          {log.category} 
                        </h3>
                        {isPending ? (
                          <Badge className="bg-yellow-500 text-black text-[10px] font-black uppercase px-2 h-5">Väntar svar</Badge>
                        ) : (
                          <span className="text-xl">{trust.emoji}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.15em] flex items-center gap-1.5">
                          <HistoryIcon className="w-3 h-3" /> Utfördes: {log.date}
                        </p>
                        <div className="h-1 w-1 rounded-full bg-white/10" />
                        {isOfficial ? (
                          <Badge variant="outline" className="text-[9px] font-black uppercase text-primary border-primary/20 bg-primary/5 py-0 h-5">
                            <ShieldCheck className="w-3 h-3 mr-1" /> Verkstadshistorik
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] font-black uppercase text-slate-400 border-white/10 bg-white/5 py-0 h-5">
                            <User className="w-3 h-3 mr-1" /> Loggat av ägare
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {!isPending && (
                      <Badge className={`${trust.bg} ${trust.color} border-none text-[10px] px-4 py-1.5 uppercase font-black tracking-widest rounded-full shadow-lg`}>
                        {trust.label}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1">
                      {canEdit && <Button variant="ghost" size="icon" onClick={() => onEdit(log)} className="h-9 w-9 rounded-full hover:bg-white/10"><Edit3 className="w-4 h-4" /></Button>}
                      {canDelete && <Button variant="ghost" size="icon" onClick={() => onDelete(log)} className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-black opacity-40 uppercase block mb-1.5 tracking-wider">Mätarställning</span>
                    <span className={`text-xl font-black ${isPending ? 'text-yellow-500' : 'text-primary'}`}>{log.odometer?.toLocaleString()} mil</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-black opacity-40 uppercase block mb-1.5 tracking-wider">Verifieringsdatum</span>
                    <div className="flex items-center gap-2">
                      {isPending ? (
                        <span className="text-[11px] font-bold text-yellow-500 uppercase">Väntar på godkännande</span>
                      ) : (
                        <>
                          <CalendarCheck className="w-4 h-4 text-green-500" />
                          <span className="text-sm font-black uppercase">{isValid(sysDate) ? format(sysDate, 'yyyy-MM-dd') : '---'}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {canSeeSensitive && showPrivateData && log.cost ? (
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[10px] font-black opacity-40 uppercase block mb-1.5 tracking-wider">Kostnad</span>
                      <span className="text-xl font-black text-white">{log.cost.toLocaleString()} kr</span>
                    </div>
                  ) : (
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col justify-center items-start">
                       <span className="text-[10px] font-black opacity-20 uppercase block tracking-wider">Privat info</span>
                       <Lock className="w-3.5 h-3.5 opacity-20 mt-1" />
                    </div>
                  )}
                </div>

                {log.notes && (
                  <div className={`p-5 rounded-2xl border-l-4 mb-6 ${isPending ? 'bg-yellow-500/10 border-yellow-500/20' : isOfficial ? 'bg-primary/5 border-primary/20' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-[10px] font-black uppercase opacity-40 mb-2 tracking-widest">Beskrivning</p>
                    <p className="text-base text-slate-300 leading-relaxed italic font-medium">
                      "{log.notes}"
                    </p>
                  </div>
                )}

                {log.creatorName && isOfficial && !isOwnershipTransfer && (
                  <div className="mt-2 flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-2xl border border-primary/20 w-fit">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="text-[11px] font-black uppercase tracking-[0.1em] text-primary">Utförd av: {log.creatorName}</span>
                    <ShieldCheck className="w-4 h-4 text-green-500 fill-green-500/10" />
                  </div>
                )}

                {(log.hasStoragePhoto || log.photoUrl) && (
                  <div className="flex flex-col gap-3">
                    {canSeeSensitive ? (
                      <EvidenceImage plate={log.licensePlate} logId={log.id} fallbackUrl={log.photoUrl} />
                    ) : (
                      <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black text-muted-foreground uppercase w-fit mt-3">
                        <Lock className="w-3.5 h-3.5" /> 
                        {showPrivateData ? (
                          'Kvitto från tidigare ägare (Dolt pga GDPR)'
                        ) : 'Verifierat bildbevis bifogat'}
                      </div>
                    )}
                  </div>
                )}

                {isPending && showPrivateData && !isCreator && (
                  <div className="mt-8 flex flex-col sm:flex-row gap-4 animate-in slide-in-from-bottom-4 duration-700">
                    <Button 
                      onClick={() => onApprove && onApprove(log)}
                      className="bg-green-600 hover:bg-green-500 text-white font-black h-14 rounded-2xl flex-1 shadow-xl shadow-green-600/20 uppercase text-sm tracking-widest"
                    >
                      <Check className="w-6 h-6 mr-2" /> Godkänn & verifiera
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => onReject && onReject(log)}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 font-bold h-14 rounded-2xl flex-1 uppercase text-sm tracking-widest"
                    >
                      <X className="w-6 h-6 mr-2" /> Neka förslag
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
