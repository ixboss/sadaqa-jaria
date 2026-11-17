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
  reading: ['khatmahPlan', 'bookmark', 'highlight', 'note'],
  dhikr: ['adhkarState', 'tasbihCounter', 'tasbihSession'],
  prefs: ['setting'],
  meta: ['streakDay'],
};

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
  for (const [group, entities] of Object.entries(payload)) {
    if (!BACKUP_GROUPS.includes(group)) { errors.push(`payload.${group}: unknown group (allowed: ${BACKUP_GROUPS.join(', ')})`); continue; }
    if (!Array.isArray(entities)) { errors.push(`payload.${group}: must be an array`); continue; }
    const allowed = GROUP_ENTITY_TYPES[group];
    for (const e of entities) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(`payload.${group}: entity must be an object`); continue; }
      if (!UUID_V7_RE.test(String(e.uuid ?? ''))) { errors.push(`payload.${group}[${e.uuid ?? '?'}].uuid: must be a UUIDv7`); continue; }
      if (!e.type || !allowed.includes(e.type)) { errors.push(`payload.${group}[${e.uuid}].type: must be one of ${allowed.join(', ')}`); continue; }
      if (!Number.isFinite(e.updatedAt) || e.updatedAt <= 0) { errors.push(`payload.${group}[${e.uuid}].updatedAt: must be epoch ms`); continue; }
      if (e.deleted !== undefined && typeof e.deleted !== 'boolean') { errors.push(`payload.${group}[${e.uuid}].deleted: must be boolean when present`); continue; }
      counts[group] = (counts[group] ?? 0) + 1;
      // type-specific required payload fields
      const typeErr = validateEntityBody(group, e);
      if (typeErr) errors.push(`payload.${group}[${e.uuid}]: ${typeErr}`);
    }
  }

  return errors.length === 0 ? { ok: true, counts } : { ok: false, errors };
}

function validateEntityBody(group, e) {
  switch (`${group}/${e.type}`) {
    case 'reading/bookmark':
      if (!Number.isInteger(e.page) || e.page < 1 || e.page > 604) return 'page must be 1..604';
      return null;
    case 'reading/highlight':
      if (!Number.isInteger(e.ayahNumber) || e.ayahNumber < 1 || e.ayahNumber > 6236) return 'ayahNumber must be 1..6236';
      if (!Number.isInteger(e.wordStart) || e.wordStart < 1) return 'wordStart must be >= 1';
      if (!Number.isInteger(e.wordEnd) || e.wordEnd < e.wordStart) return 'wordEnd must be >= wordStart';
      if (!['gold', 'emerald', 'rose', 'sky', 'none'].includes(e.colorKey)) return 'colorKey must be a token color key';
      return null;
    case 'reading/khatmahPlan':
      if (e.mode !== 'deadline' && e.mode !== 'rate') return 'mode must be deadline|rate';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.startDate ?? ''))) return 'startDate must be YYYY-MM-DD';
      if (e.mode === 'deadline' && !/^\d{4}-\d{2}-\d{2}$/.test(String(e.endDate ?? ''))) return 'deadline mode requires endDate YYYY-MM-DD';
      if (e.mode === 'rate' && (!Number.isInteger(e.dailyPages) || e.dailyPages < 1 || e.dailyPages > 604)) return 'rate mode requires dailyPages 1..604';
      return null;
    case 'dhikr/tasbihCounter':
      if (typeof e.dhikrText !== 'string' || e.dhikrText.length === 0) return 'dhikrText required';
      if (e.target !== null && e.target !== undefined && (!Number.isInteger(e.target) || e.target < 1)) return 'target must be >= 1 or null';
      return null;
    case 'dhikr/adhkarState':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.dayKey ?? ''))) return 'dayKey must be YYYY-MM-DD';
      if (!Number.isInteger(e.count) || e.count < 0) return 'count must be >= 0';
      return null;
    case 'prefs/setting':
      if (typeof e.key !== 'string' || e.key.length === 0) return 'key required';
      if (!('value' in e)) return 'value required (may be null)';
      return null;
    case 'meta/streakDay':
      if (!['adhkar_morning', 'adhkar_evening', 'tasbih', 'khatmah'].includes(e.kind)) return 'kind must be a streak kind';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.dayKey ?? ''))) return 'dayKey must be YYYY-MM-DD';
      return null;
    case 'dhikr/tasbihSession':
      if (!Number.isInteger(e.countDelta) || e.countDelta <= 0) return 'countDelta must be > 0';
      if (!Number.isFinite(e.occurredAt) || e.occurredAt <= 0) return 'occurredAt must be epoch ms';
      return null;
    case 'reading/note':
      if (typeof e.body !== 'string') return 'body must be a string';
      return null;
    default:
      return null;
  }
}
