#!/usr/bin/env node
/**
 * Unit suite — mushaf.js integrity gate, storage, and cancellation
 * ───────────────────────────────────────────────────────────────────
 * Loads mushaf.js inside a shimmed window (no DOM). IndexedDB is
 * deliberately absent so these tests exercise the *localStorage fallback*
 * store; the real IndexedDB path is exercised end-to-end by
 * tests/e2e-mushaf.mjs in a real browser.
 *
 * The Quran payload here is synthetic but schema-faithful: 114 surahs with
 * ayah counts taken from the app's own bundled SURAH_META (the same counts
 * the production integrity gate checks against), spread evenly over all
 * 604 pages. The point is to prove the gate accepts a valid corpus and
 * rejects every kind of corruption — not to re-verify the real text.
 *
 * Run: node tests/unit-mushaf.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = await readFile(join(__dirname, '..', 'mushaf.js'), 'utf8');
const metaSrc = await readFile(join(__dirname, '..', 'surah-meta.js'), 'utf8');

/* ---------- shimmed environment ---------- */
function makeEnv({ fetchImpl } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    get length() { return store.size; },
  };
  const win = {};
  // surah-meta.js does `window.SURAH_META = [...]`
  new Function('window', metaSrc)(win);
  // مولّد الآيات المشترك يعيش داخل index.html — نسخة مبسّطة للوحدة
  win.buildMushafHTML = (ayahs) => (ayahs || []).map(a => '<span class="ayah">' + String(a.text) + '</span>').join(' ');
  const fetch = fetchImpl || (async () => { throw new Error('no fetch configured'); });
  // indexedDB intentionally *absent* → localStorage fallback branch
  const M = new Function('window', 'localStorage', 'fetch', 'indexedDB', src + '\nreturn window.MushafPageManager;')(
    win, localStorage, fetch, undefined);
  return { M, win, localStorage, store };
}

/* ---------- synthetic Quran payload ---------- */
function syntheticPayload({ mutate } = {}) {
  const w = {};
  new Function('window', metaSrc)(w);
  const META = w.SURAH_META;
  const surahs = [];
  let counter = 0;
  META.forEach((s, i) => {
    const ayahs = [];
    for (let k = 1; k <= s.numberOfAyahs; k++) {
      const page = Math.min(604, Math.floor(counter * 604 / 6236) + 1);
      const juz = Math.min(30, Math.floor(counter * 30 / 6236) + 1);
      ayahs.push({
        number: counter + 1,
        numberInSurah: k,
        page,
        juz,
        sajda: false,
        text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ آيةٌ ' + (i + 1) + ':' + k,
        surah: { number: i + 1, name: s.name, englishName: s.englishName },
      });
      counter++;
    }
    surahs.push({ number: i + 1, name: s.name, englishName: s.englishName, ayahs });
  });
  if (mutate) mutate(surahs);
  return { code: 200, status: 'OK', data: { surahs } };
}

function payloadJSON(opts) { return JSON.stringify(syntheticPayload(opts)); }

/* ---------- tests ---------- */
const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

async function main() {
  console.log('═══ Unit: mushaf.js — integrity gate, storage, cancel ═══\n');

  /* (1) valid corpus is accepted, indexed, and persisted */
  {
    const { M } = makeEnv({ fetchImpl: async () => new Response(payloadJSON()) });
    const r = await M.download();
    ok('(1) valid payload downloads and verifies', r === true);
    ok('(1) M.ready', M.ready === true);
    ok('(1) exactly 6236 ayahs indexed', M.ayahs.length === 6236);
    ok('(1) all 604 pages non-empty', M.pages.slice(1).every(p => p.length > 0));
    ok('(1) surah 1 starts on page 1', M.firstPageOfSurah(1) === 1);
    ok('(1) status ready', M.getStatus().state === 'ready');
    ok('(1) compact blob persisted (localStorage fallback)', M.getStatus().storage === 'ls');
  }

  /* (2) pageHTML renders via the shared builder and is escaped-safe */
  {
    const { M } = makeEnv({ fetchImpl: async () => new Response(payloadJSON()) });
    await M.download();
    const html = M.pageHTML(1);
    ok('(2) pageHTML produces a page label', /class="mushaf-page-label"/.test(html));
    ok('(2) pageHTML produces ayah spans', /class="ayah"/.test(html));
    ok('(2) pageHTML contains no raw unescaped script tag', !/<script/.test(html));

    // مسار الاحتياط: بدون window.buildMushafHTML يجب أن يُهرّب النص لا أن يُلقى خطأ
    const winB = {}; new Function('window', metaSrc)(winB);
    const MB = new Function('window', 'localStorage', 'fetch', 'indexedDB', src + '\nreturn window.MushafPageManager;')(
      winB, makeLs(new Map()), async () => new Response(payloadJSON()), undefined);
    await MB.download();
    const htmlB = MB.pageHTML(2);
    ok('(2b) fallback render without buildMushafHTML', /class="ayah"/.test(htmlB));
    ok('(2b) fallback escapes payload text', htmlB.indexOf('<script') === -1);
  }

  /* (3) a dropped ayah (wrong count) is rejected and nothing is stored */
  {
    const store = new Map();
    const ls = makeLs(store);
    const win = {}; new Function('window', metaSrc)(win);
    const M = new Function('window', 'localStorage', 'fetch', 'indexedDB', src + '\nreturn window.MushafPageManager;')(
      win, ls, async () => new Response(payloadJSON({ mutate: surahs => { surahs[113].ayahs.pop(); } })), undefined);
    let rejected = null;
    try { await M.download(); } catch (e) { rejected = e; }
    ok('(3) corrupted count is rejected', !!rejected);
    ok('(3) nothing persisted on rejection', !store.has('mushaf_quran_v2'));
    ok('(3) status is error', M.getStatus().state === 'error');
  }

  /* (4) an out-of-range page is rejected */
  {
    const { M } = makeEnv({ fetchImpl: async () => new Response(payloadJSON({ mutate: surahs => { surahs[0].ayahs[1].page = 9999; } })) });
    let rejected = null;
    try { await M.download(); } catch (e) { rejected = e; }
    ok('(4) invalid page number rejected', !!rejected && /رقم صفحة|صفحة/i.test(rejected.message));
    ok('(4) M not ready', M.ready === false);
  }

  /* (5) an empty page is rejected (a page with no ayahs) */
  {
    const { M } = makeEnv({ fetchImpl: async () => new Response(payloadJSON({ mutate: surahs => {
      // route every ayah of page 300 onto page 301, leaving 300 empty
      for (const s of surahs) for (const a of s.ayahs) if (a.page === 300) a.page = 301;
    } })) });
    let rejected = null;
    try { await M.download(); } catch (e) { rejected = e; }
    ok('(5) empty page rejected', !!rejected && /فارغة/.test(rejected.message));
  }

  /* (6) wrong surah count and non-array payloads rejected */
  {
    const { M } = makeEnv({ fetchImpl: async () => new Response(JSON.stringify({ data: { surahs: [] } })) });
    let rejected = null;
    try { await M.download(); } catch (e) { rejected = e; }
    ok('(6) zero-surah payload rejected', !!rejected);
  }
  {
    const { M } = makeEnv({ fetchImpl: async () => new Response(JSON.stringify({ data: { surahs: 'nope' } })) });
    let rejected = null;
    try { await M.download(); } catch (e) { rejected = e; }
    ok('(6b) non-array surahs rejected', !!rejected);
  }

  /* (7) persistence: a fresh module reload sees the stored corpus */
  {
    const store = new Map();
    const ls = makeLs(store);
    const win = {}; new Function('window', metaSrc)(win);
    const M1 = new Function('window', 'localStorage', 'fetch', 'indexedDB', src + '\nreturn window.MushafPageManager;')(
      win, ls, async () => new Response(payloadJSON()), undefined);
    await M1.download();
    ok('(7) corpus written', store.has('mushaf_quran_v2'));

    // simulate a page reload: brand-new module state, same storage
    const win2o = {}; new Function('window', metaSrc)(win2o);
    const M2 = new Function('window', 'localStorage', 'fetch', 'indexedDB', src + '\nreturn window.MushafPageManager;')(
      win2o, ls, async () => { throw new Error('network must NOT be touched'); }, undefined);
    const loaded = await M2.load();
    ok('(7) reload loads corpus locally (no network)', loaded === true);
    ok('(7) reloaded index intact', M2.ayahs.length === 6236 && M2.ready === true);
    ok('(7) reloaded pageHTML works', /class="ayah"/.test(M2.pageHTML(604)));
  }

  /* (8) cancel: an abort mid-download rejects with 'cancelled' and stores nothing */
  {
    const fullText = payloadJSON();
    const chunks = [];
    const step = 64 * 1024;
    for (let i = 0; i < fullText.length; i += step) chunks.push(new TextEncoder().encode(fullText.slice(i, i + step)));
    let seenProgress = 0;
    const fetchImpl = async (_url, opts) => {
      const stream = new ReadableStream({
        start(controller) {
          let i = 0;
          const t = setInterval(() => {
            if (opts && opts.signal && opts.signal.aborted) { clearInterval(t); controller.error(new DOMException('aborted', 'AbortError')); return; }
            if (i < chunks.length) { controller.enqueue(chunks[i++]); }
            else { clearInterval(t); controller.close(); }
          }, 15);
        }
      });
      return new Response(stream, { headers: { 'content-length': String(fullText.length) } });
    };
    const { M } = makeEnv({ fetchImpl });
    const p = M.download({ onProgress: () => { seenProgress++; } });
    await new Promise(r => setTimeout(r, 60));   // let a few chunks land
    M.cancelDownload();
    let rejected = null;
    try { await p; } catch (e) { rejected = e; }
    ok('(8) abort rejects the download', !!rejected);
    ok('(8) rejection is an explicit cancel', /cancelled/i.test(String(rejected && rejected.message)));
    ok('(8) progress callbacks fired before cancel', seenProgress > 0);
    ok('(8) no corpus after cancel', M.ready === false);
  }

  /* (9) erase() clears the corpus and status */
  {
    const store = new Map();
    const ls = makeLs(store);
    const win = {}; new Function('window', metaSrc)(win);
    const M = new Function('window', 'localStorage', 'fetch', 'indexedDB', src + '\nreturn window.MushafPageManager;')(
      win, ls, async () => new Response(payloadJSON()), undefined);
    await M.download();
    ok('(9) corpus present before erase', M.ready === true);
    await M.erase();
    ok('(9) erase clears blob', !store.has('mushaf_quran_v2'));
    ok('(9) erase clears status', !store.has('mushaf_status'));
    ok('(9) status reads as none after erase', M.getStatus().state === 'none');
    ok('(9) not ready after erase', M.ready === false);
    const re = await M.load();
    ok('(9) nothing loads after erase', re === false);
  }

  /* (10) content-length known → percentage progress path.
     total is UTF-8 *bytes*, not string code units. */
  {
    const text = payloadJSON();
    const bytes = Buffer.byteLength(text, 'utf8');
    let last = null;
    const { M } = makeEnv({ fetchImpl: async () => new Response(text, { headers: { 'content-length': String(bytes) } }) });
    await M.download({ onProgress: p => { last = p; } });
    ok('(10) progress reported with a byte-accurate total', !!last && last.total === bytes);
    ok('(10) progress bytes reach the full size', last && last.bytes === bytes);
  }

  /* report */
  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  console.log('─'.repeat(50));
  console.log(`${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length) { for (const r of failed) console.log('FAIL DETAIL: ' + r.name + ' — ' + r.detail); process.exit(1); }
}

function makeLs(store) {
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
}

main().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
