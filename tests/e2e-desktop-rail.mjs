#!/usr/bin/env node
// ============================================================================
// e2e-desktop-rail.mjs — the desktop (>=1024px) right navigation rail:
// full-height 88px glass rail on the RTL right edge, brand + 4 tabs + بحث,
// PERSISTENT inside المصحف (chrome-hidden must never trap the user on
// desktop), collapse/restore handle, and mobile dock behavior unchanged.
// Runs the v2 app headless (Edge + CDP, same harness as e2e-v2-phase4.mjs).
// ============================================================================
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_V2_PORT || 8132);
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9243);
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
  await sleep(360);
}

const dockRect = `(() => {
  const d = document.getElementById('glass-dock');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  const cs = getComputedStyle(d);
  return { w: r.width, top: r.top, bottom: r.bottom, right: r.right, left: r.left,
           opacity: cs.opacity, transform: cs.transform === 'none' ? 'none' : 'matrix' };
})()`;

async function main() {
  console.log('═══ E2E: desktop right rail — full height, persistent in المصحف ═══\n');
  const server = spawn(process.execPath, [join(ROOT, 'tests', 'run-server.mjs'), String(PORT)], { stdio: 'ignore' });
  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-rail-'));
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
    ok('boot: app ready', (await waitFor('window.__sadaqaReady === true', { timeout: 90000 })) === true);

    // ---------- desktop 1280×800 ----------
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await goto('#/today');
    const d = await evaljs(dockRect);
    ok('rail: full-height 88px rail flush with the right edge (RTL)',
      d && Math.round(d.w) === 88 && d.top === 0 && Math.abs(d.bottom - 800) < 2 && Math.abs(d.right - 1280) < 2,
      JSON.stringify(d));
    const railBits = await evaljs(`(() => ({
      tabs: document.querySelectorAll('#tabbar .tab-btn[data-tab]').length,
      search: getComputedStyle(document.getElementById('rail-search') ?? document.body).display !== 'none',
      brand: getComputedStyle(document.getElementById('rail-brand') ?? document.body).display !== 'none',
      collapse: getComputedStyle(document.getElementById('rail-collapse') ?? document.body).display !== 'none',
      restoreHidden: getComputedStyle(document.getElementById('rail-restore') ?? document.body).display === 'none',
    }))()`);
    ok('rail: brand mark + 4 tabs + بحث + collapse visible, restore hidden',
      railBits.tabs === 4 && railBits.search && railBits.brand && railBits.collapse && railBits.restoreHidden,
      JSON.stringify(railBits));
    const pad = await evaljs(`getComputedStyle(document.querySelector('.screen')).getPropertyValue('padding-inline-start')`);
    ok('rail: content clears the rail (padding-inline-start 96px)', pad === '96px', pad);
    const headerW = await evaljs(`document.querySelector('.screen > .screen-header')?.getBoundingClientRect().width ?? 0`);
    ok('rail: non-reading content capped to a desktop measure (≤800px)', headerW > 0 && headerW <= 802, `${headerW}px`);

    // rail persists inside المصحف (chrome-hidden must not hide it on desktop)
    await goto('#/mushaf-page?page=3');
    await waitFor(`!!document.querySelector('#mushaf-stage .mushaf-plate')`, { timeout: 20000 });
    const inMushaf = await evaljs(`${dockRect}`);
    ok('rail: persists inside المصحف while chrome-hidden', inMushaf && inMushaf.opacity === '1' && inMushaf.transform === 'none' && Math.abs(inMushaf.right - 1280) < 2,
      JSON.stringify(inMushaf));

    // collapse → restore (wait past the 320ms slide transition)
    await evaljs(`document.getElementById('rail-collapse')?.click()`);
    const collapsed = await waitFor(`(function(){ const d = document.getElementById('glass-dock'); if (!d) return null; const cs = getComputedStyle(d); return cs.opacity === '0' ? { opacity: cs.opacity, transform: cs.transform === 'none' ? 'none' : 'matrix' } : null; })()`, { timeout: 5000 });
    ok('rail: collapse handle slides the rail out', collapsed && collapsed.opacity === '0', JSON.stringify(collapsed));
    const restoreVisible = await waitFor(`getComputedStyle(document.getElementById('rail-restore')).display !== 'none'`, { timeout: 5000 });
    ok('rail: floating restore handle appears when collapsed', restoreVisible === true);
    await evaljs(`document.getElementById('rail-restore')?.click()`);
    const restored = await waitFor(`(function(){ const d = document.getElementById('glass-dock'); if (!d) return null; const cs = getComputedStyle(d); return cs.opacity === '1' && cs.transform === 'none' ? { opacity: cs.opacity } : null; })()`, { timeout: 5000 });
    ok('rail: restore handle brings the rail back', restored && restored.opacity === '1', JSON.stringify(restored));

    // ---------- mobile 390×844 — dock must behave as before ----------
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await goto('#/today');
    const mob = await evaljs(`${dockRect}`);
    ok('mobile: dock stays a bottom bar with search hidden from the dock',
      mob && mob.bottom <= 844 && mob.w > 300 && mob.opacity === '1',
      JSON.stringify(mob));
    const mobSearch = await evaljs(`getComputedStyle(document.getElementById('rail-search') ?? document.body).display`);
    ok('mobile: بحث rail item hidden', mobSearch === 'none', mobSearch);
    await goto('#/mushaf-page?page=3');
    await waitFor(`!!document.querySelector('#mushaf-stage .mushaf-plate')`, { timeout: 20000 });
    const mobMushaf = await waitFor(`(function(){ const d = document.getElementById('glass-dock'); if (!d) return null; const cs = getComputedStyle(d); return cs.opacity === '0' ? { opacity: cs.opacity } : null; })()`, { timeout: 5000 });
    ok('mobile: chrome-hidden still hides the dock inside المصحف (unchanged)',
      mobMushaf && mobMushaf.opacity === '0', JSON.stringify(mobMushaf));

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
