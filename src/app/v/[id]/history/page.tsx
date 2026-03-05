
"use client";

import { use, useState, useEffect, useMemo } from 'react';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, VehicleLog, TrustLevel } from '@/types/autolog';
import { HistoryList, calculateOverallTrust, TRUST_CONFIG } from '@/components/history-list';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, History, ShieldCheck, Gauge, Calendar, Palette, Zap, Loader2, Share2, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function VehicleHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const appId = firebaseConfig.projectId;

  useEffect(() => {
    async function fetchVehicle() {
      if (!db || !id) return;
      try {
        const plate = id.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const carRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
        const carSnap = await getDoc(carRef);
        if (carSnap.exists()) {
          setVehicle({ ...carSnap.data(), id: carSnap.id } as Vehicle);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchVehicle();
  }, [db, id, appId]);

  const logsQuery = useMemoFirebase(() => {
    if (!db || !id) return null;
    const plate = id.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
  }, [db, id, appId]);

  const { data: logs } = useCollection<VehicleLog>(logsQuery);
  const sortedLogs = useMemo(() => logs ? [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [], [logs]);

  const overallTrust = useMemo((): TrustLevel => {
    return calculateOverallTrust(logs || []);
  }, [logs]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/v/${vehicle?.licensePlate}/history`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Historiklänk kopierad!", description: "Köpare kan nu se hela den verifierade historiken direkt." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteLog = async (log: VehicleLog) => {
    if (!db || !user || !vehicle || !log.id) return;
    
    // confirm() blocked by sandbox, we delete directly.
    try {
      const plate = vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', log.id);
      await deleteDoc(logRef);
      toast({ title: "Historikpost raderad" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Kunde inte radera", description: e.message });
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  const isOwner = user?.uid === vehicle?.ownerId;

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <button onClick={() => router.back()} className="inline-flex items-center text-xs font-bold text-muted-foreground hover:text-white uppercase tracking-widest">
            <ArrowLeft className="w-4 h-4 mr-2" /> TILLBAKA
          </button>
          <Button variant="outline" size="sm" onClick={handleCopyLink} className="rounded-full bg-white/5 border-white/10 px-6 font-bold h-10">
            {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Share2 className="w-4 h-4 mr-2 text-primary" />}
            Dela historik
          </Button>
        </div>

        <header className="mb-12 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 mb-4 px-4 py-1.5 rounded-full uppercase text-[10px] font-black">
                <ShieldCheck className="w-4 h-4 mr-2" /> AutoLog Verifierad Historik
              </Badge>
              <h1 className="text-5xl font-headline font-bold text-white leading-none">
                {vehicle?.make} <span className="text-primary">{vehicle?.model}</span>
              </h1>
              <div className="bg-white text-black font-bold px-6 py-1.5 rounded-xl text-2xl border-2 border-slate-300 font-mono inline-block mt-4">
                {vehicle?.licensePlate}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`h-16 w-16 rounded-3xl ${TRUST_CONFIG[overallTrust].bg} flex items-center justify-center text-3xl shadow-xl border-2 ${TRUST_CONFIG[overallTrust].border}`}>
                {TRUST_CONFIG[overallTrust].emoji}
              </div>
              <div>
                <p className="text-xs font-bold uppercase opacity-40">Tillitsprofil</p>
                <p className={`text-xl font-black ${TRUST_CONFIG[overallTrust].label}`}>{TRUST_CONFIG[overallTrust].label}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 rounded-2xl flex items-center gap-3">
              <Gauge className="w-5 h-5 text-primary" />
              <div><p className="text-[10px] uppercase opacity-40 font-bold">Mätare</p><p className="font-bold">{vehicle?.currentOdometerReading?.toLocaleString()} mil</p></div>
            </div>
            <div className="glass-card p-4 rounded-2xl flex items-center gap-3">
              <Calendar className="w-5 h-5 text-accent" />
              <div><p className="text-[10px] uppercase opacity-40 font-bold">Årsmodell</p><p className="font-bold">{vehicle?.year}</p></div>
            </div>
            <div className="glass-card p-4 rounded-2xl flex items-center gap-3">
              <Zap className="w-5 h-5 text-yellow-500" />
              <div><p className="text-[10px] uppercase opacity-40 font-bold">Effekt</p><p className="font-bold">{vehicle?.hp || '---'} hk</p></div>
            </div>
            <div className="glass-card p-4 rounded-2xl flex items-center gap-3">
              <Palette className="w-5 h-5 text-pink-400" />
              <div><p className="text-[10px] uppercase opacity-40 font-bold">Färg</p><p className="font-bold">{vehicle?.color || '---'}</p></div>
            </div>
          </div>
        </header>

        <section className="space-y-8">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <History className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-headline font-bold">Händelselogg</h2>
          </div>
          <HistoryList 
            logs={sortedLogs} 
            showPrivateData={isOwner} 
            onDelete={isOwner ? handleDeleteLog : undefined}
          />
        </section>
      </div>
    </div>
  );
}
