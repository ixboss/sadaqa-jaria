// reminders.test.js — prayer-anchored reminder resolver (REA_SPEC §4.7)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnchor } from '../engines/reminders.js';
import { bindPrayerEngine } from '../engines/prayer.js';
import * as hijri from '../engines/hijri.js';

const CAIRO = { lat: 30.0444, lng: 31.2356, timeZone: 'Africa/Cairo', method: 'egyptian', madhab: 'shafi' };
const engine = bindPrayerEngine(CAIRO);
const ctx = (dayStartIso, days = 1) => {
  const dayStartInstant = Date.parse(`${dayStartIso}T00:00:00+02:00`); // Cairo EET in November
  return { dayStartInstant, days, prayerEngine: engine, hijriEngine: hijri };
};

test('prayer_offset: dhuhr+20 lands exactly 20 minutes after computed dhuhr', () => {
  const c = ctx('2026-11-17');
  const dhuhr = engine.daySchedule('2026-11-17').prayers.dhuhr;
  const out = resolveAnchor({ kind: 'prayer_offset', prayer: 'dhuhr', offsetMinutes: 20 }, c);
  assert.equal(out.length, 1);
  assert.equal(out[0].at, dhuhr + 20 * 60_000);
});

test('prayer_offset: no prayer filter emits all six prayers per day', () => {
  const out = resolveAnchor({ kind: 'prayer_offset', prayer: null, offsetMinutes: 0 }, ctx('2026-11-17', 2));
  assert.equal(out.length, 12);
});

test('prayer_offset validates offset range', () => {
  assert.throws(() => resolveAnchor({ kind: 'prayer_offset', offsetMinutes: 500 }, ctx('2026-11-17')), /-30\.\.\+120/);
});

test('solar: lastThird falls after midnight, both between maghrib and next fajr', () => {
  const s = engine.daySchedule('2026-11-17').prayers;
  const [mid] = resolveAnchor({ kind: 'solar', window: 'midnight' }, ctx('2026-11-17'));
  const [third] = resolveAnchor({ kind: 'solar', window: 'lastThird' }, ctx('2026-11-17'));
  assert.ok(mid.at > s.maghrib);
  assert.ok(third.at > mid.at);
  assert.ok(third.at < engine.sunnahWindows('2026-11-17').nextFajr);
});

test('solar: unknown window throws', () => {
  assert.throws(() => resolveAnchor({ kind: 'solar', window: 'sunset' }, ctx('2026-11-17')), /window must be/);
});

test('daily_at: fixed time anchors for N days (the only fixed-hour kind)', () => {
  const out = resolveAnchor({ kind: 'daily_at', time: '05:30' }, ctx('2026-11-17', 3));
  assert.equal(out.length, 3);
  assert.equal(out[0].at - out[1].at, -86_400_000);
});

test('daily_at: invalid time format throws', () => {
  assert.throws(() => resolveAnchor({ kind: 'daily_at', time: '5:30pm' }, ctx('2026-11-17')), /HH:MM/);
});

test('hijri_event: ramadan_start resolves exactly once within a full year window', () => {
  const c = ctx('2026-01-01', 365);
  const out = resolveAnchor({ kind: 'hijri_event', event: 'ramadan_start' }, c);
  assert.equal(out.length, 1);
  const evts = hijri.events(2026).filter((e) => e.key === 'ramadan_start');
  assert.equal(out[0].at, Date.parse(`${evts[0].gregorian}T12:00:00Z`));
});

test('hijri_date: personal occasion resolves within its window (offsetDays honored)', () => {
  // Nov 1 2026 + 60d spans Jumada II 1447 (~Nov 9 – Dec 7) — day 15 lands ~Nov 24.
  const c = ctx('2026-11-01', 60);
  const out = resolveAnchor({ kind: 'hijri_date', month: 6, day: 15, offsetDays: 1 }, c);
  assert.equal(out.length, 1, `expected 1 occurrence, got ${JSON.stringify(out)}`);
  assert.ok(out[0].label.startsWith('hijri 6/15'));
  assert.ok(out[0].at >= c.dayStartInstant && out[0].at < c.dayStartInstant + 60 * 86_400_000);
});

test('unknown anchor kind throws', () => {
  assert.throws(() => resolveAnchor({ kind: 'cron', time: 'x' }, ctx('2026-11-17')), /unknown anchor kind/);
});

test('missing engines in ctx throws', () => {
  assert.throws(() => resolveAnchor({ kind: 'daily_at', time: '05:00' }, { dayStartInstant: 0, days: 1 }), /requires prayerEngine/);
});
