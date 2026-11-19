import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDailyProgress } from '../engines/today-progress.js';

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

  assert.equal(windows.length, 1, 'only fajr/asr/isha windows are shown');
  assert.equal(windows[0].completed, 1, 'count_target 0 → any tap completes');
});
