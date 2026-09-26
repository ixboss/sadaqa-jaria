# Verification Report — Phases 0–4

Evidence-backed record of what was inspected, what was fixed, and what remains
**Not verified**. Generated 2026-09-25. Every fix below has a test that fails
without it.

---

## Phase 0 — Baseline

Audited the live deployment and the current source (not the older review docs)
before changing anything. Stale claims in `01-bugs.md` / `IMPROVEMENTS.md` were
re-checked; several were already fixed or never applied (see "Not a bug"
below). No code was changed during the audit.

---

## Phase 1 — Core correctness and user-state safety

**Three confirmed defects, each reproduced first, then fixed:**

| # | Defect | Fix | Test |
|---|---|---|---|
| 1 | Khatmah progress could go *backwards*: re-reading an earlier page overwrote `lastPageRead` | `loadKhatmahPage` now records `Math.max(lastPageRead, pageNum)` | `e2e-khatmah-lifecycle.mjs` (20/20) |
| 2 | `resumeBookmark` (the FAB) opened the reader on a *stale* wird and left `lastActiveDate` old, so the first tab switch silently rescheduled | `resumeBookmark` calls `checkMissedDays()` before opening the reader | same suite, scenario (f) |
| 3 | Opening the Tasbih screen reset the persisted counter to 0 (bead-building and counter-reset were one function) | Split into `buildTasbihBeads()` (view) and `window.rebuildTasbih()` (target change); `buildTasbih()` no longer touches counters | same suite, scenario (g) |

**Verified already correct — guarded with tests instead of changed:**

- Reading-position record + restore across reload (`e2e-progress-streak.mjs`, 11/11): openSurah(2,5) → position recorded → reload → resume FAB offers it → click reopens surah 2 / ayah 5 at `#/surah/2/5`.
- Streak math over synthetic day sets: consecutive days, today-not-yet-read, a gap, empty, future-only.
- Bookmark add/remove/persistence (via `BookmarkManager`), adhkar pager (79/79), Quran layout margins (5/5).

**Not a bug (contrary to older review notes):** the alquran.cloud cache integrity
check correctly *rejects* a fake `/surah/N` payload whose ayah count doesn't
match the real surah list. A probe attempting to substitute one failed — that
was the check working.

---

## Phase 2 — Local-data protection

`backup.js` (new) implements export / import / clear over the 13 user-data keys.

- **Schema:** `{schema:'islami-backup', version:1, app, created, data}`. Regenerable keys are deliberately excluded: `ath_<date>_*` daily adhkar progress, `q_s_u_*` Quran text cache (7-day TTL), `reciter_wps_*` calibration, `occasion_popup_last_period`.
- **Validation:** per-key type and shape (bookmarks must be objects with a numeric `surah`; `tasbih_target`/theme/reciter are allowlisted; reciter checked against `Settings.RECITERS`). Unknown keys are ignored (future-schema safe); a *higher* version is rejected with "update the app first". A malformed key is skipped, never fatal to the rest.
- **Never evaluates imported strings** — no `eval`/`Function`; anything rendered in a preview is HTML-escaped. Verified by a unit test that tries an injection payload and asserts it is neither evaluated nor accepted.
- **Confirmation:** import and clear both show an itemised preview / scope disclosure in the existing dialog and write nothing until the user confirms; then reload, since all state is rebuilt from storage at boot.
- **Resilience:** a quota failure on one key is caught and reported; the other keys still apply.

**Verified:** `unit-backup.mjs` 35/35 (validation, round trip, quota resilience) · `e2e-backup.mjs` 29/29 in a real browser — settings UI rows, a real export blob, import through the real confirm dialog → reload → restored theme *live on boot*, and clear through the real confirm dialog → reload → defaults. Layout checked at 320px and 390px: no overflow, chips inside the card.

**Not verified:** importing on a device where localStorage is near its quota, and Safari's file-picker behaviour for the hidden `<input type=file>`.

---

## Phase 3 — Offline capability

**Verified what already works** before changing the service worker
(`e2e-offline-shell.mjs`, 11/11): after the first online load, cutting the
connection at the network layer and reloading *cold* still boots the app,
renders all 114 surahs of the bundled index, opens Settings, and runs a full
backup export with zero network access.

**One confirmed defect found and fixed:** `backup.js` was absent from
`PRECACHE_URLS`, so a fresh install that lost connectivity before its first
load would silently lose the backup module. Added to the precache list.
The API cache name (`quran-api-v42`) is deliberately **not** version-bumped, so
offline readers keep their cached Quran text across future SW updates.

**README corrected** — its caching table had the strategies backwards. Static
assets are *network-first with cache fallback*; API responses are *cache-first
with a 5s timeout plus a background `no-store` refresh*. Now matches `sw.js`.

**Not verified / open:** real-device install, iOS Safari, and the offline
audio path (audio still streams per-ayah MP3 by design). The offline Quran
*text* path shipped in Phase 3b — see below.

---

## Phase 4 — PWA, hosting, security

| Check | Result |
|---|---|
| `manifest.json` valid, all fields, `lang: ar`, `dir: rtl` | ✅ valid JSON, served as JSON |
| Icons: 5 PNG + 2 maskable + apple-touch variants | ✅ all 7 files exist and resolve on the live host |
| Manifest shortcut URLs deep-link on cold load | ✅ all 7 routes (`#/khatmah`, `#/athkar`, `#/tasbih`, `#/bookmarks`, `#/settings`, `#/quran`, `#/surah/18`) — `probe-deeplinks.mjs` |
| 404 behaviour on the live host | ✅ real **404** for a missing path — no soft-404 |
| `robots.txt` / `sitemap.xml` domain | ❌ pointed at `islami-app.local` (non-resolvable) → fixed to the real deployment |
| Sitemap hash routes | ❌ `#quran`/`#athkar`/`#khatmah` used a form the router doesn't emit → fixed to `#/…`; `#/quran` is now also an explicit route (it previously worked only because the Quran list is the default screen) |
| JSON-LD `url` + canonical | ❌ pointed at `islamiapp.com` (does not resolve) → fixed; added `<link rel=canonical>` (one canonical covers all hash routes) |
| `security.txt` (RFC 9116) | ❌ claimed CSP/CORS/X-Frame-Options that **do not exist** anywhere in the app, and its canonical was unreachable → rewritten with what is actually true; mirrored to `.well-known/` |
| `.well-known/security.txt` served | ❌ 404 — GitHub Pages' default Jekyll build skips dot-directories. No `_config.yml`, `_posts` or Liquid exists in the repo, so `.nojekyll` was added (verified: 404 → 200, nothing else broke) |
| Content-Security-Policy | **None present.** See below |

### CSP assessment (not implemented, deliberately)

The app makes requests to exactly four external origins, verified by grepping
every source file: `api.alquran.cloud` (Quran text), `cdn.islamic.network`
(audio), `fonts.googleapis.com` / `fonts.gstatic.com` (fonts). It also uses an
inline `<script>` (the main app body), inline `<style>`, and a data-URI SVG
favicon.

A *meaningful* CSP would need to remove `'unsafe-inline'` for scripts, which
means extracting the inline script to an external file and rewriting the
inline `onclick` handlers — a real migration, not a one-line addition. A CSP
that keeps `'unsafe-inline'` adds almost nothing. Per the plan this is a
targeted migration that must preserve current operation, so it was **not**
done. Recommendation: worth doing, but as its own change with a full test run.

---

## Phase 3b — offline Quran corpus (`mushaf.js`): shipped

The user chose **"Audit and ship it"**. The engine is now committed, wired in,
and covered by two new suites. It was rewritten before shipping: the original
stored the ~1.4 MiB corpus in `localStorage` (which the plan explicitly rules
out for a payload this size); the shipped version uses versioned IndexedDB.

**Provenance and licence.** The text is the same source the reader already
uses online — `api.alquran.cloud`, edition `quran-uthmani`. No new provider,
no second copy of the text, no fabricated content. The endpoint is public and
free; the corpus is fetched once, on the user's explicit tap, and stored only
on the device.

**Integrity gate** (`verifyPayload`, runs before anything is written):

| Check | Rejection reason |
|---|---|
| exactly 114 surahs, numbered in order | "عدد السور لا يساوي ١١٤" |
| per-surah ayah count matches the bundled `SURAH_META` | "عدد آيات السورة N لا يطابق الفهرس" |
| every ayah has non-empty text | "آية فارغة في السورة N" |
| every ayah's page is 1–604 | "رقم صفحة غير سليم" |
| total is exactly 6236 ayahs | "مجموع الآيات … لا يساوي ٦٢٣٦" |
| every page 1–604 is non-empty | "الصفحة N فارغة" |

**Atomic replacement.** The new `meta` and `payload` are written in a single
IndexedDB transaction; a load reads `payload` first and only accepts it if it
re-indexes to 6236 ayahs. A failed or cancelled download never replaces a
working corpus, and the compact schema is versioned (`v: 2`) so an older blob
is rejected rather than silently misread.

**Download flow.** Settings → «القرآن بدون إنترنت»: status card with download
/ progress bar / cancel / delete, driven by `QuranOffline` in `features.js`.
The fetch is read as a stream so progress is real (bytes in, not a spinner),
`cancelDownload()` aborts it via `AbortController`, and failures surface a
retry-able error state. The card names the source (alquran.cloud) inline.

**Reader integration.** `loadKhatmahPage` renders from the local corpus when
`MushafPageManager.ready` is set, with identical markup to the network path —
proven, not assumed: `e2e-mushaf.mjs` renders page 293 both ways and asserts
equal ayah / surah-header / bismillah / mushaf-block counts, and that the
surah-header text is byte-identical (the source's voweled «سُورَةُ الكَهۡفِ»,
not the plain index name). If the corpus is absent or deleted, the existing
network path is unchanged.

**Safari fallback.** If IndexedDB is unavailable (private browsing on Safari),
the corpus falls back to `localStorage` after the same integrity gate; if that
also fails, the download errors out cleanly and the app keeps working online.

**Not verified:** real-device download speed on mobile networks, iOS Safari
IndexedDB behaviour in private mode (the fallback path is unit-tested but not
device-tested), and disk usage on low-storage devices.

---

## Test ledger

| Suite | Assertions | What it covers |
|---|---|---|
| `unit-mushaf.mjs` | 36/36 | Integrity gate (all rejection cases), compact round trip, persistence across reload, cancellation, erase, byte-accurate progress |
| `e2e-mushaf.mjs` | 30/30 | Real download through the UI → offline Khatmah reading with the network cut → structural parity with the online path → delete → network fallback |
| `unit-backup.mjs` | 35/35 | Validation, malformed input, injection, round trip, quota |
| `e2e-backup.mjs` | 29/29 | Export/import/clear in a real browser, incl. reload + live restore |
| `e2e-offline-shell.mjs` | 11/11 | Cold boot with the network cut; precache completeness |
| `e2e-khatmah-lifecycle.mjs` | 20/20 | Khatmah lifecycle + the three Phase 1 fixes |
| `e2e-progress-streak.mjs` | 11/11 | Reading position + streak edge cases |
| `e2e-adhkar-pager.mjs` | 79/79 | Adhkar pager (pre-existing) |
| `e2e-quran-layout.mjs` | 5/5 | Reader layout margins (pre-existing) |
| `service-worker-cache.mjs` | pass | Cache-first + background refresh (pre-existing) |
| `probe-deeplinks.mjs` | 7/7 | Manifest/sitemap deep links cold-loaded |
| `probe-backup-geometry.mjs` | 320px + 390px | Backup row layout, no overflow |

All suites were re-run green after every change in this report.
