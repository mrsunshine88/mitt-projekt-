import type {Metadata, Viewport} from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { Navbar } from '@/components/navbar';
import { Toaster } from '@/components/ui/toaster';
import { BanGuard } from '@/components/ban-guard';

import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'AutoLog – Din digitala annons och servicebok',
  description: 'Den smarta lösningen som förenar verifierad servicehistorik med en modern marknadsplats.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AutoLog',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#09090b',
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
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className="font-body antialiased bg-background text-foreground min-h-screen overscroll-none pb-[env(safe-area-inset-bottom)]">
        <PwaRegister />
        <FirebaseClientProvider>
          <BanGuard>
            <div className="flex flex-col min-h-screen">
              <Navbar />
              <main className="flex-1">
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
