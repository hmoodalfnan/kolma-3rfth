/* Deeds tracker service worker — hand-rolled so caching rules stay explicit.
   Mirrors lib/pwa/strategy.js; both are covered by tests/pwa/strategy.test.js. */

const VERSION = 'v1';
const SHELL_CACHE = `tracker-shell-${VERSION}`;
const RUNTIME_CACHE = `tracker-runtime-${VERSION}`;
const SHELL = [
  '/',
  '/today',
  '/board',
  '/settings',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

function chooseStrategy(request) {
  if (request.method !== 'GET') return 'network-only';

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return 'network-only';
  }

  if (url.pathname.startsWith('/api/')) return 'network-only';
  if (url.hostname.endsWith('.supabase.co')) return 'network-only';
  if (url.pathname.startsWith('/_next/static/')) return 'cache-first';
  if (url.pathname.startsWith('/_next/image')) return 'cache-first';

  const accept = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || accept.includes('text/html')) {
    return 'stale-while-revalidate';
  }

  if (/\.(css|js|woff2?|png|svg|jpg|webp|ico)$/.test(url.pathname)) return 'cache-first';

  return 'network-only';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const strategy = chooseStrategy(event.request);
  if (strategy === 'network-only') return;

  if (strategy === 'cache-first') {
    event.respondWith(cacheFirst(event.request).catch(() => fetch(event.request)));
    return;
  }

  event.respondWith(
    staleWhileRevalidate(event.request).catch(
      () => caches.match('/today') || new Response('', { status: 504 }),
    ),
  );
});
