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
 *   (a) Surah mode: gap header→first ayah text ≤ 290px at 100% font scale
 *       (re-verified 272px; see docs/QURAN_LAYOUT.md for the full stack)
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
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => {
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
});

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
  // Headless Edge lists its own built-in extension background pages and service
  // workers first; targets[0] is one of those, and evaluating there runs in an
  // extension context where the app's globals do not exist.
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target among ' + targets.map(t => t.type).join(','));
  const wsUrl = page.webSocketDebuggerUrl;
  await connect(wsUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  try {
    // ─── (a) Surah mode: bismillah + label spacing ────────────
    console.log('(a) Surah mode spacing...');
    await send('Page.navigate', { url: BASE });
    await sleep(1800);
    // a fresh profile is greeted by the once-per-day-period occasion popup
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);

    // Open Al-Baqarah (has bismillah)
    await evaljs(`window.openSurah(2, 1)`);
    for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('.mushaf-block .ayah')`); i++) await sleep(100);
    await sleep(400);

    // The documented baseline (docs/QURAN_LAYOUT.md) is measured at font scale
    // 1.0, not the app's larger default — measure both so a regression in
    // either is visible, and assert the verified current stack.
    const gap = await evaljs(`(() => {
      const header = document.querySelector('header');
      const firstAyah = document.querySelector('.mushaf-block .ayah');
      if (!firstAyah) return null;
      const r = e => Math.round(e.getBoundingClientRect().top);
      const bism = document.querySelector('.bismillah');
      return {
        gap: Math.round(firstAyah.getBoundingClientRect().top - header.getBoundingClientRect().bottom),
        headerBottom: Math.round(header.getBoundingClientRect().bottom),
        bismTop: bism ? r(bism) : null, bismH: bism ? Math.round(bism.getBoundingClientRect().height) : null,
        blockPad: parseInt(getComputedStyle(document.querySelector('.mushaf-block')).paddingTop, 10)
      };
    })()`);
    if (gap === null) throw new Error('No first ayah found');

    await evaljs(`window.applyFontSize(1.0)`);
    await sleep(500);
    const gapAt100 = await evaljs(`(() => {
      const firstAyah = document.querySelector('.mushaf-block .ayah');
      const header = document.querySelector('header');
      return Math.round(firstAyah.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    })()`);
    await evaljs(`window.applyFontSize(1.3)`);
    await sleep(400);

    ok('(a) Al-Baqarah: gap header→first-ayah at 100% ≤ 290px (verified baseline 272px)', gapAt100 <= 290, `gap@100%=${gapAt100}px gap@default=${gap.gap}px`);
    ok('(a) bismillah present above the first ayah', gap.bismTop !== null && gap.bismTop < gap.headerBottom + 260, JSON.stringify(gap));
    console.log(`  Al-Baqarah gap: ${gap.gap}px (default scale), ${gapAt100}px @100% — ${JSON.stringify(gap)} ✓`);

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
    await evaljs(`if (!window.state.khatmah) {
      document.getElementById('k-method').value = 'pages';
      document.getElementById('k-val').value = '7';
      document.getElementById('k-start').value = '1';
      window.startKhatmah();
    }`);
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
