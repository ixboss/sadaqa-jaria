// ============================================================================
// today-progress.js — ورد اليوم daily progress aggregation (Today screen)
// ---------------------------------------------------------------------------
// Shared golden logic for ALL FOUR targets: the web Today card renders this
// directly; the iOS (AthkarProgress.swift) and Android (TodayProgress.kt)
// ports mirror it 1:1 — pure, no DB access, no clock reads, no DOM.
//
// Inputs mirror the DB row shapes (adhkar_state rows must already be filtered
// to the caller's day_key):
//   categories: [{ category_id, solar_window }]
//   items:      [{ item_id, category_id, count_target }]
//   states:     [{ item_id, count }]
// Completion rule (matches AthkarReaderView / athkar.js): count >= count_target,
// or any tap when count_target is 0.
// ============================================================================

const WINDOWS = [
  { keys: ['fajr'], titleAr: 'الصباح' },
  { keys: ['asr'], titleAr: 'المساء' },
  // Schema (schema.sql:220) uses 'night' for Sleep Adhkar; retain legacy 'isha' alias.
  { keys: ['night', 'isha'], titleAr: 'النوم' },
];

export function computeDailyProgress(categories, items, states) {
  const windowOf = new Map();
  for (const c of categories) {
    if (c.solar_window) windowOf.set(c.category_id, c.solar_window);
  }
  const itemById = new Map();
  for (const it of items) itemById.set(it.item_id, it);

  const done = new Set();
  for (const s of states) {
    const item = itemById.get(s.item_id);
    if (!item) continue;
    const complete = item.count_target > 0 ? s.count >= item.count_target : s.count > 0;
    if (complete) done.add(s.item_id);
  }
  const windows = WINDOWS
    .map(({ keys, titleAr }) => {
      const windowItems = items.filter((it) => keys.includes(windowOf.get(it.category_id)));
      return {
        titleAr,
        completed: windowItems.filter((it) => done.has(it.item_id)).length,
        total: windowItems.length,
      };
    })
    .filter((w) => w.total > 0); // never show an empty window row
  return { windows };
}
