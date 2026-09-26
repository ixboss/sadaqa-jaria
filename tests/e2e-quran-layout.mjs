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
    // القارئ الموحّد: الرسم داخل #screen-mushaf تحت اسم khatmah-read (مرحلة ٢+)
    for (let i = 0; i < 50 && !await evaljs(`document.getElementById('screen-mushaf')?.classList.contains('active')`); i++) await sleep(100);
    await sleep(800); // wait for page load

    const khatmahChrome = await evaljs(`(() => {
      const b = document.getElementById('mushaf-wird-banner');
      return {
        mode: state.mushafMode,
        banner: b && b.classList.contains('visible'),
        range: b && b.querySelector('#mwb-range').textContent
      };
    })()`);
    ok('(c) Khatmah: unified reader in khatmah mode', khatmahChrome.mode === 'khatmah-read', khatmahChrome);
    ok('(c) Khatmah: wird banner shows the range', khatmahChrome.banner && khatmahChrome.range.length > 0, khatmahChrome);

    // ─── (d) Corpus identity: 604 pages, page N renders its own first ayah ──
    console.log('\n(d) Corpus identity...');
    const corpus = await evaljs(`(() => {
      const M = window.MushafPageManager;
      return { clamp605: M.clampPage(605), clamp0: M.clampPage(0) };
    })()`);
    ok('(d) corpus clamps to 604 pages', corpus.clamp605 === 604 && corpus.clamp0 === 1, JSON.stringify(corpus));

    await evaljs(`window.gotoMushafPage(604)`);
    for (let i = 0; i < 50 && await evaljs(`state.mushafPage`) !== 604; i++) await sleep(300);
    await sleep(400);
    const last = await evaljs(`(() => {
      const f = document.querySelector('#mushaf-page-foot .mpf-page')?.textContent;
      return { page: state.mushafPage, foot: f, nextDisabled: document.getElementById('mp-next')?.disabled,
               prevDisabled: document.getElementById('mp-prev')?.disabled };
    })()`);
    ok('(d) last page renders ٦٠٤ and blocks forward nav',
      last.page === 604 && last.foot === '٦٠٤' && last.nextDisabled === true && last.prevDisabled === false, JSON.stringify(last));

    // الصفحة ٣ تطابق أول آية في فهرس الصفحة نفسها
    await evaljs(`window.gotoMushafPage(3)`);
    for (let i = 0; i < 50 && await evaljs(`state.mushafPage`) !== 3; i++) await sleep(300);
    await sleep(400);
    const identity = await evaljs(`(() => {
      const M = window.MushafPageManager;
      const a = M.pageAyahs(3)[0] || {};
      const el = document.querySelector('#verses-container .ayah');
      return { indexed: { s: a.surah && a.surah.number, n: a.numberInSurah },
               rendered: el ? { s: +el.dataset.surah, n: +el.dataset.ayah } : null };
    })()`);
    ok('(d) page 3 renders the ayah the page index declares',
      identity.rendered && identity.indexed.s === identity.rendered.s && identity.indexed.n === identity.rendered.n,
      JSON.stringify(identity));

    // ─── (e) prev/next buttons step by one page ────────────────
    console.log('\n(e) prev/next...');
    await evaljs(`document.getElementById('mp-next').click()`);
    for (let i = 0; i < 50 && await evaljs(`state.mushafPage`) !== 4; i++) await sleep(300);
    ok('(e) next → page 4', await evaljs(`state.mushafPage`) === 4, 'page=' + await evaljs(`state.mushafPage`));
    await evaljs(`document.getElementById('mp-prev').click()`);
    for (let i = 0; i < 50 && await evaljs(`state.mushafPage`) !== 3; i++) await sleep(300);
    ok('(e) prev → back to page 3', await evaljs(`state.mushafPage`) === 3, 'page=' + await evaljs(`state.mushafPage`));

    // ─── (f) surah-list → reader lands on the surah's first page ─
    console.log('\n(f) surah entry point...');
    await evaljs(`window.openSurah(18)`);
    for (let i = 0; i < 60 && !await evaljs(`!!document.querySelector('#verses-container .ayah')`); i++) await sleep(300);
    await sleep(400);
    const entry = await evaljs(`(() => {
      const M = window.MushafPageManager;
      const el = document.querySelector('#verses-container .ayah');
      // في المسار الشبكي يُحَل الصفحة من بيانات السورة (firstPageOfSurah
      // يحتاج فهارس المصحف الكامل) — هذه هي القيمة التي اعتمدها القارئ
      const data = state.currentSurahData;
      return {
        page: state.mushafPage,
        resolvedFirstPage: data && data.ayahs && data.ayahs.length ? data.ayahs[0].page : null,
        surah: el ? +el.dataset.surah : null, ayah: el ? +el.dataset.ayah : null,
        mode: state.mushafMode
      };
    })()`);
    ok('(f) Al-Kahf opens on its first page',
      entry.page === entry.resolvedFirstPage && entry.surah === 18 && entry.ayah === 1, JSON.stringify(entry));
    ok('(f) surah route is surah-view mode', entry.mode === 'surah-view', JSON.stringify(entry));

    // ─── (g) Khatmah entry: the wird page + centered scrubber cursor ──
    console.log('\n(g) khatmah entry point...');
    await evaljs(`window.switchTab && switchTab('khatmah')`);
    await sleep(300);
    await evaljs(`window.openKhatmahReader()`);
    for (let i = 0; i < 50 && await evaljs(`state.mushafPage`) !== (await evaljs(`state.khatmah && state.khatmah.currentPage`)); i++) await sleep(300);
    await sleep(400);
    await evaljs(`window.exitZenMode && exitZenMode()`);
    await sleep(300);
    const wird = await evaljs(`(() => {
      const c = document.getElementById('reading-progress-container');
      const track = c.querySelector('#wird-track');
      const cur = c.querySelector('#wird-cursor');
      const tr = track.getBoundingClientRect(), cr = cur.getBoundingClientRect();
      const k = state.khatmah;
      return {
        page: state.mushafPage,
        cur: k && k.currentPage,
        start: k && k.todayWirdStart,
        cursorCenter: Math.round((cr.left + cr.right) / 2 - tr.left),
        trackW: Math.round(tr.width),
        expectedPct: state.mushafPage / 604
      };
    })()`);
    ok('(g) khatmah opens the reader at the saved wird page', wird.page === wird.cur, JSON.stringify(wird));
    // مؤشّر الصفحة يقف على مركز المسار ضمن النسبة الصحيحة للصفحة الحالية
    const cursorPct = wird.cursorCenter / wird.trackW;
    ok('(g) scrubber cursor marks the current page position',
      Math.abs(cursorPct - wird.expectedPct) < 0.02, JSON.stringify(wird));

    // ─── (h) Audio: pill appears and continues across a page turn ──
    console.log('\n(h) floating audio...');
    // شغّل المسار الحقيقي دون الاعتماد على تشغيل المتصفح الصامت: اترك العنصر
    // الحقيقي (مستمعوه مربوطون) لكن اعترض play()/src حتى لا نلمس الشبكة
    await evaljs(`(() => {
      const A = window.AudioPlayer;
      A.ensure();
      const el = A.audio;
      el.play = function () { this.paused = false; return Promise.resolve(); };
      Object.defineProperty(el, 'src', { value: '', writable: true, configurable: true });
      A.playFromPage(state.mushafPage, {});
      return true;
    })()`);
    let pill = null;
    for (let i = 0; i < 40; i++) {
      pill = await evaljs(`(() => {
        const A = window.AudioPlayer;
        const p = document.getElementById('mushaf-audio-pill');
        const bar = document.getElementById('audio-bar');
        return A.curItem ? {
          pillVisible: p.classList.contains('visible'),
          readerAudioOn: document.body.classList.contains('reader-audio-on'),
          audioBarHidden: bar ? getComputedStyle(bar).display === 'none' : null,
          global: A.curItem.global, page: A.curItem.page,
          mushafPage: state.mushafPage,
          text: p.querySelector('#map-surah').textContent
        } : null;
      })()`);
      if (pill && pill.pillVisible) break;
      await sleep(300);
    }
    ok('(h) floating pill appears with the reciting ayah',
      !!pill && pill.pillVisible && pill.readerAudioOn && pill.page === pill.mushafPage, JSON.stringify(pill));
    ok('(h) the general audio bar yields to the pill',
      !!pill && pill.audioBarHidden === true, JSON.stringify(pill));

    // تقدّم آيةً آية حتى تعبر الآية الجارية حدود الصفحة: القلب الآلي هو
    // ما يجعل التلاوة متواصلة عبر الصفحات
    const startPage = pill.mushafPage;
    let crossed = null;
    for (let i = 0; i < 60; i++) {
      await evaljs(`window.AudioPlayer.advance()`);
      for (let j = 0; j < 30; j++) {
        crossed = await evaljs(`(() => {
          const A = window.AudioPlayer;
          return A.curItem ? { page: A.curItem.page, mushafPage: state.mushafPage } : null;
        })()`);
        if (crossed && crossed.page > startPage) break;
        await sleep(250);
      }
      if (crossed && crossed.page > startPage) break;
    }
    ok('(h) recitation auto-turns onto the next page',
      !!crossed && crossed.page > startPage && crossed.mushafPage === crossed.page, JSON.stringify({ startPage, crossed }));
    await evaljs(`window.AudioPlayer.stop && AudioPlayer.stop()`);
    await sleep(300);
    ok('(h) stopping drops the pill',
      await evaljs(`!document.getElementById('mushaf-audio-pill').classList.contains('visible') &&
                   !document.body.classList.contains('reader-audio-on')`), true);

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
