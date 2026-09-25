#!/usr/bin/env node
/**
 * Probe — screenshot the settings screen (incl. new backup rows) at 390px.
 * Run: node tests/probe-settings-screen.mjs   →  writes tests/settings-screen.png
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9229);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const OUT = join(process.cwd(), 'tests', 'settings-screen.png');

let ws, idSeq = 0;
const pending = new Map();
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
}
const send = (method, params = {}) => new Promise((res) => {
  const id = ++idSeq;
  pending.set(id, m => res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const userDataDir = mkdtempSync(join(tmpdir(), 'probe-settings-'));
const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`, '--disable-gpu', '--no-first-run', '--disable-sync', 'about:blank'], { stdio: 'ignore' });

try {
  await sleep(1800);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  await connect(page.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: BASE });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: `document.getElementById('occasion-modal-ok')?.click()` });
  await sleep(300);
  await send('Runtime.evaluate', { expression: `window.openSettings()` });
  await sleep(600);
  // مرّر إلى قسم النسخ الاحتياطي في الأسفل
  await send('Runtime.evaluate', { expression: `document.getElementById('backup-clear')?.scrollIntoView({block:'center'})` });
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('saved', OUT);
} finally {
  browser.kill();
}
