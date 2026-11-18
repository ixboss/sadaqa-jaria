// ============================================================================
// db-worker.js — dedicated worker hosting sqlite-wasm with the opfs-sahpool VFS
// (synchronous Access-Handle pool: highest OPFS performance, no COOP/COEP
// headers needed — mandatory for GitHub Pages, ARCHITECTURE.md §5.1).
// Protocol: { id, op, sql?, params? }
//   op: 'init' | 'query' | 'queryOne' | 'write' | 'export'
// All SQL is prepared + bound (never concatenated); writes go through
// prepare/bind/step (no dynamic string execution).
// Boot guardrail: refuses to serve if the wasm build lacks FTS5 (ARCH §5.1).
// Boot safety (db-guard.js): a transient verify error NEVER triggers a seed
// re-import (that silently wiped user data — pre-2026-11 bug); only provable
// corruption reseeds, and only after stashing a recoverable .corrupt-bak copy.
// ============================================================================
import sqlite3Init from '../../vendor/sqlite-wasm/index.mjs';
import { planBoot, migrate, SCHEMA_VERSION } from './db-guard.js';

let db = null;
let pool = null;
let sqlite3Ref = null;
let backendMode = 'opfs-sahpool';
const DB_NAME = '/sadaqa.db'; // sahpool paths are absolute
const DB_SOURCE = '../../../../packages/core-data/build/sadaqa.db';

function emitProgress(phase, loaded = 0, total = 0) {
  try {
    self.postMessage({ type: 'boot-progress', phase, loaded, total });
  } catch { /* ignore */ }
}

async function fetchDbBytes(url) {
  emitProgress('downloading', 0, 0);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bundled sadaqa.db fetch failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = await res.arrayBuffer();
    emitProgress('downloading', buf.byteLength, total || buf.byteLength);
    return new Uint8Array(buf);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let lastEmit = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    const now = Date.now();
    if (now - lastEmit > 80) {
      lastEmit = now;
      emitProgress('downloading', loaded, total);
    }
  }
  emitProgress('downloading', loaded, total || loaded);
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function fetchSeed() {
  return fetchDbBytes(new URL(DB_SOURCE, import.meta.url).href);
}

/**
 * Provably-corrupt db path (planBoot action 'reseed'): stash ONE recoverable
 * copy of the old bytes in the pool before any overwrite, then re-import the
 * seed. Never wipes without the backup attempt succeeding — if the stash
 * fails we keep the corrupt db untouched and surface the error instead.
 */
async function reseedWithBackup(reason) {
  let backupName = null;
  try {
    const old = pool.exportFile(DB_NAME);
    backupName = `${DB_NAME}.corrupt-bak`;
    try { pool.unlink(backupName); } catch { /* first backup — nothing to drop */ }
    await pool.importDb(backupName, old);
  } catch (e) {
    console.error(`[db-worker] ${reason}: refusing to overwrite — could not stash a backup of the old db:`, e?.message ?? e);
    throw new Error(`db reseed aborted (backup failed): ${reason}`);
  }
  console.warn(`[db-worker] ${reason}: re-seeding (old db preserved at ${backupName})`);
  const bytes = await fetchSeed();
  emitProgress('importing', bytes.byteLength, bytes.byteLength);
  await pool.importDb(DB_NAME, bytes);
  return backupName;
}

async function init() {
  emitProgress('wasm', 0, 0);
  const sqlite3 = await sqlite3Init({ print: () => {}, printErr: (m) => console.error('[sqlite]', m) });
  sqlite3Ref = sqlite3;
  if (!sqlite3.capi.sqlite3_compileoption_used('ENABLE_FTS5')) {
    throw new Error('wasm build lacks ENABLE_FTS5 — refusing (ARCHITECTURE §5.1 guardrail)');
  }
  const dbUrl = new URL(DB_SOURCE, import.meta.url).href;
  let bytes = null;
  let existed = false;
  let schemaVersion = null;
  let schemaRefused = false;

  // Tier 1: opfs-sahpool (persistent offline storage without COOP/COEP)
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ clearOnInit: false });
    existed = pool.getCapacity() > 0 && pool.getFileNames().includes(DB_NAME);
    if (existed) {
      db = new pool.OpfsSAHPoolDb(DB_NAME);
      const plan = planBoot(db);
      schemaVersion = plan.version;
      if (plan.action === 'reseed') {
        try { db.close(); } catch { /* ignore */ }
        db = null;
        await reseedWithBackup(plan.reason);
        db = new pool.OpfsSAHPoolDb(DB_NAME);
        schemaVersion = SCHEMA_VERSION;
      } else if (plan.action === 'refuse') {
        // db written by a NEWER app version — keep bytes, refuse to serve
        try { db.close(); } catch { /* ignore */ }
        db = null;
        schemaRefused = true;
        throw new Error(`sadaqa.db schema_version ${plan.version} is newer than this build (${SCHEMA_VERSION}) — update the app (data left untouched)`);
      } else {
        const mig = migrate(db);
        if (mig.applied.length > 0) console.info('[db-worker] migrations applied:', mig.applied.join('; '));
        schemaVersion = mig.to;
      }
    }
    if (!db) {
      bytes = await fetchDbBytes(dbUrl);
      emitProgress('importing', bytes.byteLength, bytes.byteLength);
      await pool.importDb(DB_NAME, bytes);
      db = new pool.OpfsSAHPoolDb(DB_NAME);
      schemaVersion = SCHEMA_VERSION;
    }
    backendMode = 'opfs-sahpool';
  } catch (opfsErr) {
    if (schemaRefused) throw opfsErr; // upgrade-required is fatal, not a fallback case
    console.warn('[db-worker] opfs-sahpool unavailable, falling back to in-memory sqlite:', opfsErr?.message ?? opfsErr);
    if (db) { try { db.close(); } catch { /* ignore */ } db = null; }
    pool = null;
    // Tier 2: guaranteed in-memory POSIX/MEMFS fallback (Incognito, Safari iframe, multi-tab lock)
    if (!bytes) bytes = await fetchDbBytes(dbUrl);
    emitProgress('importing', bytes.byteLength, bytes.byteLength);
    sqlite3.capi.sqlite3_js_posix_create_file(DB_NAME, bytes);
    db = new sqlite3.oo1.DB(DB_NAME, 'rw');
    backendMode = 'memory-vfs';
  }

  emitProgress('ready', 1, 1);
  return {
    ready: true,
    existed,
    mode: backendMode,
    fts5: true,
    schemaVersion,
    capacity: pool?.getCapacity?.() ?? 0,
    version: sqlite3.capi.sqlite3_libversion(),
  };
}

function run(op, sql, params) {
  if (!db) throw new Error('db not initialized');
  if (op === 'query') return db.selectObjects(sql, params);
  if (op === 'queryOne') return db.selectObjects(sql, params)[0] ?? null;
  if (op === 'write') {
    const stmt = db.prepare(sql);
    try {
      if (Array.isArray(params) && params.length > 0) stmt.bind(params);
      stmt.step(); // run to completion; row callbacks unused for writes
    } finally {
      stmt.finalize();
    }
    return { ok: true };
  }
  if (op === 'batch') {
    // All-or-nothing multi-write (backup import): every statement is prepared
    // inside ONE transaction. `params.stmts` = [{ sql, params }] where each
    // sql is a fixed internal constant (INSERT ... VALUES (?, ...) or a
    // parameterless DELETE) — no external string ever reaches this layer.
    const stmts = params.stmts;
    if (!Array.isArray(stmts) || stmts.length === 0) throw new Error('batch: stmts required');
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const { sql: s, params: p } of stmts) {
        const stmt = db.prepare(s);
        try {
          if (Array.isArray(p) && p.length > 0) stmt.bind(p);
          stmt.step();
        } finally {
          stmt.finalize();
        }
      }
      db.exec('COMMIT');
      return { ok: true, count: stmts.length };
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw e;
    }
  }
  throw new Error(`unknown op: ${op}`);
}

self.onmessage = async ({ data: { id, op, sql, params } }) => {
  try {
    if (op === 'init') {
      const info = await init();
      self.postMessage({ id, ok: true, result: info });
    } else if (op === 'export') {
      const bytes = pool ? pool.exportFile(DB_NAME) : sqlite3Ref.capi.sqlite3_js_db_export(db.pointer);
      self.postMessage({ id, ok: true, result: bytes });
    } else {
      self.postMessage({ id, ok: true, result: run(op, sql, params) });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message ?? e) });
  }
};
