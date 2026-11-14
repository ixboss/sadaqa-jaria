#!/usr/bin/env node
/**
 * E2E suite — شاشة الأذكار بنمط التركيز (Focus Mode)
 * ───────────────────────────────────────────────
 * Zero dependencies: needs only Node ≥ 22 (built-in WebSocket) and a
 * Chromium-family browser (Edge/Chrome) for DevTools Protocol.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1      (from the repo root)
 *   2) node tests/e2e-adhkar-pager.mjs
 *
 * Scenarios (all assertions measured in the live page):
 *   (a) Focus layout renders: one centered zikr, «١ | ٢٥» progress, counter text
 *   (b) Tap-anywhere counts one repetition; completing the count advances with fade
 *   (c) Horizontal swipe next/previous (RTL) without counting
 *   (d) Font scaling 100%→200%: no horizontal overflow; long text scrolls inside;
 *       footer clears the fixed bottom nav
 *   (e) No vertical scrolling in the adhkar category screen
 *   (f) Regression: every category opens, favorites persist via the action bar, Back nav, console clean
 *   (g) Footer clears the bottom nav across small/medium/large/landscape viewports
 *   (h) Play mode: auto-advance every 6s, stops at the last zikr
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9223);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const VIEWPORT = { width: 390, height: 844 };

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

/** ─── CDP client ─────────────────────────────────────────── */
let ws, idSeq = 0;
const pending = new Map();
const events = [];
async function connect(wsUrl) {
  await new Promise((res, rej) => {
    ws = new WebSocket(wsUrl);
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message} ${JSON.stringify(params)}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaljs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

/** ─── real input ───────────────────────────────────────── */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// The app greets a fresh profile with a once-per-day-period occasion popup that
// covers the whole viewport (z-index 999) and swallows every tap until the user
// dismisses it. Real users see it once; every fresh test profile sees it too.
async function dismissOccasionPopup() {
  const active = await evaljs(`document.getElementById('occasion-overlay')?.classList.contains('active')`);
  if (active) { await evaljs(`document.getElementById('occasion-modal-ok')?.click()`); await sleep(300); }
}
// Raw Input.dispatchTouchEvent never synthesizes a click in headless Chromium
// (verified: a touchStart/touchEnd pair on a button with a direct onclick handler
// fires zero click events), so every "tap" assertion silently tested nothing.
// emulateTouchFromMouseEvent goes through the real touch→click pipeline. This
// Edge build's schema takes integer DIP coords and no touchStart/touchEnd flags.
async function tap(x, y) {
  if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) console.log('   [tap] BAD COORDS at:', new Error().stack.split('\n').slice(2, 4).join(' <- '), 'x=', x, 'y=', y);
  const px = Math.round(x), py = Math.round(y);
  await send('Input.emulateTouchFromMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 });
  await sleep(40);
  await send('Input.emulateTouchFromMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 });
}
// Swipe: the focus stage drives navigation from touchstart/touchend deltas.
// Synthetic TouchEvents dispatched into the page reach those listeners
// directly (CDP raw touch would double-dispatch the end event here).
async function swipe(x, y, dx) {
  await evaljs(`(() => {
    const s = document.getElementById('focus-stage');
    const mk = (cx) => [new Touch({ identifier: 0, target: s, clientX: Math.round(cx), clientY: Math.round(${Math.round(y)}) })];
    s.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, changedTouches: mk(${Math.round(x)}) }));
    s.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: mk(${Math.round(x + dx)}) }));
  })()`);
}
async function waitFocusSettled() { // until the fade swap is done
  await sleep(560);
}

/** ─── page helpers ───────────────────────────────────────── */
const pg = {
  state: () => evaljs(`(() => {
    const txt = document.getElementById('focus-text');
    const pos = document.getElementById('focus-pos')?.textContent || '';
    const total = document.getElementById('focus-total')?.textContent || '';
    const count = document.getElementById('focus-count')?.textContent?.trim() || '';
    const fill = document.getElementById('focus-progress-fill')?.style.width || '';
    const fav = document.getElementById('focus-fav-btn')?.getAttribute('aria-pressed');
    const entries = state.dhikrEntries || [];
    const e = entries[state.dhikrPos];
    const r = txt ? txt.getBoundingClientRect() : null;
    const plain = (b) => ({ x: b.x, y: b.y, width: b.width, height: b.height });
    const stage = plain(document.getElementById('focus-stage').getBoundingClientRect());
    const footer = plain(document.getElementById('focus-footer').getBoundingClientRect());
    return { pos, total, count, fill, fav, textLen: txt ? txt.textContent.trim().length : 0,
             textRect: r ? { x: r.x, y: r.y, w: r.width, h: r.height, sw: txt.scrollWidth, sh: txt.scrollHeight, ch: txt.clientHeight } : null,
             stage, footer,
             ci: state.currentCatIndex, i: e ? e.i : -1, posNum: state.dhikrPos, n: entries.length };
  })()`),
  openCategory: (ci) => evaljs(`window.openCategory(${ci})`),
  progressKey: (ci, i) => evaljs(`(() => {
    const d = new Date();
    const day = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    return localStorage.getItem('ath_' + day + '_' + ${ci} + '_' + ${i});
  })()`),
};

/** ─── main ──────────────────────────────────────────────── */
async function main() {
  const profileDir = mkdtempSync(join(tmpdir(), 'e2e-adhkar-'));
  const browser = spawn(BROWSER, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    // wait for the debugging endpoint
    let targets = null;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        targets = await res.json();
        if (targets.length) break;
      } catch { /* not up yet */ }
      await sleep(250);
    }
    const page = targets.find(t => t.type === 'page');
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    await dismissOccasionPopup();

    // ── go to the athkar tab and open the first category with a real tap ──
    await evaljs(`document.querySelector('[data-tab="athkar"]').click()`);
    for (let i = 0; i < 40 && !await evaljs(`document.querySelectorAll('.athkar-cat-card').length > 0`); i++) await sleep(100);
    let catRect = null;
    for (let i = 0; i < 10 && !catRect; i++) {
      catRect = await evaljs(`(() => { const c = document.querySelector('.athkar-cat-card'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, name: c.querySelector('.cat-name').textContent }; })()`);
      if (!catRect) { console.log('   [diag] cat card rect unavailable:', await evaljs(`state.currentScreen + ' cards=' + document.querySelectorAll('.athkar-cat-card').length`)); await sleep(400); }
    }
    if (!catRect) throw new Error('athkar category card never rendered a rect');
    await tap(catRect.x, catRect.y);
    for (let i = 0; i < 40 && !await evaljs(`document.getElementById('focus-text')?.textContent.trim().length > 0`); i++) await sleep(100);
    await waitFocusSettled();

    // ═══ (a) Focus layout renders ═══
    let s = await pg.state();
    const title = await evaljs(`document.getElementById('header-title').textContent`);
    ok('(a) header shows the category name', title === catRect.name, title);
    ok('(a) starts on zikr 1 of 21', s.pos === '١' && s.total === '٢١', `${s.pos}|${s.total}`);
    ok('(a) zikr text is rendered and non-empty', s.textLen > 10, `len=${s.textLen}`);
    ok('(a) no card chrome left (no borders/cards)', await evaljs(`!document.querySelector('.dhikr-card, .dhikr-slide, .thikr-tap-btn')`), '');
    const centered = await evaljs(`(() => {
      const stage = document.getElementById('focus-stage').getBoundingClientRect();
      const anim = document.getElementById('focus-anim').getBoundingClientRect();
      return Math.abs((anim.y + anim.height / 2) - (stage.y + stage.height / 2)) < stage.height * 0.25;
    })()`);
    ok('(a) zikr block is vertically centered in the stage', centered, '');

    // ═══ (b) Tap-anywhere counts + completion advances ═══
    // pick a dhikr with count >= 3
    const target = await evaljs(`(() => {
      const found = state.dhikrEntries.findIndex(e => e.item.count >= 3);
      if (found < 0) return -1;
      state.dhikrPos = found; renderFocusZikr(false);
      return found;
    })()`);
    await waitFocusSettled();
    s = await pg.state();
    if (s && target >= 0) {
      const max = await evaljs(`ATHKAR[${s.ci}].items[${s.i}].count`);
      ok('(b) found multi-count dhikr', max >= 3, 'count=' + max);

      const itemCi = s.ci, itemI = s.i;
      const before = await pg.progressKey(itemCi, itemI);
      const beforePos = (await pg.state()).posNum;
      // all but the final tap: the counter climbs, no advance yet
      for (let k = 0; k < max - 1; k++) {
        const st = await pg.state();
        await tap(st.stage.x + st.stage.width / 2, st.stage.y + st.stage.height / 2);
        await waitFocusSettled();
      }
      s = await pg.state();
      const midVal = await pg.progressKey(itemCi, itemI);
      ok('(b) counter climbs without advancing', s.posNum === beforePos && (s.count.includes(toArabicCheck(max - 1)) || s.count.includes(String(max - 1))), `pos=${s.posNum} count=${s.count}`);
      ok('(b) progress persisted so far', String(midVal) === String(max - 1) && before !== String(max - 1), `ath key=${midVal}`);
      // final tap: completes the count → auto-advance with fade
      await tap(s.stage.x + s.stage.width / 2, s.stage.y + s.stage.height / 2);
      await waitFocusSettled();
      s = await pg.state();
      const lsVal = await pg.progressKey(itemCi, itemI);
      ok('(b) completed zikr auto-advances to the next', s.posNum === beforePos + 1, `pos ${beforePos} → ${s.posNum}`);
      ok('(b) progress persisted to localStorage', String(lsVal) === String(max) && before !== String(max), `ath key=${lsVal}`);
      // extra tap on the (now advanced) zikr counts only once
      const capCi = s.ci, capI = s.i, capMax = await evaljs(`ATHKAR[${capCi}].items[${capI}].count`);
      await tap(s.stage.x + s.stage.width / 2, s.stage.y + s.stage.height / 2);
      await waitFocusSettled();
      const capVal = await pg.progressKey(capCi, capI);
      ok('(b) no over-count beyond target', Number(capVal) <= capMax, `ath key=${capVal} max=${capMax}`);
    } else {
      ok('(b) found multi-count dhikr', false, 'no focus state — the category did not render');
    }

    // single-count zikr: one tap advances immediately
    await pg.openCategory(0); await waitFocusSettled();
    s = await pg.state();
    const pos0 = s.posNum;
    await tap(s.stage.x + s.stage.width / 2, s.stage.y + s.stage.height / 2);
    await waitFocusSettled();
    s = await pg.state();
    ok('(b) single-count zikr advances on one tap', s.posNum === pos0 + 1, `pos ${pos0} → ${s.posNum}`);

    // Regression guard: no layout-viewport zoom after completion
    const view = await evaljs(`({ iw: window.innerWidth, ih: window.innerHeight, docSW: document.documentElement.scrollWidth, appH: document.getElementById('app').offsetHeight })`);
    ok('(b) completion does not zoom/resize the page', view.iw === VIEWPORT.width && view.ih === VIEWPORT.height && view.docSW <= VIEWPORT.width && view.appH === VIEWPORT.height, JSON.stringify(view));

    // ═══ (c) Horizontal swipe next/previous (RTL) ═══
    s = await pg.state();
    const swipeY = s.stage.y + s.stage.height / 2;
    const swipeX = s.stage.x + s.stage.width / 2;
    const c0 = s.posNum;
    const swBefore = await pg.progressKey(s.ci, s.i);
    await swipe(swipeX, swipeY, -220);   // content moves left → next in RTL
    await waitFocusSettled();
    s = await pg.state();
    ok('(c) swipe left → next zikr', s.posNum === c0 + 1, `pos ${c0} → ${s.posNum}`);
    await swipe(swipeX, swipeY, 220);    // content moves right → previous
    await waitFocusSettled();
    s = await pg.state();
    ok('(c) swipe right → previous zikr', s.posNum === c0, `pos → ${s.posNum}`);
    // swipe does not count
    const swVal = await pg.progressKey(s.ci, s.i);
    ok('(c) swiping does not count a repetition', swVal === swBefore, `ath key ${swBefore} → ${swVal}`);

    // ═══ (d) Font scaling 100%→200% ═══
    for (const scale of [1.0, 1.3, 1.4, 2.0]) {   // 1.4 is the app's default (LEGACY large)
      await evaljs(`window.applyFontSize(${scale})`);
      await sleep(450);
      const stats = await evaljs(`(() => {
        const navTop = document.getElementById('nav').getBoundingClientRect().top;
        const out = { n: 0, overflow: 0, clipped: 0, textScrollable: 0, unreachable: 0, behindNav: 0, hits: [] };
        const entries = state.dhikrEntries || [];
        for (let i = 0; i < entries.length; i++) {
          state.dhikrPos = i; renderFocusZikr(false);
          const txt = document.getElementById('focus-text');
          const tr = txt.getBoundingClientRect();
          const stage = document.getElementById('focus-stage').getBoundingClientRect();
          const footer = document.getElementById('focus-footer').getBoundingClientRect();
          out.n++;
          if (txt.scrollWidth > txt.clientWidth + 1) out.overflow++;
          if (tr.x < stage.x - 1 || tr.x + tr.width > stage.x + stage.width + 1) out.clipped++;
          if (txt.scrollHeight > txt.clientHeight + 1) out.textScrollable++;
          txt.scrollTop = txt.scrollHeight;
          if (txt.scrollTop + txt.clientHeight < txt.scrollHeight - 1) out.unreachable++;
          txt.scrollTop = 0;
          if (footer.bottom > navTop) { out.behindNav++; out.hits.push({ i: i + 1, footerBottom: Math.round(footer.bottom), navTop: Math.round(navTop) }); }
        }
        state.dhikrPos = 0; renderFocusZikr(false);
        return out;
      })()`);
      ok(`(d) ${scale * 100}% — no horizontal overflow`, stats.overflow === 0, JSON.stringify(stats));
      ok(`(d) ${scale * 100}% — text not clipped horizontally`, stats.clipped === 0, 'clipped=' + stats.clipped);
      ok(`(d) ${scale * 100}% — footer clears the bottom nav`, stats.behindNav === 0, 'behindNav=' + stats.behindNav + ' ' + JSON.stringify(stats.hits));
      ok(`(d) ${scale * 100}% — long text fully reachable inside its region`, stats.unreachable === 0, 'unreachable=' + stats.unreachable);
      console.log(`         [scale ${scale}] n=${stats.n} overflow=${stats.overflow} clipped=${stats.clipped} textScrollable=${stats.textScrollable} unreachable=${stats.unreachable} behindNav=${stats.behindNav}`);
    }
    await evaljs(`window.applyFontSize(1.0)`);
    await sleep(400);

    // ═══ (e) No vertical scrolling in the category screen ═══
    const vs = await evaljs(`(() => {
      const content = document.getElementById('content');
      const stage = document.getElementById('focus-stage');
      const entries = state.dhikrEntries || [];
      let contentScroll = 0;
      for (let i = 0; i < entries.length; i++) {
        state.dhikrPos = i; renderFocusZikr(false);
        if (content.scrollTop !== 0) contentScroll++;
      }
      state.dhikrPos = 0; renderFocusZikr(false);
      return { contentScroll, contentOverflowY: getComputedStyle(content).overflowY, stageOverflowY: getComputedStyle(stage).overflowY };
    })()`);
    ok('(e) #content scrollTop stays 0 everywhere', vs.contentScroll === 0, JSON.stringify(vs));
    ok('(e) vertical overflow disabled on #content', vs.contentOverflowY === 'hidden', JSON.stringify(vs));

    // ═══ (f) Regression ═══
    const catCount = await evaljs(`ATHKAR.length`);
    let allOk = true, allDetail = '';
    for (let ci = 0; ci < catCount; ci++) {
      await pg.openCategory(ci);
      await waitFocusSettled();
      const r = await evaljs(`({ n: state.dhikrEntries.length, items: ATHKAR[${ci}].items.length, pos: state.dhikrPos, len: document.getElementById('focus-text').textContent.trim().length })`);
      if (r.n !== r.items || r.pos !== 0 || r.len < 5) { allOk = false; allDetail = `cat ${ci}: ${JSON.stringify(r)}`; break; }
    }
    ok('(f) every category opens on its first zikr with all items', allOk, allDetail || `${catCount} categories`);

    // favorites toggle + persistence via the action bar
    await pg.openCategory(0);
    await waitFocusSettled();
    const favBefore = await evaljs(`localStorage.getItem('athkar_favs')`);
    await evaljs(`document.getElementById('focus-fav-btn').click()`);
    await sleep(300);
    const favAfter = await evaljs(`localStorage.getItem('athkar_favs')`);
    ok('(f) ☆ favorite toggle persists', favBefore !== favAfter && favAfter && favAfter.includes('0:0'), `athkar_favs=${favAfter}`);
    const favPressed = await evaljs(`document.getElementById('focus-fav-btn').getAttribute('aria-pressed')`);
    ok('(f) star reflects the favorite state', favPressed === 'true', favPressed);

    // favorites-only filter via the menu (0:0 is favorited right now)
    await evaljs(`document.getElementById('focus-menu-btn').click()`);
    await sleep(200);
    const popOpen = await evaljs(`!document.getElementById('focus-menu-pop').hidden`);
    ok('(f) menu opens the options popover', popOpen, '');
    await evaljs(`document.getElementById('dhikr-fav-chip').click()`);
    await waitFocusSettled();
    const favOnlyN = await evaljs(`state.dhikrEntries.length`);
    ok('(f) favorites filter shows only favorited zikr', favOnlyN === 1, 'n=' + favOnlyN);
    await pg.openCategory(0); // back to unfiltered
    await waitFocusSettled();
    await evaljs(`document.getElementById('focus-fav-btn').click()`); // un-favorite again (cleanup)
    await sleep(200);

    // Back navigation returns to the home grid
    await evaljs(`window.navigateBack()`);
    await sleep(700);
    const backOk = await evaljs(`(() => {
      const s = document.getElementById('screen-athkar-list');
      const shown = s.classList.contains('active') || s.classList.contains('slide-left') || s.classList.contains('slide-right');
      return shown && document.querySelectorAll('.athkar-cat-card').length > 0 && state.currentScreen === 'athkar-list';
    })()`);
    ok('(f) Back returns to the athkar home grid', backOk, '');

    // zero page errors. Network 404s of *external* resources (e.g. the pre-existing
    // Amiri-Quran webfont preload) are excluded — they are not app bugs and are
    // reported separately in docs/E2E_ADHKAR.md.
    const errs = events.filter(e =>
      e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Log.entryAdded' &&
        e.params.entry.level === 'error' &&
        e.params.entry.source !== 'network' &&
        !/fonts\.gstatic\.com|fonts\.googleapis\.com/.test(e.params.entry.url || '')));
    ok('(f) zero console errors', errs.length === 0, errs.map(e => JSON.stringify(e.params)).join(' | '));

    // ═══ (g) Footer clears the bottom nav across viewports ═══
    const VIEWPORTS = [
      { width: 320, height: 693, label: '320×693 (small phone)' },
      { width: 390, height: 844, label: '390×844 (medium phone)' },
      { width: 393, height: 852, label: '393×852 (large phone)' },
      { width: 844, height: 390, label: '844×390 (landscape)' },
    ];
    for (const vp of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', { ...vp, deviceScaleFactor: 2, mobile: true });
      await send('Page.navigate', { url: BASE });
      await sleep(2500);
      await dismissOccasionPopup();
      await evaljs(`document.querySelector('[data-tab="athkar"]').click()`);
      for (let i = 0; i < 40 && !await evaljs(`document.querySelectorAll('.athkar-cat-card').length > 0`); i++) await sleep(100);
      await evaljs(`document.querySelector('.athkar-cat-card').click()`);
      for (let i = 0; i < 40 && !await evaljs(`document.getElementById('focus-text')?.textContent.trim().length > 0`); i++) await sleep(100);
      await sleep(600);
      for (const scale of [1.0, 1.3, 2.0]) {   // smallest, the ~1.4 default, largest
        await evaljs(`window.applyFontSize(${scale})`);
        await sleep(450);
        const st = await evaljs(`(() => {
          const nav = document.getElementById('nav').getBoundingClientRect();
          const footer = document.getElementById('focus-footer').getBoundingClientRect();
          const txt = document.getElementById('focus-text');
          const stage = document.getElementById('focus-stage').getBoundingClientRect();
          return { footerBottom: Math.round(footer.bottom), navTop: Math.round(nav.top),
                   navVisible: nav.top > 0 && nav.top < window.innerHeight,
                   overflowX: txt.scrollWidth > txt.clientWidth + 1,
                   stageInside: stage.top >= -1 && stage.bottom <= window.innerHeight + 1,
                   applied: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim() };
        })()`);
        ok(`(g) ${vp.label} @${st.applied}× — nav bar visible (assertion meaningful)`, st.navVisible, 'navTop=' + st.navTop);
        ok(`(g) ${vp.label} @${st.applied}× — footer clears the nav`, st.footerBottom <= st.navTop, `footer=${st.footerBottom} nav=${st.navTop}`);
        ok(`(g) ${vp.label} @${st.applied}× — stage inside the viewport, no horizontal overflow`, st.stageInside && !st.overflowX, JSON.stringify(st));
      }
    }

    // ─── (h) Play mode: timed auto-advance ──────────────────
    console.log('\n(h) Play mode...');
    await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    await dismissOccasionPopup();
    await evaljs(`document.querySelector('[data-tab="athkar"]').click()`);
    await sleep(600);
    await evaljs(`document.querySelector('.athkar-cat-card').click()`);
    for (let i = 0; i < 40 && !await evaljs(`document.getElementById('focus-text')?.textContent.trim().length > 0`); i++) await sleep(100);
    await sleep(400);
    const playPos0 = await evaljs(`state.dhikrPos`);
    await evaljs(`window.toggleFocusPlay()`);
    const playOn = await evaljs(`document.getElementById('focus-play-btn').getAttribute('aria-pressed')`);
    ok('(h) play button toggles to pressed', playOn === 'true', playOn);
    await sleep(6800); // one 6s tick
    const playPos1 = await evaljs(`state.dhikrPos`);
    ok('(h) play mode advances after ~6s', playPos1 === playPos0 + 1, `pos ${playPos0} → ${playPos1}`);
    await evaljs(`window.toggleFocusPlay()`);
    await sleep(6300);
    const playPos2 = await evaljs(`state.dhikrPos`);
    ok('(h) play mode stopped does not advance', playPos2 === playPos1, `pos ${playPos1} → ${playPos2}`);
    // navigating away stops the timer
    await evaljs(`window.toggleFocusPlay()`);
    await evaljs(`window.navigateBack()`);
    await sleep(400);
    const timerGone = await evaljs(`window.focusPlayTimer === null || window.focusPlayTimer === undefined`);
    ok('(h) leaving the screen stops the play timer', timerGone, '');

    console.log('✓ Play mode: 4 tests completed');

  } finally {
    browser.kill();
  }

  // ─── report ─────────────────────────────────────────────
  console.log('\n══════════ E2E — Adhkar focus mode ══════════');
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail && !r.pass ? '  → ' + r.detail : ''}`);
  }
  console.log('──────────────────────────────────────');
  console.log(`${results.length - failed}/${results.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

function toArabicCheck(n) { // Arabic-Indic digits for counter assertions
  return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

main().catch(e => { console.error('E2E runner crashed:', e); process.exit(2); });
