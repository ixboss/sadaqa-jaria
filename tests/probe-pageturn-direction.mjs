#!/usr/bin/env node
/**
 * Probe — Quran page-turn direction (gesture ↔ fold animation ↔ page index)
 *
 * Synthesizes REAL pointer drags through PageFlipEngine on the live reader and
 * observes all three axes of the turn at once:
 *   - the gesture (dx sign of the drag we dispatch)
 *   - the fold animation (the live transformOrigin / rotateY / translate3d that
 *     applyDrag paints mid-drag, sampled while the pointer is still down)
 *   - the navigation (state.mushafPage + the rendered footer page number)
 *
 * Covers both readers (surah-view + khatmah-read share #screen-mushaf), both
 * layout viewports (mobile portrait + desktop landscape, with the runtime
 * mushafPageStep() detected rather than assumed), both motion paths (3D fold
 * + prefers-reduced-motion flat translate), the on-screen prev/next buttons,
 * both page boundaries, rapid consecutive swipes, the flip lock (no double
 * advance), deep links, in-app back, khatmah progress, and console cleanliness.
 *
 * Run pre-fix with `node tests/probe-pageturn-direction.mjs current` to
 * confirm today's (inverted) mapping, then plain (fixed) to assert the
 * physical right-spined Quran contract.
 *
 * Throwaway evidence gatherer; committed suites live in tests/e2e-*.mjs.
 *
 * Harness notes (learned the hard way):
 *  - Input.dispatchMouseEvent (mouse) generates PointerEvents, which is what
 *    PageFlipEngine listens for. Raw Input.dispatchTouchEvent does NOT
 *    synthesize pointer/click in headless Chromium — don't use it here.
 *  - The boot-time occasion reminder overlay (z-index 999, position:fixed)
 *    covers the whole reader and sits in PageFlipEngine's isControl() list, so
 *    a drag started under it is silently dropped. Dismiss it before dragging.
 *  - The drag must start on the page BODY: dragPoint self-validates with
 *    elementFromPoint and refuses to return a point over a control or overlay.
 *  - The drag direction must be *dominantly horizontal*: onMove bails to the
 *    browser (pan-y) if |dy| > |dx|, and the direction locks after 10px.
 *  - PageFlipEngine ignores every drag while a flip is in flight (~480ms), so
 *    consecutive swipes must be spaced past that lock window or they are
 *    deliberately dropped (that's the no-duplicate guarantee, tested below).
 *  - The footer label (#mushaf-page-foot .mpf-page) carries the page number in
 *    Arabic-Indic digits and is written by syncMushafChrome on every render,
 *    so it is the render-complete signal.
 *  - Never await the same async twice in one ok() call: JS evaluates ok()'s
 *    arguments left to right, so the assertion and the detail see different
 *    moments of a still-settling page.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODE = process.argv[2] === 'current' ? 'current' : 'fixed';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9297);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const CDN_NOISE = /fonts\.gstatic\.com|fonts\.googleapis\.com/;
const KNOWN_RACE = /observeReveal|_revealIO/;

// The contract under test. Today (current) a right→left drag calls NEXT and a
// right-spined fold plays for it — gesture and fold disagree. After the fix a
// right→left drag goes to the PREVIOUS page and the fold follows the finger.
// FWD = the direction that advances the page in each mode.
const EXPECT = MODE === 'current'
  ? { rtlDelta: +1, rtlOrigin: 'right center', ltrDelta: -1, ltrOrigin: 'left center', fwd: 'rtl' }
  : { rtlDelta: -1, rtlOrigin: 'left center', ltrDelta: +1, ltrOrigin: 'right center', fwd: 'ltr' };

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

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

const arabic = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

// --------------------------------------------------------------- page state
const curPage = () => evaljs(`(window.state || {}).mushafPage || 0`);
const curFoot = () => evaljs(`(document.querySelector('#mushaf-page-foot .mpf-page') || {}).textContent || ''`);
const isFlipping = () => evaljs(`window.PageFlipEngine ? PageFlipEngine.isFlipping() : false`);

// the boot-time occasion reminder + any dialog cover the reader and swallow
// drags (their buttons are in PageFlipEngine's isControl list) — clear them
const dismissOverlays = () => evaljs(`(() => {
  ['occasion-overlay', 'custom-dialog-overlay'].forEach(id => {
    const o = document.getElementById(id);
    if (o && o.classList.contains('active')) { o.classList.remove('active'); }
  });
  return true; })()`);

async function waitForPage(n, timeout = 6000) {
  const want = arabic(n);
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const [label, flipping] = await evaljs(`[
      (document.querySelector('#mushaf-page-foot .mpf-page') || {}).textContent || '',
      window.PageFlipEngine ? PageFlipEngine.isFlipping() : false
    ]`);
    if (label === want && !flipping) return true;
    await sleep(100);
  }
  return false;
}

// The flip lock (`flipping`) goes false *synchronously* in the boundary
// spring-back path while the 260ms fold transition is still animating, so
// polling isFlipping() alone can leave us sampling the page mid-fold (an
// edge-on page projects to a ~50px-wide rect). Also require the rendered
// rect to be back to a sane width and the transform target to be identity.
async function waitForSettled(timeout = 2400) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await evaljs(`(() => {
      const vp = document.getElementById('mushaf-viewport');
      const pg = document.querySelector('.mushaf-page');
      if (!vp || !pg) return { err: 1 };
      const r = pg.getBoundingClientRect();
      return { flipping: window.PageFlipEngine ? PageFlipEngine.isFlipping() : false,
        w: r.width, vw: vp.clientWidth,
        tf: pg.style.transform || '',
        opacity: parseFloat(pg.style.opacity || '1') }; })()`);
    if (!s.err && !s.flipping && s.w >= s.vw * 0.3 &&
        (s.tf === '' || /rotateY\(0deg\)/.test(s.tf) || /translate3d\(0(px)?, ?0(px)?, ?0(px)?\)/.test(s.tf)) &&
        s.opacity >= 0.999) return true;
    await sleep(90);
  }
  return false;
}

async function openPage(n) {
  await dismissOverlays();
  await evaljs(`window.__navlog && window.__navlog.splice(0); window.openMushafPage(${n}); 'ok'`);
  for (let i = 0; i < 60; i++) {
    const ready = await evaljs(`!!document.querySelector('.mushaf-page .mushaf-block') && (window.state||{}).mushafPage === ${n}`);
    if (ready) { await dismissOverlays(); return true; }
    await sleep(150);
  }
  const d = await evaljs(`JSON.stringify({
    page: (window.state||{}).mushafPage, screen: (window.state||{}).currentScreen,
    hasBlock: !!document.querySelector('.mushaf-page .mushaf-block'),
    foot: (document.querySelector('#mushaf-page-foot .mpf-page')||{}).textContent,
    navlog: (window.__navlog||[]).slice(-10) })`);
  ok(`openPage(${n}) loaded`, false, d);
  return false;
}

// A drag point on the page BODY, in viewport CSS pixels, self-validated with
// elementFromPoint so we never start a gesture on a button or an overlay.
// RTL layout does not affect clientX. Returns null if no clean point exists.
async function dragPoint() {
  return evaljs(`(() => {
    const vp = document.getElementById('mushaf-viewport');
    const page = document.querySelector('.mushaf-page');
    if (!vp || !page) return { err: 'no viewport/page', vp: !!vp, page: !!page };
    const vr = vp.getBoundingClientRect(), pr = page.getBoundingClientRect();
    const ctrl = 'button, a, input, select, textarea, label, .mushaf-nav, .mushaf-topbar, [data-no-flip]';
    for (const frac of [0.5, 0.35, 0.62, 0.25, 0.75, 0.42, 0.58]) {
      const y = Math.min(Math.max(pr.top + pr.height * frac, vr.top + 40), vr.bottom - 40);
      const t = document.elementFromPoint(pr.left + pr.width * 0.5, y);
      if (!t || !t.closest) continue;
      if (t.closest(ctrl)) continue;
      if (!t.closest('.mushaf-page')) continue;
      return { x1: pr.left + pr.width * 0.78, x2: pr.left + pr.width * 0.22, y, w: pr.width };
    }
    // nothing clean — dump enough geometry to diagnose
    const y0 = Math.min(Math.max(pr.top + pr.height * 0.5, vr.top + 40), vr.bottom - 40);
    const t0 = document.elementFromPoint(pr.left + pr.width * 0.5, y0);
    let chain = []; let n = t0;
    while (n && chain.length < 5) { chain.push((n.tagName || '?') + (n.id ? '#' + n.id : '') + '.' + String(n.className).split(' ')[0]); n = n.parentElement; }
    const sm = document.getElementById('screen-mushaf');
    const smCs = sm ? getComputedStyle(sm) : null;
    const hits = [];
    for (const yy of [100, 200, 300, 400, 530, 700]) {
      const h = document.elementFromPoint(pr.left + pr.width * 0.5, yy);
      hits.push(yy + ':' + (h ? (h.tagName || '?') + (h.id ? '#' + h.id : '') : 'null'));
    }
    return { err: 'no clean point', y: Math.round(y0), chain,
      pr: { top: Math.round(pr.top), h: Math.round(pr.height), w: Math.round(pr.width), left: Math.round(pr.left) },
      vr: { top: Math.round(vr.top), bottom: Math.round(vr.bottom), w: Math.round(vr.width), sw: vp.scrollLeft },
      iw: innerWidth, vv: window.visualViewport ? { scale: visualViewport.scale, w: Math.round(visualViewport.width) } : null,
      pages: [].slice.call(document.querySelectorAll('.mushaf-page')).map(p => {
        const r = p.getBoundingClientRect();
        return { id: p.id, w: Math.round(r.width), l: Math.round(r.left), t: Math.round(r.top), h: Math.round(r.height),
          disp: getComputedStyle(p).display, tf: (p.style.transform || '').slice(0, 40), vis: getComputedStyle(p).visibility }; }),
      screen: (window.state || {}).currentScreen, page: (window.state || {}).mushafPage,
      navlog: (window.__navlog || []).slice(-8),
      pageTf: page.style.transform, flipping: window.PageFlipEngine ? PageFlipEngine.isFlipping() : null,
      sm: smCs ? { display: smCs.display, visibility: smCs.visibility, opacity: smCs.opacity } : null,
      hits }; })()`);
}

// Real pointer drag: press, move in steps (sampling the live fold once
// mid-gesture), release. dir 'rtl' = finger travels right→left.
async function swipe(dir, opts = {}) {
  const p = await dragPoint();
  if (!p || p.err) throw new Error('no clean drag point on .mushaf-page: ' + JSON.stringify(p));
  const from = dir === 'rtl' ? p.x1 : p.x2;
  const to = dir === 'rtl' ? p.x2 : p.x1;
  const steps = opts.steps || 9;
  const stepMs = opts.stepMs || 45;
  const sampleAt = opts.sampleAt ?? 4;
  let mid = null;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    const x = from + (to - from) * (i / steps);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: p.y, button: 'left', buttons: 1 });
    if (i === sampleAt) {
      mid = await evaljs(`(() => { const pg = document.querySelector('.mushaf-page');
        return pg ? { tf: pg.style.transform || '', origin: pg.style.transformOrigin || '' } : null; })()`);
    }
    await sleep(stepMs);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  return mid;
}

// One full turn: drag, wait for the render to settle, report the outcome.
// Observes gesture (dir), fold (mid) and index (before→after) at once.
// step = navigation step (1 single, 2 two-page landscape) — a turn advances
// by one step in the direction of the gesture.
async function turn(dir, label, step = 1) {
  const before = await curPage();
  const mid = await swipe(dir);
  await waitForSettled();
  const after = await curPage();
  const foot = await curFoot();
  const want = EXPECT[dir === 'rtl' ? 'rtlDelta' : 'ltrDelta'] * step;
  ok(`${label} page-index`, after === before + want, `${before} → ${after} (want ${before + want}, foot ${foot})`);
  ok(`${label} footer-label`, foot === arabic(after), `foot=${foot} want=${arabic(after)}`);
  return { before, after, mid };
}

function checkFold(label, mid, dir) {
  if (!mid) { ok(`${label} mid-drag-sample`, false, 'no transform sampled mid-drag'); return; }
  if (/translate3d/.test(mid.tf)) {
    // reduced-motion flat path: the page must slide WITH the finger
    const m = mid.tf.match(/translate3d\(([-\d.]+)/);
    const tx = m ? parseFloat(m[1]) : 0;
    const follows = dir === 'rtl' ? tx < 0 : tx > 0;
    ok(`${label} flat-translate-follows-finger`, follows, `tf=${mid.tf} dir=${dir}`);
    return;
  }
  // 3D path: hinge on the spine side; the free edge lifts toward the viewer
  const wantOrigin = EXPECT[dir === 'rtl' ? 'rtlOrigin' : 'ltrOrigin'];
  ok(`${label} fold-origin=${wantOrigin}`, mid.origin === wantOrigin, `got=${mid.origin}`);
  const m = mid.tf.match(/rotateY\(([-\d.]+)/);
  const deg = m ? parseFloat(m[1]) : 0;
  ok(`${label} fold-plays`, Math.abs(deg) > 5, `tf=${mid.tf}`);
}

async function clickNav(id) {
  return evaljs(`(() => { const els = Array.from(document.querySelectorAll('#${id}'));
    const el = els.find(e => !e.disabled) || els[0];
    if (!el) return false; el.click(); return true; })()`);
}

// ------------------------------------------------------------------- console
const consoleErrors = [];
function wireConsole() {
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      const e = m.params.entry;
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
}

async function launch(viewport) {
  const profile = mkdtempSync(join(tmpdir(), 'quran-pageturn-'));
  const chrome = spawn(BROWSER, [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars',
    `--window-size=${viewport.w},${viewport.h}`
  ], { stdio: 'ignore' });
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
  await send('Emulation.setDeviceMetricsOverride', { width: viewport.w, height: viewport.h, deviceScaleFactor: 2, mobile: viewport.mobile });
  wireConsole();
  await send('Page.navigate', { url: BASE });
  await sleep(2200);
  await evaljs(`localStorage.clear(); location.reload(); 'ok'`);
  await sleep(2200);
  await dismissOverlays();
  const booted = await evaljs(`!!(window.MushafPageManager && window.PageFlipEngine && window.openMushafPage)`);
  ok(`boot viewport=${viewport.w}x${viewport.h}`, booted, booted ? '' : 'core modules missing');
  // record every reader-navigation call so a clobbering async render is visible
  await evaljs(`(window.__navlog = [], ['renderMushafPage','gotoMushafPage','openMushafPage','openSurah','openKhatmahReader','loadKhatmahPage'].forEach(fn => {
    if (typeof window[fn] !== 'function') return;
    const orig = window[fn];
    window[fn] = function () { window.__navlog.push([fn, JSON.stringify([].slice.call(arguments)).slice(0, 60), (window.state||{}).currentScreen]); return orig.apply(this, arguments); };
  }), 'ok')`);
  return chrome;
}

function report() {
  const fails = results.filter(r => !r.pass);
  for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed`);
  if (fails.length) { console.log(`\nFAILURES:`); fails.forEach(f => console.log(`  ${f.name}: ${f.detail}`)); }
}

async function readerPass(step, tag) {
  // 1+2+3: both directions on a mid page — gesture ↔ fold ↔ index
  await openPage(120);
  let r = await turn('rtl', `${tag} rtl(right→left)`, step);
  checkFold(`${tag} rtl`, r.mid, 'rtl');
  r = await turn('ltr', `${tag} ltr(left→right)`, step);
  checkFold(`${tag} ltr`, r.mid, 'ltr');

  // 4: on-screen buttons (surah-view only — khatmah renders no mp-prev/next)
  await openPage(200);
  const beforeBtn = await curPage();
  ok(`${tag} mp-next-present`, await clickNav('mp-next'), '#mp-next missing/disabled');
  await waitForPage(beforeBtn + step);
  let now = await curPage();
  ok(`${tag} mp-next=+${step}`, now === beforeBtn + step, `${beforeBtn} → ${now}`);
  ok(`${tag} mp-prev-present`, await clickNav('mp-prev'), '#mp-prev missing/disabled');
  await waitForPage(beforeBtn);
  now = await curPage();
  ok(`${tag} mp-prev=-${step}`, now === beforeBtn, `${beforeBtn + step} → ${now}`);

  // 5: first-page boundary — the previous direction must clamp and spring
  //    back twice in a row, never undershoot below 1
  await openPage(1);
  await swipe(EXPECT.fwd === 'rtl' ? 'ltr' : 'rtl');   // the PREVIOUS direction at page 1
  await waitForSettled();
  await swipe(EXPECT.fwd === 'rtl' ? 'ltr' : 'rtl');   // and again — still clamped
  await waitForSettled();
  let at1 = await curPage();
  ok(`${tag} boundary-page1-holds`, at1 === 1, `page=${at1}`);
  ok(`${tag} boundary-page1-foot`, (await curFoot()) === arabic(1), `foot=${await curFoot()}`);

  // 6: last-page boundary — the next direction must clamp, never overshoot 604
  await openPage(604);
  await swipe(EXPECT.fwd);                              // the NEXT direction at 604
  await waitForSettled();
  await swipe(EXPECT.fwd);                              // and again — still clamped
  await waitForSettled();
  let at604 = await curPage();
  ok(`${tag} boundary-page604-holds`, at604 === 604, `page=${at604}`);
  ok(`${tag} boundary-page604-foot`, (await curFoot()) === arabic(604), `foot=${await curFoot()}`);

  // 7: three consecutive forward swipes land exactly +3*step — no skips/dupes
  await openPage(300);
  const startRapid = await curPage();
  for (let i = 0; i < 3; i++) {
    await swipe(EXPECT.fwd);
    await waitForSettled();
    await sleep(120);
  }
  const endRapid = await curPage();
  ok(`${tag} rapid-3-swipes=+${3 * step}`, endRapid === startRapid + 3 * step, `${startRapid} → ${endRapid}`);

  // 7b: a swipe fired DURING a flip is dropped by the lock — never a double
  await openPage(400);
  const startLock = await curPage();
  await swipe(EXPECT.fwd, { steps: 3, stepMs: 30 });
  await sleep(140);                                     // mid-fold
  await swipe(EXPECT.fwd, { steps: 3, stepMs: 30 });    // must be ignored
  await waitForSettled();
  now = await curPage();
  ok(`${tag} flip-lock-no-double`, now === startLock + step, `${startLock} → ${now}`);

  // 9: deep link opens the exact page
  await evaljs(`window.openMushafPage(42); 'ok'`);
  ok(`${tag} deeplink-opens-42`, await waitForPage(42) && (await curPage()) === 42, `page=${await curPage()}`);

  // 10: in-app back still exits the reader after turns, hash stays in sync
  await swipe(EXPECT.fwd);
  await waitForSettled();
  const hashBefore = await evaljs(`location.hash`);
  ok(`${tag} hash-tracks-reader`, /^#\/(surah|page)\//.test(hashBefore), `hash=${hashBefore}`);
  await evaljs(`document.getElementById('mt-back').click(); 'ok'`);
  await sleep(500);
  const exited = await evaljs(`!['surah-view','khatmah-read'].includes((window.state||{}).currentScreen)`);
  ok(`${tag} in-app-back-exits-reader`, exited, `screen=${await evaljs(`(window.state||{}).currentScreen`)}`);
}

async function khatmahPass(tag) {
  await evaljs(`(() => {
    window.state.khatmah = { active: true, method: 'pages', pagesPerDay: 20,
      currentPage: 100, todayWirdStart: 81, todayWirdEnd: 100, lastPageRead: 100,
      lastActiveDate: '2020-01-01' };
    window.saveState(); window.openKhatmahReader(); return 'ok'; })()`);
  ok(`${tag} khatmah-open`, await waitForPage(100), `page=${await curPage()}`);

  // a forward turn advances the reader and records progress
  await swipe(EXPECT.fwd);
  await waitForSettled();
  const fwd = await evaljs(`window.state.khatmah.currentPage`);
  ok(`${tag} khatmah-forward=+1`, fwd === 101, `currentPage=${fwd}`);
  let lastRead = await evaljs(`window.state.khatmah.lastPageRead`);
  ok(`${tag} khatmah-progress-recorded`, lastRead === 101, `lastPageRead=${lastRead}`);

  // a backward turn renders the previous page but must NOT reduce progress
  await swipe(EXPECT.fwd === 'rtl' ? 'ltr' : 'rtl');
  await waitForSettled();
  const back = await evaljs(`window.state.khatmah.currentPage`);
  const lastRead2 = await evaljs(`window.state.khatmah.lastPageRead`);
  ok(`${tag} khatmah-back=−1`, back === 100, `currentPage=${back}`);
  ok(`${tag} khatmah-progress-monotonic`, lastRead2 === 101, `lastPageRead=${lastRead2} (must stay 101)`);
}

async function reducedMotionPass() {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await openPage(150);
  let r = await turn('ltr', 'reduced-motion ltr');
  checkFold('reduced-motion ltr', r.mid, 'ltr');
  r = await turn('rtl', 'reduced-motion rtl');
  checkFold('reduced-motion rtl', r.mid, 'rtl');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] });
}

async function main() {
  console.log(`═══ Probe: page-turn direction (mode: ${MODE}) ═══\n`);

  // ---- mobile portrait ----
  const chrome1 = await launch({ w: 390, h: 844, mobile: true });
  try {
    const step1 = await evaljs(`window.mushafPageStep ? mushafPageStep() : 1`);
    ok('mobile step=1 (single layout)', step1 === 1, `step=${step1}`);
    await readerPass(step1 || 1, 'mobile');
    await khatmahPass('mobile');
    await reducedMotionPass();
    ok('mobile console clean', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } finally {
    chrome1.kill();
  }

  // ---- desktop landscape, single layout ----
  const chrome2 = await launch({ w: 1280, h: 800, mobile: false });
  try {
    const step2 = await evaljs(`window.mushafPageStep ? mushafPageStep() : 1`);
    ok(`desktop step detected`, step2 === 1 || step2 === 2, `step=${step2}`);
    await readerPass(step2 || 1, 'desktop');
    await khatmahPass('desktop');

    // ---- desktop landscape, two-page (double) layout: navigation step is 2 ----
    // (clear khatmah state + the nav stack so openPage() routes to the surah
    //  reader — khatmahPass above left both active)
    await evaljs(`window.state.khatmah = null; window.saveState();
      window.switchTab('quran');
      window.ReaderSettings.set('reader_layout', 'double'); 'ok'`);
    const stepD = await evaljs(`mushafPageStep()`);
    ok('desktop-double step=2', stepD === 2, `step=${stepD}`);
    await openPage(120);
    for (let i = 0; i < 30; i++) {                                   // column 2 fills async
      if (await evaljs(`(() => { const n = document.getElementById('mushaf-page-next');
        return !!n && n.children.length > 0 && getComputedStyle(n).display !== 'none'; })()`)) break;
      await sleep(150);
    }
    ok('desktop-double second-column-shown', await evaljs(`(() => {
      const n = document.getElementById('mushaf-page-next');
      return !!n && n.children.length > 0 && getComputedStyle(n).display !== 'none'; })()`));
    await readerPass(2, 'desktop-double');
    await evaljs(`window.ReaderSettings.set('reader_layout', 'single'); 'ok'`);
    ok('desktop console clean', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } finally {
    chrome2.kill();
  }

  report();
  const fails = results.filter(r => !r.pass).length;
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });
