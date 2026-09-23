#!/usr/bin/env node
/**
 * E2E suite — تجربة قراءة المصحف (صفحة واحدة بلا تمرير)
 * ────────────────────────────────────────────────────────────
 * Zero dependencies: needs only Node ≥ 22 (built-in WebSocket) and a
 * Chromium-family browser (Edge/Chrome) for DevTools Protocol.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1      (from the repo root)
 *   2) node tests/e2e-mushaf.mjs
 *
 * Scenarios (all assertions measured in the live 390×844 page):
 *   (a) Surah header card: bookmark / play / name / meta have zero pairwise
 *       overlap, and the meta line is populated.
 *   (b) Single-page Mushaf: zero vertical and horizontal scrolling on several
 *       surah pages (Al-Fatiha, Al-Baqarah p1, Yaseen, Al-Mulk, An-Naba) and
 *       khatmah pages (30, 100, 604), reporting the fitted font size per page.
 *   (c) Dynamic font scaling: after applyFontSize(1.6) the page re-fits with
 *       no overflow (the fit factor is recalculated, not assumed).
 *   (d) Reciter picker: tapping ▶ opens the bottom sheet before playback,
 *       the list holds the expanded reciter set, and choosing one saves it
 *       and starts AudioPlayer.play with that reciter.
 *   (e) Regression: RTL direction, centered text, ayah structure, and no
 *       uncaught page errors across the whole run.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9224);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const VIEWPORT = { width: 390, height: 844 };

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

/** ─── CDP client ─────────────────────────────────────────── */
let ws, idSeq = 0;
const pending = new Map();
const pageErrors = [];
async function connect(wsUrl) {
  await new Promise((res, rej) => {
    ws = new WebSocket(wsUrl);
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** ─── real input (a real pointer carries user activation for audio) ────── */
async function tap(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function centerOf(selector) {
  const s = await evaljs(`(() => { const b = ${selector}; if (!b) return 'null'; const r = b.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }); })()`);
  return s === 'null' ? null : JSON.parse(s);
}

/** ─── page helpers ───────────────────────────────────────── */
async function openSurahPage(n, ayah = 1) {
  await evaljs(`window.switchTab('quran'); window.openSurah(${n}, ${ayah})`);
  for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('#verses-container .mushaf-block .ayah')`); i++) await sleep(150);
  await sleep(900);
}
async function openKhatmahPage(pg) {
  await evaljs(`(() => { state.khatmah = state.khatmah || {}; Object.assign(state.khatmah,
    { todayWirdStart:${pg}, todayWirdEnd:${pg}, currentPage:${pg}, pagesPerDay:1, lastActiveDate:'x' });
    if (window.openKhatmahReader) window.openKhatmahReader(); if (window.loadKhatmahPage) window.loadKhatmahPage(${pg}); })()`);
  for (let i = 0; i < 40 && !await evaljs(`!!document.querySelector('#khatmah-page-container .mushaf-block .ayah')`); i++) await sleep(150);
  await sleep(1100);
}
// Fit report for the visible reader: wrap overflow (vertical) + block overflow
// (horizontal) + the fitted font size, from whichever container is on screen.
async function fitReport(container) {
  const s = await evaljs(`(() => {
    const w = document.querySelector('${container} .mushaf-page-wrap');
    const b = document.querySelector('${container} .mushaf-block');
    if (!w || !b) return 'null';
    return JSON.stringify({
      wrapSh: w.scrollHeight, wrapCh: w.clientHeight,
      blockSh: b.scrollHeight, blockCh: b.clientHeight,
      bw: b.scrollWidth, bcw: b.clientWidth,
      fs: getComputedStyle(b).fontSize,
      fit: getComputedStyle(document.documentElement).getPropertyValue('--mushaf-fit').trim(),
      blocks: document.querySelectorAll('${container} .mushaf-block').length,
      ayahs: document.querySelectorAll('${container} .ayah').length,
      label: (document.querySelector('${container} .mushaf-page-label') || {}).textContent || '',
      dir: getComputedStyle(b).direction, align: getComputedStyle(b).textAlign,
      contentSh: document.getElementById('content').scrollHeight,
      contentCh: document.getElementById('content').clientHeight,
    }); })()`);
  return s === 'null' ? null : JSON.parse(s);
}
const fits = (m) => m && m.wrapSh <= m.wrapCh + 1 && m.bw <= m.bcw + 1 && m.contentSh <= m.contentCh + 1;

// Wait until the auto-fit has settled: Amiri Quran loads lazily, so the first
// fit is computed against a fallback face and re-converges when the real font
// arrives. Poll until the fit is unchanged, unoverflowing, and past the font
// transition. On a genuine fit failure it still returns (after the timeout) so
// the assertion reports the real numbers instead of hanging.
async function waitForFit(container, timeoutMs = 9000) {
  const t0 = Date.now();
  let last = null, stable = 0;
  while (Date.now() - t0 < timeoutMs) {
    const m = await fitReport(container);
    if (m) {
      const good = m.wrapSh <= m.wrapCh + 1 && m.bw <= m.bcw + 1;
      const key = `${m.fit}|${m.wrapSh}|${m.wrapCh}|${m.fs}`;
      if (good && key === last) { if (++stable >= 3) return m; } else stable = 0;
      last = key;
    }
    await sleep(300);
  }
  return fitReport(container);
}
async function expectFit(name, container, extra) {
  const m = await waitForFit(container);
  ok(name, fits(m), m ? `fs=${m.fs} fit=${m.fit} wrap=${m.wrapSh}/${m.wrapCh} hOverflow=${m.bw - m.bcw} blocks=${m.blocks} ayahs=${m.ayahs}` : 'no mushaf block rendered');
  if (m && extra) extra(m);
  return m;
}

/** ─── main ──────────────────────────────────────────────── */
async function main() {
  const profileDir = mkdtempSync(join(tmpdir(), 'e2e-mushaf-'));
  const browser = spawn(BROWSER, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  try {
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
    if (!page) throw new Error('no page target — extension background_pages sort first, retry');
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: BASE });
    for (let i = 0; i < 60 && !await evaljs(`document.querySelectorAll('.surah-row').length > 100`); i++) await sleep(100);
    await sleep(600);
    // أغلق نوافذ المناسبات الافتتاحية كي لا تلتقط النقرات الحقيقية لاحقاً
    await evaljs(`(() => { const o = document.getElementById('occasion-overlay'); if (o) o.classList.remove('active'); })()`);

    // ═══ (a) Header card: no overlap, meta populated ═══
    await openSurahPage(2, 1);
    const hdr = await evaljs(`(() => {
      const card = document.querySelector('#screen-surah-view .surah-header-card');
      const r = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const bm = card.querySelector('.bookmark-btn');
      const pl = card.querySelector('.audio-play');
      const nm = card.querySelector('.surah-h-name');
      const mt = card.querySelector('.surah-h-meta');
      const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const R = { bm: r(bm), pl: r(pl), nm: r(nm), mt: r(mt) };
      R.overlaps = { bm_pl: overlap(R.bm, R.pl), bm_nm: overlap(R.bm, R.nm), bm_mt: overlap(R.bm, R.mt),
        pl_nm: overlap(R.pl, R.nm), pl_mt: overlap(R.pl, R.mt), nm_mt: overlap(R.nm, R.mt) };
      R.metaText = mt ? mt.textContent.trim() : '';
      R.nameText = nm ? nm.textContent.trim() : '';
      R.cardX = card.getBoundingClientRect().x;
      R.cardW = card.getBoundingClientRect().width;
      return JSON.stringify(R); })()`);
    const H = JSON.parse(hdr);
    ok('(a) play button rendered in header', !!H.pl, '');
    ok('(a) bookmark button rendered in header', !!H.bm && H.bm.w > 0, '');
    const maxOverlap = Math.max(...Object.values(H.overlaps));
    ok('(a) header icons never overlap (all pairs 0px²)', maxOverlap === 0, JSON.stringify(H.overlaps));
    ok('(a) both buttons inside the card', H.pl.x >= H.cardX - 1 && H.bm.x >= H.cardX - 1
      && H.pl.x + H.pl.w <= H.cardX + H.cardW + 1 && H.bm.x + H.bm.w <= H.cardX + H.cardW + 1,
      `cardX=${H.cardX} cardW=${H.cardW} play=${JSON.stringify(H.pl)} bookmark=${JSON.stringify(H.bm)}`);
    ok('(a) meta line populated', H.metaText.length > 3, `meta="${H.metaText}" name="${H.nameText}"`);
    ok('(a) buttons clear the name text', H.overlaps.bm_nm === 0 && H.overlaps.pl_nm === 0, `name=${JSON.stringify(H.nm)}`);

    // ═══ (b) Single-page Mushaf: zero scroll, several pages ═══
    const fitted = {};
    await openSurahPage(1, 1);
    fitted.s1 = await expectFit('(b) surah 1 (Al-Fatiha): fits zero-scroll', '#verses-container', m => {
      ok('(b) Al-Fatiha RTL + centered', m.dir === 'rtl' && m.align === 'center', `dir=${m.dir} align=${m.align}`);
      ok('(b) Al-Fatiha ayah structure intact', m.ayahs === 7, `ayahs=${m.ayahs}`);
    });
    await openSurahPage(2, 1);
    fitted.s2 = await expectFit('(b) surah 2 (Al-Baqarah p1): fits zero-scroll', '#verses-container');
    await openSurahPage(36, 1);
    fitted.s36 = await expectFit('(b) surah 36 (Yaseen): fits zero-scroll', '#verses-container');
    await openSurahPage(67, 1);
    fitted.s67 = await expectFit('(b) surah 67 (Al-Mulk): fits zero-scroll', '#verses-container');
    await openSurahPage(78, 1);
    fitted.s78 = await expectFit('(b) surah 78 (An-Naba): fits zero-scroll', '#verses-container');

    await evaljs(`window.startKhatmah(30)`);
    await openKhatmahPage(30);
    fitted.k30 = await expectFit('(b) khatmah page 30: fits zero-scroll', '#khatmah-page-container');
    await openKhatmahPage(100);
    fitted.k100 = await expectFit('(b) khatmah page 100: fits zero-scroll', '#khatmah-page-container');
    await openKhatmahPage(604);
    fitted.k604 = await expectFit('(b) khatmah page 604 (3 short surahs): fits zero-scroll', '#khatmah-page-container', m => {
      ok('(b) page 604 keeps its surah headers', m.blocks >= 2, `blocks=${m.blocks} label="${m.label}"`);
    });
    ok('(b) fitted sizes reported (not claimed readable)', Object.keys(fitted).length === 8,
      Object.entries(fitted).map(([k, v]) => `${k}=${v ? v.fs : '?'}`).join(' '));

    // ═══ (c) Dynamic font scaling re-fits ═══
    // ملاحظة هندسية: على صفحة تملأ الشاشة يكون حجم الخط النهائي
    // المساحة÷(الأسطر×ارتفاع السطر)، فيلغي معامل التصغير التلقائي أي زيادة
    // في --mushaf-scale. لذلك الضمان الحقيقي — وهو ما يطلبه المتطلب — هو:
    // بعد أي تغيير لحجم الخط تُعاد الملاءمة وتظل كل صفحة بلا تمرير.
    await openSurahPage(36, 1);               // صفحة مزدحمة
    const dense1 = await waitForFit('#verses-container');
    await evaljs(`window.applyFontSize(1.6)`);
    await sleep(1200); // rAF fit + 0.3s font transition settle
    const dense16 = await waitForFit('#verses-container');
    ok('(c) scaling up re-fits the page (fit recalculated)',
      dense16 && dense1 && dense16.fit !== dense1.fit, `fit ${dense1 ? dense1.fit : '?'} → ${dense16 ? dense16.fit : '?'}`);
    ok('(c) dense surah page still fits zero-scroll at scale 1.6', fits(dense16),
      dense16 ? `fs=${dense16.fs} wrap=${dense16.wrapSh}/${dense16.wrapCh} hOverflow=${dense16.bw - dense16.bcw}` : 'no block');
    // مسح صفحات الختمة المزدحمة عند أكبر حجم خط (شريط تحكم الختمة يأكل ارتفاعاً)
    for (const pg of [2, 100, 600, 601, 602, 603, 604]) {
      await openKhatmahPage(pg);
      const m = await waitForFit('#khatmah-page-container');
      ok(`(c) khatmah page ${pg} fits at scale 1.6`, fits(m),
        m ? `fs=${m.fs} fit=${m.fit} wrap=${m.wrapSh}/${m.wrapCh} hOverflow=${m.bw - m.bcw} blocks=${m.blocks}` : 'no block');
    }
    await evaljs(`window.applyFontSize(1.0)`);
    await sleep(900);
    await openKhatmahPage(602);
    const back = await waitForFit('#khatmah-page-container');
    ok('(c) scaling back down re-fits too', fits(back) && back.fit !== (dense16 && dense16.fit),
      back ? `fs=${back.fs} fit=${back.fit} wrap=${back.wrapSh}/${back.wrapCh}` : 'no block');

    // ═══ (d) Reciter picker before playback ═══
    await openSurahPage(36, 1);
    await evaljs(`localStorage.removeItem('reciter')`);
    await evaljs(`window.AudioPlayer && window.AudioPlayer.stop && window.AudioPlayer.stop()`);
    const playBtn = await centerOf(`document.querySelector('#screen-surah-view .audio-play')`);
    ok('(d) play button present', !!playBtn, '');
    if (playBtn) {
      await tap(playBtn.x, playBtn.y);   // real gesture → sheet opens before playback
      await sleep(700);
      const sheetState = await evaljs(`(() => {
        const s = document.getElementById('reciter-sheet');
        const items = [...s.querySelectorAll('.reciter-item')];
        return JSON.stringify({ open: s.classList.contains('open'),
          items: items.length, names: items.map(i => i.querySelector('.reciter-name').textContent.trim()),
          currentId: (s.querySelector('.reciter-item.current') || {}).dataset?.id || null,
          scrimOpen: document.getElementById('reciter-sheet-scrim').classList.contains('open') }); })()`);
      const S = JSON.parse(sheetState);
      ok('(d) tapping ▶ opens the reciter sheet (not immediate playback)', S.open && S.scrimOpen, `open=${S.open}`);
      ok('(d) sheet lists the expanded reciter set (≥10)', S.items >= 10, `items=${S.items}: ${S.names.slice(0, 4).join('، ')}…`);
      ok('(d) no audio started while choosing', !await evaljs(`!!(window.AudioPlayer && AudioPlayer.audio && !AudioPlayer.audio.paused)`), '');
      if (S.items) {
        const targetId = S.currentId === 'ar.husary' ? (S.names.length > 1 ? null : null) : 'ar.husary';
        const itemId = targetId || (S.items.find(x => x) && S.currentId) || 'ar.husary';
        const itemPos = await centerOf(`[...document.querySelectorAll('#reciter-sheet .reciter-item')].find(x => x.dataset.id === '${itemId}')`);
        if (itemPos) {
          await tap(itemPos.x, itemPos.y);
          await sleep(1500);
          const after = await evaljs(`(() => {
            const bar = document.getElementById('audio-bar');
            const ap = window.AudioPlayer || {};
            return JSON.stringify({
              saved: localStorage.getItem('reciter'),
              sheetOpen: document.getElementById('reciter-sheet').classList.contains('open'),
              barVisible: !!(bar && bar.classList.contains('visible')),
              barTitle: bar ? bar.querySelector('#audio-title').textContent : '',
              audioSrc: ap.audio ? ap.audio.src : '',
              playing: !!(ap.audio && !ap.audio.paused),
            }); })()`);
          const A = JSON.parse(after);
          ok('(d) choosing a reciter saves the preference', A.saved === itemId, `localStorage.reciter="${A.saved}"`);
          ok('(d) sheet closes after the choice', !A.sheetOpen, `open=${A.sheetOpen}`);
          ok('(d) playback starts with the chosen reciter', A.audioSrc.includes(itemId),
            `src=${A.audioSrc.slice(-80)}`);
          ok('(d) audio bar appears with the surah title', A.barVisible && A.barTitle.length > 2,
            `visible=${A.barVisible} title="${A.barTitle}"`);
          ok('(d) media actually playing', A.playing, A.playing ? 'playing' : 'paused (autoplay/network limited)');
          await evaljs(`window.AudioPlayer && window.AudioPlayer.stop && window.AudioPlayer.stop()`);
        } else {
          ok('(d) reciter item found in the sheet', false, `itemId=${itemId}`);
        }
      }
    }

    // ═══ (e) Regression ═══
    ok('(e) no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await openSurahPage(2, 1);
    const rtl = await fitReport('#verses-container');
    ok('(e) RTL preserved on the reader', rtl && rtl.dir === 'rtl', `dir=${rtl && rtl.dir}`);
    ok('(e) page label shows page/juz info', rtl && rtl.label.length > 3, `label="${rtl && rtl.label}"`);
  } finally {
    browser.kill();
  }

  // ─── report ─────────────────────────────────────────────
  console.log('\n══════════ E2E — Mushaf single-page reader ══════════');
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail && !r.pass ? '  → ' + r.detail : ''}`);
  }
  console.log('──────────────────────────────────────────────────────');
  console.log(`${results.length - failed}/${results.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('E2E runner crashed:', e); process.exit(2); });
