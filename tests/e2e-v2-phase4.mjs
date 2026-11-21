#!/usr/bin/env node
// ============================================================================
// e2e-v2-phase4.mjs — Phase 4 verification in a REAL browser (headless Edge +
// CDP, same harness as e2e-v2-shell.mjs). Covers: Today Hub + Smart
// Context-Aware Card matrix (clock-override probe through the real §9
// resolution order), Hisn al-Muslim reader counters + auto-advance + streaks,
// Tasbih dial + sessions + stats, Qibla (engine parity + manual dial), Hijri
// calendar, Zakat/Qiyam calculators, .sadaqa export/import (merge + replace),
// v1 localStorage migration (real boot path), audio pack manager + real
// starter-pack playback. Screenshots land in tests/v2-artifacts/.
// ============================================================================
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_V2_PORT || 8126);
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9237);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const BASE = `http://127.0.0.1:${PORT}/apps/web-desktop/index.html`;
const ARTIFACTS = join(ROOT, 'tests', 'v2-artifacts');
const DHIKR_PILL_TEXTS = ['لا إله إلا الله', 'سبحان الله وبحمده', 'الحمد لله', 'أستغفر الله', 'اللهم صلِّ على نبينا محمد'];

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };

let ws, idSeq = 0;
const pending = new Map();
const consoleErrors = [];
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text);
  };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaljs = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then((r) => {
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
  return r.result?.value;
});
async function waitFor(expr, { timeout = 30000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const v = await evaljs(expr).catch(() => null);
    if (v) return v;
    await sleep(interval);
  }
  return null;
}
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ARTIFACTS, name), Buffer.from(data, 'base64'));
}
async function goto(hash) {
  await evaljs(`location.hash = '${hash}'`);
  await sleep(320);
}

async function main() {
  mkdirSync(ARTIFACTS, { recursive: true });
  console.log('═══ E2E: v2 Phase 4 — Hub / Athkar / Tasbih / Tools / Backup / Audio ═══\n');

  const server = spawn(process.execPath, [join(ROOT, 'tests', 'run-server.mjs'), String(PORT)], { stdio: 'ignore' });
  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-v2p4-'));
  const browser = spawn(BROWSER, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--disable-gpu', '--no-first-run', '--disable-sync', '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await sleep(1800);
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    await connect(page.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Log.enable');
    await send('Runtime.enable');

    // seed v1 localStorage BEFORE the app scripts run (real migration path)
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try {
        localStorage.setItem('theme', 'sepia');
        localStorage.setItem('font_scale', '1.5');
        localStorage.setItem('tasbihCount', '0');
        localStorage.setItem('tasbihLap', '2');
        localStorage.setItem('tasbih_phrase', 'سُبْحَانَ اللّٰه');
        localStorage.setItem('tasbih_target', '33');
      } catch {}`,
    });
    await send('Page.navigate', { url: BASE });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    // 1. boot
    const ready = await waitFor('window.__sadaqaReady === true', { timeout: 90000 });
    ok('boot: app ready (bridge + db + Phase 4 screens)', ready === true);

    // 2. v1 → v2 migration (ran during boot with the seeded localStorage)
    const mig = await evaljs(`window.__sadaqa.state.v1Migration`);
    ok('migration: v1 report exists', Boolean(mig?.migrated), JSON.stringify(mig?.imported ?? []));
    const migRows = await evaljs(`(async () => ({
      theme: await window.__sadaqa.db.queryOne("SELECT value FROM user_settings WHERE key='theme'"),
      tasbih: await window.__sadaqa.db.queryOne("SELECT label_ar, count FROM tasbih_counters WHERE label_ar LIKE '%المُستورد%'"),
      font: await window.__sadaqa.db.queryOne("SELECT value FROM user_settings WHERE key='font_scale'"),
    }))()`);
    ok('migration: theme sepia imported', migRows.theme?.value === '"sepia"', migRows.theme?.value);
    ok('migration: font_scale 1.5 imported', migRows.font?.value === '1.5', migRows.font?.value);
    ok('migration: v1 tasbih counter created', Boolean(migRows.tasbih), JSON.stringify(migRows.tasbih));

    // 3. Today hub
    await goto('#/today');
    const hub = await evaljs(`({ hero: !!document.getElementById('hero-countdown'),
      hijri: document.querySelector('.screen-header .sub')?.textContent ?? '',
      schedule: document.querySelectorAll('.prayer-row').length,
      smart: document.getElementById('smart-card')?.dataset.kind ?? null,
      qiyam: document.body.textContent.includes('الثلث الأخير') })`);
    ok('hub: hero countdown + schedule (6 rows) + qiyam windows', hub.hero && hub.schedule === 6 && hub.qiyam, `schedule=${hub.schedule}`);
    ok('hub: Hijri date in header (عام هـ)', /\d+\s+.+?\s+\d+\s+هـ/.test(hub.hijri), hub.hijri);
    ok('hub: smart card rendered with a §9 kind', ['kahf', 'after_prayer', 'qiyam', 'morning', 'evening', 'daily_morning', 'daily_hijri', 'daily_evening', 'daily_sleep'].includes(hub.smart), hub.smart);
    await screenshot('v2p4-today.png');

    // 3b. Today header dhikr pill — renders across from the title, cycles on tap
    const dhikr = await evaljs(`(() => {
      const pill = document.getElementById('today-dhikr');
      return { present: !!pill, text: pill?.textContent.trim() ?? '', inToprow: !!pill?.closest('.today-toprow') };
    })()`);
    ok('today: rotating dhikr pill renders in the header (across from title)', dhikr.present === true && dhikr.inToprow && DHIKR_PILL_TEXTS.includes(dhikr.text), dhikr.text);
    const d0 = await evaljs(`document.getElementById('today-dhikr')?.textContent.trim() ?? ''`);
    await evaljs(`document.getElementById('today-dhikr')?.click()`);
    const d1 = await waitFor(
      `(document.getElementById('today-dhikr')?.textContent.trim() !== ${JSON.stringify(d0)}) ? document.getElementById('today-dhikr').textContent.trim() : null`,
      { timeout: 3000 });
    ok('today: tapping the dhikr pill advances to the next dhikr', Boolean(d1) && DHIKR_PILL_TEXTS.includes(d1) && d1 !== d0, `${d0} → ${d1 ?? '(no change)'}`);

    // 3c. ورد اليوم — daily progress card (athkar windows + khatmah line)
    const seeded = await evaljs(`(async () => {
      const dayKey = new Intl.DateTimeFormat('en-CA').format(Date.now());
      const rows = await window.__sadaqa.db.query("SELECT i.item_id, i.count_target FROM athkar_items i JOIN athkar_categories c ON c.category_id = i.category_id WHERE c.solar_window = 'fajr' LIMIT 2");
      for (const r of rows) {
        await window.__sadaqa.db.write(
          "INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at",
          [r.item_id, dayKey, r.count_target ?? 1, Date.now(), Date.now()]);
      }
      return rows.length;
    })()`);
    await evaljs(`(async () => {
      const m = await import(new URL('./js/ui/screens/today.js', location.href));
      await m.renderToday(document.getElementById('screen-root'));
      return true;
    })()`);
    const daily = await evaljs(`(async () => {
      const card = document.getElementById('daily-progress-card');
      const rows = [...card?.querySelectorAll('.dp-row') ?? []].map((r) => ({
        title: r.querySelector('.dp-title')?.textContent ?? '',
        count: r.querySelector('.dp-count')?.textContent ?? '',
        fillW: parseFloat(r.querySelector('.dp-fill')?.style.width) || 0,
      }));
      const cats = await window.__sadaqa.db.query("SELECT category_id, solar_window FROM athkar_categories");
      const items = await window.__sadaqa.db.query("SELECT item_id, category_id, count_target FROM athkar_items");
      const { computeDailyProgress } = await import(new URL('../../packages/core-data/engines/today-progress.js', location.href));
      return {
        present: !!card,
        rows,
        expectedTitles: computeDailyProgress(cats, items, []).windows.map((w) => w.titleAr),
        badge: card?.querySelector('.badge')?.textContent ?? '',
        khatmah: card?.querySelector('.dp-khatmah')?.textContent ?? '',
        bottomPad: parseFloat(getComputedStyle(document.querySelector('.screen')).paddingBottom) || 0,
      };
    })()`);
    ok('today: ورد اليوم card renders the engine-derived window rows + khatmah line',
      daily.present && JSON.stringify(daily.rows.map((r) => r.title)) === JSON.stringify(daily.expectedTitles) && daily.rows.length >= 2 && daily.khatmah.includes('الختمة'),
      `rows=[${daily.rows.map((r) => r.title).join(',')}] expected=[${daily.expectedTitles.join(',')}]`);
    ok('today: morning window reflects seeded completion (2/… + fill bar)',
      daily.rows.some((r) => r.title === 'الصباح' && r.count.startsWith('2/') && r.fillW > 0),
      JSON.stringify(daily.rows));
    ok('today: badge shows completed windows out of the athkar windows',
      new RegExp(`^\\d+ / ${daily.rows.length} أوراد$`).test(daily.badge.replace(/\s+/g, ' ')), daily.badge);
    ok('today: screen bottom padding clears the dock (~96px)', daily.bottomPad > 80 && daily.bottomPad <= 110, `${daily.bottomPad}px`);

    // 3d. security: imported-garbage settings must not XSS the hub nor brick
    // the prayer engine (audit 2026-11-21: setting VALUES are importable via
    // .sadaqa and unvalidated by backup-validate — the escape + degrade
    // contract under test).
    await evaljs(`(() => {
      const s = window.__sadaqa.state.settings;
      s.location = { lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh', name_ar: '<img src=x onerror="window.__xssProbe=1">' };
      s.calc_method = 'garbage_method';
      s.hijri_adjust = 'zzz';
      return true;
    })()`);
    await evaljs(`(async () => {
      const m = await import(new URL('./js/ui/screens/today.js', location.href));
      await m.renderToday(document.getElementById('screen-root'));
      return true;
    })()`);
    const sec = await evaljs(`({ pill: document.getElementById('today-city-btn')?.innerHTML ?? '',
      injected: window.__xssProbe === true,
      hero: !!document.getElementById('hero-countdown'),
      schedule: document.querySelectorAll('.prayer-row').length,
      hijriOk: /\\d+\\s+.+?\\s+\\d+\\s+هـ/.test(document.querySelector('.screen-header .sub')?.textContent ?? '') })`);
    ok('security: poisoned location name_ar renders as text (no img element, no onerror fired)',
      sec.pill.includes('&lt;img') && !sec.pill.includes('<img') && sec.injected === false, sec.pill.slice(0, 90));
    ok('security: garbage calc_method degrades to default — hero + 6 prayer rows still render',
      sec.hero && sec.schedule === 6, `schedule=${sec.schedule}`);
    ok('security: garbage hijri_adjust degrades to 0 — Hijri date still renders', sec.hijriOk);
    // restore clean settings for the remaining sections
    await evaljs(`(() => {
      const s = window.__sadaqa.state.settings;
      s.location = { lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh', name_ar: 'مكة المكرمة' };
      s.calc_method = 'umm_al_qura';
      s.hijri_adjust = 0;
      return true;
    })()`);

    // 4. Smart Context-Aware Card matrix — real resolution order, synthetic instants
    const matrix = await evaljs(`(async () => {
      const { prayerEngineForSettings } = await import(new URL('./js/app-state.js', location.href));
      const eng = prayerEngineForSettings();
      const tz = eng.opts.timeZone;
      const iso = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(ms);
      const today = iso(Date.now());
      const sched = eng.daySchedule(today);
      const y = eng.sunnahWindows(iso(Date.now() - 86400000));
      const friday = (() => { // next Friday 10:00 CITY time → true UTC instant
        // weekday must be evaluated in the CITY tz (a UTC-Friday probe can be
        // city-Saturday in +03:00 zones when the run happens late in the UTC
        // day — latent Phase-4 timing bug caught by the Phase-5 regression run).
        const probe = new Date(Date.now());
        const dowCity = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(ms);
        for (let i = 0; i < 9 && dowCity(probe.getTime()) !== 'Fri'; i++) probe.setUTCDate(probe.getUTCDate() + 1);
        const [yy, mm, dd] = iso(probe.getTime()).split('-').map(Number);
        // build 10:00 in city tz by scanning offsets (Riyadh = +180, but stay generic)
        for (let off = -720; off <= 840; off += 15) {
          const inst = Date.UTC(yy, mm - 1, dd, 10, 0, 0) - off * 60000;
          const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(inst);
          if (p === '10:00') return inst;
        }
        return null;
      })();
      const cases = [
        ['kahf', friday],
        ['after_prayer', sched.prayers.maghrib + 5 * 60000],
        ['qiyam', y.lastThird + 5 * 60000],
        // §9 precedence: Friday kahf (rule 1) outranks the morning window (rule 4) —
        // on Fridays the fajr+30m probe correctly resolves kahf, not morning.
        [new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(Date.now()) === 'Fri' ? 'kahf' : 'morning',
         sched.prayers.fajr + 30 * 60000],   // past the ±20 min post-prayer window
        ['evening', sched.prayers.asr + 45 * 60000],
        ['next_prayer', sched.prayers.dhuhr + 45 * 60000], // between duha and asr
      ];
      const { resolveSmartCard } = await import(new URL('./js/ui/screens/today.js', location.href));
      return cases.map(([want, at]) => ({ want, at, got: resolveSmartCard(at, eng).kind }));
    })()`);
    for (const c of matrix) ok(`smart-card: ${c.want} window resolves correctly`, c.got === c.want, `at=${c.at} got=${c.got}`);

    // 5. Athkar: list + reader + counter + auto-advance + state write
    await goto('#/adhkar-screen');
    const catCount = await evaljs(`document.querySelectorAll('.cat-tile').length`);
    ok('athkar: Hisn al-Muslim categories render (133)', catCount >= 130, `${catCount} tiles`);
    const pick = await evaljs(`window.__sadaqa.db.queryOne("SELECT category_id, count_target FROM athkar_items WHERE count_target > 1 ORDER BY length(text_ar) ASC LIMIT 1")`);
    await goto(`#/adhkar-cat?id=${pick.category_id}`);
    await waitFor(`!!document.getElementById('zkr-card')`, { timeout: 15000 });
    const before = await evaljs(`window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM adhkar_state")`);
    for (let i = 0; i < pick.count_target; i++) await evaljs(`document.getElementById('zkr-card').click()`);
    await sleep(500);
    const after = await evaljs(`(async () => ({
      rows: await window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM adhkar_state"),
      item: await window.__sadaqa.db.queryOne("SELECT count, completed_at FROM adhkar_state WHERE item_id = ? AND day_key = ?", []),
    }))()`);
    ok('athkar: taps persist adhkar_state rows', (after.rows?.n ?? 0) > (before.rows?.n ?? 0));
    ok('athkar: auto-advance fires on target (card moves on)', await waitFor(
      `document.getElementById('zkr-card') && Number(document.querySelector('.zkr-card')?.dataset.pos ?? 0) > 0`, { timeout: 6000 }));
    ok('athkar: hadith verification collapsible present', await evaljs(`!!document.querySelector('.zkr-verify')`));
    await screenshot('v2p4-athkar-reader.png');

    // hands-free toggle (real UI path)
    await evaljs(`document.getElementById('auto-toggle').click()`);
    const autoOn = await evaljs(`document.getElementById('auto-toggle').getAttribute('aria-pressed')`);
    ok('athkar: hands-free mode engages (aria-pressed)', autoOn === 'true');
    await evaljs(`document.getElementById('auto-toggle').click()`);

    // 6. Tasbih: imported counter → dial taps → sessions → target streak → stats
    await goto('#/tasbih-screen');
    await waitFor(`document.getElementById('tb-dial') || document.querySelector('.tasbih-pick-row')`, { timeout: 15000 });
    // ensure defaults exist for the defaults path (delete imported one first via test hook)
    await evaljs(`(async () => { const n = await window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM tasbih_counters"); if (n.n === 1) { await window.__sadaqa.db.write("UPDATE tasbih_counters SET deleted = 1 WHERE 1=1"); } return true; })()`);
    await goto('#/tasbih-screen?r=1');
    await waitFor(`document.querySelectorAll('.tasbih-pick-row').length >= 3`, { timeout: 15000 });
    const defaults = await evaljs(`window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM tasbih_counters WHERE deleted = 0")`);
    ok('tasbih: 3 first-run presets created', (defaults?.n ?? 0) === 3, `${defaults?.n}`);
    const target0 = await evaljs(`window.__sadaqa.db.queryOne("SELECT uuid, count, target FROM tasbih_counters WHERE deleted=0 ORDER BY sort_order LIMIT 1")`);
    // set target to 3 through the real editor
    await evaljs(`document.querySelectorAll('.tasbih-pick-row')[0].click()`);
    await evaljs(`document.getElementById('tb-edit').click()`);
    await evaljs(`const t = document.getElementById('te-target'); t.value = '3'; t.dispatchEvent(new Event('input'));`);
    await evaljs(`document.getElementById('te-save').click()`);
    // wait for the DB write AND the re-render (the save navigates with a fresh ?r)
    await waitFor(`window.__sadaqa.db.queryOne("SELECT target FROM tasbih_counters WHERE uuid = ?", ['${target0.uuid}']).then(r => r?.target === 3)`, { timeout: 10000 });
    await waitFor(`document.getElementById('tb-dial') && document.querySelector('.tasbih-dial .t-of')?.textContent.includes('الهدف 3')`, { timeout: 10000 });
    for (let i = 0; i < 3; i++) await evaljs(`document.getElementById('tb-dial').click()`);
    await sleep(400);
    const tState = await evaljs(`(async () => ({
      c: await window.__sadaqa.db.queryOne("SELECT count FROM tasbih_counters WHERE uuid = ?", ['${target0.uuid}']),
      s: await window.__sadaqa.db.query("SELECT COUNT(*) n FROM tasbih_sessions"),
      st: await window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM streak_days WHERE kind = 'tasbih'"),
    }))()`);
    ok('tasbih: 3 dial taps → count 3 + 3 session rows', (tState.c?.count ?? 0) === 3 && (tState.s?.[0]?.n ?? 0) >= 3, `count=${tState.c?.count} sessions=${tState.s?.[0]?.n}`);
    ok('tasbih: target reached → daily streak written', (tState.st?.n ?? 0) >= 1);
    await evaljs(`document.getElementById('tb-stats').click()`);
    ok('tasbih: stats panel (7-day bars + totals)', await waitFor(`document.querySelectorAll('.week-bars .wb').length === 7`, { timeout: 8000 }));
    await screenshot('v2p4-tasbih.png');

    // 7. Tools hub
    await goto('#/tools-phase4');
    ok('tools: 6 tiles (qibla/hijri/zakat/qiyam/backup/settings)',
      await evaljs(`document.querySelectorAll('.tool-tile').length === 6`));

    // 8. Qibla — engine parity + manual dial fallback
    await goto('#/tools-qibla');
    await waitFor(`!!document.getElementById('q-reading')`, { timeout: 10000 });
    const qibla = await evaljs(`(async () => {
      const { qiblaBearing } = await import(new URL('../../packages/core-data/engines/qibla.js', location.href));
      const bearing = qiblaBearing({ lat: 21.4225, lng: 39.8262 });
      for (let i = 0; i < 3; i++) document.getElementById('q-plus').click(); // manual dial: north +3°
      const want = (((bearing - 3) % 360) + 360) % 360;
      return { bearing, want: want.toFixed(1) + '°', shown: document.getElementById('q-reading').textContent, north: document.getElementById('q-north').textContent };
    })()`);
    ok('qibla: bearing = engine value, manual dial shifts by −3°', qibla.shown === qibla.want && qibla.north.includes('3°'), JSON.stringify(qibla));

    // 9. Hijri calendar
    await goto('#/tools-hijri');
    await waitFor(`document.querySelectorAll('.hc-cell').length >= 29`, { timeout: 10000 });
    const cal = await evaljs(`({ cells: document.querySelectorAll('.hc-cell').length,
      today: !!document.querySelector('.hc-cell.today'),
      head: document.querySelector('.hc-head strong')?.textContent })`);
    ok('hijri: month grid (29/30 cells) + today highlighted + events section', cal.cells >= 29 && cal.cells <= 30 && cal.today && await evaljs(`!!document.getElementById('hc-events')`), JSON.stringify(cal));
    await evaljs(`document.getElementById('hc-next').click()`);
    ok('hijri: month navigation works', await waitFor(`document.querySelector('.hc-head strong')?.textContent !== ${JSON.stringify(cal.head)}`, { timeout: 5000 }));
    await screenshot('v2p4-hijri.png');

    // 10. Zakat calculator — fixed-vector correctness
    await goto('#/tools-zakat');
    const zakat = await evaljs(`(async () => {
      const set = (id, v) => { document.getElementById(id).value = v; };
      set('z-cash', '10000'); set('z-goldPrice', '0'); set('z-silverPrice', '2');
      document.getElementById('z-nisab').value = 'silver';
      document.getElementById('z-calc').click();
      await new Promise(r => setTimeout(r, 100));
      return { big: document.querySelector('#z-out .big')?.textContent ?? '', rows: [...document.querySelectorAll('#z-out .stat-row')].map(r => r.textContent) };
    })()`);
    ok('zakat: 10000 cash, silver nisab 1190 → 250 due (٢.٥٪)', zakat.big.includes('٢٥٠'), JSON.stringify(zakat.rows));
    await screenshot('v2p4-zakat.png');

    // 11. Qiyam planner
    await goto('#/tools-qiyam');
    const qiyam = await evaljs(`(async () => {
      document.getElementById('qy-calc').click();
      await new Promise(r => setTimeout(r, 100));
      return { rows: [...document.querySelectorAll('#qy-out .stat-row')].map(r => r.textContent) };
    })()`);
    ok('qiyam: tonight windows + sleep planner computes bedtime', qiyam.rows.length >= 2, JSON.stringify(qiyam.rows));

    // 12. Backup: export (real UI) → payload/manifest integrity → merge → replace
    await goto('#/tools-backup');
    // كان waitFor يُهمل نتيجته ثم ok(..., true) بلا شرط — فحص لا يستطيع الفشل
    // (audit 2026-11). الشبكة الآن ١٠ فئات (+صفحات الختمة +الإعدادات).
    const gridOk = await waitFor(`document.querySelectorAll('.backup-counts .bc').length === 10`, { timeout: 10000 });
    ok('backup: current-data counts grid (10 categories)', gridOk === true);
    await evaljs(`document.getElementById('bk-export').click()`);
    await sleep(600);
    const expLog = await evaljs(`window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM backup_log WHERE direction='export'")`);
    ok('backup: export writes audit log row', (expLog?.n ?? 0) >= 1);

    const exportCheck = await evaljs(`(async () => {
      const { buildExportPayload } = await import(new URL('./js/data/backup.js', location.href));
      const { validateBackup } = await import(new URL('../../packages/core-data/engines/backup-validate.js', location.href));
      const { manifest, payload } = await buildExportPayload(window.__sadaqa.db);
      const v = validateBackup(manifest, payload);
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
      const hex = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
      return { ok: v.ok, errors: v.errors?.slice(0, 2), entities: manifest.entities, integrityMatches: hex === manifest.integrity, total: Object.values(manifest.entities).reduce((a, b) => a + b, 0) };
    })()`);
    ok('backup: payload passes the validator (all groups)', exportCheck.ok === true, JSON.stringify(exportCheck.errors ?? []));
    ok('backup: manifest.integrity = sha-256(payload)', exportCheck.integrityMatches === true, `${exportCheck.total} entities`);

    // merge import: injected newer bookmark wins. The payload is mutated, so
    // the digest must be recomputed over the mutated bytes (2026-11: the old
    // test shipped integrity:'0'*64 and import STILL succeeded — proof the
    // digest was never verified; now a tampered digest must be refused).
    const mergeRes = await evaljs(`(async () => {
      const { buildExportPayload, importBackup } = await import(new URL('./js/data/backup.js', location.href));
      const { manifest, payload } = await buildExportPayload(window.__sadaqa.db);
      const bmk = { uuid: '11111111-2222-7333-8444-555566667777', type: 'bookmark', updatedAt: Date.now() + 60000, page: 50, lineNumber: 3, labelAr: 'اختبار الدمج' };
      payload.reading = [bmk];
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
      const hex = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
      const before = (await window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM bookmarks")).n;
      // tampered digest must now be refused BEFORE any write
      let refused = false;
      try {
        await importBackup(window.__sadaqa.db, new TextEncoder().encode(JSON.stringify({ manifest: { ...manifest, integrity: '0'.repeat(64) }, payload })), 'merge');
      } catch (e) { refused = /integrity/.test(String(e.message)); }
      const afterRefusal = (await window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM bookmarks")).n;
      const res = await importBackup(window.__sadaqa.db, new TextEncoder().encode(JSON.stringify({ manifest: { ...manifest, integrity: hex }, payload })), 'merge');
      const after = (await window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM bookmarks")).n;
      return { refused, untouched: afterRefusal === before, report: res.report, before, after, ok: after > before };
    })()`);
    ok('backup: tampered integrity refused before any write', mergeRes.refused === true && mergeRes.untouched === true, JSON.stringify({ refused: mergeRes.refused, untouched: mergeRes.untouched }));
    ok('backup: Smart Merge adds incoming newer entity', mergeRes.ok === true, JSON.stringify(mergeRes.report));

    // replace import: wipes locals then inserts payload verbatim
    const replaceRes = await evaljs(`(async () => {
      const { buildExportPayload, importBackup } = await import(new URL('./js/data/backup.js', location.href));
      const { manifest, payload } = await buildExportPayload(window.__sadaqa.db);
      // strip the injected merge bookmark so counts are deterministic
      payload.reading = payload.reading.filter(e => e.type !== 'bookmark' || e.labelAr !== 'اختبار الدمج');
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
      const hex = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
      const res = await importBackup(window.__sadaqa.db, new TextEncoder().encode(JSON.stringify({ manifest: { ...manifest, integrity: hex }, payload })), 'replace');
      const bmk = (await window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM bookmarks")).n;
      const tas = (await window.__sadaqa.db.queryOne("SELECT COUNT(*) n FROM tasbih_counters")).n;
      return { report: res.report, bookmarks: bmk, tasbih: tas, payloadBookmarks: payload.reading.filter(e => e.type === 'bookmark').length, payloadTasbih: payload.dhikr.filter(e => e.type === 'tasbihCounter').length };
    })()`);
    ok('backup: Full Replace wipes locals + restores payload exactly',
      replaceRes.bookmarks === replaceRes.payloadBookmarks && replaceRes.tasbih === replaceRes.payloadTasbih,
      JSON.stringify(replaceRes.report));
    await screenshot('v2p4-backup.png');

    // 13. Audio pack manager + real starter-pack playback (offline bytes)
    await goto('#/mushaf/audio');
    let packRows = await waitFor(`document.querySelectorAll('.pack-row').length`, { timeout: 12000 });
    if (!packRows) {
      const dbg = await evaljs(`({ hash: location.hash, header: document.querySelector('.screen-header h1')?.textContent ?? 'NONE' })`);
      console.log('  [diag] first nav produced:', JSON.stringify(dbg));
      await evaljs(`window.__sadaqa.navigate('mushaf-audio', { r: Date.now() })`); // the tab-bar's own path
      packRows = await waitFor(`document.querySelectorAll('.pack-row').length`, { timeout: 15000 });
    }
    const packs = await evaljs(`({ rows: document.querySelectorAll('.pack-row').length,
      alafasy: [...document.querySelectorAll('.pack-row')].some(r => r.textContent.includes('العفاسي')),
      header: document.querySelector('.screen-header h1')?.textContent ?? 'NONE' })`);
    ok('audio: real reciter catalog renders (≥15 rows, العفاسي present)', (packRows ?? 0) >= 15 && packs.alafasy, JSON.stringify(packs));
    const starter = await evaljs(`window.__sadaqa.db.queryOne("SELECT status FROM audio_packs_state WHERE reciter_id='alafasy' AND scope='surah_subset'")`);
    ok('audio: starter pack (Al-Fatiha · Alafasy) installed', starter?.status === 'ready', starter?.status);
    await evaljs(`(async () => {
      const m = await import(new URL('./js/ui/screens/audio.js', location.href));
      await m.startPlayback(1, 1);
      return true;
    })()`);
    await sleep(1200);
    const playing = await evaljs(`({ visible: document.getElementById('miniplayer').classList.contains('visible'),
      title: document.querySelector('#miniplayer .t1')?.textContent ?? '',
      sub: document.querySelector('#miniplayer .t2')?.textContent ?? '' })`);
    ok('audio: starter pack plays (miniplayer visible, الفاتحة · آية 1)', playing.visible && playing.title.includes('آية 1'), `${playing.title} | ${playing.sub}`);
    await screenshot('v2p4-audio.png');
    await evaljs(`(async () => { const m = await import(new URL('./js/ui/screens/audio.js', location.href)); m.stopPlayback(); return true; })()`);

    // 14. console cleanliness
    const realErrors = consoleErrors.filter((t) => !/favicon|Failed to load resource|net::ERR|navigator.vibrate/i.test(t));
    ok('console: no uncaught errors during the whole run', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    const passed = results.filter((r) => r.pass).length;
    console.log(`\n=== RESULT: ${passed}/${results.length} passed ===`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    browser.kill();
    server.kill();
  }
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
