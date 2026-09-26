#!/usr/bin/env node
/**
 * E2E suite — Offline Mushaf corpus (download, integrity, offline reading)
 * ───────────────────────────────────────────────────────────────────
 * Phase 3b: drives the real download through the Settings UI against the
 * live alquran.cloud source in a real browser, then cuts the connection at
 * the network layer and proves the Khatmah reader renders page 293 (Al-Kahf)
 * and 294 purely from the local IndexedDB corpus — no network at all.
 *
 * It also asserts the local render is *structurally identical* to the
 * existing network render of the same page (same ayah/surah-header/
 * bismillah/mushaf-block counts), so the offline path is not a second,
 * divergent renderer.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1
 *   2) node tests/e2e-mushaf.mjs
 *
 * Not verified by this suite: real-device behaviour, iOS Safari, audio
 * offline (audio still streams from the CDN by design).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9233);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

let ws, idSeq = 0;
const pending = new Map();
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, m => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => {
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
  return r.result?.value;
});

async function waitFor(expr, { timeout = 20000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const v = await evaljs(expr);
    if (v) return v;
    await sleep(interval);
  }
  return null;
}

const KHATMAH_PLAN = `window.state.khatmah = { active: true, method: 'pages', totalDays: null, pagesPerDay: 8, currentPage: 293, todayWirdStart: 293, todayWirdEnd: 300, lastPageRead: 293, lastActiveDate: new Date().toISOString().slice(0,10) }; window.saveState();`;

async function pageStructure() {
  return evaljs(`(() => { const c = document.getElementById('khatmah-page-container'); if (!c) return null;
    return { blocks: c.querySelectorAll('.mushaf-block').length, headers: c.querySelectorAll('.surah-header-card').length,
             bism: c.querySelectorAll('.bismillah').length, ayahs: c.querySelectorAll('.ayah').length,
             label: (c.querySelector('.mushaf-page-label')||{}).textContent || '' }; })()`);
}

async function openReader(page) {
  await evaljs(`${KHATMAH_PLAN} window.state.khatmah.currentPage = ${page}; window.showScreen('khatmah-read','slide-left'); window.loadKhatmahPage(${page});`);
  return waitFor(`document.getElementById('khatmah-page-container').querySelectorAll('.ayah').length > 0`, { timeout: 25000 });
}

async function main() {
  console.log('═══ E2E: Offline Mushaf corpus ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-mushaf-'));
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
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('no page target');
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    // ── (a) Settings card renders with the download affordance ──
    console.log('(a) offline-Quran card in Settings...');
    await send('Page.navigate', { url: `${BASE}?e2e=mushaf` });
    await sleep(3500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await evaljs(`window.openSettings && window.openSettings()`);
    await waitFor(`!!document.getElementById('quran-dl')`);
    ok('(a) download button present', !!(await evaljs(`!!document.getElementById('quran-dl') && !document.getElementById('quran-dl').hidden`)));
    ok('(a) attribution line names alquran.cloud', await evaljs(`document.getElementById('settings-container').textContent.includes('alquran.cloud')`));
    ok('(a) initial state is not-downloaded', await evaljs(`window.MushafPageManager.getStatus().state === 'none'`));

    // ── (b) capture the NETWORK render of page 293 as the reference ──
    console.log('(b) reference: network render of page 293 (Al-Kahf)...');
    await openReader(293);
    const netStruct = await pageStructure();
    ok('(b) network render produced ayahs', netStruct && netStruct.ayahs > 0, netStruct ? JSON.stringify(netStruct) : 'no structure');
    ok('(b) network render shows the Al-Kahf header', await evaljs(`window.normArabic(document.getElementById('khatmah-page-container').textContent).includes('الكهف')`));
    ok('(b) header text is the source voweled name', await evaljs(`document.getElementById('khatmah-page-container').textContent.includes('الكَهۡفِ')`));

    // ── (c) download the full corpus through the UI, with progress ──
    console.log('(c) downloading the full corpus (live source)...');
    await evaljs(`window.openSettings && window.openSettings()`);
    await waitFor(`!!document.getElementById('quran-dl')`);
    await evaljs(`document.getElementById('quran-dl').click()`);
    const downloadingSeen = await waitFor(`window.MushafPageManager.getStatus().state === 'downloading' && !document.getElementById('quran-dl-bar').hidden`, { timeout: 8000 });
    ok('(c) progress bar visible while downloading', !!downloadingSeen);
    const ready = await waitFor(`window.MushafPageManager.getStatus().state === 'ready'`, { timeout: 180000, interval: 400 });
    ok('(c) download reached ready', !!ready, ready ? '' : 'timed out waiting for ready');

    if (ready) {
      ok('(c) 6236 ayahs indexed', await evaljs(`window.MushafPageManager.ayahs.length === 6236`));
      ok('(c) all 604 pages non-empty', await evaljs(`window.MushafPageManager.pages.slice(1).every(p => p.length > 0)`));
      ok('(c) Al-Fatiha begins on page 1', await evaljs(`window.MushafPageManager.firstPageOfSurah(1) === 1`));
      ok('(c) An-Nas ends on page 604', await evaljs(`window.MushafPageManager.pageAyahs(604).some(a => a.surah.number === 114)`));
      ok('(c) card switched to the delete affordance', await evaljs(`!document.getElementById('quran-dl-delete').hidden && document.getElementById('quran-dl').hidden`));
    }

    // ── (d) local render is structurally identical to the network render ──
    console.log('(d) local vs network render of page 293...');
    if (ready) {
      await openReader(293);
      const localStruct = await pageStructure();
      ok('(d) local render produced ayahs', localStruct && localStruct.ayahs > 0);
      ok('(d) identical ayah count', localStruct && netStruct && localStruct.ayahs === netStruct.ayahs,
         `local=${localStruct && localStruct.ayahs} net=${netStruct && netStruct.ayahs}`);
      ok('(d) identical surah-header count', localStruct && netStruct && localStruct.headers === netStruct.headers,
         `local=${localStruct && localStruct.headers} net=${netStruct && netStruct.headers}`);
      ok('(d) identical bismillah count', localStruct && netStruct && localStruct.bism === netStruct.bism);
      ok('(d) identical mushaf-block count', localStruct && netStruct && localStruct.blocks === netStruct.blocks);
    }

    // ── (e) reload: the corpus loads from IndexedDB with no network help ──
    console.log('(e) reload, corpus loads locally...');
    await send('Page.navigate', { url: `${BASE}?e2e=mushaf&reload=1` });
    await sleep(3500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    ok('(e) ready right after reload (local corpus)', await waitFor(`window.MushafPageManager.ready === true`, { timeout: 8000 }));
    ok('(e) status reads ready', await evaljs(`window.MushafPageManager.getStatus().state === 'ready'`));

    // ── (f) fully offline: Khatmah renders page 293 and 294 ──
    console.log('(f) cutting the network — offline Khatmah reading...');
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });
    await sleep(300);
    const renderedOffline = await openReader(293);
    ok('(f) page 293 renders while offline', !!renderedOffline);
    const offStruct = await pageStructure();
    ok('(f) offline render shows the Al-Kahf header', await evaljs(`window.normArabic(document.getElementById('khatmah-page-container').textContent).includes('الكهف')`));
    ok('(f) local header uses the same voweled name as the network path', await evaljs(`document.getElementById('khatmah-page-container').textContent.includes('الكَهۡفِ')`));
    ok('(f) offline ayah count matches network', offStruct && netStruct && offStruct.ayahs === netStruct.ayahs, `offline=${offStruct && offStruct.ayahs}`);

    await evaljs(`window.changeKhatmahPage(1)`);
    const p294 = await waitFor(`document.getElementById('khatmah-page-container').querySelectorAll('.ayah').length > 0 && document.getElementById('khatmah-page-container').textContent.includes('صفحة ٢٩٤')`, { timeout: 15000 });
    ok('(f) page 294 renders offline via changeKhatmahPage', !!p294);

    // ── (g) delete the corpus through the confirm dialog ──
    console.log('(g) deleting the local corpus...');
    await send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });
    await sleep(300);
    await evaljs(`window.openSettings && window.openSettings()`);
    await waitFor(`!!document.getElementById('quran-dl-delete') && !document.getElementById('quran-dl-delete').hidden`);
    await evaljs(`document.getElementById('quran-dl-delete').click()`);
    await waitFor(`document.getElementById('custom-dialog-overlay').classList.contains('active')`, { timeout: 5000 });
    ok('(g) delete asks for confirmation', await evaljs(`document.getElementById('custom-dialog-text').textContent.includes('الحذف')`));
    await evaljs(`document.getElementById('custom-dialog-ok').click()`);
    await waitFor(`window.MushafPageManager.getStatus().state === 'none'`, { timeout: 8000 });
    ok('(g) corpus deleted', await evaljs(`window.MushafPageManager.ready === false && window.MushafPageManager.getStatus().state === 'none'`));
    ok('(g) download button returns', await evaljs(`!document.getElementById('quran-dl').hidden`));

    // ── (h) after deletion the reader falls back to the network path ──
    console.log('(h) network fallback after deletion...');
    const fb = await openReader(2);
    ok('(h) page 2 renders via network after deletion', !!fb);
    const fbStruct = await pageStructure();
    ok('(h) fallback render carries ayahs', fbStruct && fbStruct.ayahs > 0);
  } finally {
    browser.kill('SIGKILL');
    try { spawn('rm', ['-rf', userDataDir]); } catch (e) {}
  }

  const failed = results.filter(r => !r.pass);
  console.log('─'.repeat(50));
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  console.log('─'.repeat(50));
  console.log(`${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length) process.exit(1);
}

main().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
