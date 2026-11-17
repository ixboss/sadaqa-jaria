// ============================================================================
// bridge.js — PlatformBridge contract (ARCHITECTURE.md §4), web adapter.
// Boot resolves `window.sadaqaBridge` (Electron preload) → else the web
// adapter below. Callers branch on `capabilities` — no undefined-bridge use.
// ============================================================================

const WEB_CAPABILITIES = Object.freeze({
  tray: false,
  exactAlarms: false,
  nativeAudioCache: false, // OPFS via AudioStore
  shareFile: 'shareFile' in navigator || 'showSaveFilePicker' in window,
  opfs: true,
});

/** OPFS-backed audio pack store (packs only ever run when user opens manager). */
class OpfsAudioStore {
  #root = null;
  async root() {
    this.#root ??= await navigator.storage.getDirectory();
    return this.#root;
  }
  async #packDir(reciter) {
    const root = await this.root();
    return root.getDirectoryHandle(`audio-${reciter}`, { create: true });
  }
  async put(reciter, surah, file) {
    const dir = await this.#packDir(reciter);
    const fh = await dir.getFileHandle(`${surah}.bin`, { create: true });
    const w = await fh.createWritable();
    await w.write(file);
    await w.close();
  }
  async get(reciter, surah) {
    try {
      const dir = await this.#packDir(reciter);
      const fh = await dir.getFileHandle(`${surah}.bin`);
      return await fh.getFile();
    } catch { return null; }
  }
  async delete(reciter, surah) {
    try { const dir = await this.#packDir(reciter); await dir.removeEntry(`${surah}.bin`); } catch { /* absent */ }
  }
  async usage() {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    }
    return { usage: 0, quota: 0 };
  }
}

export async function resolveBridge() {
  const electron = typeof window !== 'undefined' && window.sadaqaBridge;
  if (electron && electron.version?.major === 2) return electron; // Electron preload injects the real bridge

  return Object.freeze({
    version: { major: 2, minor: 0 },
    kind: 'web',
    capabilities: WEB_CAPABILITIES,
    audioStore: new OpfsAudioStore(),

    async dbHost() {
      const { openDatabase } = await import('../data/db.js');
      return openDatabase(); // { query, queryOne, exec } over the sahpool worker
    },

    async exportFile(bytes, name) {
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      if ('showSaveFilePicker' in window) {
        try {
          const fh = await window.showSaveFilePicker({ suggestedName: name });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
          return true;
        } catch (e) {
          if (e?.name === 'AbortError') return false; // user cancelled — nothing saved
          // headless / blocked picker (NotAllowedError etc.) → fall through to download
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      return false; // downloaded, not picked
    },

    async importFile(accept = '.sadaqa') {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = async () => {
          const file = input.files?.[0];
          resolve(file ? new Uint8Array(await file.arrayBuffer()) : null);
        };
        input.click();
      });
    },

    async scheduleAdhan() { /* PWA: best-effort via SW in Phase 4; web adapter no-op is explicit */ },
    async cancelAdhan() {},
    async notify(payload) {
      if (Notification?.permission === 'granted') new Notification(payload.title, { body: payload.body, tag: payload.tag });
    },
    setTray() { /* tray: false — callers branch on capabilities */ },
    haptic(pattern) {
      try { navigator.vibrate?.(pattern); } catch { /* unsupported — silent */ }
    },
  });
}
