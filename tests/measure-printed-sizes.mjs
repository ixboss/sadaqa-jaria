#!/usr/bin/env node
// One-off measurement for docs/QURAN_LAYOUT.md: rendered mushaf font size per
// page under the printed-page model (no auto-fit), at slider 100 and 200.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = 9226;
const BROWSER = join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

let ws, idSeq = 0;
const pending = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const profileDir = mkdtempSync(join(tmpdir(), 'measure-'));
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

const report = async (container) => evaljs(`(() => {
  const w = document.querySelector('${container} .mushaf-page-wrap');
  const b = document.querySelector('${container} .mushaf-block');
  if (!w || !b) return 'null';
  return JSON.stringify({ fs: getComputedStyle(b).fontSize,
    wrapSh: w.scrollHeight, wrapCh: w.clientHeight,
    bw: b.scrollWidth, bcw: b.clientWidth,
    blocks: document.querySelectorAll('${container} .mushaf-block').length });
})()`);

const openSurah = async (n, ayah = 1) => {
  await evaljs(`window.switchTab('quran'); window.openSurah(${n}, ${ayah})`);
  for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('#verses-container .mushaf-block .ayah')`); i++) await sleep(150);
  await sleep(900);
};
const openKhatmah = async (pg) => {
  await evaljs(`(() => { state.khatmah = state.khatmah || {}; Object.assign(state.khatmah,
    { todayWirdStart:${pg}, todayWirdEnd:${pg}, currentPage:${pg}, pagesPerDay:1, lastActiveDate:'x' });
    window.openKhatmahReader(); window.loadKhatmahPage(${pg}); })()`);
  for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('#khatmah-page-container .mushaf-block .ayah')`); i++) await sleep(150);
  await sleep(1100);
};

const rows = [];
const measure = async (label, fn, container) => {
  await fn();
  for (const slider of [100, 200]) {
    await evaljs(`window.applyFontSize(${slider / 100})`);
    await sleep(1000);
    const s = await report(container);
    if (s === 'null') { rows.push([label, slider, 'null']); continue; }
    const m = JSON.parse(s);
    rows.push([label, slider, `fs=${m.fs} wrap=${m.wrapSh}/${m.wrapCh} hOv=${m.bw - m.bcw} blocks=${m.blocks}`]);
  }
};

await measure('Surah 1 (Al-Fatiha)', () => openSurah(1), '#verses-container');
await measure('Surah 2 p1 (Al-Baqarah)', () => openSurah(2), '#verses-container');
await measure('Surah 36 (Yaseen)', () => openSurah(36), '#verses-container');
await measure('Surah 67 (Al-Mulk)', () => openSurah(67), '#verses-container');
await measure('Khatmah page 30', () => openKhatmah(30), '#khatmah-page-container');
await measure('Khatmah page 604', () => openKhatmah(604), '#khatmah-page-container');

console.log('390x844, printed-page model (no auto-fit):');
for (const [label, slider, detail] of rows) console.log(`  ${label.padEnd(26)} @${String(slider).padEnd(4)} ${detail}`);

await evaljs(`window.applyFontSize(1.0)`);
await openSurah(2);
const gap = await evaljs(`(() => {
  const header = document.querySelector('header');
  const firstAyah = document.querySelector('.mushaf-block .ayah');
  return firstAyah ? firstAyah.getBoundingClientRect().top - header.getBoundingClientRect().bottom : null;
})()`);
console.log('  header->first-ayah gap (Al-Baqarah @100):', gap);

browser.kill();
process.exit(0);
