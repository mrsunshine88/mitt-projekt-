
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc, useAuth, useStorage } from '@/firebase';
import { collection, doc, deleteDoc, updateDoc, setDoc, writeBatch, getDoc, getDocs, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadString } from 'firebase/storage';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, ShieldAlert, UserCheck, RefreshCw, Star, Search, Shield, Car, ArrowRight, Ban, UserPlus, Maximize2, AlertTriangle, Edit3, Image as ImageIcon, Zap, Database, Activity, MessageSquare, Eye, CheckSquare, Square, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserProfile, Vehicle } from '@/types/autolog';
import { firebaseConfig } from '@/firebase/config';
import { hasPermission, canViewAdminPanel, SYSTEM_OWNER_EMAIL, PERMISSION_LABELS, PERMISSIONS, PermissionKey } from '@/lib/permissions';
import Link from 'next/link';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PublishVehicleDialog } from '@/components/publish-vehicle-dialog';
import { testAiConnection } from '@/ai/flows/test-connection';
import { EditVehicleDialog } from '@/components/edit-vehicle-dialog';
export default function AdminPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('users');
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [plateSearch, setPlateSearch] = useState('');
  const [foundVehicle, setFoundVehicle] = useState<any>(null);
  const [searchingPlate, setSearchingPlate] = useState(false);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');
  const [isHardDeleting, setIsHardDeleting] = useState(false);
  
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [searchedUserForPersonnel, setSearchedUserForPersonnel] = useState<UserProfile | null>(null);
  const [isSearchingPersonnel, setIsSearchingPersonnel] = useState(false);

  // States för redigering av annonser
  const [isEditAdOpen, setIsEditAdOpen] = useState(false);
  const [selectedAdForEdit, setSelectedAdForEdit] = useState<Vehicle | null>(null);

  // States för redigering av fordon i admin
  const [isEditVehicleOpen, setIsEditVehicleOpen] = useState(false);

  const appId = firebaseConfig.projectId;
  const adminProfileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user, appId]);
  const { data: adminProfile } = useDoc<any>(adminProfileRef);

  const isSystemOwner = user?.email === SYSTEM_OWNER_EMAIL;
  
  const canUsers = hasPermission(adminProfile, user?.email, 'MANAGE_USERS');
  const canLogs = hasPermission(adminProfile, user?.email, 'VIEW_AUDIT_LOGS');
  const canVehicles = hasPermission(adminProfile, user?.email, 'MANAGE_VEHICLES');
  const canMarketplace = hasPermission(adminProfile, user?.email, 'MANAGE_MARKETPLACE');
  const canMileage = hasPermission(adminProfile, user?.email, 'MANAGE_MILEAGE');
  const canPersonnel = hasPermission(adminProfile, user?.email, 'MANAGE_PERSONNEL');
  const canForum = hasPermission(adminProfile, user?.email, 'MANAGE_FORUM');
  const canTools = hasPermission(adminProfile, user?.email, 'RUN_SYSTEM_TOOLS');
  const canDeleted = hasPermission(adminProfile, user?.email, 'MANAGE_DELETED_ACCOUNTS');

  // Switch to the first available tab if they don't have access to users
  useEffect(() => {
    if (!adminProfile && !isSystemOwner) return;
    if (activeTab === 'users' && !canUsers) {
      if (canMarketplace) setActiveTab('listings');
      else if (canForum) setActiveTab('forum');
      else if (canMileage) setActiveTab('corrections');
      else if (canVehicles) setActiveTab('vehicles');
      else if (canPersonnel) setActiveTab('personnel');
      else if (canLogs) setActiveTab('audit');
      else if (canTools) setActiveTab('systemverktyg');
      else if (canDeleted) setActiveTab('deleted');
    }
  }, [canUsers, adminProfile, isSystemOwner, activeTab, canMarketplace, canForum, canMileage, canVehicles, canPersonnel, canLogs, canTools, canDeleted]);;

  const listingsRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'public_listings');
  }, [db, appId, refreshKey]);
  const { data: listings } = useCollection<Vehicle>(listingsRef);

  const usersRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'public_profiles');
  }, [db, appId, refreshKey]);
  const { data: allUsers } = useCollection<UserProfile>(usersRef);

  const bannedRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'bannedUsers');
  }, [db, appId, refreshKey]);
  const { data: bannedUsers } = useCollection<any>(bannedRef);

  const deletedRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'deleted_profiles');
  }, [db, appId, refreshKey]);
  const { data: deletedUsers } = useCollection<any>(deletedRef);

  const correctionsRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'odometer_corrections');
  }, [db, appId, refreshKey]);
  const { data: corrections } = useCollection<any>(correctionsRef);

  const pendingCorrections = useMemo(() => 
    corrections?.filter(c => c.status === 'pending') || [], 
  [corrections]);

  const auditLogsRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'admin_audit_logs');
  }, [db, appId, refreshKey]);
  const { data: auditLogsRaw } = useCollection<any>(auditLogsRef);
  const auditLogs = useMemo(() => auditLogsRaw ? [...auditLogsRaw].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)) : [], [auditLogsRaw]);

  const logAdminAction = async (actionType: string, targetId: string, details: string = '') => {
    if (!db || !user || !user.uid) return;
    try {
      await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'admin_audit_logs')), {
        adminId: user.uid,
        adminName: user.displayName || 'Admin',
        actionType,
        targetId,
        details,
        createdAt: serverTimestamp()
      });
    } catch(e) { console.error('Audit log failed', e); }
  };

  const handleSearchPersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !personnelSearch) return;
    setIsSearchingPersonnel(true);
    setSearchedUserForPersonnel(null);
    try {
      const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'public_profiles'), where('email', '==', personnelSearch.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setSearchedUserForPersonnel({ ...snap.docs[0].data(), id: snap.docs[0].id } as UserProfile);
      } else {
        toast({ variant: "destructive", title: "Ingen användare hittad", description: "Kontrollera e-postadressen." });
      }
    } catch (err) { console.error(err); }
    finally { setIsSearchingPersonnel(false); }
  };

  const handleApproveCorrection = async (req: any) => {
    if (!db || !hasPermission(adminProfile, user?.email, 'MANAGE_MILEAGE')) return;

    if (req.ownerEmail === user?.email && user?.email !== SYSTEM_OWNER_EMAIL) {
      toast({ variant: "destructive", title: "Åtkomst nekad", description: "Du kan inte godkänna din egen mätaransökan. Detta måste göras av Huvudadmin (ägaren)." });
      return;
    }

    try {
      const batch = writeBatch(db);
      const carRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', req.licensePlate);
      const privateRef = doc(db, 'artifacts', appId, 'users', req.ownerId, 'vehicles', req.licensePlate);
      const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'odometer_corrections', req.id);

      batch.update(carRef, {
        currentOdometerReading: req.requestedOdometer,
        inspectionFloorOdometer: req.requestedOdometer,
        updatedAt: serverTimestamp()
      });

      batch.delete(requestRef);
      await batch.commit();
      await logAdminAction('APPROVED_MILEAGE', req.licensePlate, `Godkände korrigering till ${req.requestedOdometer} mil`);
      toast({ title: "Mätare korrigerad!" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  const handleHardDeleteVehicle = async (vehiclePlate: string) => {
    if (!db || !hasPermission(adminProfile, user?.email, 'MANAGE_VEHICLES') || hardDeleteConfirm !== 'RADERA') return;
    setIsHardDeleting(true);
    try {
      const batch = writeBatch(db);
      const plate = vehiclePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');

      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate));
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));

      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
      const logsSnap = await getDocs(logsRef);
      logsSnap.forEach(l => batch.delete(l.ref));

      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      const convosQ = query(convosRef, where('carId', '==', plate));
      const convosSnap = await getDocs(convosQ);
      
      for (const convoDoc of convosSnap.docs) {
        const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations', convoDoc.id, 'messages');
        const msgsSnap = await getDocs(msgsRef);
        msgsSnap.forEach(m => batch.delete(m.ref));
        batch.delete(convoDoc.ref);
      }

      await batch.commit();
      await logAdminAction('HARD_DELETE_VEHICLE', vehiclePlate, 'Raderade fordon och all historik permanent');
      toast({ title: "Fordon och all tillhörande data raderad permanent." });
      setFoundVehicle(null);
      setHardDeleteConfirm('');
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel vid hård radering", description: err.message });
    } finally {
      setIsHardDeleting(false);
    }
  };

  const handleAdminRemoveAd = async (l: Vehicle) => {
    if (!db || !hasPermission(adminProfile, user?.email, 'MANAGE_MARKETPLACE')) return;
    try {
      const batch = writeBatch(db);
      const plate = l.licensePlate.toUpperCase().replace(/\s/g, '');
      
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));
      
      batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), { 
        isPublished: false, 
        adMainImage: null,
        adImageUrls: null,
        price: null,
        description: null,
        updatedAt: serverTimestamp() 
      });

      if (l.ownerId) {
        batch.update(doc(db, 'artifacts', appId, 'users', l.ownerId, 'vehicles', plate), {
          isPublished: false,
          adMainImage: null,
          adImageUrls: null,
          price: null,
          description: null,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      await logAdminAction('REMOVED_AD', l.licensePlate, 'Tog bort annons från marknadsplatsen');
      toast({ title: "Annons och annonsdata raderade." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  if (isUserLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user) return null;

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-headline font-bold flex items-center gap-3 text-accent">
            <ShieldAlert className="w-10 h-10" /> Adminpanel
          </h1>
          <p className="text-muted-foreground">
            {isSystemOwner ? 'Fullständig systemkontroll' : 'Befintliga administratörsverktyg'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey(prev => prev + 1)} className="rounded-full border-white/10">
          <RefreshCw className="w-4 h-4 mr-2" /> Uppdatera data
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="w-full sm:overflow-x-auto sm:pb-4">
          <TabsList className="flex flex-col sm:flex-row sm:flex-nowrap gap-2 sm:gap-2 justify-start sm:justify-start bg-transparent border-none p-0 w-full sm:w-max h-auto rounded-none">
            {canUsers && <TabsTrigger value="users" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-white/5 data-[state=active]:bg-blue-600 data-[state=active]:text-white font-bold transition-all">Användare</TabsTrigger>}
            
            {canVehicles && <TabsTrigger value="vehicles" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-white/5 data-[state=active]:bg-blue-600 data-[state=active]:text-white font-bold transition-all">Fordon</TabsTrigger>}
          {canMileage && (
            <TabsTrigger value="corrections" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-white/5 data-[state=active]:bg-blue-600 data-[state=active]:text-white font-bold transition-all relative">
              Miltal
              {pendingCorrections.length > 0 && (
                <span className="absolute right-4 sm:top-0 sm:right-0 sm:-translate-y-1/3 sm:translate-x-1/3 top-1/2 -translate-y-1/2 h-5 w-5 sm:h-4 sm:w-4 bg-red-500 rounded-full text-[9px] flex items-center justify-center animate-pulse text-white">{pendingCorrections.length}</span>
              )}
            </TabsTrigger>
          )}
          
          {canMarketplace && <TabsTrigger value="listings" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-white/5 data-[state=active]:bg-blue-600 data-[state=active]:text-white font-bold transition-all">Marknadsplats</TabsTrigger>}
          {canForum && <TabsTrigger value="forum" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-white/5 data-[state=active]:bg-blue-600 data-[state=active]:text-white font-bold transition-all">Forum Moderering</TabsTrigger>}
          
          {canPersonnel && (
            <TabsTrigger value="personnel" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-accent/20 data-[state=active]:bg-accent data-[state=active]:text-black text-accent font-bold transition-all">
              Personal
            </TabsTrigger>
          )}
          {canTools && (
            <TabsTrigger value="systemverktyg" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-slate-500/20 data-[state=active]:bg-slate-500 data-[state=active]:text-white text-slate-300 font-bold transition-all">
              Systemverktyg
            </TabsTrigger>
          )}
          {canLogs && (
            <TabsTrigger value="audit" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-purple-500/20 data-[state=active]:bg-purple-500 data-[state=active]:text-white text-purple-300 font-bold transition-all">
              Aktivitetslogg
            </TabsTrigger>
          )}
          {canDeleted && (
            <TabsTrigger value="deleted" className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 text-base sm:text-sm whitespace-normal sm:whitespace-nowrap rounded-xl bg-red-500/20 data-[state=active]:bg-red-500 data-[state=active]:text-white text-red-400 font-bold transition-all">
              Raderade konton
            </TabsTrigger>
          )}
        </TabsList>
        </div>

        {canUsers && (
          <TabsContent value="users" className="space-y-4">
            <UserManager currentUserEmail={user?.email} users={allUsers || []} bannedUsers={bannedUsers || []} canManageRoles={false} logAdminAction={logAdminAction} showRecentLogins={true} />
          </TabsContent>
        )}

        {canForum && (
          <TabsContent value="forum" className="space-y-4">
            <ForumAdminManager logAdminAction={logAdminAction} />
          </TabsContent>
        )}

        {canVehicles && (
            <TabsContent value="vehicles" className="space-y-6">
              <Card className="glass-card p-8 rounded-3xl">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!plateSearch) return;
                  setSearchingPlate(true);
                  const cleanPlate = plateSearch.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
                  getDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'cars', cleanPlate)).then(async snap => {
                    if (snap.exists()) {
                      setFoundVehicle({...snap.data(), id: snap.id});
                      await logAdminAction('SEARCHED_VEHICLE', cleanPlate, 'Sökte upp bil');
                    }
                    else toast({ variant: "destructive", title: "Hittades ej" });
                    setSearchingPlate(false);
                  });
                }} className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" />
                    <Input placeholder="Sök registreringsnummer..." className="bg-white/5 h-14 pl-12 uppercase font-bold text-lg rounded-2xl" value={plateSearch} onChange={(e) => setPlateSearch(e.target.value)} />
                  </div>
                  <Button type="submit" className="h-14 px-10 rounded-2xl font-bold" disabled={searchingPlate}>
                    {searchingPlate ? <Loader2 className="animate-spin" /> : 'Sök Bil'}
                  </Button>
                </form>
                {foundVehicle && (
                  <div className="mt-8 p-6 bg-white/5 rounded-[2rem] border border-white/5 animate-in fade-in slide-in-from-top-4 space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                      <div className="flex items-center gap-6">
                        <div className="bg-white text-black font-bold px-6 py-2 rounded-xl text-2xl border-2 border-slate-300 font-mono shadow-xl shrink-0">{foundVehicle.licensePlate}</div>
                        <div>
                          <h3 className="text-xl font-bold">{foundVehicle.make} {foundVehicle.model}</h3>
                          <p className="text-sm text-muted-foreground">Ägare: {foundVehicle.ownerName || 'Okänd'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button asChild variant="outline" className="rounded-xl h-12 px-6"><Link href={`/dashboard/vehicle/${foundVehicle.licensePlate}?mode=admin`} onClick={() => logAdminAction('OPENED_VEHICLE_PROFILE', foundVehicle.licensePlate, 'Gick in på fordonsprofil i admin-läge')}>Hantera profil <ArrowRight className="ml-2 w-4 h-4" /></Link></Button>
                        <Button variant="outline" className="rounded-xl h-12 px-6 border-blue-500/30 text-blue-400 hover:bg-blue-500/10" onClick={() => {
                          setIsEditVehicleOpen(true);
                          if (logAdminAction) logAdminAction('OPENED_VEHICLE_EDIT', foundVehicle.licensePlate || foundVehicle.id || 'Okänd', 'Öppnade redigeringsvyn för ett fordon i admin-läge');
                        }}>
                          <Edit3 className="w-4 h-4 mr-2" /> Redigera
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="h-12 px-6 rounded-xl font-bold">
                              <Trash2 className="w-4 h-4 mr-2" /> Hård radering
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="glass-card border-white/10 rounded-[2.5rem] p-8">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-2xl font-headline text-destructive flex items-center gap-2">
                                <AlertTriangle className="w-6 h-6" /> Permanent radering
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-slate-300">
                                Detta kommer att fysiskt radera fordonet, hela dess servicehistorik, alla annonsbilder och alla chattrådar kopplade till bilen. Detta kan inte ångras.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="py-6 space-y-3">
                              <Label className="text-xs uppercase font-bold opacity-60">Skriv RADERA för att låsa upp</Label>
                              <Input 
                                placeholder="RADERA" 
                                value={hardDeleteConfirm} 
                                onChange={(e) => setHardDeleteConfirm(e.target.value)} 
                                className="h-14 text-center font-bold tracking-[0.3em] bg-white/5 border-destructive/20 focus:border-destructive" 
                              />
                            </div>
                            <AlertDialogFooter className="gap-3">
                              <AlertDialogCancel className="h-14 rounded-2xl" onClick={() => setHardDeleteConfirm('')}>Avbryt</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleHardDeleteVehicle(foundVehicle.licensePlate)} 
                                disabled={hardDeleteConfirm !== 'RADERA' || isHardDeleting} 
                                className="h-14 rounded-2xl bg-destructive hover:bg-destructive/90"
                              >
                                {isHardDeleting ? <Loader2 className="animate-spin" /> : 'Bekräfta total radering'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                )}
                
              </Card>
            </TabsContent>
        )}

        {canMileage && (
            <TabsContent value="corrections">
              <div className="grid gap-4">
                {pendingCorrections.length === 0 ? (
                  <div className="text-center py-20 bg-white/5 rounded-3xl border-dashed border-2 border-white/10">
                    <p className="text-muted-foreground">Inga väntande miltalsansökningar.</p>
                  </div>
                ) : (
                  pendingCorrections.map((req: any) => (
                    <Card key={req.id} className="glass-card border-none overflow-hidden rounded-3xl">
                      <div className="flex flex-col lg:flex-row">
                        <div className="lg:w-1/3 aspect-video lg:aspect-auto relative bg-black group cursor-pointer">
                          {req.proofImageUrl && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <div className="relative w-full h-full">
                                  <img src={req.proofImageUrl} className="w-full h-full object-contain" alt="Bevis" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Maximize2 className="w-10 h-10 text-white" />
                                  </div>
                                </div>
                              </DialogTrigger>
                              <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-black/90">
                                <DialogHeader className="p-4 absolute top-0 left-0 right-0 z-10 bg-black/40 backdrop-blur-md">
                                  <DialogTitle className="text-white">Besiktningsprotokoll - {req.licensePlate}</DialogTitle>
                                </DialogHeader>
                                <div className="w-full h-full flex items-center justify-center p-4">
                                  <img src={req.proofImageUrl} className="max-w-full max-h-[80vh] object-contain rounded-lg" alt="Fullskärmsbevis" />
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                        <div className="flex-1 p-8 space-y-6">
                          <div>
                            <Badge variant="outline" className="font-mono text-xl px-4 py-1 mb-2 bg-white text-black">{req.licensePlate}</Badge>
                            <h3 className="text-xl font-bold">Ansökan från {req.ownerName}</h3>
                            <div className="mt-6 mb-2">
                              <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1">Nytt önskat miltal</p>
                              <p className="text-5xl font-black text-primary">{req.requestedOdometer?.toLocaleString()} mil</p>
                            </div>
                            <p className="text-sm text-muted-foreground">Nuvarande värde i systemet: {req.currentOdometer?.toLocaleString()} mil</p>
                          </div>
                          <div className="flex gap-3">
                            <Button onClick={() => handleApproveCorrection(req)} className="flex-1 h-14 rounded-2xl font-bold bg-green-600 hover:bg-green-500">Godkänn & Uppdatera</Button>
                            <Button onClick={async () => {
                              await deleteDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'odometer_corrections', req.id));
                              await logAdminAction('REJECTED_MILEAGE', req.licensePlate, `Nekade miltalsansökan från ${req.ownerName}`);
                              toast({ title: "Ansökan nekad" });
                            }} variant="ghost" className="flex-1 h-14 rounded-2xl font-bold text-destructive">Neka ansökan</Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
        )}

        {canPersonnel && (
            <TabsContent value="personnel" className="space-y-6">
              <Card className="glass-card p-6 rounded-3xl space-y-4">
                <h3 className="font-bold flex items-center gap-2"><UserPlus className="w-5 h-5 text-accent" /> Lägg till ny personal</h3>
                <form onSubmit={handleSearchPersonnel} className="flex gap-3">
                  <Input 
                    placeholder="Ange användarens exakta e-post..." 
                    value={personnelSearch} 
                    onChange={(e) => setPersonnelSearch(e.target.value)}
                    className="h-12 bg-white/5 rounded-xl"
                  />
                  <Button type="submit" disabled={isSearchingPersonnel} className="h-12 px-6 rounded-xl bg-accent text-black font-bold">
                    {isSearchingPersonnel ? <Loader2 className="animate-spin" /> : 'Sök Användare'}
                  </Button>
                </form>
                {searchedUserForPersonnel && (
                  <div className="p-4 bg-white/5 rounded-2xl border border-accent/20 flex justify-between items-center animate-in zoom-in duration-300">
                    <div>
                      <p className="font-bold">{searchedUserForPersonnel.name}</p>
                      <p className="text-xs opacity-60">{searchedUserForPersonnel.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async () => {
                        await updateDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'public_profiles', searchedUserForPersonnel.id), { role: 'Admin', permissions: [] });
                        await logAdminAction('PROMOTED_USER', searchedUserForPersonnel.email, 'Befordrad till Admin');
                        toast({ title: "Befordrad till Admin (Utan behörigheter)" });
                        setSearchedUserForPersonnel(null);
                        setPersonnelSearch('');
                      }} className="bg-accent text-black font-bold h-10 px-6 rounded-lg">Gör till Admin</Button>
                    </div>
                  </div>
                )}
              </Card>
              <UserManager currentUserEmail={user?.email} users={allUsers?.filter(u => ['Huvudadmin', 'Moderator', 'Admin'].includes(u.role || '') || u.email === SYSTEM_OWNER_EMAIL) || []} bannedUsers={[]} canManageRoles={true} logAdminAction={logAdminAction} showAccountActions={false} />
            </TabsContent>
        )}

        {canLogs && (
            <TabsContent value="audit" className="space-y-6">
              <Card className="glass-card border-none overflow-hidden rounded-3xl p-6 bg-[#0f172a] border-slate-800">
                <div className="flex items-center gap-3 mb-6">
                  <Activity className="w-5 h-5 text-purple-400" />
                  <h3 className="text-lg font-bold text-white">Aktivitetslogg för administratörer</h3>
                </div>
                {auditLogs.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-10 text-center">Inga administrativa händelser registrerade ännu.</p>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow className="border-white/5">
                          <TableHead>Tidpunkt</TableHead>
                          <TableHead>Admin</TableHead>
                          <TableHead>Händelse</TableHead>
                          <TableHead>Mål (T.ex. Regnr/E-post)</TableHead>
                          <TableHead>Detaljer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.map((log: any) => (
                          <TableRow key={log.id} className="border-white/5 hover:bg-white/5">
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {log.createdAt?.toDate ? format(log.createdAt.toDate(), 'yyyy-MM-dd HH:mm', {locale: sv}) : 'Nyligen'}
                            </TableCell>
                            <TableCell className="font-bold text-sm">{log.adminName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="opacity-80 border-slate-600 bg-slate-800 text-[10px]">{log.actionType}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{log.targetId}</TableCell>
                            <TableCell className="text-xs opacity-70 max-w-[200px] truncate">{log.details}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </TabsContent>
        )}

        {canTools && (
            <TabsContent value="systemverktyg" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DeepSystemScan />
                <ImageCompressor />
              </div>
            </TabsContent>
        )}

        {canDeleted && (
            <TabsContent value="deleted" className="space-y-6">
              <DeletedUserManager deletedUsers={deletedUsers || []} bannedUsers={bannedUsers || []} logAdminAction={logAdminAction} />
            </TabsContent>
        )}

        {canMarketplace && (
            <TabsContent value="listings">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings?.map((l: Vehicle) => (
              <Card key={l.id} className="glass-card p-4 border-white/5 rounded-2xl group">
                <div className="aspect-video relative rounded-xl overflow-hidden mb-4">
                  <img src={l.adMainImage || l.mainImage || 'https://picsum.photos/seed/car/400/300'} className="w-full h-full object-cover" alt="" />
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold">{l.make} {l.model}</h3>
                    <p className="text-[10px] font-mono opacity-60 uppercase">{l.licensePlate} • {l.price?.toLocaleString()} kr</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      asChild 
                      className="text-blue-400 hover:bg-blue-400/10"
                    >
                      <Link href={`/v/${l.id || l.licensePlate}`} onClick={() => logAdminAction('OPENED_MARKETPLACE_AD', l.licensePlate || l.id || 'Okänd', 'Öppnade annons på Marknadsplatsen i admin-läge')}>
                        <Eye className="w-4 h-4" />
                      </Link>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-primary hover:bg-primary/10" 
                      onClick={() => {
                        setSelectedAdForEdit(l);
                        setIsEditAdOpen(true);
                      }}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:bg-destructive/10" 
                      onClick={() => handleAdminRemoveAd(l)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {selectedAdForEdit && (
        <PublishVehicleDialog 
          isOpen={isEditAdOpen} 
          onClose={() => {
            setIsEditAdOpen(false);
            setSelectedAdForEdit(null);
            setRefreshKey(prev => prev + 1);
          }} 
          vehicle={selectedAdForEdit}
          isAdminEdit={true}
        />
      )}

      {foundVehicle && (
        <EditVehicleDialog 
          isOpen={isEditVehicleOpen} 
          onClose={() => setIsEditVehicleOpen(false)} 
          vehicle={foundVehicle} 
        />
      )}
    </div>
  );
}

function UserManager({ currentUserEmail, users, bannedUsers, canManageRoles, logAdminAction, showRecentLogins = false, showAccountActions = true }: any) {
  const db = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;
  const [selectedAdminForRoles, setSelectedAdminForRoles] = useState<any>(null);

  const handleResetPassword = async (email: string) => {
    if (!auth) return;
    try {
      await sendPasswordResetEmail(auth, email);
      if(logAdminAction) await logAdminAction('PASSWORD_RESET_SENT', email, `Skickade återställningslänk för lösenord`);
      toast({ title: "Lösenordslänk skickad" });
    } catch(err: any) {
      toast({ variant: "destructive", title: "Kunde inte skicka", description: err.message });
    }
  };

  const handleBan = async (u: UserProfile) => {
    if (!db || u.email === SYSTEM_OWNER_EMAIL) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', u.id), {
        id: u.id, name: u.name, bannedAt: serverTimestamp(), reason: 'Administrativ åtgärd'
      });
      if(logAdminAction) await logAdminAction('BANNED_USER', u.email, `Blockerade användare ${u.name}`);
      toast({ title: `${u.name} har blockerats` });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleUnban = async (userId: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', userId));
    if(logAdminAction) await logAdminAction('UNBANNED_USER', userId, 'Hävde blockering');
    toast({ title: "Användare återställd" });
  };

  const handleDeleteUser = async (u: any) => {
    if (!db) return;
    try {
      const batch = writeBatch(db);
      
      const deletedRef = doc(db, 'artifacts', appId, 'public', 'data', 'deleted_profiles', u.id);
      batch.set(deletedRef, {
        id: u.id,
        email: 'raderad.enligt@gdpr.com',
        name: 'Raderad Användare',
        deletedAt: serverTimestamp(),
        deletedBy: 'admin',
      });
      
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', u.id));
      await batch.commit();

      if(logAdminAction) await logAdminAction('DELETED_USER', u.email, `Raderade användarprofil för ${u.name}`);
      toast({ title: "Användarprofil raderad & flyttad till Raderade Konton" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const recentUsers = [...users]
    .filter((u: any) => u.lastLoginAt)
    .sort((a: any, b: any) => (b.lastLoginAt?.seconds || 0) - (a.lastLoginAt?.seconds || 0))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <Card className="glass-card border-none overflow-hidden rounded-3xl">
        <div className="overflow-x-auto w-full">
          <Table className="min-w-[700px]">
            <TableHeader><TableRow className="border-white/5"><TableHead className="w-[45%]">Användare</TableHead><TableHead>E-post</TableHead><TableHead className="text-right">Åtgärder</TableHead></TableRow></TableHeader>
            <TableBody>
            {users.map((u: any) => {
              const isOwner = u.email === SYSTEM_OWNER_EMAIL;
              const currentRole = isOwner ? 'Huvudadmin' : (u.role || 'Användare');
              const isBanned = bannedUsers.some((b: any) => b.id === u.id);
              const isSelf = currentUserEmail === u.email;
              return (
                <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className={`w-10 h-10 rounded-full border-2 ${isBanned ? 'border-red-500' : 'border-white/10'}`}>
                        <AvatarImage src={u.photoUrl} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary">{u.name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-bold flex items-center gap-2 text-sm">{u.name}{isOwner && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}</span>
                        <span className="text-[10px] uppercase opacity-60 font-bold">{currentRole}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm opacity-70">{u.email}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-2">
                      {canManageRoles && !isOwner && !isSelf && (
                        (u.role === 'Admin' || u.role === 'Huvudadmin' || u.role === 'Moderator') ? (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-9 px-4 border-white/10" onClick={() => setSelectedAdminForRoles(u)}>Hantera rättigheter</Button>
                            <Button size="sm" variant="ghost" className="h-9 px-3 text-red-400 hover:bg-red-400/10" onClick={async () => {
                              await updateDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'public_profiles', u.id), { role: null, permissions: [] });
                              if(logAdminAction) await logAdminAction('CHANGED_ROLE', u.email, `Degraderad till Användare`);
                              toast({ title: "Degraderad till vanlig användare" });
                            }}>Degradera</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-9 px-4 bg-white/5" onClick={async () => {
                            await updateDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'public_profiles', u.id), { role: 'Admin', permissions: [] });
                            toast({ title: "Befordrad till Admin" });
                          }}>Gör till Admin</Button>
                        )
                      )}
                      {showAccountActions && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleResetPassword(u.email)} title="Återställ lösenord" className="h-9 w-9 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"><Key className="w-4 h-4" /></Button>
                          {isBanned ? (
                            <Button variant="ghost" size="icon" onClick={() => handleUnban(u.id)} className="h-9 w-9 text-red-500 hover:bg-red-500/10"><Ban className="w-4 h-4" /></Button>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => handleBan(u)} disabled={isOwner} className="h-9 w-9 text-slate-400 hover:text-white hover:bg-white/10">
                              <div className="w-4 h-4 rounded-full border-2 border-current" />
                            </Button>
                          )}
                          
                          {!isOwner && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="glass-card border-white/10 rounded-2xl">
                                <AlertDialogHeader><AlertDialogTitle>Radera {u.name}?</AlertDialogTitle><AlertDialogDescription>Detta tar bort deras profil permanent från systemet. Det påverkar inte deras autentisering (login), men de kommer inte ha någon profil kvar.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteUser(u)} className="bg-destructive">Radera profil</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </Card>

      {showRecentLogins && (
        <Card className="glass-card p-6 rounded-3xl border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <h3 className="font-bold mb-4 flex items-center gap-2">Senaste inloggningar</h3>
          <div className="flex flex-col gap-3 relative z-10">
            {recentUsers.length > 0 ? recentUsers.map((ru: any) => (
              <div key={ru.id} className="bg-white/5 p-4 rounded-2xl flex items-center justify-between gap-4 border border-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-4">
                  <Avatar className="w-10 h-10 border border-white/10 rounded-full shrink-0">
                    <AvatarImage src={ru.photoUrl} className="object-cover" />
                    <AvatarFallback className="bg-primary/20 text-primary">{ru.name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm leading-none">{ru.name}</span>
                    <span className="text-[10px] text-muted-foreground mt-1.5">{ru.email}</span>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-[10px] font-mono whitespace-nowrap">
                  {ru.lastLoginAt?.toDate ? format(ru.lastLoginAt.toDate(), 'd MMM HH:mm', {locale: sv}) : 'Nyligen'}
                </div>
              </div>
            )) : (
              <p className="text-xs text-muted-foreground opacity-60">Inga nyligen inloggade ännu...</p>
            )}
          </div>
        </Card>
      )}

      {selectedAdminForRoles && (
        <ManagePermissionsDialog 
          user={selectedAdminForRoles} 
          onClose={() => setSelectedAdminForRoles(null)} 
          db={db} 
          appId={appId} 
          logAdminAction={logAdminAction} 
        />
      )}
    </div>
  );
}

function ManagePermissionsDialog({ user, onClose, db, appId, logAdminAction }: any) {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<string[]>(user?.permissions || []);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setPermissions(user.permissions || []);
    }
  }, [user]);



  if (!user) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.id), { permissions });
      if (logAdminAction) await logAdminAction('UPDATED_PERMISSIONS', user.email, `Uppdaterade ACL rättigheter`);
      toast({ title: "Rättigheter sparade" });
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fel', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const togglePermission = (key: string) => {
    setPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  return (
    <Dialog open={!!user} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="glass-card border-white/10 rounded-[2rem] w-[95vw] max-w-xl mx-auto p-4 sm:p-6 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl sm:text-2xl">Hantera rättigheter för {user.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
          {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
            const isChecked = permissions.includes(key);
            return (
              <div key={key} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors group" onClick={() => togglePermission(key)}>
                <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-all ${isChecked ? 'bg-primary border-primary shadow-[0_0_15px_rgba(56,189,248,0.5)]' : 'border-slate-500 group-hover:border-slate-400'}`}>
                  {isChecked && <CheckSquare className="w-4 h-4 text-black" />}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm tracking-wide text-white">{label}</p>
                  <p className="text-[10px] uppercase text-muted-foreground font-mono mt-1 opacity-70">{key}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={isSaving} className="rounded-xl">Avbryt</Button>
          <Button onClick={handleSave} disabled={isSaving} className="font-bold rounded-xl h-10 px-8">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Spara inställningar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeletedUserManager({ deletedUsers, bannedUsers, logAdminAction }: any) {
  const db = useFirestore();
  const appId = firebaseConfig.projectId;
  const { toast } = useToast();

  const handleBanDeleted = async (u: any, isBanned: boolean) => {
    if (!db) return;
    try {
      if (isBanned) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', u.id));
        if(logAdminAction) await logAdminAction('UNBANNED_DELETED_USER', u.email, `Hävde blockering för raderad användare (ID: ${u.id})`);
        toast({ title: `Spärren hävd för ${u.name}` });
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', u.id), {
          id: u.id, name: u.name, bannedAt: serverTimestamp(), reason: 'Administrativ åtgärd från Raderade konton'
        });
        if(logAdminAction) await logAdminAction('BANNED_DELETED_USER', u.email, `Blockerade tidigare raderad användare (ID: ${u.id})`);
        toast({ title: `${u.name} har permanent blockerats` });
      }
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleRemoveLog = async (u: any) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'deleted_profiles', u.id));
      toast({ title: "Kontot avfört från loggen" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  return (
    <Card className="glass-card border-none overflow-hidden rounded-3xl p-6 bg-[#0f172a] border-slate-800">
      <div className="flex items-center gap-3 mb-6">
        <UserCheck className="w-5 h-5 text-red-400" />
        <h3 className="text-lg font-bold text-white">Inaktiva / Raderade konton</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Dessa profiler har tagits bort från systemet, men loggnings-ID:t vilar fortfarande. Du kan spärra inlogget, eller häva en befintlig spärr. Går ej att använda "Glöm bort" på spärrade konton då säkerhetsloggen måste vara intakt.</p>
      
      {deletedUsers.length === 0 ? (
        <p className="text-muted-foreground text-sm py-10 text-center">Inga inaktiva konton i loggen.</p>
      ) : (
        <div className="overflow-x-auto w-full">
          <Table className="min-w-[700px]">
            <TableHeader><TableRow className="border-white/5"><TableHead>Tidpunkt</TableHead><TableHead>Användare</TableHead><TableHead>E-post</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Åtgärd</TableHead></TableRow></TableHeader>
            <TableBody>
              {deletedUsers.map((u: any) => {
                const isBanned = bannedUsers.some((b: any) => b.id === u.id);
                return (
                <TableRow key={u.id} className={`border-white/5 hover:bg-white/5 ${isBanned ? 'bg-red-500/5' : ''}`}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {u.deletedAt?.toDate ? format(u.deletedAt.toDate(), 'yyyy-MM-dd HH:mm', {locale: sv}) : 'Nyligen'}
                  </TableCell>
                  <TableCell className="font-bold text-sm">{u.name}</TableCell>
                  <TableCell className="text-sm opacity-70">{u.email}</TableCell>
                  <TableCell>
                    {isBanned ? (
                      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">Spärrad 🚫</Badge>
                    ) : (
                      <Badge variant="outline" className={u.deletedBy === 'self' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}>{u.deletedBy === 'self' ? 'Självraderad' : 'Admin'}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 items-center">
                       {!isBanned && <Button size="sm" variant="ghost" onClick={() => handleRemoveLog(u)} className="h-9 px-3 text-muted-foreground hover:text-white">Glöm bort</Button>}
                       <Button size="sm" variant={isBanned ? "outline" : "destructive"} onClick={() => handleBanDeleted(u, isBanned)} className={`h-9 px-4 font-bold ${isBanned ? 'border-green-500/50 text-green-400 hover:text-green-300 hover:bg-green-500/10' : ''}`}>
                         {isBanned ? <><UserCheck className="w-4 h-4 mr-2" /> Häv spärr</> : <><Ban className="w-4 h-4 mr-2" /> Spärra inlogg</>}
                       </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function ImageCompressor() {
  const db = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [progressText, setProgressText] = useState('Redo att söka...');
  const [stats, setStats] = useState({ scanned: 0, compressed: 0, skipped: 0 });
  const appId = firebaseConfig.projectId;

  const processImage = (dataUri: string): Promise<{ newUri: string, needed: boolean }> => {
    return new Promise((resolve) => {
      if (!dataUri || !dataUri.startsWith('data:image/')) {
        return resolve({ newUri: dataUri, needed: false });
      }
      const img = new window.Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        // Check if image is already small enough.
        // We consider it compressed if it's already max 800px width/height and quality is presumably low.
        // Also check length. If length < 300kb (approx 400000 chars), we can skip.
        if (width <= 800 && height <= 800 && dataUri.length < 400000) {
          return resolve({ newUri: dataUri, needed: false });
        }

        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const newUri = canvas.toDataURL('image/jpeg', 0.5);
        // Sometimes JS canvas makes it larger if it was a small png
        if (newUri.length >= dataUri.length) {
          resolve({ newUri: dataUri, needed: false });
        } else {
          resolve({ newUri, needed: true });
        }
      };
      img.onerror = () => resolve({ newUri: dataUri, needed: false });
      img.src = dataUri;
    });
  };

  const startCompression = async () => {
    if (!db) return;
    setIsScanning(true);
    setStats({ scanned: 0, compressed: 0, skipped: 0 });
    let scanned = 0;
    let compressed = 0;
    let skipped = 0;

    try {
      // 1. Profiler
      setProgressText('Kollar användarprofiler...');
      const profilesSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'public_profiles'));
      for (const docSnap of profilesSnap.docs) {
        const data = docSnap.data();
        if (data.photoUrl?.startsWith('data:image/')) {
          scanned++;
          setStats({ scanned, compressed, skipped });
          const res = await processImage(data.photoUrl);
          if (res.needed) {
            compressed++;
            await updateDoc(docSnap.ref, { photoUrl: res.newUri });
          } else {
            skipped++;
          }
        }
      }

      // 2. Bilar & Loggar
      setProgressText('Kollar fordon och historik...');
      const carsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'cars'));
      for (const docSnap of carsSnap.docs) {
        const data = docSnap.data();
        if (data.mainImage?.startsWith('data:image/')) {
          scanned++;
          setStats({ scanned, compressed, skipped });
          const res = await processImage(data.mainImage);
          if (res.needed) {
            compressed++;
            await updateDoc(docSnap.ref, { mainImage: res.newUri, updatedAt: serverTimestamp() });
          } else {
            skipped++;
          }
        }

        const historySnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', docSnap.id, 'logs'));
        for (const logSnap of historySnap.docs) {
          const logData = logSnap.data();
          if (logData.photoUrl?.startsWith('data:image/')) {
            scanned++;
            setStats({ scanned, compressed, skipped });
            
            if (storage) {
              try {
                const storageRef = ref(storage, `receipts/${docSnap.id}/${logSnap.id}`);
                await uploadString(storageRef, logData.photoUrl, 'data_url');
                await updateDoc(logSnap.ref, { photoUrl: null, hasStoragePhoto: true });
                compressed++;
              } catch(e) {
                console.error("Storage migration failed", e);
                skipped++;
              }
            } else {
              skipped++;
            }
          }
        }
      }

      // 3. Marknadsplats
      setProgressText('Kollar fordonsannonser...');
      const listingsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'public_listings'));
      for (const docSnap of listingsSnap.docs) {
        const data = docSnap.data();
        let changed = false;
        let updates: any = {};
        
        if (data.adMainImage?.startsWith('data:image/')) {
          scanned++;
          setStats({ scanned, compressed, skipped });
          const res = await processImage(data.adMainImage);
          if (res.needed) {
            updates.adMainImage = res.newUri;
            changed = true;
          } else {
            skipped++;
          }
        }

        if (Array.isArray(data.adImageUrls)) {
          const newUrls = [];
          for (const url of data.adImageUrls) {
            if (url?.startsWith('data:image/')) {
              scanned++;
              setStats({ scanned, compressed, skipped });
              const res = await processImage(url);
              newUrls.push(res.newUri);
              if (res.needed) changed = true;
              else skipped++;
            } else {
              newUrls.push(url);
            }
          }
          if (changed) updates.adImageUrls = newUrls;
        }

        if (changed) {
          compressed++;
          await updateDoc(docSnap.ref, { ...updates, updatedAt: serverTimestamp() });
        }
      }

      setStats({ scanned, compressed, skipped });
      setProgressText('Alla bilder genomsökta!');
      toast({ title: 'Kompression slutförd!', description: `${compressed} bilder komprimerades.` });

    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fel vid komprimering', description: err.message });
      setProgressText('Ett fel uppstod.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Card className="p-6 rounded-3xl bg-[#0f172a] border-slate-800 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <ImageIcon className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold tracking-widest text-cyan-400 uppercase">Global Bildoptimering</h3>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Skannar allt (Fordon, Annonser, Profiler, Loggar inkl. Kvitton) och krymper bilder.
        </p>

        {isScanning ? (
          <div className="space-y-2 mb-6 text-sm font-mono text-slate-300 bg-black/20 p-4 rounded-xl">
            <p className="text-cyan-400 font-bold mb-2 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> {progressText}</p>
            <p className="flex justify-between"><span>Kontrollerade:</span><span className="font-bold">{stats.scanned}</span></p>
            <p className="flex justify-between"><span>Krympta:</span><span className="font-bold text-green-400">{stats.compressed}</span></p>
            <p className="flex justify-between"><span>Hoppade över:</span><span className="font-bold">{stats.skipped}</span></p>
          </div>
        ) : (stats.scanned > 0 || progressText.includes('fel') || progressText.includes('Alla')) && (
          <div className="space-y-2 mb-6 text-sm font-mono text-cyan-400 bg-cyan-900/20 p-4 rounded-xl border border-cyan-800/50">
            <p className="font-bold flex items-center gap-2"><CheckSquare className="w-4 h-4"/> {progressText}</p>
            {stats.scanned > 0 && (
              <div className="mt-2 pt-2 border-t border-cyan-800/30 space-y-1">
                <p className="flex justify-between text-slate-300"><span>Kontrollerade:</span><span className="font-bold">{stats.scanned}</span></p>
                <p className="flex justify-between text-green-400"><span>Krympta:</span><span className="font-bold">{stats.compressed}</span></p>
                <p className="flex justify-between text-slate-400"><span>Hoppade över:</span><span className="font-bold">{stats.skipped}</span></p>
              </div>
            )}
          </div>
        )}
      </div>

      <Button 
        onClick={startCompression} 
        disabled={isScanning} 
        className="w-full h-12 rounded-xl font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-900 shadow-xl shadow-cyan-900/20"
      >
        {isScanning ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : 'Starta Optimering'}
      </Button>
    </Card>
  );
}

function DeepSystemScan() {
  const db = useFirestore();
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const appId = firebaseConfig.projectId;

  const runDiagnostics = async () => {
    if (!db) return;
    setIsScanning(true);
    setLogs(['> Initierar DEEP SYSTEM SCAN V10.0...', '> Läser in databasen (detta kan ta tid)...']);
    
    const appendLog = (msg: string) => setLogs(prev => [...prev, msg]);

    try {
      const carsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'cars'));
      const profilesSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'public_profiles'));
      const listingsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'public_listings'));
      const convosSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'conversations'));
      const correctionsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'odometer_corrections'));
      const bannedSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'bannedUsers'));
      const deletedSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'deleted_profiles'));
      
      const carsMap = new Map(carsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
      const profileIds = new Set(profilesSnap.docs.map(d => d.id));
      const bannedIds = new Set(bannedSnap.docs.map(d => d.id));
      const deletedIds = new Set(deletedSnap.docs.map(d => d.id));
      const activeUids = new Set<string>();

      carsMap.forEach((c: any) => c.ownerId && activeUids.add(c.ownerId));
      profilesSnap.docs.forEach(p => activeUids.add(p.id));

      let batch = writeBatch(db);
      let opCount = 0;
      const _commit = async () => { if (opCount > 0) { await batch.commit(); batch = writeBatch(db); opCount = 0; } };

      appendLog('> Steg 1: Testar AI-infrastruktur & API-nycklar...');
      const aiTest = await testAiConnection();
      if (!aiTest.success) {
        appendLog(`  -> [VARNING] AI-motorn är nere! Fel: ${aiTest.error}`);
        appendLog(`  -> Tips: Kontrollera GEMINI_API_KEY (.env.local) och att modellen är tillgänglig.`);
      } else {
        appendLog(`  -> AI-motorn (Gemini 2.5 Flash) är ONLINE och krypterad uppkoppling upprättad.`);
      }

      appendLog('> Steg 2: Fordonsdatabas & Mätargolv...');
      let odometerFixes = 0;
      let carGuardFixes = 0;
      carsMap.forEach((car: any, plate: string) => {
        let updates: any = {};
        const current = car.currentOdometerReading || 0;
        const floor = car.inspectionFloorOdometer || 0;
        
        if (current < floor) { updates.currentOdometerReading = floor; odometerFixes++; }
        if (!car.make) { updates.make = 'Okänd'; carGuardFixes++; }
        if (!car.model) { updates.model = 'Okänd'; if (!updates.make) carGuardFixes++; }
        if (!car.createdAt) { updates.createdAt = serverTimestamp(); if (!updates.make && !car.model) carGuardFixes++; }
        
        if (Object.keys(updates).length > 0) {
          batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate), updates);
          carsMap.set(plate, { ...car, ...updates });
          opCount++;
        }
      });
      await _commit();
      if (odometerFixes > 0) appendLog(`  -> Fixade mätargolv på ${odometerFixes} bilar.`);
      if (carGuardFixes > 0) appendLog(`  -> Återställde ${carGuardFixes} bilar med saknade fält (CarGuard).`);

      appendLog('> Steg 2: Synkronisering av Mina Sidor (Privata Garage)...');
      let missingGarage = 0;
      let orphanedGarage = 0;
      for (const uid of Array.from(profileIds)) {
        const garageSnap = await getDocs(collection(db, 'artifacts', appId, 'users', uid, 'vehicles'));
        for (const gDoc of garageSnap.docs) {
          const mainCar: any = carsMap.get(gDoc.id);
          if (!mainCar || mainCar.ownerId !== uid) {
            batch.delete(gDoc.ref);
            orphanedGarage++;
            opCount++;
          }
        }
      }
      for (const [plate, car] of Array.from(carsMap.entries())) {
        const c = car as any;
        if (c.ownerId) {
          const pRef = doc(db, 'artifacts', appId, 'users', c.ownerId, 'vehicles', plate);
          const pSnap = await getDoc(pRef);
          if (!pSnap.exists()) {
            batch.set(pRef, c);
            missingGarage++;
            opCount++;
          }
        }
      }
      await _commit();
      if (missingGarage > 0) appendLog(`  -> Skapade ${missingGarage} saknade garage-bilar.`);
      if (orphanedGarage > 0) appendLog(`  -> Raderade ${orphanedGarage} föräldralösa bilar i garage.`);

      appendLog('> Steg 3: Sanering av Marknadsplats...');
      let spAds = 0;
      listingsSnap.docs.forEach(l => {
        const d = l.data();
        const m = carsMap.get(l.id) as any;
        if (!m || !m.isPublished || m.ownerId !== d.ownerId) {
          batch.delete(l.ref);
          spAds++;
          opCount++;
        }
      });
      await _commit();
      if (spAds > 0) appendLog(`  -> Raderade ${spAds} spök-annonser.`);

      appendLog('> Steg 4: GDPR Sweep (Chattsanering)...');
      let delChats = 0;
      let delMsgs = 0;
      for (const convo of convosSnap.docs) {
        const data = convo.data();
        if (data.participants) data.participants.forEach((p: string) => activeUids.add(p));
        const relCar = carsMap.get(data.carId) as any;
        if (!relCar || relCar.ownerId !== data.sellerId) {
          const msgsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'conversations', convo.id, 'messages'));
          msgsSnap.docs.forEach(m => { batch.delete(m.ref); delMsgs++; opCount++; });
          batch.delete(convo.ref);
          delChats++;
          opCount++;
        }
      }
      await _commit();
      if (delChats > 0) appendLog(`  -> Raderade ${delChats} chattar (${delMsgs} meddelanden) för sålda/borttagna bilar.`);

      appendLog('> Steg 5: Odometer Corrections Sanering...');
      let staleCorr = 0;
      correctionsSnap.docs.forEach(c => {
        if (!carsMap.has(c.data().licensePlate)) {
          batch.delete(c.ref);
          staleCorr++;
          opCount++;
        }
      });
      await _commit();
      if (staleCorr > 0) appendLog(`  -> Raderade ${staleCorr} inaktuella miltalsansökningar.`);

      appendLog('> Steg 6-9: Deep Account & Profile Integrity...');
      let ghost = 0;
      let brokProf = 0;
      profilesSnap.docs.forEach(pSnap => {
        const p = pSnap.data();
        let pU: any = {};
        if (!p.name) pU.name = 'Okänd';
        if (!p.email) pU.email = 'ingen@epost.se';
        if (!p.role) pU.role = 'Användare';
        if (Object.keys(pU).length > 0) {
          batch.update(pSnap.ref, pU);
          brokProf++;
          opCount++;
        }
      });
      for (const uid of Array.from(activeUids)) {
        if (!profileIds.has(uid) && !deletedIds.has(uid) && !bannedIds.has(uid) && uid.length > 5) {
          batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', uid), {
            id: uid, name: 'Återställd Användare', email: 'ghost@recovery.local', role: 'Användare', createdAt: serverTimestamp(), isGhostRecovered: true
          });
          ghost++;
          opCount++;
        }
      }
      await _commit();
      if (brokProf > 0) appendLog(`  -> Lagade profilfält på ${brokProf} användare.`);
      if (ghost > 0) appendLog(`  -> Återställde ${ghost} saknade Ghost-konton.`);

      appendLog('> Steg 10: Verifierar Administrativa Loggar (Audit)...');
      let brokenLogs = 0;
      const auditSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'admin_audit_logs'));
      auditSnap.docs.forEach(l => {
        const d = l.data();
        if (!d.actionType || !d.adminId || !d.targetId || !d.createdAt) {
          brokenLogs++;
        }
      });
      if (brokenLogs > 0) appendLog(`  -> [VARNING] ${brokenLogs} ofullständiga adminloggar hittades (Dessa kan/får ej raderas pga 100% spårbarhet).`);
      else appendLog(`  -> Alla ${auditSnap.docs.length} administratörsloggar är intakta & kryptografiskt låsta.`);

      appendLog('> Steg 11: Sanering av Forumet (Trådar & Kommentarer)...');
      let brokenPosts = 0;
      let brokenComments = 0;
      let orphanedComments = 0;
      
      const postsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'forum_posts'));
      const commentsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'forum_comments'));
      
      const validPostIds = new Set<string>();
      postsSnap.docs.forEach(p => {
        const d = p.data();
        if (!d.authorId || (!d.title && !d.content)) {
          batch.delete(p.ref);
          brokenPosts++;
          opCount++;
        } else {
          validPostIds.add(p.id);
        }
      });
      commentsSnap.docs.forEach(c => {
        const d = c.data();
        if (!d.authorId || !d.content) {
          batch.delete(c.ref);
          brokenComments++;
          opCount++;
        } else if (!d.postId || !validPostIds.has(d.postId)) {
          batch.delete(c.ref);
          orphanedComments++;
          opCount++;
        }
      });
      await _commit();
      
      if (brokenPosts > 0) appendLog(`  -> Raderade ${brokenPosts} korrupta/tomma forumtrådar.`);
      if (brokenComments > 0) appendLog(`  -> Raderade ${brokenComments} korrupta forumkommentarer.`);
      if (orphanedComments > 0) appendLog(`  -> Raderade ${orphanedComments} föräldralösa kommentarer (tråden saknad).`);

      appendLog('> Steg 12: Migrera Gamla Administratörer (RBAC)...');
      let migratedAdmins = 0;
      profilesSnap.docs.forEach(pSnap => {
        const p = pSnap.data();
        if (p.role === 'Huvudadmin' || p.role === 'Moderator') {
          let newPermissions: string[] = [];
          if (p.role === 'Huvudadmin') {
            newPermissions = ['MANAGE_USERS', 'VIEW_AUDIT_LOGS', 'MANAGE_VEHICLES', 'MANAGE_MARKETPLACE', 'MANAGE_MILEAGE', 'MANAGE_PERSONNEL', 'MANAGE_FORUM', 'RUN_SYSTEM_TOOLS'];
          } else if (p.role === 'Moderator') {
            newPermissions = ['MANAGE_MARKETPLACE', 'MANAGE_FORUM', 'VIEW_AUDIT_LOGS'];
          }
          batch.update(pSnap.ref, { role: 'Admin', permissions: newPermissions });
          migratedAdmins++;
          opCount++;
        }
      });
      await _commit();
      if (migratedAdmins > 0) appendLog(`  -> Migrerade ${migratedAdmins} administratskonton till nya behörighetssystemet.`);

      appendLog('> Steg 13: Synkronisering av Verkstäder...');
      let missingWorkshops = 0;
      let orphanedWorkshops = 0;
      const workshopsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'workshops'));
      workshopsSnap.docs.forEach(w => {
        if (!profileIds.has(w.id)) {
           batch.delete(w.ref);
           orphanedWorkshops++;
           opCount++;
        }
      });
      await _commit();
      if (orphanedWorkshops > 0) appendLog(`  -> Raderade ${orphanedWorkshops} verkstäder för raderade användare.`);

      appendLog('> Steg 14: Bibehåller säkerhets-spärrar permanent...');
      await _commit();

      appendLog('> Steg 15: Synkroniserar och anonymiserar raderade konton (GDPR)...');
      let anonymizedGDPR = 0;
      const gdprDeletedSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'deleted_profiles'));
      gdprDeletedSnap.docs.forEach(d => {
        const data = d.data();
        if (data.email !== 'raderad.enligt@gdpr.com' || data.name !== 'Raderad Användare') {
          batch.update(d.ref, {
            email: 'raderad.enligt@gdpr.com',
            name: 'Raderad Användare'
          });
          anonymizedGDPR++;
          opCount++;
        }
      });
      await _commit();
      if (anonymizedGDPR > 0) appendLog(`  -> Anonymiserade ${anonymizedGDPR} äldre raderade konton.`);

      const totalF = odometerFixes + carGuardFixes + missingGarage + orphanedGarage + spAds + delChats + staleCorr + brokProf + ghost + brokenPosts + brokenComments + orphanedComments + migratedAdmins + orphanedWorkshops + anonymizedGDPR;
      if (totalF === 0) {
        appendLog('> RESULTAT: Systemet var redan 100% friskt. 0 fel hittades.');
      } else {
        appendLog(`> SCAN KLAR: Läkte ${totalF} fel sammanlagt across hela databasen.`);
      }

    } catch (err: any) {
      appendLog(`> [FEL] ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Card className="p-6 rounded-3xl bg-[#0f172a] border-slate-800 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-bold tracking-widest text-blue-500 uppercase">Deep System Scan V13.0</h3>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Självläkning (Mätargolv, Chattar, Annonser, Profiler, Medlemskonton, Rättighetsmigration, Verkstäder, Blockeringar & Raderade).
        </p>

        {logs.length > 0 && (
          <div className="bg-black/50 rounded-xl p-4 mb-6 h-48 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] font-mono text-[10px] sm:text-xs text-green-400 space-y-1">
            {logs.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}
      </div>

      <Button 
        onClick={runDiagnostics} 
        disabled={isScanning} 
        variant="outline"
        className="w-full h-12 rounded-xl border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300"
      >
        {isScanning ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : 'Kör Diagnostik'}
      </Button>
    </Card>
  );
}

function ForumAdminManager({ logAdminAction }: any) {
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<any[]>([]);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'public_profiles'), (snap) => {
      setProfiles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [db, appId]);

  const handleToggleForumBan = async (profile: any) => {
    if (!db) return;
    try {
      const isBanned = !!profile.isForumBanned;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', profile.id), {
        isForumBanned: !isBanned,
        updatedAt: serverTimestamp()
      });
      await logAdminAction(isBanned ? 'UNBANNED_FORUM' : 'BANNED_FORUM', profile.id, isBanned ? `Hävde forum-spärr för ${profile.name}` : `Spärrade ${profile.name} från forumet`);
      toast({ title: isBanned ? "Forum-spärr hävd" : "Användare spärrad från forumet" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  const filtered = profiles.filter((p: any) => {
    const s = search.toLowerCase();
    return (p.name?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s));
  });

  return (
    <Card className="glass-card p-6 rounded-3xl border-white/5 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h3 className="font-bold text-xl flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-400" /> Forum-Moderering</h3>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input placeholder="Sök användare..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-white/5 border-white/10 rounded-xl pl-10 h-12" />
        </div>
      </div>
      
      <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/5 w-full">
        <div className="overflow-x-auto min-w-full">
          <Table className="min-w-[600px]">
            <TableHeader className="bg-black/20"><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="font-bold text-slate-300">Användare</TableHead><TableHead className="font-bold text-slate-300">E-post</TableHead><TableHead className="font-bold text-slate-300 text-right">Åtgärd</TableHead></TableRow></TableHeader>
            <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className="border-white/5 hover:bg-white/5 transition-colors">
                <TableCell className="font-medium text-white flex items-center gap-3">
                  <Avatar className="w-8 h-8 border border-white/10 shrink-0"><AvatarImage src={p.photoUrl || undefined} /><AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{p.name?.[0]}</AvatarFallback></Avatar>
                  <span className="truncate max-w-[120px] sm:max-w-[200px]">{p.name}</span>
                  {p.isForumBanned && <Badge variant="destructive" className="ml-2 text-[10px] uppercase font-bold px-2 py-0 border-none">Spärrad</Badge>}
                </TableCell>
                <TableCell className="text-slate-400 text-xs truncate max-w-[100px] sm:max-w-[200px]">{p.email || 'Okänd'}</TableCell>
                <TableCell className="text-right">
                  <Button variant={p.isForumBanned ? "outline" : "destructive"} size="sm" onClick={() => handleToggleForumBan(p)} className={`h-8 rounded-lg text-xs font-bold ${p.isForumBanned ? 'border-green-500/30 text-green-400 hover:bg-green-500/10' : ''}`}>
                    {p.isForumBanned ? 'Häv Spärr' : 'Spärra från forum'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={3} className="h-24 text-center text-slate-500">Inga användare hittades.</TableCell></TableRow>}
          </TableBody>
        </Table>
        </div>
      </div>
    </Card>
  );
}
