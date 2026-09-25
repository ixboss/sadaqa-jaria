#!/usr/bin/env node
/**
 * Unit tests — BackupManager validation logic (no browser required)
 * ─────────────────────────────────────────────────────────────────
 * Loads backup.js into a shimmed globals sandbox and asserts the pure
 * logic: envelope validation, per-key type checks, malformed-key
 * resilience, unknown/future-schema handling, and a full
 * build → stringify → parse → apply round trip.
 *
 * Run: node tests/unit-backup.mjs
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(join(__dirname, '..', 'backup.js'), 'utf8');

// ── sandbox: enough of the browser for the module to load ──
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};
const win = {};
const runner = new Function('window', 'localStorage', 'console', src);
runner(win, localStorage, console);
const BM = win.BackupManager;

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

function seedGood() {
  store.clear();
  localStorage.setItem('app_state', JSON.stringify({ currentTab: 'quran', khatmah: { active: true, totalDays: 30, currentPage: 5 }, theme: 'dark', scrollPositions: {} }));
  localStorage.setItem('app_stats_v1', JSON.stringify({ streak: 3, dates: ['2026-09-23'] }));
  localStorage.setItem('islamic_bookmarks', JSON.stringify([{ surah: 2, ayah: 255, label: 'آية الكرسي' }]));
  localStorage.setItem('reading_progress', JSON.stringify({ surah: 18, ayah: 1, timestamp: 1 }));
  localStorage.setItem('athkar_favs', JSON.stringify(['0:3', '1:0']));
  localStorage.setItem('tasbihCount', '41');
  localStorage.setItem('tasbihLap', '2');
  localStorage.setItem('tasbih_target', '99');
  localStorage.setItem('adhkar_auto_advance', '1');
  localStorage.setItem('font_scale', '110');
  localStorage.setItem('reciter', 'ar.husary');
  localStorage.setItem('reminders_enabled', '0');
  localStorage.setItem('theme', 'dark');
}

function main() {
  // ── (1) build() shape ──
  seedGood();
  const { payload, skipped } = BM.build();
  ok('build: envelope schema', payload.schema === 'islami-backup');
  ok('build: envelope version', payload.version === 1);
  ok('build: envelope app', payload.app === 'islami');
  ok('build: created is ISO', typeof payload.created === 'string' && !isNaN(Date.parse(payload.created)));
  ok('build: all 13 user keys present', Object.keys(payload.data).length === 13, Object.keys(payload.data).join(','));
  ok('build: no skipped on clean store', skipped.length === 0, skipped.join(','));
  ok('build: json keys parsed', payload.data.app_state.khatmah.currentPage === 5);
  ok('build: raw keys kept as strings', payload.data.tasbihCount === '41');
  ok('build: missing keys are omitted (not null)', (() => {
    localStorage.removeItem('theme');
    const b = BM.build();
    return !('theme' in b.payload.data) && !('theme' in Object.fromEntries(Object.entries(b.payload.data).filter(([k]) => k === 'theme')));
  })());

  // ── (2) malformed keys must not break the export ──
  seedGood();
  localStorage.setItem('app_state', '{this is not json');
  localStorage.setItem('athkar_favs', '[1, 2, "ok", null]');
  const r2 = BM.build();
  ok('build: malformed json key skipped, not thrown', r2.skipped.includes('app_state'), r2.skipped.join(','));
  ok('build: invalid-shape key skipped', r2.skipped.includes('athkar_favs'), r2.skipped.join(','));
  ok('build: other keys still exported', r2.payload.data.tasbihCount === '41' && r2.payload.data.theme === 'dark');
  ok('build: skipped key not in payload', !('app_state' in r2.payload.data));

  // ── (3) parse(): rejection cases ──
  ok('parse: not JSON', !BM.parse('{' + 'oops').ok);
  ok('parse: JSON but not object', !BM.parse('"a string"').ok);
  ok('parse: wrong schema', !BM.parse(JSON.stringify({ schema: 'something-else', version: 1, data: {} })).ok);
  ok('parse: missing schema', !BM.parse(JSON.stringify({ version: 1, data: { theme: 'dark' } })).ok);
  ok('parse: version not a number', !BM.parse(JSON.stringify({ schema: 'islami-backup', version: '1', data: { theme: 'dark' } })).ok);
  ok('parse: future version rejected', (() => {
    const r = BM.parse(JSON.stringify({ schema: 'islami-backup', version: 99, data: { theme: 'dark' } }));
    return !r.ok && /أحدث/.test(r.reason);
  })());
  ok('parse: data not an object', !BM.parse(JSON.stringify({ schema: 'islami-backup', version: 1, data: [] })).ok);
  ok('parse: empty data rejected', (() => {
    const r = BM.parse(JSON.stringify({ schema: 'islami-backup', version: 1, data: {} }));
    return !r.ok;
  })());
  ok('parse: all values invalid → rejected', (() => {
    const r = BM.parse(JSON.stringify({ schema: 'islami-backup', version: 1, data: { tasbih_target: '7', theme: 'purple' } }));
    return !r.ok;
  })());

  // ── (4) parse(): unknown keys ignored, invalid values rejected but file accepted ──
  seedGood();
  const built = BM.build().payload;
  const mixed = JSON.parse(JSON.stringify(built));
  mixed.data.future_key = { anything: true };              // unknown → ignored
  mixed.data.tasbih_target = '7';                          // not in allowlist → rejected
  mixed.data.font_scale = '500';                           // out of range → rejected
  mixed.data.reciter = 'not a real reciter id';            // not allowlisted → rejected
  mixed.data.islamic_bookmarks = [{ nope: 1 }];            // bad bookmark shape → rejected
  const r4 = BM.parse(JSON.stringify(mixed));
  ok('parse: valid file accepted despite bad values', r4.ok);
  ok('parse: unknown key ignored', r4.ignored.includes('future_key'));
  ok('parse: invalid raw values rejected', r4.rejected.includes('tasbih_target') && r4.rejected.includes('font_scale') && r4.rejected.includes('reciter'));
  ok('parse: invalid json value rejected', r4.rejected.includes('islamic_bookmarks'));
  ok('parse: rejected keys excluded from data', !('tasbih_target' in r4.data) && !('future_key' in r4.data));

  // ── (5) the code-injection guarantee: a payload string is never evaluated ──
  const evil = JSON.stringify({
    schema: 'islami-backup', version: 1,
    data: { theme: 'dark`); console.log("EVALUATED"); (function(){}(' }
  });
  let evaluated = false;
  const origLog = console.log;
  console.log = (...a) => { if (a.join(' ').includes('EVALUATED')) evaluated = true; origLog(...a); };
  const r5 = BM.parse(evil);
  console.log = origLog;
  ok('parse: value string never evaluated', !evaluated && !r5.ok);

  // ── (6) esc() escapes HTML metacharacters ──
  ok('esc: metacharacters escaped', BM.esc('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;');

  // ── (7) round trip: build → parse → apply into a clean store ──
  seedGood();
  const before = {};
  for (const k of Object.keys(BM.KEYS)) {
    const raw = localStorage.getItem(k);
    if (raw !== null) before[k] = raw;
  }
  const payload7 = BM.build().payload;
  store.clear();
  const r7 = BM.parse(JSON.stringify(payload7));
  ok('round trip: parsed', r7.ok);
  const { applied, failed } = BM.apply(r7.data);
  ok('round trip: no failures', failed.length === 0, failed.join(','));
  ok('round trip: all parsed keys applied', applied.length === Object.keys(r7.data).length, `applied=${applied.length} parsed=${Object.keys(r7.data).length} failed=${failed.join(',')}`);
  let mismatch = '';
  for (const k of Object.keys(before)) {
    if (localStorage.getItem(k) !== before[k]) { mismatch = k; break; }
  }
  ok('round trip: every key byte-identical', mismatch === '', mismatch);

  // ── (8) apply() is per-key fault tolerant ──
  seedGood();
  const r8 = BM.parse(JSON.stringify(payload7));
  // force a quota failure on one key by replacing setItem
  const realSetItem = localStorage.setItem;
  let blocked = false;
  localStorage.setItem = function (k) { if (k === 'app_stats_v1') { blocked = true; throw new Error('QuotaExceededError'); } return realSetItem.apply(this, arguments); };
  const res8 = BM.apply(r8.data);
  localStorage.setItem = realSetItem;
  ok('apply: quota error on one key does not abort others', blocked && res8.failed.includes('app_stats_v1') && res8.applied.includes('theme'));
  ok('apply: other keys still written', localStorage.getItem('theme') === 'dark');

  // ── report ──
  const failed2 = results.filter(r => !r.pass);
  for (const r of results) console.log((r.pass ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? '  — ' + r.detail : ''));
  console.log(`\n${results.length - failed2.length}/${results.length} passed`);
  if (failed2.length) { console.log('FAILED: ' + failed2.map(r => r.name).join(', ')); process.exitCode = 1; }
}

main();
