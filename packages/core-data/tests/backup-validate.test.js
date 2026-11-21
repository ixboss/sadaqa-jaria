// backup-validate.test.js — .sadaqa payload validator (formatVersion 1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, integrityMatches, sha256Hex, SUPPORTED_FORMAT_VERSION, BACKUP_GROUPS } from '../engines/backup-validate.js';

const SHA = 'a'.repeat(64);
const manifest = (over = {}) => ({
  format: 'sadaqa-backup',
  formatVersion: 1,
  createdAt: 1_700_000_000_000,
  deviceId: 'device-0001',
  entities: {},
  integrity: SHA,
  ...over,
});
const VALID = {
  uuid: '01935a10-7c3f-7abc-9d5e-3f2b1c4d5e6f', // v7-shaped
  type: 'bookmark',
  updatedAt: 1_700_000_000_000,
  page: 42,
};

test('valid minimal backup passes with counts', () => {
  const r = validateBackup(manifest(), { reading: [{ ...VALID }] });
  assert.deepEqual(r, { ok: true, counts: { reading: 1 } });
});

test('empty payload passes', () => {
  assert.equal(validateBackup(manifest(), {}).ok, true);
});

const badCases = [
  ['wrong format string', manifest({ format: 'sadaqa' }), {}, /format: must be/],
  ['formatVersion missing', manifest({ formatVersion: undefined }), {}, /formatVersion: must be an integer/],
  ['formatVersion too new', manifest({ formatVersion: SUPPORTED_FORMAT_VERSION + 1 }), {}, /newer than supported/],
  ['formatVersion 0', manifest({ formatVersion: 0 }), {}, /must be >= 1/],
  ['bad createdAt', manifest({ createdAt: -5 }), {}, /createdAt/],
  ['short deviceId', manifest({ deviceId: 'x' }), {}, /deviceId/],
  ['integrity not sha-256', manifest({ integrity: 'abc' }), {}, /integrity/],
  ['payload is array', manifest(), [1, 2], /payload: must be an object/],
  ['unknown group', manifest(), { junk: [] }, /unknown group/],
  ['group not array', manifest(), { reading: 'x' }, /must be an array/],
  ['entity not object', manifest(), { reading: [42] }, /entity must be an object/],
  ['uuid not v7', manifest(), { reading: [{ ...VALID, uuid: '25d110a0-1234-4abc-8abc-3f2b1c4d5e6f' }] }, /UUIDv7/],
  ['missing uuid', manifest(), { reading: [{ type: 'bookmark', updatedAt: 1, page: 1 }] }, /uuid/],
  ['unknown type in group', manifest(), { dhikr: [{ ...VALID, type: 'bookmark' }] }, /type: must be one of/],
  ['updatedAt bad', manifest(), { reading: [{ ...VALID, updatedAt: 0 }] }, /updatedAt/],
  ['deleted not boolean', manifest(), { reading: [{ ...VALID, deleted: 'yes' }] }, /deleted: must be boolean/],
  ['bookmark page 0', manifest(), { reading: [{ ...VALID, page: 0 }] }, /page must be 1..604/],
  ['highlight ayah 6237', manifest(), { reading: [{ uuid: VALID.uuid, type: 'highlight', updatedAt: 1_700_000_000_000, ayahNumber: 6237, wordStart: 1, wordEnd: 2, colorKey: 'gold' }] }, /ayahNumber/],
  ['highlight wordEnd < wordStart', manifest(), { reading: [{ uuid: VALID.uuid, type: 'highlight', updatedAt: 1_700_000_000_000, ayahNumber: 5, wordStart: 3, wordEnd: 2, colorKey: 'gold' }] }, /wordEnd/],
  ['highlight bad color', manifest(), { reading: [{ uuid: VALID.uuid, type: 'highlight', updatedAt: 1_700_000_000_000, ayahNumber: 5, wordStart: 1, wordEnd: 1, colorKey: 'purple' }] }, /colorKey/],
  ['khatmah deadline without endDate', manifest(), { reading: [{ uuid: VALID.uuid, type: 'khatmahPlan', updatedAt: 1_700_000_000_000, mode: 'deadline', startDate: '2026-01-01' }] }, /endDate/],
  ['khatmah rate bad dailyPages', manifest(), { reading: [{ uuid: VALID.uuid, type: 'khatmahPlan', updatedAt: 1_700_000_000_000, mode: 'rate', startDate: '2026-01-01', dailyPages: 700 }] }, /dailyPages/],
  ['tasbihCounter empty dhikrText', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'tasbihCounter', updatedAt: 1_700_000_000_000, dhikrText: '' }] }, /dhikrText/],
  ['adhkarState bad dayKey', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'adhkarState', updatedAt: 1_700_000_000_000, itemId: 'fajr-01', dayKey: '2026/01/01', count: 0 }] }, /dayKey/],
  ['adhkarState missing itemId', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'adhkarState', updatedAt: 1_700_000_000_000, dayKey: '2026-01-01', count: 0 }] }, /itemId/],
  ['adhkarState negative count', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'adhkarState', updatedAt: 1_700_000_000_000, itemId: 'fajr-01', dayKey: '2026-01-01', count: -1 }] }, /count/],
  ['setting without value', manifest(), { prefs: [{ uuid: VALID.uuid, type: 'setting', updatedAt: 1_700_000_000_000, key: 'theme' }] }, /value required/],
  ['setting dangerous key', manifest(), { prefs: [{ uuid: VALID.uuid, type: 'setting', updatedAt: 1_700_000_000_000, key: '__proto__', value: null }] }, /dangerous/],
  ['setting oversized key', manifest(), { prefs: [{ uuid: VALID.uuid, type: 'setting', updatedAt: 1_700_000_000_000, key: 'x'.repeat(65), value: null }] }, /<= 64/],
  ['streakDay bad kind', manifest(), { meta: [{ uuid: VALID.uuid, type: 'streakDay', updatedAt: 1_700_000_000_000, kind: 'water', dayKey: '2026-01-01' }] }, /kind/],
  ['tasbihSession nonpositive delta', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'tasbihSession', updatedAt: 1_700_000_000_000, counterUuid: '018f3f2e-7abc-7def-8abc-000000000104', countDelta: 0, occurredAt: 1 }] }, /countDelta/],
  ['tasbihSession missing counterUuid', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'tasbihSession', updatedAt: 1_700_000_000_000, countDelta: 1, occurredAt: 1 }] }, /counterUuid/],
  ['tasbihSession huge delta', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'tasbihSession', updatedAt: 1_700_000_000_000, counterUuid: '018f3f2e-7abc-7def-8abc-000000000104', countDelta: 2_000_000, occurredAt: 1 }] }, /countDelta/],
  ['updatedAt far future', manifest(), { reading: [{ ...VALID, updatedAt: Date.now() + 90 * 86_400_000 }] }, /too far in the future/],
  ['bookmark oversized labelAr', manifest(), { reading: [{ ...VALID, labelAr: 'x'.repeat(201) }] }, /labelAr/],
  ['khatmahPageLog bad page', manifest(), { reading: [{ uuid: '018f3f2e-7abc-7def-8abc-000000000103', type: 'khatmahPlan', updatedAt: 1_700_000_000_000, mode: 'rate', startDate: '2026-01-01', dailyPages: 3 }, { uuid: VALID.uuid, type: 'khatmahPageLog', updatedAt: 1_700_000_000_000, planUuid: '018f3f2e-7abc-7def-8abc-000000000103', page: 605, completedAt: 1_700_000_000_000 }] }, /page must be 1..604/],
  ['khatmahPageLog missing planUuid', manifest(), { reading: [{ uuid: '018f3f2e-7abc-7def-8abc-000000000103', type: 'khatmahPlan', updatedAt: 1_700_000_000_000, mode: 'rate', startDate: '2026-01-01', dailyPages: 3 }, { uuid: VALID.uuid, type: 'khatmahPageLog', updatedAt: 1_700_000_000_000, page: 3, completedAt: 1_700_000_000_000 }] }, /planUuid/],
  ['khatmahPageLog orphan planUuid (no plan in file)', manifest(), { reading: [{ uuid: VALID.uuid, type: 'khatmahPageLog', updatedAt: 1_700_000_000_000, planUuid: '018f3f2e-7abc-7def-8abc-000000000103', page: 3, completedAt: 1_700_000_000_000 }] }, /reference a khatmahPlan/],
  ['note body not string', manifest(), { reading: [{ uuid: VALID.uuid, type: 'note', updatedAt: 1_700_000_000_000, body: 7 }] }, /body must be a string/],
];

test('validator refusal table', () => {
  let ran = 0;
  for (const [name, m, p, re] of badCases) {
    const r = validateBackup(m, p);
    assert.equal(r.ok, false, `${name}: expected refusal`);
    assert.ok(r.errors.some((e) => re.test(e)), `${name}: no error matched ${re} — got ${JSON.stringify(r.errors)}`);
    ran++;
  }
  assert.ok(ran >= 24, `expected >=24 refusal cases, ran ${ran}`);
});

test('groups table matches architecture contract', () => {
  assert.deepEqual(BACKUP_GROUPS, ['reading', 'dhikr', 'prefs', 'meta']);
});

test('error list is accumulated, not fail-fast', () => {
  const r = validateBackup(manifest(), {
    reading: [{ ...VALID, page: 0 }, { ...VALID, uuid: 'bad' }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 2, `expected >=2 errors, got ${r.errors.length}`);
});

// ---------------------------------------------------------------------------
// integrity (2026-11 finding): manifest.integrity was required and computed
// at export but NEVER recomputed on import — a corrupted/tampered payload
// imported cleanly. These cases pin the recompute-before-write contract.
// ---------------------------------------------------------------------------

/** Exporter-shaped payload: uuid-sorted groups, recursively sorted keys. */
function exporterPayload() {
  return {
    reading: [{
      uuid: VALID.uuid, type: 'bookmark', updatedAt: 1_700_000_000_000,
      deleted: false, ayahNumber: null, createdAt: 1_700_000_000_000,
      labelAr: null, lineNumber: 1, page: 42,
    }],
  };
}

test('integrity: digest over payload bytes matches a real export', async () => {
  const payload = exporterPayload();
  const m = manifest({ integrity: await sha256Hex(JSON.stringify(payload)) });
  assert.equal(await integrityMatches(m, payload), true);
});

test('integrity: tampered payload value is refused', async () => {
  const payload = exporterPayload();
  const m = manifest({ integrity: await sha256Hex(JSON.stringify(payload)) });
  const tampered = structuredClone(payload);
  tampered.reading[0].page = 43; // one flipped field
  assert.equal(await integrityMatches(m, tampered), false);
});

test('integrity: tampered payload addition is refused', async () => {
  const payload = exporterPayload();
  const m = manifest({ integrity: await sha256Hex(JSON.stringify(payload)) });
  const tampered = structuredClone(payload);
  tampered.reading.push({ ...payload.reading[0], uuid: '01935a10-7c3f-7abc-9d5e-3f2b1c4d5e70' });
  assert.equal(await integrityMatches(m, tampered), false);
});

test('integrity: malformed/missing digest is refused', async () => {
  const payload = exporterPayload();
  for (const bad of [undefined, null, '', 'abc', 'Z'.repeat(64)]) {
    assert.equal(await integrityMatches(manifest({ integrity: bad }), payload), false, `digest=${String(bad)}`);
  }
});

test('integrity: non-object payload is refused', async () => {
  assert.equal(await integrityMatches(manifest(), [1, 2]), false);
  assert.equal(await integrityMatches(manifest(), null), false);
});

test('integrity: parity fixture sample-export verifies (golden bytes)', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const fx = JSON.parse(readFileSync(join(root, 'tests', 'parity', 'fixtures', 'backup', 'sample-export.json'), 'utf8'));
  assert.equal(await integrityMatches(fx.manifest, fx.payload), true);
  assert.equal(fx.manifest.integrity, await sha256Hex(JSON.stringify(fx.payload)));
});

test('duplicate uuid within one group is refused (was: passed validation, then PK-clashed the import)', () => {
  const dup = { ...VALID, updatedAt: 1_700_000_000_500 };
  const r = validateBackup(manifest(), { reading: [{ ...VALID }, dup] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('duplicate uuid')), r.errors.join(' | '));
  // same uuid in DIFFERENT groups is fine (different tables)
  const other = validateBackup(manifest(), { reading: [{ ...VALID }], meta: [{ ...VALID, type: 'streakDay', kind: 'tasbih', dayKey: '2026-11-21' }] });
  assert.equal(other.ok, true, other.errors?.join(' | '));
});
