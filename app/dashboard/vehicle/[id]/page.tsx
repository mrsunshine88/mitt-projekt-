
"use client";

import { use, useState, useMemo, useEffect } from 'react';
import { ShieldCheck, Gauge, Calendar, ArrowLeft, Loader2, History as HistoryIcon, FileText, Trash2, Zap, Palette, Wrench, KeyRound, Settings2, XCircle, Award, Share2, Check, Maximize2, AlertTriangle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HistoryList, calculateOverallTrust, TRUST_CONFIG } from '@/components/history-list';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { doc, collection, updateDoc, deleteDoc, serverTimestamp, writeBatch, onSnapshot, getDocs, query, where } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { Vehicle, VehicleLog, TrustLevel, UserProfile } from '@/types/autolog';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PublishVehicleDialog } from '@/components/publish-vehicle-dialog';
import { EditVehicleDialog } from '@/components/edit-vehicle-dialog';
import { LogEventDialog } from '@/components/log-event-dialog';
import { TransferOwnershipDialog } from '@/components/transfer-ownership-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SYSTEM_OWNER_EMAIL = 'apersson508@gmail.com';

export default function PrivateVehicleProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  
  const [isEditAdOpen, setIsEditAdOpen] = useState(false);
  const [isEditInfoOpen, setIsEditInfoOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<VehicleLog | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancellingTransfer, setIsCancellingTransfer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');
  const [isHardDeleting, setIsHardDeleting] = useState(false);

  const appId = firebaseConfig.projectId;
  const plate = id.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  const isAdminContext = searchParams.get('mode') === 'admin';

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isVehicleLoading, setIsVehicleLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Vehicle;
        setVehicle({ ...data, id: snap.id });
      } else if (!isAdminContext) {
        router.push('/dashboard');
      }
      setIsVehicleLoading(false);
    });
    return () => unsub();
  }, [db, plate, appId, router, isAdminContext]);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: profile } = useDoc<UserProfile>(profileRef);

  const isHuvudAdmin = user?.email === SYSTEM_OWNER_EMAIL || profile?.role === 'Huvudadmin';

  const logsRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
  }, [db, plate, appId]);
  const { data: rawLogs } = useCollection<VehicleLog>(logsRef);

  const sortedLogs = useMemo(() => {
    if (!rawLogs) return [];
    return [...rawLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [rawLogs]);

  const overallTrust = useMemo((): TrustLevel => {
    return calculateOverallTrust(rawLogs || []);
  }, [rawLogs]);

  const trustInfo = TRUST_CONFIG[overallTrust];
  
  const isOwner = user?.uid === vehicle?.ownerId;

  const handleCopyLink = () => {
    const url = `${window.location.origin}/v/${plate}/history`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Historiklänk kopierad!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemoveAd = async () => {
    if (!user || !db || !vehicle) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), { 
        isPublished: false, 
        adMainImage: null,
        adImageUrls: null,
        price: null,
        description: null,
        updatedAt: serverTimestamp() 
      });
      batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate), {
        isPublished: false,
        adMainImage: null,
        adImageUrls: null,
        price: null,
        description: null,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      toast({ title: "Annons borttagen och data rensad." });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleCancelOutgoingTransfer = async () => {
    if (!user || !db || !vehicle) return;
    setIsCancellingTransfer(true);
    try {
      const batch = writeBatch(db);
      
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), {
        pendingTransferTo: null,
        pendingTransferFrom: null,
        updatedAt: serverTimestamp()
      });

      batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate), {
        pendingTransferTo: null,
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      toast({ title: "Överlåtelse avbruten", description: "Bilen är inte längre föreslagen till köparen." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally {
      setIsCancellingTransfer(false);
    }
  };

  const handleLogSubmit = async (newLog: Partial<VehicleLog>) => {
    if (!user || !db || !vehicle) return;
    try {
      const batch = writeBatch(db);
      const logData = { 
        ...newLog, 
        vehicleId: plate, 
        licensePlate: plate, 
        creatorId: user.uid, 
        creatorName: user.displayName || 'Ägare', 
        ownerId: vehicle.ownerId, 
        approvalStatus: 'approved',
        updatedAt: serverTimestamp()
      };

      if (editingLog) {
        batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', editingLog.id), logData);
      } else {
        batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs')), { ...logData, createdAt: serverTimestamp() });
      }
      
      // Beräkna ny tillit efter sparning
      const tempLogs = editingLog 
        ? rawLogs?.map(l => l.id === editingLog.id ? { ...l, ...logData } : l)
        : [...(rawLogs || []), { ...logData, createdAt: { toDate: () => new Date() } }];
      const newOverallTrust = calculateOverallTrust(tempLogs as any);

      const vehicleUpdates: any = { 
        updatedAt: serverTimestamp(),
        overallTrust: newOverallTrust 
      };
      
      if (newLog.odometer && newLog.odometer > vehicle.currentOdometerReading) {
        vehicleUpdates.currentOdometerReading = newLog.odometer;
        if (newLog.category === 'Besiktning') {
          vehicleUpdates.inspectionFloorOdometer = newLog.odometer;
        }
      }
      
      const carRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      const privateRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vehicles', plate);
      const listingRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate);

      batch.update(carRef, vehicleUpdates);
      batch.update(privateRef, vehicleUpdates);
      if (vehicle.isPublished) {
        batch.update(listingRef, { overallTrust: newOverallTrust, updatedAt: serverTimestamp() });
      }

      await batch.commit();
      toast({ title: "Historik uppdaterad" });
      setEditingLog(null);
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleApproveLog = async (log: VehicleLog) => {
    if (!db || !user || !vehicle) return;
    try {
      const batch = writeBatch(db);
      const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', log.id);
      const notificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', `${plate}_${log.creatorId}`);
      
      batch.update(logRef, { 
        approvalStatus: 'approved', 
        isVerified: true,
        updatedAt: serverTimestamp() 
      });
      batch.delete(notificationRef);

      // Uppdatera tillit-status efter godkännande
      const updatedLogs = rawLogs?.map(l => l.id === log.id ? { ...l, approvalStatus: 'approved' } : l);
      const newTrust = calculateOverallTrust(updatedLogs as any);
      
      const carRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate);
      batch.update(carRef, { overallTrust: newTrust, updatedAt: serverTimestamp() });
      
      if (vehicle.isPublished) {
        const listingRef = doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate);
        batch.update(listingRef, { overallTrust: newTrust, updatedAt: serverTimestamp() });
      }

      if (log.creatorId) {
        const workshopNotifRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications'));
        batch.set(workshopNotifRef, {
          workshopId: log.creatorId,
          type: 'approval',
          status: 'approved',
          plate: plate,
          vehicleTitle: `${vehicle.make} ${vehicle.model}`,
          ownerName: user.displayName || 'Ägare',
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          read: false,
          logData: {
            ...log,
            approvalStatus: 'approved'
          }
        });
      }
      
      await batch.commit();
      toast({ title: "Service godkänd!", description: "Historiken är nu verifierad." });
    } catch (e: any) { toast({ variant: "destructive", title: "Fel", description: e.message }); }
  };

  const handleRejectLog = async (log: VehicleLog) => {
    if (!db || !user || !vehicle) return;
    try {
      const batch = writeBatch(db);
      const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', log.id);
      const notificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', `${plate}_${log.creatorId}`);
      
      batch.delete(logRef);
      batch.delete(notificationRef);

      if (log.creatorId) {
        const workshopNotifRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications'));
        batch.set(workshopNotifRef, {
          workshopId: log.creatorId,
          type: 'rejection',
          status: 'rejected',
          plate: plate,
          vehicleTitle: `${vehicle.make} ${vehicle.model}`,
          ownerName: user.displayName || 'Ägare',
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          read: false,
          logData: {
            ...log,
            approvalStatus: 'rejected'
          }
        });
      }
      
      await batch.commit();
      toast({ title: "Förslag nekat", description: "Händelsen har raderats." });
    } catch (e: any) { toast({ variant: "destructive", title: "Fel", description: e.message }); }
  };

  const handleDeleteLog = async (log: VehicleLog) => {
    if (!db || !user || !vehicle) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs', log.id));
      
      if (log.creatorId) {
        batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'pending_approvals', `${plate}_${log.creatorId}`));
      }
      
      const notifsRef = collection(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications');
      const qNotifs = query(notifsRef, where('plate', '==', plate));
      const notifsSnap = await getDocs(qNotifs);
      notifsSnap.forEach(d => { if (d.data().logData?.id === log.id) batch.delete(d.ref); });

      // Uppdatera tillit-status efter radering
      const updatedLogs = rawLogs?.filter(l => l.id !== log.id);
      const newTrust = calculateOverallTrust(updatedLogs as any);
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), { overallTrust: newTrust, updatedAt: serverTimestamp() });

      await batch.commit();
      toast({ title: "Historikpost raderad" });
    } catch (e: any) { toast({ variant: "destructive", title: "Kunde inte radera", description: e.message }); }
  };

  const handleDeleteFromGarage = async () => {
    if (!db || !user || !vehicle) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), { 
        ownerId: null, 
        isPublished: false, 
        updatedAt: serverTimestamp(),
        mainImage: null,
        imageUrls: [],
        adMainImage: null,
        adImageUrls: null,
        description: null,
        price: null
      });
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      await batch.commit();
      toast({ title: "Borttagen från garaget och bilderna rensade." });
      router.push('/dashboard');
    } catch (e: any) { toast({ variant: "destructive", title: "Fel", description: e.message }); } 
    finally { setIsDeleting(false); }
  };

  const handleAdminHardDelete = async () => {
    if (!db || !isHuvudAdmin || hardDeleteConfirm !== 'RADERA') return;
    setIsHardDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate));
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      const logsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs'));
      logsSnap.forEach(l => batch.delete(l.ref));
      const approvalsSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'pending_approvals'), where('plate', '==', plate)));
      approvalsSnap.forEach(a => batch.delete(a.ref));
      const workshopNotifsSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'workshop_notifications'), where('plate', '==', plate)));
      workshopNotifsSnap.forEach(wn => batch.delete(wn.ref));
      const convosQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'conversations'), where('carId', '==', plate));
      const convosSnap = await getDocs(convosQ);
      for (const convo of convosSnap.docs) {
        const msgsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'conversations', convo.id, 'messages'));
        msgsSnap.forEach(m => batch.delete(m.ref));
        batch.delete(convo.ref);
      }
      await batch.commit();
      toast({ title: "Fordon och all tillhörande data raderad permanent." });
      router.push('/admin');
    } catch (err: any) { toast({ variant: "destructive", title: "Fel vid hård radering", description: err.message }); } 
    finally { setIsHardDeleting(false); }
  };

  if (isVehicleLoading) return <div className="flex flex-col items-center justify-center min-h-screen"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  if (!vehicle) return (
    <div className="container max-w-4xl mx-auto py-20 text-center space-y-6">
      <h1 className="text-4xl font-headline font-bold text-white">Fordonet hittades inte</h1>
      <p className="text-muted-foreground">Det kan ha raderats av en administratör eller ägare.</p>
      <Button asChild><Link href="/admin">Tillbaka till Admin</Link></Button>
    </div>
  );

  const images = vehicle?.imageUrls && vehicle.imageUrls.length > 0 ? vehicle.imageUrls : [vehicle?.mainImage || "https://picsum.photos/seed/car/800/600"];

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="container max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => router.push(isAdminContext ? '/admin' : '/dashboard')} className="inline-flex items-center text-xs font-bold text-muted-foreground hover:text-white uppercase tracking-widest transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> {isAdminContext ? 'TILL ADMINPANEL' : 'TILL GARAGET'}
          </button>
          <div className="flex items-center gap-3">
            {isOwner && !isAdminContext && <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-1.5 rounded-full uppercase text-[10px] font-black tracking-widest">DIN BIL</Badge>}
            {isAdminContext && <Badge className="bg-accent text-black px-4 py-1.5 rounded-full uppercase text-[10px] font-black tracking-widest animate-pulse">ADMIN-LÄGE</Badge>}
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            <div className="relative rounded-[2.5rem] overflow-hidden glass-card border-none shadow-2xl">
              <Carousel>
                <CarouselContent>
                  {images.map((url, i) => (
                    <CarouselItem key={i}>
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="relative aspect-[16/10] cursor-zoom-in group">
                            <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20"><Maximize2 className="w-10 h-10 text-white" /></div>
                          </div>
                        </DialogTrigger>
                        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/90 border-none rounded-none overflow-hidden">
                          <DialogHeader className="sr-only"><DialogTitle>Bildförstoring</DialogTitle></DialogHeader>
                          <div className="relative w-full h-full flex items-center justify-center p-4"><img src={url} alt="Fullskärmsbild" className="max-w-full max-h-[90vh] object-contain" /></div>
                        </DialogContent>
                      </Dialog>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {images.length > 1 && <><CarouselPrevious className="left-6" /><CarouselNext className="right-6" /></>}
              </Carousel>
              <div className="absolute top-8 left-8 flex flex-col gap-2 pointer-events-none">
                <Badge className={`${trustInfo.bg} ${trustInfo.color} border-none px-6 py-2.5 text-[10px] font-black uppercase rounded-full shadow-xl backdrop-blur-md`}>
                  {trustInfo.emoji} {trustInfo.label}-status
                </Badge>
              </div>
            </div>
            
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
                <div className="space-y-4">
                  <h1 className="text-5xl md:text-7xl font-headline font-bold text-white tracking-tighter">
                    {vehicle.make} <span className="gradient-text">{vehicle.model}</span>
                  </h1>
                  <div className="flex flex-wrap items-center gap-6 mt-6">
                    <span className="flex items-center gap-2.5 font-bold text-sm text-slate-300"><Calendar className="w-5 h-5 text-primary" /> {vehicle.year}</span>
                    <span className="flex items-center gap-2.5 font-bold text-sm text-slate-300"><Gauge className="w-5 h-5 text-accent" /> {vehicle.currentOdometerReading?.toLocaleString()} mil</span>
                  </div>
                </div>
                <div className="text-right"><div className="bg-white text-black font-bold px-8 py-2.5 rounded-2xl text-3xl font-mono shadow-2xl border-2 border-slate-300">{vehicle.licensePlate}</div></div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-2">
                <Card className={`col-span-2 md:col-span-1 ${trustInfo.bg} ${trustInfo.border} border p-5 rounded-[2rem] flex items-center gap-4`}>
                  <div className="text-3xl">{trustInfo.emoji}</div>
                  <div><p className="text-[10px] font-bold uppercase opacity-60 mb-0.5">CarGuard Profil</p><p className={`font-black uppercase tracking-tight ${trustInfo.color}`}>{trustInfo.label}</p></div>
                </Card>
                <Card className="bg-white/5 border-white/5 p-5 rounded-[2rem]"><p className="text-[10px] font-bold uppercase opacity-40 mb-1">Växellåda</p><p className="font-bold text-white">{vehicle.gearbox || 'Automat'}</p></Card>
                <Card className="bg-white/5 border-white/5 p-5 rounded-[2rem]"><p className="text-[10px] font-bold uppercase opacity-40 mb-1">Bränsle</p><p className="font-bold text-white">{vehicle.fuelType || 'Bensin'}</p></Card>
                <Card className="bg-white/5 border-white/5 p-5 rounded-[2rem]"><p className="text-[10px] font-bold uppercase opacity-40 mb-1">Effekt</p><p className="font-bold text-white">{vehicle.hp ? `${vehicle.hp} hk` : '---'}</p></Card>
                <Card className="bg-white/5 border-white/5 p-5 rounded-[2rem]"><p className="text-[10px] font-bold uppercase opacity-40 mb-1">Färg</p><p className="font-bold text-white">{vehicle.color || '---'}</p></Card>
              </div>

              <div className="space-y-8 pt-4">
                <div className="flex items-center justify-between px-4">
                  <h2 className="text-3xl font-headline font-bold flex items-center gap-4 text-white"><HistoryIcon className="text-primary w-8 h-8" /> Händelselogg</h2>
                </div>
                <HistoryList 
                  logs={sortedLogs} 
                  showPrivateData={true} 
                  onDelete={handleDeleteLog}
                  onEdit={(log: VehicleLog) => { setEditingLog(log); setIsLogOpen(true); }}
                  onApprove={handleApproveLog}
                  onReject={handleRejectLog}
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-8">
            <Card className="glass-card sticky top-24 border-white/5 rounded-[3rem] shadow-2xl overflow-hidden p-10 space-y-6">
              <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-center">
                <p className="text-xs font-black text-primary uppercase tracking-widest flex items-center justify-center gap-2"><Award className="w-3 h-3" /> KONTROLLCENTER</p>
              </div>
              <div className="grid gap-3">
                <Button className="w-full h-14 rounded-2xl font-bold" onClick={() => { setEditingLog(null); setIsLogOpen(true); }}><Wrench className="mr-2 w-5 h-5" /> Logga Service</Button>
                {(isOwner || (isAdminContext && isHuvudAdmin)) && (
                  <Button variant="outline" className="w-full h-14 rounded-2xl font-bold" onClick={() => setIsEditInfoOpen(true)}><Settings2 className="mr-2 w-5 h-5" /> Redigera Info</Button>
                )}
                <div className="h-px bg-white/5 my-2" />
                <Button variant="outline" className="w-full h-14 rounded-2xl font-bold border-primary/20 text-primary" onClick={handleCopyLink}>{copied ? <Check className="mr-2 w-5 h-5 text-green-500" /> : <Share2 className="mr-2 w-5 h-5" />} Dela historik</Button>
                <Button variant="outline" className="w-full h-14 rounded-2xl font-bold border-white/10" asChild><Link href={`/v/${plate}/history`}><HistoryIcon className="mr-2 w-5 h-5" /> Se all historik</Link></Button>
                {isAdminContext && isHuvudAdmin && (
                  <>
                    <div className="h-px bg-white/5 my-2" />
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="destructive" className="w-full h-14 rounded-2xl font-bold"><Trash2 className="mr-2 w-5 h-5" /> Hård radering</Button></AlertDialogTrigger>
                      <AlertDialogContent className="glass-card border-white/10 rounded-[2.5rem] p-8">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-2xl font-headline text-destructive flex items-center gap-2"><AlertTriangle className="w-6 h-6" /> Permanent radering</AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-300">Du är i admin-läge. Denna åtgärd raderar fordonet, historiken, bilder och chattrådar permanent ur hela systemet. Detta kan inte ångras.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="py-6 space-y-3">
                          <Label className="text-xs uppercase font-bold opacity-60">Skriv RADERA för att bekräfta</Label>
                          <Input placeholder="RADERA" value={hardDeleteConfirm} onChange={(e) => setHardDeleteConfirm(e.target.value)} className="h-14 text-center font-bold tracking-[0.3em] bg-white/5 border-destructive/20 focus:border-destructive" />
                        </div>
                        <AlertDialogFooter className="gap-3">
                          <AlertDialogCancel className="h-14 rounded-2xl" onClick={() => setHardDeleteConfirm('')}>Avbryt</AlertDialogCancel>
                          <AlertDialogAction onClick={handleAdminHardDelete} disabled={hardDeleteConfirm !== 'RADERA' || isHardDeleting} className="h-14 rounded-2xl bg-destructive">{isHardDeleting ? <Loader2 className="animate-spin" /> : 'Bekräfta hård radering'}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
                {isOwner && !isAdminContext && (
                  <>
                    <div className="h-px bg-white/5 my-2" />
                    {vehicle.isPublished ? (
                      <>
                        <Button variant="outline" className="w-full h-14 rounded-2xl font-bold border-blue-500/20 text-blue-400" onClick={() => setIsEditAdOpen(true)}><Share2 className="mr-2 w-5 h-5" /> Ändra annons</Button>
                        <Button variant="destructive" className="w-full h-14 rounded-2xl font-bold" onClick={handleRemoveAd}><Trash2 className="mr-2 w-5 h-5" /> Ta bort annons</Button>
                        
                        <div className="grid gap-2">
                          <Button className={`w-full h-14 rounded-2xl font-bold ${!!vehicle.pendingTransferTo ? 'bg-orange-600' : 'bg-green-600'} text-white`} onClick={() => setIsTransferOpen(true)}>
                            <KeyRound className="mr-2 w-5 h-5" /> {!!vehicle.pendingTransferTo ? 'Ändra köpare' : 'Överlåt bil'}
                          </Button>
                          
                          {!!vehicle.pendingTransferTo && (
                            <Button 
                              variant="ghost" 
                              className="w-full h-12 rounded-2xl font-bold text-destructive hover:bg-destructive/5"
                              onClick={handleCancelOutgoingTransfer}
                              disabled={isCancellingTransfer}
                            >
                              {isCancellingTransfer ? <Loader2 className="animate-spin mr-2" /> : <Undo2 className="mr-2 w-4 h-4" />} Avbryt överlåtelse
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <Button className="w-full h-14 rounded-2xl font-bold bg-blue-600 hover:bg-blue-500" onClick={() => setIsEditAdOpen(true)}><Share2 className="mr-2 w-5 h-5" /> Sälj bil</Button>
                    )}
                    <Button variant="ghost" className="w-full h-14 rounded-2xl font-bold text-destructive" onClick={() => setIsDeleteDialogOpen(true)}><Trash2 className="mr-2 w-5 h-5" /> Radera från garage</Button>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>

      <LogEventDialog 
        isOpen={isLogOpen} 
        onClose={() => { setIsLogOpen(false); setEditingLog(null); }} 
        onSubmit={handleLogSubmit} 
        currentOdometer={vehicle.currentOdometerReading} 
        inspectionFloor={vehicle.inspectionFloorOdometer}
        initialData={editingLog || undefined} 
      />
      <EditVehicleDialog isOpen={isEditInfoOpen} onClose={() => setIsEditInfoOpen(false)} vehicle={vehicle} />
      <PublishVehicleDialog isOpen={isEditAdOpen} onClose={() => setIsEditAdOpen(false)} vehicle={vehicle} />
      <TransferOwnershipDialog isOpen={isTransferOpen} onClose={() => setIsTransferOpen(false)} vehicle={vehicle} />
      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={isDeleteDialogOpen ? setIsDeleteDialogOpen : undefined}>
        <AlertDialogContent className="glass-card border-white/10 rounded-[2.5rem] p-8">
          <AlertDialogHeader><AlertDialogTitle className="text-2xl font-headline text-white">Ta bort fordonet?</AlertDialogTitle><AlertDialogDescription className="text-slate-300">Bilen tas bort från ditt garage men dess historik sparas permanent för framtida ägare. Alla profilbilder rensas.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="h-14 rounded-2xl">Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFromGarage} disabled={isDeleting} className="h-14 rounded-2xl bg-destructive">Bekräfta radering</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
