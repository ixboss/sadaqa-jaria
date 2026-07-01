// ==================== Service Worker — القرآن | حصن المسلم ====================
const CACHE_NAME = 'quran-app-v1';
const FONT_CACHE = 'quran-fonts-v1';
const API_CACHE = 'quran-api-v1';

// الموارد الأساسية للتخزين المسبق
const PRECACHE_URLS = [
  './',
  './index.html'
];

// نطاقات الـ API والخطوط
const API_ORIGIN = 'api.alquran.cloud';
const FONT_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// ==================== تثبيت Service Worker ====================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // في حالة الفشل، تثبيت بدون تخزين مسبق
      });
    }).then(() => self.skipWaiting())
  );
});

// ==================== تفعيل Service Worker ====================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key =>
          key !== CACHE_NAME && key !== FONT_CACHE && key !== API_CACHE
        ).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ==================== اعتراض الطلبات ====================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // =============== خطوط Google — Cache First ===============
  if (FONT_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // =============== Quran API — Cache First ===============
  if (url.hostname.includes(API_ORIGIN)) {
    event.respondWith(cacheFirst(request, API_CACHE));
    return;
  }

  // =============== index.html — Network First ===============
  if (request.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname.endsWith('index.html')) {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // =============== باقي الموارد — Network First مع Fallback ===============
  event.respondWith(networkFirst(request, CACHE_NAME));
});

// ==================== استراتيجية Cache First ====================
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    // غير موجود في الكاش — جلب من الشبكة وتخزينه
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch(e) {
    // الشبكة غير متاحة — ابحث في الكاش مرة أخرى
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    // إذا كان طلب API — أعد استجابة خطأ مناسبة
    const url = new URL(request.url);
    if (url.hostname.includes(API_ORIGIN)) {
      return new Response(
        JSON.stringify({ code: 0, status: 'لا يوجد اتصال بالإنترنت' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('غير متاح في وضع عدم الاتصال', { status: 503 });
  }
}

// ==================== استراتيجية Network First ====================
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch(e) {
    // الشبكة غير متاحة — ابحث في الكاش
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    // صفحة HTML غير موجودة في الكاش
    return new Response(
      `<!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>غير متاح</title>
        <style>
          body { background:#0f1117; color:#f0ece0; font-family:'Arial',serif;
                 display:flex; align-items:center; justify-content:center;
                 height:100vh; margin:0; text-align:center; direction:rtl; }
          h1 { color:#c9a84c; font-size:24px; }
          p { color:#9a9aaa; }
        </style>
      </head>
      <body>
        <div>
          <h1>لا يوجد اتصال بالإنترنت</h1>
          <p>يرجى التحقق من الاتصال وإعادة المحاولة</p>
        </div>
      </body>
      </html>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
