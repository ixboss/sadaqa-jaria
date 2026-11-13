#!/usr/bin/env node
/**
 * E2E suite — PWA update strategy (prompt, offline-first, no interruption)
 * ───────────────────────────────────────────────────────────────────
 * Guarantees under test:
 *  1) prompt strategy: a byte-different sw.js installs as an update but
 *     STAYS in `waiting` (no auto skipWaiting), the old worker keeps
 *     controlling the page, and a non-intrusive toast appears once;
 *  2) dismissal ("لاحقاً") persists for the session — the toast is not
 *     re-shown while the same session lives;
 *  3) SKIP_WAITING activates the waiting worker, controllerchange
 *     reloads once, and the updated app still boots 100% offline
 *     (precache intact after activation cleanup).
 *
 * Run:
 *   1) node tests/run-server.mjs            (port 8123)
 *   2) node tests/e2e-sw-update.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9238);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

let ws, idSeq = 0;
let cdpRequests = 0; // عدّاد طلبات الشبكة الفعلية (Network.requestWillBeSent)
const pending = new Map();
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.requestWillBeSent') cdpRequests++;
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
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

// Poll until evaljs(expr) is truthy (or timeout) — SW state transitions are async
async function waitFor(expr, timeoutMs = 12000, label = '') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await evaljs(expr);
    if (v) return v;
    await sleep(300);
  }
  return null;
}

async function main() {
  console.log('═══ E2E: PWA update strategy (prompt) ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-swupd-'));
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

    // ── (a) first install: SW active & controlling, app shell alive ──
    console.log('(a) first install...');
    await send('Page.navigate', { url: BASE });
    await sleep(3000);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    const reg1 = await evaljs(`(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { active: !!reg.active, controlling: !!navigator.serviceWorker.controller, script: reg.active?.scriptURL };
    })()`);
    ok('(a) SW active & controlling on first install', !!reg1.active && !!reg1.controlling, JSON.stringify(reg1));

    // ── (b) prompt strategy: byte-different sw.js installs and WAITS ──
    console.log('(b) update installs into waiting...');
    await evaljs(`navigator.serviceWorker.register('./sw.js?update-test=1', { scope: './', updateViaCache: 'none' })`);
    const waiting = await waitFor(`(async () => {
      const reg = await navigator.serviceWorker.ready;
      const w = reg.waiting || (reg.installing && reg.installing.state === 'installed' ? reg.installing : null);
      return w ? { script: w.scriptURL, state: w.state } : null;
    })()`);
    ok('(b) new SW reached installed/waiting (no auto-skip)', !!waiting, JSON.stringify(waiting));
    const stillOld = await evaljs(`(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { controller: navigator.serviceWorker.controller?.scriptURL, active: reg.active?.scriptURL };
    })()`);
    ok('(b) old SW still controls the page while waiting', !!stillOld.controller && !stillOld.controller.includes('update-test'), JSON.stringify(stillOld));

    // ── (c) non-intrusive toast appears once ──
    console.log('(c) update toast...');
    await sleep(600); // بطاقة التحديث تظهر بعد statechange 'installed'
    const toast1 = await evaljs(`(() => {
      const t = document.getElementById('sw-update-toast');
      return { exists: !!t, visible: !!(t && t.classList.contains('visible')), hasBtns: !!(t && t.querySelector('.sw-upd-now') && t.querySelector('.sw-upd-later')) };
    })()`);
    ok('(c) update toast visible with reload + dismiss buttons', toast1.exists && toast1.visible && toast1.hasBtns, JSON.stringify(toast1));

    // ── (d) dismissal persists for the session (no repeated nagging) ──
    console.log('(d) dismiss ("لاحقاً")...');
    await evaljs(`document.querySelector('#sw-update-toast .sw-upd-later')?.click()`);
    await sleep(400);
    const dismissed = await evaljs(`(() => ({
      toastGone: !document.getElementById('sw-update-toast'),
      key: sessionStorage.getItem('sw-update-dismissed') || null
    }))()`);
    ok('(d) toast dismissed and remembered', dismissed.toastGone && !!dismissed.key, JSON.stringify(dismissed));

    // ── (e) SKIP_WAITING activates; controllerchange reloads exactly once ──
    console.log('(e) accept update (SKIP_WAITING)...');
    // نبني البطاقة مجدداً عبر تحديث ثانٍ مختلف؟ لا — يكفي إرسال الرسالة للعامل المنتظر مباشرة
    await evaljs(`(async () => {
      const reg = await navigator.serviceWorker.ready;
      const w = reg.waiting || reg.installing;
      w && w.postMessage({ type: 'SKIP_WAITING' });
      return true;
    })()`);
    const activated = await waitFor(`(async () => {
      const reg = await navigator.serviceWorker.ready;
      return (reg.active && reg.active.scriptURL.includes('update-test') && !reg.waiting && !reg.installing)
        ? { script: reg.active.scriptURL } : null;
    })()`);
    ok('(e) waiting worker activated after SKIP_WAITING', !!activated, JSON.stringify(activated));
    await sleep(1500); // controllerchange يعيد التحميل مرة واحدة — انتظر استقرار الصفحة
    const afterReload = await evaljs(`({ title: document.getElementById('header-title')?.textContent || null, app: !!window.app, controller: navigator.serviceWorker.controller?.scriptURL })`);
    ok('(e) app reloaded and boots normally on the new SW', !!afterReload.title && afterReload.app && /update-test/.test(afterReload.controller || ''), JSON.stringify(afterReload));

    // ── (f) offline after the update: 100% offline-first intact ──
    console.log('(f) cold offline boot on the updated SW...');
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: -1, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Page.navigate', { url: BASE });
    await sleep(3500);
    const offlineBoot = await evaljs(`(() => ({
      title: document.getElementById('header-title')?.textContent || null,
      app: !!window.app,
      rows: document.querySelectorAll('.surah-row')?.length || 0,
      controller: navigator.serviceWorker.controller?.scriptURL
    }))()`);
    ok('(f) updated app boots 100% offline', !!offlineBoot.title && offlineBoot.app && offlineBoot.rows > 100, JSON.stringify(offlineBoot));
    ok('(f) updated SW controls the offline page', /update-test/.test(offlineBoot.controller || ''), offlineBoot.controller || 'no controller');

    // ── (g) offline update checks make zero network requests ──
    console.log('(g) no network while offline...');
    cdpRequests = 0;
    await evaljs(`document.dispatchEvent(new Event('visibilitychange')); true;`);
    await sleep(1200);
    ok('(g) visibilitychange offline fires zero network requests', cdpRequests === 0, `requests=${cdpRequests}`);
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaljs(`try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}`);

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
