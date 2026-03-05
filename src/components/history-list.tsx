
"use client";

import { VehicleLog, TrustLevel, UserProfile } from '@/types/autolog';
import { Wrench, Settings, CircleDashed, Search, FileText, History, ChevronRight, Edit3, Clock, ShieldCheck, Trash2, ArrowLeftRight, CalendarCheck, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { differenceInDays, parseISO, isValid, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

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

/**
 * Beräknar tillit för en enskild loggpost baserat på "Dubbla Datum".
 */
export const calculateTrustLevel = (log: VehicleLog): TrustLevel => {
  try {
    const sysDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
    const eventDate = parseISO(log.date);
    
    if (!isValid(sysDate) || !isValid(eventDate)) return 'Bronze';
    
    const diffDays = Math.abs(differenceInDays(sysDate, eventDate));
    const isOfficial = log.verificationSource === 'Workshop' || log.verificationSource === 'Official';

    // GULD: Verkstad/Officiell + Registrerad inom 7 dagar
    if (isOfficial && diffDays <= 7) return 'Gold';
    
    // SILVER: AI-verifierad ELLER Manuell registrerad inom 48 timmar (2 dagar)
    if (log.verificationSource === 'AI' || (!isOfficial && diffDays <= 2)) return 'Silver';
    
    // BRONS: Allt annat (t.ex. registrering > 30 dagar efter utförande)
    return 'Bronze';
  } catch {
    return 'Bronze';
  }
};

/**
 * Beräknar bilens totala status baserat på hela historiken enligt v4-krav (Strict Edition).
 */
export const calculateOverallTrust = (logs: VehicleLog[]): TrustLevel => {
  if (!logs || logs.length === 0) return 'Bronze';
  
  const approvedLogs = logs.filter(l => l.approvalStatus !== 'pending');
  
  // KRAV FÖR ATT ENS KUNNA LÄMNA BRONS: Minst 3 loggade händelser
  if (approvedLogs.length < 3) return 'Bronze';

  // Sortera efter datum (senaste först)
  const sorted = [...approvedLogs].sort((a, b) => b.date.localeCompare(a.date));
  
  const logLevels = approvedLogs.map(l => calculateTrustLevel(l));
  const goldCount = logLevels.filter(l => l === 'Gold').length;
  const goldRatio = goldCount / approvedLogs.length;

  // Kontrollera de 3 senaste posterna (Måste finnas 3 stycken som är snabba)
  const latest3 = sorted.slice(0, 3);
  const latest3AreQuick = latest3.length === 3 && latest3.every(log => {
    const sysDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
    const eventDate = parseISO(log.date);
    const diff = Math.abs(differenceInDays(sysDate, eventDate));
    return diff <= 7;
  });

  // KRAV FÖR GULD: 
  // 1. Minst 3 händelser totalt
  // 2. 90% Guld-stämplar i hela historiken
  // 3. De 3 senaste är snabbt loggade (max 7 dagars diff)
  if (approvedLogs.length >= 3 && goldRatio >= 0.9 && latest3AreQuick) return 'Gold';
  
  // KRAV FÖR SILVER: 
  // 1. Minst 3 händelser (justerat från 2 för att höja ribban)
  // 2. Majoritet Silver/Guld (över 50%)
  const silverOrGoldCount = logLevels.filter(l => l === 'Gold' || l === 'Silver').length;
  if (approvedLogs.length >= 3 && silverOrGoldCount / approvedLogs.length >= 0.5) return 'Silver';

  return 'Bronze';
};

export function HistoryList({ logs, showPrivateData = false, onEdit, onDelete }: any) {
  const { user } = useUser();
  const db = useFirestore();
  const appId = firebaseConfig.projectId;

  const profileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: profile } = useDoc<UserProfile>(profileRef);
  
  const isHuvudAdmin = user?.email === 'apersson508@gmail.com' || profile?.role === 'Huvudadmin';

  const approvedLogs = (logs || []).filter((l: any) => l.approvalStatus !== 'pending');

  if (!approvedLogs || approvedLogs.length === 0) {
    return (
      <div className="text-center py-20 bg-white/5 rounded-[2rem] border-dashed border-2 border-white/10">
        <p className="text-muted-foreground text-sm">Ingen historik loggad ännu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvedLogs.map((log: VehicleLog) => {
        const trustLevel = calculateTrustLevel(log);
        const trust = TRUST_CONFIG[trustLevel];
        const CategoryIcon = CATEGORY_ICONS[log.category] || Wrench;
        
        const sysDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
        const eventDate = parseISO(log.date);
        const diffDays = isValid(sysDate) && isValid(eventDate) ? Math.abs(differenceInDays(sysDate, eventDate)) : 0;
        
        const isCreator = user?.uid === log.creatorId;
        const isOfficial = log.verificationSource === 'Workshop' || log.verificationSource === 'Official';
        const isOwnershipTransfer = log.category === 'Ägarbyte';
        
        const canModify = isHuvudAdmin || (isCreator && !isOwnershipTransfer && !isOfficial);
        
        return (
          <Card key={log.id} className="glass-card border-none overflow-hidden rounded-3xl group transition-all hover:ring-1 ring-white/10">
            <div className="p-6 flex gap-6">
              <div className={`w-1.5 rounded-full ${trust.color.replace('text-', 'bg-')}`} />
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl flex items-center justify-center bg-white/5 text-primary">
                      <CategoryIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl flex items-center gap-2">
                        {log.category} <span className="text-lg">{trust.emoji}</span>
                      </h3>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        Utfördes: {log.date}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${trust.bg} ${trust.color} border-none text-[10px] px-3 py-1 uppercase font-black tracking-widest`}>
                      {trust.label}
                    </Badge>
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
                    <span className="text-base font-bold text-primary">{log.odometer?.toLocaleString()} mil</span>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold opacity-40 uppercase block mb-1">Loggades (Systemdatum)</span>
                    <div className="flex items-center gap-1.5">
                      <CalendarCheck className="w-3.5 h-3.5 opacity-40" />
                      <span className="text-xs font-medium">{isValid(sysDate) ? format(sysDate, 'yyyy-MM-dd') : '---'}</span>
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
                  <p className="text-sm text-muted-foreground leading-relaxed bg-white/5 p-4 rounded-2xl italic border-l-2 border-white/10">
                    "{log.notes}"
                  </p>
                )}

                {diffDays > 30 && (
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
