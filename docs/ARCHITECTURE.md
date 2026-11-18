# ARCHITECTURE.md — Sadaqa Jaria v2 · Monorepo Architecture & Platform Contracts

> Status: **Phase 1 deliverable** (v1.0, 2026-11-17) · Companion: [`docs/REA_SPEC.md`](REA_SPEC.md) · [`packages/core-data/schema.sql`](../packages/core-data/schema.sql) · [`TASK_PLAN-v2.md`](archive/TASK_PLAN-v2.md) (archived)

---

## 1. Vision & Non-Negotiable Principles

1. **100% offline-first from first launch** — every core feature (604-page Mushaf, Tafsir, full-text search, Hisn al-Muslim, Tasbih, astronomical prayer times, Qibla, Hijri calendar, Zakat/Qiyam, `.sadaqa` backup) runs with **zero network**. Network is *only* an optional enhancer (audio-pack downloads). v1's runtime dependency on `api.alquran.cloud` is retired.
2. **Golden Reference strategy** — `apps/web-desktop` is built first, verified by e2e/probe suites, then ported verbatim (UI + state machines) to iOS/Android. No per-platform feature drift.
3. **One data core, one engine** — a single SQLite schema and a single prayer/search/audio engine serve all four targets. Bit-for-bit identical prayer times across platforms.
4. **Liquid Glass on the control layer only** — never glass-on-glass; content always on matte/solid surfaces (Apple HIG compliance per REA_SPEC §5 S-10).
5. **No build step for the web target** — v1's zero-tooling PWA philosophy is preserved: the web app ships plain ES modules (v2 upgrades from v1's classic scripts to ES modules — no bundler, no framework runtime). Desktop wraps the same sources in Electron; native targets are pure ports, not hybrid shells.

---

## 2. Monorepo Directory Structure

```
sadaqa-jaria/
├── apps/
│   ├── web-desktop/                 # ⭐ Golden Reference (built FIRST)
│   │   ├── index.html
│   │   ├── js/                      # plain ES modules (no bundler)
│   │   │   ├── main.js              # entry: boot, router, SCREEN_TAB registry
│   │   │   ├── platform/            # PlatformBridge resolution + adapters
│   │   │   │   ├── bridge.js        # interface + capability detection
│   │   │   │   ├── web-adapter.js   # OPFS/IndexedDB + Notification + Vibration
│   │   │   │   └── electron-adapter.js
│   │   │   ├── data/                # db.js (wasm-sqlite host), repos/*.js
│   │   │   ├── engines/             # prayer.js, hijri.js, qibla.js, search.js, audio.js
│   │   │   ├── ui/                  # screens/*.js, components/*.js, router.js
│   │   │   └── styles/              # tokens.css (generated), base.css, screens/*.css
│   │   ├── sw.js                    # precache shell + runtime cache (audio only, offline-by-default)
│   │   ├── electron/
│   │   │   ├── main.cjs             # tray countdown, adhan scheduler, window mgmt
│   │   │   └── preload.cjs          # contextBridge → window.sadaqaBridge
│   │   └── manifest.json
│   ├── ios-native/                  # Phase 5: Swift/SwiftUI/GRDB/WidgetKit/CoreHaptics
│   └── android-native/              # Phase 5: Kotlin/Compose/Room/Glance/exact alarms
├── packages/
│   ├── core-data/
│   │   ├── schema.sql               # ⭐ canonical SQLite schema (Phase 1: done)
│   │   ├── manifest.json            # dataset versions, db integrity hash
│   │   ├── seed/                    # bundled JSON/TSV sources per dataset
│   │   ├── tools/                   # ingestion + verification scripts (Node)
│   │   │   ├── build-db.mjs         # seed/*.json → sadaqa.db (SQLCipher-free, plain SQLite)
│   │   │   ├── verify-db.mjs        # row-count/geometry/order invariants
│   │   │   └── backup-schema.mjs    # .sadaqa JSON-Schema compiler
│   │   └── engines/                 # plain ESM JS (JSDoc-typed): prayer, reminders, hijri,
│   │                                # qibla, search, backup-merge (shared by web; mirrored by native)
│   └── design-tokens/
│       ├── tokens.json              # source of truth (colors, type, radii, springs, haptics)
│       ├── tokens.css               # generated CSS custom properties
│       ├── tokens.swift             # generated (Phase 5)
│       └── tokens.kt                # generated (Phase 5)
├── docs/
│   ├── REA_SPEC.md · ARCHITECTURE.md · QURAN_LAYOUT.md · ADHKAR_DESIGN.md · archive/
├── tests/                           # migrated v1 harness (e2e + probes + unit)
├── docs/archive/TASK_PLAN-v2.md (archived phase tracker)
├── index.html                       # v1 PWA (frozen until cutover, see §10)
└── sw.js
```

**Package ownership rules** — `packages/*` contain **zero DOM/Node APIs** (pure
functions + data); apps consume them. This is what makes the native port a
*translation*, not a rewrite: same constants, same math, same merge algorithm.

---

## 3. Target Matrix & Platform Capabilities

| Capability | Web PWA | Electron Desktop | iOS Native | Android Native |
| :--- | :--- | :--- | :--- | :--- |
| Mushaf 604-page + spread | ✅ | ✅ | ✅ | ✅ |
| SQLite hosting | WASM SQLite + **OPFS** persisted volume | `better-sqlite3` (main process) | GRDB.swift | Room/SQLite |
| Audio storage | OPFS (packs) | filesystem (`userData/audio`) | app container | app files dir |
| Prayer notifications | Notification API + SW wake (best-effort) | exact OS schedule | UNCalendar | exact alarm + FGS |
| Widgets | — (documented platform limit) | system tray countdown | WidgetKit + Lock Screen | Glance |
| Haptics | `navigator.vibrate` | none (no-op) | CoreHaptics | VibrationEffect |
| Backup file access | File System Access API / download | native save dialog | iCloud hook + Files | SAF |
| Search | FTS5 in wasm SQLite | same | FTS5 (GRDB bundles an FTS5-enabled SQLite) | FTS5 — **bundled private SQLite** (e.g. requery `sqlite-android`); Android *system* SQLite's FTS5 support varies by device, so the app never depends on it |

The **Golden Reference contract**: a capability absent on web is implemented on
native *from the same spec section*, never invented ad hoc.

---

## 4. PlatformBridge Interface Contract

Single seam between the shared web app and each host. Declared once, versioned,
capability-negotiated at boot.

```ts
// apps/web-desktop/js/platform/bridge.js
/** @v2 contract — semver: bridge.major must match host; minor additive-only */
interface SadaqaPlatformBridge {
  readonly version: { major: 2; minor: number };
  readonly kind: 'web' | 'electron' | 'ios' | 'android';

  readonly capabilities: {
    tray: boolean;            // Electron: live countdown tray item
    exactAlarms: boolean;     // native: exact prayer scheduling
    nativeAudioCache: boolean;// filesystem instead of OPFS
    shareFile: boolean;       // share/export .sadaqa via OS share sheet
  };

  // ── storage ──
  dbHost(): DatabaseHost;                    // wasm+OPFS on web; main-process sqlite on Electron
  audioStore(): AudioStore;                  // OPFS impl | fs impl (packDir, get(pack,surah), put, delete, usage)
  exportFile(bytes: Uint8Array, name: string): Promise<void>;
  importFile(accept: '.sadaqa'): Promise<Uint8Array | null>;

  // ── system ──
  scheduleAdhan(times: { name: string; at: number }[]): Promise<void>;
  cancelAdhan(): Promise<void>;
  notify(payload: { title: string; body: string; tag?: string }): Promise<void>;
  setTray(nextPrayer: { name: string; at: number } | null): void;   // Electron only
  haptic(pattern: number[]): void;

  // ── lifecycle ──
  onUpdate(cb: (ev: { type: 'adhan'|'prayerChanged'|'trayTick' }) => void): void;
}
```

Rules:
- **Detection**: boot resolves `window.sadaqaBridge` (Electron preload injects it) → else `web-adapter` (PWA). iOS/Android embed a WebView fallback of the same app only for onboarding parity screens; primary UX is fully native.
- **Fallback degradation** is explicit: web adapter returns `capabilities.tray=false` and callers branch — no undefined-bridge crashes, no silent no-ops.
- **Electron security**: `contextIsolation: true`, `nodeIntegration: false`; the preload exposes *only* the bridge surface above (allow-listed IPC channels `sadaqa:*`), renderer never touches Node.

---

## 5. Data Core Architecture

### 5.1 Hosting strategy (per target)

- **Web**: the official **`@sqlite.org/sqlite-wasm`** build with the database persisted via **OPFS**. The canonical `sqlite3.wasm` artifact compiles with **`-DSQLITE_ENABLE_FTS5`** (confirmed in `ext/wasm/GNUmakefile`'s full-featured `SQLITE_OPT` set — FTS3/FTS4 are *not* compiled in, JSON and R-Tree are), so the FTS5 search schema runs identically to `better-sqlite3`/GRDB. **Boot guardrail**: on every first open the app asserts `SELECT sqlite_compileoption_used('ENABLE_FTS5') = 1` and fails loudly into a diagnostics screen if not — a substitute wasm build can never silently break search. **VFS choice**: `opfs-sahpool` (synchronous Access-Handle pool, "easily the highest OPFS performance", **no COOP/COEP headers required** — mandatory for GitHub Pages, where custom headers cannot be set); the proxy-based `opfs` VFS is explicitly *not* used because it requires `Cross-Origin-Embedder-Policy`/`Cross-Origin-Opener-Policy` headers. Accepted trade-off: sahpool allows one connection — fine for a single-window PWA (cross-tab cooperative pause/unpause API documented for future use). First run imports the *bundled seed database* into the sahpool via `importDb` if absent.
- **Desktop**: same `sadaqa.db` file opened by `better-sqlite3` in the Electron main process; renderer queries over the allow-listed IPC channel (`sadaqa:db:query`, prepared statements only).
- **Native**: GRDB/Room open the *same schema file* (identical DDL, executed at first launch).

The **canonical artifact is `packages/core-data/build/sadaqa.db`**, produced by
`tools/build-db.mjs` from `seed/` datasets (QUL layout exports, tafsir JSON,
Hisn al-Muslim, cities). Its SHA-256 is recorded in `manifest.json`; the app
verifies integrity once at seed-copy time.

### 5.2 Schema layout (full DDL in `schema.sql`)

| Domain | Tables | Notes |
| :--- | :--- | :--- |
| Quran corpus | `surahs` (114), `ayahs` (6,236; uthmani+imlaei text) | Imlaei text is the search canonical |
| Mushaf geometry | `mushaf_pages` (604), `mushaf_lines` (15/page), `mushaf_words` (~82k) | QUL-compatible: word x/y/w/h + line + position; one composite render query `v_page_words` |
| Tafsir | `tafsir_books`, `tafsirs` | per-ayah, per-book; Muyassar bundled, others as packs |
| Mutashabihat | `mutashabihat` | curated pairs + FTS assist |
| Athkar | `athkar_categories`, `athkar_items` | Hisn al-Muslim + count targets + source/grade/fadl |
| Prayer | `cities` (offline), `prayer_overrides` | user-adjusted times (+minutes) & Hijri offset |
| Audio | `reciters`, `audio_surahs`, `audio_word_segments` | word timestamps enable word-by-word highlight |
| User data | `user_progress`, `bookmarks`, `highlights`, `notes`, `khatmah_plans`, `adhkar_state`, `tasbih_counters`, `tasbih_sessions`, `streaks`, `user_settings`, `audio_packs_state`, `backup_log` | all carry `uuid` + `updated_at` (backup contract, §8) |
| Search | `fts_ayahs`, `fts_athkar` (FTS5, contentless) | normalized text written once at ingestion; canonical tables are immutable at runtime |

### 5.3 Engines (`packages/core-data/engines/`)

Plain **ESM JavaScript with JSDoc types** (zero build step, consistent with the
web target's no-bundler principle; `tsc --noEmit --checkJs` used as an optional
checker, never a build step):

- **prayer.js** — wraps `adhan-js` (vendored, pinned): `compute(params) → PrayerTimes`; `next(now) → {name, at, previous}`; sunnah windows (`duha`, `midnight`, `lastThird`) per REA_SPEC §4.3; **parameter enums mirror adhan-js exactly** (methods, madhab, highLatitudeRule) so no translation layer can drift.
- **reminders.js** — anchor-expression resolver (REA_SPEC §4.7): prayer-offset / solar-window / hijri-event / daily-at anchors → concrete datetimes.
- **hijri.js** — Hijri conversion + `adjust(+n days)` persisted; Islamic events (Ramadan start, Eid, Ashura, White Days…) derived, not hand-typed.
- **qibla.js** — great-circle bearing to Kaaba; pure function.
- **search.js** — the 5-step normalizer (REA_SPEC §4.4) exported as one function used by ingestion (`build-db.mjs` pre-normalizes FTS columns) and by query time (normalizes the user string).
- **backup-merge.js** — `.sadaqa` merge algorithm (§8.3), pure and unit-tested.

### 5.4 Bundle-Size Guardrail — Core DB vs. Packs (Web PWA first-load budget)

The core bundled `sadaqa.db` and the heavy optional corpora are **physically
separate artifacts**; nothing heavy ships inside the first load:

| Artifact | Contents | Ships how | Budget |
| :--- | :--- | :--- | :--- |
| `sqlite3.wasm` | official `@sqlite.org/sqlite-wasm` (FTS5 on) | bundled asset | ~1 MB |
| `sadaqa.db` (core) | schema + Quran text (uthmani+imlaei) + **full 604-page QPC layout (77,995 word plates)** + **Muyassar tafsir** + Hisn al-Muslim + cities + reciter manifests | bundled asset, imported to OPFS on first run | **≤ 45 MB** (measured 42.0 MB; enforced gate in `verify-db.mjs`) |
| `tokens.css` + app shell | design tokens, JS modules, sqlite-wasm (~1.5 MB), UI fonts | bundled assets, precached by SW | ≤ 6 MB |
| **QPC1 per-page fonts** | 605 files (`p001.woff2`…`p604.woff2` + `QPC1BSML.ttf`, 46 MB total) | **loaded per page on demand** (one `FontFace` per plate, evicted on page change) and SW cache-first — a page is fully offline after its first visit | per page ≤ 85 KB |
| **Tafsir packs** | Ibn Kathir, Qurtubi, Tabari, translations (Saadi-Russian, Clear Quran) | on-demand download → OPFS `packs/tafsir/{book}.db` (side-car DBs attached at runtime, never merged into core) | each ≤ 40 MB |
| **Audio packs** | reciter surah files + word segments | on-demand download → AudioStore (§7.1) | per-surah ≤ 2 MB |

Rules enforced by the build + tests:
1. `build-db.mjs` writes core and packs from *separate* seed sets; `tafsir_books.bundled = 1` only for Muyassar. Pack side-car DBs share the identical `schema.sql` DDL and attach as `ATTACH DATABASE`, so a pack install is transactional and removable without touching core data.
2. `e2e-offline-shell` measures the SW-precached shell size and fails the build if the first-load budget above is exceeded.
3. Pack manifests (`manifest.json` per pack) pin versions and SHA-256 — same integrity model as core.

---

## 6. Design Tokens & Liquid Glass Rules

`packages/design-tokens/tokens.json` → generated `tokens.css` (web), `tokens.swift`, `tokens.kt`.

- **4 themes**: Light, Sepia, Dark, OLED Black — each with full contrast-checked ramp (v1's gold-contrast fix is codified as the Dark-theme `--accent` floor of 4.5:1).
- **Radii**: concentric system (outer = inner + padding).
- **Springs** (REA unknown #1 resolved by v2's own tuned constants): `spring.pageFlip (damping 0.85, duration 380ms)`, `spring.sheet (0.9/320ms)`, `spring.tabMorph (0.75/420ms)`.
- **Haptic patterns**: the REA_SPEC §4.1 table lives in `tokens.haptics`.
- **Glass policy**: glass allowed *only* on `tabbar`, `search-pill`, `miniplayer`, `toolbar`; forbidden on any content card (enforced by a lint-style test scanning CSS class usage).

---

## 7. Offline Audio & Word-by-Word Sync Architecture

### 7.1 Pack model

A **pack** = reciter × scope (`full_quran` or surah subset). Each pack manifest
lists per-surah audio files (gapless-friendly bitrate ~64–128 kbps Opus/AAC) and
optional word-segment files.

```
audio_packs_state(reciter_id, scope, status: idle|downloading|ready|partial, bytes, updatedAt)
AudioStore.put(pack, surah, file) → OPFS: /audio/{reciter}/{surah}.ogg (web)
                                 → userData/audio/{reciter}/{surah}.ogg (Electron)
```

Downloads are resumable, sequential, and only ever run when the user opens the
Audio Pack Manager — no background fetch. Playback never streams from network.

### 7.2 Gapless playback

Surah files are **pre-concatenated continuous files** per surah (not per-ayah
fragments); ayah boundaries are addressed by *time offsets* from the segment
data, so playback is one audio element per surah — no element-swap clicks. From
here (ayah n) we start at `segments[n].start`.

### 7.3 Word-by-word sync

`audio_word_segments(reciter_id, surah, ayah, word_seq, start_ms, end_ms)` —
generated once per reciter from timestamp sources; consumed by the player
tick loop:

```
audio.currentTime → binary-search current segment → highlight mushaf_words where
(surah, ayah, word_seq) matches → scroll-into-view if offscreen
```

Where segments are absent, the player degrades gracefully to **ayah-level**
highlight (ayah start/end from `audio_surahs.ayah_offsets`), never to silence
or desync. Precision target: word switch ≤ 80 ms perceived latency (raf-based
checker, not timeupdate which fires ~250 ms).

---

## 8. `.sadaqa` Universal Backup & Restore

### 8.1 File format

`.sadaqa` = a ZIP container (uncompressed store for JSON + deflate for audio-free
data; password never required) with:

```
sadaqa-backup/
├── manifest.json     # {format:"sadaqa-backup", formatVersion:1, appVersion, createdAt,
│                     #  deviceId, entities:{...counts}, integrity: sha256(payload.json)}
├── payload.json      # all user entities, grouped, with schema per §8.2
└── attachments/      # (optional) small blobs: custom-athkar audio notes etc.
```

ZIP (not raw JSON) chosen so iOS/Android/Electron file pickers show a single
typed file and future attachments don't break the format.

### 8.2 Entity payload schema (formatVersion 1)

Every entity: `uuid` (UUIDv7 — time-ordered, collision-safe offline), `updatedAt` (ISO-8601 UTC ms), `deleted` (tombstone flag). Groups:

| Group | Entities |
| :--- | :--- |
| reading | `khatmahPlans`, `bookmarks` (page+line anchor), `highlights` (word range + color), `notes` |
| dhikr | `adhkarState` (per item/date counters), `tasbihCounters`, `tasbihSessions` (bounded: last 90 days) |
| prefs | `userSettings` (theme, fontScale, reciter, calc params, hijriAdjust, locale) |
| meta | `streaks`, `audioPacksState` (metadata only — audio files are re-downloadable by design) |

Validation: JSON-Schema compiled by `tools/backup-schema.mjs`; a backup fails
validation *before* any write occurs, and `formatVersion > supported` is refused
with an upgrade hint (never partially imported).

### 8.3 Merge algorithm (Smart Merge) — normative pseudocode

```
merge(local db, payload):
  report = {added:0, updated:0, conflicts:0, skipped:0}
  for entity in payload.groups:
      existing = db.byUuid(entity.uuid)
      if not existing:                        insert(entity);  report.added++
      elif existing.updatedAt == entity.updatedAt and equal(existing, entity): skipped++
      elif entity.updatedAt > existing.updatedAt:            // latest-writer-wins per entity
          if existing.deleted and not entity.deleted:         // resurrection
              restore(entity); report.updated++
          else: apply(entity); report.updated++
      elif existing.updatedAt > entity.updatedAt:
          if existing.deleted:                                // deletion wins, keep tombstone
              report.skipped++
          else: report.conflicts++                            // kept local; conflict logged
  # full-replace mode: single transaction — wipe user tables, insert all, then
  # write {replaceMarker: timestamp} so a crash mid-restore rolls back atomically
```

- Conflict list is surfaced in the Restore report UI (never silently dropped).
- **Zero backend/account**: the file is the sync unit; cross-OS import is
  byte-identical because UUIDs + timestamps travel inside the file.
- Native cloud hooks (Phase 5): iCloud Drive/CloudKit on iOS, Android Auto
  Backup/SAF on Android — both merely *store/retrieve* the same `.sadaqa` file.

---

## 9. Navigation & Information Architecture (Golden Reference shell)

Per Pillar A (REA_SPEC §5 S-2/S-10):

- **4 primary tabs** — `اليوم` (Today Hub), `المصحف` (Mushaf), `الأذكار` (Athkar & Tasbih), `الأدوات` (Tools) — plus a **trailing universal Search pill** (`بحث`): diacritic-insensitive FTS across 6,236 ayahs, surah names, tafsir, athkar.
- **Floating pill tab bar** on compact viewports; **morphing glass sidebar** ≥ 1024 px. Auto-minimize on scroll; fully hidden inside the Mushaf reader (tap reveals).
- **Routing contract**: `SCREEN_TAB` registry maps screen id → tab (carried over from v1's contract so the existing e2e nav suites keep their shape); deep links preserved (`#/mushaf/page/242`, `#/adhkar/morning`, `#/tools/qibla`).
- **Smart Context-Aware Card** resolution order: Friday & between Fajr–Jumu'ah → Al-Kahf; ±20 min after any prayer → post-prayer dhikr; Fajr window → morning athkar; Asr window → evening athkar; last third of night → Qiyam card; else next-prayer details.

---

## 10. Migration Plan from v1 (non-breaking strangler pattern)

| Step | Action | Guarantee |
| :--- | :--- | :--- |
| M-1 | v1 root (`index.html`, `js/`, `sw.js`) stays intact and shippable | zero regression risk |
| M-2 | `apps/web-desktop` grows alongside; `packages/core-data` engines unit-tested first (pure ESM JS) | engines proven before UI consumes them |
| M-3 | Seed DB builder lands (`build-db.mjs` + QUL ingest + verifier) | data integrity gate before Mushaf UI |
| M-4 | v2 Mushaf reader built on new data; v1 tests ported + extended (`e2e-quran-layout.mjs` → page-plate assertions) | parity per feature |
| M-5 | Today Hub, Athkar/Tasbih, Tools ported; `.sadaqa` import *reads v1 localStorage state* (one-time migration on first v2 boot) | no user data loss |
| M-6 | Cutover: repo root re-points to `apps/web-desktop` build; v1 archived under `legacy/`; SW cache version bumped with a prompt-based update (v1's skipWaiting-only-via-message strategy retained) | controlled deploy |

GH Pages note (from v1 experience): custom headers are unavailable → MIME
purity for `.db`/`.wasm` must be handled by loading the seed DB via fetch+OPFS
rather than `X-Full-Paths` server config assumptions, and the wasm binary is
bundled locally (never CDN) to keep offline-first.

---

## 11. Testing & Verification Strategy

- **Unit** (Phase 2): prayer engine vs known golden times (Makkah/Riyadh/Cairo/London fixtures), normalizer property tests, merge algorithm table tests (≥24 cases: added/updated/conflict/tombstone/resurrection).
- **DB verifier** (`verify-db.mjs`): row counts (114/6,236/604/82k±), per-page line counts = 15, word geometry non-overlap sampling, ayah↔page linkage, FTS hit smoke tests.
- **E2E** (Phases 3–4): port v1's 11 suites; new: spread-layout, word-sync highlight, backup round-trip (export→wipe→import-merge), offline-shell with **all network blocked**.
- **Probes** (visual): reader theme matrix, chrome reveal, page-flip direction, tray countdown (Electron).
- **Native parity gate** (Phase 5): same e2e scenario list executed against native builds; prayer times diff = 0 ms vs web for the fixture cities.

---

*End of ARCHITECTURE.md — Phase 1 of 5. Next: user approval → Phase 2.*
