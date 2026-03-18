"use client";

import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { useState, useMemo } from 'react';
import { UserProfile } from '@/types/autolog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, MapPin, Building2, ChevronRight, UserCircle } from 'lucide-react';
import Link from 'next/link';

export default function WorkshopsDirectoryPage() {
  const db = useFirestore();
  const appId = firebaseConfig.projectId;
  const [searchQuery, setSearchQuery] = useState('');

  const workshopsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(
      collection(db, 'artifacts', appId, 'public', 'data', 'public_profiles'),
      where('userType', '==', 'Workshop')
    );
  }, [db, appId]);

  const { data: rawWorkshops, isLoading } = useCollection<UserProfile>(workshopsQuery);

  const filteredWorkshops = useMemo(() => {
    if (!rawWorkshops) return [];
    let result = rawWorkshops;
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(w => 
        (w.name || '').toLowerCase().includes(lowerQ) ||
        (w.city || '').toLowerCase().includes(lowerQ) ||
        (w.address || '').toLowerCase().includes(lowerQ) ||
        (w.description || '').toLowerCase().includes(lowerQ)
      );
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [rawWorkshops, searchQuery]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-12 h-12 animate-spin text-primary opacity-40" /></div>;
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 pb-32 text-white">
      <header className="mb-12">
        <h1 className="text-4xl font-headline font-bold mb-3">Hitta Verkstad</h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Sök bland alla våra anslutna och verifierade verkstäder för att boka din nästa service eller reparation.
        </p>
      </header>

      <div className="relative mb-10 max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" />
        <Input 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Sök på verkstadens namn, ort eller adress..." 
          className="h-16 pl-14 bg-white/5 border-white/10 rounded-2xl text-lg shadow-xl focus-visible:ring-primary"
        />
      </div>

      {filteredWorkshops.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
          <Building2 className="w-16 h-16 opacity-20 mx-auto mb-4" />
          <h2 className="text-2xl font-headline font-bold mb-2">Inga verkstäder hittades</h2>
          <p className="text-muted-foreground">Din sökning gav tyvärr inga resultat. Prova att söka på en annan ort eller namn.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkshops.map(workshop => (
            <Link href={`/workshops/${workshop.id}`} key={workshop.id} className="block group">
              <Card className="glass-card hover:bg-white/10 transition-colors border-white/10 rounded-3xl overflow-hidden h-full flex flex-col">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-[1rem] bg-primary/10 border-2 border-white/5 flex items-center justify-center text-primary shrink-0 overflow-hidden">
                      {workshop.photoUrl ? (
                        <img src={workshop.photoUrl} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <UserCircle className="w-8 h-8" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold font-headline leading-tight group-hover:text-primary transition-colors">{workshop.name}</h3>
                      <div className="flex flex-col gap-1 mt-2">
                        {workshop.city && (
                          <span className="flex items-center text-sm text-slate-400">
                            <MapPin className="w-3.5 h-3.5 mr-1.5 opacity-60" /> {workshop.city}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {workshop.description && (
                    <p className="text-sm text-slate-300 line-clamp-2 mt-2 mb-4">
                      {workshop.description}
                    </p>
                  )}
                  
                  <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between text-primary font-bold text-sm uppercase tracking-widest">
                    Visa profil <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
