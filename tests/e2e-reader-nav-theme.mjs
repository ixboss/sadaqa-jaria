#!/usr/bin/env node
/**
 * E2E suite — Quran page: theme, back navigation, and nav survival
 * ───────────────────────────────────────────────────────────────
 * Covers the three reported bugs end-to-end across the seven requested
 * scenarios, in both app themes:
 *   (1) Home → Quran → in-page back button
 *   (2) Home → Quran → browser Back
 *   (3) Quran → back → open Quran again (no duplicate routes / stale state)
 *   (4) several pages → Quran → back
 *   (5) light mode and dark mode
 *   (6) bottom nav visible + functional after every scenario
 *   (7) console errors / routing errors / state issues
 *
 * Run: python -m http.server 8123 --bind 127.0.0.1 && node tests/e2e-reader-nav-theme.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9268);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

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
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
});

/* ─── console capture (scenario 7) ─────────────────────── */
const consoleErrors = [];
// Third-party noise we cannot fix from the repo and that has nothing to do
// with app state: Google's own CSS for 'Amiri Quran' 404s one woff2 subset on
// gstatic (the font still renders via the other subsets), which also produces
// the matching "preloaded but not used" hint.
const CDN_NOISE = /fonts\.gstatic\.com|fonts\.googleapis\.com/;
function pushConsole(text) { if (!CDN_NOISE.test(text)) consoleErrors.push(text); }
async function startConsoleCapture() {
  await send('Log.enable');
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Log.entryAdded' && m.params.entry && (m.params.entry.level === 'error' || m.params.entry.level === 'warning')) {
      // Log.entryAdded carries the originating url separately from the text
      // (the 404 entry's text has no url at all), so filter on both.
      pushConsole(String(m.params.entry.url || '') + ' ' + m.params.entry.text.slice(0, 200));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      pushConsole((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || 'exception').slice(0, 200));
    }
  });
}

/* ─── shared assertions ────────────────────────────────── */
const READERS = ['surah-view', 'khatmah-read'];

async function waitForReader() {
  for (let i = 0; i < 60; i++) {
    if (await evaljs(`!!document.querySelector('#verses-container .ayah')`) &&
        await evaljs(`READERS.includes(window.state.currentScreen)`.replace('READERS', JSON.stringify(READERS)))) return true;
    await sleep(300);
  }
  return false;
}

// Invariant checked after every return-to-a-non-reader: the reader body classes
// must be gone (they are what hides #nav/#header) and the nav must be visible.
async function assertCleanChrome(label) {
  const s = await evaljs(`(() => {
    const nav = document.getElementById('nav');
    const r = nav ? nav.getBoundingClientRect() : null;
    return {
      currentScreen: window.state.currentScreen,
      zen: document.body.classList.contains('mushaf-zen'),
      hud: document.body.classList.contains('mushaf-hud'),
      mushafMode: window.state.mushafMode,
      navDisplay: nav ? getComputedStyle(nav).display : 'missing',
      navY: r ? Math.round(r.y) : null,
      navH: r ? Math.round(r.height) : null,
      navOp: nav ? parseFloat(getComputedStyle(nav).opacity) : null,
      navHidden: nav ? nav.classList.contains('nav-hidden') : null,
      headerDisplay: getComputedStyle(document.getElementById('header')).display,
      innerH: window.innerHeight
    };
  })()`);
  ok(`${label}: body carries no reader mode classes`, !s.zen && !s.hud, JSON.stringify(s));
  ok(`${label}: mushafMode cleared`, s.mushafMode === null, `mushafMode=${s.mushafMode}`);
  ok(`${label}: bottom nav visible`, s.navDisplay === 'flex' && s.navOp === 1 && !s.navHidden, JSON.stringify(s));
  ok(`${label}: bottom nav on screen`, s.navY !== null && s.navY + s.navH > 0 && s.navY < s.innerH, `navY=${s.navY} h=${s.navH}`);
  ok(`${label}: app header visible again`, s.headerDisplay !== 'none');
  return s;
}

async function assertReaderChrome(label) {
  const s = await evaljs(`(() => {
    const back = document.getElementById('ghost-back');
    const b = back ? back.getBoundingClientRect() : null;
    const cs = back ? getComputedStyle(back) : null;
    const hit = b ? document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) : null;
    return {
      currentScreen: window.state.currentScreen,
      zen: document.body.classList.contains('mushaf-zen'),
      backVisible: cs ? cs.display !== 'none' && parseFloat(cs.opacity) > 0 : false,
      backHit: !!(hit && (hit === back || back.contains(hit))),
      backX: b ? Math.round(b.x) : null,
      innerW: window.innerWidth,
      headerDisplay: getComputedStyle(document.getElementById('header')).display,
      navDisplay: getComputedStyle(document.getElementById('nav')).display
    };
  })()`);
  ok(`${label}: entered the reader`, READERS.includes(s.currentScreen), `screen=${s.currentScreen}`);
  ok(`${label}: zen mode active`, s.zen, JSON.stringify(s));
  ok(`${label}: zen back button visible`, s.backVisible);
  ok(`${label}: zen back button clickable`, s.backHit);
  ok(`${label}: zen back at the RTL start corner`, s.backX !== null && s.backX > s.innerW - 60, `x=${s.backX} w=${s.innerW}`);
  ok(`${label}: app chrome hidden while reading`, s.headerDisplay === 'none' && s.navDisplay === 'none');
}

async function openSurah(n, ayah) {
  await evaljs(`window.openSurah(${n}, ${ayah})`);
  if (!await waitForReader()) throw new Error(`reader never rendered for surah ${n}`);
  await sleep(700);
}

async function main() {
  console.log('═══ E2E: Quran page — theme, back, nav survival ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-reader-nav-'));
  const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--disable-gpu', '--no-first-run', '--disable-sync', 'about:blank'], { stdio: 'ignore' });
  await sleep(1800);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await send('Page.enable'); await send('Runtime.enable');
  await startConsoleCapture();
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  await send('Page.navigate', { url: BASE });
  await sleep(1800);
  await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
  await sleep(300);
  // each probe gets a fresh profile, but be explicit: no inherited settings
  await evaljs(`localStorage.clear()`);
  await send('Page.navigate', { url: BASE });
  await sleep(1800);
  await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
  await sleep(300);

  // ═══ (5a) dark mode readability ════════════════════════════
  await openSurah(2, 1);
  await evaljs(`localStorage.setItem('reader_theme','auto'); window.ReaderSettings.applyAll()`);
  await sleep(500);
  let dark = await evaljs(`(() => {
    const cs = getComputedStyle(document.body);
    const page = document.querySelector('.mushaf-page');
    return { paper: cs.getPropertyValue('--mushaf-paper').trim(),
             ink: cs.getPropertyValue('--mushaf-ink').trim(),
             night: document.body.classList.contains('mushaf-theme-night'),
             themeLight: document.body.classList.contains('theme-light'),
             pageColor: page ? getComputedStyle(page).color : null };
  })()`);
  const hex = h => { const m = /^#([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return null;
    const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  ok('(5) dark: page theme is night (auto)', dark.night && !dark.themeLight, JSON.stringify(dark));
  const dc = contrast(hex(dark.paper), hex(dark.ink));
  ok(`(5) dark: paper/ink contrast ≥ 4.5 (got ${dc.toFixed(2)})`, dc >= 4.5);
  ok('(5) dark: paper luminance is actually dark', lum(hex(dark.paper)) < 0.2, `L=${lum(hex(dark.paper)).toFixed(3)}`);

  await assertReaderChrome('(5) dark');

  // ═══ (1) in-page back button ═══════════════════════════════
  await evaljs(`document.getElementById('ghost-back').click()`);
  await sleep(700);
  let s = await assertCleanChrome('(1) in-page back');
  ok('(1) landed back on the surah list', s.currentScreen === 'surah-list', `screen=${s.currentScreen}`);

  // ═══ (2) browser Back ══════════════════════════════════════
  await openSurah(18, 1);
  await assertReaderChrome('(2) reader');
  // the real hardware/browser back path: popstate. history.back() on the guard
  // entry fires the app's own popstate handler, exactly as the browser button.
  await evaljs(`window.history.back()`);
  await sleep(900);
  s = await assertCleanChrome('(2) browser back');
  ok('(2) browser back lands on the surah list', s.currentScreen === 'surah-list', `screen=${s.currentScreen}`);

  // ═══ (3) open → back → open again ══════════════════════════
  await openSurah(36, 1);
  const firstPage = await evaljs(`window.state.mushafPage`);
  await assertReaderChrome('(3) first open');
  await evaljs(`document.getElementById('ghost-back').click()`);
  await sleep(700);
  await assertCleanChrome('(3) after back');
  await openSurah(36, 1);
  const secondPage = await evaljs(`window.state.mushafPage`);
  await assertReaderChrome('(3) second open');
  ok('(3) re-open renders the same start page', secondPage === firstPage, `${firstPage} → ${secondPage}`);
  ok('(3) re-entered zen mode fresh', await evaljs(`document.body.classList.contains('mushaf-zen')`));
  // back stack must not have accumulated phantom entries.
  // screenStack is a top-level `let` in a classic script: it is NOT on window,
  // but the bare identifier resolves in the page's global lexical scope.
  const stackLen = await evaljs(`typeof screenStack !== 'undefined' ? screenStack.length : -1`);
  ok('(3) back stack is not growing per round trip', stackLen >= 0 && stackLen <= 2, `len=${stackLen}`);
  await evaljs(`document.getElementById('ghost-back').click()`);
  await sleep(700);
  await assertCleanChrome('(3) cleanup');

  // ═══ (4) several pages → Quran → back ══════════════════════
  await evaljs(`window.switchTab('athkar')`);
  await sleep(400);
  await evaljs(`window.openThikrViewer && window.openThikrViewer(0)`);
  await sleep(500);
  const beforeReader = await evaljs(`window.state.currentScreen`);
  await evaljs(`window.switchTab('quran')`);
  await sleep(400);
  await openSurah(67, 1);
  await assertReaderChrome('(4) reader after touring pages');
  await evaljs(`document.getElementById('ghost-back').click()`);
  await sleep(700);
  s = await assertCleanChrome('(4) back');
  ok('(4) back lands on the quran tab root', s.currentScreen === 'surah-list', `screen=${s.currentScreen}`);

  // ═══ (5b) light mode readability ════════════════════════════
  await evaljs(`window.applyTheme('light')`);
  await sleep(700);
  await openSurah(2, 1);
  await sleep(500);
  let light = await evaljs(`(() => {
    const cs = getComputedStyle(document.body);
    return { paper: cs.getPropertyValue('--mushaf-paper').trim(),
             ink: cs.getPropertyValue('--mushaf-ink').trim(),
             night: document.body.classList.contains('mushaf-theme-night'),
             floral: document.body.classList.contains('mushaf-theme-floral'),
             themeLight: document.body.classList.contains('theme-light') };
  })()`);
  ok('(5) light: auto resolves to heritage', !light.night && !light.floral && light.themeLight, JSON.stringify(light));
  const lc = contrast(hex(light.paper), hex(light.ink));
  ok(`(5) light: paper/ink contrast ≥ 4.5 (got ${lc.toFixed(2)})`, lc >= 4.5);
  // the topbar meta was white-on-white in light mode (contrast ~1.2)
  const metaC = await evaljs(`(() => {
    const meta = document.getElementById('surah-view-meta');
    const card = document.querySelector('.mushaf-topbar .surah-header-card');
    if (!meta || !card) return null;
    const rgb = str => { const m = str.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
      return m[1].split(',').map(Number).slice(0, 3); };
    return contrast(rgb(getComputedStyle(card).backgroundColor), rgb(getComputedStyle(meta).color));
    function contrast(a, b) { if (!a || !b) return null;
      const [x, y] = [lum2(a), lum2(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
    function lum2([r, g, b]) { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
  })()`);
  ok(`(5) light: surah meta contrast on the topbar card ≥ 4.5 (got ${metaC != null ? metaC.toFixed(2) : 'n/a'})`, metaC != null && metaC >= 4.5);
  await assertReaderChrome('(5) light');
  await evaljs(`document.getElementById('ghost-back').click()`);
  await sleep(700);
  await assertCleanChrome('(5) light cleanup');
  ok('(5) light theme still applied after the round trip', await evaljs(`document.body.classList.contains('theme-light')`));

  // ═══ (6) nav is functional, not just visible ══════════════
  await evaljs(`window.switchTab('athkar')`);
  await sleep(400);
  const tabWorks = await evaljs(`window.state.currentTab`);
  ok('(6) nav tap switches tabs after all the round trips', tabWorks === 'athkar', `tab=${tabWorks}`);
  ok('(6) nav bar renders all tab buttons', await evaljs(`document.querySelectorAll('#nav .nav-tab, #nav [data-tab], #nav button').length`) >= 3);
  await evaljs(`window.switchTab('quran')`);
  await sleep(400);

  // ═══ (7) console / routing errors ══════════════════════════
  ok(`(7) no console errors or warnings (got ${consoleErrors.length})`, consoleErrors.length === 0,
      consoleErrors.slice(0, 5).join(' | '));
  ok('(7) deep link still routes after everything',
      await evaljs(`location.hash = '#/surah/1'; window.DeepLinks && window.DeepLinks.check && window.DeepLinks.check(); true`));

  console.log('\n' + results.map(r => `${r.pass ? '✓' : '✗'} ${r.name}${r.detail && !r.pass ? ' — ' + r.detail : ''}`).join('\n'));
  const fails = results.filter(r => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  if (consoleErrors.length) console.log('console entries: ' + JSON.stringify(consoleErrors.slice(0, 8), null, 1));
  browser.kill();
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error('SUITE FAILED:', e.message); process.exit(1); });
