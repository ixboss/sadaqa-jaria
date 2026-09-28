#!/usr/bin/env node
/**
 * Probe — reader contrast across the full theme matrix (light-theme bug)
 *
 * Drives the reader through every app-theme × page-theme combination and
 * measures the *computed* color of each reader element against its actual
 * background with WCAG relative luminance. Also covers:
 *  - direct theme switching without a reload
 *  - light → dark → light round trip (no stale colors)
 *  - reload persistence while a light page theme is stored
 *  - highlight / selection / reciting visibility on every paper
 *  - console errors during all of the above
 *
 * Throwaway evidence gatherer; committed suites live in tests/e2e-*.mjs.
 *
 * Harness notes (learned the hard way):
 *  - `.mushaf-page` paints via a CSS *gradient*, so its computed
 *    `backgroundColor` is `rgba(0,0,0,0)` — contrast against that is
 *    meaningless. Measure the resolved `--mushaf-paper` token instead.
 *  - Every themed color has a 0.2–0.4s transition; measuring immediately
 *    after a class change catches the animation mid-flight. Wait it out.
 *  - `location.hash = X` twice with the same value fires no hashchange;
 *    navigate with window.openSurah() instead.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9291);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
// CDN-side noise from Google's served font CSS; unfixable from the repo
const CDN_NOISE = /fonts\.gstatic\.com|fonts\.googleapis\.com/;
// pre-existing app.js render-timing race (observeReveal before AnimationManager.init)
const KNOWN_RACE = /observeReveal|_revealIO/;

let ws, idSeq = 0;
const pending = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq; pending.set(id, m => m.error ? rej(m.error) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => {
  if (r.exceptionDetails) throw new Error('eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
  return r.result?.value;
});

function lum([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [la, lb] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}
const parseColor = s => {
  if (Array.isArray(s)) return s.length >= 3 ? s.slice(0, 3) : null;
  if (!s) return null;
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (m) return m[1].split(',').map(Number).slice(0, 3);
  const h = String(s).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (h) {
    const v = h[1];
    return v.length === 3 ? v.split('').map(c => parseInt(c + c, 16))
                         : [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
  }
  return null;
};

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

const PROFILE = mkdtempSync(join(tmpdir(), 'quran-theme-matrix-'));
const chrome = spawn(BROWSER, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`,
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--window-size=390,844'
], { stdio: 'ignore' });

async function openReader() {
  await evaljs(`window.openSurah(18, 1); 'ok'`);
  // openSurah awaits fetchSurahData (cached after the first call) then renders;
  // poll for the page rather than sleeping a fixed time
  for (let i = 0; i < 40; i++) {
    const ready = await evaljs(`!!document.querySelector('.mushaf-page .mushaf-block')`);
    if (ready) return true;
    await sleep(150);
  }
  return false;
}

async function setAppTheme(t) {
  await evaljs(`(() => { const cur = localStorage.getItem('theme') || 'dark';
    if ((${t === 'light'}) !== (cur === 'light')) document.getElementById('theme-btn').click();
    return document.body.classList.contains('theme-light'); })()`);
  // theme crossfade + color transitions take up to 0.4s
  await sleep(700);
}
async function setPageTheme(t) {
  await evaljs(`(() => { localStorage.setItem('reader_theme', '${t}');
    if (window.ReaderSettings) ReaderSettings.applyAll(); return ReaderSettings.effectivePageTheme(); })()`);
  await sleep(600);
}

// One combined measurement of everything visible in the reader.
// Backgrounds are read as *resolved custom-property tokens* where the
// element paints with a gradient (see harness note above).
const MEASURE = `(() => {
  const q = s => document.querySelector(s);
  const cs = e => e ? getComputedStyle(e) : null;
  const page = q('.mushaf-page');
  const block = q('.mushaf-page .mushaf-block');
  const name = q('.mushaf-page .surah-h-name');
  const tbName = q('.mushaf-topbar .surah-h-name');
  const tbCard = q('.mushaf-topbar .surah-header-card');
  const meta = q('#surah-view-meta');
  const badge = q('.mushaf-page .ayah-badge');
  const bis = q('.mushaf-page .bismillah');
  const label = q('.mushaf-page .mushaf-page-label');
  const navPos = q('.mushaf-page .mushaf-nav-pos');
  const foot = q('#mushaf-page-foot');
  const ghost = q('.mushaf-ghost');
  const back = q('.mushaf-back');
  const mtBtn = q('.mushaf-topbar .mt-btn');
  const bm = q('.mushaf-topbar .bookmark-btn');
  const pageCs = cs(page);
  return {
    paperToken: pageCs?.getPropertyValue('--mushaf-paper').trim(),
    inkToken: pageCs?.getPropertyValue('--mushaf-ink').trim(),
    blockColor: cs(block)?.color,
    nameColor: cs(name)?.color,
    tbNameColor: cs(tbName)?.color,
    tbCardBg: cs(tbCard)?.backgroundColor,
    metaColor: cs(meta)?.color,
    badgeColor: cs(badge)?.color,
    badgeBg: cs(badge)?.backgroundColor,
    bisColor: cs(bis)?.color,
    labelColor: cs(label)?.color,
    navPosColor: cs(navPos)?.color,
    footColor: cs(foot)?.color,
    ghostColor: cs(ghost)?.color,
    backColor: cs(back)?.color,
    mtColor: cs(mtBtn)?.color,
    mtBg: cs(mtBtn)?.backgroundColor,
    bmBg: cs(bm)?.backgroundColor,
    bmColor: cs(bm)?.color,
    bodyCls: document.body.className,
    active: page !== null && block !== null,
  }; })()`;

const parseColorA = s => {
  if (!s) return null;
  const str = String(s).trim();
  const m = str.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  const c = parseColor(str);
  return c ? [c[0], c[1], c[2], 1] : null;
};

const norm = c => { const p = parseColor(c); return p ? p.join(',') : null; };

// the ayah badge paints a semi-transparent wash over the page paper, so its
// effective background is the wash composited onto the paper
const compositeOver = (wash, paper) => {
  const w = parseColorA(wash), p = parseColorA(paper);
  if (!w || !p) return null;
  const a = w[3];
  return [0, 1, 2].map(i => Math.round(w[i] * a + p[i] * (1 - a)));
};

function checkCombo(combo, r) {
  const paper = parseColor(r.paperToken);
  ok(`${combo} page-rendered`, r.active, r.active ? '' : 'no .mushaf-page/.mushaf-block in DOM');
  if (!paper) { ok(`${combo} paper-token`, false, `token=${r.paperToken}`); return; }
  // text elements: WCAG AA normal text
  const text = (lbl, fg, bg, min = 4.5) => {
    const f = parseColor(fg), b = parseColor(bg);
    if (!f || !b) { ok(`${combo} ${lbl}`, false, 'element missing'); return; }
    const c = contrast(f, b);
    ok(`${combo} ${lbl}`, c >= min, `${c.toFixed(2)} fg=${fg} bg=${bg}`);
  };
  text('quran-text', r.blockColor, r.paperToken);
  text('surah-title(in-page)', r.nameColor, r.paperToken);
  text('topbar-title', r.tbNameColor, r.tbCardBg);
  text('topbar-meta', r.metaColor, r.tbCardBg);
  text('bismillah', r.bisColor, r.paperToken);
  // .mushaf-page-label only exists in page mode, not in surah-view mode
  if (r.labelColor) text('page-label', r.labelColor, r.paperToken);
  text('nav-pos', r.navPosColor, r.paperToken);
  text('page-foot', r.footColor, r.paperToken);
  text('ghost', r.ghostColor, r.paperToken);
  text('mushaf-back', r.backColor, r.paperToken);
  text('mt-btn', r.mtColor, r.mtBg);
  // the unmarked bookmark circle is a translucent wash on the topbar card
  text('bookmark-btn', r.bmColor, compositeOver(r.bmBg, r.tbCardBg));
  text('ayah-badge', r.badgeColor, compositeOver(r.badgeBg, r.paperToken));
  text('ayah-badge-vs-paper', r.badgeColor, r.paperToken, 3.0);
  ok(`${combo} ink-token-resolved`, /^#[0-9a-f]{6}$/i.test(String(r.inkToken)), `ink=${r.inkToken}`);
  ok(`${combo} reader-mode-active`, /mushaf-(zen|hud)/.test(r.bodyCls), `cls=${r.bodyCls}`);
}

async function main() {
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      targets = await r.json();
      if (targets.find(t => t.type === 'page')) break;
    } catch (e) {}
    await sleep(300);
  }
  const page = targets.find(t => t.type === 'page');
  await connect(page.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  const consoleErrors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      const e = m.params.entry;
      // a "Failed to load resource" entry carries its URL on .url, not in .text
      const text = String(e.text || '') + ' ' + String(e.url || '');
      if (CDN_NOISE.test(text)) return;
      consoleErrors.push(`log.${e.level}: ${String(e.text || '').slice(0, 160)}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const desc = String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (CDN_NOISE.test(desc) || KNOWN_RACE.test(desc)) return;
      consoleErrors.push('exception: ' + desc.slice(0, 200));
    }
  });

  await send('Page.navigate', { url: BASE });
  await sleep(2200);
  await evaljs(`localStorage.clear(); location.reload(); 'ok'`);
  await sleep(2200);

  // ---- Part 1: the full 8-combination matrix ----
  const combos = [
    ['dark', 'auto'], ['dark', 'heritage'], ['dark', 'floral'], ['dark', 'night'],
    ['light', 'auto'], ['light', 'heritage'], ['light', 'floral'], ['light', 'night'],
  ];
  const snapshots = {};
  for (const [appTheme, pageTheme] of combos) {
    await setAppTheme(appTheme);
    await setPageTheme(pageTheme);
    const inReader = await openReader();
    ok(`matrix ${appTheme}/${pageTheme} reader-open`, inReader, inReader ? '' : 'screen-mushaf not active');
    if (!inReader) continue;
    const r = await evaljs(MEASURE);
    snapshots[`${appTheme}/${pageTheme}`] = r;
    checkCombo(`${appTheme}/${pageTheme}`, r);
  }

  // light page themes must actually be light-ish, dark ones dark — no cross-wiring
  const her = snapshots['dark/heritage'], nig = snapshots['dark/night'];
  if (her && nig) {
    ok('heritage-paper-is-light', lum(parseColor(her.paperToken)) > 0.55, her.paperToken);
    ok('night-paper-is-dark', lum(parseColor(nig.paperToken)) < 0.2, nig.paperToken);
    ok('heritage-ink-is-dark', lum(parseColor(her.blockColor)) < 0.3, her.blockColor);
    ok('night-ink-is-light', lum(parseColor(nig.blockColor)) > 0.6, nig.blockColor);
  }

  // ---- Part 2: direct switching re-resolves everything (no reload) ----
  await setAppTheme('dark');
  for (const t of ['heritage', 'floral', 'night', 'auto', 'heritage']) {
    await setPageTheme(t);
    const r = await evaljs(MEASURE);
    if (!r.active) { ok(`switch dark/${t}`, false, 'reader lost'); continue; }
    const c = contrast(parseColor(r.blockColor), parseColor(r.paperToken));
    ok(`switch dark/${t} text-contrast`, c >= 4.5, `${c.toFixed(2)} fg=${r.blockColor} paper=${r.paperToken}`);
  }
  await setAppTheme('light');
  for (const t of ['night', 'floral', 'heritage', 'auto', 'floral']) {
    await setPageTheme(t);
    const r = await evaljs(MEASURE);
    if (!r.active) { ok(`switch light/${t}`, false, 'reader lost'); continue; }
    const c = contrast(parseColor(r.blockColor), parseColor(r.paperToken));
    ok(`switch light/${t} text-contrast`, c >= 4.5, `${c.toFixed(2)} fg=${r.blockColor} paper=${r.paperToken}`);
  }

  // ---- Part 3: light → dark → light round trip, no stale colors ----
  await setAppTheme('light');
  await setPageTheme('heritage');
  const before = await evaljs(MEASURE);
  await setAppTheme('dark');
  await setAppTheme('light');
  const after = await evaljs(MEASURE);
  const same = ['paperToken', 'blockColor', 'nameColor', 'bisColor', 'labelColor', 'footColor', 'tbNameColor', 'metaColor']
    .every(k => norm(before[k]) === norm(after[k]));
  ok('roundtrip light-dark-light identical', same,
     same ? '' : `differs on: ${['paperToken','blockColor','nameColor','bisColor','labelColor','footColor','tbNameColor','metaColor'].filter(k => norm(before[k]) !== norm(after[k])).join(', ')}`);

  // ---- Part 4: highlight states stay visible on every paper ----
  for (const pageTheme of ['heritage', 'floral', 'night']) {
    await setAppTheme('dark');
    await setPageTheme(pageTheme);
    await openReader();
    const hi = await evaljs(`(() => {
      const ayah = document.querySelector('.mushaf-page .ayah');
      const word = ayah ? ayah.querySelector('.w') : null;
      if (!ayah || !word) return null;
      ayah.classList.add('selected'); ayah.classList.add('reciting');
      word.classList.add('reciting-now');
      return { paper: getComputedStyle(document.querySelector('.mushaf-page')).getPropertyValue('--mushaf-paper').trim() };
    })()`);
    if (!hi) { ok(`highlight ${pageTheme}`, false, 'no .ayah on page'); continue; }
    // transitions on .w color (200ms) and .ayah background (240ms) must settle
    await sleep(500);
    const m = await evaljs(`(() => {
      const ayah = document.querySelector('.mushaf-page .ayah.reciting.selected');
      const word = ayah ? ayah.querySelector('.w.reciting-now') : null;
      if (!ayah || !word) return null;
      const aCs = getComputedStyle(ayah), wCs = getComputedStyle(word);
      return { ayahBg: aCs.backgroundColor, ayahRing: aCs.boxShadow, wordColor: wCs.color, wordBg: wCs.backgroundColor };
    })()`);
    if (!m) { ok(`highlight ${pageTheme}`, false, 'classes did not stick'); continue; }
    const paper = parseColor(hi.paper);
    // the recited word is large Quran text — 3.0 is the AA large-text floor
    const wc = contrast(parseColor(m.wordColor), paper);
    ok(`highlight ${pageTheme} reciting-word`, wc >= 3.0, `${wc.toFixed(2)} fg=${m.wordColor} paper=${hi.paper}`);
    // the selected/reciting wash must differ from the bare paper to be perceptible
    const washBg = parseColor(m.ayahBg);
    ok(`highlight ${pageTheme} ayah-wash-present`, washBg.some((v, i) => Math.abs(v - paper[i]) > 2), `bg=${m.ayahBg} paper=${hi.paper}`);
    ok(`highlight ${pageTheme} ring-present`, m.ayahRing !== 'none', String(m.ayahRing).slice(0, 60));
  }

  // ---- Part 5: reload persistence while a light page theme is stored ----
  await setAppTheme('light');
  await setPageTheme('heritage');
  await openReader();
  await sleep(500);
  const preReload = await evaljs(MEASURE);
  await evaljs(`location.reload(); 'ok'`);
  // DeepLinks.init() re-applies the hash on boot, which re-opens the reader;
  // poll for it since init is deferred to requestIdleCallback
  let restored = false;
  for (let i = 0; i < 50; i++) {
    restored = await evaljs(`!!document.querySelector('.mushaf-page .mushaf-block')`);
    if (restored) break;
    await sleep(150);
  }
  ok('reload restores reader', restored, restored ? '' : 'no .mushaf-page after reload');
  if (restored) {
    const postReload = await evaljs(MEASURE);
    const same = ['paperToken', 'blockColor', 'nameColor', 'bisColor', 'labelColor', 'footColor']
      .every(k => norm(preReload[k]) === norm(postReload[k]));
    ok('reload light/heritage colors-persist', same,
       same ? '' : `pre block=${preReload.blockColor} paper=${preReload.paperToken} | post block=${postReload.blockColor} paper=${postReload.paperToken}`);
  }

  // ---- Part 6: console cleanliness ----
  ok('console clean across all theme ops', consoleErrors.length === 0,
     consoleErrors.length ? consoleErrors.slice(0, 4).join(' | ') : `${consoleErrors.length} messages`);

  // report
  const fails = results.filter(r => !r.pass);
  for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed`);
  if (fails.length) { console.log(`\nFAILURES:`); fails.forEach(f => console.log(`  ${f.name}: ${f.detail}`)); }
  chrome.kill();
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error('PROBE ERROR', e); chrome.kill(); process.exit(2); });
