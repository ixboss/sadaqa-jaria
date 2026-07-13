// ==================== Service Worker — إسلامي ====================
const CACHE_NAME = 'quran-app-v32'; 
const API_CACHE = 'quran-api-v32';
const STATIC_CACHE = 'static-v32';

const PRECACHE_URLS = [
  './',
  './index.html',
  './sw.js',
  './manifest.json'
];

const API_ORIGIN = 'api.alquran.cloud';

// ==================== Installation ====================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('Failed to cache precache URLs:', err);
      });
    })
    .then(() => self.skipWaiting())
  );
});

// ==================== Activation & Cleanup ====================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => {
          return key !== CACHE_NAME && 
                 key !== API_CACHE && 
                 key !== STATIC_CACHE &&
                 !key.startsWith('quran-app-v');
        })
        .map(key => {
          console.log('Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ==================== Fetch Strategy ====================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // API requests: Cache first, fall back to network
  if (url.hostname.includes(API_ORIGIN)) {
    event.respondWith(cacheFirstWithTimeout(event.request, API_CACHE, 5000));
    return;
  }

  // Static assets: Network first, fall back to cache
  if (isStaticAsset(url.pathname)) {
    event.respondWith(networkFirstWithFallback(event.request, STATIC_CACHE));
    return;
  }

  // HTML pages: Network first for freshness
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(networkFirstWithFallback(event.request, CACHE_NAME));
    return;
  }

  // Default: Network first
  event.respondWith(networkFirstWithFallback(event.request, CACHE_NAME));
});

// ==================== Helper Functions ====================
function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp)$/.test(pathname);
}

async function cacheFirstWithTimeout(request, cacheName, timeout = 3000) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
      // Return cached, update in background
      updateCacheInBackground(request, cacheName);
      return cached;
    }

    return await fetchWithTimeout(request, timeout);
  } catch (err) {
    console.error('Cache first error:', err);
    const cached = await caches.match(request).catch(() => null);
    if (cached) return cached;
    return new Response('خطأ: لا يوجد اتصال', { status: 503 });
  }
}

async function networkFirstWithFallback(request, cacheName, timeout = 5000) {
  try {
    const response = await fetchWithTimeout(request, timeout);
    
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    
    return response;
  } catch (err) {
    console.warn('Network error, checking cache:', err);
    const cached = await caches.match(request).catch(() => null);
    
    if (cached) return cached;
    
    // Return offline page for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      return new Response('لا يوجد اتصال بالإنترنت', { status: 503 });
    }
    
    throw err;
  }
}

function fetchWithTimeout(request, timeout) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network timeout')), timeout)
    )
  ]);
}

function updateCacheInBackground(request, cacheName) {
  fetch(request)
    .then(response => {
      if (response && response.ok) {
        const cache = caches.open(cacheName);
        cache.then(c => c.put(request, response.clone()).catch(() => {}));
      }
    })
    .catch(() => {});
}

// ==================== Background Sync ====================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  try {
    // Sync bookmarks or reading progress
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        timestamp: Date.now()
      });
    });
  } catch (err) {
    console.error('Sync error:', err);
  }
}

// ==================== Push Notifications ====================
self.addEventListener('push', event => {
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: './data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" rx="32" fill="%230f1117"/%3E%3Cpath d="M96 150 C 96 150 70 160 40 140 L 40 60 C 70 80 96 70 96 70 C 96 70 122 80 152 60 L 152 140 C 122 160 96 150 96 150 Z" fill="none" stroke="%23c9a84c" stroke-width="8" stroke-linejoin="round"/%3E%3C/svg%3E',
      badge: './data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" rx="32" fill="%230f1117"/%3E%3C/svg%3E',
      tag: 'islamic-app-notification',
      requireInteraction: false
    };
    
    event.waitUntil(
      self.registration.showNotification('إسلامي', options)
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (let client of clientList) {
        if (client.url === './' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});

