// ==================== Service Worker — إسلامي ====================
// v59: HTML من جيل الكاش نفسه (بلا إعادة تحقق خلفية) حتى لا يعمل «HTML جديد
//      مع JS قديم» أثناء انتظار موافقة المستخدم على التحديث؛ مطابقة أصول
//      حرفية للنطاقات (لا includes) وقصر الفرع الافتراضي على أصل التطبيق —
//      منع تسميم الكاش عبر نطاقات مزيّفة (audit 2026-11).
// v58: rebrand splash + About card + mushaf-scale honored by page fit (index.html, features.js, app-core.js)
// v57: STATIC_CACHE يشتق من CACHE_NAME (ينتقل مع كل إصدار) — يمنع «HTML جديد
//      مع JS قديم» بعد النشر؛ إخفاق التخزين المسبق يُبلَّغ للصفحة بدل تجاهله.
// سابقاً v54: استراتيجية التحديث prompt — العامل الجديد ينتظر حتى يوافق المستخدم
//      (رسالة SKIP_WAITING من sw-register.js)، فلا تنقطع جلسة قراءة نشطة أبداً.
const CACHE_NAME = 'quran-app-v59';
const API_CACHE = 'quran-api-v52';
// يتدرج مع CACHE_NAME تلقائياً — لا يبقى ثابتاً عبر الإصدارات (skew fix)
const STATIC_CACHE = CACHE_NAME.replace('quran-app', 'static');

const PRECACHE_URLS = [
  './',
  './index.html',
  './sw.js',
  './manifest.json',
  // نظام التصميم: أوراق CSS المنظّمة (tokens → base → layout → mushaf → adhkar)
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/mushaf.css',
  './css/adhkar-tasbih.css',
  // الوحدات: البيانات والنواة والميزات
  './js/surah-meta.js',
  './js/config.js',
  './js/khatmah.js',
  './js/adhkar.js',
  './js/tasbih.js',
  './js/app-core.js',
  './js/haptics.js',
  './js/celebrate.js',
  './js/stats.js',
  './js/app.js',
  './js/features.js',
  './js/tafsir.js',
  './js/backup.js',
  // محرّك المواقيت/القبلة الذهبي الموحّد (v2 core-data) — يلزم features.js بلا إنترنت
  './js/core-data.bundle.js',
  // محرّك المصحف الموحّد (فهرس الـ٦٠٤ صفحة) — يلزم القراءة بلا إنترنت
  './js/mushaf.js',
  // محرّك قلب الصفحات (السحب ثلاثي الأبعاد + بديل الحركة المخفّضة)
  './js/pageflip.js',
  './js/sw-register.js',
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
// استراتيجية prompt: لا skipWaiting هنا — العامل الجديد يبقى في حالة waiting
// حتى يضغط المستخدم "تحديث" فيتسلّم فوراً، أو يغلق كل تبويبات التطبيق لاحقاً.
// الإخفاقات تُجمع وتُبلَّغ للصفحة بعد التفعيل (v57) — بدل تبويعها صامتة
// فلا يُثبَّت وضع الأوفلاين جزئياً بلا علم أحد.
let precacheFailures = [];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u)))
    ).then(results => {
      precacheFailures = results
        .map((r, i) => (r.status === 'rejected' ? PRECACHE_URLS[i] : null))
        .filter(Boolean);
      if (precacheFailures.length) {
        console.warn('[sw] precache incomplete:', precacheFailures.join(', '));
      }
    })
  );
});

// تفعيل يدوي: يصل من بطاقة التحديث (زر "تحديث") في sw-register.js
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
    .then(() => {
      // أبلغ الصفحات عن أي إخفاق في التخزين المسبق — بطاقة أوفلاين جزئية
      if (!precacheFailures.length) return;
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(list => list.forEach(c => c.postMessage({ type: 'PRECACHE_INCOMPLETE', urls: precacheFailures })));
    })
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
  // مطابقة نطاق حرفية: *.api.alquran.cloud.evil.com لا يجوز أن يمر عبر كاشنا (audit 2026-11)
  if (FONT_ORIGINS.some(origin => url.hostname === origin)) {
    event.respondWith(cacheFirstWithTimeout(event.request, STATIC_CACHE, 6000));
    return;
  }

  // API requests: Cache first, fall back to network
  if (url.hostname === API_ORIGIN) {
    event.respondWith(cacheFirstWithTimeout(event.request, API_CACHE, 5000));
    return;
  }

  // Static assets: Stale-While-Revalidate — استجابة فورية من الكاش مع تحديث خلفي،
  // فلا تتعطل جلسة قراءة نشطة عند توفر نسخة مخزّنة
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstWithTimeout(event.request, STATIC_CACHE, 5000));
    return;
  }

  // HTML pages: من الكاش أولاً بلا إعادة تحقق خلفية — يتقاسم HTML وJS وCSS جيل
  // الكاش نفسه (CACHE_NAME)، فلا يعمل «HTML جديد مع JS قديم» أثناء انتظار
  // موافقة المستخدم على التحديث؛ الجيلان يتبادلان معاً عند التفعيل (audit 2026-11)
  // نفس قيد أصل التطبيق كما في الفرع الافتراضي — لا اعتراض لعناصر HTML خارجية
  if (url.origin === self.location.origin && (url.pathname.endsWith('.html') || url.pathname.endsWith('/'))) {
    event.respondWith(cacheFirstNoRevalidate(event.request, CACHE_NAME, 5000));
    return;
  }

  // Default: Network first — للطلبات من أصل التطبيق فقط؛ أي طلب خارجي آخر
  // يمر للمتصفح مباشرة ولا يُخزَّن في كاشنا إطلاقاً (منع تسميم الكاش، audit 2026-11)
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstWithFallback(event.request, CACHE_NAME));
    return;
  }
  // بلا respondWith: يترك المتصفح الطلب الأصلي يعبر كما هو
});

// ==================== Helper Functions ====================
function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp)$/.test(pathname);
}

function isCacheableResponse(response) {
  return !!(response && (response.ok || response.type === 'opaque') && response.status !== 206);
}

// مثل cacheFirstWithTimeout لكن بلا إعادة تحقق خلفية — HTML يجب أن يبقى في
// جيله مع JS/CSS المخزّنة حتى موافقة التحديث؛ إعادة التحقق الخلفية كانت ستُدخل
// HTML النسخة الجديدة في جيل قديم حي فتُعيد فتح باب عدم الاتساق (audit 2026-11)
async function cacheFirstNoRevalidate(request, cacheName, timeout = 5000) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetchWithTimeout(request, timeout);
    if (isCacheableResponse(response)) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request).catch(() => null);
    if (cached) return cached;
    return new Response('لا يوجد اتصال بالإنترنت', { status: 503 });
  }
}

async function cacheFirstWithTimeout(request, cacheName, timeout = 3000) {  try {
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

// ملاحظة: معالجات push/notificationclick حُذفت (2026-11 audit) — لا يوجد
// pushManager ولا اشتراك إشعارات في أي واجهة؛ الإشعارات داخل الصفحة فقط.
