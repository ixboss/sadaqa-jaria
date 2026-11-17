// ============================================================================
// app-state.js — tiny observable app state: settings (user_settings), current
// mushaf position (user_progress singleton), haptics from design tokens.
// Every write is a prepared statement through the db proxy.
// ============================================================================
import { bindPrayerEngine } from '../../../packages/core-data/engines/prayer.js';

export const state = {
  bridge: null,
  db: null,
  settings: {},
  progress: { page: 1, line_number: 1 },
  ready: false,
};

const SETTINGS_DEFAULTS = {
  theme: 'dark',
  font_scale: 1.3,
  calc_method: 'umm_al_qura',
  madhab: 'shafi',
  high_latitude_rule: 'middle_of_the_night',
  reciter: null,
  numeral_style: 'arabic_indic',
  hijri_adjust: 0,
  location: { lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh', name_ar: 'مكة المكرمة' },
  nisab_standard: 'silver', // الأكثر احتياطاً للمسك
  zakat_inputs: null,
  v1_migrated: false,
};

export async function loadState(db) {
  state.db = db;
  const rows = await db.query(`SELECT key, value FROM user_settings`);
  state.settings = { ...SETTINGS_DEFAULTS };
  for (const r of rows) {
    try { state.settings[r.key] = JSON.parse(r.value); } catch { state.settings[r.key] = r.value; }
  }
  const p = await db.queryOne(`SELECT page, line_number FROM user_progress WHERE uuid = 'resume'`);
  state.progress = p ? { page: p.page, line_number: p.line_number } : { page: 1, line_number: 1 };
  state.ready = true;
}

export async function saveSetting(key, value) {
  state.settings[key] = value;
  return callWrite(`INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [key, JSON.stringify(value), Date.now()]);
}

let _write = null;
export function registerWrite(fn) { _write = fn; }
async function callWrite(sql, params) {
  if (!_write) throw new Error('db write channel not registered');
  return _write(sql, params);
}

export async function saveProgress(page, line = 1) {
  state.progress = { page, line_number: line };
  await callWrite(`INSERT INTO user_progress (uuid, page, line_number, updated_at) VALUES ('resume', ?, ?, ?)
    ON CONFLICT(uuid) DO UPDATE SET page = excluded.page, line_number = excluded.line_number, updated_at = excluded.updated_at`, [page, line, Date.now()]);
}

/** Bound prayer engine from current settings (Today screen + reminders). */
export function prayerEngineForSettings() {
  const s = state.settings;
  const loc = s.location ?? { lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh' };
  return bindPrayerEngine({ lat: loc.lat, lng: loc.lng, timeZone: loc.tz, method: s.calc_method, madhab: s.madhab, highLatitudeRule: s.high_latitude_rule });
}

/** Test/e2e hook: deterministic clock override (null = real time). */
export function nowMs() {
  return typeof state.clockOverride === 'function' ? state.clockOverride() : Date.now();
}

/** Haptics patterns from design tokens (REA_SPEC §4.1 table). */
export const HAPTICS = {
  dhikrTick: [10],
  dhikrComplete: [20, 60, 20, 60, 40],
  categoryComplete: [40, 120, 40, 120, 40],
  pageFlipSettle: [15],
  bookmarkSaved: [25, 60, 25],
};
export function haptic(pattern) {
  state.bridge?.haptic?.(pattern);
}
