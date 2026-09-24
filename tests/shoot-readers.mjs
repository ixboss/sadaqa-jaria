#!/usr/bin/env node
// Visual check for docs/verification: Quran + Khatmah readers at 390x844,
// printed-page model. Saves PNGs next to the repo's other test artifacts.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = 9227;
const BROWSER = join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const OUT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'shots');

let ws, idSeq = 0;
const pending = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const profileDir = mkdtempSync(join(tmpdir(), 'shots-'));
const browser = spawn(BROWSER, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
  '--window-size=390,844', `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let page = null;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = await res.json();
    page = targets.find(t => t.type === 'page');
    if (page) break;
  } catch { /* not up yet */ }
  await sleep(250);
}
if (!page) throw new Error('no page target');
await new Promise((res, rej) => {
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onopen = res; ws.onerror = rej;
});
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaljs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('saved shots/' + name);
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(2500);
await evaljs(`localStorage.clear()`);
await send('Page.navigate', { url: BASE });
await sleep(2500);
for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('.surah-row')`); i++) await sleep(150);
await evaljs(`document.getElementById('occasion-overlay')?.classList.remove('active')`);
await sleep(300);

// Quran reader, Al-Fatiha at the default (100%)
await evaljs(`window.switchTab('quran'); window.openSurah(1, 1)`);
for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('#verses-container .mushaf-block .ayah')`); i++) await sleep(150);
await sleep(1000);
await shot('quran-fatiha-100.png');

// Quran reader, Al-Baqarah p1 — denser, still no scroll at default
await evaljs(`window.openSurah(2, 1)`);
for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('#verses-container .mushaf-block .ayah')`); i++) await sleep(150);
await sleep(1000);
await shot('quran-baqarah-100.png');

// Khatmah reader page 604 (three short surahs)
await evaljs(`(() => { state.khatmah = state.khatmah || {}; Object.assign(state.khatmah,
  { todayWirdStart:604, todayWirdEnd:604, currentPage:604, pagesPerDay:1, lastActiveDate:'x' });
  window.openKhatmahReader(); window.loadKhatmahPage(604); })()`);
for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('#khatmah-page-container .mushaf-block .ayah')`); i++) await sleep(150);
await sleep(1100);
await shot('khatmah-604-100.png');

// Same page at 200% — shows the scrollable region
await evaljs(`window.applyFontSize(2.0)`);
await sleep(1200);
await shot('khatmah-604-200.png');
await evaljs(`window.applyFontSize(1.0)`);
await sleep(800);

// Nav bar: tap each tab, capture the active icon state
await evaljs(`window.switchTab('athkar')`);
await sleep(700);
await shot('nav-athkar-active.png');

browser.kill();
process.exit(0);
