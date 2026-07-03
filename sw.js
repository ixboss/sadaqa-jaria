// ==================== Service Worker — إسلامي ====================
const CACHE_NAME = 'quran-app-v6'; 
const API_CACHE = 'quran-api-v6';

const PRECACHE_URLS = [
  './',
  './index.html'
];

const API_ORIGIN = 'api.alquran.cloud';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
    .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== API_CACHE)
        .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.hostname.includes(API_ORIGIN)) {
    event.respondWith(cacheFirst(event.request, API_CACHE));
    return;
  }

  event.respondWith(networkFirst(event.request, CACHE_NAME));
});

async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch(e) {
    return await caches.match(request) || new Response('خطأ اتصال', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch(e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('لا يوجد اتصال بالإنترنت', { status: 503 });
  }
}
 