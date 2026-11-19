// ============================================================================
// Web v2 backup regression tests — exercises apps/web-desktop/js/data/backup.js
// directly for peekBackup crash safety, XSS-safe UI error rendering,
// device_id import protection, engineReload forwarding, and FK ordering.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { peekBackup, importBackup } from '../../../apps/web-desktop/js/data/backup.js';
import { sha256Hex } from '../engines/backup-validate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function makeMockDb(initialDeviceId = 'dev-local-123') {
  const batches = [];
  const writes = [];
  const settings = new Map([['device_id', { key: 'device_id', value: JSON.stringify(initialDeviceId), updated_at: 100 }]]);
  return {
    batches,
    writes,
    settings,
    async query(sql) {
      if (sql.includes('FROM user_settings')) return [...settings.values()];
      return [];
    },
    async batch(stmts, opts) {
      batches.push({ stmts, opts });
    },
    async write(sql, params) {
      writes.push({ sql, params });
    },
  };
}

test('peekBackup handles malformed non-JSON bytes without throwing', async () => {
  const bytes = new TextEncoder().encode('<<<not json>>>');
  const res = await peekBackup(bytes);
  assert.equal(res.ok, false);
  assert.ok(Array.isArray(res.errors) && res.errors.length > 0);
  assert.equal(res.manifest, null);
});

test('peekBackup returns validation errors verbatim while backup screen renders via textContent', async () => {
  const payload = { reading: [], dhikr: [], prefs: [], meta: [] };
  const xssManifest = {
    format: 'sadaqa-backup',
    formatVersion: 1,
    createdAt: 1_764_300_000_000,
    appVersion: '2.3.0',
    deviceId: '<img src=x onerror=alert(1)>',
    integrity: 'bad',
    entities: {},
  };
  const bytes = new TextEncoder().encode(JSON.stringify({ manifest: xssManifest, payload }));
  const res = await peekBackup(bytes);
  assert.equal(res.ok, false);

  // Static safety check: renderPeek in backup.js must use .textContent for peek.errors, never innerHTML interpolation
  const uiSrc = readFileSync(join(ROOT, 'apps/web-desktop/js/ui/screens/backup.js'), 'utf8');
  assert.ok(uiSrc.includes("querySelector('.bk-err-msg').textContent = "), 'expected textContent assignment for peek errors');
  assert.ok(!uiSrc.includes('peek.errors.join'), 'peek.errors must not be interpolated into HTML template strings');
});

test('importBackup skips device_id overwrite, sets engineReload=true, and orders tasbihCounter before tasbihSession', async () => {
  const now = 1_764_300_000_000;
  const counterUuid = '01933c9e-1111-7000-8000-000000000001';
  const sessionUuid = '01933c9e-2222-7000-8000-000000000002';
  const settingUuid = '01933c9e-3333-7000-8000-000000000003';
  const themeUuid = '01933c9e-4444-7000-8000-000000000004';

  const payload = {
    reading: [],
    dhikr: [
      { uuid: sessionUuid, type: 'tasbihSession', updatedAt: now, counterUuid, countDelta: 5, occurredAt: now },
      { uuid: counterUuid, type: 'tasbihCounter', updatedAt: now, deleted: false, labelAr: 'سبحان الله', dhikrText: 'سبحان الله', target: 33, count: 5, totalLifetime: 5, sortOrder: 0 },
    ],
    prefs: [
      { uuid: settingUuid, type: 'setting', updatedAt: now + 1000, key: 'device_id', value: 'evil-device-id' },
      { uuid: themeUuid, type: 'setting', updatedAt: now + 1000, key: 'theme', value: 'light' },
    ],
    meta: [],
  };
  const integrity = await sha256Hex(JSON.stringify(payload));
  const manifest = {
    format: 'sadaqa-backup',
    formatVersion: 1,
    createdAt: now,
    appVersion: '2.3.0',
    deviceId: 'other-device',
    integrity,
    entities: {
      reading: 0,
      dhikr: 2,
      prefs: 2,
      meta: 0,
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify({ manifest, payload }));
  const db = makeMockDb('dev-local-123');
  await importBackup(db, bytes, 'merge', now);

  assert.equal(db.batches.length, 1);
  assert.deepEqual(db.batches[0].opts, { engineReload: true });

  const sqls = db.batches[0].stmts.map((s) => s.sql);
  const paramsList = db.batches[0].stmts.map((s) => s.params);

  // device_id must never appear in user_settings upserts
  assert.ok(!paramsList.some((p) => p[0] === 'device_id'), 'device_id setting must be skipped on import');
  assert.ok(paramsList.some((p) => p[0] === 'theme' && p[1] === '"light"'), 'other settings still import');

  // tasbih_counters must be inserted before tasbih_sessions
  const counterIdx = sqls.findIndex((s) => s.includes('INSERT INTO tasbih_counters'));
  const sessionIdx = sqls.findIndex((s) => s.includes('INSERT INTO tasbih_sessions'));
  assert.ok(counterIdx >= 0 && sessionIdx >= 0 && counterIdx < sessionIdx, 'tasbih_counters must precede tasbih_sessions');
});
