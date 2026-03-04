"use client";

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc, updateDoc, setDoc, query, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, Edit, ShieldCheck, UserPlus, Search, Car, Mail, ShieldAlert, UserX, UserCheck, X, ImageIcon, Shield, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Vehicle, UserProfile } from '@/types/autolog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const SYSTEM_OWNER_EMAIL = 'apersson508@gmail.com';

export default function AdminPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('users');

  // Guard: Only fetch admins list if user is present to avoid permission errors
  const adminsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, 'admins');
  }, [db, user]);

  const { data: admins, isLoading: isLoadingAdmins } = useCollection<any>(adminsQuery);

  const currentAdminData = useMemo(() => {
    if (!user || !admins) return null;
    return admins.find(a => a.id.toLowerCase() === user.email?.toLowerCase());
  }, [user, admins]);

  const isAdmin = useMemo(() => {
    if (!user) return false;
    if (user.email === SYSTEM_OWNER_EMAIL) return true;
    return admins?.some(a => a.id.toLowerCase() === user.email?.toLowerCase());
  }, [user, admins]);

  const isOwner = useMemo(() => {
    if (user?.email === SYSTEM_OWNER_EMAIL) return true;
    return currentAdminData?.role === 'Owner';
  }, [user, currentAdminData]);

  useEffect(() => {
    if (!isUserLoading && !isAdmin && user) {
      router.push('/dashboard');
    }
  }, [isAdmin, isUserLoading, user, router]);

  // Guard: Only fetch global data if we are sure the user IS an admin
  const listingsQuery = useMemoFirebase(() => {
    if (!db || !isAdmin) return null;
    return collection(db, 'public_listings');
  }, [db, isAdmin]);

  const { data: listings, isLoading: isLoadingListings } = useCollection<Vehicle>(listingsQuery);

  const bannedQuery = useMemoFirebase(() => {
    if (!db || !isAdmin) return null;
    return query(collection(db, 'bannedUsers'), orderBy('bannedAt', 'desc'));
  }, [db, isAdmin]);

  const { data: bannedUsers, isLoading: isLoadingBanned } = useCollection<any>(bannedQuery);

  const usersQuery = useMemoFirebase(() => {
    if (!db || !isAdmin) return null;
    return collection(db, 'users');
  }, [db, isAdmin]);

  const { data: allUsers, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);

  if (isUserLoading || isLoadingAdmins) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="container max-w-2xl mx-auto py-20 text-center">
        <h1 className="text-4xl font-bold mb-4">Åtkomst nekad</h1>
        <p className="text-muted-foreground">Du har inte administratörsbehörighet för att se denna sida.</p>
      </div>
    );
  }

  // Final check for global data loading
  if (isLoadingListings || isLoadingBanned || isLoadingUsers) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-headline font-bold flex items-center gap-3">
            <ShieldAlert className="w-10 h-10 text-accent" />
            Admin-panel
          </h1>
          <p className="text-muted-foreground">
            {isOwner ? 'Huvudadmin - Fullständig kontroll' : 'Moderator - Innehållshantering'}
          </p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white/5 border border-white/10 p-1">
          <TabsTrigger value="users" className="rounded-md">Användare ({allUsers?.length || 0})</TabsTrigger>
          <TabsTrigger value="listings" className="rounded-md">Annonser ({listings?.length || 0})</TabsTrigger>
          <TabsTrigger value="banned" className="rounded-md">Blockerade ({bannedUsers?.length || 0})</TabsTrigger>
          <TabsTrigger value="admins" className="rounded-md">Personal</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="animate-in fade-in duration-300">
          <UsersManager users={allUsers || []} bannedUsers={bannedUsers || []} isOwner={isOwner} />
        </TabsContent>

        <TabsContent value="listings" className="animate-in fade-in duration-300">
          <ListingsManager listings={listings || []} isOwner={isOwner} />
        </TabsContent>

        <TabsContent value="banned" className="animate-in fade-in duration-300">
          <BannedUsersManager bannedUsers={bannedUsers || []} isOwner={isOwner} />
        </TabsContent>

        <TabsContent value="admins" className="animate-in fade-in duration-300">
          <AdminsManager admins={admins || []} isOwner={isOwner} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersManager({ users, bannedUsers, isOwner }: { users: UserProfile[], bannedUsers: any[], isOwner: boolean }) {
  const db = useFirestore();
  const { user: currentAdmin } = useUser();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const isBanned = (userId: string) => bannedUsers.some(b => b.id === userId);

  const handleToggleBan = async (user: UserProfile) => {
    if (!db || !currentAdmin) return;

    // Immunitet för systemägaren
    if (user.email === SYSTEM_OWNER_EMAIL) {
      toast({ variant: "destructive", title: "Nekat", description: "Huvudadmin-kontot är systemkritiskt och kan ej blockeras." });
      return;
    }

    const banned = isBanned(user.id);
    try {
      if (banned) {
        await deleteDoc(doc(db, 'bannedUsers', user.id));
        toast({ title: "Blockering hävd", description: `${user.name} har nu tillgång igen.` });
      } else {
        await setDoc(doc(db, 'bannedUsers', user.id), {
          id: user.id,
          name: user.name,
          email: user.email,
          bannedAt: new Date().toISOString(),
          bannedBy: currentAdmin.email,
          reason: 'Blockerad av administratör.'
        });
        toast({ title: "Användare blockerad", description: `${user.name} har stängts av.` });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Sök namn, e-post eller ID..." 
          className="pl-10 h-12 bg-white/5 border-white/10 rounded-xl" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Card className="glass-card border-none overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead>Användare</TableHead>
              <TableHead>E-post</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Inga användare hittades.</TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => {
                const banned = isBanned(u.id);
                const isSpecial = u.email === SYSTEM_OWNER_EMAIL;
                return (
                  <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="font-bold">{u.name}</div>
                        {isSpecial && <Shield className="w-3 h-3 text-accent" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">{u.id}</div>
                    </TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="rounded-full">
                        {u.userType === 'Workshop' ? 'Verkstad' : 'Ägare'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {banned ? (
                        <Badge variant="destructive" className="rounded-full">Blockerad</Badge>
                      ) : isSpecial ? (
                        <Badge className="bg-accent text-accent-foreground rounded-full">Immunt</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-500 border-green-500/20 rounded-full">Aktiv</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isSpecial && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`rounded-full ${banned ? 'text-primary hover:bg-primary/10' : 'text-destructive hover:bg-destructive/10'}`}
                          onClick={() => handleToggleBan(u)}
                        >
                          {banned ? (
                            <><UserCheck className="w-4 h-4 mr-2" /> Häv blockering</>
                          ) : (
                            <><UserX className="w-4 h-4 mr-2" /> Blockera</>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ListingsManager({ listings, isOwner }: { listings: Vehicle[], isOwner: boolean }) {
  const db = useFirestore();
  const { user: currentAdmin } = useUser();
  const { toast } = useToast();
  const [editingListing, setEditingListing] = useState<Vehicle | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredListings = useMemo(() => {
    return listings.filter(l => 
      l.licensePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.ownerId?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [listings, searchTerm]);

  const handleDelete = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'public_listings', id));
      toast({ title: "Annons raderad", description: "Fordonet har tagits bort från marknadsplatsen." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  const handleBanUser = async (userId: string, ownerName: string) => {
    if (!db || !currentAdmin || !userId) {
      toast({ variant: "destructive", title: "Fel", description: "Kunde inte blockera användaren." });
      return;
    }

    await setDoc(doc(db, 'bannedUsers', userId), {
      id: userId,
      name: ownerName || 'Okänd användare',
      bannedAt: new Date().toISOString(),
      bannedBy: currentAdmin.email,
      reason: 'Blockerad av administratör via annonsmoderering.'
    });
    toast({ title: "Användare blockerad" });
  };

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Sök märke, reg-nr eller ägar-id..." 
          className="pl-10 h-12 bg-white/5 border-white/10 rounded-xl" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Card className="glass-card border-none overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead>Fordon</TableHead>
              <TableHead>Reg-nr</TableHead>
              <TableHead>Ägare</TableHead>
              <TableHead>Pris</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredListings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Inga annonser hittades.</TableCell>
              </TableRow>
            ) : (
              filteredListings.map((listing) => (
                <TableRow key={listing.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <Car className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-bold">{listing.make} {listing.model}</div>
                        <div className="text-[10px] text-muted-foreground uppercase font-mono">{listing.id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="font-mono bg-white text-black border-2">{listing.licensePlate}</Badge></TableCell>
                  <TableCell>
                     <div className="text-xs font-medium">{listing.ownerName || 'Anonym'}</div>
                     <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">{listing.ownerId}</div>
                  </TableCell>
                  <TableCell className="font-bold text-primary">{listing.price?.toLocaleString()} kr</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10" onClick={() => setEditingListing(listing)} title="Redigera">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full text-destructive hover:bg-destructive/10" 
                        onClick={() => handleBanUser(listing.ownerId, listing.ownerName || '')}
                        title="Blockera användare"
                      >
                        <UserX className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="rounded-full text-destructive hover:bg-destructive/10" onClick={() => handleDelete(listing.id)} title="Radera annons">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {editingListing && (
        <AdminEditDialog 
          listing={editingListing} 
          onClose={() => setEditingListing(null)} 
        />
      )}
    </div>
  );
}

function BannedUsersManager({ bannedUsers, isOwner }: { bannedUsers: any[], isOwner: boolean }) {
  const db = useFirestore();
  const { toast } = useToast();

  const handleUnban = async (userId: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'bannedUsers', userId));
      toast({ title: "Blockering hävd" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card border-none overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead>Användare</TableHead>
              <TableHead>Blockerad av</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bannedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Inga blockerade användare.</TableCell>
              </TableRow>
            ) : (
              bannedUsers.map((bUser) => (
                <TableRow key={bUser.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell>
                    <div className="font-bold text-destructive">{bUser.name || 'Okänd'}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{bUser.id}</div>
                  </TableCell>
                  <TableCell className="text-sm">{bUser.bannedBy}</TableCell>
                  <TableCell className="text-sm opacity-60">{new Date(bUser.bannedAt).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="rounded-full text-primary hover:bg-primary/10" onClick={() => handleUnban(bUser.id)}>
                      <UserCheck className="w-4 h-4 mr-2" /> Häv blockering
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function AdminEditDialog({ listing, onClose }: { listing: Vehicle, onClose: () => void }) {
  const db = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    make: listing.make,
    model: listing.model,
    price: listing.price || 0,
    description: listing.description || '',
    currentOdometerReading: listing.currentOdometerReading || 0,
    imageUrls: listing.imageUrls || []
  });

  const isInvalidOdometer = formData.currentOdometerReading < listing.currentOdometerReading;

  const handleRemoveImage = (index: number) => {
    const newImages = formData.imageUrls.filter((_, i) => i !== index);
    setFormData({ ...formData, imageUrls: newImages });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    if (isInvalidOdometer) {
      toast({
        variant: "destructive",
        title: "Fel vid sparning",
        description: `Mätarställningen kan inte vara lägre än den senast registrerade (${listing.currentOdometerReading} mil).`
      });
      return;
    }

    setLoading(true);
    try {
      const updatePayload: any = { ...formData };
      
      if (formData.imageUrls.length > 0) {
        updatePayload.mainImage = formData.imageUrls[0];
      } else {
        updatePayload.mainImage = "";
      }

      await updateDoc(doc(db, 'public_listings', listing.id), updatePayload);
      toast({ title: "Uppdaterad", description: "Annonsen har uppdaterats." });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="glass-card border-white/10 sm:max-w-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Redigera Annons</DialogTitle>
          <DialogDescription>Moderera information för {listing.licensePlate}</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSave} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Märke</Label>
              <Input value={formData.make} onChange={(e) => setFormData({...formData, make: e.target.value})} className="bg-white/5 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Modell</Label>
              <Input value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} className="bg-white/5 rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pris (kr)</Label>
              <Input type="number" value={formData.price} onChange={(e) => setFormData({...formData, price: parseInt(e.target.value) || 0})} className="bg-white/5 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className={isInvalidOdometer ? "text-destructive font-bold" : ""}>Mätarställning (mil)</Label>
              <Input type="number" value={formData.currentOdometerReading} onChange={(e) => setFormData({...formData, currentOdometerReading: parseInt(e.target.value) || 0})} className={`bg-white/5 rounded-xl ${isInvalidOdometer ? 'border-destructive/50 ring-destructive/20' : ''}`} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Beskrivning</Label>
            <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="bg-white/5 rounded-xl h-32" />
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Moderera Bilder ({formData.imageUrls.length})
            </Label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {formData.imageUrls.map((url, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden group border border-white/5">
                  <Image src={url} alt={`Bilbild ${index + 1}`} fill className="object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-1 right-1 bg-destructive p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Ta bort bild"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                  {index === 0 && (
                    <div className="absolute bottom-0 inset-x-0 bg-primary/80 text-[10px] text-center font-bold py-0.5 text-white">
                      HUVUDBILD
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-6">
            <Button variant="ghost" type="button" onClick={onClose} className="rounded-full">Avbryt</Button>
            <Button type="submit" disabled={loading || isInvalidOdometer} className="rounded-full shadow-lg">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Spara ändringar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminsManager({ admins, isOwner }: { admins: any[], isOwner: boolean }) {
  const db = useFirestore();
  const { toast } = useToast();
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'Owner' | 'Moderator'>('Moderator');
  const [loading, setLoading] = useState(false);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !newAdminEmail.trim() || !isOwner) return;
    setLoading(true);
    try {
      const email = newAdminEmail.trim().toLowerCase();
      await setDoc(doc(db, 'admins', email), {
        email,
        role: newAdminRole,
        addedAt: new Date().toISOString()
      });
      setNewAdminEmail('');
      toast({ title: "Personal tillagd", description: `${email} är nu ${newAdminRole === 'Owner' ? 'Huvudadmin' : 'Moderator'}.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (!db || !isOwner) return;
    if (email === SYSTEM_OWNER_EMAIL) {
      toast({ variant: "destructive", title: "Nekat", description: "Systemägaren kan ej raderas." });
      return;
    }
    try {
      await deleteDoc(doc(db, 'admins', email));
      toast({ title: "Behörighet återkallad" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fel", description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {isOwner && (
        <Card className="glass-card border-none rounded-2xl">
          <CardHeader>
            <CardTitle className="text-xl">Hantera Administratörer</CardTitle>
            <CardDescription>Bevilja rättigheter till personal eller andra ägare.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="E-postadress..." 
                  className="pl-10 h-12 bg-white/5 border-white/10 rounded-xl" 
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  required
                />
              </div>
              <div className="w-full sm:w-48">
                <Select value={newAdminRole} onValueChange={(v: any) => setNewAdminRole(v)}>
                  <SelectTrigger className="h-12 bg-white/5 border-white/10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Moderator">Moderator</SelectItem>
                    <SelectItem value="Owner">Huvudadmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="lg" disabled={loading} className="rounded-full shadow-lg">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Lägg till
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card border-none overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead>Personal</TableHead>
              <TableHead>Roll</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="border-white/5 hover:bg-white/5">
              <TableCell className="font-bold flex items-center gap-2">
                {SYSTEM_OWNER_EMAIL} <Shield className="w-3 h-3 text-accent" />
              </TableCell>
              <TableCell><Badge className="bg-accent text-accent-foreground rounded-full">Systemägare</Badge></TableCell>
              <TableCell className="text-right opacity-20 pointer-events-none">—</TableCell>
            </TableRow>
            {admins.filter(a => a.id !== SYSTEM_OWNER_EMAIL).map((admin) => (
              <TableRow key={admin.id} className="border-white/5 hover:bg-white/5 transition-colors">
                <TableCell className="font-medium">{admin.id}</TableCell>
                <TableCell>
                  <Badge variant={admin.role === 'Owner' ? 'default' : 'secondary'} className="rounded-full">
                    {admin.role === 'Owner' ? (
                      <span className="flex items-center gap-1"><UserCog className="w-3 h-3" /> Huvudadmin</span>
                    ) : (
                      'Moderator'
                    )}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {isOwner && (
                    <Button variant="ghost" size="icon" className="rounded-full text-destructive hover:bg-destructive/10" onClick={() => handleRemoveAdmin(admin.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
