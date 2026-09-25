#!/usr/bin/env node
/**
 * Probe — geometry check of the new backup row at 320px and 390px widths:
 * no horizontal overflow, chips wrap without clipping, card fits the viewport.
 * Run: node tests/probe-backup-geometry.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9231);
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

const userDataDir = mkdtempSync(join(tmpdir(), 'probe-geom-'));
const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`, '--disable-gpu', '--no-first-run', '--disable-sync', 'about:blank'], { stdio: 'ignore' });

try {
  await sleep(1800);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await send('Page.enable');
  for (const width of [320, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: BASE });
    await sleep(2200);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(200);
    await evaljs(`window.openSettings()`);
    await sleep(400);
    const g = await evaljs(`(() => {
      const r = id => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const card = document.querySelector('.settings-backup-row')?.closest('.settings-card');
      const cb = card?.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - vw;
      return {
        vw, scrollOverflow: overflow,
        card: cb ? { x: Math.round(cb.x), w: Math.round(cb.width) } : null,
        export: r('backup-export'), import: r('backup-import'), clear: r('backup-clear'),
        rowH: Math.round(document.querySelector('.settings-backup-row')?.getBoundingClientRect().height || -1)
      };
    })()`);
    console.log(`@${width}px`, JSON.stringify(g));
    const inCard = g.export && g.import && g.clear && g.card &&
      g.export.x >= g.card.x && g.clear.x + g.clear.w <= g.card.x + g.card.w;
    console.log(`  chips inside card: ${!!inCard} | no horizontal overflow: ${g.scrollOverflow === 0} | all on screen: ${g.clear.x + g.clear.w <= g.vw}`);
  }
} finally {
  browser.kill();
}
