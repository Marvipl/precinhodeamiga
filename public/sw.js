// Service worker mínimo: permite instalar o app (PWA). O Web Push (F-15) acrescenta os eventos push e notificationclick.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
