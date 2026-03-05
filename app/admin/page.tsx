
"use client";

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc, updateDoc, setDoc, writeBatch, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, ShieldAlert, UserX, UserCheck, RefreshCw, Star, Search, Edit3, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserProfile, Vehicle } from '@/types/autolog';
import { firebaseConfig } from '@/firebase/config';
import { PublishVehicleDialog } from '@/components/publish-vehicle-dialog';

const SYSTEM_OWNER_EMAIL = 'apersson508@gmail.com';

export default function AdminPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('users');
  const [refreshKey, setRefreshKey] = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const [editingAd, setEditingAd] = useState<Vehicle | null>(null);
  
  const appId = firebaseConfig.projectId;
  const isSystemOwner = user?.email === SYSTEM_OWNER_EMAIL;

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

  const regularUsers = useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter(u => !['Huvudadmin', 'Moderator'].includes(u.role || '') && u.email !== SYSTEM_OWNER_EMAIL);
  }, [allUsers]);

  const filteredPersonnel = useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter(u => ['Huvudadmin', 'Moderator'].includes(u.role || '') || u.email === SYSTEM_OWNER_EMAIL);
  }, [allUsers]);

  const searchableUsers = useMemo(() => {
    if (!allUsers || !userSearch) return [];
    const search = userSearch.toLowerCase();
    return allUsers.filter(u => u.email.toLowerCase().includes(search) || u.name.toLowerCase().includes(search));
  }, [allUsers, userSearch]);

  const handleSelectForPromotion = async (u: UserProfile) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', u.id), { 
        role: 'Moderator', 
        updatedAt: serverTimestamp() 
      });
      toast({ title: `${u.name} har lagts till som Moderator` });
      setUserSearch('');
      setActiveTab('personnel');
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  if (isUserLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user) return null;

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-headline font-bold flex items-center gap-3 text-accent">
            <ShieldAlert className="w-10 h-10" /> Adminpanel
          </h1>
          <p className="text-muted-foreground">Global moderering och personalhantering</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey(prev => prev + 1)} className="rounded-full border-white/10">
          <RefreshCw className="w-4 h-4 mr-2" /> Uppdatera
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white/5 border border-white/10 p-1 flex w-full rounded-2xl overflow-x-auto">
          <TabsTrigger value="users" className="flex-1 rounded-xl">Användare</TabsTrigger>
          <TabsTrigger value="listings" className="flex-1 rounded-xl">Marknadsplats</TabsTrigger>
          <TabsTrigger value="banned" className="flex-1 rounded-xl">Blockerade</TabsTrigger>
          {isSystemOwner && (
            <TabsTrigger value="personnel" className="flex-1 rounded-xl bg-accent/10 data-[state=active]:bg-accent data-[state=active]:text-black font-bold">
              Personal
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="users">
          <UserManager users={regularUsers} bannedUsers={bannedUsers || []} mode="users" isSystemOwner={isSystemOwner} />
        </TabsContent>

        <TabsContent value="listings">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings?.map((l: Vehicle) => (
              <Card key={l.id} className="glass-card p-4 border-white/5 group hover:ring-2 ring-primary/20 transition-all">
                <div className="aspect-video relative rounded-xl overflow-hidden mb-4">
                  <img src={l.mainImage || 'https://picsum.photos/seed/car/400/300'} className="w-full h-full object-cover" alt="" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                    <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setEditingAd(l)}>
                      <Edit3 className="w-4 h-4 mr-2" /> Moderera
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold">{l.make} {l.model}</h3>
                    <p className="text-[10px] font-mono opacity-60 uppercase">{l.licensePlate}</p>
                  </div>
                  <span className="font-bold text-primary">{l.price?.toLocaleString()} kr</span>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between">
                  <p className="text-[10px] opacity-40 italic truncate max-w-[150px]">Säljare: {l.ownerName || 'Okänd'}</p>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
                    const plate = l.licensePlate.toUpperCase().replace(/\s/g, '');
                    await deleteDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'public_listings', l.id));
                    // Återställ status på bilen så säljknappen kommer tillbaka
                    if (l.ownerId) {
                      await updateDoc(doc(db!, 'artifacts', appId, 'users', l.ownerId, 'vehicles', plate), { isPublished: false });
                    }
                    toast({ title: "Annons raderad" });
                  }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="banned">
          <div className="grid gap-4">
            {bannedUsers?.map((u: any) => (
              <Card key={u.id} className="glass-card p-4 flex justify-between items-center border-white/5">
                <div>
                  <p className="font-bold">{u.name} ({u.email})</p>
                  <p className="text-[10px] uppercase opacity-60">Spärrad av {u.bannedBy}</p>
                </div>
                <Button variant="ghost" className="text-green-500 font-bold" onClick={async () => {
                  await deleteDoc(doc(db!, 'artifacts', appId, 'public', 'data', 'bannedUsers', u.id));
                  toast({ title: "Spärr hävd" });
                }}>HÄV SPÄRR</Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        {isSystemOwner && (
          <TabsContent value="personnel" className="space-y-6">
            <div className="glass-card p-6 rounded-3xl space-y-4">
              <Label className="text-sm font-bold flex items-center gap-2"><Search className="w-4 h-4" /> Sök användare att befordra</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="Skriv namn eller e-post..." 
                  className="bg-white/5 rounded-xl h-12" 
                  value={userSearch} 
                  onChange={(e) => setUserSearch(e.target.value)} 
                />
              </div>
              
              {userSearch && searchableUsers.length > 0 && (
                <div className="bg-background/50 rounded-2xl border border-white/5 overflow-hidden animate-in fade-in slide-in-from-top-2">
                  {searchableUsers.map(u => (
                    <div key={u.id} className="p-4 flex justify-between items-center border-b border-white/5 last:border-none">
                      <div>
                        <p className="font-bold text-sm">{u.name}</p>
                        <p className="text-xs opacity-60">{u.email}</p>
                      </div>
                      <Button size="sm" onClick={() => handleSelectForPromotion(u)} className="rounded-full">Välj</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <UserManager users={filteredPersonnel} bannedUsers={bannedUsers || []} mode="personnel" isSystemOwner={true} />
          </TabsContent>
        )}
      </Tabs>

      {editingAd && (
        <PublishVehicleDialog 
          isOpen={!!editingAd} 
          onClose={() => setEditingAd(null)} 
          vehicle={editingAd} 
        />
      )}
    </div>
  );
}

function UserManager({ users, bannedUsers, mode, isSystemOwner }: any) {
  const db = useFirestore();
  const { user: currentAdmin } = useUser();
  const { toast } = useToast();
  const appId = firebaseConfig.projectId;

  const isBanned = (userId: string) => bannedUsers.some((b: any) => b.id === userId);

  const handleSetRole = async (u: UserProfile, role: string) => {
    if (!db || u.email === SYSTEM_OWNER_EMAIL || !isSystemOwner) return;
    try {
      // Om rollen sätts till "Användare" raderas roll-fältet så de försvinner från personal-listan
      const isRemoving = role === 'Användare';
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', u.id), { 
        role: isRemoving ? null : role, 
        updatedAt: serverTimestamp() 
      });
      toast({ title: isRemoving ? "Personal raderad från listan" : "Roll uppdaterad" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleToggleBan = async (u: UserProfile) => {
    if (!db || u.email === SYSTEM_OWNER_EMAIL) return;
    const banned = isBanned(u.id);
    try {
      if (banned) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', u.id));
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bannedUsers', u.id), {
          id: u.id, name: u.name, email: u.email, bannedAt: new Date().toISOString(), bannedBy: currentAdmin?.email
        });
      }
      toast({ title: banned ? "Spärr hävd" : "Användare blockerad" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  const handleDeleteUser = async (u: UserProfile) => {
    if (!db || u.email === SYSTEM_OWNER_EMAIL) return;
    
    // confirm() blocked by sandbox, delete directly for now.
    try {
      const batch = writeBatch(db);
      const adsQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'public_listings'), where('ownerId', '==', u.id));
      const adsSnap = await getDocs(adsQuery);
      adsSnap.forEach(adDoc => batch.delete(adDoc.ref));

      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'public_profiles', u.id));
      batch.delete(doc(db, 'artifacts', appId, 'users', u.id, 'profiles', 'user-profile'));

      await batch.commit();
      toast({ title: "Användare raderad" });
    } catch (err: any) { toast({ variant: "destructive", title: "Fel", description: err.message }); }
  };

  return (
    <Card className="glass-card border-none overflow-x-auto rounded-3xl">
      <Table>
        <TableHeader><TableRow className="border-white/5"><TableHead>Namn & Roll</TableHead><TableHead>E-post</TableHead><TableHead>Typ</TableHead><TableHead className="text-right">Åtgärder</TableHead></TableRow></TableHeader>
        <TableBody>
          {users.map((u: any) => {
            const isOwner = u.email === SYSTEM_OWNER_EMAIL;
            const currentRole = isOwner ? 'Huvudadmin' : (u.role || 'Användare');
            return (
              <TableRow key={u.id} className="border-white/5">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold flex items-center gap-2">{u.name}{isOwner && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}</span>
                    <span className="text-[10px] uppercase opacity-60">{currentRole}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm opacity-70">{u.email}</TableCell>
                <TableCell><Badge variant="outline" className="rounded-md border-white/10">{u.userType === 'Workshop' ? 'Verkstad' : 'Privat'}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {mode === 'personnel' ? (
                      <div className="flex items-center gap-2">
                        <Select onValueChange={(v) => handleSetRole(u, v)} defaultValue={currentRole} disabled={isOwner}>
                          <SelectTrigger className="w-[140px] h-9 bg-white/5 rounded-xl border-white/5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Huvudadmin">Huvudadmin</SelectItem>
                            <SelectItem value="Moderator">Moderator</SelectItem>
                            <SelectItem value="Användare">Vanlig Användare</SelectItem>
                          </SelectContent>
                        </Select>
                        {!isOwner && (
                          <Button variant="ghost" size="sm" onClick={() => handleSetRole(u, 'Användare')} className="h-9 w-9 text-destructive" title="Ta bort från personal">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ) : !isOwner && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleBan(u)} className="h-9 w-9 rounded-xl">
                          {isBanned(u.id) ? <UserCheck className="w-4 h-4 text-green-500" /> : <UserX className="w-4 h-4 text-orange-500" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-9 w-9 rounded-xl text-destructive" onClick={() => handleDeleteUser(u)}><Trash2 className="w-4 h-4" /></Button>
                      </>
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
