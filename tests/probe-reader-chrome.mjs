#!/usr/bin/env node
/** Probe — reader chrome geometry: where do #header / topbar / ghost sit in zen vs HUD? */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:8123/index.html';
const CDP_PORT = 9274;
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

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

const geom = () => evaljs(`(() => {
  const r = el => { const e = document.getElementById(el); if (!e) return null;
    const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
      display: cs.display, op: parseFloat(cs.opacity), z: cs.zIndex, pos: cs.position }; };
  const off = el => { const e = document.querySelector(el); if (!e) return null;
    const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
      op: parseFloat(cs.opacity), z: cs.zIndex, pe: cs.pointerEvents }; };
  return {
    header: r('header'), nav: r('nav'),
    topbar: off('.mushaf-topbar'), ghost: off('.mushaf-ghost'),
    screen: off('#screen-mushaf'),
    bodyClasses: document.body.className,
    currentScreen: window.state ? window.state.currentScreen : null,
    ancestorOfTopbar: (document.querySelector('.mushaf-topbar').offsetParent || {}).id || 'none'
  };
})()`);

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'probe-chrome-'));
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
  let versesLoaded = false;
  for (let i = 0; i < 60; i++) { if (await evaljs(`!!document.querySelector('#verses-container .ayah')`)) { versesLoaded = true; break; } await sleep(300); }
  await sleep(800);

  console.log('ZEN  →', JSON.stringify(await geom(), null, 1));
  const zen = await geom();
  await evaljs(`window.toggleMushafHUD()`);
  await sleep(700);
  console.log('HUD  →', JSON.stringify(await geom(), null, 1));
  const hud = await geom();
  await evaljs(`window.toggleMushafHUD()`);
  await sleep(700);
  console.log('ZEN2 →', JSON.stringify(await geom(), null, 1));
  const zen2 = await geom();

  // كان يطبع الهندسة ثم exit(0) دائماً — الآن يفشل فعلياً عند كسر الشروط
  // (audit 2026-11)
  const checks = [
    ['verses rendered', versesLoaded],
    ['currentScreen is mushaf/surah view', typeof zen.currentScreen === 'string' && zen.currentScreen.length > 0],
    ['HUD toggle changes chrome', JSON.stringify(zen) !== JSON.stringify(hud)],
    ['HUD toggles back to ZEN', JSON.stringify(zen) === JSON.stringify(zen2)],
  ];
  let failures = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failures++;
  }
  browser.kill();
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
