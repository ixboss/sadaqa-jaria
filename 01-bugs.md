# 01 — Bugs & Weak Logic (End-to-End QA)

> **Part 1 of 4** in the *Islami / Sadaqah Jariyah PWA* code review.
> Sibling files: [`02-uiux.md`](02-uiux.md) · [`03-features.md`](03-features.md) · [`04-architecture.md`](04-architecture.md)

---

**Reviewer stance:** Senior Full-Stack Developer · UI/UX Expert · Lead QA Engineer
**Scope:** 13 files — `index.html` (~2306 lines, contains the entire live application), `app.js`, `features.js`, `sw.js`, `config.js`, `surah-meta.js`, plus PWA/SEO files (`.htaccess`, `manifest.json`, `robots.txt`, `sitemap.xml`, `security.txt`, `README.md`, `IMPROVEMENTS.md`)
**Mode:** Analysis only. **No code was written, rewritten, or modified.**

### Severity legend

| Marker | Meaning |
|--------|---------|
| 🔴 | Confirmed bug — user-facing impact or data loss |
| 🟠 | Logic that works but is fragile, incorrect at the edges, or will break on change |
| 🟡 | Minor / hygiene — low immediate impact, worth cleaning up |

---

## 🔴 Confirmed Bugs (High Severity)

### B-1. Widespread dead code in `app.js` and `config.js`

`app.js` is loaded with `defer` and instantiates 7 classes. After full trace analysis, **there is no call site anywhere** for `AdvancedSearch`, `ReadingProgressManager`, `StorageManager`, `DataSyncManager`, or `PerformanceMonitor`.

Classes that are *actually* used:

- `BookmarkManager` — used heavily ✔️
- `AnimationManager` — used ✔️
- `AccessibilityHelper` — used ✔️

Same story in `config.js`: `APP_CONFIG`, `Config`, and `FeatureDetection` are **never read by any code**.

**Consequence:** ~17KB downloaded, parsed, and executed on every page load — including a `console.log` and a `setInterval` — with zero user benefit.

**Fix:** Either wire these modules into the real code paths, or remove them. `config.js` in particular is well-designed and worth actually adopting. See `04-architecture.md` → R-5.

---

### B-2. `requestNotificationPermission()` is called on boot for no reason

**Location:** `app.js:445`

```js
ServiceWorkerManager.requestNotificationPermission().catch(() => {});
```

This runs inside the `DOMContentLoaded` handler. It means a **notification permission prompt fires immediately on first visit** — a well-known UX anti-pattern that directly lowers Lighthouse scores and irritates users before they have any context for why they're being asked.

**Correct behaviour:** request permission *only* when the user enables reminders — which `Reminders.enable()` already does correctly at `features.js:372`.

**Current state:** two competing permission-request paths exist. The boot-time one should be removed entirely.

---

### B-3. `checkMissedDays()` resets the wird every time you revisit the tab

**Location:** `index.html:1485`

```js
else if (tabId === 'khatmah') { checkMissedDays(); showScreen('khatmah-main', anim); updateKhatmahUI(); }
```

The function keys off `lastActiveDate` — but `lastActiveDate` is *also* updated by `completeWird()` and by `checkMissedDays()` itself, creating a self-referential update cycle. The result: after completing a wird, rescheduling occurs and the schedule advances while `lastPageRead = nx - 1` (a sentinel value rather than a real position).

Additionally, with the `days` method, repeated recomputation **loses the original total-days tracking**, so the khatmah silently drifts past its intended completion date.

**Fix:** compute `remaining pages ÷ remaining days` dynamically instead of freezing `pagesPerDay` at setup time, and stop calling `checkMissedDays()` on every tab visit — call it once per day boundary instead.

---

### B-4. Khatmah bookmark button is wired but does not exist in the DOM

**Location:** `index.html:1531-1534`

```js
if (type === 'khatmah' && !state.khatmah) return;
const btn = type === 'surah' ? document.getElementById('btn-bm-surah') : null;
const id = type === 'surah' ? state.currentSurah.number : state.khatmah.currentPage;
const name = type === 'surah' ? state.currentSurah.name : `صفحة ${state.khatmah.currentPage}`;
```

`toggleBookmark('khatmah')` is fully supported in the logic (lines 1531, 1533, and the resume path at 1574) — but `btn` is hardcoded to `null` for anything other than `'surah'`.

**Consequence:** a complete code path is unreachable. `state.bookmark.type === 'khatmah'` can only ever be satisfied programmatically; the "resume khatmah" flow at line 1575 can never be triggered by a real user interaction in the current build.

**Fix:** Either add the missing bookmark button to the khatmah reader UI, or delete the dead branch. Half-implemented features are worse than absent ones — they imply support that isn't there.

---

### B-5. `renderSurahList` — silent XSS hole in search highlighting

**Location:** `index.html:1620`

```js
nameHtml = s.name.replace(regex, '<span class="highlight">$1</span>');
```

`${s.name}` is interpolated directly into HTML **without escaping**. Data comes from an external API (`api.alquran.cloud`) or the local `SURAH_META` fallback.

**Practical risk:** low today, because both sources are trusted. But the golden rule is broken — and the rest of the app *does* use `escapeHtml` (defined at `features.js:119`). The following functions skip it:

- `renderSurahList` (`index.html:1620`)
- `renderOccasionPage` (`index.html:2024`)
- `openCategory` (`index.html:1867`)

**Consequence:** inconsistent escaping discipline becomes a real vulnerability the moment the data source changes or gains user-supplied content (e.g. a future search history feature).

**Fix:** route all interpolation through `escapeHtml`, and make it a shared utility rather than a `features.js` local.

---

### B-6. Tasbih count: streak recorded per *lap*, not per *tap* — partial counts are lost

**Locations:** `index.html:1977`, `index.html:1998`

```js
// 1977 — inside the tap handler, on lap completion
if (window.StatsManager) StatsManager.recordTasbih(goal);
```

```js
// 1998 — the reset button
document.getElementById('tasbih-reset-btn').addEventListener('click', () => {
  tasbihCount = 0; tasbihLap = 0;
  document.getElementById('tasbih-msg').classList.remove('active');
  updateTasbihUI();
});
```

`StatsManager.recordTasbih(count)` is designed to accept any number — as shown by its signature at `features.js:48-52`:

```js
recordTasbih(count = 1) {
  const s = this.getAll();
  s.totalTasbih = (s.totalTasbih || 0) + count;
  this.save(s);
}
```

But it is only ever called with the **full target**, once per completed lap.

**Consequence:** `totalTasbih` is numerically correct for *completed* laps, but **every tap that did not complete a lap is silently discarded** — including on reset. A user who made 30 tasbih and then pressed Reset ends up with **0 recorded**. For an app whose entire purpose is spiritual accounting, this is genuine data loss.

**Fix:** record incrementally on each tap (or at minimum, flush the outstanding partial count on reset and on page unload).

---

### B-7. `updateTasbihUI` writes to `localStorage` with no `try/catch`

**Location:** `index.html:1957-1958`

```js
localStorage.setItem('tasbihCount', tasbihCount);
localStorage.setItem('tasbihLap', tasbihLap);
```

This sits outside any protection. The rest of the app is carefully hardened — see the explicit comment at `index.html:1843`:

> *"Daily adhkar progress — wrapped in try/catch (private browsing disables localStorage)"*

The read path is equally exposed, at `index.html:1892-1893`:

```js
let tasbihCount = parseInt(localStorage.getItem('tasbihCount') || '0', 10);
let tasbihLap = parseInt(localStorage.getItem('tasbihLap') || '0', 10);
```

**Consequence:** in Safari Private Mode, or when storage quota is exceeded, **this throws and breaks every single tasbih tap.** The failure mode is especially bad: the app's most-used interaction dies silently on an entire class of browsers/devices.

**Fix:** wrap both the read and write paths, falling back to in-memory counters. Better: route through the already-written `StorageManager` in `app.js` (which is hardened) instead of calling `localStorage` directly — see `04-architecture.md` → R-4.

---

## 🟠 Weak / Fragile Logic (Medium Severity)

### B-8. `AdvancedSearch.fuzzyMatch` does not work with Arabic at all

**Location:** `app.js:186-200`

The implementation compares characters one-by-one. But `allSurahs` Arabic text is un-vocalised, and Arabic search requires normalisation of hamza forms (`أ/إ/آ → ا`) and ta-marbuta before any comparison is meaningful.

The **real, working** implementation lives in `index.html:2157` and does exactly this normalisation:

```js
const norm = text => text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[\u064B-\u065F]/g, '');
```

**Consequence:** if `AdvancedSearch` were ever actually used, it would fail to match almost everything. This is further confirmation that it is dead code (see B-1).

**Fix:** delete it, or refactor so both paths share one normalisation utility.

---

### B-9. `stripBismillah` — two unhandled edge cases

**Location:** `index.html:1066-1088`

The normalisation logic is genuinely clever — it strips diacritics, unifies alef forms, and correctly excludes Al-Fatiha (where Bismillah is a standalone ayah) and At-Tawba (which has none). However:

1. It assumes **"Bismillah is always 4 words."** In some Uthmani renderings it may appear with a waqf mark or joined to the following word.
2. If the ayah text is **≤ 4 words** it returns `''` (line 1086):

```js
const words = text.trim().split(/\s+/);
if (words.length <= 4) return '';
```

That is correct when the text *is* a Bismillah — but it would **delete the entire ayah** if the input ever varied.

**Consequence:** the guard here is "safe by luck," not safe by design. It depends on API behaviour remaining constant forever.

**Fix:** return the original text when the strip would produce an empty string, and make the exclusion list data-driven.

---

### B-10. `navigateBack()` can land on the wrong screen

**Location:** `index.html:1362-1370`

```js
function navigateBack() {
  const prev = state.previousScreen;
  const backTo = ['surah-list', 'athkar-list', 'khatmah-main'].includes(prev) ? prev : null;
  const fallback = backTo || rootScreenOf(state.previousTab || state.currentTab);
  ...
}
```

`previousScreen` is updated on every `showScreen` call, but with tab switching, deep links (`DeepLinks.update` uses `history.replaceState`), and swipe gestures all mutating navigation state independently, `previousTab` and `previousScreen` can desynchronise.

**Consequence:** the back button can drop you into `athkar-list` when you were in Khatmah. Works correctly only on the happy path.

**Fix:** maintain a proper navigation history stack rather than two loosely-coupled variables.

---

### B-11. `getStreak()` returns 0 for an unbroken streak

**Location:** `features.js:60-71`

```js
getStreak() {
  const days = Object.keys(this.getAll().days || {}).sort();
  if (!days.length) return 0;
  let streak = 0;
  let cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  for (;;) {
    const key = `${cursor.getFullYear()}-...`;
    if (days.includes(key)) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}
```

The loop begins at **today**. If the user read yesterday but has not yet read today, the very first iteration misses and the function returns `0`.

**Consequence:** the streak display — a core motivational feature — **incorrectly shows 0 for an unbroken streak**. A user with a 40-day streak who opens the app in the morning sees "0", which is actively demoralising and factually wrong.

**Fix:** if today is absent from `days`, start the cursor at yesterday before counting.

---

### B-12. `AdvancedSearch` relevance ordering is flawed

**Location:** `app.js:155-180`

Number search sits in an `else if`, so a surah whose name happens to contain the digit will not match. `relevance` is a hardcoded 100/100/50 with **no alphabetical tiebreaker**, so results with equal scores have unstable ordering across runs.

**Fix:** use weighted scoring plus a stable secondary sort. Or delete — see B-8.

---

### B-13. Scroll position saved for only two screens

**Location:** `index.html:1311`

```js
if(state.currentScreen && ['surah-list', 'athkar-list'].includes(state.currentScreen)) state.scrollPositions[state.currentScreen] = contentArea.scrollTop;
```

Only two screens participate in scroll restoration.

**Consequence:** scroll a long dua list, navigate forward then back → **you are returned to the top**. Same for occasions, bookmarks, and settings. On a long adhkar category this is a real annoyance.

**Fix:** persist scroll for all scrollable screens generically.

---

### B-14. `sw.js` — `cache-first` for API with no TTL enforcement

**Location:** `sw.js:56-60`

```js
if (url.hostname.includes(API_ORIGIN)) {
  event.respondWith(cacheFirstWithTimeout(event.request, API_CACHE, 5000));
  return;
}
```

Requests to `api.alquran.cloud` are always served from cache. But **there is no expiry logic anywhere in the Service Worker** — the 7-day TTL described in `config.js:26` and claimed in `IMPROVEMENTS.md` is not implemented at the SW layer.

**Consequence:** a temporary API error response, or a corrupted payload, **is cached permanently** until `CACHE_NAME` is manually bumped. There is no self-healing.

**Fix:** store a timestamp alongside each cached API response and revalidate when stale. For Quranic text specifically, correctness must outweigh response speed.

---

### B-15. `sw.js` — no offline support for fonts

**Location:** `sw.js:69-81`

```js
if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
  event.respondWith(networkFirstWithFallback(event.request, CACHE_NAME));
  return;
}
```

`isStaticAsset()` only tests the pathname, so cross-origin font files from `fonts.gstatic.com` never match and are never cached.

**Consequence:** **no true offline experience for the Mushaf typography** — the heart of the app. Offline, the Quranic text renders in a fallback font, undermining the entire reading experience that the app was built around.

**Fix:** add an explicit font-origin caching strategy (cache-first, long-lived) for `fonts.gstatic.com` and `fonts.googleapis.com`.

---

### B-16. `manifest.json` — `data:` URI icons will not install on iOS

**Location:** `manifest.json:15`, `manifest.json:21`, `index.html:35`

```json
{ "src": "data:image/svg+xml,%3Csvg ...", "sizes": "192x192", "type": "image/svg+xml", "purpose": "any" }
```

**iOS Safari rejects `data:` URI icons in the web manifest** for PWA installation — it requires real files served over HTTP with a raster format (`.png`). The same problem affects `apple-touch-icon` at `index.html:35`.

**Consequence:** the app **will not install correctly on iPhone**, despite `IMPROVEMENTS.md` explicitly claiming "Installable App ✅" and listing iOS Safari 14+ as supported.

**Fix:** generate real `192x192` and `512x512` PNG files and reference them by URL.

---

### B-17. `.htaccess` — the CSP will actively break the app

**Location:** `.htaccess:21`

```apache
Header set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.alquran.cloud; frame-ancestors 'none';"
```

Two distinct problems:

1. **`'unsafe-inline'` completely nullifies the CSP's XSS protection.** It permits arbitrary inline script execution, which is the exact threat CSP exists to mitigate. This makes the header security theatre — it satisfies a scanner without providing protection.
2. **`connect-src` omits `cdn.islamic.network`** — the audio source hardcoded at `features.js:301`:

```js
return `https://cdn.islamic.network/quran/audio-surah/128/${reciter}/${surah}.mp3`;
```

**Consequence:** 🔴 **Once these headers are live, recitation playback will fail outright.** The browser will block the audio fetch. This is a functional regression introduced by a security control — the worst kind, because it looks like a hardening measure.

**Fix:** add `cdn.islamic.network` to `connect-src`. Remove `'unsafe-inline'` after migrating inline handlers to `addEventListener` (see `04-architecture.md` → R-2).

---

### B-18. `.htaccess` — `FilesMatch` blocks `manifest.json`, breaking PWA install

**Location:** `.htaccess:102-106`

```apache
<FilesMatch "^\.|\.json$|\.sqlite$|\.db$|\.env">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
</FilesMatch>
```

The `\.json$` rule **denies access to `manifest.json`** — the exact file the browser must fetch to install the PWA.

**Consequence:** 🔴 installation fails on every platform, not just iOS. The browser requests the manifest, receives 403, and the install prompt never appears.

**Fix:** narrow the pattern to specific sensitive filenames rather than the blanket `\.json$`. Note: the deny rule is clearly *intended* to protect data files — the intent is right, the pattern is too broad.

---

### B-19. `.htaccess` — SPA 404 handling is bad for SEO

**Location:** `.htaccess:98-99`

```apache
ErrorDocument 404 /index.html
ErrorDocument 500 /index.html
```

Combined with the rewrite rule at line 11 and an SPA architecture, **every 404 returns HTTP 200** with the app shell.

**Consequence:** search engines index an unbounded number of URLs that all serve identical content ("soft 404s"). This dilutes crawl budget and can trigger thin-content penalties.

**Fix:** serve a real 404 status for genuinely missing resources while keeping the SPA fallback for valid routes.

---

## 🟡 Minor Issues (Low Severity)

| ID | Location | Issue |
|----|----------|-------|
| **B-20** | `index.html:2024` | `renderOccasionPage` injects `o.title` / `o.sunnahs` without escaping. Internal data, so low risk — but inconsistent with the app's own `escapeHtml` convention. |
| **B-21** | `app.js:325` | `if ('web-vital' in window)` — no such event exists on any platform. This branch can never execute. |
| **B-22** | `features.js:413` | `Reminders.remindersEnabled()` is a verbatim duplicate of `Settings.remindersEnabled()`. Logic duplication across two modules. |
| **B-23** | `sw.js:193` | `if (client.url === './' && 'focus' in client)` compares an absolute URL against a relative string → **never true**. Tapping a notification opens a new window instead of focusing the existing one. |
| **B-24** | `index.html:1806` | Prefetch of the next page via a bare `fetch(...)` is **never stored in any cache** → wastes bandwidth with zero benefit. Should write into the SW cache or be removed. |
| **B-25** | `index.html:2032` | The `ath_` key cleanup iterates **every** `localStorage` entry on each boot. As storage grows this slows startup. Prefer scoped prefix deletion. |
| **B-26** | `robots.txt:11`, `sitemap.xml:7`, `security.txt:4` | All reference the placeholder domain `islami-app.local`. **Must be replaced with the real domain before deploy** — otherwise broken indexing plus an invalid `security.txt` (RFC 9116 requires a reachable canonical URL). |
| **B-27** | `README.md`, `IMPROVEMENTS.md` | **Documentation contradicts the code.** `IMPROVEMENTS.md` claims "19/19 tests passed", "Lighthouse 95+", "IndexedDB", and "CSRF Protection" — but there is **no test file in the project**, no IndexedDB usage, and no server that could implement CSRF. See the warning below. |

---

## ⚠️ Cross-cutting warning: do not trust `IMPROVEMENTS.md`

`IMPROVEMENTS.md` presents itself as a verified completion report:

> *"✅ All improvements applied successfully"* … *"Total: 19/19 tests ✅"* … *"Lighthouse Score: 95+"*

The audit found **no test files, no Lighthouse report, and no IndexedDB implementation** anywhere in the project. B-16, B-17, and B-18 describe defects that would each have been caught by exactly the kind of testing that document claims was performed.

**Treat `IMPROVEMENTS.md` as a design intention list, not as a specification or a verification record.** Any model or engineer using it as ground truth will build on false assumptions. This is the single most damaging credibility problem in the repository — more consequential than any individual bug above, because it actively misleads whoever works on the code next.

---

## Verified line-reference index

Every reference in this document was confirmed by direct file reads:

| Finding | Reference |
|---------|-----------|
| B-2 | `app.js:445` |
| B-3 | `index.html:1485` |
| B-4 | `index.html:1531-1534`, `index.html:1575` |
| B-5 | `index.html:1620`, `features.js:119` |
| B-6 | `index.html:1977`, `index.html:1998`, `features.js:48-52` |
| B-7 | `index.html:1892-1893`, `index.html:1957-1958`, `index.html:1843` |
| B-8 | `app.js:186-200`, `index.html:2157` |
| B-9 | `index.html:1066-1088` |
| B-10 | `index.html:1362-1370` |
| B-11 | `features.js:60-71` |
| B-12 | `app.js:155-180` |
| B-13 | `index.html:1311` |
| B-14 | `sw.js:56-60`, `config.js:26` |
| B-15 | `sw.js:69-81` |
| B-16 | `manifest.json:15`, `manifest.json:21`, `index.html:35` |
| B-17 | `.htaccess:21`, `features.js:301` |
| B-18 | `.htaccess:102-106` |
| B-19 | `.htaccess:98-99`, `.htaccess:11` |
| B-21 | `app.js:325` |
| B-22 | `features.js:413` |
| B-23 | `sw.js:193` |
| B-24 | `index.html:1806` |
| B-25 | `index.html:2032` |
| B-26 | `robots.txt:11`, `sitemap.xml:7`, `security.txt:4` |

---

**Next:** [`02-uiux.md`](02-uiux.md) — UI/UX & animation review (A-1…A-7, U-1…U-10)
