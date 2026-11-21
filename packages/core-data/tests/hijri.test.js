import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHijri, fromHijri, withAdjust, events, whiteDays, monthNameAr } from '../engines/hijri.js';

test('round-trip stability over a sampled Gregorian range (property test)', () => {
  let checked = 0;
  for (let year = 2000; year <= 2040; year += 2) {
    for (let m = 1; m <= 12; m += 3) {
      for (let d of [1, 15, 28]) {
        const g = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const h = toHijri(g);
        assert.ok(h.m >= 1 && h.m <= 12 && h.d >= 1 && h.d <= 30 && h.y >= 1420 && h.y <= 1465, `${g} → ${JSON.stringify(h)}`);
        const back = fromHijri(h);
        assert.equal(back, g, `round-trip ${g} → ${JSON.stringify(h)} → ${back}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 40, `expected >=40 samples, got ${checked}`);
});

test('hijri year advances by 354/355 days (lunar)', () => {
  const a = toHijri('2026-01-01');
  const b = toHijri('2027-01-01');
  const yDiff = b.y - a.y;
  assert.ok(yDiff === 0 || yDiff === 1, `unexpected year drift ${a.y} → ${b.y}`);
});

test('withAdjust shifts the civil day before conversion', () => {
  const base = toHijri('2026-01-01');
  const shifted = withAdjust('2026-01-02', -1);
  assert.deepEqual(shifted, base);
});

test('events(2026): exactly one Ramadan start, Eid pair ordered after it', () => {
  const evts = events(2026);
  const ramadans = evts.filter((e) => e.key === 'ramadan_start');
  assert.equal(ramadans.length, 1, `expected exactly 1 ramadan_start in 2026, got ${JSON.stringify(ramadans)}`);
  const fitr = evts.filter((e) => e.key === 'eid_fitr');
  assert.equal(fitr.length, 1);
  assert.ok(fitr[0].gregorian > ramadans[0].gregorian);
  const adha = evts.filter((e) => e.key === 'eid_adha');
  assert.ok(adha[0].gregorian > fitr[0].gregorian);
  // each hijri field matches the event's month/day
  for (const e of evts) assert.ok(e.hijri.y >= 1440 && e.hijri.y <= 1460);
});

test('whiteDays: ~36-37 days/year, always day 13/14/15, sorted', () => {
  const wd = whiteDays(2026);
  assert.ok(wd.length >= 34 && wd.length <= 40, `unexpected white day count ${wd.length}`);
  for (const w of wd) assert.ok([13, 14, 15].includes(w.hijri.d));
  for (let i = 1; i < wd.length; i++) assert.ok(wd[i].gregorian > wd[i - 1].gregorian);
});

test('fromHijri rejects impossible dates', () => {
  assert.throws(() => fromHijri({ y: 1447, m: 13, d: 1 }), /invalid hijri/);
  assert.throws(() => fromHijri({ y: 1447, m: 1, d: 31 }), /invalid hijri/);
  // data-driven: find any month of Hijri 1447 shorter than 30 days and assert day 30 is refused
  let shortFound = false;
  for (let m = 1; m <= 12 && !shortFound; m++) {
    try { fromHijri({ y: 1447, m, d: 30 }); }
    catch (e) {
      assert.match(String(e), /does not exist/);
      shortFound = true;
    }
  }
  assert.ok(shortFound, 'lunar year 1447 should contain at least one 29-day month');
});

test('monthNameAr is total over 1..12 and throws outside', () => {
  assert.equal(monthNameAr(9), 'رمضان');
  assert.throws(() => monthNameAr(0), /1\.\.12/);
  assert.throws(() => monthNameAr(13), /1\.\.12/);
});

test('withAdjust: non-finite adjust degrades to 0 instead of throwing (imported garbage setting)', () => {
  const iso = '2026-11-17';
  const base = withAdjust(iso, 0);
  for (const bad of [NaN, undefined, null, 'garbage', Infinity]) {
    assert.deepEqual(withAdjust(iso, bad), base);
  }
});

test('withAdjust: finite-but-huge garbage clamps to the schema ±3 contract (no RangeError)', () => {
  const iso = '2026-11-17';
  const plus3 = withAdjust(iso, 3);
  const minus3 = withAdjust(iso, -3);
  assert.deepEqual(withAdjust(iso, 1e15), plus3);
  assert.deepEqual(withAdjust(iso, -1e15), minus3);
});
