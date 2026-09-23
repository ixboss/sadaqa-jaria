// ==================== Service Worker — إسلامي ====================
// v44: منزلق حجم الخط المستمر (٨٠–٢٠٠، افتراضي ١٣٠) موصول بالقرآن والأذكار
//      + إزاء ازاحة زر التقدم التلقائي عند فتح الأذكار (صنف fab-hidden
//      بدل display:none، و--nav-h يتبع حجم الخط)
//      + مساحة قارئ الختمة تسترد ارتفاعها (لا حشوة مزدوجة لمساحة التنقل)
//      + أرضية التصغير حجمٌ مقروء ثابت بالبكسل (٩٫٥px) بدل نسبة ثابتة
// v43: صفحة مصحف واحدة بلا تمرير (تصغير تلقائي --mushaf-fit) + إطار ذهبي
//      على غرار المصحف المطبوع + اختيار القارئ قبل التشغيل (١٢ قارئاً)
//      + فك تراكب أيقونتي الحفظ والتشغيل في رأس السورة
const CACHE_NAME = 'quran-app-v44';
const API_CACHE = 'quran-api-v44';
const STATIC_CACHE = 'static-v44';

const PRECACHE_URLS = [
  './',
  './index.html',
  './sw.js',
  './manifest.json',
  './surah-meta.js',
  './features.js',
  './config.js',
  './app.js',
  // أيقونات التثبيت: تُخزَّن مسبقاً حتى تعمل الشاشة الرئيسية دون اتصال
  './icons/icon-120.png',
  './icons/icon-152.png',
  './icons/icon-167.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
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
      // احذف أي ذاكرة مخزنة لا تطابق تماماً أسماء الحالية (بما فيها الإصدارات القديمة quran-app-v*)
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== API_CACHE && key !== STATIC_CACHE)
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
  // استخدم AbortController حقيقي ليُلغي الـ fetch الأساسي عند انتهاء المهلة
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function updateCacheInBackground(request, cacheName) {
  // no-store: تجاوز ذاكرة HTTP المؤقتة لضمان التحديث الفعلي
  fetch(request, { cache: 'no-store' })
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
      // data URLs must not be prefixed with ./
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" rx="32" fill="%230a1f28"/%3E%3Cpath d="M96 150 C 96 150 70 160 40 140 L 40 60 C 70 80 96 70 96 70 C 96 70 122 80 152 60 L 152 140 C 122 160 96 150 96 150 Z" fill="none" stroke="%233ecf9e" stroke-width="8" stroke-linejoin="round"/%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" rx="32" fill="%230a1f28"/%3E%3C/svg%3E',
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
    // includeUncontrolled: true حتى نصل إلى كل نسخ التطبيق المفتوحة،
    // والمقارنة تبدأ من نطاق التسجيل لأن روابط العميل تكون مطلقة.
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const scope = self.registration.scope;
      for (let client of clientList) {
        if (client.url.startsWith(scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});

