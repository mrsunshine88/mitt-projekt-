const CACHE_NAME = 'autolog-cache-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // PWA Pass-through
  // Vi låter webbläsaren hantera fetch för att undvika problem med Next.js dynamiska rutter
});
