// ============================================================================
// preload.cjs — the ONLY bridge between the sandboxed renderer and the main
// process. contextBridge exposes a typed PlatformBridge (ARCHITECTURE.md §4):
// same contract as the web adapter, backed by IPC. No Node globals leak —
// contextIsolation keeps this world separate.
// ============================================================================
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => {
  // channel allowlist — nothing else is reachable from the renderer
  const OK = new Set([
    'db:query', 'db:queryOne', 'db:write', 'db:batch',
    'audio:put', 'audio:get', 'audio:delete',
    'file:save', 'file:open', 'notify',
  ]);
  if (!OK.has(channel)) return Promise.reject(new Error(`channel not allowed: ${channel}`));
  return ipcRenderer.invoke(channel, payload);
};

contextBridge.exposeInMainWorld('sadaqaBridge', {
  version: { major: 2, minor: 1 },
  kind: 'electron',
  capabilities: Object.freeze({
    tray: true,
    exactAlarms: true,
    nativeAudioCache: true, // userData/audio on disk via IPC
    opfs: false,            // not needed — native filesystem is the store
    shareFile: true,
  }),

  /** Same db-host contract as the web adapter: { query, queryOne, write, batch }.
   *  write forwards opts.engineReload — explicit settings-write flag (no SQL sniffing). */
  async dbHost() {
    return {
      query: (sql, params = []) => invoke('db:query', { sql, params }),
      queryOne: (sql, params = []) => invoke('db:queryOne', { sql, params }),
      write: (sql, params = [], opts = {}) => invoke('db:write', { sql, params, engineReload: opts?.engineReload === true }),
      batch: (stmts, opts = {}) => invoke('db:batch', { stmts, engineReload: opts?.engineReload === true }),
    };
  },

  /** Filesystem-backed AudioStore (same surface as the OPFS store). */
  audioStore: {
    put: (reciter, key, blobOrBuffer) => blobOrBuffer.arrayBuffer().then(
      (ab) => invoke('audio:put', { reciter, key, bytes: new Uint8Array(ab) })),
    get: async (reciter, key) => {
      const buf = await invoke('audio:get', { reciter, key });
      return buf ? new Blob([buf], { type: 'audio/mpeg' }) : null;
    },
    delete: (reciter, key) => invoke('audio:delete', { reciter, key }),
    usage: async () => ({ usage: 0, quota: 0 }), // disk-quota semantics — report zero (not an error)
  },

  /** .sadaqa export/import via native save/open dialogs. */
  exportFile: async (bytes, name) => invoke('file:save', { bytes: new Uint8Array(bytes?.buffer ? bytes : new TextEncoder().encode(String(bytes))), name }),
  importFile: async () => invoke('file:open'),

  scheduleAdhan: async () => true, // adhan scheduling is MAIN-process native (tray loop)
  cancelAdhan: async () => true,
  notify: (payload) => invoke('notify', { title: String(payload?.title ?? ''), body: String(payload?.body ?? '') }),
  setTray: () => {}, // tray is owned by main; web-parity no-op
  haptic: () => {},  // desktop has no haptics — explicit no-op (capabilities-truthful)
});
