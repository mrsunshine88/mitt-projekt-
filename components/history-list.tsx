
import { VehicleLog, TrustLevel } from '@/types/autolog';
import { Wrench, Settings, CircleDashed, Search, FileText, History, ChevronRight, Edit3, Clock, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { differenceInDays, parseISO, isValid } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase';

const CATEGORY_ICONS = {
  'Service': Wrench,
  'Reparation': Settings,
  'Däck': CircleDashed,
  'Besiktning': Search,
  'Uppgradering': FileText
};

export const TRUST_CONFIG = {
  'Gold': { 
    label: 'Guld', 
    emoji: '🥇', 
    color: 'text-yellow-500', 
    bg: 'bg-yellow-500/10', 
    border: 'border-yellow-500/20',
    desc: '90% Guld-stämplar. Krav: Minst 3 loggar och max 7 dagars diff på de 3 senaste posterna.'
  },
  'Silver': { 
    label: 'Silver', 
    emoji: '🥈', 
    color: 'text-slate-300', 
    bg: 'bg-slate-300/10', 
    border: 'border-slate-300/20',
    desc: 'Majoritet Silver/Guld-stämplar. Godkänd historik med bildbevis eller verkstadsstämplar.'
  },
  'Bronze': { 
    label: 'Brons', 
    emoji: '🥉', 
    color: 'text-orange-600', 
    bg: 'bg-orange-600/10', 
    border: 'border-orange-600/20',
    desc: 'Blandad historik eller efterhandsregistreringar utan strikt tidsverifiering.'
  }
};

export const calculateTrustLevel = (log: VehicleLog): TrustLevel => {
  try {
    const sysDate = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
    const eventDate = parseISO(log.date);
    
    if (!isValid(sysDate) || !isValid(eventDate)) return 'Bronze';
    
    const diff = Math.abs(differenceInDays(sysDate, eventDate));
    const isWorkshop = log.verificationSource === 'Workshop' || log.verificationSource === 'Official';
    
    if (isWorkshop && diff <= 7) return 'Gold';
    if (log.verificationSource === 'AI' || isWorkshop || diff <= 2) return 'Silver';
    
    return 'Bronze';
  } catch { return 'Bronze'; }
};

export const calculateOverallTrust = (logs: VehicleLog[]): TrustLevel => {
  const approvedLogs = logs.filter(l => l.approvalStatus !== 'pending');
  if (!approvedLogs || approvedLogs.length === 0) return 'Bronze';

  const sortedLogs = [...approvedLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const logLevels = approvedLogs.map(l => calculateTrustLevel(l));
  
  const goldCount = logLevels.filter(l => l === 'Gold').length;
  const silverCount = logLevels.filter(l => l === 'Silver').length;
  const goldPercentage = (goldCount / approvedLogs.length) * 100;

  const last3 = sortedLogs.slice(0, 3);
  const last3Within7Days = last3.length > 0 && last3.every(l => {
    const sysDate = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt);
    const eventDate = parseISO(l.date);
    return Math.abs(differenceInDays(sysDate, eventDate)) <= 7;
  });

  if (goldPercentage >= 90 && last3Within7Days && approvedLogs.length >= 3) return 'Gold';
  if ((goldCount + silverCount) / approvedLogs.length >= 0.5) return 'Silver';

  return 'Bronze';
};

export function HistoryList({ logs, showPrivateData = false, onEdit, onDelete, isWorkshop = false }: any) {
  const { user } = useUser();
  const approvedLogs = logs.filter((l: any) => l.approvalStatus !== 'pending');

  if (!approvedLogs || approvedLogs.length === 0) {
    return (
      <div className="text-center py-20 bg-white/5 rounded-[2rem] border-dashed border-2 border-white/10">
        <p className="text-muted-foreground text-sm">Ingen godkänd historik loggad ännu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvedLogs.map((log: VehicleLog) => {
        const CategoryIcon = CATEGORY_ICONS[log.category] || Wrench;
        const trustLevel = calculateTrustLevel(log);
        const trust = TRUST_CONFIG[trustLevel];
        
        // REGEL: Endast skaparen kan radera sin egen post. 
        // Ägare kan inte radera verkstadsloggar.
        const canDelete = onDelete && user?.uid === log.creatorId;
        
        return (
          <Card key={log.id} className="glass-card border-none overflow-hidden hover:ring-2 ring-primary/20 transition-all rounded-2xl group">
            <div className="p-5 flex gap-5">
              <div className={`w-1.5 rounded-full ${trust.color.replace('text-', 'bg-')}`} />
              
              <div className="h-14 w-14 rounded-2xl shrink-0 flex items-center justify-center bg-primary/10 text-primary">
                <CategoryIcon className="w-7 h-7" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      {log.category} 
                      <span title={trust.desc}>{trust.emoji}</span>
                    </h3>
                    <div className="flex flex-col gap-0.5 mt-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                        <History className="w-3.5 h-3.5" /> Utfördes: {log.date}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5 italic">
                        <Clock className="w-3 h-3" /> Systemlogg: {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString() : 'Realtid'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative z-50">
                    <Badge className={`${trust.bg} ${trust.color} border-none text-[10px] uppercase font-bold px-3 py-1 rounded-full`}>
                      {trust.label}
                    </Badge>
                    <div className="flex items-center gap-1">
                      {onEdit && user?.uid === log.creatorId && (
                        <Button variant="ghost" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(log); }} className="h-8 w-8 rounded-full hover:bg-white/10 opacity-40 group-hover:opacity-100">
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(log); }} className="h-8 w-8 rounded-full hover:bg-red-500/20 text-destructive opacity-40 group-hover:opacity-100">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest">Mätare</span>
                    <span className="text-lg font-bold text-primary">{log.odometer?.toLocaleString()} mil</span>
                  </div>
                  {showPrivateData && log.cost && (
                    <div className="flex flex-col pl-6 border-l border-white/10">
                      <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest">Kostnad</span>
                      <span className="text-lg font-bold">{log.cost.toLocaleString()} kr</span>
                    </div>
                  )}
                </div>

                {log.notes && (
                  <p className="text-sm text-muted-foreground mt-3 italic opacity-80 bg-white/5 p-3 rounded-xl border border-white/5">
                    "{log.notes}"
                  </p>
                )}
                
                {(log.verificationSource === 'Workshop' || log.verificationSource === 'Official') && (
                  <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verifierad av {log.creatorName || 'Verkstad'}
                  </div>
                )}
              </div>
              
              {!isWorkshop && !canDelete && (
                <div className="flex items-center">
                  <ChevronRight className="w-5 h-5 opacity-20 group-hover:translate-x-1 transition-all" />
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
