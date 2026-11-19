#!/usr/bin/env node
// ============================================================================
// e2e-pageturn-anim.mjs — v2 reader page turns must SLIDE directionally, not
// hard-swap: foot buttons (< / >) and keyboard arrows animate an exit slide
// on the stage before the new page enters with its opposite-side slide.
// Runs the v2 app headless (Edge + CDP, same harness as e2e-v2-phase4.mjs).
// ============================================================================
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_V2_PORT || 8133);
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9244);
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
async function waitFor(expr, { timeout = 30000, interval = 200 } = {}) {
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
  await sleep(360);
}

const pageProbe = `(() => {
  const plate = document.querySelector('#mushaf-stage .mushaf-plate');
  return { page: Number(plate?.dataset.page ?? 0), foot: document.getElementById('foot-page-num')?.textContent ?? '' };
})()`;

async function main() {
  console.log('═══ E2E: page-turn directional slide (buttons + keyboard) ═══\n');
  const server = spawn(process.execPath, [join(ROOT, 'tests', 'run-server.mjs'), String(PORT)], { stdio: 'ignore' });
  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-turn-'));
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

    await goto('#/mushaf-page?page=10');
    await waitFor(`!!document.querySelector('#mushaf-stage .mushaf-plate .mushaf-line')`, { timeout: 20000 });
    const start = await evaljs(pageProbe);
    ok('reader: page 10 rendered (foot carries the page number)', start.page === 10 && start.foot !== '', JSON.stringify(start));

    // Button turn: exit slide must be RUNNING right after the click…
    const btnAnim = await evaljs(`(async () => {
      const stage = document.getElementById('mushaf-stage');
      document.getElementById('pf-next')?.click();
      await new Promise((r) => setTimeout(r, 40));
      return {
        animating: stage.getAnimations().some((a) => a.playState === 'running'),
        pageStill: Number(document.querySelector('#mushaf-stage .mushaf-plate')?.dataset.page ?? 0),
      };
    })()`);
    ok('button turn: exit slide animates on the stage (not an instant swap)',
      btnAnim.animating === true, JSON.stringify(btnAnim));
    const afterBtn = await waitFor(`(() => { const p = Number(document.querySelector('#mushaf-stage .mushaf-plate')?.dataset.page ?? 0); return p !== ${start.page} ? p : null; })()`, { timeout: 4000 });
    ok('button turn: page advances after the slide', afterBtn === start.page + 1, `${start.page} → ${afterBtn}`);

    await sleep(500); // let the flip lock clear (~480ms)

    // Keyboard turn (ArrowLeft = +1 in RTL)
    const keyAnim = await evaljs(`(async () => {
      const stage = document.getElementById('mushaf-stage');
      dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      return { animating: stage.getAnimations().some((a) => a.playState === 'running') };
    })()`);
    ok('keyboard turn: exit slide animates too', keyAnim.animating === true, JSON.stringify(keyAnim));
    const afterKey = await waitFor(`(() => { const p = Number(document.querySelector('#mushaf-stage .mushaf-plate')?.dataset.page ?? 0); return p !== ${start.page + 1} ? p : null; })()`, { timeout: 4000 });
    ok('keyboard turn: page advances (RTL ArrowLeft = +1)', afterKey === start.page + 2, `${start.page + 1} → ${afterKey}`);

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
