// ============================================================================
// db.js — main-thread promise proxy over db-worker.js (opfs-sahpool).
// All SQL flows through here; callers use prepared-shaped helpers.
// ============================================================================
let worker = null;
let seq = 0;
const pending = new Map();

function call(op, { sql, params } = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, sql, params });
  });
}

/** Open (and cache) the app database. Resolves once the worker reports ready. */
export async function openDatabase() {
  if (worker) return api;
  worker = new Worker(new URL('./db-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: { id, ok, result, error } }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(new Error(error));
  };
  worker.onerror = (e) => { console.error('[db-worker]', e.message); };
  const info = await call('init');
  console.info(`[db] ready (sqlite ${info.version}, opfs-sahpool capacity ${info.capacity}, existed=${info.existed})`);
  return api;
}

const api = {
  /** rows: array of objects */
  query: (sql, params = []) => call('query', { sql, params }),
  /** first row or null */
  queryOne: (sql, params = []) => call('queryOne', { sql, params }),
  /** prepared write (INSERT/UPDATE/DELETE) via bind+step in the worker */
  write: (sql, params = []) => call('write', { sql, params }),
  /** atomic multi-write in one transaction: batch({ stmts: [{sql, params}] }) */
  batch: (stmts) => call('batch', { params: { stmts } }),
  exportDb: () => call('export'),
};
