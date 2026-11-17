// prayer.test.js — engine parity + invariants (node:test, zero-dep)
// Parity strategy: raw adhan (vendored, same files) with an anchor whose local
// components equal the city civil date produces the city's wall-clock prayer
// times in its local getters. The engine must reproduce those wall times after
// its wall→instant→wall round trip in the city timezone — on any runtime TZ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeForDate, daySchedule, next, schedule, sunnahWindows, bindPrayerEngine,
  CALC_METHODS, MADHABS, HIGH_LATITUDE_RULES, civilParts,
} from '../engines/prayer.js';
import { Coordinates, CalculationMethod, PrayerTimes } from '../vendor/adhan/Adhan.js';

const MAKKAH = { lat: 21.4225, lng: 39.8262, timeZone: 'Asia/Riyadh', method: 'umm_al_qura' };
const CAIRO  = { lat: 30.0444, lng: 31.2356, timeZone: 'Africa/Cairo', method: 'egyptian', madhab: 'shafi' };
const LONDON = { lat: 51.5074, lng: -0.1278, timeZone: 'Europe/London', method: 'muslim_world_league', highLatitudeRule: 'seventh_of_the_night' };

const DAY = '2026-11-17';
const [Y, M, D] = DAY.split('-').map(Number);

/** Wall-clock HH:MM:SS from a Date using LOCAL getters (what raw adhan produces). */
function localHms(dt) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}
/** Engine instant → city wall-clock HH:MM:SS. */
function cityHms(instant, tz) {
  const c = civilParts(instant, tz);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(c.h)}:${p(c.mi)}:${p(c.s)}`;
}

test('parity: engine instants equal raw adhan instants for the city civil date (wiring pin)', () => {
  for (const city of [MAKKAH, CAIRO, LONDON]) {
    const raw = new PrayerTimes(
      new Coordinates(city.lat, city.lng),
      new Date(Y, M - 1, D, 12, 0, 0, 0), // local-noon anchor (same trick as the engine)
      CalculationMethod[{
        umm_al_qura: 'UmmAlQura', egyptian: 'Egyptian', muslim_world_league: 'MuslimWorldLeague',
      }[city.method]](),
    );
    const { times } = computeForDate({ y: Y, mo: M - 1, d: D }, city);
    for (const name of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
      assert.equal(times[name], raw.timeForPrayer(name).getTime(), `${city.timeZone} ${name} epoch`);
    }
  }
});

test('goldens: London 2026-03-28 (MWL, default HLR) matches empirically pinned UTC instants', () => {
  const golden = {
    fajr: '2026-03-28T03:49:00Z',
    sunrise: '2026-03-28T05:45:00Z',
    dhuhr: '2026-03-28T12:07:00Z',
    asr: '2026-03-28T15:34:00Z',
    maghrib: '2026-03-28T18:27:00Z',
    isha: '2026-03-28T20:17:00Z',
  };
  const { times } = computeForDate({ y: 2026, mo: 2, d: 28 }, { ...LONDON, highLatitudeRule: 'middle_of_the_night' });
  for (const [name, iso] of Object.entries(golden)) {
    assert.equal(times[name], Date.parse(iso), `${name}`);
  }
});

test('within-day monotonic order fajr<sunrise<dhuhr<asr<maghrib<isha (mid-latitude)', () => {
  const { times } = computeForDate({ y: Y, mo: M - 1, d: D }, CAIRO);
  const seq = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((n) => times[n]);
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i] > seq[i - 1], `order violated at index ${i}`);
});

test('offsets adjust minutes and are range-validated', () => {
  const base = computeForDate({ y: Y, mo: M - 1, d: D }, CAIRO).times.dhuhr;
  const shifted = computeForDate({ y: Y, mo: M - 1, d: D }, { ...CAIRO, offsets: { dhuhr: 5 } }).times.dhuhr;
  assert.equal(shifted - base, 5 * 60_000);
  assert.throws(() => computeForDate({ y: Y, mo: M - 1, d: D }, { ...CAIRO, offsets: { asr: 999 } }), /out of range/);
  assert.throws(() => computeForDate({ y: Y, mo: M - 1, d: D }, { ...CAIRO, offsets: { noon: 5 } }), /unknown prayer/);
});

test('enum passthrough: unknown method/madhab/rule throw with allowed list', () => {
  assert.throws(() => computeForDate({ y: Y, mo: M - 1, d: D }, { ...CAIRO, method: 'nope' }), /allowed:/);
  assert.throws(() => computeForDate({ y: Y, mo: M - 1, d: D }, { ...CAIRO, madhab: 'maliki' }), /allowed:/);
  assert.throws(() => computeForDate({ y: Y, mo: M - 1, d: D }, { ...CAIRO, highLatitudeRule: 'always_noon' }), /allowed:/);
  assert.ok(CALC_METHODS.includes('umm_al_qura') && MADHABS.includes('hanafi') && HIGH_LATITUDE_RULES.includes('twilight_angle'));
  // gulf resolved 2026-11-18: the vendored adhan 4.4.6 has no Gulf factory, so
  // the method is deliberately absent from METHOD_MAP + every Settings UI.
  assert.ok(!CALC_METHODS.includes('gulf'), 'gulf must not be offered');
  assert.throws(() => computeForDate({ y: Y, mo: M - 1, d: D }, { ...CAIRO, method: 'gulf' }), /unknown calc method/);
});

test('next(): at pre-fajr returns fajr with previous = yesterday isha', () => {
  const sched = daySchedule(DAY, MAKKAH);
  const now = sched.prayers.fajr - 60_000;
  const r = next(now, MAKKAH);
  assert.equal(r.name, 'fajr');
  assert.equal(r.at, sched.prayers.fajr);
  assert.equal(r.previous.name, 'isha');
  assert.ok(r.previous.at <= now);
});

test('next(): at isha returns tomorrow fajr (day-boundary crossing)', () => {
  const sched = daySchedule(DAY, MAKKAH);
  const now = sched.prayers.isha + 60_000;
  const r = next(now, MAKKAH);
  assert.equal(r.name, 'fajr');
  assert.ok(r.at > now);
});

test('schedule(): full month rows, correct lengths (Feb 2026 = 28)', () => {
  const feb = schedule(2026, 2, MAKKAH);
  assert.equal(feb.rows.length, 28);
  assert.equal(feb.rows[0].date, '2026-02-01');
  const oct = schedule(2026, 10, CAIRO);
  assert.equal(oct.rows.length, 31);
});

test('sunnahWindows(): duha between sunrise/duhaEnd; midnight & lastThird ordered within the night', () => {
  const w = sunnahWindows(DAY, CAIRO);
  const s = daySchedule(DAY, CAIRO);
  assert.ok(w.duha > s.prayers.sunrise && w.duha < w.duhaEnd);
  assert.ok(w.duhaEnd <= s.prayers.maghrib);
  assert.ok(w.midnight > s.prayers.maghrib);
  assert.ok(w.lastThird > w.midnight);
  assert.ok(w.lastThird < w.nextFajr);
});

test('DST day: London schedule resolves true instants and wall times shift by the offset change', () => {
  // 2026-03-29 is the spring-forward Sunday in Europe/London.
  const before = daySchedule('2026-03-28', LONDON).prayers.maghrib;
  const after = daySchedule('2026-03-29', LONDON).prayers.maghrib;
  const wb = cityHms(before, LONDON.timeZone);
  const wa = cityHms(after, LONDON.timeZone);
  // wall clock should be ~1h later day-over-day for similar solar time
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  assert.ok(toMin(wa) > toMin(wb) + 50 && toMin(wa) < toMin(wb) + 70, `wall shift unexpected: ${wb} → ${wa}`);
  // and the instants must be ordered
  assert.ok(after > before);
});

test('determinism: identical inputs produce identical epoch ms across repeated calls', () => {
  const a = computeForDate({ y: Y, mo: M - 1, d: D }, CAIRO).times;
  const b = computeForDate({ y: Y, mo: M - 1, d: D }, CAIRO).times;
  assert.deepEqual(a, b);
});

test('bindPrayerEngine exposes daySchedule/sunnahWindows/next with bound opts', () => {
  const be = bindPrayerEngine(CAIRO);
  const s = be.daySchedule(DAY);
  assert.equal(s.date, DAY);
  const n = be.next(s.prayers.dhuhr - 1);
  assert.equal(n.name, 'dhuhr');
});
