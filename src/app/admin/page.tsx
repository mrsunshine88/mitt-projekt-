
"use client";

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, deleteDoc, updateDoc, setDoc, writeBatch, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, ShieldAlert, UserCheck, RefreshCw, Star, Search, Shield, Car, ArrowRight, Ban, UserPlus, Maximize2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserProfile, Vehicle } from '@/types/autolog';
import { firebaseConfig } from '@/firebase/config';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const SYSTEM_OWNER_EMAIL = 'apersson508@gmail.com';

export default function AdminPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('users');
  const [refreshKey, setRefreshKey] = useState(0);
  
  // States för sök
  const [plateSearch, setPlateSearch] = useState('');
  const [foundVehicle, setFoundVehicle] = useState<any>(null);
  const [searchingPlate, setSearchingPlate] = useState(false);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');
  const [isHardDeleting, setIsHardDeleting] = useState(false);
  
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [searchedUserForPersonnel, setSearchedUserForPersonnel] = useState<UserProfile | null>(null);
  const [isSearchingPersonnel, setIsSearchingPersonnel] = useState(false);

  const appId = firebaseConfig.projectId;

  // Hämta inloggad admins profil
  const adminProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', user.uid);
  }, [db, user?.uid, appId]);
  const { data: adminProfile } = useDoc<UserProfile>(adminProfileRef);

  const isSystemOwner = user?.email === SYSTEM_OWNER_EMAIL;
  const isHuvudAdmin = isSystemOwner || adminProfile?.role === 'Huvudadmin';

  // Hämta data
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

  const correctionsRef = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'odometer_corrections');
  }, [db, appId, refreshKey]);
  const { data: corrections } = useCollection<any>(correctionsRef);

  const pendingCorrections = useMemo(() => 
    corrections?.filter(c => c.status === 'pending') || [], 
  [corrections]);

  // Funktioner
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
    if (!db || !isHuvudAdmin) return;
    try {
      const batch = writeBatch(db);
      const carRef = doc(db, 'artifacts', appId, 'public', 'data', 'cars', req.licensePlate);
      const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'odometer_corrections', req.id);

      batch.update(carRef, {
        currentOdometerReading: req.requestedOdometer,
        inspectionFloorOdometer: req.requestedOdometer,
        updatedAt: serverTimestamp()
      });

      batch.delete(requestRef);
      await batch.commit();
      toast({ title: "Mätare korrigerad!" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  const handleHardDeleteVehicle = async (vehiclePlate: string) => {
    if (!db || !isHuvudAdmin || hardDeleteConfirm !== 'RADERA') return;
    setIsHardDeleting(true);
    try {
      const batch = writeBatch(db);
      const plate = vehiclePlate.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');

      // 1. Radera bilen från globala registret
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'cars', plate));

      // 2. Radera annonsen
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_listings', plate));

      // 3. Radera historikposter
      const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicleHistory', plate, 'logs');
      const logsSnap = await getDocs(logsRef);
      logsSnap.forEach(l => batch.delete(l.ref));

      // 4. Radera konversationer kopplade till bilen
      const convosRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations');
      const convosQ = query(convosRef, where('carId', '==', plate));
      const convosSnap = await getDocs(convosQ);
      
      for (const convoDoc of convosSnap.docs) {
        // Radera alla meddelanden i konversationen
        const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'conversations', convoDoc.id, 'messages');
        const msgsSnap = await getDocs(msgsRef);
        msgsSnap.forEach(m => batch.delete(m.ref));
        
        // Radera själva konversationen
        batch.delete(convoDoc.ref);
      }

      await batch.commit();
      toast({ title: "Fordon och all tillhörande data raderad permanent." });
      setFoundVehicle(null);
      setHardDeleteConfirm('');
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel vid hård radering", description: err.message });
    } finally {
      setIsHardDeleting(false);
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
            {isHuvudAdmin ? 'Fullständig systemkontroll' : 'Moderering av användare och annonser'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey(prev => prev + 1)} className="rounded-full border-white/10">
          <RefreshCw className="w-4 h-4 mr-2" /> Uppdatera data
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white/5 border border-white/10 p-1 flex w-full rounded-2xl overflow-x-auto">
          <TabsTrigger value="users" className="flex-1 rounded-xl">Användare</TabsTrigger>
          {isHuvudAdmin && (
            <>
              <TabsTrigger value="vehicles" className="flex-1 rounded-xl">Fordon</TabsTrigger>
              <TabsTrigger value="corrections" className="flex-1 rounded-xl relative">
                Miltal
                {pendingCorrections.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold animate-pulse">{pendingCorrections.length}</span>
                )}
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="listings" className="flex-1 rounded-xl">Marknadsplats</TabsTrigger>
          {isHuvudAdmin && (
            <TabsTrigger value="personnel" className="flex-1 rounded-xl bg-accent/10 data-[state=active]:bg-accent data-[state=active]:text-black font-bold">
              Personal
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <UserManager users={allUsers || []} bannedUsers={bannedUsers || []} canManageRoles={false} />
        </TabsContent>

        {isHuvudAdmin && (
          <>
            <TabsContent value="vehicles" className="space-y-6">
              <Card className="glass-card p-8 rounded-3xl">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!plateSearch) return;
                  setSearchingPlate(true);
                  const cleanPlate = plateSearch.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
                  getDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'cars', cleanPlate)).then(snap => {
                    if (snap.exists()) setFoundVehicle({...snap.data(), id: snap.id});
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
                      <div className="flex gap-3">
                        <Button asChild variant="outline" className="rounded-xl h-12 px-6"><Link href={`/dashboard/vehicle/${foundVehicle.licensePlate}?mode=admin`}>Hantera profil <ArrowRight className="ml-2 w-4 h-4" /></Link></Button>
                        
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
                                className="h-14 text-center font-bold tracking-[0.3em] bg-white/5 rounded-xl border-destructive/20 focus:border-destructive" 
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
                            <p className="text-3xl font-black text-primary mt-4">{req.requestedOdometer?.toLocaleString()} mil</p>
                            <p className="text-sm text-muted-foreground">Nuvarande värde i systemet: {req.currentOdometer?.toLocaleString()} mil</p>
                          </div>
                          <div className="flex gap-3">
                            <Button onClick={() => handleApproveCorrection(req)} className="flex-1 h-14 rounded-2xl font-bold bg-green-600 hover:bg-green-500">Godkänn & Uppdatera</Button>
                            <Button onClick={async () => {
                              await deleteDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'odometer_corrections', req.id));
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
                        await updateDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'public_profiles', searchedUserForPersonnel.id), { role: 'Moderator' });
                        toast({ title: "Befordrad till Moderator" });
                        setSearchedUserForPersonnel(null);
                        setPersonnelSearch('');
                      }} className="bg-blue-600 font-bold h-10 px-4 rounded-lg">Gör till Moderator</Button>
                      <Button size="sm" onClick={async () => {
                        await updateDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'public_profiles', searchedUserForPersonnel.id), { role: 'Huvudadmin' });
                        toast({ title: "Befordrad till Huvudadmin" });
                        setSearchedUserForPersonnel(null);
                        setPersonnelSearch('');
                      }} className="bg-accent text-black font-bold h-10 px-4 rounded-lg">Gör till Huvudadmin</Button>
                    </div>
                  </div>
                )}
              </Card>
              <UserManager users={allUsers?.filter(u => ['Huvudadmin', 'Moderator'].includes(u.role || '') || u.email === SYSTEM_OWNER_EMAIL) || []} bannedUsers={[]} canManageRoles={true} />
            </TabsContent>
          </>
        )}

        <TabsContent value="listings">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings?.map((l: Vehicle) => (
              <Card key={l.id} className="glass-card p-4 border-white/5 rounded-2xl group">
                <div className="aspect-video relative rounded-xl overflow-hidden mb-4">
                  <img src={l.mainImage || 'https://picsum.photos/seed/car/400/300'} className="w-full h-full object-cover" alt="" />
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold">{l.make} {l.model}</h3>
                    <p className="text-[10px] font-mono opacity-60 uppercase">{l.licensePlate} • {l.price?.toLocaleString()} kr</p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={async () => {
                    await deleteDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'public_listings', l.id));
                    toast({ title: "Annons raderad" });
                  }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserManager({ users, bannedUsers, canManageRoles }: any) {
  const db = useFirestore();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const handleBan = async (u: UserProfile) => {
    if (!db || u.email === SYSTEM_OWNER_EMAIL) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', u.id), {
        id: u.id, name: u.name, bannedAt: serverTimestamp(), reason: 'Administrativ åtgärd'
      });
      toast({ title: `${u.name} har blockerats` });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleUnban = async (userId: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', userId));
    toast({ title: "Användare återställd" });
  };

  const handleDeleteUser = async (userId: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', userId));
      toast({ title: "Användarprofil raderad från systemet" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  return (
    <Card className="glass-card border-none overflow-x-auto rounded-3xl">
      <Table>
        <TableHeader><TableRow className="border-white/5"><TableHead>Användare</TableHead><TableHead>E-post</TableHead><TableHead className="text-right">Åtgärder</TableHead></TableRow></TableHeader>
        <TableBody>
          {users.map((u: any) => {
            const isOwner = u.email === SYSTEM_OWNER_EMAIL;
            const currentRole = isOwner ? 'Huvudadmin' : (u.role || 'Användare');
            const isBanned = bannedUsers.some((b: any) => b.id === u.id);
            return (
              <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold flex items-center gap-2">{u.name}{isOwner && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}</span>
                    <span className="text-[10px] uppercase opacity-60 font-bold">{currentRole}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm opacity-70">{u.email}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {canManageRoles && !isOwner && (
                      <Select onValueChange={async (v) => {
                        await updateDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'public_profiles', u.id), { role: v === 'Användare' ? null : v });
                        toast({ title: "Roll uppdaterad" });
                      }} defaultValue={currentRole}>
                        <SelectTrigger className="w-[140px] h-9 bg-white/5 rounded-lg border-white/5"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="Huvudadmin">Huvudadmin</SelectItem><SelectItem value="Moderator">Moderator</SelectItem><SelectItem value="Användare">Användare</SelectItem></SelectContent>
                      </Select>
                    )}
                    {isBanned ? (
                      <Button variant="ghost" size="icon" onClick={() => handleUnban(u.id)} className="h-9 w-9 text-green-500 hover:bg-green-500/10"><UserCheck className="w-4 h-4" /></Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => handleBan(u)} disabled={isOwner} className="h-9 w-9 text-destructive hover:bg-destructive/10"><Ban className="w-4 h-4" /></Button>
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
                            <AlertDialogAction onClick={() => handleDeleteUser(u.id)} className="bg-destructive">Radera profil</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
