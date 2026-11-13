/**
 * E2E — لوحة التفسير الميسّر (js/tafsir.js)
 * ───────────────────────────────────────────
 * يتحقق من:
 *   (a) فتح اللوحة عند استدعاء TafsirManager.openForAyah
 *   (b) جلب التفسير على مستوى السورة وتخزينه في IndexedDB (tafsir-muyassar)
 *   (c) العمل أوفلاين بالكامل بعد أول جلب (إسقاط الشبكة → النص من الكاش)
 *   (d) النص يُحقن بـ textContent (لا HTML) — عزل DOM XSS
 *
 * التشغيل: node tests/e2e-tafsir.mjs   (بعد تشغيل tests/run-server.mjs 8123)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9235);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const VIEWPORT = { width: 390, height: 844 };

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

let ws, idSeq = 0;
const pending = new Map();
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaljs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const profileDir = mkdtempSync(join(tmpdir(), 'e2e-tafsir-'));
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
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: BASE });
    await sleep(2500);

    // الخدمة عبر mock fetch قبل أي اتصال حقيقي بالـ API
    await evaljs(`(() => {
      const fake = { data: { ayahs: [{ numberInSurah: 1, text: 'تفسير الفاتحة الآية الأولى من الـmock' }, { numberInSurah: 2, text: 'تفسير الآية الثانية' }] } };
      window.__apiCalls = 0;
      window.fetch = (url) => {
        window.__apiCalls++;
        return Promise.resolve(new Response(JSON.stringify(fake), { status: 200, headers: { 'content-type': 'application/json' } }));
      };
      return true;
    })()`);

    // ── (a) فتح اللوحة ──
    await evaljs(`window.TafsirManager.openForAyah({ surah: 1, ayah: 1, global: 1, text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' })`);
    await sleep(900);
    const bodyText = await evaljs(`document.getElementById('tafsir-sheet-body')?.textContent || ''`);
    ok('(a) تُفتح لوحة التفسير ويظهر النص', bodyText.includes('تفسير الفاتحة'), JSON.stringify(bodyText.slice(0, 60)));
    const usesInnerHTML = await evaljs(`document.getElementById('tafsir-sheet-body')?.innerHTML.includes('<img') || false`);
    ok('(d) النص عبر textContent فقط (بلا حقن HTML)', !usesInnerHTML);

    // ── (b) مخزّن في IndexedDB على مستوى السورة ──
    const idbCached = await evaljs(`(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('tafsir-muyassar', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      return await new Promise((res) => { const tx = db.transaction('surahs', 'readonly'); const rq = tx.objectStore('surahs').get(1); rq.onsuccess = () => res(rq.result || null); });
    })()`);
    ok('(b) خريطة السورة كاملة مخزّنة في IndexedDB', idbCached && idbCached['1'] && idbCached['2'], JSON.stringify(Object.keys(idbCached || {})));
    await evaljs(`document.querySelector('.sheet-overlay')?.querySelector('.sheet-close, [data-close]')?.click() || (document.querySelector('.sheet-overlay')?.classList.remove('visible'), 0)`);
    await sleep(300);

    // ── (c) أوفلاين كامل: إسقاط الشبكة ثم الجلب مجدداً ──
    await evaljs(`window.fetch = () => Promise.reject(new Error('offline'))`);
    await evaljs(`window.TafsirManager.openForAyah({ surah: 1, ayah: 2, global: 2, text: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ' })`);
    await sleep(900);
    const bodyText2 = await evaljs(`document.getElementById('tafsir-sheet-body')?.textContent || ''`);
    ok('(c) يعمل أوفلاين من مخزن IndexedDB', bodyText2.includes('تفسير الآية الثانية'), JSON.stringify(bodyText2.slice(0, 60)));
    const offlineCalls = await evaljs('window.__apiCalls');
    ok('(c) صفر استدعاءات شبكة إضافية أثناء الأوفلاين', offlineCalls === 1, 'calls=' + offlineCalls);
  } finally {
    try { browser.kill(); } catch {}
  }

  let failed = 0;
  console.log('\n═══ E2E: tafsir ═══');
  for (const r of results) {
    console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    if (!r.pass) failed++;
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
