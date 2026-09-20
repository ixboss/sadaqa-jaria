# 04 — Architecture & Refactoring

> **Part 4 of 4** in the *Islami / Sadaqah Jariyah PWA* code review.
> Sibling files: [`01-bugs.md`](01-bugs.md) · [`02-uiux.md`](02-uiux.md) · [`03-features.md`](03-features.md)

---

**Reviewer stance:** Software architect
**Scope:** Module boundaries, state management, storage layer, build/deploy concerns
**Mode:** Analysis only. **No code was written, rewritten, or modified.**

---

## 🔴 The Root Problem

> **The entire application lives inside one enormous inline `<script>` in `index.html`, while the external files are either dead or secondary.**

This single fact explains most of the findings in the other three documents. It is the reason dead code accumulated unnoticed, the reason 35 globals exist, the reason state has three competing sources of truth, and the reason a CSP cannot be enforced without breaking the app.

### Verified file roles

Measured, not assumed:

| File | Loaded? | Actually used? | Role |
|------|---------|---------------|------|
| `index.html` | — | ✅ | **The whole application.** ~2306 lines: 645 lines CSS in one `<style>`, plus a single inline `<script>` at line 873 holding ~1400 lines of JS. Also holds all data (`ATHKAR`, `DUA_LIST`, `OCCASIONS_DB`) inline. |
| `features.js` | ✅ `defer` | ✅ **fully used** | The best-organised file in the project. 10 well-separated modules. |
| `surah-meta.js` | ✅ sync | ✅ | 114-surah offline dataset. Clean, single-purpose. |
| `app.js` | ✅ `defer` | ⚠️ **~80% dead** | 7 classes; only `BookmarkManager`, `AnimationManager`, `AccessibilityHelper` are called. |
| `config.js` | ✅ sync | ❌ **100% dead** | `APP_CONFIG`, `Config`, `FeatureDetection` — read by nothing. |

### The load graph

```
index.html
├── <script src="./config.js">        ← synchronous, blocks parsing, 100% dead
├── <script src="./surah-meta.js">    ← synchronous, blocks parsing, used
├── <script> ...all app logic... </script>   ← THE APPLICATION
├── <script src="./app.js" defer>     ← 80% dead
├── <script src="./features.js" defer>← used
└── <script> ...SW registration... </script>
```

Two synchronous scripts block parsing in `<head>`. One of them (`config.js`) contributes nothing. The inline script is synchronous and must run before `features.js` (deferred) — which is exactly why everything had to be hoisted onto `window`.

### Consequences, each traceable to this one cause

| Symptom | Document | Root cause |
|---------|----------|------------|
| 35 `window.*` assignments | this file, R-2 | No module system; cross-file access requires globals |
| `AdvancedSearch` silently broken | `01-bugs.md` B-8 | Written in `app.js`, never callable, never tested |
| `ReadingProgressManager` orphaned | B-1 | Duplicates `state.bookmark`; nobody noticed |
| Tasbih data loss | B-6, B-7 | Direct `localStorage` calls instead of the hardened `StorageManager` that already exists |
| CSP unusable | B-17 | 14 inline handlers + 3 inline `<style>`/`<script>` blocks |
| Three state sources | R-3 | No single owner of application state |
| 645-line stylesheet, no breakpoints | `02-uiux.md` U-4 | CSS never separated from markup, never reviewed as a unit |

**The strategic conclusion:** refactoring here is not cosmetic tidying. It is the enabling step that makes the majority of the other fixes safe to apply and possible to verify.

---

## 📋 Refactoring Plan

### R-1 — Split `index.html` into real modules ⭐

**The highest-leverage change in this entire review.**

Proposed structure:

```
/
├── index.html              ← markup + <link>/<script type="module"> only
├── styles/
│   ├── tokens.css          ← custom properties (consolidated, deduplicated)
│   ├── base.css            ← reset, typography, layout primitives
│   ├── components.css      ← cards, buttons, nav, modals
│   ├── screens.css         ← per-screen rules
│   └── animations.css      ← keyframes + motion utilities
├── js/
│   ├── state.js            ← the single store (see R-3)
│   ├── storage.js          ← the single storage layer (see R-4)
│   ├── motion.js           ← Motion engine (move as-is; it's good)
│   ├── nav.js              ← nav spring + indicator + swipe
│   ├── quran.js            ← surah list, reader, Bismillah handling
│   ├── khatmah.js          ← khatmah setup/dashboard/reader
│   ├── athkar.js           ← athkar, dua, occasions, Hijri
│   ├── tasbih.js           ← tasbih
│   ├── bookmarks.js        ← bookmarks view
│   ├── settings.js         ← settings
│   ├── ui.js               ← dialog, toast, accessibility helpers
│   └── app.js              ← entry point, wires everything
└── data/
    └── athkar.js           ← ATHKAR, DUA_LIST, OCCASIONS_DB (currently inline)
```

**Why this unlocks everything else:**

- `type="module"` gives **implicit defer + strict mode + scoped bindings** — which eliminates the load-order fragility that forced the globals.
- Adding a build step becomes *possible* (bundling, minification, hashing) but **not required** — modules work natively. Preserving "no build step" is worth keeping as an option.
- The stylesheet finally becomes reviewable and toolable.
- Per-file diffs make regressions visible.

**Risk: moderate, mostly mechanical.** The mitigation is to move code **verbatim, without improvement**, one module at a time, verifying the app works after each move. Do not refactor logic and relocate it in the same step.

---

### R-2 — Eliminate global namespace pollution

**Measured: 35 `window.*` assignments** across all scripts.

```
window.APP_CONFIG          window.changeKhatmahPage   window.resetKhatmah
window.AccessibilityHelper window.completeWird        window.resumeBookmark
window.AdvancedSearch      window.openBookmarks       window.showAppDialog
window.AnimationManager    window.openCategory        window.showScreen
window.AudioPlayer         window.openKhatmahReader   window.showStats
window.BookmarkManager     window.openSettings        window.startKhatmah
window.BookmarksView       window.openSurah           window.tapThikr
window.Celebrate           window.openTasbih          window.toggleBookmark
window.Config              window.rebuildTasbih
window.DeepLinks           window.FeatureDetection
window.Haptics             window.PerformanceMonitor
window.ReadingProgressManager
window.Reminders
window.Settings
window.StatsManager
window.StorageManager
```

These exist for one reason: `features.js` and `app.js` are deferred, so they load *after* the inline script, and they need to reach functions defined inside it. `window` is the only channel available without a module system.

**Plus 14 inline event handlers** — 11 unique functions wired via HTML attributes:

```
onclick: changeKhatmahPage, completeWird, loadKhatmahPage, openCategory,
         openKhatmahReader, openSurah, resetKhatmah, resumeBookmark,
         startKhatmah, tapThikr, toggleBookmark
```

**Why this matters beyond tidiness:** inline handlers are **the reason the CSP is unusable** (`01-bugs.md` B-17). `'unsafe-inline'` exists solely to let them run, and it disables XSS protection entirely. Converting them to `addEventListener` is what makes a real CSP possible — so R-2 is a **prerequisite for B-17**, not an independent cleanup.

**Approach:** with ES modules (R-1), export/import explicitly. Replace each inline `onclick` with a delegated listener or a bound handler. Then drop `'unsafe-inline'` from the CSP in a **separate, verified step**.

---

### R-3 — Single source of truth for state

There are currently **three overlapping stores** for related information:

1. `state` — the in-memory object (`index.html:1090`), persisted to `localStorage['app_state']`
2. `state.bookmark` — a nested reference to "the last bookmark", duplicating `BookmarkManager`
3. `BookmarkManager` — its own `localStorage['islamic_bookmarks']` (`app.js:48`)

The code already shows the strain. Comments at `index.html:1529`, `:1543`, and `:1554` are attempts to manually reconcile these:

> *"Unify the bookmark system: `state.bookmark` is a* reference *to the last entry in `BookmarkManager`"*
> *"Read state from `BookmarkManager` (single source) instead of `state.bookmark`"*

Those comments are documentation of a bug that was worked around rather than fixed. The `bookmarksChanged` listener at `index.html:2044-2049` exists purely to patch the drift.

**Proposed:** one store with explicit ownership of each domain, and a subscribe mechanism:

```
Store
├── ui        → currentScreen, previousScreen, currentTab, scrollPositions, fontSize, theme
├── quran     → currentSurah
├── khatmah   → the khatmah object
├── bookmarks → the authoritative bookmark set
└── settings  → reciter, tasbihTarget, remindersEnabled
```

with a single persist path and a `subscribe(domain, fn)` API. Derived values (like "which bookmark is most recent") should be **computed**, never stored — which is what causes the drift today.

---

### R-4 — Unified storage layer

`StorageManager` (`app.js:4-44`) is **already written, already hardened with try/catch, and used by nobody.** Meanwhile `localStorage` is called directly in 30+ places, and the hardening is inconsistent:

- ✅ Hardened with explanatory comments: `getProg`/`setProg` (`index.html:1844-1845`)
- ❌ Not hardened: tasbih read/write (`index.html:1892-1893`, `:1957-1958`) → **causes B-7**
- ⚠️ Raw keys, no schema: `reciter`, `tasbih_target`, `reminders_enabled` (`features.js:196-201`)
- ⚠️ Three storage paradigms in use: raw strings, `JSON.stringify` inline, and `StorageManager`

**Proposed:** adopt the existing `StorageManager`, extend it with namespacing and a version tag, and route **every** read/write through it. This single change eliminates B-7 and B-25 as a class, not as individual patches.

**Also required:** schema versioning. There is currently no version field anywhere, so a future format change will silently corrupt returning users' data. With F-1 (export/import) this becomes critical — an exported file with no version tag cannot be safely restored.

---

### R-5 — Delete dead code or actually use it

Per-file verdicts, with reasoning:

| Module | Location | Verdict | Reasoning |
|--------|----------|---------|-----------|
| `BookmarkManager` | `app.js:47-109` | **Keep** | Used heavily. |
| `AnimationManager` | `app.js:457-579` | **Keep** | Used; `observeReveal` is called from `renderSurahList`. |
| `AccessibilityHelper` | `app.js:211-298` | **Keep** | Used at boot. |
| `StorageManager` | `app.js:4-44` | **Keep — and adopt** | Right design, wrong usage. R-4 depends on it. |
| `ReadingProgressManager` | `app.js:112-143` | **Merge or delete** | Duplicates `state.bookmark` + `scrollPositions`. Decide which wins, then remove the other. |
| `AdvancedSearch` | `app.js:146-208` | **Delete** | Not called, and broken for Arabic (B-8). The working search is at `index.html:2151-2162`. Two implementations of one feature is worse than one. |
| `PerformanceMonitor` | `app.js:301-331` | **Delete or adopt** | Never called. `reportWebVitals` listens for a `'web-vital'` event that does not exist (B-21). If measurement is wanted, use the Performance API directly. |
| `DataSyncManager` | `app.js:392-412` | **Delete** | Registers Background Sync, but `syncData()` in `sw.js:155-168` only posts a message — there is no data to sync. A feature with no purpose. |
| `ServiceWorkerManager` | `app.js:334-389` | **Delete** | Duplicates the SW registration at `index.html:2272-2278` (which the code itself acknowledges at `app.js:417`). B-2 lives here. Keep one registration path. |
| `APP_CONFIG` / `Config` / `FeatureDetection` | `config.js` (whole file) | **Adopt or delete** | Zero reads. `debug.enabled` is a genuinely useful switch that would let `console.log` be gated. If adopted, it becomes the config backbone; if not, delete 4.3 KB. |

**Estimated outcome:** `app.js` shrinks from ~12.8 KB to roughly 5–6 KB, or is dissolved entirely into properly-scoped modules.

---

### R-6 — Error handling and logging discipline

- `config.js:176-186` runs a `console.log` block **unconditionally on every load.** It is gated by nothing. `APP_CONFIG.debug.enabled` exists and is never consulted.
- **20+ `catch(e) {}` blocks swallow errors silently.** Some are correct (localStorage in private mode). Others hide real failure: `catch (e) { /* ignore */ }` around `Celebrate` masks animation bugs; the swallowed `PerformanceObserver` error masks feature-detection failure.
- The `catch` blocks that **do** log use inconsistent prefixes and levels, with no way to silence them in production.

**Proposed:** a tiny logger with levels, gated on the debug flag; and a rule that silent catches must carry a comment stating *why* the error is safe to ignore. An unexplained empty catch should fail review.

---

### R-7 — Assets

- **Icons are `data:` URIs.** They are embedded three times: favicon and apple-touch-icon (`index.html:34-35`), plus two manifest icons (`manifest.json:15,21`). This bloats both files, is unreadable, **and is rejected by iOS** (B-16). Generate real PNG files.
- **The font is loaded via `@import` inside `<style>`** (`index.html:67`). `@import` in CSS delays loading and blocks rendering; it should be a `<link rel="stylesheet">`. A `preload` already exists at line 30 — so the font is currently being fetched, then re-requested via the `@import`.
- **A hand-written font URL is hardcoded** in the `requestIdleCallback` block (`index.html:2287`):
  ```
  https://fonts.gstatic.com/s/amiriquran/v1/SlGTmQieoJc-_EXiEtUe5cEB0En-fNRV.0.woff2
  ```
  This is a fingerprinted URL. When Google publishes a new font version, this 404s — and a 404ing preload is **worse than no preload**, because it wastes the request and can log a console error on every visit.

---

### R-8 — Tests and documentation

**Tests:** there are none. Not a single test file exists, despite `IMPROVEMENTS.md` claiming *"Total: 19/19 tests ✅"*.

Recommended, in priority order:

1. **Unit tests (Vitest)** for the pure logic that is easy to get wrong and currently unprotected:
   - `stripBismillah` / `_normArabic` — the trickiest code in the project, with real edge cases (B-9)
   - `getHijriDate` / `getActiveOccasionKeys` — date-boundary logic
   - `getStreak` — already known to be wrong (B-11)
   - The Arabic normaliser used by search
2. **E2E tests (Playwright)** for the flows that keep breaking: khatmah is not lost across reloads; tasbih survives reload; bookmarks persist; back navigation lands correctly.
3. **A PWA install check** — this would have caught B-16 and B-18 immediately.

**Documentation:** corrected in this session. `IMPROVEMENTS.md` no longer asserts verification it did not perform, and both it and `README.md` now defer to `01-bugs.md` for the verified defect list.

---

### R-9 — Deployment files

`.htaccess` carries three interacting defects, documented in `01-bugs.md`:

| # | Defect | Effect |
|---|--------|--------|
| B-17 | CSP `connect-src` omits `cdn.islamic.network` | **Audio playback fails** |
| B-18 | `FilesMatch "\.json$"` denies `manifest.json` | **PWA install fails everywhere** |
| B-19 | `ErrorDocument 404 /index.html` returns 200 | Soft-404s; crawl budget dilution |

> ## ⚠️ These must be fixed as ONE atomic change
>
> The three defects **interact**. Loosening `FilesMatch` to unblock `manifest.json` does not fix audio; adding `cdn.islamic.network` to `connect-src` does not unblock the manifest. Fixing one and re-testing will produce a misleading partial pass.
>
> **Procedure:** apply all three, then verify on a **real Apache host** — (a) manifest loads, (b) audio plays, (c) a nonexistent path returns 404. Do not trust a static review of the headers, and do not trust `IMPROVEMENTS.md`, which claims these were tested when they were not.

**Also required before launch:**
- Replace the placeholder domain `islami-app.local` in `robots.txt:11`, `sitemap.xml:7`, and `security.txt:4` (B-26). An invalid `security.txt` violates RFC 9116.
- Fix the `islami-app/` → `sadaqa-jaria/` folder-name mismatch in the README (corrected this session).
- Add real contact details (the previous `info@islami-app.local` was a placeholder).

**⚠️ Preserve:** the project is fully static and runs on any host with **no server**. This is the correct choice for a Sadaqah Jariyah project — zero maintenance cost, zero server attack surface, no ongoing bills. **Nothing in this refactoring plan should compromise it.**

---

## 📊 Priority Matrix

| Priority | Items | Rationale |
|----------|-------|-----------|
| 🔥 **Immediate** | B-2 (boot permission prompt), B-6 + B-7 (tasbih data loss), B-11 (streak incorrect) | Direct user impact; data loss and wrong spiritual accounting |
| 🔥 **Before any deploy** | B-17 + B-18 + B-19 (`.htaccess`, **as one atomic change**), B-26 (placeholder domains), B-16 (iOS icons) | Each one independently blocks a correct launch |
| ⚡ **High value** | A-3 (wire existing `flipAnimate` — one call site), U-3 (`100vh`→`100dvh`), U-1 (tasbih responsiveness), B-14 (API cache TTL), B-15 (font offline) | Strong impact relative to effort |
| 🏗️ **Strategic** | R-1 (split modules) → R-2 (kill globals) → R-3 (single state) → R-4 (storage layer); B-1 (remove dead code) | Enabling work; makes everything else safer |
| 🎁 **Signature** | F-1 (export/import — **data-loss prevention**), F-4 (khatmah dedication), F-2 (share as image), F-14 (Hijri calendar — logic already exists) | Mission-aligned, high value |

### Suggested sequencing

**Phase 1 — Stop the bleeding.** Fix the data-loss and correctness bugs (B-2, B-6, B-7, B-11). These are small, contained, and high-impact.

**Phase 2 — Make deployment correct.** Fix the `.htaccess` cluster as one change and verify on real Apache. Replace placeholder domains. Generate real icons.

**Phase 3 — Quick wins.** A-3 (uses code that already exists), U-3, U-1, U-7.

**Phase 4 — Refactor with confidence.** Do R-1 → R-2 → R-3 → R-4 in order, using the Phase 1–3 work as regression tests. Add unit tests for the tricky pure functions (R-8) *before* moving them, so the moves can be verified.

**Phase 5 — Build the signature features.** F-1 first (protect the data), then F-4, F-2, F-14.

**Why F-1 is in Phase 5 and not Phase 1:** it is the most *valuable* feature, but Phase 1 stops active data loss more cheaply, and Phase 4's storage unification (R-4) gives export/import a clean schema to serialise — including the version tag it needs to be safe.

---

## 🎯 Closing Assessment

This is **not a beginner project.** It contains genuine engineering judgment, and three things in particular are better than typical production code:

1. **The nav indicator spring** (`index.html:1377-1456`) — a real Mass–Spring–Damper simulation with sub-stepping, `dt` clamping, and velocity carry-through. Most implementations use CSS easing and call it a spring. This one is the real thing.
2. **`prefers-reduced-motion` honoured in every motion path** — and with a live listener for the preference changing mid-session. This is rare, and it is the correct treatment of an accessibility contract.
3. **The `backwards` vs `both` diagnosis** (`index.html:474-478`) — a subtle `containing block` bug, correctly diagnosed, fixed, and documented in a comment. The comment explains *why*, which is what makes it valuable.

The `stripBismillah` normalisation is likewise thoughtful, and the offline fallback in `surah-meta.js` shows the right instinct about connectivity.

**But the project carries one dangerous structural pattern:** the three layers (`index.html`, `app.js`, `config.js`) behave as though they do not know the others exist. One holds the entire application; the other two build substantial, thoughtful machinery that is never invoked. Meanwhile the documentation *claimed* verification that never happened — so the gap stayed invisible.

That is the finding that matters most. The bugs in `01-bugs.md` are fixable in an afternoon each. The fabrication in `IMPROVEMENTS.md` was the thing preventing anyone from noticing them.

**The app has not shipped yet — which makes this the best possible moment to correct all of it.**

---

## 📌 Recommended Next Steps

1. **Fix Phase 1 (data loss and correctness) first.** Small, contained, high impact — and they protect real users' spiritual records.
2. **Treat the `.htaccess` cluster as one atomic change**, verified on real Apache. Do not fix B-17, B-18, B-19 individually.
3. **Do not use `IMPROVEMENTS.md` as a specification.** It asserted "19/19 tests passed" with no test files present. It has been corrected this session, but any copy of it you have from before 2026-09-20 should be discarded.
4. **Add tests for the pure functions before refactoring** — `stripBismillah`, the Hijri date logic, and `getStreak` are exactly the code that breaks silently under a refactor.
5. **When splitting modules (R-1), move code verbatim.** Do not improve logic and relocate it in the same step — that makes the diff unreviewable and the regression untraceable.
6. **Consider adopting `config.js` rather than deleting it.** It is well-designed; `debug.enabled` alone would clean up the logging situation. The problem was never its quality — only that nobody used it.

---

### Review report index

| File | Contents |
|------|----------|
| [`01-bugs.md`](01-bugs.md) | 27 findings (B-1…B-27) with verified `file:line` references |
| [`02-uiux.md`](02-uiux.md) | Animation proposals (A-1…A-7), layout issues (U-1…U-10) |
| [`03-features.md`](03-features.md) | Feature proposals (F-1…F-16) with dependency chains |
| **`04-architecture.md`** | **This file** — refactoring plan (R-1…R-9), priority matrix, closing assessment |
| [`IMPROVEMENTS.md`](IMPROVEMENTS.md) | Corrected project status (previously contained false verification claims) |
| [`README.md`](README.md) | Corrected project documentation |

---

*All 35 global assignments, 14 inline handlers, 6 script tags, and every `file:line` reference in this document were verified by direct measurement, not inference.*
