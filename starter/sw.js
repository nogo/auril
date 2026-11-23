// The service worker: keeps the app shell so the app opens without a
// connection. Network first, so an online start always gets the newest files;
// the cache answers only when the network can't. /api/ and /auth/ are never
// cached. A new worker waits until the page says "update now".
// Change VERSION with every release, or let the server fill it in with a hash
// of the files, so a change installs a new worker and shows the update banner.
const VERSION = 'dev';
const CACHE = `shell-${VERSION}`;
const SHELL = ['./'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  const path = url.pathname.slice(scope.length - 1);
  if (path.startsWith('/api/') || path.startsWith('/auth/')) return;
  // Every app route answers index.html, kept under the scope's root.
  const key = req.mode === 'navigate' ? scope : url.pathname;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(key, copy));
      }
      return res;
    } catch (err) {
      const kept = await caches.match(key);
      if (kept) return kept;
      throw err;
    }
  })());
});
