-- ============================================================================
-- sadaqa.db — Sadaqa Jaria v2 canonical offline database schema
-- ---------------------------------------------------------------------------
-- File      : packages/core-data/schema.sql
-- Phase     : 1 deliverable (v1.0, 2026-11-17)
-- Consumers : apps/web-desktop (sqlite-wasm + OPFS), Electron (better-sqlite3),
--             apps/ios-native (GRDB.swift), apps/android-native (Room)
-- Built by  : packages/core-data/tools/build-db.mjs (seed/*.json → this DDL)
-- Verified  : packages/core-data/tools/verify-db.mjs (row counts & invariants)
--
-- Invariants encoded here (verified after build):
--   surahs        : exactly 114
--   ayahs         : exactly 6,236  (global ayah_number 1..6236, no gaps)
--   mushaf_pages  : exactly 604    (Madinah 15-line layout)
--   mushaf_lines  : 15 per text page
--   mushaf_words  : ~82k           (QUL word coordinates, page-relative units)
--
-- Conventions:
--   * Canonical (seeded) tables are immutable at runtime; only packs
--     (tafsirs, audio_*) and user_* tables are written at runtime.
--   * Every user_* entity carries uuid (UUIDv7), updated_at (UTC ms), deleted
--     (tombstone) — the `.sadaqa` backup contract (docs/ARCHITECTURE.md §8).
--   * Times are Unix epoch **milliseconds** (INTEGER) unless suffixed _date
--     (ISO-8601 local-day string "YYYY-MM-DD").
--   * All coordinates are REAL fractions (0..1) of the page plate, computed by
--     ingestion from QUL pixel coordinates (reference size recorded in meta).
-- ============================================================================

PRAGMA foreign_keys = ON;
-- Note: journal_mode=WAL, synchronous=NORMAL are set by each host at open time
-- (wasm/OPFS and better-sqlite3 both support WAL); not executed from this file.

-- ----------------------------------------------------------------------------
-- 0. META — schema & dataset provenance
-- ----------------------------------------------------------------------------
CREATE TABLE meta (
  key           TEXT    PRIMARY KEY,          -- 'schema_version', 'dataset.qul_layout', 'sha256' …
  value         TEXT    NOT NULL              -- JSON-encoded scalar or object
) WITHOUT ROWID;

INSERT INTO meta (key, value) VALUES
  ('schema_version', '1'),
  ('format',         'sadaqa-db-v1'),
  ('created_at',     ''),     -- set by build-db.mjs (epoch ms)
  ('sha256',         '');     -- set by build-db.mjs over the built file

-- ============================================================================
-- DOMAIN 1 — QURAN CORPUS (canonical, seeded)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 surahs — 114 rows
-- ----------------------------------------------------------------------------
CREATE TABLE surahs (
  number              INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 114),
  name_ar             TEXT    NOT NULL,               -- الفاتحة
  name_en             TEXT    NOT NULL,               -- Al-Fātiḥah
  name_translit       TEXT    NOT NULL,               -- Al-Fatihah (ASCII for search/slug)
  revelation_type     TEXT    NOT NULL CHECK (revelation_type IN ('makkah','madinah')),
  ayah_count          INTEGER NOT NULL CHECK (ayah_count BETWEEN 3 AND 286),
  start_page          INTEGER NOT NULL,           -- no FK on purpose: breaks the circular
                                                -- dependency with mushaf_pages.surah_start;
                                                -- consistency is enforced by verify-db.mjs
  bismillah_rendered  INTEGER NOT NULL DEFAULT 1 CHECK (bismillah_rendered IN (0,1)),
                                                -- 0 for surah 1 (is ayah 1) and surah 9 (none)
  order_of_revelation INTEGER                       -- chronological index where known (nullable)
);

-- ----------------------------------------------------------------------------
-- 1.2 ayahs — 6,236 rows
-- text_uthmani : rendering canonical (Uthmanic script w/ full diacritics)
-- text_imlaei  : spelling canonical (search base — normalizer runs on it)
-- ----------------------------------------------------------------------------
CREATE TABLE ayahs (
  ayah_number      INTEGER PRIMARY KEY CHECK (ayah_number BETWEEN 1 AND 6236), -- global 1..6236
  surah            INTEGER NOT NULL REFERENCES surahs(number),
  number_in_surah  INTEGER NOT NULL CHECK (number_in_surah >= 1),
  page             INTEGER NOT NULL REFERENCES mushaf_pages(page_number),
  juz              INTEGER NOT NULL CHECK (juz  BETWEEN 1 AND 30),
  hizb_quarter     INTEGER NOT NULL CHECK (hizb_quarter BETWEEN 1 AND 240),    -- 8 per juz
  text_uthmani     TEXT    NOT NULL,
  text_imlaei      TEXT    NOT NULL,
  sajdah           TEXT    CHECK (sajdah IN ('none','recommended','obligatory')) DEFAULT 'none',
  UNIQUE (surah, number_in_surah)
);
CREATE INDEX idx_ayahs_surah      ON ayahs(surah, number_in_surah);
CREATE INDEX idx_ayahs_page       ON ayahs(page, ayah_number);
CREATE INDEX idx_ayahs_juz        ON ayahs(juz, ayah_number);

-- ============================================================================
-- DOMAIN 2 — MUSHAF GEOMETRY (QUL-compatible, seeded)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 mushaf_pages — 604 rows
-- ----------------------------------------------------------------------------
CREATE TABLE mushaf_pages (
  page_number  INTEGER PRIMARY KEY CHECK (page_number BETWEEN 1 AND 604),
  line_count   INTEGER NOT NULL DEFAULT 15 CHECK (line_count = 15),
  juz_start    INTEGER CHECK (juz_start BETWEEN 1 AND 30),        -- NULL when page starts mid-juz
  hizb_start   INTEGER CHECK (hizb_start BETWEEN 1 AND 240),
  surah_start  INTEGER REFERENCES surahs(number),                 -- surah whose header opens the page
  ayah_start   INTEGER REFERENCES ayahs(ayah_number),             -- first ayah beginning on the page
  plate_note   TEXT                                               -- e.g. juz marker, surah header spans
);

-- ----------------------------------------------------------------------------
-- 2.2 mushaf_lines — 15 per page (QUL "lines" resource)
-- kind: 'text'      → carries ayah content (ayah_number = first ayah on the line)
--       'surah_name'→ decorative header (surah = header surah)
--       'bismillah' → decorative bismillah line
--       'blank'     → spacer line on partial pages
-- ----------------------------------------------------------------------------
CREATE TABLE mushaf_lines (
  page_number  INTEGER NOT NULL REFERENCES mushaf_pages(page_number),
  line_number  INTEGER NOT NULL CHECK (line_number BETWEEN 1 AND 15),
  kind         TEXT    NOT NULL CHECK (kind IN ('text','surah_name','bismillah','blank')),
  ayah_number  INTEGER REFERENCES ayahs(ayah_number),   -- first ayah starting on this line (kind='text')
  surah        INTEGER REFERENCES surahs(number),       -- for kind='surah_name'
  text_ar      TEXT,                                    -- decorative line text (headers)
  glyphs_qpc   TEXT,                                    -- basmala PUA glyphs (render with QPC1-BSML font)
  PRIMARY KEY (page_number, line_number)
) WITHOUT ROWID;

-- ----------------------------------------------------------------------------
-- 2.3 mushaf_words — word plates (QUL "word positions" compatible)
-- (surah, ayah_number, word_seq) is the stable word address used by audio sync
-- (audio_word_segments) and highlights.
-- Layout contract: the seeded QPC1 dataset is ORDER-BASED (line_number +
-- line_position define the exact plate; the renderer flows words inside the
-- line with the QPC HAFS font). x/y/width/height stay NULL for order-based
-- data and may be populated later from a coordinate-based QUL layout (REAL
-- fractions 0..1 of the page plate; CHECKs apply only when present).
-- ----------------------------------------------------------------------------
CREATE TABLE mushaf_words (
  word_id       INTEGER PRIMARY KEY,
  surah         INTEGER NOT NULL REFERENCES surahs(number),
  ayah_number   INTEGER NOT NULL REFERENCES ayahs(ayah_number),
  word_seq      INTEGER NOT NULL CHECK (word_seq >= 1),   -- 1-based position inside the ayah
  page_number   INTEGER NOT NULL REFERENCES mushaf_pages(page_number),
  line_number   INTEGER NOT NULL CHECK (line_number BETWEEN 1 AND 15),
  line_position INTEGER NOT NULL CHECK (line_position >= 1),  -- 1-based order inside the line (RTL start)
  x             REAL CHECK (x IS NULL OR x BETWEEN 0 AND 1),
  y             REAL CHECK (y IS NULL OR y BETWEEN 0 AND 1),
  width         REAL CHECK (width IS NULL OR (width > 0 AND width <= 1)),
  height        REAL CHECK (height IS NULL OR (height > 0 AND height <= 1)),
  text_uthmani  TEXT NOT NULL,                            -- exact Unicode text at this plate
  glyphs_qpc    TEXT NOT NULL,                            -- QPC1 codepoint string (PUA glyphs) for the
                                                         -- per-page QPC1 font — the RENDERING canonical;
                                                         -- text_uthmani is the semantic copy
  UNIQUE (surah, ayah_number, word_seq)
);

CREATE INDEX idx_words_ayah   ON mushaf_words(surah, ayah_number, word_seq);
CREATE INDEX idx_words_page   ON mushaf_words(page_number, line_number, line_position);

-- ============================================================================
-- DOMAIN 3 — TAFSIR, TRANSLATIONS & MUTASHABIHAT
-- Core db ships Muyassar only (tafsir_books.bundled=1); every other book and
-- translation installs as a side-car pack DB (same DDL subset, ATTACHed at
-- runtime, transactionally removable — docs/ARCHITECTURE.md §5.4).
-- ============================================================================

CREATE TABLE tafsir_books (
  book_id      TEXT    PRIMARY KEY,            -- 'muyassar','ibn_kathir','qurtubi','tabari'
  name_ar      TEXT    NOT NULL,
  name_en      TEXT    NOT NULL,
  author       TEXT    NOT NULL,
  bundled      INTEGER NOT NULL DEFAULT 0 CHECK (bundled IN (0,1)),   -- 1 = ships in sadaqa.db
  version      TEXT    NOT NULL DEFAULT '1'
);

CREATE TABLE tafsirs (
  book_id    TEXT    NOT NULL REFERENCES tafsir_books(book_id) ON DELETE CASCADE,
  ayah_number INTEGER NOT NULL REFERENCES ayahs(ayah_number) ON DELETE CASCADE,
  body        TEXT    NOT NULL,                    -- plain text (Uthmanic-safe, no HTML)
  PRIMARY KEY (book_id, ayah_number)
) WITHOUT ROWID;

-- Translations (Ayah benchmark evidence, REA_SPEC §1.4): e.g. 'clear_quran' EN,
-- 'saadi_ru' Russian. Same pack model as tafsirs.
CREATE TABLE translation_books (
  book_id      TEXT    PRIMARY KEY,            -- 'clear_quran','saadi_ru', …
  name_ar      TEXT    NOT NULL,
  name_en      TEXT    NOT NULL,
  language     TEXT    NOT NULL,               -- ISO-639-1 ('en','ru','fr', …)
  bundled      INTEGER NOT NULL DEFAULT 0 CHECK (bundled IN (0,1)),
  version      TEXT    NOT NULL DEFAULT '1'
);

CREATE TABLE translations (
  book_id     TEXT    NOT NULL REFERENCES translation_books(book_id) ON DELETE CASCADE,
  ayah_number INTEGER NOT NULL REFERENCES ayahs(ayah_number) ON DELETE CASCADE,
  body        TEXT    NOT NULL,
  PRIMARY KEY (book_id, ayah_number)
) WITHOUT ROWID;

-- Curated similar-verse pairs for memorizers (offline Mutashabihat, REA_SPEC A-8)
CREATE TABLE mutashabihat (
  pair_id      INTEGER PRIMARY KEY,
  ayah_number  INTEGER NOT NULL REFERENCES ayahs(ayah_number) ON DELETE CASCADE,
  similar_ayah INTEGER NOT NULL REFERENCES ayahs(ayah_number) ON DELETE CASCADE,
  note_ar      TEXT,                                -- why they are similar (when curated)
  similarity   TEXT NOT NULL DEFAULT 'exact' CHECK (similarity IN ('exact','partial')),
  CHECK (ayah_number <> similar_ayah)
);
CREATE INDEX idx_mutashabihat_both ON mutashabihat(ayah_number);
CREATE INDEX idx_mutashabihat_sim  ON mutashabihat(similar_ayah);

-- ============================================================================
-- DOMAIN 4 — ATHKAR (Hisn al-Muslim, canonical; custom athkar live in user tables)
-- ============================================================================

CREATE TABLE athkar_categories (
  category_id  TEXT    PRIMARY KEY,                 -- 'cat-1','cat-2', … (dataset has Arabic-only titles)
  name_ar      TEXT    NOT NULL,
  name_en      TEXT,                                -- nullable: seed dataset is Arabic-only
  icon         TEXT    NOT NULL DEFAULT 'dhikr',    -- token icon name
  sort_order   INTEGER NOT NULL,
  solar_window TEXT    CHECK (solar_window IN ('fajr','duha','asr','night','after_prayer',NULL))
                                             -- drives the Today Hub Smart Card (REA_SPEC S-2)
);

CREATE TABLE athkar_items (
  item_id       TEXT    PRIMARY KEY,
  category_id   TEXT    NOT NULL REFERENCES athkar_categories(category_id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL,
  text_ar       TEXT    NOT NULL,                  -- full tashkeel dhikr/hadith text
  count_target  INTEGER NOT NULL DEFAULT 1 CHECK (count_target BETWEEN 0 AND 1000),
                                             -- 0 = recitation-only card (no counting)
  source_ar     TEXT,                              -- hadith citation (collapsible verification)
  grade         TEXT    CHECK (grade IN ('sahih','hasan','daif',NULL)),
  fadl_ar       TEXT,                              -- reward note (collapsible verification)
  audio_key     TEXT                               -- optional hands-free audio asset key
);
CREATE INDEX idx_athkar_items_cat ON athkar_items(category_id, sort_order);

-- ============================================================================
-- DOMAIN 5 — PRAYER & CALENDAR SUPPORT (canonical city seed + user overrides)
-- ============================================================================

CREATE TABLE cities (
  city_id    INTEGER PRIMARY KEY,
  name_ar    TEXT NOT NULL,
  name_en    TEXT NOT NULL,
  country_ar TEXT NOT NULL,
  country_en TEXT NOT NULL,
  lat        REAL NOT NULL CHECK (lat  BETWEEN  -90 AND  90),
  lng        REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  elevation  REAL NOT NULL DEFAULT 0,               -- meters (adhan-js elevation param)
  timezone   TEXT NOT NULL,                         -- IANA name (offline offsets bundled)
  population INTEGER,
  is_preseed INTEGER NOT NULL DEFAULT 0 CHECK (is_preseed IN (0,1))  -- Makkah/Madinah/Jerusalem…
);
CREATE INDEX idx_cities_name   ON cities(name_ar);      -- FTS over names lives in fts_ayahs sibling below
CREATE INDEX idx_cities_lookup ON cities(country_en, name_en);

-- User tweaks that must survive recompute: per-prayer minute offsets & Hijri shift
CREATE TABLE prayer_overrides (
  city_id   INTEGER PRIMARY KEY REFERENCES cities(city_id) ON DELETE CASCADE,
  offsets_json TEXT NOT NULL DEFAULT '{}',          -- {"fajr":2,"isha":-3} minute adjustments
  hijri_adjust INTEGER NOT NULL DEFAULT 0 CHECK (hijri_adjust BETWEEN -3 AND 3)
);

-- ============================================================================
-- DOMAIN 6 — AUDIO (reciter catalog canonical; pack state + segments runtime)
-- ============================================================================

CREATE TABLE reciters (
  reciter_id            TEXT    PRIMARY KEY,        -- 'alafasy','husary','minshawi', …
  name_ar               TEXT    NOT NULL,
  name_en               TEXT    NOT NULL,
  style                 TEXT    NOT NULL CHECK (style IN ('murattal','mujawwad')),
  word_segments_available INTEGER NOT NULL DEFAULT 0 CHECK (word_segments_available IN (0,1)),
  manifest_version      TEXT    NOT NULL DEFAULT '1'
);

CREATE TABLE audio_ayah_offsets (
  reciter_id  TEXT    NOT NULL REFERENCES reciters(reciter_id) ON DELETE CASCADE,
  surah       INTEGER NOT NULL REFERENCES surahs(number) ON DELETE CASCADE,
  ayah_number INTEGER NOT NULL REFERENCES ayahs(ayah_number) ON DELETE CASCADE,
  start_ms    INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms      INTEGER NOT NULL CHECK (end_ms > start_ms),
  PRIMARY KEY (reciter_id, ayah_number)
) WITHOUT ROWID;

-- Word-level timestamps → word-by-word highlight (ARCHITECTURE.md §7.3).
-- Present only when reciters.word_segments_available = 1.
CREATE TABLE audio_word_segments (
  reciter_id  TEXT    NOT NULL REFERENCES reciters(reciter_id) ON DELETE CASCADE,
  surah       INTEGER NOT NULL REFERENCES surahs(number) ON DELETE CASCADE,
  ayah_number INTEGER NOT NULL REFERENCES ayahs(ayah_number) ON DELETE CASCADE,
  word_seq    INTEGER NOT NULL CHECK (word_seq >= 1),
  start_ms    INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms      INTEGER NOT NULL CHECK (end_ms > start_ms),
  PRIMARY KEY (reciter_id, ayah_number, word_seq),
  FOREIGN KEY (surah, ayah_number, word_seq) REFERENCES mushaf_words(surah, ayah_number, word_seq)
) WITHOUT ROWID;

-- Download/install state per pack (files themselves live in the AudioStore,
-- not in SQLite — see ARCHITECTURE.md §7.1)
CREATE TABLE audio_packs_state (
  reciter_id  TEXT    NOT NULL REFERENCES reciters(reciter_id) ON DELETE CASCADE,
  scope       TEXT    NOT NULL DEFAULT 'full_quran' CHECK (scope IN ('full_quran','surah_subset')),
  status      TEXT    NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','downloading','ready','partial')),
  bytes       INTEGER NOT NULL DEFAULT 0,
  surahs_json TEXT    NOT NULL DEFAULT '[]',        -- for surah_subset: [1,36,67,…]
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (reciter_id, scope)
) WITHOUT ROWID;

-- ============================================================================
-- DOMAIN 7 — USER DATA (backup-eligible; uuid + updated_at + tombstones)
-- ============================================================================

-- 7.1 Reading position (instant resume anchor)
CREATE TABLE user_progress (
  uuid        TEXT PRIMARY KEY,                    -- singleton row, stable uuid
  page        INTEGER NOT NULL CHECK (page BETWEEN 1 AND 604),
  line_number INTEGER NOT NULL DEFAULT 1 CHECK (line_number BETWEEN 1 AND 15),
  surah       INTEGER REFERENCES surahs(number),
  ayah_number INTEGER REFERENCES ayahs(ayah_number),
  updated_at  INTEGER NOT NULL
);

-- 7.2 Bookmarks (page/line anchor + optional ayah tag)
CREATE TABLE bookmarks (
  uuid        TEXT PRIMARY KEY,
  page        INTEGER NOT NULL CHECK (page BETWEEN 1 AND 604),
  line_number INTEGER CHECK (line_number BETWEEN 1 AND 15),
  ayah_number INTEGER REFERENCES ayahs(ayah_number),
  label_ar    TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1))
);
CREATE INDEX idx_bookmarks_page ON bookmarks(page);

-- 7.3 Highlights (word-range address — stable across layout re-exports)
CREATE TABLE highlights (
  uuid        TEXT PRIMARY KEY,
  ayah_number INTEGER NOT NULL REFERENCES ayahs(ayah_number) ON DELETE CASCADE,
  word_start  INTEGER NOT NULL CHECK (word_start >= 1),
  word_end    INTEGER NOT NULL CHECK (word_end >= word_start),
  color_key   TEXT    NOT NULL DEFAULT 'gold' CHECK (color_key IN ('gold','emerald','rose','sky','none')),
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1))
);

-- 7.4 Personal reflections / notes
CREATE TABLE notes (
  uuid        TEXT PRIMARY KEY,
  ayah_number INTEGER REFERENCES ayahs(ayah_number) ON DELETE SET NULL,  -- NULL = general note
  body        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1))
);
CREATE INDEX idx_notes_ayah ON notes(ayah_number);

-- 7.5 Khatmah plans — explicit completed-page SET (never a derived counter)
CREATE TABLE khatmah_plans (
  uuid         TEXT    PRIMARY KEY,
  name_ar      TEXT    NOT NULL DEFAULT 'ختمتي',
  mode         TEXT    NOT NULL CHECK (mode IN ('deadline','rate')),
  start_date   TEXT    NOT NULL,                  -- "YYYY-MM-DD" local
  end_date     TEXT,                              -- mode='deadline'
  daily_pages  INTEGER CHECK (daily_pages BETWEEN 1 AND 604),  -- mode='rate'
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  CHECK ( (mode = 'deadline' AND end_date IS NOT NULL)
       OR (mode = 'rate'    AND daily_pages IS NOT NULL) )
);

CREATE TABLE khatmah_page_log (
  plan_uuid    TEXT    NOT NULL REFERENCES khatmah_plans(uuid) ON DELETE CASCADE,
  page         INTEGER NOT NULL CHECK (page BETWEEN 1 AND 604),
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (plan_uuid, page)
) WITHOUT ROWID;

-- 7.6 Athkar session state (per item per local day; survives crash mid-category)
CREATE TABLE adhkar_state (
  item_id      TEXT    NOT NULL REFERENCES athkar_items(item_id) ON DELETE CASCADE,
  day_key      TEXT    NOT NULL,                  -- "YYYY-MM-DD" local
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  completed_at INTEGER,                            -- epoch ms when target reached (NULL = open)
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (item_id, day_key)
) WITHOUT ROWID;

-- 7.7 Electronic Tasbih (السبحة)
CREATE TABLE tasbih_counters (
  uuid         TEXT    PRIMARY KEY,
  label_ar     TEXT    NOT NULL,
  dhikr_text   TEXT    NOT NULL,
  target       INTEGER CHECK (target BETWEEN 1 AND 100000 OR target IS NULL),
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  total_lifetime INTEGER NOT NULL DEFAULT 0 CHECK (total_lifetime >= 0),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1))
);

CREATE TABLE tasbih_sessions (
  uuid          TEXT PRIMARY KEY,
  counter_uuid  TEXT NOT NULL REFERENCES tasbih_counters(uuid) ON DELETE CASCADE,
  count_delta   INTEGER NOT NULL CHECK (count_delta > 0),
  occurred_at   INTEGER NOT NULL
);
CREATE INDEX idx_tasbih_sessions_counter ON tasbih_sessions(counter_uuid, occurred_at);

-- 7.8 Streaks — daily completions per kind; streak math lives in the engine
CREATE TABLE streak_days (
  kind      TEXT NOT NULL CHECK (kind IN ('adhkar_morning','adhkar_evening','tasbih','khatmah')),
  day_key   TEXT NOT NULL,                       -- "YYYY-MM-DD" local
  done_at   INTEGER NOT NULL,
  PRIMARY KEY (kind, day_key)
) WITHOUT ROWID;

-- 7.9 Settings (JSON values; enums mirror adhan-js Parameters field names)
CREATE TABLE user_settings (
  key        TEXT PRIMARY KEY,                   -- 'theme','font_scale','calc_method','madhab',
                                                 -- 'high_latitude_rule','reciter','locale',…
  value      TEXT NOT NULL,                      -- JSON-encoded
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- 7.10 Backup / restore audit log (not exported — device-local)
CREATE TABLE backup_log (
  id          INTEGER PRIMARY KEY,
  direction   TEXT NOT NULL CHECK (direction IN ('export','import')),
  mode        TEXT CHECK (mode IN ('merge','replace') OR mode IS NULL),
  format_version INTEGER,
  counts_json TEXT NOT NULL DEFAULT '{}',         -- {added,updated,conflicts,skipped}
  created_at  INTEGER NOT NULL
);

-- ============================================================================
-- DOMAIN 8 — SEARCH (FTS5, CONTENTLESS)
-- Texts are pre-normalized by the 5-step pipeline (docs/REA_SPEC.md §4.4) at
-- INGESTION time; the same engine normalizer runs on user queries at runtime.
-- Canonical tables (ayahs, athkar_items) are immutable at runtime, so the
-- contentless index is written once by build-db.mjs and never needs triggers.
-- rowid is the join key back to the canonical table.
-- ============================================================================

CREATE VIRTUAL TABLE fts_ayahs USING fts5(
  text_norm,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE fts_athkar USING fts5(
  text_norm,
  tokenize='unicode61 remove_diacritics 2'
);

-- City name search (names are short; ingestion inserts normalized rows).
CREATE VIRTUAL TABLE fts_cities USING fts5(
  name_norm, country_norm,
  tokenize='unicode61 remove_diacritics 2'
);

-- ============================================================================
-- VIEWS — render & sync query surfaces
-- ============================================================================

-- One query renders an entire mushaf page plate, words in RTL reading order:
CREATE VIEW v_page_words AS
SELECT w.page_number,
       w.line_number,
       w.line_position,
       w.word_id,
       w.x, w.y, w.width, w.height,
       w.text_uthmani          AS word_text,
       w.glyphs_qpc,
       w.surah,
       w.ayah_number,
       w.word_seq,
       a.number_in_surah,
       a.text_uthmani          AS ayah_text
FROM   mushaf_words w
JOIN   ayahs a ON a.ayah_number = w.ayah_number
ORDER  BY w.page_number, w.line_number, w.line_position;

-- Full ayah card (reader sheet / search result enrichment):
CREATE VIEW v_ayah_full AS
SELECT a.ayah_number, a.surah, a.number_in_surah, a.page, a.juz, a.hizb_quarter,
       a.text_uthmani, a.text_imlaei, a.sajdah,
       s.name_ar AS surah_name_ar, s.name_en AS surah_name_en,
       s.bismillah_rendered
FROM   ayahs a JOIN surahs s ON s.number = a.surah;

-- Khatmah plan progress snapshot:
CREATE VIEW v_khatmah_progress AS
SELECT p.uuid,
       COUNT(l.page)                       AS completed_pages,
       604 - COUNT(l.page)                 AS remaining_pages,
       MAX(l.completed_at)                 AS last_completed_at
FROM   khatmah_plans p
LEFT JOIN khatmah_page_log l ON l.plan_uuid = p.uuid
WHERE  p.deleted = 0 AND p.active = 1
GROUP  BY p.uuid;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
