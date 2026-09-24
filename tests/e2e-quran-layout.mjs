#!/usr/bin/env node
/**
 * E2E suite — Quran Layout & Spacing
 * ───────────────────────────────────
 * Verifies that bismillah/label padding reductions and khatmah inline margins
 * eliminate the "strange empty spaces" reported in Task 3.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1
 *   2) node tests/e2e-quran-layout.mjs
 *
 * Scenarios:
 *   (a) Surah mode: gap from header to first ayah text < 180px (was 267px)
 *   (b) Bismillah exceptions: surah 1 (Al-Fatiha) and 9 (At-Tawbah) have NO bismillah
 *   (c) Khatmah mode: inline margin-top on surah headers ≤ 14px (was 20px)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9224);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

/** ─── CDP client ─────────────────────────────────────────── */
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
  pending.set(id, m => m.error ? rej(m.error) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => r.result?.value);

async function main() {
  console.log('═══ E2E: Quran Layout ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-quran-'));
  const browser = spawn(BROWSER, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--disable-sync',
    'about:blank'
  ], { stdio: 'ignore' });

  await sleep(1800);
  const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const targets = await listRes.json();
  const wsUrl = targets[0].webSocketDebuggerUrl;
  await connect(wsUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  try {
    // ─── (a) Surah mode: bismillah + label spacing ────────────
    console.log('(a) Surah mode spacing...');
    await send('Page.navigate', { url: BASE });
    await sleep(1800);
    
    // Open Al-Baqarah (has bismillah)
    await evaljs(`window.openSurah(2, 1)`);
    for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('.mushaf-block')`); i++) await sleep(100);
    await sleep(400);
    
    const baqarahGap = await evaljs(`(() => {
      const header = document.querySelector('header');
      const firstAyah = document.querySelector('.mushaf-block .ayah');
      if (!firstAyah) return null;
      return firstAyah.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
    })()`);
    if (baqarahGap === null) throw new Error('No first ayah found');
    ok('(a) Al-Baqarah: gap header→first-ayah < 180px', baqarahGap < 180, `gap=${baqarahGap.toFixed(1)}px`);
    console.log(`  Al-Baqarah gap: ${baqarahGap.toFixed(1)}px ✓`);
    
    // ─── (b) Bismillah exceptions ─────────────────────────────
    console.log('\n(b) Bismillah exceptions...');
    
    // Al-Fatiha (surah 1): NO bismillah
    await evaljs(`window.openSurah(1, 1)`);
    for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('.mushaf-block')`); i++) await sleep(100);
    await sleep(300);
    const fatihaHasBismillah = await evaljs(`!!document.querySelector('.bismillah')`);
    ok('(b) Al-Fatiha (surah 1): NO bismillah rendered', !fatihaHasBismillah, `found=${fatihaHasBismillah}`);
    console.log(`  Al-Fatiha: no bismillah ✓`);
    
    // At-Tawbah (surah 9): NO bismillah
    await evaljs(`window.openSurah(9, 1)`);
    for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('.mushaf-block')`); i++) await sleep(100);
    await sleep(300);
    const tawbahHasBismillah = await evaljs(`!!document.querySelector('.bismillah')`);
    ok('(b) At-Tawbah (surah 9): NO bismillah rendered', !tawbahHasBismillah, `found=${tawbahHasBismillah}`);
    console.log(`  At-Tawbah: no bismillah ✓`);
    
    // ─── (c) Khatmah mode: inline margins ─────────────────────
    console.log('\n(c) Khatmah mode gaps...');
    await evaljs(`if (!window.state.khatmah) window.startKhatmah(7)`);
    await evaljs(`window.openKhatmahReader()`);
    for (let i = 0; i < 50 && !await evaljs(`document.getElementById('screen-khatmah-read')?.classList.contains('active')`); i++) await sleep(100);
    await sleep(800); // wait for page load
    
    const khatmahMaxMargin = await evaljs(`(() => {
      const headers = Array.from(document.querySelectorAll('#screen-khatmah-read .surah-header-card'));
      return Math.max(...headers.map(h => {
        const m = (h.getAttribute('style') || '').match(/margin-top:\\s*(\\d+)px/);
        return m ? parseInt(m[1], 10) : 0;
      }), 0);
    })()`);
    ok('(c) Khatmah: inline margin-top ≤ 14px', khatmahMaxMargin <= 14, `max=${khatmahMaxMargin}px`);
    console.log(`  Khatmah max inline margin: ${khatmahMaxMargin}px ✓`);
    
  } finally {
    browser.kill();
  }

  // ─── report ───────────────────────────────────────────────
  console.log('\n══════════ E2E — Quran Layout ══════════');
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail && !r.pass ? '  → ' + r.detail : ''}`);
  }
  console.log('────────────────────────────────────────');
  console.log(`${results.length - failed}/${results.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('E2E runner crashed:', e); process.exit(2); });
