import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gauge, ShieldCheck, Share2, ArrowRight, Car, Lock, Smartphone, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden bg-gradient-to-b from-background to-secondary/20">
        <div className="container mx-auto px-4 relative z-10 text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-1000">
            <ShieldCheck className="w-4 h-4" /> Verifierad Fordonshistorik med Bildbevis
          </div>
          
          <h1 className="text-5xl md:text-8xl font-headline font-bold tracking-tight leading-tight">
            Välkommen till <span className="gradient-text">AutoLog</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground font-body max-w-2xl mx-auto leading-relaxed">
            Den smarta, digitala serviceboken som höjer din bils andrahandsvärde genom verifierad historik och mätarkontroll.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Button size="lg" className="rounded-full text-lg h-16 px-10 shadow-xl shadow-primary/20 group" asChild>
              <Link href="/dashboard">
                Kom igång nu <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-full text-lg h-16 px-10 border-white/10 hover:bg-white/5" asChild>
              <Link href="/browse">
                Se marknadsplatsen
              </Link>
            </Button>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl -z-0" />
      </section>

      {/* Feature Grid */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-headline font-bold mb-4">Byggd för trygga bilaffärer</h2>
            <p className="text-muted-foreground">Tre pelare som gör AutoLog unikt på marknaden.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 glass-card rounded-3xl space-y-6 hover:scale-[1.02] transition-transform duration-300">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                <Gauge className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-headline font-bold">Mätarsäkrad</h3>
              <p className="text-muted-foreground leading-relaxed">
                Vårt system sätter ett "besiktningsgolv" för miltalet. Varje sänkning kräver bildbevis på besiktningsprotokoll, vilket stoppar mätarfusk.
              </p>
            </div>

            <div className="p-8 glass-card rounded-3xl space-y-6 hover:scale-[1.02] transition-transform duration-300 border-primary/20 bg-primary/5">
              <div className="h-14 w-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shadow-inner">
                <ImageIcon className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-headline font-bold">Digitala Bevis</h3>
              <p className="text-muted-foreground leading-relaxed">
                Ladda upp bilder på dina kvitton och protokoll direkt i mobilen. Skapa en obruten kedja av bevis som köpare kan lita på.
              </p>
            </div>

            <div className="p-8 glass-card rounded-3xl space-y-6 hover:scale-[1.02] transition-transform duration-300">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                <Share2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-headline font-bold">Publik Länk</h3>
              <p className="text-muted-foreground leading-relaxed">
                Dela en unik, verifierad historik-länk direkt i din annons på Blocket eller Marketplace. Visa köparen att din bil är välskött.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile-Ready Section */}
      <section className="py-24 border-y border-white/5 bg-secondary/10">
        <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <Badge className="bg-primary/20 text-primary border-none">100% Mobilanpassad</Badge>
            <h2 className="text-4xl md:text-6xl font-headline font-bold leading-tight">Hantera allt direkt från mobilen</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-6 w-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 shrink-0">
                  <Smartphone className="w-3 h-3" />
                </div>
                <p className="text-lg">Öppna kameran och fota kvitton direkt vid verkstaden.</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 h-6 w-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 shrink-0">
                  <Lock className="w-3 h-3" />
                </div>
                <p className="text-lg">Säkra ägarbyten med digitala överlåtelsekoder.</p>
              </div>
            </div>
            <Button size="lg" className="rounded-full h-14 px-8" asChild>
              <Link href="/login">Registrera dig gratis</Link>
            </Button>
          </div>
          
          <div className="relative aspect-square max-w-md mx-auto lg:ml-auto">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
            <div className="relative z-10 glass-card rounded-[3rem] p-4 border-2 border-white/10 shadow-2xl">
              <Image 
                src="https://picsum.photos/seed/mobile-app/400/800" 
                alt="App preview" 
                width={400} 
                height={800} 
                className="rounded-[2.5rem] object-cover"
                data-ai-hint="mobile dashboard"
              />
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-white/5 bg-background">
        <div className="container mx-auto px-4 text-center">
          <p className="font-headline font-bold text-xl gradient-text mb-4">AutoLog</p>
          <p className="text-sm text-muted-foreground">© 2026 AutoLog - För en ärligare bilmarknad.</p>
        </div>
      </footer>
    </div>
  );
}
