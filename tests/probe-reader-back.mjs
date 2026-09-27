#!/usr/bin/env node
/**
 * Probe — reader chrome + back affordances after the layering fix.
 * - zen: ghost back button visible & clickable at the start corner, no header/nav
 * - hud : app header hidden, topbar visible at the top edge, every topbar button
 *         actually hit-testable (was the whole point: z-index 7 < header 100)
 * - both: navigateBack() fires from each back affordance
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8123/index.html';
const CDP_PORT = 9275;
const BROWSER = join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

let ws, idSeq = 0;
const pending = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq; pending.set(id, m => m.error ? rej(m.error) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => {
  if (r.exceptionDetails) throw new Error('eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
});

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

const btnInfo = (sel) => evaljs(`(() => {
  const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
  const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
    op: parseFloat(cs.opacity), display: cs.display,
    hitId: hit ? (hit.id || hit.className || hit.tagName) : 'none',
    hitSelf: !!hit && (hit === e || e.contains(hit)) };
})()`);

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'probe-back-'));
  const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--disable-gpu', '--no-first-run', '--disable-sync', 'about:blank'], { stdio: 'ignore' });
  await sleep(1800);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: BASE });
  await sleep(1800);
  await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
  await sleep(300);
  await evaljs(`localStorage.clear()`);
  await send('Page.navigate', { url: BASE });
  await sleep(1800);
  await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
  await sleep(200);
  await evaljs(`window.openSurah(2, 1)`);
  for (let i = 0; i < 60; i++) { if (await evaljs(`!!document.querySelector('#verses-container .ayah')`)) break; await sleep(300); }
  await sleep(800);

  // ── ZEN ──
  const zenHeader = await evaljs(`getComputedStyle(document.getElementById('header')).display`);
  const zenNav = await evaljs(`getComputedStyle(document.getElementById('nav')).display`);
  ok('zen: app header hidden', zenHeader === 'none', `display=${zenHeader}`);
  ok('zen: bottom nav hidden', zenNav === 'none', `display=${zenNav}`);
  const zenBack = await btnInfo('#ghost-back');
  console.log('zen  #ghost-back →', JSON.stringify(zenBack));
  ok('zen: ghost back button visible', zenBack && zenBack.op > 0 && zenBack.display !== 'none');
  ok('zen: ghost back button hit-testable (not covered)', zenBack && zenBack.hitSelf, `hit=${zenBack && zenBack.hitId}`);
  ok('zen: ghost back sits at the start corner (right edge in RTL)', zenBack && zenBack.x > 390 - 60, `x=${zenBack && zenBack.x}`);
  const hudBackInZen = await btnInfo('#mt-back');
  // RTL: inset-inline-start = right. And the topbar carries opacity 0 + pointer-events
  // none in zen, so the button may report its own opacity 1 yet be unclickable.
  ok('zen: HUD back button unreachable in zen', hudBackInZen && hudBackInZen.hitSelf === false);

  // zen back actually navigates back
  await evaljs(`document.getElementById('ghost-back').click()`);
  await sleep(600);
  const afterZenBack = await evaljs(`window.state.currentScreen`);
  ok('zen: ghost-back click → navigateBack lands on surah-list', afterZenBack === 'surah-list', `got ${afterZenBack}`);
  await evaljs(`window.openSurah(2, 1)`);
  for (let i = 0; i < 60; i++) { if (await evaljs(`!!document.querySelector('#verses-container .ayah')`)) break; await sleep(300); }
  await sleep(600);

  // ── HUD ──
  await evaljs(`window.toggleMushafHUD()`);
  await sleep(700);
  const hudHeader = await evaljs(`getComputedStyle(document.getElementById('header')).display`);
  ok('hud: app header hidden (was covering the topbar)', hudHeader === 'none', `display=${hudHeader}`);
  const hudNav = await evaljs(`getComputedStyle(document.getElementById('nav')).display`);
  ok('hud: bottom nav visible', hudNav !== 'none', `display=${hudNav}`);
  const topbar = await btnInfo('#mushaf-topbar');
  console.log('hud  #mushaf-topbar →', JSON.stringify(topbar));
  ok('hud: topbar at the top edge of the screen', topbar && topbar.y === 0, `y=${topbar && topbar.y}`);
  ok('hud: topbar visible', topbar && topbar.op === 1);
  for (const [sel, label] of [['#mt-back', 'back'], ['#mt-index', 'index'], ['#mt-search', 'search'], ['#mt-settings', 'settings']]) {
    const b = await btnInfo(sel);
    ok(`hud: ${label} button hit-testable (not behind the header)`, b && b.hitSelf, `hit=${b && b.hitId}`);
    ok(`hud: ${label} button visible`, b && b.op === 1 && b.display !== 'none');
  }
  const ghostInHud = await btnInfo('#ghost-back');
  ok('hud: zen ghost back is hidden', ghostInHud && ghostInHud.op === 0);

  // reading-progress container survived the relocation and is inside the topbar
  const rpc = await evaljs(`(() => {
    const c = document.getElementById('reading-progress-container');
    return { insideTopbar: !!(c && c.closest('.mushaf-topbar')),
             display: c ? c.style.display : 'missing' };
  })()`);
  ok('hud: reading-progress container lives inside the topbar', rpc.insideTopbar, JSON.stringify(rpc));

  // hud back actually navigates
  await evaljs(`document.getElementById('mt-back').click()`);
  await sleep(600);
  const afterHudBack = await evaljs(`window.state.currentScreen`);
  ok('hud: mt-back click → navigateBack lands on surah-list', afterHudBack === 'surah-list', `got ${afterHudBack}`);

  console.log('\n' + results.map(r => `${r.pass ? '✓' : '✗'} ${r.name}${r.detail && !r.pass ? ' — ' + r.detail : ''}`).join('\n'));
  const fails = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  browser.kill();
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
