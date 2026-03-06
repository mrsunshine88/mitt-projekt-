
"use client";

import { ShieldCheck, Award, Clock, ArrowUpCircle, Lock, Info, CheckCircle2, AlertCircle, CalendarCheck, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function CarGuardPage() {
  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Hero Header */}
      <section className="relative py-20 overflow-hidden border-b border-white/5 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="container max-w-4xl mx-auto px-4 relative z-10 text-center space-y-6">
          <Badge className="bg-primary/20 text-primary border-none px-4 py-1.5 rounded-full uppercase text-xs font-black tracking-widest animate-in fade-in slide-in-from-top-4">
            <ShieldCheck className="w-4 h-4 mr-2" /> Teknisk Specifikation
          </Badge>
          <h1 className="text-4xl md:text-6xl font-headline font-bold text-white tracking-tight">
            CarGuard – Så fungerar vår <span className="gradient-text">tillförlitlighetslogik</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Välkommen till CarGuard! Vi vill göra det tryggt att köpa och sälja bil genom att skapa total transparens kring servicehistoriken.
          </p>
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] -z-0" />
      </section>

      <main className="container max-w-4xl mx-auto px-4 mt-12 space-y-12">
        {/* Quick Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card border-yellow-500/20 bg-yellow-500/5 rounded-[2rem] p-6 text-center space-y-4">
            <div className="text-4xl">🏆</div>
            <h3 className="font-bold text-yellow-500 uppercase tracking-widest text-xs">Guld</h3>
            <p className="text-sm text-slate-300">Högsta nivån. Realtidsloggad historik inom 7 dagar.</p>
          </Card>
          <Card className="glass-card border-slate-300/20 bg-slate-300/5 rounded-[2rem] p-6 text-center space-y-4">
            <div className="text-4xl">🥈</div>
            <h3 className="font-bold text-slate-300 uppercase tracking-widest text-xs">Silver</h3>
            <p className="text-sm text-slate-300">Tydlig historik. Majoriteten loggad inom 90 dagar.</p>
          </Card>
          <Card className="glass-card border-orange-600/20 bg-orange-600/5 rounded-[2rem] p-6 text-center space-y-4">
            <div className="text-4xl">🥉</div>
            <h3 className="font-bold text-orange-600 uppercase tracking-widest text-xs">Brons</h3>
            <p className="text-sm text-slate-300">Efterhandsinmatad eller osäker historik.</p>
          </Card>
        </div>

        {/* Detailed FAQ */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-8">
            <Info className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-headline font-bold text-white">Vanliga frågor</h2>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="glass-card border-none rounded-2xl px-6">
              <AccordionTrigger className="hover:no-underline py-6">
                <span className="text-left font-bold text-lg">Vad betyder Guld, Silver och Brons?</span>
              </AccordionTrigger>
              <AccordionContent className="text-slate-300 space-y-4 pb-6 leading-relaxed">
                <p>Vår klassificering visar hur väl dokumenterad din bil är.</p>
                <ul className="space-y-3">
                  <li className="flex gap-3"><span className="shrink-0">🏆</span> <strong>Guld:</strong> Den högsta nivån. Visar att bilen servas kontinuerligt och att varje service registreras direkt när den utförs.</li>
                  <li className="flex gap-3"><span className="shrink-0">🥈</span> <strong>Silver:</strong> Bilen har en bra och tydlig historik, även om dokumentationen ibland har registrerats i efterhand.</li>
                  <li className="flex gap-3"><span className="shrink-0">🥉</span> <strong>Brons:</strong> Bilen saknar en obruten, verifierad historik eller så har information lagts in långt efter att servicen utfördes.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="glass-card border-none rounded-2xl px-6">
              <AccordionTrigger className="hover:no-underline py-6">
                <span className="text-left font-bold text-lg">Hur beräknas min bils status?</span>
              </AccordionTrigger>
              <AccordionContent className="text-slate-300 space-y-4 pb-6 leading-relaxed">
                <p>Vi jämför <strong>Utförandedatum</strong> (när servicen skedde) med <strong>Systemdatum</strong> (när du lade in det i appen).</p>
                <div className="grid gap-4 mt-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="font-bold text-yellow-500 mb-1">Guld (0–7 dagar)</p>
                    <p className="text-xs">Kräver att dina tre senaste servicetillfällen registrerats inom en vecka från utförande.</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="font-bold text-slate-300 mb-1">Silver (8–90 dagar)</p>
                    <p className="text-xs">Kräver att majoriteten (över 50 %) av dina totala serviceposter är registrerade inom 90 dagar.</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="font-bold text-orange-600 mb-1">Brons</p>
                    <p className="text-xs">Alla nya bilar eller bilar där historiken registrerats mer än 90 dagar efter utförande.</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="glass-card border-none rounded-2xl px-6">
              <AccordionTrigger className="hover:no-underline py-6">
                <span className="text-left font-bold text-lg">Kan jag förbättra min bils status?</span>
              </AccordionTrigger>
              <AccordionContent className="text-slate-300 pb-6 leading-relaxed">
                Ja, absolut! Det är en av de bästa sakerna med CarGuard. Om din bil just nu har "Brons", kan du arbeta dig uppåt. Genom att konsekvent registrera kommande servicebesök i tid ("Guld-zonen") kommer din historik att "spädas ut" med korrekta inmatningar. När majoriteten av dina totala poster är registrerade korrekt, kommer systemet automatiskt att uppgradera din bil till Silver eller Guld.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="glass-card border-none rounded-2xl px-6">
              <AccordionTrigger className="hover:no-underline py-6">
                <span className="text-left font-bold text-lg">Varför är systemet så strikt med datum?</span>
              </AccordionTrigger>
              <AccordionContent className="text-slate-300 pb-6 leading-relaxed">
                Vi vill förhindra "efterhandsfusk" där en säljare lägger in fem års servicehistorik samma dag som bilen ska säljas. Genom att kräva registrering i nära anslutning till servicetillfället blir det tydligt för en köpare att servicen faktiskt har utförts löpande under bilens livstid.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="glass-card border-none rounded-2xl px-6">
              <AccordionTrigger className="hover:no-underline py-6">
                <span className="text-left font-bold text-lg">Jag har precis börjat – varför är jag Brons?</span>
              </AccordionTrigger>
              <AccordionContent className="text-slate-300 pb-6 leading-relaxed">
                För att få "Silver" krävs minst två registrerade serviceposter. Vi vill inte ge ett betyg baserat på en enstaka post, eftersom det inte bevisar en obruten kedja av underhåll. Fortsätt registrera din service korrekt så kommer du se hur ditt betyg växer över tid.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6" className="glass-card border-none rounded-2xl px-6">
              <AccordionTrigger className="hover:no-underline py-6">
                <span className="text-left font-bold text-lg">Är mitt kvitto säkert?</span>
              </AccordionTrigger>
              <AccordionContent className="text-slate-300 pb-6 leading-relaxed">
                Ja. Informationen om dina kvitton är endast tillgänglig för dig som ägare eller huvudadministratör. Betygsskalan baseras enbart på tidsstämplarna för när du registrerade servicen, inte på vad som står inuti kvittot.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Tips Section */}
        <section className="pt-8">
          <Card className="glass-card border-primary/20 bg-primary/5 rounded-[2.5rem] overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-2xl font-headline font-bold flex items-center gap-3">
                <Award className="w-8 h-8 text-primary" /> Tips till nya medlemmar
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-4 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
                <p className="font-bold">Var snabb</p>
                <p className="text-sm text-muted-foreground italic">Registrera servicen i appen så snart du har fått kvittot i handen.</p>
              </div>
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
                <p className="font-bold">Var ärlig</p>
                <p className="text-sm text-muted-foreground italic">Att mata in allt på en gång inför en försäljning ger "Brons". Att mata in löpande ger "Guld".</p>
              </div>
              <div className="space-y-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
                <p className="font-bold">Bygg förtroende</p>
                <p className="text-sm text-muted-foreground italic">Köpare prioriterar bilar med "Guld-status" – det är en direkt lönsam investering!</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="flex justify-center pt-8">
          <Button size="lg" className="rounded-full h-14 px-10 font-bold shadow-xl shadow-primary/20" asChild>
            <Link href="/dashboard">Gå till mitt garage</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
