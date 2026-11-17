// backup-validate.test.js — .sadaqa payload validator (formatVersion 1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, SUPPORTED_FORMAT_VERSION, BACKUP_GROUPS } from '../engines/backup-validate.js';

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
  ['adhkarState bad dayKey', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'adhkarState', updatedAt: 1_700_000_000_000, dayKey: '2026/01/01', count: 0 }] }, /dayKey/],
  ['adhkarState negative count', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'adhkarState', updatedAt: 1_700_000_000_000, dayKey: '2026-01-01', count: -1 }] }, /count/],
  ['setting without value', manifest(), { prefs: [{ uuid: VALID.uuid, type: 'setting', updatedAt: 1_700_000_000_000, key: 'theme' }] }, /value required/],
  ['streakDay bad kind', manifest(), { meta: [{ uuid: VALID.uuid, type: 'streakDay', updatedAt: 1_700_000_000_000, kind: 'water', dayKey: '2026-01-01' }] }, /kind/],
  ['tasbihSession nonpositive delta', manifest(), { dhikr: [{ uuid: VALID.uuid, type: 'tasbihSession', updatedAt: 1_700_000_000_000, countDelta: 0, occurredAt: 1 }] }, /countDelta/],
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
