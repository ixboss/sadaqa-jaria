#!/usr/bin/env node
/**
 * unit-dbguard.mjs — OPFS boot-safety contract (finding: silent OPFS wipe).
 * Pins the decision matrix in apps/web-desktop/js/data/db-guard.js:
 *   - a TRANSIENT verify error (multi-tab lock) must never reseed
 *   - only provable corruption reseeds (schema tables / ayah count)
 *   - a future schema_version refuses instead of downgrading
 * Run: node tests/unit-dbguard.mjs
 */
import assert from 'node:assert/strict';
import { planBoot, verifyDbSchema, readSchemaVersion, migrate, SCHEMA_VERSION } from '../apps/web-desktop/js/data/db-guard.js';

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

/** Fake oo1-like db driven by canned answers / throwers. */
function fakeDb({ tables = 3, ayahs = 6236, metaValue = '1', failQueries = false, metaFails = false } = {}) {
  return {
    queries: [],
    selectObjects(sql) {
      this.queries.push(sql);
      if (failQueries) throw new Error('SQLITE_BUSY: database is locked');
      if (sql.includes('sqlite_master')) return [{ n: tables }];
      if (sql.includes('FROM ayahs')) return [{ n: ayahs }];
      if (sql.includes("key = 'schema_version'")) {
        if (metaFails) throw new Error('no such table: meta');
        return [{ value: metaValue }];
      }
      return [];
    },
    exec() {},
  };
}

function main() {
  // ── 1. healthy db → keep, never reseed ──
  const healthy = fakeDb();
  ok('healthy: verdict ok', verifyDbSchema(healthy) === 'ok');
  const p1 = planBoot(healthy);
  ok('healthy: plan keep', p1.action === 'keep', JSON.stringify(p1));
  ok('healthy: version read as 1', p1.version === 1);

  // ── 2. THE REGRESSION: transient lock (any thrown error) must NOT reseed ──
  const locked = fakeDb({ failQueries: true });
  ok('locked: verdict unknown (not corrupt)', verifyDbSchema(locked) === 'unknown');
  const p2 = planBoot(locked);
  ok('locked: plan keep (no wipe)', p2.action === 'keep', JSON.stringify(p2));

  // ── 3. provable corruption → reseed ──
  const empty = fakeDb({ tables: 0, ayahs: 0 });
  ok('empty: verdict corrupt', verifyDbSchema(empty) === 'corrupt');
  ok('empty: plan reseed', planBoot(empty).action === 'reseed');
  const partial = fakeDb({ tables: 3, ayahs: 6000 });
  ok('partial corpus: verdict corrupt', verifyDbSchema(partial) === 'corrupt');
  ok('partial corpus: plan reseed', planBoot(partial).action === 'reseed');

  // ── 4. future schema_version → refuse, bytes untouched ──
  const future = fakeDb({ metaValue: '2' });
  const p4 = planBoot(future);
  ok('future: plan refuse', p4.action === 'refuse', JSON.stringify(p4));
  ok('future: flagged as future', p4.future === true);

  // ── 5. unreadable meta on a healthy db → keep (v1 seed without meta row) ──
  const noMeta = fakeDb({ metaFails: true });
  ok('no-meta: version null', readSchemaVersion(noMeta) === null);
  const p5 = planBoot(noMeta);
  ok('no-meta: plan keep', p5.action === 'keep', JSON.stringify(p5));
  ok('no-meta: junk meta keeps too', planBoot(fakeDb({ metaValue: '"x"' })).action === 'keep');

  // ── 6. migrate: v1 is baseline (no-op) ──
  const m1 = migrate(fakeDb());
  ok('migrate: v1 → v1, no steps', m1.from === SCHEMA_VERSION && m1.to === SCHEMA_VERSION && m1.applied.length === 0);
  const m0 = migrate(fakeDb({ metaValue: '0' }));
  ok('migrate: bogus 0 clamps to baseline', m0.to === SCHEMA_VERSION);

  // ── 7. malformed meta values never produce a version ──
  for (const junk of ['null', 'abc', '-3', '1.5', '']) {
    ok(`meta junk ${JSON.stringify(junk)} → null version`, readSchemaVersion(fakeDb({ metaValue: junk })) === null);
  }

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log((r.pass ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? '  — ' + r.detail : ''));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(', ')); process.exitCode = 1; }
}

main();
