#!/usr/bin/node
// build-db.mjs — seed/*.json + seed/mushaf-qpc1/ → packages/core-data/build/sadaqa.db
// Ingestion contract (docs/ARCHITECTURE.md §5.1/§5.2):
//   * all SQL uses prepared statements (parameter binding, never concatenation)
//   * cross-source invariants are asserted DURING build (loud failure, no silent drift)
//   * FTS tables are populated once here with normalized text (canonical tables immutable)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeArabic } from '../engines/search.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = join(HERE, '..', 'seed');
const MUSHAF = join(SEED, 'mushaf-qpc1');
const OUT = join(HERE, '..', 'build');
const DB_PATH = join(OUT, 'sadaqa.db');

const ARABIC_RE = /[\u0600-\u06FF]/;
const stripDiacriticsAscii = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fail = (msg) => { throw new Error(`BUILD INVARIANT: ${msg}`); };

// --- load seeds -------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(SEED, 'manifest.json'), 'utf8'));
const uthmani = JSON.parse(readFileSync(join(SEED, 'quran-uthmani.json'), 'utf8')).data;
const simple = JSON.parse(readFileSync(join(SEED, 'quran-simple.json'), 'utf8')).data;
const muyassar = JSON.parse(readFileSync(join(SEED, 'tafsir-ar.muyassar.json'), 'utf8')).tafsir;
const hisn = JSON.parse(readFileSync(join(SEED, 'hisn.json'), 'utf8'));
const citiesRaw = JSON.parse(readFileSync(join(SEED, 'cities.json'), 'utf8')).rows;

// cross-source shape invariants
if (uthmani.surahs?.length !== 114 || simple.surahs?.length !== 114) fail('quran editions must have 114 surahs');
const totalAyahs = uthmani.surahs.reduce((n, s) => n + s.ayahs.length, 0);
if (totalAyahs !== 6236) fail(`expected 6236 ayahs, got ${totalAyahs}`);
if (muyassar.length !== 114) fail('muyassar must have 114 surah arrays');

// --- open db ----------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
for (const f of [DB_PATH, `${DB_PATH}-journal`, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) rmSync(f, { force: true }); // clean rebuild
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('BEGIN');
db.exec(readFileSync(join(HERE, '..', 'schema.sql'), 'utf8'));

// --- mushaf pass A: bare pages first (ayahs.page has an FK to mushaf_pages) ---
const pageFiles = readdirSync(MUSHAF).filter((f) => f.endsWith('.json')).sort();
if (pageFiles.length !== 604) fail(`expected 604 mushaf page files, got ${pageFiles.length}`);
const KIND_MAP = { 'surah-header': 'surah_name', basmala: 'bismillah', text: 'text', blank: 'blank' };
const pagesData = pageFiles.map((f, i) => {
  const p = i + 1;
  const page = JSON.parse(readFileSync(join(MUSHAF, f), 'utf8'));
  if (page.page !== p) fail(`page file ${f} declares page ${page.page}`);
  // Madinah pagination is legitimately sparse (page 1 = Al-Fatiha alone, page 2
  // opens Al-Baqarah with header + basmala): entries are compact-numbered 1..≤15.
  if (page.lines.length < 1 || page.lines.length > 15) fail(`page ${p} has ${page.lines.length} line entries (allowed 1..15)`);
  let lastLine = 0;
  for (const ln of page.lines) {
    if (ln.line <= lastLine || ln.line > 15) fail(`page ${p}: line numbers not strictly increasing within 1..15 (saw ${ln.line} after ${lastLine})`);
    lastLine = ln.line;
  }
  for (const ln of page.lines) if (!KIND_MAP[ln.type]) fail(`page ${p} line ${ln.line}: unknown line type '${ln.type}'`);
  return { p, page };
});
const insBarePage = db.prepare(`INSERT INTO mushaf_pages (page_number, line_count) VALUES (?, 15)`);
for (const { p } of pagesData) insBarePage.run(p);

// Surah start pages are LAYOUT-authoritative (print convention: a surah's
// header + basmala may sit at the bottom of the page BEFORE its first ayah's
// page — the reader navigates to the header). Map surah → header page.
const headerPageBySurah = new Map();
for (const { p, page } of pagesData) {
  for (const ln of page.lines) {
    if (ln.type === 'surah-header' && ln.surah) {
      const n = Number(ln.surah);
      if (!headerPageBySurah.has(n)) headerPageBySurah.set(n, p);
    }
  }
}
if (headerPageBySurah.size !== 114) fail(`layout has ${headerPageBySurah.size} surah headers (expected 114)`);

// --- surahs + ayahs (mushaf_pages FK now satisfied) ----------------------------
const insSurah = db.prepare(`INSERT INTO surahs (number, name_ar, name_en, name_translit, revelation_type, ayah_count, start_page, bismillah_rendered, order_of_revelation)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`);
const REVELATION_MAP = { meccan: 'makkah', medinan: 'madinah' };
for (const s of uthmani.surahs) {
  const translit = stripDiacriticsAscii(s.englishName).trim();
  const startPage = headerPageBySurah.get(s.number);
  if (!startPage) fail(`no layout header for surah ${s.number}`);
  const bismillah = s.number === 1 || s.number === 9 ? 0 : 1;
  const rev = REVELATION_MAP[s.revelationType.toLowerCase()];
  if (!rev) fail(`unknown revelationType '${s.revelationType}' for surah ${s.number}`);
  insSurah.run(s.number, s.name, s.englishName, translit, rev, s.ayahs.length, startPage, bismillah);
}

const insAyah = db.prepare(`INSERT INTO ayahs (ayah_number, surah, number_in_surah, page, juz, hizb_quarter, text_uthmani, text_imlaei, sajdah)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const simpleIndex = new Map(); // "s:a" → imlaei text
for (const s of simple.surahs) for (const a of s.ayahs) simpleIndex.set(`${s.number}:${a.numberInSurah}`, a.text);

let ayahNumber = 0;
const ayahMeta = new Map(); // "s:a" → { global, page, juz, hizb }
for (const s of uthmani.surahs) {
  for (const a of s.ayahs) {
    ayahNumber++;
    const imlaei = simpleIndex.get(`${s.number}:${a.numberInSurah}`);
    if (imlaei === undefined) fail(`missing imlaei text for ${s.number}:${a.numberInSurah}`);
    if (a.page < 1 || a.page > 604) fail(`ayah ${s.number}:${a.numberInSurah} out-of-range page ${a.page}`);
    const sajdah = a.sajda === false || a.sajda == null ? 'none' : (a.sajda.recommended ? 'recommended' : 'obligatory');
    insAyah.run(ayahNumber, s.number, a.numberInSurah, a.page, a.juz, a.hizbQuarter, a.text, imlaei, sajdah);
    ayahMeta.set(`${s.number}:${a.numberInSurah}`, { global: ayahNumber, page: a.page, juz: a.juz, hizb: a.hizbQuarter });
  }
}
console.log(`ayahs inserted: ${ayahNumber}`);

// --- mushaf pass B: lines, words, page openers ---------------------------------
const updPage = db.prepare(`UPDATE mushaf_pages SET juz_start = ?, hizb_start = ?, surah_start = ?, ayah_start = ? WHERE page_number = ?`);
const insLine = db.prepare(`INSERT INTO mushaf_lines (page_number, line_number, kind, ayah_number, surah, text_ar, glyphs_qpc) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insWord = db.prepare(`INSERT INTO mushaf_words (surah, ayah_number, word_seq, page_number, line_number, line_position, x, y, width, height, text_uthmani, glyphs_qpc)
  VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`);
const insFtsAyah = db.prepare(`INSERT INTO fts_ayahs (rowid, text_norm) VALUES (?, ?)`);

let wordCount = 0;
for (const { p, page } of pagesData) {
  let surahStart = null, ayahStart = null, openerMeta = null;
  for (const ln of page.lines) {
    const kind = KIND_MAP[ln.type];
    const words = ln.words ?? [];
    let firstStartsAyah = null;
    for (let w = 0; w < words.length; w++) {
      const loc = words[w].location; // "s:a:wo"
      if (!loc) continue; // decorative bismillah words are not ayah words
      const [sStr, aStr, wStr] = loc.split(':');
      const meta = ayahMeta.get(`${Number(sStr)}:${Number(aStr)}`);
      if (!meta) fail(`page ${p} line ${ln.line} word ${loc}: unknown ayah`);
      const seq = Number(wStr);
      if (seq === 1 && firstStartsAyah === null) firstStartsAyah = meta;
      const glyphs = words[w].qpcV1;
      if (typeof glyphs !== 'string' || glyphs.length === 0) fail(`page ${p} line ${ln.line} word ${loc}: missing qpcV1 glyphs`);
      insWord.run(Number(sStr), meta.global, seq, p, ln.line, w + 1, words[w].word, glyphs);
      wordCount++;
    }
    const ayahNumCol = kind === 'text' && firstStartsAyah ? firstStartsAyah.global : null;
    const surahCol = kind === 'surah_name' ? Number(ln.surah) : null;
    insLine.run(p, ln.line, kind, ayahNumCol, surahCol, ln.text ?? null, ln.qpcV1 ?? null);
    if (firstStartsAyah && ayahStart === null) { ayahStart = firstStartsAyah.global; openerMeta = firstStartsAyah; }
    if (kind === 'surah_name' && surahStart === null) surahStart = surahCol;
  }
  updPage.run(openerMeta?.juz ?? null, openerMeta?.hizb ?? null, surahStart, ayahStart, p);
}
console.log(`mushaf words inserted: ${wordCount}`);

// cross-check: alquran page metadata must agree with the layout for every ayah start
const layoutStarts = db.prepare(`SELECT COUNT(*) AS n FROM mushaf_pages WHERE ayah_start IS NOT NULL`).get().n;
const metaStarts = new Set([...ayahMeta.values()].map((m) => m.page)).size;
if (layoutStarts !== metaStarts) fail(`layout pages with ayah starts (${layoutStarts}) != quran-metadata distinct pages (${metaStarts})`);

// --- tafsir (Muyassar, bundled) ----------------------------------------------
db.prepare(`INSERT INTO tafsir_books (book_id, name_ar, name_en, author, bundled, version) VALUES ('muyassar', 'التفسير الميسر', 'At-Tafsir Al-Muyassar', 'مجموع من علماء وجّهتهم رئاسة إدارة البحوث العلمية والإفتاء بالسعودية', 1, '1')`).run();
const insTafsir = db.prepare(`INSERT INTO tafsirs (book_id, ayah_number, body) VALUES ('muyassar', ?, ?)`);
for (let s = 0; s < 114; s++) {
  const expected = uthmani.surahs[s].ayahs.length;
  if (muyassar[s].length !== expected) fail(`muyassar surah ${s + 1}: ${muyassar[s].length} entries vs ${expected} ayahs`);
  for (let a = 0; a < expected; a++) {
    const meta = ayahMeta.get(`${s + 1}:${a + 1}`);
    insTafsir.run(meta.global, muyassar[s][a]);
  }
}

// --- athkar (Hisn al-Muslim) --------------------------------------------------
// solar windows resolved on the NORMALIZED title (dataset titles carry tashkeel)
const SOLAR_RULES = [
  [/صباح/, 'fajr'],
  [/مسا/, 'asr'], // covers المساء / المسائية spellings
  [/نوم/, 'night'],
  [/بعد السلام/, 'after_prayer'],
];
const insCat = db.prepare(`INSERT INTO athkar_categories (category_id, name_ar, name_en, icon, sort_order, solar_window) VALUES (?, ?, NULL, 'dhikr', ?, ?)`);
const insItem = db.prepare(`INSERT INTO athkar_items (item_id, category_id, sort_order, text_ar, count_target, source_ar, grade, fadl_ar, audio_key) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`);
let catIdx = 0, itemCount = 0;
for (const [title, chapter] of Object.entries(hisn)) {
  catIdx++;
  const catId = `cat-${catIdx}`;
  const norm = normalizeArabic(title);
  const solar = (SOLAR_RULES.find(([re]) => re.test(norm)) ?? [null, null])[1];
  insCat.run(catId, title, catIdx, solar);
  if (!Array.isArray(chapter.Adhkar) || chapter.Adhkar.length === 0) fail(`hisn category '${title}' has no Adhkar`);
  chapter.Adhkar.forEach((item, j) => {
    itemCount++;
    insItem.run(`${catId}-${j + 1}`, catId, j, item.Text, Number(item.Count) || 0, item.Reference ?? null);
  });
}
console.log(`athkar categories: ${catIdx}, items: ${itemCount}`);

// --- cities -------------------------------------------------------------------
const insCity = db.prepare(`INSERT INTO cities (city_id, name_ar, name_en, country_ar, country_en, lat, lng, elevation, timezone, population, is_preseed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insFtsCity = db.prepare(`INSERT INTO fts_cities (rowid, name_norm, country_norm) VALUES (?, ?, ?)`);
const PRESEED = new Set(['Makkah', 'Medina', 'Jerusalem', 'Cairo', 'Riyadh', 'Dubai', 'Kuwait City', 'London', 'Istanbul', 'Amman', 'Doha']); // GeoNames spellings
let cityCount = 0;
for (const r of citiesRaw) {
  cityCount++;
  const arabicAlt = (r.alternate_names ?? []).find((n) => ARABIC_RE.test(n));
  const country = r.cou_name_en ?? r.country_code ?? '—'; // documented fallback: code when no country name
  const rowId = insCity.run(
    r.geoname_id,
    arabicAlt ?? r.name, // documented fallback: English name when no Arabic alternate exists
    r.name,
    country,
    country,
    r.coordinates.lat, r.coordinates.lon,
    r.elevation ?? 0,
    r.timezone,
    r.population,
    PRESEED.has(r.name) ? 1 : 0,
  ).lastInsertRowid;
  insFtsCity.run(rowId, normalizeArabic(arabicAlt ?? r.name), normalizeArabic(country));
}
console.log(`cities inserted: ${cityCount}`);

// --- FTS population (normalized, contentless) ---------------------------------
const allAyahs = db.prepare(`SELECT ayah_number, text_imlaei FROM ayahs`).all();
for (const a of allAyahs) insFtsAyah.run(a.ayah_number, normalizeArabic(a.text_imlaei));
const allAthkar = db.prepare(`SELECT rowid, text_ar FROM athkar_items`).all();
const insFtsAthkar = db.prepare(`INSERT INTO fts_athkar (rowid, text_norm) VALUES (?, ?)`);
for (const a of allAthkar) insFtsAthkar.run(a.rowid, normalizeArabic(a.text_ar));
console.log(`fts populated: ${allAyahs.length} ayahs, ${allAthkar.length} athkar`);

// --- meta ----------------------------------------------------------------------
const seedDigest = sha256(JSON.stringify(manifest.artifacts.map((a) => `${a.name}:${a.sha256}`)));
const metaRows = [
  ['schema_version', '1'],
  ['format', 'sadaqa-db-v1'],
  ['created_at', String(Date.now())],
  ['seeds_digest', seedDigest],
  ['dataset.quran', 'alquran.cloud quran-uthmani + quran-simple (Tanzil), fetched ' + manifest.generatedAt],
  ['dataset.mushaf_layout', 'zonetecde/mushaf-layout@v2 mushaf/QPC1 (604 pages, order-based, QPC HAFS glyphs)'],
  ['dataset.tafsir_muyassar', 'SAFI174/tafsir-json ar.muyassar (bundled)'],
  ['dataset.hisn', 'asellam/HisnElMuslim@main (Arabic-only titles)'],
  ['dataset.cities', 'opendatasoft geonames-all-cities-with-a-population-1000, population>=100000'],
  ['layout.geometry', 'order-based (x/y/width/height NULL)'],
];
const insMeta = db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
for (const [k, v] of metaRows) insMeta.run(k, v);
// drop schema.sql's placeholder sha256 row (the digest is recorded as seeds_digest)
db.prepare(`DELETE FROM meta WHERE key = 'sha256'`).run();

db.exec('COMMIT');
db.close();
console.log(`OK → ${DB_PATH}`);
