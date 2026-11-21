// ============================================================================
// backup-validate.js — `.sadaqa` payload validator (ARCHITECTURE.md §8.2)
// Zero-dependency structural validator for formatVersion 1. Runs BEFORE any
// write occurs; an invalid file is refused with a reason list, never
// partially imported. formatVersion > SUPPORTED is refused with an upgrade hint.
// ============================================================================

export const SUPPORTED_FORMAT_VERSION = 1;
export const BACKUP_GROUPS = ['reading', 'dhikr', 'prefs', 'meta'];

/** Which entity types may appear under each group (ARCHITECTURE §8.2 table). */
export const GROUP_ENTITY_TYPES = {
  reading: ['khatmahPlan', 'khatmahPageLog', 'bookmark', 'highlight', 'note'],
  dhikr: ['adhkarState', 'tasbihCounter', 'tasbihSession'],
  prefs: ['setting'],
  meta: ['streakDay'],
};

/** حد أقصى لعدد الكيانات في الملف — منع استنزاف الذاكرة/الوقت بملف مزيّف (audit 2026-11). */
export const MAX_ENTITIES = 50_000;
/** حدود طول النصوص المستوردة (تُعرض لاحقاً في DOM/تُخزَّن كما هي). */
export const TEXT_LIMITS = { bookmarkLabel: 200, counterLabel: 120, planName: 120, noteBody: 10_000, settingKey: 64, locationName: 120, settingValueBytes: 32_768 };

const ALLOWED_PRAYER_KEYS = new Set(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);
const ALLOWED_CALC_METHODS = new Set([
  'muslim_world_league', 'egyptian', 'umm_al_qura', 'karachi', 'moonsighting',
  'north_america', 'dubai', 'kuwait', 'qatar', 'singapore', 'turkey', 'tehran',
]);
const ALLOWED_MADHABS = new Set(['shafi', 'hanafi']);
const ALLOWED_HIGH_LAT_RULES = new Set(['middle_of_the_night', 'seventh_of_the_night', 'twilight_angle']);
const ALLOWED_THEMES = new Set(['dark', 'light', 'sepia', 'night']);
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function hasUnsafeSettingValue(v, depth = 0) {
  if (depth > 8) return 'setting value exceeds max nesting depth';
  if (typeof v === 'number' && !Number.isFinite(v)) return 'setting value contains non-finite number';
  if (v && typeof v === 'object') {
    if (Array.isArray(v)) {
      for (const item of v) {
        const err = hasUnsafeSettingValue(item, depth + 1);
        if (err) return err;
      }
      return null;
    }
    for (const k of Object.keys(v)) {
      if (DANGEROUS_KEYS.has(k)) return 'setting value contains dangerous object key';
      const err = hasUnsafeSettingValue(v[k], depth + 1);
      if (err) return err;
    }
  }
  return null;
}

function validateSettingValue(key, value) {
  if (value === null) return null;
  const unsafe = hasUnsafeSettingValue(value);
  if (unsafe) return unsafe;
  try {
    const serialized = JSON.stringify(value);
    if (serialized && serialized.length > TEXT_LIMITS.settingValueBytes) {
      return `setting value exceeds ${TEXT_LIMITS.settingValueBytes} chars`;
    }
  } catch {
    return 'setting value is not JSON-serializable';
  }
  switch (key) {
    case 'hijri_adjust':
      if (!Number.isInteger(value) || value < -3 || value > 3) return 'hijri_adjust must be an integer in -3..3';
      return null;
    case 'prayer_offsets': {
      if (typeof value !== 'object' || Array.isArray(value)) return 'prayer_offsets must be an object';
      for (const [k, v] of Object.entries(value)) {
        if (!ALLOWED_PRAYER_KEYS.has(k)) return `prayer_offsets contains unknown prayer: ${k}`;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < -60 || v > 60) {
          return `prayer_offsets.${k} must be a finite number in -60..60`;
        }
      }
      return null;
    }
    case 'location': {
      if (typeof value !== 'object' || Array.isArray(value)) return 'location must be an object';
      if (typeof value.lat !== 'number' || !Number.isFinite(value.lat) || value.lat < -90 || value.lat > 90) {
        return 'location.lat must be a finite number in -90..90';
      }
      if (typeof value.lng !== 'number' || !Number.isFinite(value.lng) || value.lng < -180 || value.lng > 180) {
        return 'location.lng must be a finite number in -180..180';
      }
      const tz = value.timeZone ?? value.tz;
      if (tz !== undefined && tz !== null) {
        if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return 'location.tz must be a non-empty string <= 64 chars';
        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return `location.tz is not a valid IANA timezone: ${tz}`; }
      }
      if (value.name_ar !== undefined && value.name_ar !== null) {
        if (typeof value.name_ar !== 'string' || value.name_ar.length > TEXT_LIMITS.locationName) {
          return `location.name_ar must be a string <= ${TEXT_LIMITS.locationName} chars`;
        }
      }
      if (value.gps !== undefined && value.gps !== null) {
        if (typeof value.gps !== 'object' || Array.isArray(value.gps)) return 'location.gps must be an object';
        if (typeof value.gps.lat !== 'number' || !Number.isFinite(value.gps.lat) || value.gps.lat < -90 || value.gps.lat > 90) {
          return 'location.gps.lat must be a finite number in -90..90';
        }
        if (typeof value.gps.lng !== 'number' || !Number.isFinite(value.gps.lng) || value.gps.lng < -180 || value.gps.lng > 180) {
          return 'location.gps.lng must be a finite number in -180..180';
        }
      }
      return null;
    }
    case 'calc_method':
      if (typeof value !== 'string' || !ALLOWED_CALC_METHODS.has(value)) return 'calc_method must be a supported method';
      return null;
    case 'madhab':
      if (typeof value !== 'string' || !ALLOWED_MADHABS.has(value)) return 'madhab must be shafi|hanafi';
      return null;
    case 'high_latitude_rule':
      if (typeof value !== 'string' || !ALLOWED_HIGH_LAT_RULES.has(value)) return 'high_latitude_rule must be a supported rule';
      return null;
    case 'theme':
      if (typeof value !== 'string' || !ALLOWED_THEMES.has(value)) return 'theme must be dark|light|sepia|night';
      return null;
    case 'font_scale':
    case 'mushaf_scale':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.5 || value > 3) return `${key} must be a finite number in 0.5..3`;
      return null;
    default:
      return null;
  }
}

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * validateBackup(manifest, payload) → { ok: true, counts } |
 *                                        { ok: false, errors: string[] }
 * manifest: { format, formatVersion, createdAt, deviceId, entities, integrity }
 */
export function validateBackup(manifest, payload) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return { ok: false, errors: ['manifest: must be an object'] };
  if (manifest.format !== 'sadaqa-backup') errors.push('manifest.format: must be "sadaqa-backup"');
  if (!Number.isInteger(manifest.formatVersion)) errors.push('manifest.formatVersion: must be an integer');
  else if (manifest.formatVersion > SUPPORTED_FORMAT_VERSION) errors.push(`manifest.formatVersion ${manifest.formatVersion} is newer than supported ${SUPPORTED_FORMAT_VERSION} — upgrade the app, then re-import`);
  else if (manifest.formatVersion < 1) errors.push('manifest.formatVersion: must be >= 1');
  if (!Number.isFinite(manifest.createdAt) || manifest.createdAt <= 0) errors.push('manifest.createdAt: must be epoch ms');
  if (typeof manifest.deviceId !== 'string' || manifest.deviceId.length < 8) errors.push('manifest.deviceId: must be a string (>= 8 chars)');
  if (!manifest.integrity || typeof manifest.integrity !== 'string' || manifest.integrity.length !== 64) errors.push('manifest.integrity: must be a sha-256 hex digest of payload.json');

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: [...errors, 'payload: must be an object'] };
  }

  /** @type {Record<string, number>} */
  const counts = {};
  let totalEntities = 0;
  // خُطة الملف نفسها — تُفحص هنا كي لا يُدرَج سجل صفحة بلا أب فتنفجر قيود FK
  // على الأهداف الأصلية بينما يُدخلها الويب يتيمة (تطابق عبر الأهداف، review 2026-11)
  const planUuids = new Set((Array.isArray(payload.reading) ? payload.reading : [])
    .filter((e) => e && typeof e === 'object' && e.type === 'khatmahPlan' && typeof e.uuid === 'string')
    .map((e) => e.uuid));
  for (const [group, entities] of Object.entries(payload)) {
    if (!BACKUP_GROUPS.includes(group)) { errors.push(`payload.${group}: unknown group (allowed: ${BACKUP_GROUPS.join(', ')})`); continue; }
    if (!Array.isArray(entities)) { errors.push(`payload.${group}: must be an array`); continue; }
    totalEntities += entities.length;
    const allowed = GROUP_ENTITY_TYPES[group];
    for (const e of entities) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(`payload.${group}: entity must be an object`); continue; }
      if (!UUID_V7_RE.test(String(e.uuid ?? ''))) { errors.push(`payload.${group}[${e.uuid ?? '?'}].uuid: must be a UUIDv7`); continue; }
      if (!e.type || !allowed.includes(e.type)) { errors.push(`payload.${group}[${e.uuid}].type: must be one of ${allowed.join(', ')}`); continue; }
      if (!Number.isFinite(e.updatedAt) || e.updatedAt <= 0) { errors.push(`payload.${group}[${e.uuid}].updatedAt: must be epoch ms`); continue; }
      // حد زمني مستقبلي: طابع 1e308 كان يتفوق على كل الصفوف المحلية في الدمج
      // فيرجّع البيانات طواعية (audit 2026-11)
      if (e.updatedAt > Date.now() + 2 * 86_400_000) { errors.push(`payload.${group}[${e.uuid}].updatedAt: too far in the future`); continue; }
      if (e.deleted !== undefined && typeof e.deleted !== 'boolean') { errors.push(`payload.${group}[${e.uuid}].deleted: must be boolean when present`); continue; }
      counts[group] = (counts[group] ?? 0) + 1;
      // type-specific required payload fields
      const typeErr = validateEntityBody(group, e, planUuids);
      if (typeErr) errors.push(`payload.${group}[${e.uuid}]: ${typeErr}`);
    }
  }

  if (totalEntities > MAX_ENTITIES) errors.push(`payload: ${totalEntities} entities exceeds the ${MAX_ENTITIES} cap`);

  return errors.length === 0 ? { ok: true, counts } : { ok: false, errors };
}

// ---------------------------------------------------------------------------
// integrity — manifest.integrity is REQUIRED and is now actually verified on
// import (it was computed at export and never recomputed before 2026-11).
// Contract: digest = sha-256 over the payload's exact serialized bytes.
//   JS export/import hash `JSON.stringify(payload)` — parse→stringify is
//   order-stable, so the file's payload bytes are reproduced exactly.
//   Native mirrors (BackupCodec.kt / BackupCodec.swift) hash their canonical
//   serializers' output — byte-identical to the web exporter for files any
//   target produced (groups in priority order, entity keys recursively sorted).
// ---------------------------------------------------------------------------

/** sha-256 hex digest of a UTF-8 string (crypto.subtle — worker/window/node). */
export async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * integrityMatches(manifest, payload) → boolean.
 * Recomputes the digest over the payload's bytes and compares with
 * manifest.integrity. A mismatch means the payload was corrupted or tampered
 * with after export — callers must refuse the whole file BEFORE any write.
 */
export async function integrityMatches(manifest, payload) {
  if (!manifest || typeof manifest.integrity !== 'string' || manifest.integrity.length !== 64) return false;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  try {
    return manifest.integrity === (await sha256Hex(JSON.stringify(payload)));
  } catch {
    return false;
  }
}

function validateEntityBody(group, e, planUuids = new Set()) {
  switch (`${group}/${e.type}`) {
    case 'reading/bookmark':
      if (!Number.isInteger(e.page) || e.page < 1 || e.page > 604) return 'page must be 1..604';
      if (e.labelAr !== undefined && e.labelAr !== null && (typeof e.labelAr !== 'string' || e.labelAr.length > TEXT_LIMITS.bookmarkLabel)) return `labelAr must be a string <= ${TEXT_LIMITS.bookmarkLabel} chars`;
      return null;
    case 'reading/highlight':
      if (!Number.isInteger(e.ayahNumber) || e.ayahNumber < 1 || e.ayahNumber > 6236) return 'ayahNumber must be 1..6236';
      if (!Number.isInteger(e.wordStart) || e.wordStart < 1) return 'wordStart must be >= 1';
      if (!Number.isInteger(e.wordEnd) || e.wordEnd < e.wordStart) return 'wordEnd must be >= wordStart';
      if (!['gold', 'emerald', 'rose', 'sky', 'none'].includes(e.colorKey)) return 'colorKey must be a token color key';
      return null;
    case 'reading/khatmahPlan':
      // null يُقبل كمفقود (تطابق منافذ Kotlin/Swift — review 2026-11)
      if (e.nameAr !== undefined && e.nameAr !== null && (typeof e.nameAr !== 'string' || e.nameAr.length > TEXT_LIMITS.planName)) return `nameAr must be a string <= ${TEXT_LIMITS.planName} chars`;
      if (e.mode !== 'deadline' && e.mode !== 'rate') return 'mode must be deadline|rate';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.startDate ?? ''))) return 'startDate must be YYYY-MM-DD';
      if (e.mode === 'deadline' && !/^\d{4}-\d{2}-\d{2}$/.test(String(e.endDate ?? ''))) return 'deadline mode requires endDate YYYY-MM-DD';
      if (e.mode === 'rate' && (!Number.isInteger(e.dailyPages) || e.dailyPages < 1 || e.dailyPages > 604)) return 'rate mode requires dailyPages 1..604';
      return null;
    case 'dhikr/tasbihCounter':
      if (typeof e.dhikrText !== 'string' || e.dhikrText.length === 0) return 'dhikrText required';
      if (e.labelAr !== undefined && e.labelAr !== null && (typeof e.labelAr !== 'string' || e.labelAr.length > TEXT_LIMITS.counterLabel)) return `labelAr must be a string <= ${TEXT_LIMITS.counterLabel} chars`;
      if (e.target !== null && e.target !== undefined && (!Number.isInteger(e.target) || e.target < 1)) return 'target must be >= 1 or null';
      return null;
    case 'dhikr/adhkarState':
      if (typeof e.itemId !== 'string' || e.itemId.length === 0) return 'itemId required';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.dayKey ?? ''))) return 'dayKey must be YYYY-MM-DD';
      if (!Number.isInteger(e.count) || e.count < 0) return 'count must be >= 0';
      return null;
    case 'prefs/setting':
      if (typeof e.key !== 'string' || e.key.length === 0) return 'key required';
      if (e.key.length > TEXT_LIMITS.settingKey) return `key must be <= ${TEXT_LIMITS.settingKey} chars`;
      if (DANGEROUS_KEYS.has(e.key)) return 'key must not be a dangerous object-literal key';
      if (!('value' in e)) return 'value required (may be null)';
      return validateSettingValue(e.key, e.value);
    case 'meta/streakDay':
      if (!['adhkar_morning', 'adhkar_evening', 'tasbih', 'khatmah'].includes(e.kind)) return 'kind must be a streak kind';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.dayKey ?? ''))) return 'dayKey must be YYYY-MM-DD';
      return null;
    case 'dhikr/tasbihSession':
      if (typeof e.counterUuid !== 'string' || e.counterUuid.length < 8) return 'counterUuid required';
      if (!Number.isInteger(e.countDelta) || e.countDelta <= 0 || e.countDelta > 1_000_000) return 'countDelta must be 1..1000000';
      if (!Number.isFinite(e.occurredAt) || e.occurredAt <= 0) return 'occurredAt must be epoch ms';
      return null;
    case 'reading/note':
      if (typeof e.body !== 'string') return 'body must be a string';
      if (e.body.length > TEXT_LIMITS.noteBody) return `body must be <= ${TEXT_LIMITS.noteBody} chars`;
      return null;
    case 'reading/khatmahPageLog':
      // سجل تقدم الختمة: مفتاح طبيعي (plan_uuid, page) — الـ uuid مُصنَّع حتمياً
      // من المفتاح عند التصدير (synthUuid7) فتميز جداول السحب/الدمج.
      if (typeof e.planUuid !== 'string' || e.planUuid.length < 8) return 'planUuid required';
      // الأب يجب أن يكون داخل الملف نفسه (خطة محذوفة قبراً تحتسب — ما يمنع
      // سجلاً يتيمة ينفجر FK على Android/iOS/Electron بينما يمرّ على الويب)
      if (!planUuids.has(e.planUuid)) return 'planUuid must reference a khatmahPlan in this backup';
      if (!Number.isInteger(e.page) || e.page < 1 || e.page > 604) return 'page must be 1..604';
      if (!Number.isInteger(e.completedAt) || e.completedAt <= 0) return 'completedAt must be epoch ms';
      return null;
    default:
      return null;
  }
}
