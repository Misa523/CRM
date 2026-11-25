/* Service worker: aplikace se otevře i bez internetu.
 * Strategie „nejdřív síť“: když je internet, vždy se načte nejnovější verze; offline se použije uložená kopie.
 * Požadavky na Supabase (jiný původ) se neukládají. */
const CACHE = 'crm-app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) // vždy ověřit novou verzi na serveru
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : undefined))
        .then(hit => hit || new Response('Offline', { status: 503, statusText: 'Offline' })))
  );
});
