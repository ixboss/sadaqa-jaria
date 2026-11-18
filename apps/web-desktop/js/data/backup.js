// ============================================================================
// backup.js — `.sadaqa` export / import pipeline (Phase 4, ARCHITECTURE §8).
//   export: user tables → payload groups (validator-shaped) → manifest with
//           sha-256 integrity → bytes via bridge.exportFile
//   import: bytes → validateBackup (engine) → mergePayload (engine) →
//           atomic batch apply in db-worker → backup_log row
// The engine (packages/core-data/engines/backup-*.js) owns every decision;
// this layer only maps rows↔entities and runs the bound statements.
// Legacy (v4) row uuids are remapped deterministically at export time so
// Phase-3-era rows merge cleanly (same row → same payload id, every time).
// ============================================================================
import { validateBackup, integrityMatches, SUPPORTED_FORMAT_VERSION } from '../../../../packages/core-data/engines/backup-validate.js';
import { mergePayload, toPayloadGroups } from '../../../../packages/core-data/engines/backup-merge.js';
import { uuid7, synthUuid7 } from './uuid7.js';

// ---------------------------------------------------------------------------
// row → entity mappers (camelCase payload contract, backup-validate.js)
// ---------------------------------------------------------------------------
const ENT = {
  bookmark: (r) => ({ uuid: r.uuid, type: 'bookmark', updatedAt: r.updated_at, deleted: Boolean(r.deleted), page: r.page, lineNumber: r.line_number, ayahNumber: r.ayah_number, labelAr: r.label_ar, createdAt: r.created_at }),
  highlight: (r) => ({ uuid: r.uuid, type: 'highlight', updatedAt: r.updated_at, deleted: Boolean(r.deleted), ayahNumber: r.ayah_number, wordStart: r.word_start, wordEnd: r.word_end, colorKey: r.color_key }),
  note: (r) => ({ uuid: r.uuid, type: 'note', updatedAt: r.updated_at, deleted: Boolean(r.deleted), ayahNumber: r.ayah_number, body: r.body, createdAt: r.created_at }),
  khatmahPlan: (r) => ({ uuid: r.uuid, type: 'khatmahPlan', updatedAt: r.updated_at, deleted: Boolean(r.deleted), nameAr: r.name_ar, mode: r.mode, startDate: r.start_date, endDate: r.end_date, dailyPages: r.daily_pages, active: Boolean(r.active), createdAt: r.created_at }),
  tasbihCounter: (r) => ({ uuid: r.uuid, type: 'tasbihCounter', updatedAt: r.updated_at, deleted: Boolean(r.deleted), labelAr: r.label_ar, dhikrText: r.dhikr_text, target: r.target, count: r.count, totalLifetime: r.total_lifetime, sortOrder: r.sort_order }),
  tasbihSession: (r) => ({ uuid: r.uuid, type: 'tasbihSession', updatedAt: r.occurred_at, counterUuid: r.counter_uuid, countDelta: r.count_delta, occurredAt: r.occurred_at }),
  // synthetic ids take the export clock (`now`) so an export is deterministic
  // and byte-stable for a fixed clock (native parity fixtures rely on it).
  setting: (r, now) => ({ uuid: synthUuid7('setting:' + r.key, now), type: 'setting', updatedAt: r.updated_at, key: r.key, value: safeParse(r.value) }),
};

const safeParse = (v) => { try { return JSON.parse(v); } catch { return v; } };

function adhkarEntity(r, now) {
  return { uuid: synthUuid7(`adhkar:${r.item_id}:${r.day_key}`, now), type: 'adhkarState', updatedAt: r.updated_at, itemId: r.item_id, dayKey: r.day_key, count: r.count, completedAt: r.completed_at };
}
function streakEntity(r, now) {
  return { uuid: synthUuid7(`streak:${r.kind}:${r.day_key}`, now), type: 'streakDay', updatedAt: r.done_at, kind: r.kind, dayKey: r.day_key };
}
/** Deterministic remap of legacy (non-v7) uuids; v7 rows pass through. */
function v7(uuid, now) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid) ? uuid : synthUuid7('row:' + uuid, now);
}

async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deviceId(db) {
  let row = await db.queryOne(`SELECT value FROM user_settings WHERE key = 'device_id'`);
  if (row) { try { return JSON.parse(row.value); } catch { /* regenerate */ } }
  const id = uuid7();
  await db.write(`INSERT INTO user_settings (key, value, updated_at) VALUES ('device_id', ?, ?)`, [JSON.stringify(id), Date.now()]);
  return id;
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------
export async function buildExportPayload(db, now = Date.now()) {
  const [bookmarks, highlights, notes, plans, adhkar, counters, sessions, streaks, settings] = await Promise.all([
    db.query(`SELECT * FROM bookmarks`),
    db.query(`SELECT * FROM highlights`),
    db.query(`SELECT * FROM notes`),
    db.query(`SELECT * FROM khatmah_plans`),
    db.query(`SELECT * FROM adhkar_state`),
    db.query(`SELECT * FROM tasbih_counters`),
    db.query(`SELECT * FROM tasbih_sessions`),
    db.query(`SELECT * FROM streak_days`),
    db.query(`SELECT * FROM user_settings WHERE key != 'device_id'`),
  ]);
  const remap = (fn) => (r) => { const e = fn(r); e.uuid = v7(e.uuid, now); return e; };
  const payload = toPayloadGroups({
    reading: [...bookmarks.map(remap(ENT.bookmark)), ...highlights.map(remap(ENT.highlight)), ...notes.map(remap(ENT.note)), ...plans.map(remap(ENT.khatmahPlan))],
    dhikr: [...adhkar.map((r) => adhkarEntity(r, now)), ...counters.map(remap(ENT.tasbihCounter)), ...sessions.map(remap(ENT.tasbihSession))],
    prefs: settings.map((r) => ENT.setting(r, now)),
    meta: streaks.map((r) => streakEntity(r, now)),
  });
  const payloadStr = JSON.stringify(payload);
  const manifest = {
    format: 'sadaqa-backup',
    formatVersion: SUPPORTED_FORMAT_VERSION,
    createdAt: now,
    deviceId: await deviceId(db),
    entities: Object.fromEntries(Object.entries(payload).map(([g, arr]) => [g, arr.length])),
    integrity: await sha256Hex(payloadStr),
  };
  return { manifest, payload, counts: manifest.entities };
}

export async function exportBackup(db, bridge, now = Date.now()) {
  const { manifest, payload, counts } = await buildExportPayload(db, now);
  const bytes = new TextEncoder().encode(JSON.stringify({ manifest, payload }));
  const name = `sadaqa-backup-${new Date(now).toISOString().slice(0, 10)}.sadaqa`;
  const picked = await bridge.exportFile(bytes, name);
  await db.write(
    `INSERT INTO backup_log (direction, mode, format_version, counts_json, created_at) VALUES ('export', NULL, ?, ?, ?)`,
    [SUPPORTED_FORMAT_VERSION, JSON.stringify(counts), now],
  );
  return { name, counts, savedToPath: picked === true };
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------
export async function importBackup(db, bytes, mode, now = Date.now()) {
  const text = new TextDecoder().decode(bytes);
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('ملف غير صالح — ليس JSON'); }
  const { manifest, payload } = file ?? {};
  const verdict = validateBackup(manifest, payload);
  if (!verdict.ok) throw new Error('فشل التحقق: ' + verdict.errors.slice(0, 3).join(' · '));
  // مطلوب قبل أي كتابة: إعادة حساب بصمة sha-256 على بايتات الملف نفسها —
  // عدم التطابق يعني تلفاً أو تلاعباً بعد التصدير، فيُرفض الملف كاملاً.
  if (!(await integrityMatches(manifest, payload))) {
    throw new Error('فشل التحقق: manifest.integrity — البصمة لا تطابق محتوى الملف (تلف أو تلاعب)');
  }

  // local snapshots for the merge engine (Maps keyed by uuid — same clock so
  // legacy-remap ids match what this device would export at the same instant)
  const local = {};
  for (const group of ['reading', 'dhikr', 'prefs', 'meta']) {
    const map = new Map();
    if (group === 'reading') {
      (await db.query(`SELECT * FROM bookmarks`)).forEach((r) => map.set(v7(r.uuid, now), { ...ENT.bookmark(r), uuid: v7(r.uuid, now) }));
      (await db.query(`SELECT * FROM highlights`)).forEach((r) => map.set(v7(r.uuid, now), { ...ENT.highlight(r), uuid: v7(r.uuid, now) }));
      (await db.query(`SELECT * FROM notes`)).forEach((r) => map.set(v7(r.uuid, now), { ...ENT.note(r), uuid: v7(r.uuid, now) }));
      (await db.query(`SELECT * FROM khatmah_plans`)).forEach((r) => map.set(v7(r.uuid, now), { ...ENT.khatmahPlan(r), uuid: v7(r.uuid, now) }));
    } else if (group === 'dhikr') {
      (await db.query(`SELECT * FROM adhkar_state`)).forEach((r) => { const e = adhkarEntity(r, now); map.set(e.uuid, e); });
      (await db.query(`SELECT * FROM tasbih_counters`)).forEach((r) => map.set(v7(r.uuid, now), { ...ENT.tasbihCounter(r), uuid: v7(r.uuid, now) }));
      (await db.query(`SELECT * FROM tasbih_sessions`)).forEach((r) => map.set(v7(r.uuid, now), { ...ENT.tasbihSession(r), uuid: v7(r.uuid, now) }));
    } else if (group === 'prefs') {
      (await db.query(`SELECT * FROM user_settings WHERE key != 'device_id'`)).forEach((r) => { const e = ENT.setting(r, now); map.set(e.uuid, e); });
    } else {
      (await db.query(`SELECT * FROM streak_days`)).forEach((r) => { const e = streakEntity(r, now); map.set(e.uuid, e); });
    }
    local[group] = map;
  }

  const { report, mutations, replaceMarker } = mergePayload(local, payload, { mode, now });
  const stmts = [];
  if (mode === 'replace') {
    // Full Replace — fixed, parameterless wipe of every backed-up table
    // (audit backup_log is device-local and survives by design).
    for (const t of ['bookmarks', 'highlights', 'notes', 'khatmah_plans', 'adhkar_state', 'tasbih_sessions', 'tasbih_counters', 'streak_days']) {
      stmts.push({ sql: `DELETE FROM ${t}` });
    }
    stmts.push({ sql: `DELETE FROM user_settings WHERE key != 'device_id'` });
  }
  for (const m of mutations) stmts.push(...entityStmts(m.entity, mode === 'replace' ? 'insert' : m.action));

  if (stmts.length > 0) await db.batch(stmts);
  await db.write(
    `INSERT INTO backup_log (direction, mode, format_version, counts_json, created_at) VALUES ('import', ?, ?, ?, ?)`,
    [mode, manifest.formatVersion, JSON.stringify(report), now],
  );
  return { report, replaceMarker, counts: verdict.counts };
}

/** One payload entity → bound upsert statements (order: parents before sessions). */
function entityStmts(e, action) {
  const del = e.deleted === true ? 1 : 0;
  switch (e.type) {
    case 'bookmark': return [{
      sql: `INSERT INTO bookmarks (uuid, page, line_number, ayah_number, label_ar, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uuid) DO UPDATE SET page = excluded.page, line_number = excluded.line_number, ayah_number = excluded.ayah_number, label_ar = excluded.label_ar, updated_at = excluded.updated_at, deleted = excluded.deleted`,
      params: [e.uuid, e.page, e.lineNumber ?? 1, e.ayahNumber ?? null, e.labelAr ?? null, e.createdAt ?? e.updatedAt, e.updatedAt, del],
    }];
    case 'highlight': return [{
      sql: `INSERT INTO highlights (uuid, ayah_number, word_start, word_end, color_key, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uuid) DO UPDATE SET ayah_number = excluded.ayah_number, word_start = excluded.word_start, word_end = excluded.word_end, color_key = excluded.color_key, updated_at = excluded.updated_at, deleted = excluded.deleted`,
      params: [e.uuid, e.ayahNumber, e.wordStart, e.wordEnd, e.colorKey, e.updatedAt, del],
    }];
    case 'note': return [{
      sql: `INSERT INTO notes (uuid, ayah_number, body, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(uuid) DO UPDATE SET ayah_number = excluded.ayah_number, body = excluded.body, updated_at = excluded.updated_at, deleted = excluded.deleted`,
      params: [e.uuid, e.ayahNumber ?? null, e.body, e.createdAt ?? e.updatedAt, e.updatedAt, del],
    }];
    case 'khatmahPlan': return [{
      sql: `INSERT INTO khatmah_plans (uuid, name_ar, mode, start_date, end_date, daily_pages, active, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uuid) DO UPDATE SET name_ar = excluded.name_ar, mode = excluded.mode, start_date = excluded.start_date, end_date = excluded.end_date, daily_pages = excluded.daily_pages, active = excluded.active, updated_at = excluded.updated_at, deleted = excluded.deleted`,
      params: [e.uuid, e.nameAr ?? 'ختمتي', e.mode, e.startDate, e.endDate ?? null, e.dailyPages ?? null, e.active === false ? 0 : 1, e.createdAt ?? e.updatedAt, e.updatedAt, del],
    }];
    case 'tasbihCounter': return [{
      sql: `INSERT INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uuid) DO UPDATE SET label_ar = excluded.label_ar, dhikr_text = excluded.dhikr_text, target = excluded.target, count = excluded.count, total_lifetime = excluded.total_lifetime, sort_order = excluded.sort_order, updated_at = excluded.updated_at, deleted = excluded.deleted`,
      params: [e.uuid, e.labelAr ?? 'ورد', e.dhikrText, e.target ?? null, e.count ?? 0, e.totalLifetime ?? 0, e.sortOrder ?? 0, e.updatedAt, del],
    }];
    case 'tasbihSession': return [{
      sql: `INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(uuid) DO UPDATE SET count_delta = excluded.count_delta, occurred_at = excluded.occurred_at`,
      params: [e.uuid, e.counterUuid, e.countDelta, e.occurredAt],
    }];
    case 'adhkarState': return [{
      sql: `INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at, updated_at = excluded.updated_at`,
      params: [e.itemId, e.dayKey, e.count ?? 0, e.completedAt ?? null, e.updatedAt],
    }];
    case 'streakDay': return [{
      sql: `INSERT OR REPLACE INTO streak_days (kind, day_key, done_at) VALUES (?, ?, ?)`,
      params: [e.kind, e.dayKey, e.updatedAt],
    }];
    case 'setting': return [{
      sql: `INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      params: [e.key, JSON.stringify(e.value ?? null), e.updatedAt],
    }];
    default: throw new Error(`unsupported entity type: ${e.type}`);
  }
}

/** For the UI confirm sheet: parse + validate + counts WITHOUT importing. */
export async function peekBackup(bytes) {
  const text = new TextDecoder().decode(bytes);
  const file = JSON.parse(text);
  const verdict = validateBackup(file.manifest, file.payload);
  const integrityOk = await integrityMatches(file.manifest, file.payload);
  return {
    ok: verdict.ok && integrityOk,
    errors: [...(verdict.errors ?? []), ...(integrityOk ? [] : ['manifest.integrity — البصمة لا تطابق محتوى الملف'])],
    counts: verdict.counts ?? {},
    manifest: file.manifest,
  };
}
