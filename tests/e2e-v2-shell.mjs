#!/usr/bin/env node
// ============================================================================
// e2e-v2-shell.mjs — Phase 3 Golden Reference verification in a REAL browser.
// Guardrails (user mandate): QPC font parity (zero missing-glyph boxes), zero
// line overflow on page 1 / page 2 / densest page, spread mode, search FTS,
// shell chrome. Captures screenshots for visual review.
//
// Run:  node tests/e2e-v2-shell.mjs   (spawns its own static server + headless Edge)
// ============================================================================
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_V2_PORT || 8124);
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9235);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const BASE = `http://127.0.0.1:${PORT}/apps/web-desktop/index.html`;
const ARTIFACTS = join(ROOT, 'tests', 'v2-artifacts');

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };

let ws, idSeq = 0;
const pending = new Map();
const consoleErrors = [];
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text);
  };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaljs = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then((r) => {
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 500));
  return r.result?.value;
});
async function waitFor(expr, { timeout = 45000, interval = 300 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const v = await evaljs(expr).catch(() => null);
    if (v) return v;
    await sleep(interval);
  }
  return null;
}
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ARTIFACTS, name), Buffer.from(data, 'base64'));
}
async function goto(hash) {
  await evaljs(`location.hash = '${hash}'`);
  await sleep(350);
}

async function main() {
  mkdirSync(ARTIFACTS, { recursive: true });
  console.log('═══ E2E: v2 Golden Reference shell + Mushaf ═══\n');

  const server = spawn(process.execPath, [join(ROOT, 'tests', 'run-server.mjs'), String(PORT)], { stdio: 'ignore' });
  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-v2-'));
  const browser = spawn(BROWSER, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--disable-gpu', '--no-first-run', '--disable-sync', '--allow-file-access-from-files', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    await sleep(1800);
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Log.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: BASE });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    // 1. boot (db import ~42MB + wasm init)
    const ready = await waitFor('window.__sadaqaReady === true', { timeout: 90000 });
    ok('boot: app ready (bridge + opfs-sahpool db + router)', ready === true);

    // 2. shell chrome — unified 4-tab dock (no search orb; search in header/HUD)
    const chrome = await evaljs(`({ tabs: [...document.querySelectorAll('.glass-tabbar .tab-btn')].map(b => b.textContent.trim()),
      pill: !!document.getElementById('searchpill'), headerSearch: !!document.getElementById('today-search-btn'), current: document.querySelector('.glass-tabbar .tab-btn[aria-current]')?.dataset.tab })`);
    ok('shell: 4 primary tabs, no search orb, header search present', chrome.tabs.length === 4 && !chrome.pill && chrome.headerSearch, JSON.stringify(chrome.tabs));
    ok('shell: اليوم is the default screen', chrome.current === 'today');

    // 3. mushaf page 1 — font parity + zero overflow + no missing glyphs
    await goto('#/mushaf/page/1');
    const w1 = await waitFor(`document.querySelectorAll('.mushaf-plate[data-page="1"] .mw').length > 0`, { timeout: 30000 });
    ok('mushaf: page 1 renders word plates', w1 === true);
    const p1 = await evaljs(`(() => {
      const plate = document.querySelector('.mushaf-plate[data-page="1"]');
      const words = [...plate.querySelectorAll('.mw')];
      const uniqGlyphs = [...new Set(words.map(w => w.textContent))].join('');
      return {
        words: words.length,
        fontOk: document.fonts.check(\`1em QPC1-P\`, uniqGlyphs),
        overflow: [...plate.querySelectorAll('.mushaf-line')].filter(l => l.scrollWidth > l.clientWidth + 2).length,
        lines: plate.querySelectorAll('.mushaf-line').length,
        headerText: plate.querySelector('.kind-surah_name')?.textContent?.trim() || ''
      };
    })()`);
    ok('fonts: page 1 glyphs fully covered by QPC1 subset (no □ boxes)', p1.fontOk === true, `${p1.words} words`);
    ok('layout: zero line overflow on page 1', p1.overflow === 0, `${p1.lines} line slots`);
    ok('mushaf: page 1 = Al-Fatiha (header present)', p1.headerText.includes('ٱلْفَاتِحَة') || p1.headerText.includes('الفاتحة'), p1.headerText);
    await screenshot('v2-mushaf-p1.png');

    // 4. page 2: Al-Baqarah header + basmala + text
    await goto('#/mushaf/page/2');
    await waitFor(`document.querySelectorAll('.mushaf-plate[data-page="2"] .mw').length > 0`, { timeout: 30000 });
    const p2 = await evaljs(`(() => {
      const plate = document.querySelector('.mushaf-plate[data-page="2"]');
      const words = [...plate.querySelectorAll('.mw')];
      const uniqGlyphs = [...new Set(words.map(w => w.textContent))].join('');
      return { fontOk: document.fonts.check(\`1em QPC1-P\`, uniqGlyphs),
        overflow: [...plate.querySelectorAll('.mushaf-line')].filter(l => l.scrollWidth > l.clientWidth + 2).length,
        header: plate.querySelector('.kind-surah_name')?.textContent?.trim() || '',
        basmala: plate.querySelectorAll('.kind-bismillah').length };
    })()`);
    ok('mushaf: page 2 = Al-Baqarah header + basmala', p2.header.includes('البقرة') && p2.basmala >= 1, p2.header);
    ok('fonts: page 2 glyphs covered + zero overflow', p2.fontOk === true && p2.overflow === 0, `overflow=${p2.overflow}`);
    await screenshot('v2-mushaf-p2.png');

    // 5. densest page (max words) — the real 15-line stress test
    const dense = await evaljs(`window.__sadaqa.db.queryOne("SELECT page_number, COUNT(*) c FROM mushaf_words GROUP BY page_number ORDER BY c DESC LIMIT 1")`);
    await goto(`#/mushaf/page/${dense.page_number}`);
    await waitFor(`document.querySelectorAll('.mushaf-plate[data-page="${dense.page_number}"] .mw').length > 0`, { timeout: 30000 });
    const pd = await evaljs(`(() => {
      const plate = document.querySelector('.mushaf-plate[data-page="${dense.page_number}"]');
      const words = [...plate.querySelectorAll('.mw')];
      const uniqGlyphs = [...new Set(words.map(w => w.textContent))].join('');
      return { words: words.length,
        fontOk: document.fonts.check(\`1em QPC1-P\`, uniqGlyphs),
        overflow: [...plate.querySelectorAll('.mushaf-line')].filter(l => l.scrollWidth > l.clientWidth + 2).length,
        textLines: plate.querySelectorAll('.kind-text').length };
    })()`);
    ok(`mushaf: densest page ${dense.page_number} (${dense.c} words) zero overflow + glyphs covered`, pd.fontOk === true && pd.overflow === 0 && pd.words === dense.c, `textLines=${pd.textLines} overflow=${pd.overflow}`);
    await screenshot(`v2-mushaf-dense-${dense.page_number}.png`);

    // 6. ayah LONG-PRESS → highlight + action sheet → tafsir
    //    (single tap toggles the HUD only — the tap must NOT open the sheet)
    await goto('#/mushaf/page/1');
    await waitFor(`document.querySelectorAll('.mushaf-plate[data-page="1"] .mw').length > 0`, { timeout: 30000 });
    // single tap on an ayah word: HUD toggles, sheet must stay closed
    // (reader boots chrome-hidden, so lift it first and expect the tap to hide chrome again)
    const tapToggled = await evaljs(`(async () => {
      document.body.classList.remove('chrome-hidden');
      const mw = document.querySelector('.mushaf-plate[data-page="1"] .mw');
      const r = mw.getBoundingClientRect();
      mw.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2, pointerId: 1 }));
      await new Promise(res => setTimeout(res, 60));
      mw.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2, pointerId: 1 }));
      await new Promise(res => setTimeout(res, 120));
      return { hidden: document.body.classList.contains('chrome-hidden'), sheet: !!document.querySelector('.sheet-head h2') };
    })()`);
    ok('mushaf: single tap on an ayah toggles the HUD, never opens the sheet', tapToggled.hidden === true && tapToggled.sheet === false, JSON.stringify(tapToggled));
    await evaljs(`document.body.classList.remove('chrome-hidden')`);
    // retry the long-press: the plate may re-render between the wait and the press
    let sheetTitle = null;
    for (let attempt = 0; attempt < 3 && !sheetTitle; attempt++) {
      await evaljs(`(async () => {
        const mw = document.querySelector('.mushaf-plate[data-page="1"] .mw');
        const r = mw.getBoundingClientRect();
        mw.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2, pointerId: 2 }));
        await new Promise(res => setTimeout(res, 520));
        mw.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2, pointerId: 2 }));
      })()`);
      sheetTitle = await waitFor(`document.querySelector('.sheet-head h2')?.textContent`, { timeout: 8000 });
    }
    ok('ayah sheet: opens on 450ms long-press with surah title', (sheetTitle ?? '').includes('الفات') || (sheetTitle ?? '').includes('ٱلْفَات'), sheetTitle);
    await evaljs(`document.getElementById('ay-tafsir').click()`);
    const tafsirShown = await waitFor(`(document.getElementById('ay-extra')?.textContent || '').length > 40`, { timeout: 15000 });
    ok('ayah sheet: Muyassar tafsir renders', tafsirShown === true);
    await screenshot('v2-ayah-sheet.png');
    await evaljs(`document.getElementById('sh-close').click()`);

    // 6b. gesture & flip regressions (lostpointercapture recovery, right-click guard, rapid consecutive flip)
    const rightClickState = await evaljs(`(async () => {
      document.body.classList.add('chrome-hidden');
      const stage = document.getElementById('mushaf-stage');
      const r = stage.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 9, pointerType: 'mouse', button: 2 }));
      await new Promise(res => setTimeout(res, 40));
      stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 9, pointerType: 'mouse', button: 2 }));
      await new Promise(res => setTimeout(res, 40));
      return document.body.classList.contains('chrome-hidden');
    })()`);
    ok('mushaf: right-click does not toggle HUD', rightClickState === true, `chromeHidden=${rightClickState}`);

    const captureRecovered = await evaljs(`(async () => {
      document.body.classList.add('chrome-hidden');
      const stage = document.getElementById('mushaf-stage');
      const r = stage.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 10, pointerType: 'touch', button: 0 }));
      stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: cx + 28, clientY: cy, pointerId: 10, pointerType: 'touch', button: 0 }));
      stage.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 10 }));
      await new Promise(res => setTimeout(res, 30));
      stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 11, pointerType: 'touch', button: 0 }));
      await new Promise(res => setTimeout(res, 40));
      stage.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 11, pointerType: 'touch', button: 0 }));
      await new Promise(res => setTimeout(res, 80));
      const toggled = !document.body.classList.contains('chrome-hidden');
      document.body.classList.add('chrome-hidden');
      return toggled;
    })()`);
    ok('mushaf: lostpointercapture resets drag state so subsequent taps work', captureRecovered === true);

    await goto('#/mushaf/page/5');
    await waitFor(`document.querySelectorAll('.mushaf-plate[data-page="5"] .mw').length > 0`, { timeout: 30000 });
    await evaljs(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    })()`);
    const landed7 = await waitFor(`!!document.querySelector('.mushaf-plate[data-page="7"]')`, { timeout: 10000 });
    ok('mushaf: rapid consecutive flips advance 5 -> 7 without stalling on flipping lock', landed7 === true);

    // 7. universal search (FTS) — diacritic-insensitive
    await goto('#/today');
    await evaljs(`window.__sadaqa.renderSearchSheet()`);
    await waitFor(`!!document.getElementById('search-input')`, { timeout: 10000 });
    await evaljs(`const i = document.getElementById('search-input'); i.value = 'ٱلرَّحْمَن'; i.dispatchEvent(new Event('input'));`);
    const searchHasAyat = await waitFor(`[...document.querySelectorAll('.result-group h3')].some(h => h.textContent === 'الآيات')`, { timeout: 20000 });
    ok('search: vocalized query matches ayahs (FTS, offline)', searchHasAyat === true);
    await screenshot('v2-search.png');
    await evaljs(`document.getElementById('sh-close').click()`);

    // 8. spread mode (landscape ≥1024px)
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1.5, mobile: false });
    await goto('#/mushaf/page/3');
    await waitFor(`document.querySelectorAll('.mushaf-plate').length === 2`, { timeout: 30000 });
    const spread = await evaljs(`({ pages: [...document.querySelectorAll('.mushaf-plate')].map(p => Number(p.dataset.page)) })`);
    ok('spread: dual-page book pairing (3 right, 4 left)', spread.pages.join(',') === '3,4', JSON.stringify(spread.pages));
    await screenshot('v2-spread-3-4.png');
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    // 9. khatmah planner (write path: create plan → log page)
    await goto('#/mushaf/khatmah');
    await waitFor(`!!document.getElementById('k-start') || !!document.getElementById('k-read')`, { timeout: 15000 });
    const hasPlanner = await evaljs(`!!document.getElementById('k-start')`);
    if (hasPlanner) {
      await evaljs(`document.getElementById('k-mode').value = 'rate'; document.getElementById('k-mode').dispatchEvent(new Event('change'));`);
      await evaljs(`document.getElementById('k-start').click()`);
      await waitFor(`!!document.getElementById('k-complete')`, { timeout: 15000 });
    }
    await evaljs(`document.getElementById('k-complete')?.click()`);
    const logged = await evaljs(`window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM khatmah_page_log")`);
    ok('khatmah: plan + explicit page-log write works', (logged?.n ?? 0) >= 1, `${logged?.n} pages logged`);
    await screenshot('v2-khatmah.png');

    // 10. today screen (prayer engine live)
    await goto('#/today');
    const hero = await waitFor(`document.getElementById('hero-countdown')?.textContent?.length >= 5`, { timeout: 15000 });
    ok('today: next-prayer countdown live (shared engine)', hero === true);

    // 11. console cleanliness (allow favicon/network noise, catch real JS errors)
    const realErrors = consoleErrors.filter((t) => !/favicon|Failed to load resource|net::ERR|navigator.vibrate/i.test(t)); // vibrate block = headless-only gesture policy
    ok('console: no uncaught errors during the whole run', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    const passed = results.filter((r) => r.pass).length;
    console.log(`\n=== RESULT: ${passed}/${results.length} passed ===`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    browser.kill();
    server.kill();
  }
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
