#!/usr/bin/env node
// ============================================================================
// gen-parity-fixtures.mjs — Phase 5 parity fixtures (single source of truth)
// ---------------------------------------------------------------------------
// Generates the cross-target verification corpus that the iOS (XCTest) and
// Android (JUnit) suites replay against their native ports. Every expected
// value here is produced by EXECUTING the real web engines (the golden
// reference) — nothing is hand-typed:
//
//   fixtures/prayer/<city>_<month>_<variant>.json   prayer month grids + next()
//                                                   probes + sunnah windows
//   fixtures/smart-card/cases.json                  §9 resolver instant matrix
//   fixtures/backup/validate-cases.json             validator verdict table
//   fixtures/backup/merge-cases.json                merge algorithm table
//   fixtures/backup/sample-export.json              real `.sadaqa` export
//                                                   (payloadJson bytes + sha)
//   fixtures/hijri/{roundtrip,events}.json          umalqura vectors
//   fixtures/qibla/bearings.json                    great-circle vectors
//   fixtures/schema/tableinfo.json                  PRAGMA table_info of every
//                                                   table built from schema.sql
//                                                   (native DDL/entity parity gate)
//
// Locally: `npm run parity:gen` (node ≥22). CI regenerates and diff-checks
// against the committed fixtures so engines and fixtures can never drift.
// ============================================================================

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { daySchedule, sunnahWindows, next, wallClockToInstant } from '../../packages/core-data/engines/prayer.js';
import { toHijri, fromHijri, monthNameAr, withAdjust, events, whiteDays } from '../../packages/core-data/engines/hijri.js';
import { qiblaBearing, distanceKm } from '../../packages/core-data/engines/qibla.js';
import { resolveSmartCard } from '../../packages/core-data/engines/smart-card.js';
import { validateBackup } from '../../packages/core-data/engines/backup-validate.js';
import { mergePayload } from '../../packages/core-data/engines/backup-merge.js';
import { buildExportPayload } from '../../apps/web-desktop/js/data/backup.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'tests', 'parity', 'fixtures');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------------------
// fixture inputs
// ---------------------------------------------------------------------------

const CITIES = {
  makkah: { lat: 21.4225, lng: 39.8262, timeZone: 'Asia/Riyadh' },
  london: { lat: 51.5074, lng: -0.1278, timeZone: 'Europe/London' },
  anchorage: { lat: 61.2181, lng: -149.9003, timeZone: 'America/Anchorage' },
  auckland: { lat: -36.8485, lng: 174.7633, timeZone: 'Pacific/Auckland' },
  losangeles: { lat: 34.0522, lng: -118.2437, timeZone: 'America/Los_Angeles' },
  tokyo: { lat: 35.6762, lng: 139.6503, timeZone: 'Asia/Tokyo' },
};

// Two variants per city: the app default and a contrasting method/madhab/HLR
// combination, so the METHOD_MAP/MADHAB/HLR mappings are all exercised.
const VARIANTS = {
  default: { method: 'umm_al_qura', madhab: 'shafi', highLatitudeRule: 'middle_of_the_night' },
  contrast: { method: 'muslim_world_league', madhab: 'hanafi', highLatitudeRule: 'seventh_of_the_night' },
};

const MONTHS = ['2026-03', '2026-10']; // DST-transition months for London/Anchorage/LA/Auckland

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Deterministic wall-clock instant in a city: day-of-month + hh:mm → epoch ms. */
function cityInstant(city, y, mo, d, hh, mi) {
  return wallClockToInstant({ y, mo: mo - 1, d, h: hh, mi, s: 0 }, city.timeZone);
}

function writeJson(rel, obj) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 1) + '\n');
  return p;
}

const written = [];
let smartCardCount = 0;

// ---------------------------------------------------------------------------
// 1. prayer month grids + next() probes
// ---------------------------------------------------------------------------

for (const [cityKey, city] of Object.entries(CITIES)) {
  for (const month of MONTHS) {
    const [y, mo] = month.split('-').map(Number);
    for (const [variantKey, cfg] of Object.entries(VARIANTS)) {
      const opts = { ...city, ...cfg };
      const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const days = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateIso = `${month}-${String(d).padStart(2, '0')}`;
        const sched = daySchedule(dateIso, opts);
        const sun = sunnahWindows(dateIso, opts);
        days.push({
          date: dateIso,
          prayers: sched.prayers,
          previousIsha: sched.previousIsha,
          sunnah: { duha: sun.duha, duhaEnd: sun.duhaEnd, midnight: sun.midnight, lastThird: sun.lastThird },
        });
      }
      // next() probes: three deterministic wall-clock instants per month
      const nextProbes = [];
      for (const [d, hh, mi] of [[5, 2, 7], [10, 12, 41], [20, 22, 19]]) {
        const now = cityInstant(city, y, mo, d, hh, mi);
        nextProbes.push({ now, cityTime: `${month}-${String(d).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, expected: next(now, opts) });
      }
      const file = `prayer/${cityKey}_${month}_${variantKey}.json`;
      writeJson(file, {
        meta: { city: cityKey, ...city, ...cfg, engine: 'adhan@4.4.6 (web golden reference)' },
        days,
        nextProbes,
      });
      written.push(file);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. smart-card instant matrix (§9) — instants built from the engine's own
//    schedule so the probes are stable across engine updates.
// ---------------------------------------------------------------------------

{
  const cases = [];
  const isoOf = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(ms);
  const dowOf = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(ms);

  // Find the first Friday of 2026-11 in each city (for the kahf window) and
  // derive the contextual instants from that day's schedule. Rules 4/5/6 use
  // the FOLLOWING Sunday — on Friday the kahf window (rule 1) legitimately
  // masks every pre-Jumu'ah window, so Friday-only instants would never cover
  // morning/next-prayer kinds.
  for (const [cityKey, city] of Object.entries(CITIES)) {
    const opts = { ...city, ...VARIANTS.default };
    let friday = null;
    for (let d = 1; d <= 7; d++) {
      const probe = cityInstant(city, 2026, 11, d, 12, 0);
      if (dowOf(probe, city.timeZone) === 'Fri') { friday = d; break; }
    }
    const friIso = `2026-11-${String(friday).padStart(2, '0')}`;
    const sched = daySchedule(friIso, opts);
    const wsNight = sunnahWindows(`2026-11-${String(friday - 1 || 30).padStart(2, '0')}`, opts); // night before Friday
    const sun = friday + 2 <= 30 ? friday + 2 : friday - 5; // first Sunday of Nov
    const sunIso = `2026-11-${String(sun).padStart(2, '0')}`;
    const sunSched = daySchedule(sunIso, opts);
    const sunWs = sunnahWindows(sunIso, opts);

    const add = (name, now, note) => cases.push({ name: `${cityKey}:${name}`, now, note, expectedKind: resolveSmartCard(now, { opts, daySchedule: (i) => daySchedule(i, opts), sunnahWindows: (i) => sunnahWindows(i, opts), next: (t) => next(t, opts) }).kind });

    // 1 — Friday Fajr→Jumu'ah window: fajr+30min must resolve kahf (beats the
    // post-prayer window? fajr+30 is >20min after fajr so post-prayer does NOT
    // match → kahf per rule 1)
    add('friday-fajr+30', sched.prayers.fajr + 30 * 60_000, 'rule 1 kahf');
    // 2a — within 20 min after fajr on that Friday → post-prayer outranks kahf window (§9 order)
    add('friday-fajr+15', sched.prayers.fajr + 15 * 60_000, 'rule 2 beats rule 1');
    // 2b — dhuhr+10min → after_prayer
    add('friday-dhuhr+10', sched.prayers.dhuhr + 10 * 60_000, 'rule 2');
    // 3 — last third of the night preceding Friday
    add('last-third', wsNight.lastThird + 5 * 60_000, 'rule 3');
    // 4 — Sunday morning window: fajr+45 (past the 20-min post-prayer window, before duha)
    add('morning', sunSched.prayers.fajr + 45 * 60_000, 'rule 4 (Sunday)');
    // 5 — evening window: asr+30 (Sunday)
    add('evening', sunSched.prayers.asr + 30 * 60_000, 'rule 5 (Sunday)');
    // 6 — mid-morning outside all windows → next prayer (Sunday)
    const mid = Math.floor((sunWs.duha + sunSched.prayers.asr) / 2);
    add('next-prayer', mid, 'rule 6 (Sunday)');
  }
  written.push('smart-card/cases.json');
  smartCardCount = cases.length;
  writeJson('smart-card/cases.json', { meta: { resolver: 'packages/core-data/engines/smart-card.js (§9)' }, cases });
}

// ---------------------------------------------------------------------------
// 3. .sadaqa validator verdict table
// ---------------------------------------------------------------------------

{
  const ent = (over) => ({ uuid: '018f3f2e-7abc-7def-8abc-000000000001', type: 'bookmark', updatedAt: 1764300000000, deleted: false, page: 3, ...over });
  const manifest = (over = {}) => ({ format: 'sadaqa-backup', formatVersion: 1, createdAt: 1764300000000, deviceId: 'device-fixture-0001', entities: {}, integrity: 'a'.repeat(64), ...over });
  const payloadOf = (...entities) => ({
    reading: entities.filter((e) => ['khatmahPlan', 'bookmark', 'highlight', 'note'].includes(e.type)),
    dhikr: entities.filter((e) => ['adhkarState', 'tasbihCounter', 'tasbihSession'].includes(e.type)),
    prefs: entities.filter((e) => e.type === 'setting'),
    meta: entities.filter((e) => e.type === 'streakDay'),
  });

  const cases = [
    { name: 'valid-full-payload', manifest: manifest(), payload: payloadOf(
      ent({}), ent({ uuid: '018f3f2e-7abc-7def-9abc-000000000002', type: 'highlight', ayahNumber: 7, wordStart: 1, wordEnd: 3, colorKey: 'emerald' }),
      ent({ uuid: '018f3f2e-7abc-7def-8abc-000000000003', type: 'note', ayahNumber: null, body: 'ملاحظة' }),
      ent({ uuid: '018f3f2e-7abc-7def-9abc-000000000004', type: 'khatmahPlan', mode: 'rate', startDate: '2026-01-01', dailyPages: 5 }),
      ent({ uuid: '018f3f2e-7abc-7def-8abc-000000000005', type: 'adhkarState', dayKey: '2026-11-17', count: 3, itemId: 'item-1' }),
      ent({ uuid: '018f3f2e-7abc-7def-9abc-000000000006', type: 'tasbihCounter', dhikrText: 'سبحان الله', target: 33, count: 12, labelAr: 'ورد', totalLifetime: 99, sortOrder: 0 }),
      ent({ uuid: '018f3f2e-7abc-7def-8abc-000000000007', type: 'tasbihSession', counterUuid: '018f3f2e-7abc-7def-9abc-000000000006', countDelta: 1, occurredAt: 1764300001000 }),
      ent({ uuid: '018f3f2e-7abc-7def-9abc-000000000008', type: 'setting', key: 'theme', value: 'dark' }),
      ent({ uuid: '018f3f2e-7abc-7def-8abc-000000000009', type: 'streakDay', kind: 'tasbih', dayKey: '2026-11-17' }),
    ) },
    { name: 'refuse-wrong-format', manifest: manifest({ format: 'json' }), payload: payloadOf(ent({})) },
    { name: 'refuse-newer-version', manifest: manifest({ formatVersion: 2 }), payload: payloadOf(ent({})) },
    { name: 'refuse-version-zero', manifest: manifest({ formatVersion: 0 }), payload: payloadOf(ent({})) },
    { name: 'refuse-float-version', manifest: manifest({ formatVersion: 1.5 }), payload: payloadOf(ent({})) },
    { name: 'refuse-bad-createdat', manifest: manifest({ createdAt: -1 }), payload: payloadOf(ent({})) },
    { name: 'refuse-short-deviceid', manifest: manifest({ deviceId: 'dev' }), payload: payloadOf(ent({})) },
    { name: 'refuse-short-integrity', manifest: manifest({ integrity: 'abc' }), payload: payloadOf(ent({})) },
    { name: 'refuse-v4-uuid', manifest: manifest(), payload: payloadOf(ent({ uuid: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' })) },
    { name: 'refuse-unknown-type', manifest: manifest(), payload: payloadOf(ent({ type: 'widget' })) },
    { name: 'refuse-type-in-wrong-group', manifest: manifest(), payload: { reading: [ent({ type: 'tasbihCounter', dhikrText: 'x' })], dhikr: [], prefs: [], meta: [] } },
    { name: 'refuse-bad-updatedat', manifest: manifest(), payload: payloadOf(ent({ updatedAt: 0 })) },
    { name: 'refuse-tombstone-nonbool', manifest: manifest(), payload: payloadOf(ent({ deleted: 'yes' })) },
    { name: 'refuse-page-zero', manifest: manifest(), payload: payloadOf(ent({ page: 0 })) },
    { name: 'refuse-page-605', manifest: manifest(), payload: payloadOf(ent({ page: 605 })) },
    { name: 'refuse-highlight-range', manifest: manifest(), payload: payloadOf(ent({ type: 'highlight', ayahNumber: 1, wordStart: 4, wordEnd: 2, colorKey: 'gold' })) },
    { name: 'refuse-highlight-color', manifest: manifest(), payload: payloadOf(ent({ type: 'highlight', ayahNumber: 1, wordStart: 1, wordEnd: 1, colorKey: 'purple' })) },
    { name: 'refuse-khatmah-mode', manifest: manifest(), payload: payloadOf(ent({ type: 'khatmahPlan', mode: 'both', startDate: '2026-01-01', dailyPages: 5 })) },
    { name: 'refuse-khatmah-deadline-missing-end', manifest: manifest(), payload: payloadOf(ent({ type: 'khatmahPlan', mode: 'deadline', startDate: '2026-01-01' })) },
    { name: 'refuse-counter-no-text', manifest: manifest(), payload: payloadOf(ent({ type: 'tasbihCounter', dhikrText: '' })) },
    { name: 'refuse-counter-bad-target', manifest: manifest(), payload: payloadOf(ent({ type: 'tasbihCounter', dhikrText: 'سبحان الله', target: 0 })) },
    { name: 'refuse-setting-no-value', manifest: manifest(), payload: payloadOf(ent({ type: 'setting', key: 'theme' })) },
    { name: 'refuse-setting-no-key', manifest: manifest(), payload: payloadOf(ent({ type: 'setting', value: 'dark' })) },
    { name: 'refuse-streak-kind', manifest: manifest(), payload: payloadOf(ent({ type: 'streakDay', kind: 'qiyam', dayKey: '2026-11-17' })) },
    { name: 'refuse-adhkar-daykey', manifest: manifest(), payload: payloadOf(ent({ type: 'adhkarState', dayKey: '20261117', count: 0, itemId: 'i' })) },
    { name: 'refuse-session-delta', manifest: manifest(), payload: payloadOf(ent({ type: 'tasbihSession', counterUuid: '018f3f2e-7abc-7def-8abc-000000000001', countDelta: 0, occurredAt: 1764300001000 })) },
    { name: 'refuse-unknown-group', manifest: manifest(), payload: { reading: [], dhikr: [], prefs: [], meta: [], extra: [] } },
    { name: 'accept-tombstoned-entity', manifest: manifest(), payload: payloadOf(ent({ deleted: true })) },
    { name: 'accept-note-null-ayah', manifest: manifest(), payload: payloadOf(ent({ type: 'note', ayahNumber: null, body: '' })) },
  ];

  const recorded = cases.map((c) => {
    const verdict = validateBackup(c.manifest, c.payload);
    return { name: c.name, manifest: c.manifest, payload: c.payload, expectOk: verdict.ok, expectErrorCount: verdict.ok ? 0 : verdict.errors.length };
  });
  written.push('backup/validate-cases.json');
  writeJson('backup/validate-cases.json', { meta: { validator: 'backup-validate.js formatVersion 1 (assert ok + error COUNT; message text is per-locale/native)' }, cases: recorded });
}

// ---------------------------------------------------------------------------
// 4. .sadaqa merge algorithm table
// ---------------------------------------------------------------------------

{
  const E = (uuid, updatedAt, over = {}) => ({ uuid, updatedAt, ...over });
  const bm = (uuid, updatedAt, over = {}) => E(uuid, updatedAt, { type: 'bookmark', page: 3, deleted: false, ...over });
  const U1 = '018f3f2e-7abc-7def-8abc-000000000001';
  const U2 = '018f3f2e-7abc-7def-8abc-000000000002';
  const U3 = '018f3f2e-7abc-7def-8abc-000000000003';
  const NOW = 1764300900000;

  const cases = [
    { name: 'merge-adds-new', mode: 'merge', now: NOW, local: { reading: [bm(U1, 100)] }, payload: { reading: [bm(U2, 200)] } },
    { name: 'merge-skips-identical', mode: 'merge', now: NOW, local: { reading: [bm(U1, 100)] }, payload: { reading: [bm(U1, 100)] } },
    { name: 'merge-keyorder-identical', mode: 'merge', now: NOW, local: { reading: [{ uuid: U1, type: 'bookmark', updatedAt: 100, deleted: false, page: 3 }] }, payload: { reading: [{ page: 3, deleted: false, updatedAt: 100, type: 'bookmark', uuid: U1 }] } },
    { name: 'merge-incoming-newer-applies', mode: 'merge', now: NOW, local: { reading: [bm(U1, 100, { page: 3 })] }, payload: { reading: [bm(U1, 200, { page: 7 })] } },
    { name: 'merge-local-newer-conflict', mode: 'merge', now: NOW, local: { reading: [bm(U1, 300)] }, payload: { reading: [bm(U1, 200)] } },
    { name: 'merge-tombstone-wins', mode: 'merge', now: NOW, local: { reading: [bm(U1, 300, { deleted: true })] }, payload: { reading: [bm(U1, 200)] } },
    { name: 'merge-resurrection', mode: 'merge', now: NOW, local: { reading: [bm(U1, 100, { deleted: true })] }, payload: { reading: [bm(U1, 200, { deleted: false })] } },
    { name: 'merge-same-time-conflict', mode: 'merge', now: NOW, local: { reading: [bm(U1, 200, { page: 5 })] }, payload: { reading: [bm(U1, 200, { page: 9 })] } },
    { name: 'merge-group-absent', mode: 'merge', now: NOW, local: {}, payload: { meta: [E(U3, 50, { type: 'streakDay', kind: 'tasbih', dayKey: '2026-11-16' })] } },
    { name: 'merge-empty-payload', mode: 'merge', now: NOW, local: { reading: [bm(U1, 100)] }, payload: {} },
    { name: 'replace-inserts-all', mode: 'replace', now: NOW, local: { reading: [bm(U1, 100)] }, payload: { reading: [bm(U2, 200), bm(U3, 300)] } },
    { name: 'replace-ignores-local', mode: 'replace', now: NOW, local: { dhikr: [bm(U1, 100, { type: 'tasbihCounter', dhikrText: 'x' })] }, payload: { reading: [bm(U2, 200)] } },
    { name: 'merge-multi-group', mode: 'merge', now: NOW, local: { reading: [bm(U1, 100)], prefs: [E('018f3f2e-7abc-7def-8abc-000000000010', 10, { type: 'setting', key: 'theme', value: 'dark' })] }, payload: { reading: [bm(U1, 200, { page: 12 })], prefs: [E('018f3f2e-7abc-7def-8abc-000000000011', 20, { type: 'setting', key: 'font_scale', value: 1.5 })] } },
    { name: 'merge-incoming-older-than-tombstone', mode: 'merge', now: NOW, local: { reading: [bm(U1, 500, { deleted: true })] }, payload: { reading: [bm(U1, 400)] } },
    { name: 'merge-tombstone-both-same-time', mode: 'merge', now: NOW, local: { reading: [bm(U1, 300, { deleted: true })] }, payload: { reading: [bm(U1, 300, { deleted: true })] } },
  ];

  const recorded = cases.map((c) => {
    const toMap = (groups) => Object.fromEntries(Object.entries(groups ?? {}).map(([g, arr]) => [g, new Map(arr.map((e) => [e.uuid, e]))]));
    const { report, mutations } = mergePayload(toMap(c.local), c.payload, { mode: c.mode, now: c.now });
    return { name: c.name, mode: c.mode, now: c.now, local: c.local, payload: c.payload, expected: { report, mutations: mutations.map(({ group, uuid, entity, action }) => ({ group, uuid, entity, action })) } };
  });
  written.push('backup/merge-cases.json');
  writeJson('backup/merge-cases.json', { meta: { merger: 'backup-merge.js §8.3' }, cases: recorded });
}

// ---------------------------------------------------------------------------
// 5. real `.sadaqa` export (payload bytes + integrity) through the WEB pipeline
// ---------------------------------------------------------------------------

{
  const T = 1764300000000; // 2026-11-17T00:00:00Z-ish fixed clock
  const v4 = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'; // legacy row → remapped at export
  const v7 = '018f3f2e-7abc-7def-8abc-000000000042';
  // adhkar item ids must EXIST in the seed (adhkar_state.item_id FK) — pick
  // two real ids from the built db so native imports pass FK enforcement.
  const { DatabaseSync } = await import('node:sqlite');
  const seedDb = new DatabaseSync(join(ROOT, 'packages', 'core-data', 'build', 'sadaqa.db'));
  const itemRows = seedDb.prepare(`SELECT item_id FROM athkar_items ORDER BY sort_order LIMIT 2`).all();
  seedDb.close();
  if (itemRows.length < 2) throw new Error('generator: seed db has no athkar_items — run db:build first');
  const item1 = itemRows[0].item_id;
  const item2 = itemRows[1].item_id;
  const rows = {
    bookmarks: [
      { uuid: v4, page: 2, line_number: 5, ayah_number: 7, label_ar: 'الفاتحة', created_at: T - 5000, updated_at: T - 1000, deleted: 0 },
      { uuid: v7, page: 303, line_number: 1, ayah_number: 2942, label_ar: null, created_at: T - 400, updated_at: T - 300, deleted: 0 },
    ],
    highlights: [{ uuid: '018f3f2e-7abc-7def-8abc-000000000101', ayah_number: 2, word_start: 1, word_end: 4, color_key: 'emerald', updated_at: T - 200, deleted: 0 }],
    notes: [{ uuid: '018f3f2e-7abc-7def-8abc-000000000102', ayah_number: null, body: 'دعاء عام', created_at: T - 900, updated_at: T - 100, deleted: 0 }],
    khatmah_plans: [{ uuid: '018f3f2e-7abc-7def-8abc-000000000103', name_ar: 'ختمتي', mode: 'deadline', start_date: '2026-11-01', end_date: '2027-01-31', daily_pages: null, active: 1, created_at: T - 9000, updated_at: T - 50, deleted: 0 }],
    adhkar_state: [
      { item_id: item1, day_key: '2026-11-17', count: 3, completed_at: T - 3600_000, updated_at: T - 3600_000 },
      { item_id: item2, day_key: '2026-11-16', count: 1, completed_at: null, updated_at: T - 90_000_000 },
    ],
    tasbih_counters: [
      { uuid: v4, label_ar: 'ورد السبحة المُستورد', dhikr_text: 'سبحان الله وبحمده', target: 33, count: 12, total_lifetime: 120, sort_order: 0, updated_at: T - 20, deleted: 0 },
      { uuid: '018f3f2e-7abc-7def-8abc-000000000104', label_ar: 'استغفار', dhikr_text: 'أستغفر الله', target: null, count: 0, total_lifetime: 5, sort_order: 1, updated_at: T - 30, deleted: 0 },
    ],
    tasbih_sessions: [
      // counter_uuid must reference a counter that EXISTS after import: the
      // export remaps the legacy counter's uuid (v7 rule), so the sessions
      // point at the v7 counter row (golden remap touches e.uuid only —
      // fixture data must satisfy FK enforcement on import).
      { uuid: '018f3f2e-7abc-7def-8abc-000000000105', counter_uuid: '018f3f2e-7abc-7def-8abc-000000000104', count_delta: 1, occurred_at: T - 100 },
      { uuid: '018f3f2e-7abc-7def-8abc-000000000106', counter_uuid: '018f3f2e-7abc-7def-8abc-000000000104', count_delta: 1, occurred_at: T - 99 },
      { uuid: '018f3f2e-7abc-7def-8abc-000000000107', counter_uuid: '018f3f2e-7abc-7def-8abc-000000000104', count_delta: 5, occurred_at: T - 98 },
    ],
    streak_days: [
      { kind: 'tasbih', day_key: '2026-11-16', done_at: T - 86_400_000 },
      { kind: 'adhkar_morning', day_key: '2026-11-17', done_at: T - 7200_000 },
    ],
    user_settings: [
      { key: 'theme', value: '"dark"', updated_at: T - 800 },
      { key: 'calc_method', value: '"umm_al_qura"', updated_at: T - 700 },
      { key: 'device_id', value: '"device-fixture-0001"', updated_at: T - 600 },
    ],
  };
  const stubDb = {
    async query(sql) { const m = sql.match(/FROM\s+(\w+)/); if (!m) throw new Error('stub: unparseable query ' + sql); const t = m[1]; if (t === 'user_settings') return rows.user_settings.filter((r) => !/key != 'device_id'/.test(sql) || r.key !== 'device_id'); return rows[t] ?? []; },
    async queryOne(sql) { const r = rows.user_settings.find((x) => x.key === 'device_id'); return r ? { value: r.value } : null; },
    async write() { return { changes: 1 }; },
  };
  const { manifest, payload } = await buildExportPayload(stubDb, T);
  const verdict = validateBackup(manifest, payload);
  if (!verdict.ok) throw new Error('generator: sample export failed validation: ' + verdict.errors.join(' · '));
  const payloadJson = JSON.stringify(payload);
  if (manifest.integrity !== sha256(payloadJson)) throw new Error('generator: integrity mismatch vs payloadJson bytes');
  written.push('backup/sample-export.json');
  writeJson('backup/sample-export.json', {
    meta: { producer: 'apps/web-desktop/js/data/backup.js buildExportPayload (fixed clock 1764300000000)' },
    manifest,
    payloadJson, // the exact bytes the integrity digest was computed over
    payload, // parsed copy for structural navigation in tests
    expectValidation: { ok: true, counts: verdict.counts },
  });
}

// ---------------------------------------------------------------------------
// 6. hijri vectors
// ---------------------------------------------------------------------------

{
  const round = [];
  for (let t = Date.UTC(2023, 0, 1); t <= Date.UTC(2027, 11, 31); t += 7 * 86_400_000) {
    const g = new Date(t);
    const iso = `${g.getUTCFullYear()}-${String(g.getUTCMonth() + 1).padStart(2, '0')}-${String(g.getUTCDate()).padStart(2, '0')}`;
    round.push({ gregorian: iso, hijri: toHijri(iso) });
  }
  const probes = [
    { hijri: { y: 1445, m: 1, d: 1 }, expectGregorian: '2023-07-19' }, // reference anchor
    { hijri: { y: 1447, m: 9, d: 1 }, expectGregorian: null },          // ramadan start
    { hijri: { y: 1448, m: 6, d: 1 }, expectGregorian: '2026-11-11' },  // pinned by Phase 4 e2e
    { hijri: { y: 1447, m: 12, d: 10 }, expectGregorian: null },        // eid al-adha
    { hijri: { y: 1448, m: 1, d: 29 }, expectGregorian: null },
  ].map((p) => ({ ...p, gotGregorian: fromHijri(p.hijri), monthNameAr: monthNameAr(p.hijri.m) }));
  // nonexistent Hijri dates must throw (Muharram 1448 is a 29-day umalqura month)
  const mustThrow = [];
  for (const bad of [{ y: 1448, m: 1, d: 30 }, { y: 1447, m: 13, d: 1 }, { y: 1447, m: 1, d: 0 }]) {
    try { fromHijri(bad); mustThrow.push({ hijri: bad, threw: false }); } catch { mustThrow.push({ hijri: bad, threw: true }); }
  }
  const adjusts = [-3, -1, 0, 1, 3].map((a) => ({ adjust: a, '2026-11-17': withAdjust('2026-11-17', a) }));
  written.push('hijri/roundtrip.json');
  writeJson('hijri/roundtrip.json', { meta: { engine: 'hijri.js (Intl islamic-umalqura, Node ICU truth)', icuNote: 'device ICU umalqura tables may differ ±1 day — hijri_adjust is the user-facing correction (see hijri.js header)' }, weekly: round, probes, mustThrow, adjusts });

  written.push('hijri/events.json');
  writeJson('hijri/events.json', {
    meta: { engine: 'hijri.js events()/whiteDays()' },
    events2025: events(2025),
    events2026: events(2026),
    whiteDays2026: whiteDays(2026),
  });
}

// ---------------------------------------------------------------------------
// 6b. uuid7 parity vectors — synthetic ids must be byte-identical on all
//     targets (Smart Merge dedupe relies on it). Clock is PINNED.
// ---------------------------------------------------------------------------

{
  const { synthUuid7, uuid7 } = await import('../../apps/web-desktop/js/data/uuid7.js');
  const PINNED_NOW = 1764300000000; // generator clock for the timestamp field
  const keys = [
    'setting:theme', 'setting:calc_method', 'setting:font_scale',
    'adhkar:item-14:2026-11-17', 'adhkar:cat-3-9:2026-11-16',
    'streak:tasbih:2026-11-16', 'streak:adhkar_morning:2026-11-17',
    'row:3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  ];
  const synth = keys.map((k) => ({ key: k, uuid: synthUuid7(k, PINNED_NOW) }));
  const fresh = [0, 1, 2].map(() => uuid7(PINNED_NOW));
  written.push('uuid7/synth.json');
  writeJson('uuid7/synth.json', {
    meta: { pinnedNow: PINNED_NOW, algorithm: 'FNV-1a ×4 seeds [811c9dc5, 0193dc47, 9e3779b9, 85ebca6b] over ASCII key, shaped to UUIDv7 with pinned 48-bit ms timestamp', shapeRegex: '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
    synth,
    freshAllSameTimestampPrefix: fresh.every((u) => u.slice(0, 12) === fresh[0].slice(0, 12)),
  });
}

// ---------------------------------------------------------------------------
// 7. qibla vectors
// ---------------------------------------------------------------------------

{
  const points = Object.entries(CITIES).map(([k, c]) => ({ name: k, ...c }));
  points.push({ name: 'newyork', lat: 40.7128, lng: -74.006, timeZone: 'America/New_York' });
  points.push({ name: 'capetown', lat: -33.9249, lng: 18.4241, timeZone: 'Africa/Johannesburg' });
  points.push({ name: 'jakarta', lat: -6.2088, lng: 106.8456, timeZone: 'Asia/Jakarta' });
  written.push('qibla/bearings.json');
  writeJson('qibla/bearings.json', {
    meta: { engine: 'qibla.js (Kaaba 21.4225, 39.8262)' },
    points: points.map((p) => ({ ...p, bearing: qiblaBearing(p), distanceKm: distanceKm(p) })),
  });
}

// ---------------------------------------------------------------------------
// 8. schema contract — PRAGMA table_info/indexes/FKs for EVERY table built
//    from schema.sql (native Room entities / GRDB records must match exactly)
// ---------------------------------------------------------------------------

{
  const { DatabaseSync } = await import('node:sqlite');
  const schemaSql = (await import('node:fs')).readFileSync(join(ROOT, 'packages', 'core-data', 'schema.sql'), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%' AND name NOT LIKE '%_data' AND name NOT LIKE '%_config' AND name NOT LIKE '%_content' AND name NOT LIKE '%_docsize' AND name NOT LIKE '%_idx' ORDER BY name`).all().map((r) => r.name);
  const info = {};
  for (const t of tables) {
    const columns = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => ({ name: c.name, type: c.type, notnull: c.notnull === 1, dflt: c.dflt_value, pk: c.pk }));
    const fks = db.prepare(`PRAGMA foreign_key_list(${t})`).all().map((f) => ({ table: f.table, from: f.from, to: f.to, onDelete: f.on_update === f.on_delete ? f.on_delete : null }));
    const indexes = db.prepare(`PRAGMA index_list(${t})`).all().filter((i) => !i.name.startsWith('sqlite_autoindex')).map((i) => ({ name: i.name, unique: i.unique === 1, columns: db.prepare(`PRAGMA index_info(${i.name})`).all().map((c) => c.name) }));
    info[t] = { columns, fks, indexes };
  }
  db.close();
  written.push('schema/tableinfo.json');
  writeJson('schema/tableinfo.json', { meta: { builtFrom: 'packages/core-data/schema.sql via node:sqlite', note: 'contract for native Room/GRDB declarations — native tests compare their DDL/entities against these exact columns' }, tables: info });
}

// ---------------------------------------------------------------------------
// manifest with checksums (freshness gate: CI regenerates and diffs)
// ---------------------------------------------------------------------------

const files = written.map((f) => ({ path: `tests/parity/fixtures/${f}`, sha256: sha256(readFileSync(join(OUT, f))) }));
const manifestObj = {
  generator: 'scripts/tools/gen-parity-fixtures.mjs',
  generated: '2026-11-17',
  // NOTE: no node/icu/version fields — the manifest must be byte-stable across
  // toolchains (CI regenerates and diff-checks; volatile fields would false-fail).
  counts: { prayerFiles: written.filter((f) => f.startsWith('prayer/')).length, smartCard: smartCardCount, files: files.length },
  files,
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifestObj, null, 1) + '\n');
console.log(`parity fixtures: ${files.length} files written to tests/parity/fixtures`);
console.log(`  prayer: ${manifestObj.counts.prayerFiles} city/month/variant grids`);
const tableInfo = JSON.parse(readFileSync(join(OUT, 'schema', 'tableinfo.json'), 'utf8'));
console.log(`  schema tables contracted: ${Object.keys(tableInfo.tables).length}`);
