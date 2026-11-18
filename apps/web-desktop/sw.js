// ============================================================================
// sw.js — v2 shell SW. Precache: app shell + vendor wasm + tokens. Runtime
// cache-first: QPC1 per-page fonts + audio packs (offline after first visit).
// Update strategy (v1 contract): prompt-based; skipWaiting ONLY via message.
// ============================================================================
const CACHE = 'sadaqa-v2-v6';
const SHELL = [
  'index.html',
  '../../icons/icon-192.png',
  '../../icons/icon-512.png',
  '../../packages/design-tokens/tokens.css',
  'assets/fonts/uthmanic/UthmanicHafs1Ver18.woff2',
  'manifest.json',
  'styles/shell.css',
  'styles/mushaf.css',
  'styles/sheets.css',
  'styles/tools.css',
  'js/main.js',
  'js/app-state.js',
  'js/platform/bridge.js',
  'js/data/db.js',
  'js/data/db-worker.js',
  'js/data/migrate-v1.js',
  'js/data/uuid7.js',
  'js/data/backup.js',
  'js/data/audio-catalog.js',
  'js/ui/router.js',
  'js/ui/screens/mushaf.js',
  'js/ui/screens/search.js',
  'js/ui/screens/ayah-sheet.js',
  'js/ui/screens/khatmah.js',
  'js/ui/screens/audio.js',
  'js/ui/screens/today.js',
  'js/ui/screens/athkar.js',
  'js/ui/screens/tasbih.js',
  'js/ui/screens/tools.js',
  'js/ui/screens/backup.js',
  'js/ui/screens/surah-index.js',
  'assets/audio/catalog.json',
  'vendor/sqlite-wasm/index.mjs',
  'vendor/sqlite-wasm/sqlite3.wasm',
  '../../packages/core-data/build/sadaqa.db',
  '../../packages/core-data/engines/prayer.js',
  '../../packages/core-data/engines/hijri.js',
  '../../packages/core-data/engines/qibla.js',
  '../../packages/core-data/engines/search.js',
  '../../packages/core-data/engines/backup-merge.js',
  '../../packages/core-data/engines/backup-validate.js',
  '../../packages/core-data/engines/reminders.js',
  '../../packages/core-data/engines/smart-card.js',
  '../../packages/core-data/vendor/adhan/Adhan.js',
  '../../packages/core-data/vendor/adhan/Astronomical.js',
  '../../packages/core-data/vendor/adhan/CalculationMethod.js',
  '../../packages/core-data/vendor/adhan/CalculationParameters.js',
  '../../packages/core-data/vendor/adhan/Coordinates.js',
  '../../packages/core-data/vendor/adhan/DateUtils.js',
  '../../packages/core-data/vendor/adhan/HighLatitudeRule.js',
  '../../packages/core-data/vendor/adhan/Madhab.js',
  '../../packages/core-data/vendor/adhan/MathUtils.js',
  '../../packages/core-data/vendor/adhan/PolarCircleResolution.js',
  '../../packages/core-data/vendor/adhan/Prayer.js',
  '../../packages/core-data/vendor/adhan/PrayerTimes.js',
  '../../packages/core-data/vendor/adhan/Qibla.js',
  '../../packages/core-data/vendor/adhan/Rounding.js',
  '../../packages/core-data/vendor/adhan/Shafaq.js',
  '../../packages/core-data/vendor/adhan/SolarCoordinates.js',
  '../../packages/core-data/vendor/adhan/SolarTime.js',
  '../../packages/core-data/vendor/adhan/SunnahTimes.js',
  '../../packages/core-data/vendor/adhan/TimeComponents.js',
  '../../packages/core-data/vendor/adhan/TypeUtils.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE && key.startsWith('sadaqa-')) await caches.delete(key);
    }
    // no skipWaiting here — the page decides via message (v1 contract)
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // per-page QPC1 + UthmanicHafs fonts + bundled/downloaded audio: cache-first (offline after first visit)
  if (url.pathname.includes('/assets/fonts/') || url.pathname.includes('/audio-packs/') || url.pathname.includes('/assets/audio/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    })());
    return;
  }
  // shell + shared packages + bundled db: cache-first with network fallback
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(e.request, { ignoreSearch: true });
      return hit ?? fetch(e.request);
    })());
  }
});
