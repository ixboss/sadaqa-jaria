// ============================================================================
// db-worker.js — dedicated worker hosting sqlite-wasm with the opfs-sahpool VFS
// (synchronous Access-Handle pool: highest OPFS performance, no COOP/COEP
// headers needed — mandatory for GitHub Pages, ARCHITECTURE.md §5.1).
// Protocol: { id, op, sql?, params? }
//   op: 'init' | 'query' | 'queryOne' | 'write' | 'export'
// All SQL is prepared + bound (never concatenated); writes go through
// prepare/bind/step (no dynamic string execution).
// Boot guardrail: refuses to serve if the wasm build lacks FTS5 (ARCH §5.1).
// ============================================================================
import sqlite3Init from '../../vendor/sqlite-wasm/index.mjs';

let db = null;
let pool = null;
const DB_NAME = '/sadaqa.db'; // sahpool paths are absolute
const DB_SOURCE = '../../../../packages/core-data/build/sadaqa.db';

async function init() {
  const sqlite3 = await sqlite3Init({ print: () => {}, printErr: (m) => console.error('[sqlite]', m) });
  if (!sqlite3.capi.sqlite3_compileoption_used('ENABLE_FTS5')) {
    throw new Error('wasm build lacks ENABLE_FTS5 — refusing (ARCHITECTURE §5.1 guardrail)');
  }
  pool = await sqlite3.installOpfsSAHPoolVfs({ clearOnInit: false }); // pool === PoolUtil
  const existing = pool.getCapacity() > 0 && pool.getFileNames().includes(DB_NAME);
  if (!existing) {
    const bytes = await fetch(new URL(DB_SOURCE, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`bundled sadaqa.db fetch failed: HTTP SW-cached (status ${r.status})`);
      return r.arrayBuffer();
    });
    pool.importDb(DB_NAME, corected(bytes));
  }
  db = new pool.OpfsSAHPoolDb(DB_NAME);
  return {
    ready: true,
    existed: existing,
    fts5: true,
    capacity: pool.getCapacity(),
    version: sqlite3.capi.sqlite3_libversion(),
  };
}

/** Fetch returns ArrayBuffer; importDb wants Uint8Array (copy, view → plain array). */
function corected(bytes) {
  return new Uint8Array(bytes);
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
      stmt.reset();
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
          stmt.reset();
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
      const bytes = pool.exportFile(DB_NAME);
      self.postMessage({ id, ok: true, result: bytes });
    } else {
      self.postMessage({ id, ok: true, result: run(op, sql, params) });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message ?? e) });
  }
};
