import { VehicleLog } from '@/types/autolog';
import { Wrench, ShieldCheck, Camera, Search, FileText, Settings, CircleDashed, AlertTriangle, Lock, History, Bot, PenTool, Building2, User, Hammer, ChevronRight, Edit3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

const CATEGORY_ICONS = {
  'Service': Wrench,
  'Reparation': Settings,
  'Däck': CircleDashed,
  'Besiktning': Search,
  'Uppgradering': FileText
};

interface HistoryListProps {
  logs: VehicleLog[];
  showPrivateData?: boolean;
  onEdit?: (log: VehicleLog) => void;
  isWorkshop?: boolean;
}

export function HistoryList({ logs, showPrivateData = false, onEdit, isWorkshop = false }: HistoryListProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-20 bg-white/5 rounded-3xl border-dashed border-2 border-white/10">
        <p className="text-muted-foreground text-sm">Ingen historik loggad ännu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-6 before:w-px before:bg-white/5 sm:before:left-1/2">
      {logs.map((log) => {
        const CategoryIcon = CATEGORY_ICONS[log.category] || Wrench;
        const isCorrection = log.type === 'Correction';
        const isVerified = log.isVerified || log.isLocked;
        
        return (
          <div key={log.id} className="relative pl-12 sm:pl-0 sm:flex sm:items-center">
            {/* Timeline dot */}
            <div className={`absolute left-4 top-6 w-4 h-4 rounded-full border-4 border-background z-10 sm:left-1/2 sm:-ml-2 ${isCorrection ? 'bg-destructive' : isVerified ? 'bg-green-500' : 'bg-primary'}`} />
            
            <Card className={`w-full glass-card border-none overflow-hidden group hover:ring-2 transition-all ring-primary/20 ${isCorrection ? 'bg-destructive/5' : ''}`}>
              <div className="p-4 flex gap-4">
                <div className={`h-12 w-12 rounded-xl shrink-0 flex items-center justify-center ${isCorrection ? 'bg-destructive/20 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  <CategoryIcon className="w-6 h-6" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className={`font-bold text-base truncate ${isCorrection ? 'text-destructive' : ''}`}>
                        {log.category}
                      </h3>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <History className="w-3 h-3" /> {log.date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isVerified && (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-400 text-[9px] uppercase font-bold py-0 h-5">
                          Verifierad
                        </Badge>
                      )}
                      {isWorkshop && onEdit && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-full hover:bg-white/10"
                          onClick={() => onEdit(log)}
                        >
                          <Edit3 className="w-4 h-4 opacity-40 hover:opacity-100 transition-opacity" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Mätare</span>
                      <span className={`text-sm font-bold ${isCorrection ? 'text-destructive' : 'text-primary'}`}>
                        {log.odometer.toLocaleString()} mil
                      </span>
                    </div>
                    {showPrivateData && log.cost && (
                      <div className="flex flex-col border-l border-white/10 pl-3">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Kostnad</span>
                        <span className="text-sm font-bold">{log.cost.toLocaleString()} kr</span>
                      </div>
                    )}
                  </div>

                  {log.notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic line-clamp-2 leading-relaxed opacity-70">
                      "{log.notes}"
                    </p>
                  )}
                </div>
                
                {!isWorkshop && (
                  <div className="flex items-center self-stretch">
                    <ChevronRight className="w-4 h-4 opacity-20" />
                  </div>
                )}
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
