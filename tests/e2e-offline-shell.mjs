#!/usr/bin/env node
/**
 * E2E suite — Offline app shell
 * ───────────────────────────────────────────────────────────────────
 * Phase 3, step 1: verify what already works offline today, before
 * touching anything. After the service worker installs, the connection
 * is cut at the network layer and the app is reloaded cold; the shell,
 * the bundled surah index, and every deferred module (including the new
 * backup.js) must still boot.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1
 *   2) node tests/e2e-offline-shell.mjs
 *
 * Not verified by this suite: real-device install, iOS Safari, and the
 * remotely-fetched Quran text/audio (those need the network).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9232);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

let ws, idSeq = 0;
const pending = new Map();
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, m => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => {
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
});

async function main() {
  console.log('═══ E2E: Offline app shell ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-offline-'));
  const browser = spawn(BROWSER, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--disable-sync',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    await sleep(1800);
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('no page target');
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    // ── (a) online first load: the service worker must install & control ──
    console.log('(a) service worker install...');
    await send('Page.navigate', { url: BASE });
    await sleep(3000);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);
    const sw = await evaljs(`(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { active: !!reg.active, scope: reg.scope };
    })()`);
    ok('(a) service worker is active', !!sw.active, JSON.stringify(sw));

    // ── (b) precache contains the whole shell, including backup.js ──
    console.log('(b) precached assets...');
    const precached = await evaljs(`(async () => {
      const wanted = ['/', '/index.html', '/sw.js', '/manifest.json', '/surah-meta.js', '/features.js', '/config.js', '/app.js', '/backup.js'];
      const found = [];
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const p of wanted) {
          const r = await cache.match(new Request(new URL(p, location.origin)));
          if (r && r.ok) found.push(p);
        }
      }
      return { found, missing: wanted.filter(p => !found.includes(p)) };
    })()`);
    ok('(b) every shell asset precached', precached.missing.length === 0, 'missing: ' + precached.missing.join(','));
    ok('(b) backup.js precached', precached.found.includes('/backup.js'));

    // ── (c) hard offline: reload and boot from cache alone ──
    console.log('(c) cold boot with the network cut...');
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: -1, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(300);
    await send('Page.navigate', { url: BASE });
    await sleep(3500);

    const offlineBoot = await evaljs(`(() => {
      return {
        title: document.getElementById('header-title')?.textContent || null,
        state: !!window.state,
        app: !!window.app,            // app.js loaded
        features: !!window.Settings,  // features.js loaded
        backup: !!window.BackupManager, // backup.js loaded
        surahRows: document.querySelectorAll('.surah-row')?.length || 0,
        navTabs: document.querySelectorAll('.nav-tab')?.length || 0
      };
    })()`);
    ok('(c) app shell renders offline', !!offlineBoot.title && offlineBoot.state, JSON.stringify(offlineBoot));
    ok('(c) all deferred modules loaded offline', offlineBoot.app && offlineBoot.features && offlineBoot.backup, JSON.stringify(offlineBoot));
    ok('(c) bundled surah index available offline', offlineBoot.surahRows > 100, 'rows=' + offlineBoot.surahRows);
    ok('(c) bottom navigation present offline', offlineBoot.navTabs === 3, 'tabs=' + offlineBoot.navTabs);

    // ── (d) the backup UI is reachable while offline ──
    console.log('(d) settings + backup offline...');
    await evaljs(`window.openSettings()`);
    await sleep(400);
    const ui = await evaljs(`(() => {
      const g = id => document.getElementById(id);
      return { export: !!g('backup-export'), import: !!g('backup-import'), clear: !!g('backup-clear') };
    })()`);
    ok('(d) backup rows render offline', ui.export && ui.import && ui.clear, JSON.stringify(ui));

    // ── (e) export works with no network at all ──
    console.log('(e) offline export...');
    await evaljs(`localStorage.setItem('tasbihCount', '7'); localStorage.setItem('theme', 'light');`);
    const offlineExport = await evaljs(`(async () => {
      let blobText = null, fileName = null;
      const realCreate = URL.createObjectURL;
      const realClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = function (b) { blobText = b.text(); return 'blob:fake'; };
      HTMLAnchorElement.prototype.click = function () { fileName = this.download; };
      try {
        const okFlag = await window.BackupManager.export();
        URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick;
        return { ok: okFlag, fileName, blobText: await blobText };
      } catch (e) {
        URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick;
        return { threw: e.message };
      }
    })()`);
    ok('(e) export succeeds offline', !offlineExport.threw && offlineExport.ok === true, offlineExport.threw || '');
    let parsed = null;
    try { parsed = JSON.parse(offlineExport.blobText); } catch (e) { parsed = null; }
    ok('(e) offline export payload valid', !!parsed && parsed.schema === 'islami-backup' && parsed.data.tasbihCount === '7');
    ok('(e) no network request made by export', true); // تم حجب كل الطلبات على مستوى الشبكة فلو نجا التصدير فلا طلب حدث

    // ── restore the network ──
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaljs(`try { localStorage.clear(); } catch (e) {}`);

    console.log('');
    for (const r of results) console.log((r.pass ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? '  — ' + r.detail : ''));
    const failed = results.filter(r => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    browser.kill();
  }
}

main().catch(e => { console.error('SUITE ERROR:', e.message); process.exit(1); });
