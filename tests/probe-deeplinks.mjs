#!/usr/bin/env node
/**
 * Probe — cold-load deep links (manifest shortcuts + sitemap URLs).
 * Each case uses a distinct query string so the browser performs a REAL
 * document load, not a same-document fragment change (which would leave
 * the previous screen stack in place and produce false failures).
 * Run: node tests/probe-deeplinks.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html').replace(/[?#].*$/, '');
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9295);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

let ws, idSeq = 0;
const pending = new Map();
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
}
const send = (method, params = {}) => new Promise((res) => { const id = ++idSeq; pending.set(id, m => res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaljs = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true }).then(r => r.result?.value);

const CASES = [
  ['#/khatmah', 'khatmah-main'],
  ['#/athkar', 'athkar-list'],
  ['#/tasbih', 'tasbih'],
  ['#/bookmarks', 'bookmarks'],
  ['#/settings', 'settings'],
  ['#/quran', 'surah-list'],
  ['#/surah/18', 'surah-view'],
];

const userDataDir = mkdtempSync(join(tmpdir(), 'probe-deeplink-'));
const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`, '--disable-gpu', '--no-first-run', '--disable-sync', 'about:blank'], { stdio: 'ignore' });

let failures = 0;
try {
  await sleep(1800);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await send('Page.enable');

  CASES.forEach(([hash, want], i) => {
    // ?c=i يُجبر المتصفح على تحميل وثيقة جديدة فعلاً بدل تغيير الـ fragment فقط
    CASES[i] = [`${BASE}?c=${i}${hash}`, want];
  });

  for (const [url, want] of CASES) {
    await send('Page.navigate', { url });
    await sleep(2800);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(400);
    const got = await evaljs(`window.state && window.state.currentScreen`);
    const pass = got === want;
    if (!pass) failures++;
    console.log(`${pass ? '  ✓' : '  ✗'} ${url.replace(BASE, '').padEnd(16)} → ${got} (want ${want})`);
  }
} finally {
  browser.kill();
}
console.log(failures ? `\n${failures} failed` : '\nall deep links routed correctly');
process.exitCode = failures ? 1 : 0;
