// ==================== Service Worker — إسلامي ====================
// v47: تخزين خطوط المصحف (fonts.googleapis.com / fonts.gstatic.com) للعمل
//      أوفلاين بالكامل، التحقق من سلامة استجابات الـ API قبل تخزينها،
//      وتحديث الكاش لدعم التفسير الميسر وبطاقات المشاركة وتكرار الآيات.
const CACHE_NAME = 'quran-app-v50';
const API_CACHE = 'quran-api-v50';
const STATIC_CACHE = 'static-v50';

const PRECACHE_URLS = [
  './',
  './index.html',
  './sw.js',
  './manifest.json',
  './surah-meta.js',
  './features.js',
  './config.js',
  './app.js',
  './backup.js',
  // محرّك المصحف الموحّد (فهرس الـ٦٠٤ صفحة) — يلزم القراءة بلا إنترنت
  './mushaf.js',
  // محرّك قلب الصفحات (السحب ثلاثي الأبعاد + بديل الحركة المخفّضة)
  './pageflip.js',
  // أيقونات التثبيت: تُخزَّن مسبقاً حتى تعمل الشاشة الرئيسية دون اتصال
  './icons/icon-120.png',
  './icons/icon-152.png',
  './icons/icon-167.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './assets/fonts/NotoSansArabic-Regular.woff2',
  './assets/fonts/NotoSansArabic-Bold.woff2',
  './assets/fonts/NotoNaskhArabic-Regular.woff2',
  './assets/fonts/NotoNaskhArabic-Bold.woff2'
];

const API_ORIGIN = 'api.alquran.cloud';
const FONT_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

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

  // خطوط المصحف والواجهة (Google Fonts): Cache first مع تحديث خلفي لضمان عمل الرسم العثماني بلا إنترنت
  if (FONT_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(cacheFirstWithTimeout(event.request, STATIC_CACHE, 6000));
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

function isCacheableResponse(response) {
  return !!(response && (response.ok || response.type === 'opaque') && response.status !== 206);
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

    const response = await fetchWithTimeout(request, timeout);
    if (isCacheableResponse(response)) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const targetCache = await caches.open(cacheName).catch(() => null);
    const cached = (targetCache && await targetCache.match(request).catch(() => null)) ||
                   (await caches.match(request).catch(() => null));
    if (cached) return cached;
    return new Response('خطأ: لا يوجد اتصال', { status: 503 });
  }
}

async function networkFirstWithFallback(request, cacheName, timeout = 5000) {
  try {
    const response = await fetchWithTimeout(request, timeout);

    if (isCacheableResponse(response)) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }

    return response;
  } catch (err) {
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
      if (isCacheableResponse(response)) {
        caches.open(cacheName).then(c => c.put(request, response.clone()).catch(() => {}));
      }
    })
    .catch(() => {});
}

// ==================== Push Notifications ====================
self.addEventListener('push', event => {
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: './icons/icon-192.png',
      badge: './icons/icon-120.png',
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
