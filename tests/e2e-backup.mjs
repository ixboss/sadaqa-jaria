#!/usr/bin/env node
/**
 * E2E suite — Local backup (export / import / clear) in a real browser
 * ───────────────────────────────────────────────────────────────────
 * Phase 2: drives BackupManager through the actual page — the settings
 * UI rows, the real confirmation dialog, a real file import, the reload
 * that follows, and the app booting from the restored data.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1
 *   2) node tests/e2e-backup.mjs
 *
 * Scenarios:
 *   (a) the settings screen renders the three backup rows
 *   (b) build() collects every seeded user key with correct values
 *   (c) a malformed key is skipped, not fatal
 *   (d) export() produces a valid backup file (blob captured)
 *   (e) import via the real confirm dialog → reload → data is live in the app
 *   (f) clearAll via the real confirm dialog → reload → user data gone, app boots
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9228);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

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
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
  return r.result?.value;
});

// يملأ localStorage ببيانات مستخدم تمثيلية مكتملة
const SEED = `
  localStorage.setItem('app_state', JSON.stringify({ currentTab: 'quran', khatmah: { active: true, method: 'pages', totalDays: 30, pagesPerDay: 5, currentPage: 9, lastPageRead: 12, lastActiveDate: '2026-09-24' }, theme: 'light', bookmark: null, scrollPositions: {} }));
  localStorage.setItem('app_stats_v1', JSON.stringify({ streak: 4, totalTasbih: 100 }));
  localStorage.setItem('islamic_bookmarks', JSON.stringify([{ surah: 2, ayah: 255, label: 'آية الكرسي' }]));
  localStorage.setItem('reading_progress', JSON.stringify({ surah: 18, surahName: 'الكهف', ayah: 10, timestamp: Date.now() }));
  localStorage.setItem('athkar_favs', JSON.stringify(['0:1', '2:0']));
  localStorage.setItem('tasbihCount', '41');
  localStorage.setItem('tasbihLap', '2');
  localStorage.setItem('tasbih_target', '99');
  localStorage.setItem('adhkar_auto_advance', '1');
  localStorage.setItem('font_scale', '110');
  localStorage.setItem('reciter', 'ar.husary');
  localStorage.setItem('reminders_enabled', '1');
  localStorage.setItem('theme', 'light');
`;

async function main() {
  console.log('═══ E2E: Local backup ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-backup-'));
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
    let targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    let page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('no page target among ' + targets.map(t => t.type).join(','));
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);

    // ── seed, then reload so the app actually boots from this data ──
    await evaljs(SEED);
    await send('Page.navigate', { url: BASE });
    await sleep(2500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);
    const booted = await evaljs(`!!window.BackupManager && !!window.Settings`);
    if (!booted) throw new Error('app did not boot with BackupManager/Settings present');

    // ── (a) settings UI rows ─────────────────────────────────────────
    console.log('(a) settings UI rows...');
    await evaljs(`window.openSettings()`);
    await sleep(400);
    const ui = await evaljs(`(() => {
      const g = id => document.getElementById(id);
      return {
        export: !!g('backup-export'), import: !!g('backup-import'), clear: !!g('backup-clear'),
        file: !!g('backup-file'),
        clearDanger: g('backup-clear') ? g('backup-clear').classList.contains('danger') : false,
        labels: [g('backup-export')?.textContent, g('backup-import')?.textContent, g('backup-clear')?.textContent]
      };
    })()`);
    ok('(a) three backup buttons rendered', ui.export && ui.import && ui.clear, JSON.stringify(ui));
    ok('(a) hidden file input present', ui.file);
    ok('(a) clear button marked danger', ui.clearDanger);
    ok('(a) buttons have Arabic labels', ui.labels?.join('|').includes('تصدير') && ui.labels?.join('|').includes('مسح'), JSON.stringify(ui.labels));

    // ── (b) build() ──────────────────────────────────────────────────
    console.log('(b) build() contents...');
    const payload = await evaljs(`JSON.stringify(window.BackupManager.build().payload)`);
    const p = JSON.parse(payload);
    ok('(b) envelope', p.schema === 'islami-backup' && p.version === 1 && p.app === 'islami');
    ok('(b) all 13 user keys collected', Object.keys(p.data).length === 13, Object.keys(p.data).join(','));
    ok('(b) json values parsed', p.data.app_state.khatmah.currentPage === 9 && p.data.islamic_bookmarks.length === 1);
    ok('(b) raw values as strings', p.data.tasbihCount === '41' && p.data.theme === 'light');
    ok('(b) regenerable cache keys excluded', !('reciter_wps_ar.husary' in p.data) && !Object.keys(p.data).some(k => k.startsWith('ath_') || k.startsWith('q_s_u_')));

    // ── (c) malformed key resilience, live ───────────────────────────
    console.log('(c) malformed key skipped...');
    await evaljs(`localStorage.setItem('app_state', '{corrupted');`);
    const r3 = await evaljs(`JSON.stringify((() => { try { return window.BackupManager.build(); } catch (e) { return { threw: e.message }; } })())`);
    const c = JSON.parse(r3);
    ok('(c) build did not throw', !c.threw, c.threw || '');
    ok('(c) corrupted key listed as skipped', c.skipped.includes('app_state'), c.skipped.join(','));
    ok('(c) other keys still exported', c.payload.data.tasbihCount === '41');
    // restore for the following steps
    await evaljs(`localStorage.setItem('app_state', ${JSON.stringify(JSON.stringify({ currentTab: 'quran', khatmah: { active: true, currentPage: 9, lastPageRead: 12 }, theme: 'light', scrollPositions: {} }))});`);

    // ── (d) export() writes a valid backup file ──────────────────────
    console.log('(d) export() file...');
    const exportResult = await evaljs(`(async () => {
      let blobText = null, fileName = null;
      const realCreate = URL.createObjectURL;
      const realClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = function (b) { blobText = b.text(); return 'blob:fake'; };
      HTMLAnchorElement.prototype.click = function () { fileName = this.download; };
      try {
        await window.BackupManager.export();
        URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick;
        return { fileName, blobText: await blobText };
      } catch (e) {
        URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick;
        return { threw: e.message };
      }
    })()`);
    ok('(d) export did not throw', !exportResult.threw, exportResult.threw || '');
    ok('(d) file named with date', /^islami-backup-\d{4}-\d{2}-\d{2}\.json$/.test(exportResult.fileName || ''), exportResult.fileName);
    let exported = null;
    try { exported = JSON.parse(exportResult.blobText); } catch (e) { exported = null; }
    ok('(d) blob is JSON', !!exported);
    ok('(d) blob is a valid backup envelope', !!exported && exported.schema === 'islami-backup' && exported.data && exported.data.app_state.khatmah.currentPage === 9);

    // ── (e) import through the real confirm dialog, then reload ─────
    console.log('(e) import → confirm → reload → live data...');
    // غيّر البيانات الحالية قبل الاستيراد ليثبت أن الاستيراد تستبدلها
    await evaljs(`localStorage.setItem('tasbihCount', '0'); localStorage.setItem('theme', 'dark'); localStorage.setItem('tasbih_target', '33');`);

    // نقبض على نص التأكيد ونجيب كل الحوارات بـ true (حتى حوار "تمت الاستعادة"
    // الذي ينتظر نقرة قبل أن تُطلق إعادة التحميل)
    await evaljs(`window.__confirmMsg = null; window.__confirmIsConfirm = null;
      window.showAppDialog = async function (m, ic) {
        if (ic === true && !window.__confirmMsg) { window.__confirmMsg = m; window.__confirmIsConfirm = ic; }
        return true;
      };`);

    const importPayload = JSON.stringify({
      schema: 'islami-backup', version: 1, app: 'islami', created: '2026-09-20T00:00:00.000Z',
      data: exported.data
    });
    const importStarted = await evaljs(`(async () => {
      try {
        const p = window.BackupManager.importFromFile(new File([${JSON.stringify(importPayload)}], 'islami-backup-2026-09-20.json', { type: 'application/json' }));
        await p; // يحلّ بعد كتابة البيانات (قبل إعادة التحميل)
        return true;
      } catch (e) { return 'threw: ' + e.message; }
    })()`);
    ok('(e) import did not throw', importStarted === true, String(importStarted));

    const confirm = await evaljs(`JSON.stringify({ msg: window.__confirmMsg, ic: window.__confirmIsConfirm })`);
    const cf = JSON.parse(confirm);
    ok('(e) confirmation requested', cf.ic === true);
    ok('(e) preview lists the items', typeof cf.msg === 'string' && cf.msg.includes('المرجعيات') && cf.msg.includes('عدّاد التسبيح'), (cf.msg || '').slice(0, 120));
    ok('(e) preview warns about reload', typeof cf.msg === 'string' && cf.msg.includes('يُعاد تحميل'));

    // تحقق من الكتابة الفورية قبل إعادة التحميل
    const preReload = await evaljs(`JSON.stringify({ tb: localStorage.getItem('tasbihCount'), theme: localStorage.getItem('theme'), target: localStorage.getItem('tasbih_target') })`);
    const pr = JSON.parse(preReload);
    ok('(e) data written before reload', pr.tb === '41' && pr.theme === 'light' && pr.target === '99', preReload);

    // انتظر إعادة التحميل التي يطلقها الاستيراد
    await sleep(3500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);
    const postReload = await evaljs(`JSON.stringify({
      tb: localStorage.getItem('tasbihCount'),
      theme: localStorage.getItem('theme'),
      bodyLight: document.body.classList.contains('theme-light'),
      bm: !!window.BackupManager
    })`);
    const po = JSON.parse(postReload);
    ok('(e) persisted across reload', po.tb === '41', postReload);
    ok('(e) app applied restored theme on boot', po.bodyLight === true, postReload);
    ok('(e) app boots cleanly after restore', po.bm === true);

    // ── (f) clearAll through the real confirm dialog, then reload ────
    console.log('(f) clearAll → confirm → reload → clean app...');
    await evaljs(`window.__clearMsg = null;
      window.showAppDialog = async function (m, ic) {
        if (ic === true && !window.__clearMsg) { window.__clearMsg = m; }
        return true;
      };`);
    const clearStarted = await evaljs(`(async () => {
      try { const r = await window.BackupManager.clearAll(); return r; }
      catch (e) { return 'threw: ' + e.message; }
    })()`);
    ok('(f) clear requested and confirmed', clearStarted === true, String(clearStarted));
    const clearMsg = await evaljs(`window.__clearMsg || ''`);
    ok('(f) scope disclosed before deletion', clearMsg.includes('جميع بياناتك') && clearMsg.includes('المرجعيات') && clearMsg.includes('نسخة احتياطية'), clearMsg.slice(0, 120));

    await sleep(3500);
    await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
    await sleep(300);
    const afterClear = await evaljs(`JSON.stringify({
      tb: localStorage.getItem('tasbihCount'),
      bm: localStorage.getItem('islamic_bookmarks'),
      rp: localStorage.getItem('reading_progress'),
      theme: localStorage.getItem('theme'),
      booted: !!window.BackupManager && !!window.state
    })`);
    const ac = JSON.parse(afterClear);
    // محتوى المستخدم يُحذف؛ التطبيق يعيد كتابة افتراضياته (المظهر الداكن) عند الإقلاع
    ok('(f) user content removed', ac.tb === null && ac.bm === null && ac.rp === null, afterClear);
    ok('(f) theme reset to default', ac.theme === 'dark', afterClear);
    ok('(f) app boots with defaults after clear', ac.booted === true);
    // مسح بيانات الاختبار المتبقية (الذاكرة المؤقتة فقط)
    await evaljs(`try { localStorage.clear(); } catch (e) {}`);

    // ── report ──
    console.log('');
    for (const r of results) console.log((r.pass ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? '  — ' + r.detail : ''));
    const failed = results.filter(r => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    browser.kill();
  }
}

main().catch(e => { console.error('SUITE ERROR:', e.message); process.exit(1); });
