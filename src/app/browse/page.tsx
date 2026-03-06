
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Search, ShieldCheck, Gauge, Calendar, X, SlidersHorizontal, Info, Loader2, Award, Zap, Palette, Droplets, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import Link from 'next/link';
import Image from 'next/image';
import { Vehicle, VehicleLog } from '@/types/autolog';
import { SWEDISH_CAR_BRANDS } from '@/constants/car-brands';
import { useRouter } from 'next/navigation';
import { TRUST_CONFIG, calculateOverallTrust } from '@/components/history-list';

export default function BrowseMarketplace() {
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  
  // States för filter
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [fuelFilter, setFuelFilter] = useState('all');
  const [gearboxFilter, setGearboxFilter] = useState('all');
  const [trustFilter, setTrustFilter] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');
  const [maxMileage, setMaxMileage] = useState('');
  const [minYear, setMinYear] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  
  const [showFilters, setShowFilters] = useState(false);

  const appId = "studio-3405255876-f647c";

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/');
    }
  }, [user, isUserLoading, router]);

  const listingsRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, 'artifacts', appId, 'public', 'data', 'public_listings');
  }, [db, user, appId]);

  const { data: listings, isLoading } = useCollection<Vehicle>(listingsRef);

  const filteredVehicles = useMemo(() => {
    if (!listings) return [];
    return listings.filter(v => {
      const searchStr = `${v.make ?? ''} ${v.model ?? ''} ${v.licensePlate ?? ''}`.toLowerCase();
      const matchesSearch = !search || searchStr.includes(search.toLowerCase());
      const matchesBrand = brandFilter === 'all' || v.make === brandFilter;
      const matchesFuel = fuelFilter === 'all' || v.fuelType === fuelFilter;
      const matchesGearbox = gearboxFilter === 'all' || v.gearbox === gearboxFilter;
      const matchesTrust = trustFilter === 'all' || v.overallTrust === trustFilter;
      
      const matchesPrice = !maxPrice || (v.price && v.price <= parseInt(maxPrice));
      const matchesMileage = !maxMileage || (v.currentOdometerReading && v.currentOdometerReading <= parseInt(maxMileage));
      const matchesYear = !minYear || (v.year && v.year >= parseInt(minYear));
      const matchesColor = !colorFilter || (v.color && v.color.toLowerCase().includes(colorFilter.toLowerCase()));

      return matchesSearch && matchesBrand && matchesFuel && matchesGearbox && matchesPrice && matchesMileage && matchesYear && matchesColor && matchesTrust;
    });
  }, [listings, search, brandFilter, fuelFilter, gearboxFilter, maxPrice, maxMileage, minYear, colorFilter, trustFilter]);

  const myAds = useMemo(() => filteredVehicles.filter(v => v.ownerId === user?.uid), [filteredVehicles, user]);
  const otherAds = useMemo(() => filteredVehicles.filter(v => v.ownerId !== user?.uid), [filteredVehicles, user]);

  if (isUserLoading || (user && isLoading)) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary opacity-20" /></div>;
  }

  if (!user) return null;

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 space-y-6">
        <div>
          <h1 className="text-4xl font-headline font-bold">Marknadsplats</h1>
          <p className="text-muted-foreground">Utforska bilar med CarGuard-verifierad historik</p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Sök märke, modell eller reg-nr..." className="pl-10 h-14 bg-white/5 border-white/10 rounded-2xl text-lg" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" className={`h-14 px-8 rounded-2xl border-white/10 ${showFilters ? 'bg-primary/10 text-primary border-primary/20' : ''}`} onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal className="w-4 h-4 mr-2" /> Fler filter
            </Button>
          </div>
          
          {showFilters && (
            <Card className="glass-card border-white/5 rounded-3xl animate-in fade-in slide-in-from-top-2">
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-60 ml-1">Märke</label>
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla märken</SelectItem>
                      {SWEDISH_CAR_BRANDS.map(brand => (<SelectItem key={brand} value={brand}>{brand}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-60 ml-1">CarGuard Status</label>
                  <Select value={trustFilter} onValueChange={setTrustFilter}>
                    <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla nivåer</SelectItem>
                      <SelectItem value="Gold">🏆 Guld</SelectItem>
                      <SelectItem value="Silver">🥈 Silver</SelectItem>
                      <SelectItem value="Bronze">🥉 Brons</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-60 ml-1">Bränsle</label>
                  <Select value={fuelFilter} onValueChange={setFuelFilter}>
                    <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla</SelectItem>
                      <SelectItem value="Bensin">Bensin</SelectItem>
                      <SelectItem value="Diesel">Diesel</SelectItem>
                      <SelectItem value="El">El</SelectItem>
                      <SelectItem value="Hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-60 ml-1">Växellåda</label>
                  <Select value={gearboxFilter} onValueChange={setGearboxFilter}>
                    <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla</SelectItem>
                      <SelectItem value="Automat">Automat</SelectItem>
                      <SelectItem value="Manuell">Manuell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-60 ml-1">Maxpris (kr)</label>
                  <Input type="number" placeholder="T.ex. 250000" className="bg-white/5 h-12 rounded-xl" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-60 ml-1">Max miltal (mil)</label>
                  <Input type="number" placeholder="T.ex. 10000" className="bg-white/5 h-12 rounded-xl" value={maxMileage} onChange={(e) => setMaxMileage(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-60 ml-1">Från årsmodell</label>
                  <Input type="number" placeholder="T.ex. 2018" className="bg-white/5 h-12 rounded-xl" value={minYear} onChange={(e) => setMinYear(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-60 ml-1">Färg</label>
                  <Input placeholder="T.ex. Vit" className="bg-white/5 h-12 rounded-xl" value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} />
                </div>
              </CardContent>
              <div className="px-6 pb-6 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => {
                  setBrandFilter('all'); setFuelFilter('all'); setGearboxFilter('all');
                  setMaxPrice(''); setMaxMileage(''); setMinYear(''); setColorFilter(''); setTrustFilter('all');
                }} className="text-xs uppercase font-bold text-muted-foreground hover:text-white">
                  Nollställ filter
                </Button>
              </div>
            </Card>
          )}
        </div>
      </header>

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
          <h2 className="text-xl font-headline font-bold uppercase tracking-wider">{myAds.length > 0 ? 'Fler bilar till salu' : 'Bilar till salu'}</h2>
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
    </div>
  );
}

function VehicleListItem({ vehicle }: { vehicle: Vehicle }) {
  // LOGIK FÖR BILDISOLERING: Prioritera annonsbilden
  const displayImage = vehicle.adMainImage || vehicle.mainImage || 'https://picsum.photos/seed/car/600/400';
  
  const trust = TRUST_CONFIG[vehicle.overallTrust as keyof typeof TRUST_CONFIG] || TRUST_CONFIG.Bronze;

  return (
    <Link href={`/v/${vehicle.id}`}>
      <Card className="glass-card border-none overflow-hidden group hover:ring-2 transition-all ring-primary/20 shadow-2xl h-full flex flex-col">
        <div className="aspect-[4/3] relative">
          <Image src={displayImage} alt={vehicle.make} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <Badge className="bg-green-500 text-white border-none shadow-xl px-3 py-1 font-black text-[9px] uppercase">
              <ShieldCheck className="w-3 h-3 mr-1.5" /> Verifierad
            </Badge>
            <Badge className={`${trust.bg} ${trust.color} border-none shadow-xl px-3 py-1 font-black text-[9px] uppercase backdrop-blur-md`}>
              {trust.emoji} {trust.label}
            </Badge>
          </div>
        </div>
        <CardContent className="p-5 space-y-4 flex-1 flex flex-col">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-headline font-bold group-hover:text-primary transition-colors">{vehicle.make} {vehicle.model}</h3>
              <div className="flex items-center gap-3 mt-1 text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {vehicle.year}</span>
                <span className="flex items-center gap-1.5"><Gauge className="w-3 h-3" /> {vehicle.currentOdometerReading?.toLocaleString()} mil</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-headline font-black text-white whitespace-nowrap">{vehicle.price?.toLocaleString()} kr</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 py-2">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
              <Droplets className="w-3 h-3 opacity-40" /> {vehicle.fuelType || '---'}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
              <Settings2 className="w-3 h-3 opacity-40" /> {vehicle.gearbox || '---'}
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 mt-auto border-t border-white/5">
            <Badge variant="outline" className="bg-white text-black font-bold uppercase border-none px-3 py-1 text-[11px] font-mono shadow-md">{vehicle.licensePlate}</Badge>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
