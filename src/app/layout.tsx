
import type {Metadata, Viewport} from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { Navbar } from '@/components/navbar';
import { Toaster } from '@/components/ui/toaster';
import { BanGuard } from '@/components/ban-guard';

export const metadata: Metadata = {
  title: 'AutoLog - Digital Servicebok',
  description: 'Digitalisera din bils historik och höj andrahandsvärdet.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground min-h-screen overscroll-none pb-[env(safe-area-inset-bottom)]">
        <FirebaseClientProvider>
          <BanGuard>
            <div className="flex flex-col min-h-screen">
              <Navbar />
              <main className="flex-1 px-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
                {children}
              </main>
            </div>
            <Toaster />
          </BanGuard>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
