// Only the public offline page is stored. Member data and authenticated pages stay on the network.
const CACHE = 'gdg-offline-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE, { cache: 'reload' }))));
});

function notificationUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin === self.location.origin && ['/panolar', '/profilim'].includes(url.pathname)) return url.href;
  } catch { /* Use a safe default for malformed payloads. */ }
  return new URL('/profilim', self.location.origin).href;
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data?.json() ?? {}; } catch { /* A generic notification is still useful. */ }
    await self.registration.showNotification('GDG OSTİM', {
      body: data.body === 'Bu cihazda bildirimler çalışıyor.' ? data.body : 'Çalışma alanında bir güncelleme var.',
      icon: '/icons/icon-192.png',
      tag: typeof data.tag === 'string' ? data.tag.slice(0, 200) : 'gdg-update',
      data: { url: notificationUrl(data.url) },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = notificationUrl(event.notification.data?.url);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url === url);
    if (existing) return existing.focus();
    // Do not navigate away from a window that may contain an unsaved task or comment.
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('gdg-offline-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Let a new worker wait until existing tabs close, so an active form is never forcibly reloaded.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin
    || url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try { return await fetch(event.request); }
    catch {
      const cache = await caches.open(CACHE);
      return await cache.match(OFFLINE) ?? new Response('İnternet bağlantısı gerekli.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
