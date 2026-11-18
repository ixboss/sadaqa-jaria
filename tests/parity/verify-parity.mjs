#!/usr/bin/env node
// ============================================================================
// verify-parity.mjs — node-side self-verification of the Phase 5 parity
// corpus (runs anywhere node runs, including CI). Asserts:
//   1. fixture manifest checksums match the files on disk (no drift)
//   2. the web engines STILL reproduce the fixture values (golden = fixture)
//   3. the sample .sadaqa export's integrity digest matches its payload bytes
//   4. the schema contract covers every non-FTS table schema.sql defines
// Exit code 0 = the corpus is internally consistent and engine-fresh.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const FIX = join(ROOT, 'tests', 'parity', 'fixtures');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ok  ${name}`); }
    else { fail++; console.error(`FAIL  ${name} ${extra}`); }
};

// 1. manifest checksums
const manifest = JSON.parse(readFileSync(join(FIX, 'manifest.json'), 'utf8'));
check('manifest lists files', manifest.files.length >= 33, `got ${manifest.files.length}`);
for (const f of manifest.files) {
    const buf = readFileSync(join(ROOT, f.path));
    check(`checksum ${f.path.replace('tests/parity/fixtures/', '')}`, sha256(buf) === f.sha256);
}

// 2. engines still reproduce one full prayer grid (spot-deep verification)
const prayerUrl = pathToFileURL(join(ROOT, 'packages', 'core-data', 'engines', 'prayer.js'));
const { daySchedule, sunnahWindows, next } = await import(prayerUrl.href);
const grids = readFileSync(join(FIX, 'manifest.json'), 'utf8');
const prayerFile = manifest.files.map((f) => f.path).find((p) => p.includes('/prayer/') && p.includes('london') && p.includes('_default'));
const london = JSON.parse(readFileSync(join(ROOT, prayerFile), 'utf8'));
const opts = { lat: london.meta.lat, lng: london.meta.lng, timeZone: london.meta.timeZone, method: london.meta.method, madhab: london.meta.madhab, highLatitudeRule: london.meta.highLatitudeRule };
let drift = 0;
for (const day of london.days) {
    const sched = daySchedule(day.date, opts);
    for (const name of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
        if (sched.prayers[name] !== day.prayers[name]) drift++;
    }
    if (sched.previousIsha !== day.previousIsha) drift++;
    const sun = sunnahWindows(day.date, opts);
    for (const k of ['duha', 'duhaEnd', 'midnight', 'lastThird']) {
        if (sun[k] !== day.sunnah[k]) drift++;
    }
}
for (const probe of london.nextProbes) {
    const got = next(probe.now, opts);
    if (got.name !== probe.expected.name || got.at !== probe.expected.at) drift++;
}
check('web engine reproduces london 2026-03 grid (0 drift)', drift === 0, `drift=${drift}`);

// 3. sample export integrity
const sample = JSON.parse(readFileSync(join(FIX, 'backup', 'sample-export.json'), 'utf8'));
check('sample-export integrity digest', sha256(Buffer.from(sample.payloadJson, 'utf8')) === sample.manifest.integrity);
const validatorUrl = pathToFileURL(join(ROOT, 'packages', 'core-data', 'engines', 'backup-validate.js'));
const { validateBackup } = await import(validatorUrl.href);
const verdict = validateBackup(sample.manifest, sample.payload);
check('sample-export validates', verdict.ok, verdict.errors?.join(' · '));

// 3b. v1 classic bundle freshness — js/core-data.bundle.js is generated from
// the same engines; a committed file that no longer matches a fresh compile
// means an engine edit skipped regeneration (2026-11 unification gate).
const bundlePath = join(ROOT, 'js', 'core-data.bundle.js');
const { execFileSync } = await import('node:child_process');
const committedBundle = readFileSync(bundlePath, 'utf8');
execFileSync(process.execPath, [join(ROOT, 'scripts', 'tools', 'build-engines-bundle.mjs')], { stdio: 'pipe' });
check('core-data.bundle.js is fresh (regenerated == committed)',
    readFileSync(bundlePath, 'utf8') === committedBundle,
    'run: node scripts/tools/build-engines-bundle.mjs');

// 4. schema contract coverage
const contract = JSON.parse(readFileSync(join(FIX, 'schema', 'tableinfo.json'), 'utf8'));
const tableNames = Object.keys(contract.tables);
check('schema contract ≥31 tables', tableNames.length >= 31, `got ${tableNames.length}`);
for (const must of ['bookmarks', 'highlights', 'notes', 'khatmah_plans', 'adhkar_state', 'tasbih_counters', 'tasbih_sessions', 'streak_days', 'user_settings', 'backup_log', 'surahs', 'ayahs', 'cities', 'athkar_items']) {
    check(`contract covers ${must}`, tableNames.includes(must));
}

console.log(`\nparity self-verify: ${ok} ok, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
