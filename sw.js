// ═══════════════════════════════════════
// SERVICE WORKER — instant app shell for the web/PWA build (GitHub Pages,
// tunnel-hosted Stats). Registered by app/app-init.js — NOT in the Android
// APK (Capacitor already serves files locally), and not on 127.0.0.1 /
// localhost (POS machine, dev) where a cached shell would only get in the way.
//
//   • Same-origin app files (index.html, app/*.js, styles, logo):
//     stale-while-revalidate — served from cache at once, refreshed in the
//     background, so a new version is picked up on the following open.
//   • CDN libraries + Google Fonts: cache-first (versioned URLs, immutable).
//   • Anything under /api/ (POS data): never touched — always live, and
//     already cached per restaurant by app/store-db.js.
// Bump SHELL_CACHE to force every client to drop its cached shell.
// ═══════════════════════════════════════

const SHELL_CACHE = 'erpgen-stats-shell-v1';
const CDN_CACHE   = 'erpgen-stats-cdn-v1';
const CDN_HOSTS   = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHELL_CACHE && key !== CDN_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.includes('/api/')) return;
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, req));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
});

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(SHELL_CACHE);
  // A deep link (?add=…&url=…) is the same shell — don't cache it per query.
  const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  const network = fetch(req)
    .then(res => {
      if (res && res.ok) cache.put(req.mode === 'navigate' ? new URL(req.url).pathname : req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

async function cacheFirst(req) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  // Opaque (status 0) is fine here — a no-cors stylesheet/font response.
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
