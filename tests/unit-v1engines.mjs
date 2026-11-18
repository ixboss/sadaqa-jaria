#!/usr/bin/env node
/**
 * unit-v1engines.mjs — v1 classic bundle ≡ v2 ESM engines (byte-parity).
 * js/core-data.bundle.js must compute IDENTICALLY to
 * packages/core-data/engines/{prayer,qibla}.js — that equivalence is the whole
 * point of the 2026-11 unification (the v1 parallel math produced the
 * device-timezone prayer bug).
 * Run: node tests/unit-v1engines.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

// load the classic bundle (window-less: it falls back to globalThis)
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(__dirname, '..', 'js', 'core-data.bundle.js'), 'utf8'), ctx, { filename: 'core-data.bundle.js' });
const bundled = ctx.CoreData;

// load the golden ESM engines
const prayerUrl = pathToFileURL(join(__dirname, '..', 'packages', 'core-data', 'engines', 'prayer.js')).href;
const qiblaUrl = pathToFileURL(join(__dirname, '..', 'packages', 'core-data', 'engines', 'qibla.js')).href;
const prayer = await import(prayerUrl);
const qibla = await import(qiblaUrl);

const OPTS = [
  { lat: 51.5074, lng: -0.1278, timeZone: 'Europe/London', method: 'umm_al_qura', madhab: 'shafi', highLatitudeRule: 'middle_of_the_night' },
  { lat: 30.0444, lng: 31.2357, timeZone: 'Africa/Cairo', method: 'egyptian', madhab: 'shafi', highLatitudeRule: 'middle_of_the_night' },
  { lat: 21.4225, lng: 39.8262, timeZone: 'Asia/Riyadh', method: 'muslim_world_league', madhab: 'hanafi', highLatitudeRule: 'seventh_of_the_night' },
];
const DATES = ['2026-01-01', '2026-03-28', '2026-06-21', '2026-11-19'];

function main() {
  ok('bundle exposes CoreData.prayer/qibla', Boolean(bundled?.prayer?.daySchedule && bundled?.qibla?.qiblaBearing), Object.keys(bundled ?? {}).join(','));

  // 1. daySchedule parity across zones/dates
  let schedDrift = 0, schedChecked = 0;
  for (const opts of OPTS) {
    for (const date of DATES) {
      const a = bundled.prayer.daySchedule(date, opts);
      const b = prayer.daySchedule(date, opts);
      schedChecked++;
      for (const name of prayer.PRAYER_NAMES) {
        if (a.prayers[name] !== b.prayers[name] || a.previousIsha !== b.previousIsha) schedDrift++;
      }
    }
  }
  ok(`daySchedule parity (${schedChecked} grids, 0 drift)`, schedDrift === 0, `drift=${schedDrift}`);

  // 2. sunnahWindows parity
  let sunDrift = 0;
  for (const opts of OPTS) {
    for (const date of DATES) {
      const a = bundled.prayer.sunnahWindows(date, opts);
      const b = prayer.sunnahWindows(date, opts);
      for (const k of ['duha', 'duhaEnd', 'midnight', 'lastThird', 'nextFajr']) {
        if (a[k] !== b[k]) sunDrift++;
      }
    }
  }
  ok('sunnahWindows parity (0 drift)', sunDrift === 0, `drift=${sunDrift}`);

  // 3. next() parity on probes (incl. DST afternoon + pre-fajr)
  const now1 = Date.UTC(2026, 2, 28, 17, 0, 0); // DST day, London evening
  const now2 = Date.UTC(2026, 10, 19, 0, 30, 0); // pre-fajr
  let nextDrift = 0;
  for (const opts of OPTS) {
    for (const nowMs of [now1, now2]) {
      const a = bundled.prayer.next(nowMs, opts);
      const b = prayer.next(nowMs, opts);
      if (a.name !== b.name || a.at !== b.at || a.previous.at !== b.previous.at) nextDrift++;
    }
  }
  ok('next() parity on probes (0 drift)', nextDrift === 0, `drift=${nextDrift}`);

  // 4. qibla parity (rounded to what the UI shows)
  let qDrift = 0;
  for (const [lat, lng] of [[51.5, -0.13], [30.04, 31.23], [-33.87, 151.21], [40.71, -74.0], [21.42, 39.83]]) {
    const a = Math.round(bundled.qibla.qiblaBearing({ lat, lng }));
    const b = Math.round(qibla.qiblaBearing({ lat, lng }));
    if (a !== b) qDrift++;
  }
  ok('qiblaBearing parity (0 drift)', qDrift === 0, `drift=${qDrift}`);

  // 5. constants parity
  ok('CALC_METHODS identical', JSON.stringify(bundled.prayer.CALC_METHODS) === JSON.stringify(prayer.CALC_METHODS));
  ok('PRAYER_NAMES identical', JSON.stringify(bundled.prayer.PRAYER_NAMES) === JSON.stringify(prayer.PRAYER_NAMES));

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log((r.pass ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? '  — ' + r.detail : ''));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(', ')); process.exitCode = 1; }
}

main();
