#!/usr/bin/env node
/**
 * E2E suite — Bottom-nav tab routing (4-tab Liquid Glass capsule)
 * ───────────────────────────────────────────────────────────────────
 * Regression suite for the Tasbih tab bug: a legacy SCREEN_TAB mapping
 * routed 'tasbih' back to 'athkar' inside showScreen(), desyncing
 * state.currentTab and making repeated taps look frozen.
 *
 * Asserts, at mobile 390x844 and desktop 1280x800:
 *  - the stress order Quran → Tasbih → Athkar → Tasbih → Khatmah → Tasbih
 *    runs TWICE with the exact target panel active every time;
 *  - no panel overlap/occlusion at viewport center (elementFromPoint);
 *  - the glass indicator sits nearest the active tab;
 *  - the Tasbih panel is actually interactive (tap increments counter);
 *  - navigateBack() from Tasbih lands on the Tasbih root.
 *
 * Run:
 *   1) node tests/run-server.mjs            (port 8123)
 *   2) node tests/e2e-nav-tabs.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9236);
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
  if (r.exceptionDetails) throw new Error('page eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
});

// Tab id → root screen id (must stay in sync with TAB_ROOT_SCREEN in app-core.js)
const TAB_ROOT = { quran: 'surah-list', athkar: 'athkar-list', tasbih: 'tasbih', khatmah: 'khatmah-main' };

async function clickTab(tabId) {
  await evaljs(`document.getElementById('nav-tab-${tabId}')?.click()`);
  await sleep(500); // انتقال الشاشة 360ms + هامش
}

// One full assertion pass over the stress order, twice through.
const STRESS_ORDER = ['quran', 'tasbih', 'athkar', 'tasbih', 'khatmah', 'tasbih'];

async function runStressOrder(label, viewportLabel) {
  for (let round = 1; round <= 2; round++) {
    for (const tab of STRESS_ORDER) {
      await clickTab(tab);
      const root = TAB_ROOT[tab];
      const st = await evaljs(`(() => {
        const activeTab = document.querySelector('.nav-tab.active');
        // switchTab يستخدم active أو slide-left/slide-right حسب اتجاه الانتقال
        const isShown = s => s.classList.contains('active') || s.classList.contains('slide-left') || s.classList.contains('slide-right');
        const activeScreens = [...document.querySelectorAll('.screen')].filter(isShown).map(s => s.id);
        const target = document.getElementById('screen-${root}');
        const cxDiag = window.innerWidth * 0.5, cyDiag = window.innerHeight * 0.55; // فوق شريط التنقل
        const el = document.elementFromPoint(cxDiag, cyDiag);
        const ind = document.getElementById('nav-indicator');
        const act = document.querySelector('.nav-tab.active');
        let indNearest = null;
        if (ind && act) {
          const ic = ind.getBoundingClientRect();
          const ix = ic.left + ic.width / 2;
          let best = Infinity;
          document.querySelectorAll('.nav-tab').forEach(t => {
            const r = t.getBoundingClientRect();
            const d = Math.abs(ix - (r.left + r.width / 2));
            if (d < best) { best = d; indNearest = t.dataset.tab; }
          });
        }
        return {
          activeTab: activeTab ? activeTab.dataset.tab : null,
          activeScreens,
          targetActive: !!(target && isShown(target)),
          currentTab: window.state ? window.state.currentTab : null,
          currentScreen: window.state ? window.state.currentScreen : null,
          centerHitId: el ? (el.closest('.screen') ? el.closest('.screen').id : (el.id || el.tagName)) : null,
          centerHitInsideTarget: !!(el && target && target.contains(el)),
          indNearest,
          visibleScreens: [...document.querySelectorAll('.screen')].filter(s => {
            const r = s.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(s).display !== 'none';
          }).map(s => s.id)
        };
      })()`);
      ok(`(${label}) r${round} ${tab}: active tab is ${tab}`, st.activeTab === tab, JSON.stringify({ activeTab: st.activeTab, currentTab: st.currentTab }));
      ok(`(${label}) r${round} ${tab}: state.currentTab is ${tab}`, st.currentTab === tab, `got ${st.currentTab}`);
      ok(`(${label}) r${round} ${tab}: state.currentScreen is ${root}`, st.currentScreen === root, `got ${st.currentScreen}`);
      ok(`(${label}) r${round} ${tab}: exactly one active screen (target)`, st.activeScreens.length === 1 && st.activeScreens[0] === 'screen-' + root, JSON.stringify(st.activeScreens));
      ok(`(${label}) r${round} ${tab}: target not occluded at center`, st.centerHitInsideTarget, `hit=${st.centerHitId}`);
      ok(`(${label}) r${round} ${tab}: indicator nearest ${tab}`, st.indNearest === tab, `nearest=${st.indNearest}`);
      ok(`(${label}) r${round} ${tab}: no other screen visible`, st.visibleScreens.every(id => id === 'screen-' + root), JSON.stringify(st.visibleScreens));
    }
  }
}

async function main() {
  console.log('═══ E2E: Bottom-nav tab routing (4-tab capsule) ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-navtabs-'));
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

    for (const [viewportLabel, metrics] of [
      ['mobile', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }],
      ['desktop', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }]
    ]) {
      console.log(`── viewport ${viewportLabel} ──`);
      await send('Emulation.setDeviceMetricsOverride', metrics);
      await send('Page.navigate', { url: BASE + '?c=' + Date.now() });
      await sleep(3200);
      await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
      await sleep(400);

      const tabs = await evaljs(`[...document.querySelectorAll('.nav-tab')].map(t => t.dataset.tab)`);
      ok(`(${viewportLabel}) 4 tabs present`, tabs.length === 4 && ['quran', 'athkar', 'tasbih', 'khatmah'].every(t => tabs.includes(t)), JSON.stringify(tabs));

      await runStressOrder(viewportLabel, viewportLabel);

      // ── Tasbih panel is truly interactive: tap increments the counter ──
      await clickTab('tasbih');
      const before = await evaljs(`document.getElementById('tasbih-count-num')?.textContent`);
      await evaljs(`document.getElementById('tasbih-tap-btn')?.click()`);
      await sleep(250);
      const after = await evaljs(`document.getElementById('tasbih-count-num')?.textContent`);
      ok(`(${viewportLabel}) tasbih tap increments counter`, before !== after, `${before} -> ${after}`);

      // ── Back from Tasbih lands on the Tasbih root ──
      await evaljs(`window.navigateBack && window.navigateBack()`);
      await sleep(400);
      const backScreen = await evaljs(`window.state ? window.state.currentScreen : null`);
      ok(`(${viewportLabel}) navigateBack from tasbih stays on tasbih root`, backScreen === 'tasbih', `got ${backScreen}`);
    }

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
