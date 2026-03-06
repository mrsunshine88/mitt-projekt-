
"use client";

import { VehicleLog, TrustLevel, UserProfile } from '@/types/autolog';
import { Wrench, Settings, CircleDashed, Search, FileText, History, ChevronRight, Edit3, Clock, ShieldCheck, Trash2, ArrowLeftRight, CalendarCheck, AlertCircle, Maximize2, ImageIcon, Lock, Check, X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { differenceInDays, parseISO, isValid, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { useUser, useFirestore, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { doc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

/**
 * En säker komponent för att visa kvitton från Firebase Storage.
 * Verifierar behörighet via Storage Rules innan bild visas.
 */
function EvidenceImage({ plate, logId }: { plate: string, logId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const storage = useStorage();

  useEffect(() => {
    if (!storage || !plate || !logId) return;
    
    const fetchSecureUrl = async () => {
      try {
        const storageRef = ref(storage, `receipts/${plate}/${logId}`);
        const downloadUrl = await getDownloadURL(storageRef);
        setUrl(downloadUrl);
      } catch (e) {
        // Om detta failar betyder det att Storage Rules nekade åtkomst (t.ex. vid ägarbyte)
        setUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSecureUrl();
  }, [storage, plate, logId]);

  if (loading) return <div className="w-24 h-24 rounded-xl bg-white/5 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin opacity-20" /></div>;
  if (!url) return null;

  return (
    <div className="mt-4">
      <Dialog>
        <DialogTrigger asChild>
          <div className="relative w-24 h-24 rounded-xl overflow-hidden cursor-zoom-in border border-white/10 group shadow-lg">
            <img src={url} alt="Verifierat dokument" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
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
            <img src={url} alt="Dokument i fullskärm" className="max-w-full max-h-[85vh] object-contain shadow-2xl" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function HistoryList({ logs, showPrivateData = false, onEdit, onDelete, onApprove, onReject }: any) {
  const { user } = useUser();
  const db = useFirestore();
  const appId = firebaseConfig.projectId;

  const profileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: profile } = useDoc<UserProfile>(profileRef);
  
  const isHuvudAdmin = user?.email === 'apersson508@gmail.com' || profile?.role === 'Huvudadmin';

  const displayLogs = showPrivateData 
    ? (logs || [])
    : (logs || []).filter((l: any) => l.approvalStatus !== 'pending');

  if (!displayLogs || displayLogs.length === 0) {
    return (
      <div className="text-center py-20 bg-white/5 rounded-[2rem] border-dashed border-2 border-white/10">
        <p className="text-muted-foreground text-sm">Ingen historik loggad ännu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {displayLogs.map((log: VehicleLog) => {
        const isPending = log.approvalStatus === 'pending';
        const trustLevel = calculateTrustLevel(log);
        const trust = TRUST_CONFIG[trustLevel];
        const CategoryIcon = CATEGORY_ICONS[log.category] || Wrench;
        
        const sysDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
        const eventDate = parseISO(log.date);
        const diffDays = isValid(sysDate) && isValid(eventDate) ? Math.abs(differenceInDays(sysDate, eventDate)) : 0;
        
        const isCreator = user?.uid === log.creatorId;
        const isOfficial = log.verificationSource === 'Workshop' || log.verificationSource === 'Official';
        const isOwnershipTransfer = log.category === 'Ägarbyte';
        
        const canModify = isHuvudAdmin || (isCreator && !isOwnershipTransfer && !isOfficial && !isPending);
        
        return (
          <Card key={log.id} className={`glass-card border-none overflow-hidden rounded-3xl group transition-all ${isPending ? 'ring-2 ring-yellow-500/30 bg-yellow-500/5' : 'hover:ring-1 ring-white/10'}`}>
            <div className="p-6 flex flex-col sm:flex-row gap-6">
              <div className={`hidden sm:block w-1.5 rounded-full ${isPending ? 'bg-yellow-500' : trust.color.replace('text-', 'bg-')}`} />
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${isPending ? 'bg-yellow-500/20 text-yellow-500' : 'bg-white/5 text-primary'}`}>
                      <CategoryIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl flex items-center gap-2">
                        {log.category} {isPending ? <span className="text-sm font-black text-yellow-500 uppercase ml-2 tracking-widest">Förslag</span> : <span className="text-lg">{trust.emoji}</span>}
                      </h3>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        Utfördes: {log.date}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isPending && (
                      <Badge className={`${trust.bg} ${trust.color} border-none text-[10px] px-3 py-1 uppercase font-black tracking-widest`}>
                        {trust.label}
                      </Badge>
                    )}
                    {canModify && (
                      <div className="flex items-center gap-1">
                        {onEdit && <Button variant="ghost" size="icon" onClick={() => onEdit(log)} className="h-8 w-8 hover:bg-white/10"><Edit3 className="w-4 h-4" /></Button>}
                        {onDelete && <Button variant="ghost" size="icon" onClick={() => onDelete(log)} className="h-8 w-8 text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold opacity-40 uppercase block mb-1">Mätarställning</span>
                    <span className={`text-base font-bold ${isPending ? 'text-yellow-500' : 'text-primary'}`}>{log.odometer?.toLocaleString()} mil</span>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold opacity-40 uppercase block mb-1">Status</span>
                    <div className="flex items-center gap-1.5">
                      {isPending ? (
                        <span className="text-xs font-bold text-yellow-500 uppercase tracking-tighter">Väntar på godkännande</span>
                      ) : (
                        <>
                          <CalendarCheck className="w-3.5 h-3.5 opacity-40" />
                          <span className="text-xs font-medium">Loggad {isValid(sysDate) ? format(sysDate, 'yyyy-MM-dd') : '---'}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {showPrivateData && log.cost ? (
                    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                      <span className="text-[10px] font-bold opacity-40 uppercase block mb-1">Kostnad</span>
                      <span className="text-base font-bold text-white">{log.cost.toLocaleString()} kr</span>
                    </div>
                  ) : null}
                </div>

                {log.notes && (
                  <div className={`p-4 rounded-2xl border-l-2 mb-4 ${isPending ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Anteckningar / Verkstad</p>
                    <p className="text-sm text-muted-foreground leading-relaxed italic">
                      "{log.notes}"
                    </p>
                  </div>
                )}

                {/* SÄKER VISNING: Komponent som hämtar bild från Storage med behörighetskontroll */}
                {(log.hasStoragePhoto || log.photoUrl) && (
                  <div className="flex flex-col gap-2">
                    <EvidenceImage plate={log.licensePlate} logId={log.id} />
                    {!isCreator && !isHuvudAdmin && (log.hasStoragePhoto || log.photoUrl) && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-[10px] font-bold text-muted-foreground uppercase w-fit">
                        <Lock className="w-3 h-3" /> 
                        {showPrivateData ? 'Kvitto från tidigare ägare (Dolt pga GDPR)' : 'Verifierat kvitto finns (Dolt för köpare)'}
                      </div>
                    )}
                  </div>
                )}

                {isPending && showPrivateData && !isCreator && (
                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <Button 
                      onClick={() => onApprove && onApprove(log)}
                      className="bg-green-600 hover:bg-green-500 text-white font-bold h-12 rounded-xl flex-1 shadow-lg shadow-green-600/20"
                    >
                      <Check className="w-5 h-5 mr-2" /> Godkänn & verifiera
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => onReject && onReject(log)}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 font-bold h-12 rounded-xl flex-1"
                    >
                      <X className="w-5 h-5 mr-2" /> Neka förslag
                    </Button>
                  </div>
                )}

                {!isPending && diffDays > 30 && (
                  <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-orange-500 uppercase bg-orange-500/5 p-2 rounded-lg border border-orange-500/10">
                    <AlertCircle className="w-3 h-3" />
                    ⚠️ Efterhandsregistrering: Loggad {diffDays} dagar efter utförande
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
