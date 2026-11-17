#!/usr/bin/node
// verify-db.mjs — post-build invariant gate for sadaqa.db
// Exits non-zero on ANY failure. Prints a compact report of every checked domain.
import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeArabic, ftsQuery } from '../engines/search.js';

const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'sadaqa.db');
const db = new DatabaseSync(DB_PATH, { readOnly: true });

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

console.log('=== sadaqa.db verification ===');
console.log(`file: ${DB_PATH}`);
const sizeMB = statSync(DB_PATH).size / 1024 / 1024;
check('integrity_check', one(`PRAGMA integrity_check`).integrity_check === 'ok');
check('foreign_key_check', all(`PRAGMA foreign_key_check`).length === 0, 'no FK violations');

// --- meta -------------------------------------------------------------------
const meta = Object.fromEntries(all(`SELECT key, value FROM meta`).map((r) => [r.key, r.value]));
check('meta schema_version=1', meta.schema_version === '1');
check('meta format', meta.format === 'sadaqa-db-v1');
check('meta created_at + seeds_digest present', Boolean(meta.created_at && meta.seeds_digest));
check('meta dataset provenance (5 datasets)', ['dataset.quran', 'dataset.mushaf_layout', 'dataset.tafsir_muyassar', 'dataset.hisn', 'dataset.cities'].every((k) => k in meta));

// --- quran corpus --------------------------------------------------------------
const q = one(`SELECT
  (SELECT COUNT(*) FROM surahs) s,
  (SELECT COUNT(*) FROM ayahs) a,
  (SELECT COUNT(*) FROM mushaf_pages) p,
  MIN(ayah_number) mn, MAX(ayah_number) mx
FROM ayahs`);
check('surahs = 114', q.s === 114, `${q.s}`);
check('ayahs = 6,236 contiguous', q.a === 6236 && q.mn === 1 && q.mx === 6236, `${q.a} [${q.mn}..${q.mx}]`);
const ayahGaps = one(`SELECT COUNT(*) n FROM ayahs WHERE text_uthmani = '' OR text_imlaei = '' OR page IS NULL OR juz IS NULL OR hizb_quarter IS NULL`).n;
check('no empty ayah texts / null metadata', ayahGaps === 0, `${ayahGaps} bad rows`);
const juz = all(`SELECT DISTINCT juz FROM ayahs ORDER BY juz`).map((r) => r.juz);
check('all 30 ajza present', juz.length === 30 && juz[0] === 1 && juz[29] === 30, `${juz.length} distinct`);
const hizb = one(`SELECT COUNT(DISTINCT hizb_quarter) n FROM ayahs`).n;
check('hizb quarters span 240', hizb === 240, `${hizb} distinct`);
const sajdah = all(`SELECT sajdah, COUNT(*) n FROM ayahs GROUP BY sajdah`);
const sajdahCount = sajdah.filter((r) => r.sajdah !== 'none').reduce((n, r) => n + r.n, 0);
check('sajdah markers present (Hafs: 15)', sajdahCount === 15, JSON.stringify(sajdah.filter((r) => r.sajdah !== 'none')));
const bis = one(`SELECT (SELECT bismillah_rendered FROM surahs WHERE number=1) a, (SELECT bismillah_rendered FROM surahs WHERE number=9) b, (SELECT bismillah_rendered FROM surahs WHERE number=2) c`);
check('bismillah flags (1,9 → 0; others → 1)', bis.a === 0 && bis.b === 0 && bis.c === 1);
check('surah name_translit ASCII (search slug)', all(`SELECT name_translit FROM surahs WHERE name_translit GLOB '*[^ -~]*'`).length === 0);

// --- mushaf geometry --------------------------------------------------------------
const m = one(`SELECT (SELECT COUNT(*) FROM mushaf_pages) p, (SELECT COUNT(*) FROM mushaf_lines) l, (SELECT COUNT(*) FROM mushaf_words) w`);
check('pages = 604', m.p === 604, `${m.p}`);
check('line rows within slot budget (604×15)', m.l > 0 && m.l <= 604 * 15, `${m.l} rows`);
check('words = 77,995', m.w === 77995, `${m.w}`);
const lineKinds = one(`SELECT (SELECT COUNT(*) FROM mushaf_lines WHERE line_number NOT BETWEEN 1 AND 15) bad`);
check('line numbers within 1..15', lineKinds.bad === 0);
const orphanLines = one(`SELECT (SELECT COUNT(*) FROM mushaf_lines WHERE kind='text' AND ayah_number IS NULL AND line_number=1) firstLineNulls`).firstLineNulls;
check('text lines with NULL ayah are continuations (never line 1 of a page)', orphanLines === 0);
const wordGaps = all(`SELECT ayah_number, COUNT(*) c, MAX(word_seq) mx FROM mushaf_words GROUP BY ayah_number HAVING c <> mx LIMIT 1`);
check('word_seq contiguous per ayah (1..N, no gaps)', wordGaps.length === 0, wordGaps[0] ? `ayah ${wordGaps[0].ayah_number}` : '');
const emptyGlyphs = one(`SELECT COUNT(*) n FROM mushaf_words WHERE glyphs_qpc IS NULL OR glyphs_qpc = ''`).n;
check('glyphs_qpc present on every word (QPC1 parity)', emptyGlyphs === 0, `${emptyGlyphs} empty`);
const glyphSample = one(`SELECT glyphs_qpc FROM mushaf_words WHERE surah = 1 AND ayah_number = 1 AND word_seq = 1`).glyphs_qpc;
check('ayah 1:1 word-1 glyph = U+FAD1-range PUA (QPC1)', glyphSample.codePointAt(0) >= 0xFB50, `U+${glyphSample.codePointAt(0).toString(16).toUpperCase()}`);
const firstWordPageMismatch = one(`SELECT COUNT(*) n FROM mushaf_words w JOIN ayahs a ON a.ayah_number = w.ayah_number
  WHERE w.word_seq = 1 AND w.page_number <> a.page`).n;
check('first word page = ayah metadata page (layout ↔ edition agreement)', firstWordPageMismatch === 0, `${firstWordPageMismatch} mismatches`);
const juzStarts = one(`SELECT COUNT(DISTINCT juz_start) n FROM mushaf_pages WHERE juz_start IS NOT NULL`).n;
check('juz markers on 30 distinct pages', juzStarts === 30, `${juzStarts}`);
const p1 = one(`SELECT juz_start, ayah_start FROM mushaf_pages WHERE page_number = 1`);
check('page 1 opens juz 1 with ayah 1', p1.juz_start === 1 && p1.ayah_start === 1);
const headerLines = one(`SELECT COUNT(*) n FROM mushaf_lines WHERE kind = 'surah_name'`).n;
check('surah-header lines = 114 (surahs may share a page)', headerLines === 114, `${headerLines} headers on ${one(`SELECT COUNT(DISTINCT page_number) n FROM mushaf_lines WHERE kind='surah_name'`).n} pages`);
const surahStartAgree = one(`SELECT COUNT(*) n FROM surahs s
  WHERE (SELECT page_number FROM mushaf_lines WHERE kind = 'surah_name' AND surah = s.number) <> s.start_page`).n;
check('surahs.start_page = layout header page (navigation target)', surahStartAgree === 0, `${surahStartAgree} mismatches`);
// print convention: header page is the first-ayah page or one before it
const startPageDrift = one(`SELECT COUNT(*) n FROM surahs s
  JOIN ayahs a ON a.surah = s.number AND a.number_in_surah = 1
  WHERE s.start_page <> a.page AND s.start_page <> a.page - 1`).n;
check('start_page within the documented print convention (ay1 page or −1)', startPageDrift === 0, `${startPageDrift} outliers`);
const render = all(`SELECT word_text, number_in_surah FROM v_page_words WHERE page_number = 1 AND line_number = 2 ORDER BY line_position`);
check('v_page_words renders page 1 line 2 (basmala of Fatiha)', render.length === 4 && render[0].word_text.includes('بِسْمِ'), JSON.stringify(render.map((r) => r.word_text).slice(0, 2)));

// --- tafsir ----------------------------------------------------------------------
const t = one(`SELECT (SELECT COUNT(*) FROM tafsir_books WHERE bundled=1) books, (SELECT COUNT(*) FROM tafsirs) rows`);
check('muyassar bundled, 6,236 entries', t.books === 1 && t.rows === 6236, `${t.rows}`);
const tafSample = one(`SELECT body FROM tafsirs WHERE ayah_number = 1`);
check('tafsir body non-empty (ayah 1)', typeof tafSample.body === 'string' && tafSample.body.length > 20);

// --- athkar ----------------------------------------------------------------------
const ak = one(`SELECT (SELECT COUNT(*) FROM athkar_categories) c, (SELECT COUNT(*) FROM athkar_items) i`);
check('athkar categories ≥ 100', ak.c >= 100, `${ak.c}`);
check('athkar items ≥ 250', ak.i >= 250, `${ak.i}`);
const emptyAthkar = one(`SELECT COUNT(*) n FROM athkar_items WHERE TRIM(text_ar) = '' OR count_target < 0`).n;
check('athkar items non-empty with sane targets', emptyAthkar === 0);
const solarMapped = all(`SELECT name_ar, solar_window FROM athkar_categories WHERE solar_window IS NOT NULL`);
check('solar windows mapped (Smart Card seeds)', solarMapped.length >= 2, solarMapped.map((r) => `${r.solar_window}←${r.name_ar.slice(0, 18)}`).join(' | '));

// --- cities ----------------------------------------------------------------------
const cc = one(`SELECT COUNT(*) n FROM cities`).n;
check('offline cities ≥ 3000 (population ≥ 100k)', cc >= 3000, `${cc}`);
const badCity = one(`SELECT COUNT(*) n FROM cities WHERE lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 OR timezone = ''`).n;
check('city coordinates/timezone sane', badCity === 0, `${badCity} bad`);
const arCoverage = one(`SELECT ROUND(100.0 * SUM(name_ar <> name_en) / COUNT(*), 1) pct FROM cities`).pct;
check('Arabic name coverage (alternate_names heuristic)', arCoverage > 50, `${arCoverage}% distinct from English`);
const mecca = one(`SELECT name_en, lat, lng, is_preseed FROM cities WHERE is_preseed = 1 AND name_en = 'Makkah'`);
check('Makkah preseeded with correct coordinates', mecca && Math.abs(mecca.lat - 21.42) < 0.2 && Math.abs(mecca.lng - 39.83) < 0.2, mecca ? `${mecca.lat},${mecca.lng}` : 'missing');
check('fts_cities populated', one(`SELECT COUNT(*) n FROM fts_cities`).n === cc);
const cityHit = all(`SELECT rowid FROM fts_cities WHERE fts_cities MATCH ? LIMIT 3`, ftsQuery('مكة') ?? '"مكه"');
check('city FTS finds Makkah (normalized)', cityHit.length >= 1, `${cityHit.length} hits`);

// --- FTS5 search -------------------------------------------------------------------
check('fts_ayahs rowid coverage = 6,236', one(`SELECT COUNT(*) n FROM fts_ayahs`).n === 6236);
check('fts_athkar coverage', one(`SELECT COUNT(*) n FROM fts_athkar`).n === ak.i);
const q1 = ftsQuery('ٱلرَّحْمَـٰنِ'); // fully vocalized + wasla input
const r1 = all(`SELECT rowid AS ayah_number FROM fts_ayahs WHERE fts_ayahs MATCH ? LIMIT 5`, q1);
check('diacritic-insensitive ayah search (vocalized input)', r1.length >= 1, `query ${q1} → ${r1.length}+ rows`);
const r2 = all(`SELECT f.rowid AS ayah_number, a.surah, a.number_in_surah FROM (SELECT rowid FROM fts_ayahs WHERE fts_ayahs MATCH ? ORDER BY rowid LIMIT 10) f
  JOIN ayahs a ON a.ayah_number = f.rowid`, '"الرحمن" "الرحيم"*');
check('multi-term search (الرحمن الرحيم) opens with Fatiha 1:1-1:3', r2.length >= 3 && r2[0].surah === 1 && r2[0].number_in_surah === 1, `${r2.length} rows, first = ${r2[0]?.surah}:${r2[0]?.number_in_surah}`);
const r3 = one(`SELECT COUNT(*) n FROM fts_ayahs WHERE fts_ayahs MATCH ?`, '"xzqxjq"');
check('garbage query returns 0', r3.n === 0);
const athkarHit = all(`SELECT rowid FROM fts_athkar WHERE fts_athkar MATCH ? LIMIT 3`, ftsQuery('سبحان الله'));
check('athkar FTS finds سبحان الله', athkarHit.length >= 1, `${athkarHit.length} hits`);
const surahNames = all(`SELECT number, name_ar, name_translit FROM surahs`);
const arabicHit = surahNames.filter((s) => normalizeArabic(s.name_ar).includes(normalizeArabic('الفاتحة')));
const translitHit = surahNames.filter((s) => s.name_translit.toLowerCase().startsWith('al-fat'));
check('surah-name search (normalized Arabic + translit prefix)', arabicHit.length >= 1 && arabicHit[0].number === 1 && translitHit.length >= 1, `arabic → ${arabicHit.map((s) => s.number).join(',')} · translit → ${translitHit.map((s) => s.number).join(',')}`);

// --- views / user tables smoke -----------------------------------------------------
check('v_ayah_full joins surah names', normalizeArabic(one(`SELECT surah_name_ar FROM v_ayah_full WHERE ayah_number = 1`).surah_name_ar ?? '').includes(normalizeArabic('الفاتحة')));
check('v_khatmah_progress queryable (empty)', all(`SELECT * FROM v_khatmah_progress`).length === 0);
const userTables = ['user_progress', 'bookmarks', 'highlights', 'notes', 'khatmah_plans', 'khatmah_page_log', 'adhkar_state', 'tasbih_counters', 'tasbih_sessions', 'streak_days', 'user_settings', 'backup_log', 'audio_packs_state'];
check('user tables present & empty at seed', userTables.every((t) => one(`SELECT COUNT(*) n FROM ${t}`).n === 0), `${userTables.length} tables`);
check('reciters catalog present (empty until pack manifests land)', one(`SELECT COUNT(*) n FROM reciters`).n === 0);

// --- bundle budget ------------------------------------------------------------------
check('core db size ≤ 45 MB (ARCHITECTURE §5.4 budget)', sizeMB <= 45, `${sizeMB.toFixed(1)} MB`);
const pageCount = one(`PRAGMA page_count`).page_count;
console.log(`\nfile size: ${sizeMB.toFixed(1)} MB · ${pageCount} pages · words ${m.w} · cities ${cc} · athkar ${ak.c}/${ak.i}`);

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
