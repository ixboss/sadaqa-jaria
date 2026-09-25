#!/usr/bin/env node
/**
 * E2E suite — Khatmah lifecycle & Tasbih persistence
 * ───────────────────────────────────────────────────
 * Phase 1 correctness checks. The Quran page API is seeded into the service
 * worker's own API cache (quran-api-v42) so the reader renders deterministically
 * without depending on the network; everything else is driven through the app's
 * own functions (startKhatmah / changeKhatmahPage / completeWird / checkMissedDays
 * / resumeBookmark) and asserted against window.state.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1
 *   2) node tests/e2e-khatmah-lifecycle.mjs
 *
 * Scenarios:
 *   (a) startKhatmah clamps the start page to 1–604
 *   (b) a missed day reschedules the wird from the furthest progress
 *   (c) backward navigation never reduces recorded progress
 *   (d) completing a wird mid-plan advances it and stamps today
 *   (e) completing past page 604 finishes the khatmah
 *   (f) resumeBookmark reschedules a new day before opening the reader
 *   (g) the Tasbih count survives a page reload
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9225);
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
  pending.set(id, m => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => {
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
});

const k = () => evaljs(`window.state && window.state.khatmah ? JSON.stringify(window.state.khatmah) : null`).then(s => s ? JSON.parse(s) : null);

const arabic = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

// loadKhatmahPage ends by writing the "صفحة N" label into the container, so the
// label is the render-complete signal. (lastPageRead can't be used: after the
// monotonic-progress fix a backward hop renders page 4 but leaves lastPageRead at 5.)
async function waitForPage(n) {
  const want = `صفحة ${arabic(n)}`;
  for (let i = 0; i < 60; i++) {
    const label = await evaljs(`document.getElementById('khatmah-page-container')?.textContent || ''`);
    if (label.includes(want)) return;
    await sleep(100);
  }
  throw new Error(`page ${n} never finished loading`);
}

async function main() {
  console.log('═══ E2E: Khatmah lifecycle & Tasbih ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-khatmah-'));
  const browser = spawn(BROWSER, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--disable-sync',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    await sleep(1800);
    const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = await listRes.json();
    // headless Edge lists its own extension targets first; pick the real page
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('no page target among ' + targets.map(t => t.type).join(','));
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);

    // Seed the SW's API cache so the reader renders without the network.
    // numberInSurah > 1 keeps the fake page clear of the bismillah/surah-header
    // branches so the assertion is about state, not markup.
    await evaljs(`(async () => {
      const cache = await caches.open('quran-api-v42');
      const mk = n => ({ data: { ayahs: [{ number: 1000 + n, surah: { number: 2, name: 'البقرة' }, numberInSurah: 6, page: n, juz: 1, text: 'نص تجريبي للاختبار' }] } });
      for (let n = 1; n <= 42; n++) {
        await cache.put(new Request('https://api.alquran.cloud/v1/page/' + n + '/quran-uthmani'),
          new Response(JSON.stringify(mk(n)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return true;
    })()`);

    // ─── (a) start page clamping ─────────────────────────────
    console.log('(a) start page clamping...');
    await evaljs(`document.getElementById('k-start').value = '999'; document.getElementById('k-val').value = '20'; window.startKhatmah()`);
    let st = await k();
    ok('(a) 999 clamps to 604', st && st.currentPage === 604 && st.todayWirdStart === 604, JSON.stringify(st && { cur: st.currentPage, s: st.todayWirdStart, e: st.todayWirdEnd }));
    ok('(a) lastPageRead seeded at start-1', st && st.lastPageRead === 603, `lastPageRead=${st && st.lastPageRead}`);

    await evaljs(`window.state.khatmah = null; window.saveState(); document.getElementById('k-start').value = '-5'; window.startKhatmah()`);
    st = await k();
    ok('(a) -5 clamps to 1', st && st.currentPage === 1 && st.todayWirdStart === 1 && st.todayWirdEnd === 20, JSON.stringify(st && { cur: st.currentPage, s: st.todayWirdStart, e: st.todayWirdEnd }));
    ok('(a) first page seeds lastPageRead = 0', st && st.lastPageRead === 0, `lastPageRead=${st && st.lastPageRead}`);

    await evaljs(`window.state.khatmah = null; window.saveState(); document.getElementById('k-start').value = '10'; window.startKhatmah()`);
    st = await k();
    ok('(a) start 10 seeds lastPageRead = 9', st && st.currentPage === 10 && st.lastPageRead === 9, JSON.stringify(st && { cur: st.currentPage, last: st.lastPageRead }));

    // ─── (b) missed-day reschedule ───────────────────────────
    console.log('\n(b) missed days...');
    // user read ahead to 25 yesterday, then a day passed
    await evaljs(`window.state.khatmah.lastPageRead = 25; window.state.khatmah.lastActiveDate = '2020-01-01'; window.saveState()`);
    await evaljs(`window.checkMissedDays()`);
    st = await k();
    const today = await evaljs(`(new Date()).getFullYear() + '-' + String((new Date()).getMonth()+1).padStart(2,'0') + '-' + String((new Date()).getDate()).padStart(2,'0')`);
    ok('(b) reschedules from lastPageRead+1', st && st.todayWirdStart === 26 && st.currentPage === 26, JSON.stringify(st && { s: st.todayWirdStart, cur: st.currentPage }));
    ok('(b) wird length preserved', st && st.todayWirdEnd === 26 + st.pagesPerDay - 1, JSON.stringify(st && { e: st.todayWirdEnd, ppd: st.pagesPerDay }));
    ok('(b) lastActiveDate updated to today', st && st.lastActiveDate === today, `${st && st.lastActiveDate} vs ${today}`);

    // ─── (c) progress is monotonic ───────────────────────────
    console.log('\n(c) progress monotonic...');
    await evaljs(`window.state.khatmah = null; window.saveState(); document.getElementById('k-start').value = '1'; document.getElementById('k-val').value = '20'; window.startKhatmah()`);
    await evaljs(`window.openKhatmahReader()`);
    await waitForPage(1);
    for (const n of [2, 3, 4, 5]) {
      await evaljs(`window.changeKhatmahPage(1)`);
      await waitForPage(n);
    }
    st = await k();
    ok('(c) forward reads advance lastPageRead', st && st.lastPageRead === 5, `lastPageRead=${st && st.lastPageRead}`);

    // go back a page: the reader renders page 4, but recorded progress must stay 5
    await evaljs(`window.changeKhatmahPage(-1)`);
    await waitForPage(4);
    st = await k();
    ok('(c) backward navigation does not reduce lastPageRead', st && st.lastPageRead === 5, `lastPageRead=${st && st.lastPageRead} (expected 5)`);
    const dashLast = await evaljs(`document.getElementById('kd-last') && document.getElementById('kd-last').textContent`);
    ok('(c) dashboard still shows furthest page', dashLast === '٥', `kd-last="${dashLast}"`);

    // ─── (d) complete a wird mid-plan ────────────────────────
    console.log('\n(d) complete wird mid-plan...');
    await evaljs(`window.completeWird()`);
    for (let i = 0; i < 50 && !await evaljs(`window.state.khatmah && window.state.khatmah.todayWirdStart === 21`); i++) await sleep(100);
    st = await k();
    ok('(d) wird advances past todayWirdEnd', st && st.currentPage === 21 && st.todayWirdStart === 21 && st.todayWirdEnd === 40,
      JSON.stringify(st && { cur: st.currentPage, s: st.todayWirdStart, e: st.todayWirdEnd }));
    ok('(d) lastPageRead set to nx-1', st && st.lastPageRead === 20, `lastPageRead=${st && st.lastPageRead}`);
    ok('(d) lastActiveDate stamped', st && st.lastActiveDate === today, `${st && st.lastActiveDate}`);

    // ─── (e) finishing the whole Quran clears the khatmah ───
    console.log('\n(e) plan completion...');
    await evaljs(`window.state.khatmah = { active: true, method: 'pages', totalDays: null, pagesPerDay: 20, currentPage: 604, todayWirdStart: 585, todayWirdEnd: 604, lastPageRead: 604, lastActiveDate: '${today}' }; window.saveState()`);
    // the completion dialog is a confirmation-free notice; stub it so headless does not hang
    await evaljs(`window.showAppDialog = async () => true`);
    await evaljs(`window.completeWird()`);
    await sleep(600);
    st = await k();
    ok('(e) khatmah cleared at 604', st === null, `khatmah=${JSON.stringify(st)}`);

    // ─── (f) resumeBookmark reschedules a new day ────────────
    console.log('\n(f) resume bookmark...');
    await evaljs(`window.state.khatmah = { active: true, method: 'pages', totalDays: null, pagesPerDay: 20, currentPage: 1, todayWirdStart: 1, todayWirdEnd: 20, lastPageRead: 10, lastActiveDate: '2020-01-01' }; window.saveState()`);
    await evaljs(`window.state.bookmark = { type: 'khatmah', id: 10, name: 'صفحة ١٠' }; window.saveState()`);
    await evaljs(`window.resumeBookmark()`);
    st = await k();
    ok('(f) resume reschedules the new day', st && st.todayWirdStart === 11 && st.lastActiveDate === today,
      JSON.stringify(st && { s: st.todayWirdStart, e: st.todayWirdEnd, last: st.lastActiveDate }));
    ok('(f) opens on the bookmarked page', st && st.currentPage === 10, `currentPage=${st && st.currentPage}`);

    // ─── (g) Tasbih count survives a reload ──────────────────
    console.log('\n(g) Tasbih persistence...');
    await evaljs(`localStorage.setItem('tasbihCount', '17'); localStorage.setItem('tasbihLap', '1')`);
    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);
    // same handler the home "السبحة" card runs
    await evaljs(`window.showScreen('tasbih', 'slide-left'); window.buildTasbih(); window.updateTasbihUI()`);
    await sleep(700); // the count is announced on a 400ms debounced timer
    const saved = await evaljs(`localStorage.getItem('tasbihCount')`);
    const shown = await evaljs(`document.getElementById('tasbih-count-num').textContent`);
    const laps = await evaljs(`document.querySelectorAll('.tasbih-lap-dot.filled').length`);
    ok('(g) persisted count is not wiped on open', saved === '17', `localStorage tasbihCount="${saved}"`);
    ok('(g) screen shows the persisted count', shown === '١٧', `#tasbih-count-num="${shown}"`);
    ok('(g) persisted lap dot is filled', laps === 1, `filled dots=${laps}`);

    // ─── report ──────────────────────────────────────────────
    console.log('\n' + '─'.repeat(40));
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    console.log('─'.repeat(40));
    console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
    if (results.some(r => !r.pass)) process.exitCode = 1;
  } finally {
    browser.kill();
  }
}

main().catch(e => { console.error('SUITE ERROR:', e); process.exit(1); });
