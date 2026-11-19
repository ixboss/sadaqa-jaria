// ============================================================================
// db.js — main-thread promise proxy over db-worker.js (opfs-sahpool).
// All SQL flows through here; callers use prepared-shaped helpers.
// ============================================================================
let worker = null;
let seq = 0;
const pending = new Map();

function call(op, { sql, params, engineReload } = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, sql, params, engineReload });
  });
}

/** Open (and cache) the app database. Resolves once the worker reports ready. */
export async function openDatabase() {
  if (worker) return api;
  worker = new Worker(new URL('./db-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data?.type === 'boot-progress') {
      window.dispatchEvent(new CustomEvent('sadaqa:boot-progress', { detail: data }));
      return;
    }
    const { id, ok, result, error } = data ?? {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(new Error(error));
  };
  worker.onerror = (e) => {
    const msg = e?.message || 'Worker failed to load';
    console.error('[db-worker]', msg);
    for (const [id, p] of pending.entries()) {
      pending.delete(id);
      p.reject(new Error(msg));
    }
    worker = null;
  };
  try {
    const info = await call('init');
    api.mode = info.mode ?? 'opfs-sahpool';
    console.info(`[db] ready (sqlite ${info.version}, mode=${api.mode}, capacity=${info.capacity}, existed=${info.existed})`);
    return api;
  } catch (err) {
    try { worker?.terminate?.(); } catch { /* ignore */ }
    worker = null;
    throw err;
  }
}

const api = {
  mode: 'opfs-sahpool',
  /** rows: array of objects */
  query: (sql, params = []) => call('query', { sql, params }),
  /** first row or null */
  queryOne: (sql, params = []) => call('queryOne', { sql, params }),
  /** prepared write (INSERT/UPDATE/DELETE) via bind+step in the worker.
   *  opts.engineReload: explicit flag — the Electron main process reloads its
   *  tray/adhan engine on settings writes (no string sniffing of the SQL). */
  write: (sql, params = [], opts = {}) => call('write', { sql, params, engineReload: opts?.engineReload === true }),
  /** atomic multi-write in one transaction: batch(stmts, { engineReload? }) */
  batch: (stmts, opts = {}) => call('batch', { params: { stmts }, engineReload: opts?.engineReload === true }),
};
