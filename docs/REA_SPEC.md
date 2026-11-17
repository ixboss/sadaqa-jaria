# REA_SPEC.md — Sadaqa Jaria v2 · Full-Spectrum Reverse-Engineering Specification

> Status: **Phase 1 deliverable** (v1.0, 2026-11-17) · Golden targets: **Ayah (آية)**, **Athkar (أذكار)**, **Ameen (أمين)**
> Companion documents: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) · [`packages/core-data/schema.sql`](../packages/core-data/schema.sql) · [`TASK_PLAN.md`](../TASK_PLAN.md)

---

## 0. Scope & Evidence Policy

This document reverse-engineers the three benchmark applications across the three
engineering layers mandated by the v2 master prompt:

1. **Feature & Mechanics Layer** — how each feature operates under the hood (state machines, math, sync, caching, edge cases).
2. **UX & Information-Architecture Layer** — journeys, tap-count economics, contextual surfacing, zero-clutter organization.
3. **UI, Typography & Motion Layer** — visual hierarchy, Arabic calligraphy legibility, spring physics, haptic choreography.

**Evidence tiers used throughout** (per the REA operating rules — observations and inferences are never mixed silently):

| Tier | Meaning | Marking |
| :--- | :--- | :--- |
| **T1 — Directive** | Behavior explicitly mandated by the Sadaqa Jaria v2 master prompt. Treated as binding requirements, not claims about the benchmark. | `[D]` |
| **T2 — Observable** | Behavior publicly visible from the shipped product (screens, flows, store listings, published docs) or verifiable by using the app. `[O]` claims sourced from App Store listings were fetched from the official pages on 2026-11-17: Ameen `apps.apple.com/eg/app/id6742055838`, Athkar `apps.apple.com/eg/app/id374050672`, Ayah `apps.apple.com/eg/app/id706037876`. | `[O]` |
| **T3 — Inference** | Underlying mechanism inferred from observable behavior; stated as inference with the reasoning that supports it. | `[I]` |

No binary decompilation was performed for this document (the shipped apps are
closed-source; the `rea` binary-analysis toolchain is out of scope for a
behavioral synthesis). Every mechanism below is therefore **T1/T2/T3** — where a
mechanism is inferred, the v2 implementation is specified to work even if the
benchmark's actual internals differ, because v2 must *surpass*, not replicate.

**What v1 of this repository is today** (verified by direct inspection, 2026-11-17):

- Pure static PWA (no build step), Arabic RTL, 16 global-lexical script modules in `js/` (app-core 2,447 LOC, features 2,029 LOC, mushaf, adhkar, backup, pageflip, khatmah, tasbih, tafsir, stats…).
- Quran text fetched from `api.alquran.cloud` at runtime and cached in `localStorage` (`q_s_u_{surah}`, 7-day TTL) — **this is the single largest offline-first violation in v1** and REA confirms it is the root motivation for the v2 data core.
- Mushaf rendering is *flowing HTML text* in two modes (surah mode / khatmah reading-plan mode) — not a fixed 15-line page layout. Page-flip gesture exists (`js/pageflip.js`, 344 LOC) but operates over scroll-paged views, not authentic page boundaries.
- Existing features confirmed by `js/config.js` feature flags: bookmarks, reading progress, khatmah, tasbih, athkar, dua, occasions, dark/light, search, text+image sharing, tafsir, notifications.
- Existing test harness: 11 e2e suites + probes + unit tests under `tests/` (node-based custom runner).

---

## 1. Benchmark A — Ayah (آية) · The Mushaf Engine

### 1.1 Feature & Mechanics Layer

| # | Feature | Benchmark mechanism (tier) | v2 verdict |
| :--- | :--- | :--- | :--- |
| A-1 | **Authentic 15-line Madinah Mushaf** | `[O]` The reader displays pages that are visually identical to the printed King Fahd Complex Mushaf: fixed 15 text lines per page, 604 pages, page numbers in the standard margins. The layout does not reflow with font size or viewport — zoom scales the whole plate. | **Adopt as v2's foundation** via QUL data (see A-2), then add adaptive spread (A-6). |
| A-2 | **Fixed page/line/word geometry** | `[I]` Because the layout never reflows, the app must render from pre-computed coordinates per word (line number, line-relative position, bounding box) bundled with the app — not from flowing Unicode text. This matches the structure Tarteel's Quranic Universal Library (QUL) publishes as open data: per-page, per-line, per-word records with `x/y/width/height` and ayah linkage. | **Mandatory**: v2 ingests QUL's mushaf layout dataset into `mushaf_pages / mushaf_lines / mushaf_words` tables (schema.sql §3.2) and renders SVG/absolute-positioned word plates. |
| A-3 | **Fluid page-flip gestures** | `[O]` Horizontal swipe moves between pages with a physical peel/parallax animation; taps on the left/right thirds also navigate (direction adapted for RTL book order); momentum scrolling does *not* trigger page flips mid-gesture. | Keep v1's `pageflip.js` gesture core but re-target it to authentic page boundaries; flip target = adjacent `mushaf_pages` row, not "scroll viewport". |
| A-4 | **Instant ayah long-press sheet** | `[O]` Long-press on any ayah (or word) opens a bottom sheet with: Tafsir, Bookmark, Share (text / image card), Copy, Play-from-here. The sheet appears within one frame of touch-up. | **Adopt + extend**: v2 sheet adds Mutashabihat (A-8) and word-by-word play entry. |
| A-5 | **Khatmah (memorization/reading-plan) tracker** | `[O]` Progress by page with a daily target; streaks for consecutive days. | **Adopt + surpass**: v2's Khatmah planner (already prototyped in v1 `js/khatmah.js`) runs on authentic page units and computes daily targets with the *remaining-days ÷ remaining-pages* algorithm (§4.2) — including the "cannot finish before deadline" rescale. |
| A-6 | — (v2 exclusive) | **Adaptive Spread**: `[D]` single page in portrait mobile; **dual-page open-Mushaf spread** on desktop/tablet landscape (like a physical open book, right page = the earlier one in RTL reading order). | Desktop builds render `spread(page)` = pages `(n even ? n, n-1 : n+1, n)` so an even/odd pair always faces like a real book. |
| A-7 | — (v2 exclusive) | **Word-by-word audio highlighting**: `[D]` the currently recited word is highlighted in real time using offline timestamp segments. | Architecture in ARCHITECTURE.md §7; data in `audio_word_segments` (schema.sql §4.3). |
| A-8 | — (v2 exclusive) | **Offline Mutashabihat**: `[D]` one-tap "similar verses" for memorizers. | Curated pairs table `mutashabihat` + FTS fallback detection (§4.4). |
| A-9 | **Reading modes** | `[O]` Night mode (inverted), sepia/paper tint, brightness within reader. | Already present in v1 (theme matrix, `probe-reader-theme-matrix.mjs`); port unchanged onto page-plate renderer. |
| A-10 | **Tafsir integration** | `[O]` Per-ayah tafsir sheet from at least one mainstream source, scrollable within the sheet. | **Adopt + expand**: v2 stores multiple tafsir books (`tafsir_books`) with per-book selection; bundled offline (Muyassar first, Ibn Kathir/Qurtubi/Tabari as packs). |

### 1.2 UX & IA Layer

- **Instant resume** `[O]`: relaunching opens the last-read page, not the home screen — reading is the primary job, chrome is secondary. v2 keeps this (v1 already persists reading position) but changes the unit from "surah+offset" to "page + line".
- **Zero-tap chrome reveal** `[O]`: tapping the page body toggles toolbars/tab bar; chrome auto-hides after a few seconds of reading or on scroll. `[I]` This preserves immersion for long sessions — v1's Mushaf reader already does this (`probe-reader-chrome.mjs`); the contract carries over.
- **Tap-count economy**: page navigation = 1 gesture; ayah actions = long-press + 1 tap; surah navigation = 1 tap → index sheet (list/search) → 1 tap. v2 matches this budget and adds **juz/hizb section markers on page edges** (printed-Mushaf convention) so jumping to a juz needs no index at all.

### 1.3 UI, Typography & Motion Layer

- **Calligraphy** `[O]`: the Quran text is rendered in an Uthmanic/QPC-style typeface with full diacritics and medina-color variants; *all UI chrome* uses a clean naskh/sans Arabic face — two-tier typography system. v2 tokens: `--font-quran: QPC Uthmanic HAFS` (bundled WOFF2 + OTF for native), `--font-ui: system Arabic stack`.
- **Motion** `[O/I]`: page flip is a physical transform (3D perspective, spring settle ~300–400 ms); sheets slide with rubber-band damping; `[I]` spring parameters consistent across interactions → v2 codifies shared spring constants in design-tokens (`spring.pageFlip`, `spring.sheet`, `spring.tabMorph`).
- **Legibility rules** `[O]`: mushaf text color never varies with themes except background/tint inversion; UI controls never overlay the mushaf page itself (they sit outside or fade on glass).

### 1.4 Store-Grounded Deltas (Ayah · App Store fetch 2026-11-17) `[O]`

| Store feature (evidence) | v2 disposition |
| :--- | :--- |
| Uses "The latest edition of the Madinah Mushaf" | Confirms A-1/A-2: v2's QUL Hafs layout is exactly this edition. |
| Tafsir: Al-Muyassar (verse-split), Al-Saadi (Arabic + Russian), "more tafsir books" added across versions; tafsir opened from the verse menu | Confirms A-10 multi-book design; v2 bundles Muyassar, ships Saadi/Ibn Kathir/Qurtubi as packs. |
| Translations: "The Clear Quran" (EN) + Irab and morphology (*sarf*) | Add `translations` pack type (translation per ayah); **Irab/morphology noted as future pack** — not a Phase 2–5 mandate. |
| Annotations: "colorful bookmarks", "starred verses", **thematic highlighting** with a two-finger toggle, highlight colors, searchable highlights **grouped by surah or color** | v2's `highlights` table (word-range, 5 color keys) covers this; grouping UI on highlights list is a Phase 3 acceptance item. |
| **No word-level highlight** — a reviewer explicitly requested "the ability to highlight a single word" and it is absent | **v2 surpasses**: word-range highlights are schema-native (`highlights.word_start/word_end`). |
| "Tens of reciters", verse-by-verse highlighting, repeat modes, **download entire Quran per reciter**, playback speed persisted | Confirms §audio pack model (Phase 3.6); repeat/speed persisted in `user_settings`. |
| Landscape shows **two pages with surah name + page number** | Direct T2 confirmation for A-6 Adaptive Spread; v2 adds surah/page captions to spread chrome. |
| Khatmah plan + "play audio to the end of the khatmah's day" | v2 Khatmah planner gains "audio follows khatmah target" as a playback end-stop option (Phase 3). |
| Liquid Glass adopted on iOS 26+ | Benchmark now visually validates Pillar A; v2's web glass policy stays within REA §5 S-10. |

---

## 2. Benchmark B — Athkar (أذكار) · Dhikr & Tasbih

### 2.1 Feature & Mechanics Layer

| # | Feature | Benchmark mechanism (tier) | v2 verdict |
| :--- | :--- | :--- | :--- |
| B-1 | **Category → card flow** | `[O]` Category list (morning, evening, sleep, prayer, …) → reading flow of one-dhikr cards. | **Adopt**: v1 already has Hisn al-Muslim categories + pager (`e2e-adhkar-pager.mjs`). |
| B-2 | **Full-card tap counter** | `[O]` The *entire card* is the tap target for counting — no small counter button to miss; count shown large. | **Adopt** (v1 parity). |
| B-3 | **Circular progress indicator** | `[O]` Ring around the count fills proportionally to target repetitions. | **Adopt**: SVG stroke-dashoffset ring; progress = `count / target` clamped. |
| B-4 | **Auto-advance on completion** | `[O]` At target count the card animates (fill pulse) and auto-advances to the next dhikr after a short beat; the user is never hunting for a "next" button. | **Adopt + choreograph**: completion → harmonic haptic + ring flash → 250 ms beat → advance (§2.3 motion spec). |
| B-5 | **Daily streak tracking** | `[O]` Consecutive-day counter for completed athkar sessions. | **Adopt**: v1 already tracks streaks (`e2e-progress-streak.mjs`); v2 generalizes to per-category + tasbih streaks with one shared `streaks` table (schema.sql §5.6). |
| B-6 | — (v2 exclusive) | **Differentiated haptic/audio choreography**: `[D]` micro-tick per tap, harmonic pulse on dhikr completion, distinct category-completion state. | Haptics engine spec §4.1 (v1's `haptics.js` is a 11-LOC stub — v2 builds real CoreHaptics-pattern parity on web Vibration API + native bridges). |
| B-7 | — (v2 exclusive) | **Hands-free audio flow**: `[D]` sequential auto-play of dhikr audio with auto-advance, for commuters. | Player loop: for each item → play `item.audio` → wait `duration + gapMs` → count progress mirrors audio → advance. Background-capable on Electron; PWA continues in foreground only. |
| B-8 | — (v2 exclusive) | **Collapsible hadith verification**: `[D]` minimalist card by default; one-tap expansion reveals source grading + reward (*fadl*) text. | `athkar_items.source, grade, fadl` columns rendered in expandable region — no separate screen (tap-count economy). |
| B-9 | **Session persistence & resume** | `[I]` Killing the app mid-category and returning resumes counts (users expect counters not to reset on crash). | v2 persists `adhkar_session` state per category+date on every tap (debounced write), not on completion only. |

### 2.2 UX & IA Layer

- **One-thumb flow** `[O]`: reading + counting requires zero scrolling of chrome; the card body occupies the full viewport; tapping anywhere counts.
- **Counting edge cases** `[I]`: long-press or dedicated affordance to decrement (mis-taps); count target 1 (pure recitation) still shows completion state; counters persist across app restarts within the day. v2 handles all three: decrement via long-press, `target = 0/null` → "listen/read" card type, day-keyed persistence.
- **Contextual surfacing** `[D]` (v2): the Today Hub's smart card surfaces the right athkar set by solar window (Fajr→morning; Asr→evening; 20-min post-prayer window→post-prayer dhikr; Friday→Al-Kahf; night→Qiyam card) — this is v2's headline IA upgrade over both benchmarks (see §5 matrix row S-2).

### 2.3 UI, Typography & Motion Layer

- **Count typography** `[O]`: the count uses a large tabular-lining numeral (doesn't jitter width as digits change) — v2 sets `font-variant-numeric: tabular-nums` on counters.
- **Ring motion** `[O/I]`: progress ring animates on each tap with a fast ease-out (~150 ms); completion triggers a one-shot ring flash. `[I]` These are fixed durations, not springs, because a counter tap needs instant feedback — v2 encodes `dur.tick=150ms`, `dur.complete=450ms` in tokens.
- **Arabic hadith text** `[O]`: body text in generous line-height (≥1.9) with full tashkeel; v1 already ships this standard — carry over.

### 2.4 Store-Grounded Deltas (Athkar · App Store fetch 2026-11-17) `[O]`

| Store feature (evidence) | v2 disposition |
| :--- | :--- |
| **Hajj & Umrah module** (listed under both EN and AR descriptions) | **Adopt as Tools content module** (Phase 4): manasik guide + Hajj/Umrah-specific adhkar categories — sourced from the Hisn al-Muslim Hajj/Umrah chapter, bundled offline. |
| **Accessibility matrix**: VoiceOver, Larger Text ≥200%, Differentiate Without Colour Alone ("shapes or text, in addition to or instead of colour"), audio descriptions, **Qibla direction support for blind users** | **Adopt as v2 accessibility baseline** (all 4 targets): screen-reader labels on every control, 200% font scale, shape+text (not color-only) completion states, spoken Qibla alignment ("turn left/right ±° countdown") in Tools. |
| Athkar audio voiced by Mishary Al-Afasy + playback speed | Confirms B-7 hands-free audio flow; per-item `audio_key` already in schema; speed persisted in `user_settings`. |
| **Voice Counter** (iOS 26 speech recognition) + Dynamic Island Live Activity | Platform-native capability — mapped to **iOS Phase 5** (Speech framework + ActivityKit); web/desktop: no equivalent (documented platform limit, ARCHITECTURE §3). |
| "My Athkar": create/edit/delete sections & du'as, per-du'a counters, **transfer between devices** | Confirms v2 custom-athkar design; transfer realized via `.sadaqa` (supersedes iCloud-only sync with cross-OS portability). |
| Monthly prayer-time tables, **shareable as image or PDF**; Fajr alarm ("works even in silent mode"), Islamic midnight / last-third reminders | Monthly table → Phase 4 Tools; share-as-image → Phase 4; silent-mode Fajr alarm → native phase (exact alarms); midnight/last-third → confirms C-7 Qiyam engine. |
| Warsh 'an Nafi' mushaf variant + Tajweed color-coded mushaf (beta) | **Noted, not mandated**: v2 pins Hafs single-riwaya for v2.x; Warsh/Tajweed layering deferred to post-v2 (would need alternate QUL layout datasets). |
| Hijri calendar w/ conversion, Ramadan countdown, White Days fasting reminder, Hijri date on app icon | Hijri engine (Phase 2) already computes conversions; Ramadan/Eid countdowns derived from hijri.ts events; White Days reminder added to the reminder engine spec (§4.7). |
| iCloud sync for My Athkar/favorites/counters | Superseded by `.sadaqa` (S-9) — portable across OS, no account. |
| Numeral style choice (Arabic ١٢٣٤ vs 1234) | **Adopt**: `user_settings.numeral_style` token consumed by all counter/countdown renderers. |

---

## 3. Benchmark C — Ameen (أمين) · Prayer, Hub & Widgets

### 3.1 Feature & Mechanics Layer

| # | Feature | Benchmark mechanism (tier) | v2 verdict |
| :--- | :--- | :--- | :--- |
| C-1 | **Prayer dashboard** | `[O]` Today's schedule with the next prayer visually emphasized (hero). | **Adopt**: v2 Today Hub hero = next prayer + live countdown. |
| C-2 | **Live countdown** | `[O]` Continuous ticking time-to-next-prayer, switching automatically at prayer time (no refresh needed). | `[I]` Implemented as a 1 Hz ticker recomputing from computed times — v2: `PrayerEngine.next(now)` returns `{name, at, previous}`; ticker only formats, never recomputes times (deterministic, battery-cheap). |
| C-3 | **Hijri date integration** | `[O]` Hijri date prominent on the dashboard, correct for the user's location (±1 day adjustable). | **Adopt + surpass**: v2 computes Hijri via Umm al-Qura/knuth algorithm engine with manual ± adjustment persisted (`user_settings.hijri_adjust`). |
| C-4 | **Calculation precision** | `[D]` Standardize on **Batoul Apps Adhan** (`adhan-js` here) — bit-for-bit identical times across all 4 targets. | v2's single `packages/core-data/prayer-engine.ts` wraps adhan-js; native targets consume the same parameters (lat/lng/elevation/method/madhab/highL adjustment) — never re-implement per-platform. |
| C-5 | **Qibla compass** | `[O]` Magnetic-bearing compass with device orientation. | v2: `qiblaBearing(lat,lng)` = great-circle bearing to Kaaba (21.4225°N, 39.8262°E) — pure function in core-data; compass UI in Tools. Declination note + manual dial fallback when sensors absent (desktop). |
| C-6 | **Widgets (Home/Lock screen)** | `[O]` (native benchmark) next-prayer widget. | v2: WidgetKit (iOS) + Glance (Android) in Phase 5; Electron gets system-tray countdown (Phase 4); PWA offers no widget (platform limit, documented). |
| C-7 | — (v2 exclusive) | **Sunnah time calculators**: `[D]` automatic Last-Third-of-Night (Qiyam) and Duha windows. | Formulas in §4.3 — computed from adhan-js sunrise/sunset/midnight outputs, not approximations. |
| C-8 | — (v2 exclusive) | **Desktop system-tray countdown** `[D]`: e.g. `Asr in 00:42:15` in tray/menu bar. | Electron Tray + template title; Phases 4. |
| C-9 | **Adhan notifications** | `[O]` (native benchmark) notification/reminder at prayer time. | v2: PWA Notification API + scheduled SW alarm (best-effort), Electron native background schedule (exact), native platforms exact alarms (Android foreground service / iOS UNCalendarNotification). |

### 3.2 UX & IA Layer

- **Glanceable hierarchy** `[O]`: next prayer > other prayers > secondary info (Hijri, location). v2 hero card follows the same gradient of emphasis.
- **Location UX** `[O/I]`: city selection without GPS permission (offline city DB) — v2 bundles the offline cities dataset (`cities` table, ~all major cities w/ coords+elevation) and treats GPS as optional enhancement, honoring the 100%-offline mandate.
- **Settings surface**: calculation method (Muslim World League, Egyptian, Umm al-Qura, Karachi, Moonsighting…), madhab for Asr (Shafi/Hanafi), high-latitude rule — all mapped 1:1 onto adhan-js `Parameters` fields (exact enum names preserved to avoid mapping bugs).

### 3.3 UI, Typography & Motion Layer

- **Countdown typography** `[O/I]`: tabular numerals, fixed-width so seconds don't reflow layout; v2 same + `font-feature-settings: "tnum"`.
- **Hero card** `[D]`: solid surface (zero glass-on-glass), Arabic prayer names with transliteration subtitle for non-Arabic locales.
- **Transition at prayer switch** `[D]`: cross-fade + spring scale of hero card when `next` changes; no layout jump.

### 3.4 Store-Grounded Deltas (Ameen · App Store fetch 2026-11-17) `[O]`

| Store feature (evidence) | v2 disposition |
| :--- | :--- |
| **"Nine new home screen widgets: next prayer with countdown, full analog clock, prayer times list, prayer times table, three-prayer timeline, daily dua, daily hadith, and more — each with multiple colour options and full Arabic support."** | Confirms C-6 and *extends* it: Phase 5 widget roster = countdown, analog clock, times list, **times table**, three-prayer timeline, daily dua, daily hadith (7 named types ≥ native minimum), color variants from design tokens, Arabic-Indic numeral support. |
| **Monthly prayer times**: "View the full month's prayer schedule at a glance", with Hijri/Gregorian switching | **Adopt** (Phase 4 Tools): `prayer-engine.schedule(year, month)` renders the 29/30-day table; Hijri↔Gregorian column toggle; exported as shareable image (Athkar parity). |
| **Prayer-linked reminders**: "Salawat reminders now follow your prayer times instead of a fixed hour" | **Adopt + generalize** (new §4.7): every recurring reminder anchors to *computed prayer times* (never fixed clock hours), so DST/city changes propagate automatically. |
| Tafsir comparison: "view up to 3 tafsirs side by side for an ayah or across a full surah" | **Adopt** (Phase 3 reader sheet on wide viewports): 2–3 column tafsir compare; mobile keeps single-book sheet with fast book switch. |
| Hijri + Gregorian side-by-side calendar; personal occasions tied to Hijri dates with pre-date reminders | **Adopt**: Hijri calendar Tools screen + `user_occasions` reminders (anchored per §4.7). |
| Mushaf: sujud positions displayed, bookmarks, voice search, Khatma pages-per-day with button in surah list | Sujud marks → render from `ayahs.sajdah` column on page plates (schema-ready); voice search → web Speech API best-effort, native Phase 5. |
| "AI-powered search across Quran, Hadith, and Azkar in natural language"; fatwa search | **Rejected for v2** — requires online models, violates the 100%-offline pillar. v2's offline diacritic-insensitive FTS (S-12) is the substitute. |
| Recitation player with reciter favorites, offline playback of downloads, speed persisted | Confirms §7 pack model; favorites/pin reciters → `user_settings.reciter` + favorites list. |
| Share duas/adhkar as images ("Turn any dua or dhikr into a beautiful shareable image") | v1 already ships share-image cards; extended to athkar cards in Phase 4. |
| Azkar tashkeel toggle | **Adopt**: `user_settings.tashkeel_display` (render-time diacritic strip on athkar body only — Quran text is never altered). |
| Ad-supported tracking (App Privacy: identifiers/usage data may track) | **v2 rejects entirely**: no ads, no tracking, no analytics — sadaqa project stance (v1 already ships with zero trackers; keep). |

---

## 4. Cross-Cutting Engineering Mechanics (REA synthesis)

### 4.1 Haptics Choreography (v2 unified model)

| Event | Pattern (web Vibration / native bridge) |
| :--- | :--- |
| Dhikr tap tick | 10 ms micro-pulse |
| Dhikr card complete | `[20, 60, 20, 60, 40]` ascending harmonic |
| Category complete | triple pulse with 120 ms gaps |
| Page flip settle | 15 ms soft tick on settle frame |
| Bookmark saved | double 25 ms |
| Prayer switch (Today Hub) | none (visual only) |

Native targets route through a `Haptics` PlatformBridge method so patterns are
defined once in design-tokens and interpreted per platform (CoreHaptics on iOS,
VibrationEffect on Android, `navigator.vibrate` on web).

### 4.2 Khatmah Daily-Target Math

```
state: { startDate, endDate?, dailyPages, completedPages[], targetId }
if endDate set:
    remainingDays = inclusiveDays(today, endDate)
    remainingPages = 604 − completedCount
    dailyTarget = ceil(remainingPages / remainingDays)      // rescale when behind
    if remainingDays ≤ 0 → all remaining due today (grace: keep date, mark "late", don't silently reset)
else fixed-rate mode:
    dailyTarget = user-set dailyPages; projectedEnd = today + ceil(remainingPages / dailyTarget)
completion of page p requires p−1 complete (order guard), else allow "skip-ahead" only via explicit UI
streak: increments when ≥1 page marked complete on consecutive calendar days (local time, not UTC)
```

Edge cases handled: DST shifts (inclusive local-day math), timezone travel (streak preserves on `updatedAt`-based grace ≤36 h), leap completion (`completedPages` is an explicit set, never derived from a counter).

### 4.3 Sunnah Time Windows

```
fajr    = adhan.fajr        sunrise = adhan.sunrise      maghrib = adhan.maghrib
duha    = sunrise + (maghrib − sunrise) × 0.25              // mid-morning window opens at 1/4 solar day
dhuhaEnd = sunrise + (maghrib − sunrise) × 0.5              // approaches zenith
nightLength = nextFajr − maghrib
midnight = maghrib + nightLength / 2                        // Islamic midnight
lastThird = maghrib + (2 × nightLength / 3)
```

All four targets compute from the same `adhan` parameter object — zero
per-platform formula divergence (this is Pillar-critical: a 2-minute
cross-platform divergence would break the "bit-for-bit" directive).

### 4.4 Arabic Search Normalization (diacritic-insensitive)

Normalization pipeline (applied at **write** time into FTS `normalized` column; query time applies the same to user input):

1. Unicode NFC
2. Strip tashkeel: U+064B–U+065F, U+0670, U+06D6–U+06ED (including small-waw/small-ya marks used in Uthmanic text)
3. Hamza folding: أ إ آ ٱ → ا ; ؤ → و ; ئ ي → ي ; ء kept only word-initially else folded
4. Ta-marbuta ة → ه ; ى → ي
5. Collapse whitespace; strip punctuation incl. Arabic comma/semicolon and Quranic annotation marks (U+06D4, U+FD3E/F etc.)

Both Uthmani (rendering) and Imlaei (search canonical) texts are stored per ayah
(`ayahs.text_uthmani`, `ayahs.text_imlaei`); FTS indexes the normalized Imlaei so
"الفاتحة", "ٱلْفَاتِحَة", and "الفتحه" all hit. Same pipeline for athkar text and
surah names. **Schema support**: `fts_ayahs` / `fts_athkar` FTS5 tables (schema.sql §6).

### 4.7 Prayer-Anchored Reminder Engine (from Ameen store evidence: "Salawat reminders now follow your prayer times instead of a fixed hour" `[O]`)

Every recurring reminder is defined as an **anchor expression**, never a clock hour:

```
anchor := { kind: 'prayer_offset', prayer: fajr|sunrise|dhuhr|asr|maghrib|isha,
            offsetMinutes: -30..+120 }      // e.g. Salawat = dhuhr + 20, last-third = isha → engine computes
         | { kind: 'solar', window: 'duha'|'midnight'|'lastThird' }
         | { kind: 'hijri_event', event: 'ramadan_start'|'eid'|'white_days_13|14|15', offsetDays: n }
         | { kind: 'daily_at', time: 'HH:MM' }   // permitted ONLY for user-defined custom times
schedule(target) → resolved datetime[] for the next N days, recomputed whenever
                   city, calculation method, or DST offset changes
```

Rationale: a fixed-hour reminder silently drifts from worship context (DST, travel, method change). v2 resolves anchors lazily at scheduling time from the same shared prayer engine — identical values on all 4 targets. Fajr alarm (Athkar: "works even in silent mode") maps to native exact alarms (Phase 5); PWA/Electron best-effort.

### 4.5 Offline Caching Strategy (learned from v1's gap)

v1's runtime fetch from `api.alquran.cloud` (7-day localStorage TTL cache) is
retired. v2 rule: **everything canonical ships inside the app bundle / first-run
SQLite seed**; network is used *only* for optional audio-pack downloads (cached
to OPFS on web, filesystem on Electron/Android/iOS). No canonical feature may
depend on a runtime network call — this is enforced by a test that blocks all
non-localhost requests (`e2e-offline-shell.mjs` extended in Phase 2).

### 4.6 State Machines (v2 normative)

- **Reader**: `{closed → page(P) ⇄ sheet(Tafsir|Actions|Audio) → page(P±1)}; chrome ∈ {shown, hidden}`; resume restores exact page.
- **Dhikr session**: `{index i, count c} → tap: c<target? c+1 : complete(i) → advance(i+1) → done(category) → streak+1`.
- **Audio player**: `{idle → loading(pack,surah,ayahFrom) → playing(word w) ⇄ paused → seek(surah,ayah,word) → playing → ended → next(action: stop|loop|autoNextSurah)}`; every transition persists resume token.
- **Backup/Restore**: `{idle → export(serialize) → share | import(file) → validate(schemaVersion) → choose(merge|replace) → apply → report(added/merged/conflicts)}` (full spec in ARCHITECTURE.md §8).

---

## 5. Feature & UX Synthesis Matrix

Legend — **Mechanism**: what the benchmark does · **Eliminated**: benchmark/weakness or v1 weakness removed · **Upgrade**: the v2 surpass move.

| # | Feature / Flow | Benchmark Mechanism | Weaknesses Eliminated | Sadaqa Jaria v2 Upgrade |
| :--- | :--- | :--- | :--- | :--- |
| S-1 | Mushaf rendering | Fixed 15-line authentic pages `[O]` | Reflowing text drift, missing printed-page look (v1's flowing HTML) | QUL-anchored 604-page plates + word coordinates; **adaptive spread** on desktop/tablet landscape `[D]` |
| S-2 | Home IA | Static prayer dashboard `[O]` / static athkar list `[O]` | Home shows *info*, not *guidance*; user must know what to do next | **Smart Context-Aware Card**: Fajr→morning athkar, Asr→evening athkar, ±20 min post-prayer→post-prayer dhikr, Friday→Al-Kahf, night→Qiyam last-third `[D]` |
| S-3 | Ayah interaction | Long-press action sheet `[O]` | Hunt through menus; no memorizer support | Sheet + **offline Mutashabihat** + word-by-word play entry `[D]` |
| S-4 | Audio | Per-ayah playback `[O]` | Verse-only sync; no word anchoring; online streaming dependency | **Offline multi-reciter packs** + gapless playback + real-time word highlight from timestamp segments `[D]` |
| S-5 | Dhikr counting | Full-card tap + ring + auto-advance `[O]` | Tiny counter buttons, manual "next", silent counting | Same flow + **haptic/audio choreography** + hands-free sequential audio mode `[D]` |
| S-6 | Athkar knowledge | Hadith shown inline `[O]` | Cluttered cards dilute the dhikr text | Collapsible verification: minimal by default, one-tap source/grade/fadl `[D]` |
| S-7 | Prayer times | Astronomical engine + countdown `[O]` | Per-platform drift, no sunnah windows | Single adhan-js core shared by 4 targets (bit-for-bit) + Qiyam/Duha calculators `[D]` |
| S-8 | Qibla | Compass `[O]` | Requires sensors; wrong on desktop | Compass + declination note + **manual dial fallback** (sensorless devices) |
| S-9 | Data ownership | (none of the 3 has a portable backup format) `[T]` | Vendor-locked progress; reinstall = data loss | **`.sadaqa` universal backup**: cross-OS JSON, Smart Merge / Full Replace, zero account `[D]` |
| S-10 | Navigation | Native tab bar (Ameen widgets era) `[O]` | Cluttered glass-on-glass overlays; inconsistent control layers | **Liquid Glass strictly on control layer** (floating pill tab bar + trailing search pill + mini-player); content stays matte/solid `[D]` |
| S-11 | Reading persistence | Last-page resume `[O]` | Resume lost across devices | Resume token inside `.sadaqa` backup; restored on any target |
| S-12 | Search | (Ayah: in-mushaf navigation) `[T]` | Online search dependence; diacritic sensitivity | **Offline diacritic-insensitive FTS** over 6,236 ayahs + tafsir + athkar + surah names `[D]` |
| S-13 | Khatmah | Page tracker + streaks `[O]` | Fixed targets; silent date drift | Deadline-aware rescaling math (§4.2) + graceful "late" state + portable plan state |
| S-14 | Desktop presence | (Ameen widgets are mobile-only) `[T]` | No ambient prayer awareness on desktop | Electron **system-tray live countdown** + native adhan notifications `[D]` |
| S-15 | Multi-platform parity | Each benchmark ships on 2 platforms max `[T]` | Divergent feature sets across platforms | **Golden Reference strategy**: one spec, 4 synchronized targets + shared data core |
| S-16 | Annotation granularity | Ayah has color highlights grouped by surah/color — but **no word-level highlight** (reviewer-requested, absent) `[O]` | Verse-only annotation ceiling | **Word-range highlights** schema-native (`highlights.word_start/word_end`), groupable list by surah/color `[O→upgrade]` |
| S-17 | Reminder architecture | Ameen anchors reminders to prayer times, not fixed hours `[O]` | Fixed-hour reminders drift on DST/travel/method change | §4.7 anchor-expression engine — all reminders (Salawat, Qiyam, White Days, Hijri occasions) resolved from the shared engine |
| S-18 | Prayer schedule depth | Ameen: full monthly table + Hijri/Gregorian switch `[O]`; Athkar: monthly share as image/PDF `[O]` | Daily-only view forces app reopening each day | Phase 4 monthly schedule + shareable image export |
| S-19 | Accessibility | Athkar ships VoiceOver, ≥200% text, differentiate-without-color, blind-user Qibla `[O]` | Benchmarks treat a11y as iOS-only nicety | v2 adopts the same matrix as a **baseline on all 4 targets** (incl. web/desktop) |
| S-20 | Tafsir depth | Ameen: up-to-3 side-by-side comparison `[O]`; Ayah: Muyassar/Saadi + translations `[O]` | Single-tafsir ceiling; heavy books shipped in-app | Multi-tafsir sheet (wide-viewport compare) + pack-installed books; core db ships Muyassar only |

---

## 6. Unknowns & Follow-Up Research (tracked, not blocking)

1. **Ayah app exact spring/curves** `[U]` — precise cubic-bezier/spring constants are proprietary; v2 defines its own token set tuned by feel (design-tokens Phase 2), so parity is stylistic, not numeric. (Note: Ayah adopts Apple's Liquid Glass on iOS 26+ `[O]` — confirming the visual direction Pillar A mirrors.)
2. **Athkar app dataset source & grading** `[U]` — v2 bundles Hisn al-Muslim as the canonical corpus (mandated), with per-item grading taken from the standard printed edition metadata; re-verification against a published edition happens in Phase 2 data ingestion.
3. **Ameen widget update cadence** `[U]` — native widget refresh budgets (iOS timeline / Android AlarmManager) are Phase 5 implementation details; the *data* they render comes from the same shared engine, so divergence risk is contained.
4. **QUL dataset licensing/version pinning** — resolved in Phase 2 ingestion: dataset version is pinned and recorded in `meta.schema_version` + `core_data_manifest`.

These unknowns do not block Phase 1 or 2 architecture: every one is scoped to a
later implementation phase and the architecture is specified to be correct
regardless of their resolution.

---

*End of REA_SPEC.md — Phase 1 of 5. Next: user approval → Phase 2.*
