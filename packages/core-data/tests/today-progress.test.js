import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDailyProgress } from '../engines/today-progress.js';
import { bindPrayerEngine } from '../engines/prayer.js';
import { resolveSmartCard } from '../engines/smart-card.js';

// Fixtures mirror the DB row shapes: athkar_categories / athkar_items /
// adhkar_state (day_key already filtered by the caller).
const cat = (id, solarWindow) => ({ category_id: id, solar_window: solarWindow });
const item = (id, categoryId, countTarget) => ({ item_id: id, category_id: categoryId, count_target: countTarget });
const st = (itemId, count) => ({ item_id: itemId, count });

test('ورد اليوم — windows aggregate completed/target counts in fixed order', () => {
  const categories = [cat('c1', 'fajr'), cat('c2', 'asr'), cat('c3', 'isha')];
  const items = [item('i10', 'c1', 10), item('i11', 'c1', 7), item('i20', 'c2', 5), item('i30', 'c3', 4)];
  const states = [st('i10', 10), st('i11', 3), st('i20', 5)];
  const { windows } = computeDailyProgress(categories, items, states);

  assert.equal(windows.length, 3);
  assert.deepEqual(windows.map((w) => w.titleAr), ['الصباح', 'المساء', 'النوم']);
  assert.deepEqual(windows[0], { titleAr: 'الصباح', completed: 1, total: 2 }, 'i10 done (count==target), i11 3/7 not');
  assert.deepEqual(windows[1], { titleAr: 'المساء', completed: 1, total: 1 });
  assert.deepEqual(windows[2], { titleAr: 'النوم', completed: 0, total: 1 }, 'i30 has no state row yet');
});

test('unknown solar windows are dropped; target 0 completes on any tap', () => {
  const categories = [cat('c1', 'isha'), cat('c9', 'noon')];
  const items = [item('i10', 'c1', 0), item('i90', 'c9', 2)];
  const states = [st('i10', 2), st('i90', 2)];
  const { windows } = computeDailyProgress(categories, items, states);

  assert.equal(windows.length, 1, 'only fajr/asr/night(isha) windows are shown');
  assert.equal(windows[0].completed, 1, 'count_target 0 → any tap completes');
});

test('ورد اليوم — schema solar_window="night" maps to النوم (Sleep Adhkar)', () => {
  const categories = [cat('c1', 'fajr'), cat('c2', 'asr'), cat('c3', 'night')];
  const items = [item('i10', 'c1', 1), item('i20', 'c2', 1), item('i30', 'c3', 3), item('i31', 'c3', 1)];
  const states = [st('i30', 3)];
  const { windows } = computeDailyProgress(categories, items, states);

  assert.deepEqual(windows.map((w) => w.titleAr), ['الصباح', 'المساء', 'النوم']);
  assert.deepEqual(windows[2], { titleAr: 'النوم', completed: 1, total: 2 });
});

test('resolveSmartCard triggers Sleep Adhkar ("night") after Isha post-prayer window until last third', () => {
  const eng = bindPrayerEngine({ lat: 21.4225, lng: 39.8262, timeZone: 'Asia/Riyadh', method: 'umm_al_qura' });
  const sched = eng.daySchedule('2026-11-17');
  const win = eng.sunnahWindows('2026-11-17');
  // 45 min after Isha → past ±20m after_prayer window, before lastThird
  const nightCard = resolveSmartCard(sched.prayers.isha + 45 * 60_000, eng);
  assert.equal(nightCard.kind, 'night');
  assert.equal(nightCard.action.args.id, 'night');

  // Inside lastThird → qiyam with 12-hour ASCII clock string (no 24h, no U+202F)
  const qiyamCard = resolveSmartCard(win.lastThird + 5 * 60_000, eng);
  assert.equal(qiyamCard.kind, 'qiyam');
  assert.match(qiyamCard.sub, /\b(1[0-2]|[1-9]):[0-5]\d (AM|PM)\b/);
  assert.ok(!qiyamCard.sub.includes('\u202F'));

  // Mid-day fallback next_prayer uses 12-hour ASCII clock
  const nextCard = resolveSmartCard(sched.prayers.dhuhr + 45 * 60_000, eng);
  assert.equal(nextCard.kind, 'next_prayer');
  assert.match(nextCard.title, /\b(1[0-2]|[1-9]):[0-5]\d (AM|PM)\b/);
});
