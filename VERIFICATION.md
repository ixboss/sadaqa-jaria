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

---

# Verification Report — Quran reader: readability, back button, post-back nav

Generated 2026-09-27, on branch `fix/quran-reader-theme-back-nav` (4 commits on
top of `3de6958`, nothing pushed). Three reported defects, each root-caused
before it was touched. Every fix is one independently revertable commit.

## Defect 1 — Quran page extremely bright/unreadable

**Not one wrong color — a theming seam.** The `--mushaf-paper/-2/-ink/-frame`
tokens were declared on `:root` as hard-coded light-cream values, *deliberately*
decoupled from the app theme. In dark mode (the app default) the reader swaps
the whole dark app for a full-height light page, and zen mode additionally hides
`#header` and `#nav`, so every pixel on screen was bright paper. `applyTheme`
never re-applied reader settings, and the `body.theme-light` block contained
zero `--mushaf-*` overrides.

**Fix (commit 1):** a third page theme `night` (dark paper, warm off-white ink,
muted gold frame); `reader_theme` default changed from `heritage` to `auto`,
which resolves against `body.theme-light` (`night` in dark, `heritage` in
light); `applyTheme` now re-runs `ReaderSettings.applyAll()` so the page tracks
the app live. Light mode is byte-for-byte unchanged for anyone who never opened
the setting (`auto` → `heritage` = the previous look).

**Secondary defect found while investigating:** `.surah-h-meta` was
`rgba(244,241,232,0.85)` — near-white on the near-white topbar card in light
mode *and* on the cream page, i.e. invisible everywhere. Now follows
`--text-dim` in light mode.

**Measured contrast (WCAG relative luminance), `probe-reader-theme.mjs` 13/13:**

| Page theme | Paper | Ink | Contrast |
|---|---|---|---|
| dark auto → night | `#17211d` | `#ece4cf` | **13.03** |
| light auto → heritage | cream | dark ink | **14.04** |
| light `.surah-h-meta` | — | — | **5.01** (was ~1.2) |

Explicit `heritage`/`floral`/`night` overrides still work, and toggling the app
theme re-resolves an `auto` page live without a reload.

## Defect 2 — No back button on the Quran page

**Root cause:** the shared `#back-btn` lives in `#header`, but
`body.mushaf-zen #header { display: none }` removes it entirely, and the reader
topbar had only ☰ / 🔍 / ⚙. The reader *was* correctly pushed on `screenStack`,
so `navigateBack()` worked — only the trigger was missing.

**Fix (commit 2):** two triggers, both calling the existing `navigateBack()` —
`#mt-back` in the HUD topbar and `#ghost-back` at the start edge of the zen
chrome — colored with `--mushaf-ink`/`--mushaf-frame-soft` so their contrast
follows the page theme rather than the app chrome. No new routing, no new
component.

**Bonus defect found by the geometry probe:** the HUD topbar was entirely behind
`#header` (z-index 7 vs 100) — ☰ / 🔍 / ⚙ were unreachable and the wird banner
hung over the header. The topbar *is* the HUD (per the intent of 2995b9d /
d85b43a), so `#header` is now hidden in HUD as well as zen,
`#screen-mushaf` is `position: relative` so reader chrome anchors to the reader,
and `#reading-progress-container` moved into the topbar so the khatmah scrubber
survives. `probe-reader-back.mjs` 22/22: zen header/nav hidden, ghost-back
visible/hit-testable/at the RTL start corner, HUD topbar at y=0, every HUD
button hit-testable, both back buttons land on `surah-list`.

## Defect 3 — Bottom nav disappears after Browser Back

**Root cause:** on leaving the reader the zen/hud cleanup was gated on
`state.previousScreen !== screenId`. On a linear root → reader → back trip,
`previousScreen` *is* the root being returned to, so the removal was skipped and
`body.mushaf-zen` survived while `state` stayed consistent — a stale body class,
not stale state. The guard protected nothing: landing on a non-reader screen can
never legitimately carry reader-mode classes.

**Second contributor:** `.nav-hidden` is only ever set by the `#content` scroll
listener and was never cleared by `showScreen`, so a pre-reader scroll-hide
outlived the trip too.

**Fix (commit 3):** removal made unconditional whenever `!isMushafReader`,
`.nav-hidden` cleared in the same branch, and the same guarantee added to
`navigateBack()` as defense in depth.

**Bonus defect found by the new suite:** re-entering the reader
(Quran → back → Quran again) rendered with *no* mode class — the entry guard
also read `state.previousScreen`, which stays the reader's name after a
back-to-root. The guard now checks the body's actual mode classes instead of a
field that can describe a different point in time.

## Scenario suite — `e2e-reader-nav-theme.mjs` (83/83)

All seven requested scenarios, in both themes, with console capture
(`Runtime.consoleAPICalled` + `Log.entryAdded` + `Runtime.exceptionThrown`):

1. Home → Quran → in-page back button
2. Home → Quran → browser Back (`history.back()`)
3. Quran → back → open Quran again — re-rendered, no duplicate stack entries,
   zen re-entered (this is where the re-entry bug surfaced)
4. Several pages → Quran → back
5. Light mode and dark mode — contrast assertions in both
6. `#nav` visible and functional after *every* scenario; `body` free of
   `mushaf-zen`/`mushaf-hud` whenever `currentScreen` is a non-reader; a back
   button visible and clickable while in the reader
7. Zero console errors or warnings (two noise sources filtered with a
   documented allowlist: a gstatic `Amiri Quran` woff2 404 that lives inside
   Google's served CSS — CDN-side, unfixable from the repo, verified by a
   Network-domain probe — and the resulting font preload notices)

## Regression sweep — re-run green after commit 3

| Suite | Assertions |
|---|---|
| `e2e-reader-nav-theme.mjs` | 83/83 (new) |
| `probe-reader-theme.mjs` | 13/13 (new) |
| `probe-reader-back.mjs` | 22/22 (new) |
| `e2e-quran-layout.mjs` | 19/19 |
| `e2e-mushaf-fit.mjs` | 19/19 |
| `e2e-mushaf.mjs` | 30/30 |
| `e2e-khatmah-lifecycle.mjs` | 20/20 |
| `e2e-adhkar-pager.mjs` | 79/79 |
| `e2e-offline-shell.mjs` | 11/11 |
| `e2e-progress-streak.mjs` | 11/11 |
| `e2e-backup.mjs` | 29/29 |
| `probe-deeplinks.mjs` | OK |
| `service-worker-cache.mjs` | OK |

`.verify-nav.py` — nav clearance **FAILS: 0** across all 9 device models
(iPhone SE / no inset, iPad, Android gesture, iPhone home bar, Android 2- and
3-button, small phone h=600, landscape phone, iPad landscape). `node --check`
clean on all 8 modules (`sw.js features.js app.js config.js mushaf.js
pageflip.js backup.js surah-meta.js`). `sw.js` bumped v43 → v44 (cache names +
header) because `index.html`/`features.js` changed.

## Not verified

- Real-device rendering: all contrast and geometry assertions are measured in
  headless Edge over CDP, not on a physical phone.
- The gstatic `Amiri Quran` 404 is inside Google's served CSS and cannot be
  fixed from this repo.
- `#mt-index` still hard-switches to the Quran tab and clears the stack. That is
  the index button's purpose and the Quran↔Khatmah landing difference is
  pre-existing behavior; left as-is deliberately.

---

# Appendix D — Quran page readability in Light page themes (2026-09-28)

Branch `fix/quran-light-theme-contrast`, three revertable commits on top of the
theme/back-nav fix work. Nothing pushed.

## D.1 Root cause

The page-scoped override block re-bases the page's background, border, ayah
badge, bismillah, page label, footer, ghost and back button onto the
`--mushaf-*` page-theme tokens — but it never re-based the **ayah text color**.
`.mushaf-block` carries its own `color: var(--text)` (`index.html:587`), and
`--text` is an **app-theme** variable, not a page-theme one.

So the Quran text tracked the *app* theme while everything around it tracked the
*page* theme. Dark app (the default, `--text: #f3f0e7`, near-white) + any light
page theme (heritage cream, floral pale-green) produced white text on cream
paper — exactly the reported symptom. The inverse broke too (light app +
explicit night page: dark text on dark paper). Only the `auto` pairing masked
it, because app and page themes then agree by construction.

A second, independent defect compounded it: `body.theme-light .surah-h-name`
(specificity (0,2,1)) outranked the page-scoped `.mushaf-page .surah-h-name`
((0,2,0)) and forced `--color-on-accent`, which is **`#ffffff`** in light mode.
So the in-page surah title was white on cream paper. This is the sibling of the
`.surah-h-meta` fix shipped in `331f8e6`, which corrected the meta and left the
name.

Three smaller page-chrome elements had the same class of bug — sitting on the
page paper while reading app-theme tokens:

| Element | Was | Contrast on heritage cream | Now | Contrast |
|---|---|---|---|---|
| `.mushaf-nav-pos` (صفحة N / ٦٠٤) | `--text-dim` | **1.83:1** | `--mushaf-ink` @ 0.75 | 6.6:1 |
| `.w.reciting` (active word) | `--mushaf-frame` gold | **2.35:1** | `--mushaf-recite` #8a6a1f | 4.4:1 |
| `.w.reciting` on floral | `--mushaf-frame` rose | **2.93:1** | `--mushaf-recite` #9a4a5f | 5.3:1 |

The bookmark button was a third failure mode: `updateBookmarkIcon()` forced an
inline `rgba(255,255,255,0.2)` background for the unmarked state, and the light
override asked for white-on-white, so the circle was invisible on the
near-white `--surface` topbar card.

## D.2 What changed

- **`9a48645` — Quran text and surah title follow the page theme.**
  `color: var(--mushaf-ink)` on `.mushaf-page .mushaf-block`; the light-mode
  `.surah-h-name` override is rescoped to `.mushaf-topbar` and switched to
  `--text`, the correct token for the `--surface` topbar card. This also removes
  the specificity inversion, so the page-scoped rule owns the in-page name.
  Dark mode is visually unchanged (`--text` #f3f0e7 ≈ `--color-on-accent`
  #f4f1e8).
- **`e97dae7` — page-chrome contrast.** New `--mushaf-recite` token in all three
  page-theme blocks (`#8a6a1f` heritage, `#9a4a5f` floral, `#b39a5a` night — the
  night value *is* the old frame value, so night is byte-identical);
  `.mushaf-page .mushaf-nav-pos` now follows `--mushaf-ink` at opacity 0.75
  beside its sibling `.mushaf-page-label`; the unmarked bookmark state no longer
  forces inline colors and the light override paints a dark translucent circle
  with a `--text` glyph. The marked state (inline `--accent` + white) is
  untouched.
- **`750e8ac` — `sw.js` v44 → v45**, cache names + header, because `index.html`
  changed.

Each theme keeps its identity: heritage stays gold-on-cream, floral stays
rose-on-pale-green, night stays gold-on-charcoal. No hardcoded universal text
color, no separate Quran theme system — the existing `--mushaf-*` tokens now
carry one more member each.

## D.3 Verification — every theme, not just one light + dark

`tests/probe-reader-theme-matrix.mjs` (raw CDP, fresh profile, mobile viewport)
drives the reader through the **full 8-combination matrix** — app dark/light ×
page auto/heritage/floral/night — and measures WCAG relative-luminance contrast
on *computed* colors: **163/163 passed**.

Covered, per combination: Quran text, in-page surah title, topbar title and meta
against their card, bismillah, ayah badge against its composited wash, page
label, page footer, nav position label, ghost, back button, `.mt-btn`,
bookmark button, plus a token-resolution check and a reader-mode check.

Scenario coverage from the request:

1. **Quran text clearly visible** — 11.2:1 to 14.0:1 on every paper, all 8
   combinations.
2. **Background/text contrast** — measured against the resolved `--mushaf-paper`
   token, not the computed gradient (which reports `rgba(0,0,0,0)`); heritage
   #f6efdc / floral #eef4ea / night #17211d, each against its own ink.
3. **Surah/page info readable** — topbar title 13.2:1, meta 5.0:1, in-page title
   follows the ink.
4. **Buttons/controls visible** — `.mt-btn` 13.2:1, bookmark circle delineated,
   back and ghost follow the ink.
5. **Ayah selection/highlighting visible** — `.selected`/`.reciting` wash and
   inset ring present and distinguishable from the paper on all three papers.
6. **Audio/active-reading highlighting** — the `.w.reciting-now` word now clears
   the large-text floor on every paper (4.4 / 5.3 / 6.0:1).
7. **Navigation controls readable** — nav-pos 5.4–7.9:1, page-foot follows ink.
8. **Direct switching** — `reader_theme` changed through all four values with no
   reload, in both app themes; every measured color re-resolves (10 switches
   checked).
9. **Light → Dark → Light round trip** — computed colors identical to the
   pre-roundtrip baseline (compared after alpha-serialization normalization);
   no stale values, and nothing but CSS classes and tokens is involved.
10. **Reload persistence** — with a light page theme stored, hard reload;
    `DeepLinks.init()` restores the reader from the hash and colors match the
    pre-reload measurement exactly.

**Console:** clean across all theme operations. Two filtered noise sources,
neither from this change:
- the gstatic `Amiri Quran` 404 inside Google's served CSS (pre-existing,
  unfixable from the repo);
- a **pre-existing** render-timing race in `app.js:504`: `observeReveal()` can
  run before `AnimationManager.init()` (deferred 50ms past `interactive`) and
  hits `this._revealIO.observe()` on an undefined observer. It is a JS
  ordering race independent of theming — this fix is CSS-only — so it is
  reported here as an open item rather than fixed in scope.

Full regression sweep, all on the branch:

| Suite | Result |
|---|---|
| `probe-reader-theme-matrix.mjs` | **163/163** (new) |
| `e2e-reader-nav-theme.mjs` | 83/83 |
| `e2e-adhkar-pager.mjs` | 79/79 |
| `e2e-backup.mjs` | 29/29 |
| `e2e-mushaf.mjs` | 30/30 |
| `e2e-khatmah-lifecycle.mjs` | 20/20 |
| `e2e-mushaf-fit.mjs` | 19/19 |
| `e2e-quran-layout.mjs` | 19/19 |
| `e2e-offline-shell.mjs` | 11/11 |
| `e2e-progress-streak.mjs` | 11/11 |
| `service-worker-cache.mjs` | OK |

`.verify-nav.py` — **FAILS: 0** across all 9 device models. `node --check`
clean on all 8 modules.

## D.4 Measurement traps (for the record)

- `.mushaf-page` paints via a CSS gradient, so its computed `backgroundColor` is
  `rgba(0,0,0,0)`. Contrast must be measured against the resolved
  `--mushaf-paper` token.
- The ayah badge and bookmark circle use translucent washes; their effective
  background is the wash alpha-composited onto the surface beneath, not the raw
  `rgba()` string.
- Every themed color has a 0.2–0.4s transition; measuring right after a class
  change catches the animation mid-flight. Wait it out or poll.
- `location.hash = X` twice with the same value fires no `hashchange`; navigate
  with `window.openSurah()`.
- `Log.entryAdded` carries the failing URL on `entry.url`, separate from
  `entry.text` — filtering on text alone lets 404s through.
- `showScreen()` adds the animation class (`slide-left`), not `active`; assert
  on `.mushaf-page .mushaf-block` presence instead.

---

# Appendix E — Quran page-turn direction: gesture, fold and index now agree (2026-09-28)

Scope: the horizontal page-turn in the unified Quran reader (`surah-view`) and
the Khatmah reader (`khatmah-read`) — the same screen, the same
`PageFlipEngine`. Nothing else was touched.

## E.1 Root cause

`pageflip.js` mapped `goNext = dx < 0`: a **right→left** swipe triggered the
*next* page. But the 3D fold that plays for `goNext` is a physically-correct
**right-spined** book turn — `transformOrigin: 'right center'` with
`rotateY(+θ)`, so the page's *left* edge lifts and folds **rightward** toward
the right-hand spine. On a right→left swipe the page therefore folded right
while the finger travelled left. The gesture and the visual argued with each
other; that disagreement is the "reversed / feels backwards" sensation. The
page number still landed on the next page, which is why the symptom felt
confusing rather than like a clean off-by-one.

Everything in the engine — the hinge origins, the rotation signs, the curl
gradient direction (`90deg` vs `270deg`), the shadow falloff — was built for
the right-spine model. Only the single trigger line was inverted relative to
the engine's own animation. The app's separate tab-swipe (`handleSwipeEnd`,
`dx > 0` → next tab) already used rightward = forward, so the two horizontal
gestures disagreed app-wide as well.

Direction convention after the fix (a real Arabic codex, spine on the right):

| finger travels | page | hinge | fold direction |
|---|---|---|---|
| left → right | **next** | `right center` | left edge lifts, folds right toward the spine — follows the finger |
| right → left | **previous** | `left center` | right edge lifts, folds left — follows the finger |

## E.2 What changed

`pageflip.js` (one engine, five edits):

1. `goNext = dx > 0` (was `dx < 0`) — the trigger now matches the fold it
   launches. The 3D branch is **unchanged**; it already encoded the right-spine
   turn and now agrees with its trigger.
2. Reduced-motion live drag: `(goNext ? 1 : -1)` (was `-1 : 1`) so the flat
   translate still slides *with* the finger — rightward for next.
3. Reduced-motion flip-out: `translate3d(±42%)` sign flipped for the same
   reason — the page exits toward the right for next.
4. The two direction comments (the state declaration and the fold-math block)
   now describe the right-spine convention, so the next reader isn't misled.
5. The drag threshold and the fold-angle denominator now use the **page's own
   width** rather than `viewport.clientWidth`. In the two-page landscape layout
   the viewport is twice the page being dragged, so a full-column drag was
   ~28% of the viewport — just short of the 30% flip commitment. Turns in
   double layout only completed if the synthetic drag carried enough momentum,
   which made them flaky. Now a drag across one page width is a full drag in
   both layouts.

`sw.js` v45 → v46 (cache names + header): `pageflip.js` is in `PRECACHE_URLS`,
so installed clients need the version bump to pick up the new engine.

Untouched, as required: Quran themes and their colours, typography, the nav
bar, the back button, bookmarks, audio/recitation, ayah highlighting, search,
Khatmah progress logic. `#mp-prev`/`#mp-next`, `#/page/N` deep links, audio
auto-turn and `changeMushafPage()` never depended on the swipe sign, so their
behaviour is identical. The adhkar horizontal pager keeps its own
`dx < 0 = next` convention — it is a scroll-snap content carousel, not a book
page-turn, and is out of scope by design.

## E.3 Verification — `tests/probe-pageturn-direction.mjs` (87/87, 3 consecutive runs)

A raw-CDP probe that synthesises **real pointer drags** (`Input.dispatchMouseEvent`,
which generates the PointerEvents the engine listens to) and records the
start/end `state.mushafPage` *plus the live `transformOrigin` / `rotateY` /
`translate3d` sampled mid-drag*, so gesture, fold and index are all observed
rather than inferred. It ran once pre-fix (mode `current`, 59/59) to pin the
old mapping as a baseline, then post-fix.

Coverage of the requested scenarios:

1. right→left → previous (index −1, `left center` hinge, negative `rotateY`)
2. left→right → next (index +1, `right center` hinge, positive `rotateY`)
3. animation matches swipe direction — mid-drag transform sampled, both
   directions: hinge on the spine side, free edge lifting toward the viewer
4. `#mp-next` / `#mp-prev` clicks still correct (and step-aware: ±1 single,
   ±2 two-page)
5. page 1 + two consecutive previous-direction swipes → holds at 1, footer ١,
   spring-back, no console error
6. page 604 + two consecutive next-direction swipes → holds at 604, footer ٦٠٤
7. three rapid consecutive forward swipes → exactly +3 steps (300→303 single,
   300→306 double), no skips or duplicates
8. `state.mushafPage` equals the rendered footer number after every turn
9. deep link `#/page/42` still opens page 42
10. in-app back exits the reader; `DeepLinks.update` keeps emitting
    `#/surah/N` (or `#/page/N` in the Khatmah reader) after turns
11. themes — `probe-reader-theme-matrix.mjs` re-run green, 163/163
12. Khatmah — turns inside `khatmah-read`; forward advances `currentPage` and
    records `lastPageRead`; backward renders the previous page while
    `lastPageRead` stays monotonic
13. viewports — 390×844 mobile portrait (step 1), 1280×800 desktop single
    (step 1) and desktop two-page landscape (step 2, second column rendered);
    plus a `prefers-reduced-motion` emulation pass asserting the flat
    translate follows the finger in both directions

Console checked on every run (`Log.entryAdded`, `Runtime.consoleAPICalled`,
`Runtime.exceptionThrown`; gstatic CDN noise and the pre-existing
`app.js observeReveal` ordering race allowlisted as out of scope) — clean.

Full regression sweep re-run green: `e2e-mushaf` 30/30, `e2e-mushaf-fit`
19/19, `e2e-khatmah-lifecycle` 20/20, `e2e-quran-layout` 19/19,
`e2e-reader-nav-theme` 83/83, `e2e-adhkar-pager` 79/79, `e2e-offline-shell`
11/11, `e2e-backup` 29/29, `e2e-progress-streak` 11/11, `service-worker-cache`
PASS, `unit-mushaf` 36/36, `unit-backup` 35/35, `probe-deeplinks` all routed.
`node --check` clean on all 7 modules; `.verify-nav.py` 0 fails.

## E.4 Probe traps (for the record)

- The flip lock (`flipping`) goes false **synchronously** in the boundary
  spring-back path while the 260ms fold transition is still animating. Polling
  `isFlipping()` alone can leave the probe sampling the page mid-fold, where
  an edge-on page projects to a ~50px-wide rect and `style.transform` already
  reads the transition's *target* (`rotateY(0deg)`) rather than the rendered
  value. The settle wait must also require a sane rendered width.
- The boot-time occasion overlay is `position: fixed` and z-index 999 over the
  whole reader; a drag started inside it is not a page gesture. Dismiss the
  overlays first — and note the *first* swipe used to dismiss it by click, so
  the second swipe was the one that actually worked.
- `openPage()` must fail loudly with a navigation log; a silent timeout leaves
  the reader on page 1 and every downstream assertion becomes meaningless.
- The two-page layout doubles the navigation step, so a turn's expected index
  delta is `±step`, not `±1`; and the double pass must clear the Khatmah state
  and the screen stack, or `openPage()` routes into the Khatmah reader and the
  in-app-back assertion sees the leftover screen instead of the list.
