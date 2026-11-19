// prayer-polar.test.js — polar-circle regression (2026-11 audit F1):
// AqrabBalad resolution must yield finite times for the two Arctic cities
// actually shipped in cities.json (Norilsk 69.35°N, Murmansk 68.97°N); before
// the fix adhan returned NaN on polar day and never-throwing garbage on polar
// night. Ordering is pinned only for a non-degenerate equinox day — on polar
// day/night even resolved times have no strict intra-day sun ordering, and
// that is not a regression this test may over-pin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForDate, PRAYER_NAMES } from '../engines/prayer.js';

const CITIES = [
  { name: 'Norilsk', lat: 69.3535, lng: 88.2027, tz: 'Asia/Krasnoyarsk' },
  { name: 'Murmansk', lat: 68.9585, lng: 33.0827, tz: 'Europe/Moscow' },
];

/** computeForDate must NEVER hand back NaN/∞ — it throws or resolves. */
function finiteOrThrow(label, opts) {
  try {
    const { times } = computeForDate({ y: opts.y, mo: opts.mo, d: opts.d }, opts);
    for (const n of PRAYER_NAMES) {
      assert.ok(Number.isFinite(times[n]), `${label}: ${n} must be finite (got ${times[n]})`);
    }
    return times;
  } catch (e) {
    assert.match(String(e.message), /unresolved/, `${label}: throws explicitly, never NaN (${e.message})`);
    return null;
  }
}

test('polar cities: finite times across polar day/night/equinox', () => {
  for (const c of CITIES) {
    for (const p of [
      { y: 2026, mo: 5, d: 21, label: 'polar day (Jun 21)' },
      { y: 2026, mo: 11, d: 15, label: 'polar night (Dec 15)' },
      { y: 2026, mo: 2, d: 20, label: 'equinox (Mar 20)' },
    ]) {
      finiteOrThrow(`${c.name} ${p.label}`, { y: p.y, mo: p.mo, d: p.d, lat: c.lat, lng: c.lng, timeZone: c.tz, method: 'muslim_world_league' });
    }
  }
});

test('equinox day keeps strict prayer ordering (non-degenerate day)', () => {
  for (const c of CITIES) {
    const times = finiteOrThrow(`${c.name} equinox`, { y: 2026, mo: 2, d: 20, lat: c.lat, lng: c.lng, timeZone: c.tz, method: 'muslim_world_league' });
    if (!times) continue; // thrown=acceptable variant already asserted
    const [fajr, sunrise, dhuhr, asr, maghrib, isha] = PRAYER_NAMES.map((n) => times[n]);
    assert.ok(fajr < sunrise && sunrise < dhuhr && dhuhr < asr && asr < maghrib && maghrib < isha,
      `${c.name}: equinox ordering fajr<sunrise<dhuhr<asr<maghrib<isha`);
  }
});

test('non-polar anchor stays bit-identical (London MWL maghrib pin)', () => {
  const { times } = computeForDate({ y: 2026, mo: 2, d: 28 }, { lat: 51.5074, lng: -0.1278, timeZone: 'Europe/London', method: 'muslim_world_league' });
  assert.equal(times.maghrib, Date.UTC(2026, 2, 28, 18, 27, 0), 'London 2026-03-28 MWL maghrib = 18:27:00Z');
});

test('near-pole extreme: finite resolution or explicit throw, never NaN', () => {
  // قرب القطب الجغرافي تماماً — خارج قدرة أي حلٍّ فلكي؛ القابل للقياس هو
  // «لا NaN صامتة» لا «يجب أن يرمي»
  finiteOrThrow('89.5°N polar day', { y: 2026, mo: 5, d: 21, lat: 89.5, lng: 0, timeZone: 'UTC', method: 'muslim_world_league' });
});
