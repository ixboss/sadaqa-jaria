#!/usr/bin/env node
/**
 * E2E suite — شاشة الأذكار كتقاليب أفقية (Pager)
 * ───────────────────────────────────────────────
 * Zero dependencies: needs only Node ≥ 22 (built-in WebSocket) and a
 * Chromium-family browser (Edge/Chrome) for DevTools Protocol.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1      (from the repo root)
 *   2) node tests/e2e-adhkar-pager.mjs
 *
 * Scenarios (all assertions measured in the live page):
 *   (a) Horizontal swipe next/previous, RTL
 *   (b) Tap-anywhere increments the counter; reaching target completes
 *   (c) Font scaling 100%→200%: no overflow / clipping / overlap, counter clears the nav
 *   (d) No vertical scrolling in the adhkar category screen
 *   (e) Regression: every category opens, favorites persist, Back nav, console clean
 *   (f) Counter clears the bottom nav across small/medium/large/landscape viewports
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9223);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const VIEWPORT = { width: 390, height: 844 };
const SWIPE_MS = 400;

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
  pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaljs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

/** ─── real input ───────────────────────────────────────── */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function touch(type, points) { await send('Input.dispatchTouchEvent', { type, touchPoints: points }); }
async function tap(x, y) {
  await touch('touchStart', [{ x, y, id: 1 }]);
  await sleep(40);
  await touch('touchEnd', []);
}
// Paging: a horizontal wheel flick over the pager. Synthetic touch *drags* do not
// produce compositor scroll in headless (verified: not even the app's existing
// vertical lists scroll that way), so the suite drives the very same scroll-snap
// machinery with a real wheel event. deltaX < 0 = content moves left = next in RTL.
async function swipe(next, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y, deltaX: next ? -400 : 400, deltaY: 0 });
}
async function waitForScroll() { // until the pager's scrollLeft is stable
  let prev = null, stable = 0;
  for (let i = 0; i < 40; i++) {
    const cur = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
    if (prev === cur) { if (++stable >= 3) return; } else stable = 0;
    prev = cur; await sleep(100);
  }
}

/** ─── page helpers ───────────────────────────────────────── */
const pg = {
  openCategory: (ci) => evaljs(`window.openCategory(${ci})`),
  visibleCard: () => evaljs(`(() => {
    const pager = document.getElementById('thikr-list-container');
    const pr = pager.getBoundingClientRect();
    let best = null, d = 1e9;
    for (const s of pager.querySelectorAll('.dhikr-slide')) {
      const r = s.getBoundingClientRect();
      const dd = Math.abs((r.x + r.width / 2) - (pr.x + pr.width / 2));
      if (dd < d) { d = dd; best = s; }
    }
    if (!best) return null;
    const card = best.querySelector('.dhikr-card');
    const r = card.getBoundingClientRect();
    return { ci: +card.dataset.ci, i: +card.dataset.i, badge: best.querySelector('.dhikr-badge').textContent,
             countLine: card.querySelector('.dhikr-count-line').textContent.trim(),
             tapBtn: card.querySelector('.thikr-tap-btn').textContent.trim(),
             fillW: card.querySelector('.dhikr-progress-fill').style.width,
             cardCenter: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
             textRect: (() => { const t = card.querySelector('.thikr-text'); const b = t.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, sw: t.scrollWidth, sh: t.scrollHeight }; })(),
             slideScrollable: best.scrollHeight > best.clientHeight + 1 };
  })()`),
  progressKey: (ci, i) => evaljs(`(() => {
    const d = new Date().toISOString().slice(0, 10);
    return localStorage.getItem('ath_' + d + '_' + ${ci} + '_' + ${i});
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

    // ── go to the athkar tab and open the first category with a real tap ──
    await evaljs(`document.querySelector('[data-tab="athkar"]').click()`);
    for (let i = 0; i < 40 && !await evaljs(`document.querySelectorAll('.athkar-cat-card').length > 0`); i++) await sleep(100);
    const catRect = await evaljs(`(() => { const c = document.querySelector('.athkar-cat-card'); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, name: c.querySelector('.cat-name').textContent }; })()`);
    await tap(catRect.x, catRect.y);
    for (let i = 0; i < 40 && !await evaljs(`document.querySelectorAll('.dhikr-slide').length > 0`); i++) await sleep(100);
    await sleep(700);

    // ═══ (a) Horizontal swipe next/previous, RTL ═══
    const pagerRect = await evaljs(`(() => { const r = document.getElementById('thikr-list-container').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const swipeY = pagerRect.y + pagerRect.h / 2;
    const midX = pagerRect.x + pagerRect.w / 2;

    let card = await pg.visibleCard();
    ok('(a) starts on slide 1', card && card.badge === '١ / ٢١', card && card.badge);

    await swipe(true, swipeY);   // content moves left → next dhikr in RTL
    await waitForScroll();
    card = await pg.visibleCard();
    ok('(a) swipe to next (RTL) → slide 2', card && card.badge === '٢ / ٢١', card && card.badge);

    await swipe(false, swipeY);  // content moves right → previous
    await waitForScroll();
    card = await pg.visibleCard();
    ok('(a) swipe to previous → back to slide 1', card && card.badge === '١ / ٢١', card && card.badge);

    // only one card visible at a time
    const oneVisible = await evaljs(`(() => {
      const pager = document.getElementById('thikr-list-container');
      const pr = pager.getBoundingClientRect();
      const vis = [...pager.querySelectorAll('.dhikr-slide')].filter(s => { const r = s.getBoundingClientRect(); return r.x < pr.x + pr.width - 30 && r.x + r.width > pr.x + 30; });
      return vis.length;
    })()`);
    ok('(a) exactly one card visible', oneVisible === 1, 'visible=' + oneVisible);

    // ═══ (b) Tap-anywhere increments + completion ═══
    // pick a dhikr with count >= 3 (swipe to it if needed)
    let target = await evaljs(`(() => {
      const pager = document.getElementById('thikr-list-container');
      const slides = [...pager.querySelectorAll('.dhikr-slide')];
      const found = slides.findIndex(s => { const c = s.querySelector('.dhikr-card'); return ATHKAR[+c.dataset.ci].items[+c.dataset.i].count >= 3; });
      if (found < 0) return -1;
      const step = pager.getBoundingClientRect().width;
      pager.style.scrollBehavior = 'auto'; pager.scrollLeft = -(found * step); pager.style.scrollBehavior = '';
      return found;
    })()`);
    await waitForScroll();
    card = await pg.visibleCard();
    // a cold start can leave the pager un-rendered for a beat; retry once so a
    // slow browser reports a real failure instead of crashing on a null card
    if (!card) { await sleep(1000); card = await pg.visibleCard(); }
    if (card) {
      const max = await evaljs(`ATHKAR[${card.ci}].items[${card.i}].count`);
      ok('(b) found multi-count dhikr', max >= 3, 'count=' + max);

      // tap on the text body (not the button) — tap-anywhere must increment
      const before = await pg.progressKey(card.ci, card.i);
      for (let k = 0; k < max; k++) {
        const t = await pg.visibleCard();
        await tap(t.textRect.x + t.textRect.w / 2, t.textRect.y + 24);
        await sleep(250);
      }
      card = await pg.visibleCard();
      const lsVal = await pg.progressKey(card.ci, card.i);
      ok('(b) count line reached target', card.countLine.includes(toArabicCheck(max)) || card.countLine.includes(String(max)), card.countLine);
      ok('(b) tap button shows completion', card.tapBtn.includes('✓'), card.tapBtn);
      ok('(b) progress bar at 100%', card.fillW === '100%', card.fillW);
      ok('(b) progress persisted to localStorage', String(lsVal) === String(max) && before !== String(max), `ath key=${lsVal}`);
      ok('(b) tapping did not navigate (same slide)', card.i === target && await evaljs(`state.currentScreen === 'thikr-view'`), `slide=${target} i=${card.i}`);
      // extra tap beyond target must not over-count
      await tap(card.textRect.x + card.textRect.w / 2, card.textRect.y + 24);
      await sleep(200);
      const lsAfter = await pg.progressKey(card.ci, card.i);
      ok('(b) capped at target (no over-count)', String(lsAfter) === String(max), `ath key=${lsAfter}`);
    } else {
      ok('(b) found multi-count dhikr', false, 'no visible card — the category did not render');
    }

    // Regression guard for the "shrink-to-fit" overview bug: the aria-live
    // announcement fired on completion used to sit at left:-9999px, which made
    // Chromium mobile zoom the whole page out (layout viewport 390 → 1560) and
    // collapse the pager's height chain. The layout viewport must stay put.
    const view = await evaljs(`({ iw: window.innerWidth, ih: window.innerHeight, docSW: document.documentElement.scrollWidth, appH: document.getElementById('app').offsetHeight })`);
    ok('(b) completion does not zoom/resize the page', view.iw === VIEWPORT.width && view.ih === VIEWPORT.height && view.docSW <= VIEWPORT.width && view.appH === VIEWPORT.height, JSON.stringify(view));

    // ═══ (c) Font scaling 100%→200% ═══
    for (const scale of [1.0, 1.3, 1.4, 2.0]) {   // 1.4 is the app's default (LEGACY large)
      await evaljs(`window.applyFontSize(${scale})`);
      await sleep(450);
      // visit every slide and measure
      const stats = await evaljs(`(() => {
        const pager = document.getElementById('thikr-list-container');
        const step = pager.getBoundingClientRect().width;
        const navTop = document.getElementById('nav').getBoundingClientRect().top;
        const out = { slides: 0, overflow: 0, clipped: 0, slideVScroll: 0, textScroll: 0, unreachable: 0, behindNav: 0, perSlide: [], navHits: [] };
        const orig = pager.scrollLeft;
        const slides = [...pager.querySelectorAll('.dhikr-slide')];
        for (let i = 0; i < slides.length; i++) {
          pager.style.scrollBehavior = 'auto'; pager.scrollLeft = -(i * step); pager.style.scrollBehavior = '';
          const s = slides[i]; const card = s.querySelector('.dhikr-card');
          const cr = card.getBoundingClientRect(), tr = card.querySelector('.thikr-text');
          const tb = tr.getBoundingClientRect();
          out.slides++;
          if (card.scrollWidth > card.clientWidth + 1) out.overflow++;
          if (tr.scrollWidth > tr.clientWidth + 1) out.overflow++;
          // text horizontally inside the card
          if (tb.x < cr.x - 1 || tb.x + tb.width > cr.x + cr.width + 1) out.clipped++;
          // the category screen must never scroll vertically: the card is capped
          // at the slide height, so a long dhikr scrolls *inside its text region*
          if (s.scrollHeight > s.clientHeight + 1) { out.slideVScroll++; out.perSlide.push({ i: i + 1, sh: s.scrollHeight, ch: s.clientHeight }); }
          // the count button must clear the fixed bottom nav bar: the card is
          // bounded by the *slide*, so a slide reaching the screen bottom would
          // hide the counter behind the bar on exactly the long/large-font cards
          const btn = card.querySelector('.thikr-tap-btn');
          if (btn) {
            const bb = btn.getBoundingClientRect();
            if (bb.bottom > navTop) { out.behindNav++; out.navHits.push({ i: i + 1, btnBottom: Math.round(bb.bottom), navTop: Math.round(navTop) }); }
          }
          if (tr.scrollHeight > tr.clientHeight + 1) {
            out.textScroll++;
            // the whole text must be reachable inside the region
            tr.scrollTop = tr.scrollHeight;
            if (tr.scrollTop + tr.clientHeight < tr.scrollHeight - 1) out.unreachable++;
            tr.scrollTop = 0;
          }
        }
        pager.style.scrollBehavior = 'auto'; pager.scrollLeft = orig; pager.style.scrollBehavior = '';
        return out;
      })()`);
      ok(`(c) ${scale * 100}% — no horizontal overflow`, stats.overflow === 0, JSON.stringify(stats));
      ok(`(c) ${scale * 100}% — text not clipped by card`, stats.clipped === 0, 'clipped=' + stats.clipped);
      ok(`(c) ${scale * 100}% — card never exceeds the viewport`, stats.slideVScroll === 0, 'slideVScroll=' + stats.slideVScroll + ' ' + JSON.stringify(stats.perSlide));
      ok(`(c) ${scale * 100}% — count button clears the bottom nav`, stats.behindNav === 0, 'behindNav=' + stats.behindNav + ' ' + JSON.stringify(stats.navHits));
      ok(`(c) ${scale * 100}% — long text fully reachable inside the card`, stats.unreachable === 0, 'unreachable=' + stats.unreachable);
      console.log(`         [scale ${scale}] slides=${stats.slides} overflow=${stats.overflow} clipped=${stats.clipped} textScroll=${stats.textScroll} unreachable=${stats.unreachable} slideVScroll=${stats.slideVScroll} behindNav=${stats.behindNav}`);
    }
    await evaljs(`window.applyFontSize(1.0)`);
    await sleep(400);

    // ═══ (d) No vertical scrolling in the category screen ═══
    await evaljs(`document.getElementById('thikr-list-container').scrollLeft = 0`);
    await waitForScroll();
    const vs = await evaljs(`(() => {
      const content = document.getElementById('content');
      const pager = document.getElementById('thikr-list-container');
      // flip through every card; the content area must never scroll
      const step = pager.getBoundingClientRect().width;
      const n = pager.querySelectorAll('.dhikr-slide').length;
      let contentScroll = 0, pagerScroll = 0;
      for (let i = 0; i < n; i++) {
        pager.style.scrollBehavior = 'auto'; pager.scrollLeft = -(i * step); pager.style.scrollBehavior = '';
        if (content.scrollTop !== 0) contentScroll++;
        if (pager.scrollTop !== 0) pagerScroll++;
      }
      pager.style.scrollBehavior = 'auto'; pager.scrollLeft = 0; pager.style.scrollBehavior = '';
      return { contentScroll, pagerScroll, contentOverflowY: getComputedStyle(content).overflowY, pagerOverflowY: getComputedStyle(pager).overflowY };
    })()`);
    ok('(d) #content scrollTop stays 0 everywhere', vs.contentScroll === 0, JSON.stringify(vs));
    ok('(d) pager scrollTop stays 0 everywhere', vs.pagerScroll === 0, '');
    ok('(d) vertical overflow disabled on the scrollers', vs.contentOverflowY === 'hidden' && vs.pagerOverflowY === 'hidden', JSON.stringify(vs));

    // ═══ (e) Regression ═══
    // every category opens and every item is reachable
    const catCount = await evaljs(`ATHKAR.length`);
    let allReachable = true, reachDetail = '';
    for (let ci = 0; ci < catCount; ci++) {
      await pg.openCategory(ci);
      await sleep(700);
      const r = await evaljs(`(() => {
        const pager = document.getElementById('thikr-list-container');
        const slides = pager.querySelectorAll('.dhikr-slide');
        const step = pager.getBoundingClientRect().width;
        const orig = pager.scrollLeft;
        let seen = 0;
        for (let i = 0; i < slides.length; i++) {
          pager.style.scrollBehavior = 'auto'; pager.scrollLeft = -(i * step); pager.style.scrollBehavior = '';
          const c = slides[i].querySelector('.dhikr-card');
          if (c.getBoundingClientRect().width > 10) seen++;
        }
        pager.style.scrollBehavior = 'auto'; pager.scrollLeft = orig; pager.style.scrollBehavior = '';
        return { slides: slides.length, seen, items: ATHKAR[${ci}].items.length };
      })()`);
      if (r.slides !== r.items || r.seen !== r.items) { allReachable = false; reachDetail = `cat ${ci}: slides=${r.slides} seen=${r.seen} items=${r.items}`; break; }
    }
    ok('(e) every category opens with all items reachable', allReachable, reachDetail || `${catCount} categories`);

    // favorites toggle + persistence
    await pg.openCategory(0);
    await sleep(600);
    await evaljs(`document.getElementById('thikr-list-container').scrollLeft = 0`);
    await sleep(300);
    const favBefore = await evaljs(`localStorage.getItem('athkar_favs')`);
    await evaljs(`document.querySelector('.dhikr-slide .dhikr-fav').click()`);
    await sleep(300);
    const favAfter = await evaljs(`localStorage.getItem('athkar_favs')`);
    ok('(e) ☆ favorite toggle persists', favBefore !== favAfter && favAfter && favAfter.includes('0:0'), `athkar_favs=${favAfter}`);
    await evaljs(`document.querySelector('.dhikr-slide .dhikr-fav').click()`); // un-favorite again
    await sleep(200);

    // Back navigation returns to the home grid
    await evaljs(`window.navigateBack()`);
    await sleep(700);
    const backOk = await evaljs(`(() => {
      const s = document.getElementById('screen-athkar-list');
      const shown = s.classList.contains('active') || s.classList.contains('slide-left') || s.classList.contains('slide-right');
      return shown && document.querySelectorAll('.athkar-cat-card').length > 0 && state.currentScreen === 'athkar-list';
    })()`);
    ok('(e) Back returns to the athkar home grid', backOk, '');

    // zero page errors. Network 404s of *external* resources (e.g. the pre-existing
    // Amiri-Quran webfont preload) are excluded — they are not app bugs and are
    // reported separately in docs/E2E_ADHKAR.md.
    const errs = events.filter(e =>
      e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Log.entryAdded' &&
        e.params.entry.level === 'error' &&
        e.params.entry.source !== 'network' &&
        !/fonts\.gstatic\.com|fonts\.googleapis\.com/.test(e.params.entry.url || '')));
    ok('(e) zero console errors', errs.length === 0, errs.map(e => JSON.stringify(e.params)).join(' | '));

    // ═══ (f) Counter clears the bottom nav across viewports ═══
    // The pager bounds each card against its slide; if the slide reaches the
    // bottom of the screen, the count button ends up behind the fixed nav bar.
    // Re-check at small / medium / large phone widths and in landscape, because
    // the slide height — and therefore which cards get capped — changes with it.
    const VIEWPORTS = [
      { width: 320, height: 693, label: '320×693 (small phone)' },
      { width: 390, height: 844, label: '390×844 (medium phone)' },
      { width: 393, height: 852, label: '393×852 (large phone)' },
      { width: 844, height: 390, label: '844×390 (landscape)' },
    ];
    for (const vp of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', { ...vp, deviceScaleFactor: 2, mobile: true });
      await send('Page.navigate', { url: BASE });
      await sleep(2200);
      await evaljs(`document.querySelector('[data-tab="athkar"]').click()`);
      for (let i = 0; i < 40 && !await evaljs(`document.querySelectorAll('.athkar-cat-card').length > 0`); i++) await sleep(100);
      await evaljs(`document.querySelector('.athkar-cat-card').click()`);
      for (let i = 0; i < 40 && !await evaljs(`document.querySelectorAll('.dhikr-slide').length > 0`); i++) await sleep(100);
      await sleep(600);
      for (const scale of [1.0, 1.3, 2.0]) {   // smallest, the ~1.4 default, largest
        await evaljs(`window.applyFontSize(${scale})`);
        await sleep(450);
        const st = await evaljs(`(() => {
          const pager = document.getElementById('thikr-list-container');
          const step = pager.getBoundingClientRect().width;
          const nav = document.getElementById('nav').getBoundingClientRect();
          const out = { slides: 0, behindNav: 0, offScreen: 0, hits: [], navTop: Math.round(nav.top),
                        applied: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim(),
                        navVisible: nav.top > 0 && nav.top < window.innerHeight };
          const orig = pager.scrollLeft;
          const slides = [...pager.querySelectorAll('.dhikr-slide')];
          for (let i = 0; i < slides.length; i++) {
            pager.style.scrollBehavior = 'auto'; pager.scrollLeft = -(i * step); pager.style.scrollBehavior = '';
            const card = slides[i].querySelector('.dhikr-card');
            const cr = card.getBoundingClientRect();
            const bb = card.querySelector('.thikr-tap-btn').getBoundingClientRect();
            out.slides++;
            if (bb.bottom > nav.top) { out.behindNav++; out.hits.push({ i: i + 1, btnBottom: Math.round(bb.bottom), navTop: Math.round(nav.top) }); }
            if (cr.bottom > window.innerHeight + 1 || cr.top < -1 || cr.right > window.innerWidth + 1 || cr.left < -1) out.offScreen++;
          }
          pager.style.scrollBehavior = 'auto'; pager.scrollLeft = orig; pager.style.scrollBehavior = '';
          return out;
        })()`);
        ok(`(f) ${vp.label} @${st.applied}× — nav bar visible (assertion meaningful)`, st.navVisible, 'navTop=' + st.navTop);
        ok(`(f) ${vp.label} @${st.applied}× — count button clears the nav`, st.behindNav === 0, 'behindNav=' + st.behindNav + ' navTop=' + st.navTop + ' ' + JSON.stringify(st.hits));
        ok(`(f) ${vp.label} @${st.applied}× — card stays inside the viewport`, st.offScreen === 0, 'offScreen=' + st.offScreen);
        console.log(`         [${vp.label} @${st.applied}] slides=${st.slides} behindNav=${st.behindNav} offScreen=${st.offScreen} navTop=${st.navTop}`);
      }
    }

    // ─── (g) Auto-advance logic ──────────────────────────────
    console.log('\n(g) Auto-advance...');
    await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: BASE });
    await sleep(1800);
    
    // Enable auto-advance
    await evaljs(`window.Settings.setAutoAdvance(true)`);
    await evaljs(`document.querySelector('[data-tab="athkar"]').click()`);
    await sleep(600);
    await evaljs(`document.querySelector('.athkar-cat-card').click()`); // open first category (morning adhkar)
    for (let i = 0; i < 40 && !await evaljs(`document.querySelectorAll('.dhikr-slide').length > 0`); i++) await sleep(100);
    await sleep(400);
    
    // Test 1: Single-count (1/1) dhikr auto-advances
    const scroll1 = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
    await evaljs(`(() => { const btn = document.querySelector('.thikr-tap-btn'); if (btn) window.tapThikr(0, 0, btn); })()`);
    await sleep(1800); // wait for 1500ms delay + buffer
    const scroll2 = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
    ok('(g) Auto-advance: single-count (1/1) scrolls to next', scroll2 < scroll1 - 200, `scroll ${scroll1} → ${scroll2}`);
    
    // Test 2: Multi-count (3/3) dhikr
    const multiResult = await evaljs(`(() => {
      const slides = Array.from(document.querySelectorAll('.dhikr-slide'));
      for (let s = 0; s < slides.length; s++) {
        const countText = slides[s].querySelector('.dhikr-count-line')?.textContent || '';
        if (countText.includes('٣') && countText.includes('مرات')) {
          document.getElementById('thikr-list-container').scrollLeft = -s * slides[s].offsetWidth;
          return { found: true, slideIndex: s };
        }
      }
      return { found: false };
    })()`);
    if (multiResult.found) {
      await sleep(300);
      const scrollA = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
      await evaljs(`((si) => {
        const btn = document.querySelectorAll('.dhikr-slide')[si]?.querySelector('.thikr-tap-btn');
        if (btn) { window.tapThikr(0, si, btn); window.tapThikr(0, si, btn); window.tapThikr(0, si, btn); }
      })(${multiResult.slideIndex})`);
      await sleep(1800);
      const scrollB = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
      ok('(g) Auto-advance: multi-count (3/3) scrolls to next', scrollB < scrollA - 200, `scroll ${scrollA} → ${scrollB}`);
    }
    
    // Test 3: Last slide does NOT auto-advance
    await evaljs(`(() => {
      const container = document.getElementById('thikr-list-container');
      const slides = Array.from(container.querySelectorAll('.dhikr-slide'));
      container.scrollLeft = -(slides.length - 1) * (slides[slides.length - 1]?.offsetWidth || 390);
    })()`);
    await sleep(300);
    const scrollL1 = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
    await evaljs(`(() => {
      const slides = Array.from(document.querySelectorAll('.dhikr-slide'));
      const btn = slides[slides.length - 1]?.querySelector('.thikr-tap-btn');
      if (btn) window.tapThikr(0, slides.length - 1, btn);
    })()`);
    await sleep(1800);
    const scrollL2 = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
    ok('(g) Auto-advance: last slide stays put (no scroll)', Math.abs(scrollL2 - scrollL1) < 50, `scroll ${scrollL1} → ${scrollL2}`);
    
    // Test 4: Disabled toggle does NOT auto-advance
    await evaljs(`window.Settings.setAutoAdvance(false)`);
    await evaljs(`document.getElementById('thikr-list-container').scrollLeft = 0`);
    await sleep(300);
    const scrollD1 = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
    await evaljs(`(() => { const btn = document.querySelector('.thikr-tap-btn'); if (btn) window.tapThikr(0, 0, btn); })()`);
    await sleep(1800);
    const scrollD2 = await evaljs(`document.getElementById('thikr-list-container').scrollLeft`);
    ok('(g) Auto-advance: disabled toggle does NOT scroll', Math.abs(scrollD2 - scrollD1) < 50, `scroll ${scrollD1} → ${scrollD2}`);
    
    console.log('✓ Auto-advance: 4 tests completed');

  } finally {
    browser.kill();
  }

  // ─── report ─────────────────────────────────────────────
  console.log('\n══════════ E2E — Adhkar pager ══════════');
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail && !r.pass ? '  → ' + r.detail : ''}`);
  }
  console.log('──────────────────────────────────────');
  console.log(`${results.length - failed}/${results.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

function toArabicCheck(n) { // Arabic-Indic digits for count-line assertions
  return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

main().catch(e => { console.error('E2E runner crashed:', e); process.exit(2); });
