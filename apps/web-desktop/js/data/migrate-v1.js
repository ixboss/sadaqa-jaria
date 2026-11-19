// ============================================================================
// migrate-v1.js — one-time v1→v2 migration (TASK_PLAN risk R-4). Reads the v1
// PWA's localStorage keys (same origin) on first v2 boot and writes the data
// into SQLite through the normal bound-write channel. Idempotent: guarded by
// the `v1_migrated` setting; never destructures v1 state blindly — every key
// is type-checked before use. v1 khatmah/app_state shape is NOT auto-imported
// (documented: export a v1 backup and re-add khatmah manually — model differs).
// ============================================================================
import { state, saveSetting } from '../app-state.js';
import { uuid7 } from './uuid7.js';

const KEYS = ['theme', 'font_scale', 'reciter', 'tasbihCount', 'tasbihLap', 'tasbih_phrase', 'tasbih_target', 'adhkar_auto_advance'];

/** Exported for e2e determinism — performs the migration, returns report. */
export async function runV1Migration(db) {
  if (typeof localStorage === 'undefined') return { migrated: false, reason: 'no localStorage' };
  const report = { migrated: true, imported: [], skipped: [] };
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const str = (v) => (typeof v === 'string' && v.length > 0 ? v : null);

  const theme = str(localStorage.getItem('theme'));
  if (theme && ['dark', 'light', 'sepia', 'night'].includes(theme)) {
    await saveSetting('theme', theme);
    report.imported.push('theme');
  }
  const font = num(localStorage.getItem('font_scale'));
  if (font && font >= 0.8 && font <= 2.5) {
    await saveSetting('font_scale', font);
    report.imported.push('font_scale');
  }
  const tasbihCount = num(localStorage.getItem('tasbihCount'));
  const tasbihLap = num(localStorage.getItem('tasbihLap'));
  const phrase = str(localStorage.getItem('tasbih_phrase'));
  const target = num(localStorage.getItem('tasbih_target'));
  if (tasbihCount !== null || phrase) {
    const count = Math.max(0, tasbihCount ?? 0);
    const uuid = uuid7();
    await db.write(
      `INSERT INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 99, ?)`,
      [uuid, 'ورد السبحة المُستورد', phrase ?? 'سبحان الله', (target && target > 0 ? target : null), count, count, Date.now()],
    );
    if (count > 0) {
      await db.write(
        `INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, ?, ?)`,
        [uuid7(), uuid, count, Date.now()],
      );
      await db.write(
        `INSERT OR REPLACE INTO streak_days (kind, day_key, done_at) VALUES ('tasbih', ?, ?)`,
        [new Intl.DateTimeFormat('en-CA').format(new Date()), Date.now()],
      );
    }
    report.imported.push(`tasbih(${count})`);
  }
  const autoAdv = localStorage.getItem('adhkar_auto_advance');
  if (autoAdv !== null) report.imported.push('adhkar_auto_advance→(v2 uses per-reader toggle)');

  await saveSetting('v1_migrated', true);
  return report;
}

/** Boot hook: runs once per install (setting guard). Never blocks boot. */
export async function maybeMigrateV1(db) {
  try {
    if (state.settings.v1_migrated) return null;
    const report = await runV1Migration(db);
    return report;
  } catch (e) {
    console.warn('[migrate-v1]', e.message);
    return null;
  }
}
