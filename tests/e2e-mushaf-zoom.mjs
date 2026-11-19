#!/usr/bin/env node
// ============================================================================
// e2e-mushaf-zoom.mjs — zoomed (>100%) Mushaf reader: 105%–200% must scroll
// vertically with ZERO horizontal clipping, and ayah long-press targets must
// stay alive at every scale (regression guard for the iOS UITextView-collapse
// twin — the web flow must never clip lines after the first).
// Runs the v2 app headless (Edge + CDP, same harness as e2e-v2-phase4.mjs).
// ============================================================================
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_V2_PORT || 8131);
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9242);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const BASE = `http://127.0.0.1:${PORT}/apps/web-desktop/index.html`;

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };

let ws, idSeq = 0;
const pending = new Map();
const consoleErrors = [];
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text);
  };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaljs = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then((r) => {
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
  return r.result?.value;
});
async function waitFor(expr, { timeout = 30000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const v = await evaljs(expr).catch(() => null);
    if (v) return v;
    await sleep(interval);
  }
  return null;
}
async function goto(hash) {
  await evaljs(`location.hash = '${hash}'`);
  await sleep(340);
}

async function main() {
  console.log('═══ E2E: Mushaf zoom 105%–200% — vertical scroll, zero clipping ═══\n');
  const server = spawn(process.execPath, [join(ROOT, 'tests', 'run-server.mjs'), String(PORT)], { stdio: 'ignore' });
  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-zoom-'));
  const browser = spawn(BROWSER, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--disable-gpu', '--no-first-run', '--disable-sync', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    await sleep(1800);
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Log.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: BASE });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    ok('boot: app ready', (await waitFor('window.__sadaqaReady === true', { timeout: 90000 })) === true);

    for (const scale of [1.05, 1.5, 2.0]) {
      await evaljs(`(async () => {
        const { saveSetting } = await import(new URL('./js/app-state.js', location.href));
        await saveSetting('mushaf_scale', ${scale});
        return true;
      })()`);
      await goto('#/today');
      await goto('#/mushaf-page?page=5');
      const ready = await waitFor(`!!document.querySelector('#mushaf-stage .mushaf-plate.zoomed .mushaf-flow')`, { timeout: 20000 });
      const m = await evaljs(`(() => {
        const plate = document.querySelector('#mushaf-stage .mushaf-plate.zoomed');
        if (!plate) return null;
        plate.style.scrollBehavior = 'auto';
        plate.scrollTop = 0;
        const scrollable = plate.scrollHeight > plate.clientHeight + 8;
        plate.scrollTop = 240;
        return {
          scrollable,
          scrolled: plate.scrollTop,
          docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          plateOverflowX: plate.scrollWidth - plate.clientWidth,
          screenOverflowX: (document.getElementById('screen-mushaf') ?? plate).scrollWidth - (document.getElementById('screen-mushaf') ?? plate).clientWidth,
          ayahSpans: plate.querySelectorAll('.mw[data-ayah]').length,
          flows: plate.querySelectorAll('.mushaf-flow').length,
        };
      })()`);
      ok(`zoom ${scale}: flow plate renders zoomed with ayah targets`,
        Boolean(ready) && m?.ayahSpans > 0 && m?.flows >= 1, `ayahs=${m?.ayahSpans} flows=${m?.flows}`);
      ok(`zoom ${scale}: content taller than viewport → vertical scroll works`,
        m?.scrollable === true && m?.scrolled === 240, `scrollH=${m?.scrolled}`);
      ok(`zoom ${scale}: zero horizontal clipping (doc/screen/plate)`,
        (m?.docOverflowX ?? 1) <= 0 && (m?.screenOverflowX ?? 1) <= 0 && (m?.plateOverflowX ?? 1) <= 0,
        `doc=${m?.docOverflowX} screen=${m?.screenOverflowX} plate=${m?.plateOverflowX}`);
    }

    // restore reader scale for any following consumer
    await evaljs(`(async () => {
      const { saveSetting } = await import(new URL('./js/app-state.js', location.href));
      await saveSetting('mushaf_scale', 1);
      return true;
    })()`);

    const realErrors = consoleErrors.filter((t) => !/favicon|Failed to load resource|net::ERR|navigator.vibrate/i.test(t));
    ok('console: no uncaught errors during the whole run', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
    const passed = results.filter((r) => r.pass).length;
    console.log(`\n=== RESULT: ${passed}/${results.length} passed ===`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    browser.kill();
    server.kill();
  }
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
