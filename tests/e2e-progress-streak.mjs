#!/usr/bin/env node
/**
 * E2E suite — Reading position restore & streak math
 * ─────────────────────────────────────────────────────
 * Phase 1 verification of the "continue reading" flow and the daily-streak
 * counter. The surah render uses the live alquran.cloud API (as
 * e2e-quran-layout.mjs does); the streak cases write synthetic day sets
 * straight into the stats store and assert the arithmetic.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1
 *   2) node tests/e2e-progress-streak.mjs
 *
 * Scenarios:
 *   (a) opening a surah records the position; after a reload the resume FAB
 *       offers it and resuming reopens the same surah and ayah
 *   (b) streak: consecutive days, today-not-read-yet, a gap, empty, future-only
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9226);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

let ws, idSeq = 0;
const pending = new Map();
async function connect(wsUrl) {
  await new Promise((res, rej) => {
    ws = new WebSocket(wsUrl);
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, m => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => {
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
});

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOffset = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

async function main() {
  console.log('═══ E2E: Reading position & streak ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-progress-'));
  const browser = spawn(BROWSER, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--disable-sync',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    await sleep(1800);
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('no page target among ' + targets.map(t => t.type).join(','));
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);

    // ─── (a) position record + restore ──────────────────────
    console.log('(a) reading position restore...');
    await evaljs(`window.openSurah(2, 5)`);
    let rendered = false;
    for (let i = 0; i < 50 && !(rendered = await evaljs(`!!document.querySelector('.mushaf-block .ayah')`)); i++) await sleep(100);
    if (!rendered) throw new Error('surah 2 never rendered (needs the live API)');
    await sleep(500);
    const pos = await evaljs(`(() => { const p = window.ReadingProgressManager.getLastPosition(); return p ? JSON.stringify(p) : null; })()`);
    ok('(a) position recorded on open', !!pos && JSON.parse(pos).surah === 2 && JSON.parse(pos).ayah === 5, pos);

    // reload and check the FAB on the Quran tab
    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);
    await evaljs(`window.switchTab('quran')`);
    await sleep(500);
    const fab = await evaljs(`(() => {
      const f = document.getElementById('resume-fab');
      return { visible: f.classList.contains('visible'), label: f.textContent.trim() };
    })()`);
    ok('(a) resume FAB visible after reload', fab.visible, JSON.stringify(fab));
    ok('(a) FAB names the last surah and ayah', fab.label.includes('البَقَرَة') && fab.label.includes('٥'), JSON.stringify(fab));

    await evaljs(`document.getElementById('resume-fab').click()`);
    await sleep(1800);
    const after = await evaljs(`JSON.stringify({
      surah: window.state.currentSurah && window.state.currentSurah.number,
      ayah: window.selectedAyahNo,
      hash: location.hash
    })`);
    const a = JSON.parse(after);
    ok('(a) resume reopens the same surah', a.surah === 2, after);
    ok('(a) resume restores the same ayah', a.ayah === 5, after);
    ok('(a) deep link updated to match', a.hash === '#/surah/2/5', after);

    // ─── (b) streak math ────────────────────────────────────
    console.log('\n(b) streak...');
    const streakFor = days => evaljs(`(() => {
      localStorage.setItem('app_stats_v1', JSON.stringify(${JSON.stringify({ days, totalTasbih: 0, totalPages: 0, athkarDays: {} })}));
      return window.StatsManager.getStreak();
    })()`);
    const t0 = dayOffset(0), tm1 = dayOffset(-1), tm2 = dayOffset(-2), tm3 = dayOffset(-3), tp1 = dayOffset(1);

    ok('(b) consecutive including today', await streakFor({ [t0]: 5, [tm1]: 5 }) === 2);
    ok('(b) today not read yet keeps the chain', await streakFor({ [tm1]: 5, [tm2]: 5 }) === 2);
    ok('(b) a gap breaks the chain', await streakFor({ [t0]: 5, [tm2]: 5, [tm3]: 5 }) === 1);
    ok('(b) no data is zero', await streakFor({}) === 0);
    ok('(b) future-only entry does not count', await streakFor({ [t0]: 5, [tp1]: 5 }) === 1);

    // ─── report ──────────────────────────────────────────────
    console.log('\n' + '─'.repeat(40));
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    console.log('─'.repeat(40));
    console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
    if (results.some(r => !r.pass)) process.exitCode = 1;
  } finally {
    browser.kill();
  }
}

main().catch(e => { console.error('SUITE ERROR:', e); process.exit(1); });
