
"use client";

import { useState, useMemo } from 'react';
import { Search, ShieldCheck, Gauge, Calendar, X, SlidersHorizontal, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, limit } from 'firebase/firestore';
import Link from 'next/link';
import Image from 'next/image';
import { Vehicle } from '@/types/autolog';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';

export default function BrowseMarketplace() {
  const db = useFirestore();
  const { user } = useUser();
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');
  const [maxMileage, setMaxMileage] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // We fetch a list of listings. No complex query to avoid index errors.
  const listingsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'public_listings'), limit(100));
  }, [db]);

  const { data: listings, isLoading, error } = useCollection<Vehicle>(listingsQuery);

  const filteredVehicles = useMemo(() => {
    if (!listings) return [];
    return listings.filter(v => {
      // Basic search on multiple fields
      const searchStr = `${v.make ?? ''} ${v.model ?? ''} ${v.licensePlate ?? ''}`.toLowerCase();
      const matchesSearch = !search || searchStr.includes(search.toLowerCase());
      
      const matchesBrand = brandFilter === 'all' || v.make === brandFilter;
      const matchesPrice = !maxPrice || (v.price && v.price <= parseInt(maxPrice));
      const matchesMileage = !maxMileage || (v.currentOdometerReading && v.currentOdometerReading <= parseInt(maxMileage));
      
      return matchesSearch && matchesBrand && matchesPrice && matchesMileage;
    });
  }, [listings, search, brandFilter, maxPrice, maxMileage]);

  // Separate my ads from others
  const myAds = useMemo(() => filteredVehicles.filter(v => v.ownerId === user?.uid), [filteredVehicles, user]);
  const otherAds = useMemo(() => filteredVehicles.filter(v => v.ownerId !== user?.uid), [filteredVehicles, user]);

  if (error && !listings) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <Badge variant="destructive" className="mb-4">Behörighetsfel</Badge>
        <h2 className="text-2xl font-bold mb-2">Kunde inte hämta annonser</h2>
        <p className="text-muted-foreground">Kontrollera dina säkerhetsregler i Firebase Console.</p>
        <Button className="mt-6" onClick={() => window.location.reload()}>Försök igen</Button>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 space-y-6">
        <div>
          <h1 className="text-4xl font-headline font-bold">Marknadsplats</h1>
          <p className="text-muted-foreground">Hitta bilar med verifierad och låst historik</p>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Sök märke, modell eller reg-nr..." 
                className="pl-10 h-12 bg-white/5 border-white/10" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button 
              variant="outline" 
              className={`h-12 border-white/10 ${showFilters ? 'bg-primary/10 text-primary' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" /> Filter
            </Button>
          </div>

          {showFilters && (
            <Card className="glass-card border-white/5">
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60">Märke</label>
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla</SelectItem>
                      {SWEDISH_CAR_BRANDS.map(brand => (
                        <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60">Maxpris</label>
                  <Input type="number" placeholder="SEK" className="bg-white/5" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-60">Maxmil</label>
                  <Input type="number" placeholder="Mil" className="bg-white/5" value={maxMileage} onChange={(e) => setMaxMileage(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-64 bg-white/5 animate-pulse rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-12">
          {myAds.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                <h2 className="text-xl font-headline font-bold uppercase tracking-wider">Dina aktiva annonser</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myAds.map((v) => <VehicleListItem key={v.id} vehicle={v} />)}
              </div>
            </section>
          )}

          <section className="space-y-6">
            <h2 className="text-xl font-headline font-bold uppercase tracking-wider">
              {myAds.length > 0 ? 'Fler bilar till salu' : 'Bilar till salu'}
            </h2>
            {otherAds.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {otherAds.map((v) => <VehicleListItem key={v.id} vehicle={v} />)}
              </div>
            ) : (
              <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                <p className="text-muted-foreground">Inga bilar matchar din sökning.</p>
              </div>
            )}
          </section>
        </div>
      )}
      
      <footer className="mt-20 py-10 border-t border-white/5 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Info className="w-3 h-3" />
        Totalt i databasen: {listings?.length || 0} bilar
      </footer>
    </div>
  );
}

function VehicleListItem({ vehicle }: { vehicle: any }) {
  // Priority order for images: Base64 mainImage, then imageUrl, then first from imageUrls
  const displayImage = vehicle.mainImage || vehicle.imageUrl || (vehicle.imageUrls && vehicle.imageUrls[0]) || 'https://picsum.photos/seed/car/600/400';
  
  return (
    <Link href={`/v/${vehicle.id}`}>
      <Card className="glass-card border-none overflow-hidden group hover:ring-2 transition-all ring-primary/20">
        <div className="aspect-[4/3] relative">
          <Image src={displayImage} alt={vehicle.make} fill className="object-cover" />
          <div className="absolute top-4 left-4">
            <Badge className="bg-green-500 text-white border-none shadow-lg">
              <ShieldCheck className="w-3 h-3 mr-1.5" /> Verifierad
            </Badge>
          </div>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-headline font-bold">{vehicle.make} {vehicle.model}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {vehicle.year}</span>
                <span className="flex items-center gap-1.5"><Gauge className="w-3 h-3" /> {vehicle.currentOdometerReading?.toLocaleString()} mil</span>
              </div>
            </div>
            <p className="text-xl font-headline font-bold text-primary">
              {vehicle.price?.toLocaleString()} kr
            </p>
          </div>
          <Badge variant="outline" className="bg-white text-black font-bold uppercase">
            {vehicle.licensePlate}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}
