// Service worker: instala o app (PWA) e recebe o Web Push (F-15).
// O conteúdo do push vem de payloadPush() em supabase/functions/_shared/core/notificacoes.ts:
//   { id, titulo, corpo, link, tag, urgente }
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', (e) => {
  let dados = {};
  try {
    dados = e.data ? e.data.json() : {};
  } catch {
    dados = { titulo: 'Precinho de Amiga', corpo: e.data ? e.data.text() : '' };
  }
  const titulo = dados.titulo || 'Precinho de Amiga';
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || '',
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      requireInteraction: Boolean(dados.urgente),
      data: { link: dados.link || '/', id: dados.id || null },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.link) || '/', self.location.origin).href;
  e.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const j of janelas) {
        if (new URL(j.url).origin === self.location.origin && 'focus' in j) {
          await j.focus();
          if ('navigate' in j) await j.navigate(destino).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
