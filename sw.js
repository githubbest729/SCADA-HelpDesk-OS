/* SCADA HelpDesk OS — Service Worker */
const VERSION = 'scada-helpdesk-os-v1.0.0';
const PRECACHE = [
  './', './index.html', './offline.html', './manifest.webmanifest', './manifest.json',
  './favicon.ico', './favicon.svg', './apple-touch-icon.png', './robots.txt',
  './css/styles.css',
  './js/app.js', './js/db.js', './js/diagnostics.js', './js/seed-data.js',
  './assets/scada-topology.svg',
  './icons/icon-72.png', './icons/icon-96.png', './icons/icon-128.png', './icons/icon-144.png',
  './icons/icon-152.png', './icons/icon-192.png', './icons/icon-384.png', './icons/icon-512.png',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png', './icons/icon-monochrome-192.png',
  './icons/shortcut-new-ticket-96.png', './icons/shortcut-diagnostics-96.png',
  './icons/favicon-16x16.png', './icons/favicon-32x32.png',
  './screenshots/screenshot-wide.png', './screenshots/screenshot-narrow.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('scada-helpdesk-os-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => {
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ cleared: true });
    }));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first with cached shell, then offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (await cache.match('./index.html')) || (await cache.match('./offline.html')) || Response.error();
        })
    );
    return;
  }

  // Code assets: stale-while-revalidate. Binary/static: cache-first.
  const isCode = /\.(js|css|json|webmanifest|html)$/i.test(url.pathname);
  if (isCode) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        const network = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return cached || (await network) || (await cache.match('./offline.html')) || Response.error();
      })
    );
  } else {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => cached ||
        fetch(req).then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => Response.error())
      )
    );
  }
});

// Background Sync: notify open clients so the app can flush queued writes.
self.addEventListener('sync', (event) => {
  if (event.tag === 'scada-sync-queue') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) =>
        clients.forEach((c) => c.postMessage({ type: 'SYNC_QUEUE_FLUSH' }))
      )
    );
  }
});
