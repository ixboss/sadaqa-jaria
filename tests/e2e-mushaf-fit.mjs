#!/usr/bin/env node
/**
 * E2E suite — Mushaf reader fit
 * ─────────────────────────────
 * The unified reader uses a fixed printed-page font size with in-page vertical
 * scroll (auto-fit pagination was the thing that got the previous attempt
 * reverted). That policy is only safe if the page never overflows its viewport
 * horizontally at any phone width, and if the landscape double-page spread
 * keeps both columns on screen.
 *
 * Run:
 *   1) python -m http.server 8123 --bind 127.0.0.1
 *   2) node tests/e2e-mushaf-fit.mjs
 *
 * Scenarios:
 *   (a) Portrait 320 / 390 / 430 px: no horizontal overflow anywhere
 *       (document, #screen-mushaf, #mushaf-viewport), page width fits
 *   (b) Landscape 844×390: same, plus the double-page spread keeps both
 *       columns inside the viewport
 *   (c) Zen mode: the centered page-number foot is on screen, not clipped
 *
 * Harness trap honoured: scrollBehavior is forced to 'auto' *before* any
 * measurement — a smooth-scroll container mid-animation reports a transient
 * scrollWidth and can make a fit assertion pass for the wrong reason.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9267);
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

/** قياس الثبات الأفقي — يُستدعى بعد استقرار الرسم. */
const measure = () => evaljs(`(() => {
  const vp = document.getElementById('mushaf-viewport');
  const screen = document.getElementById('screen-mushaf');
  const page = document.getElementById('mushaf-page');
  const r = el => el ? el.getBoundingClientRect() : null;
  return {
    innerW: window.innerWidth,
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    screenOverflow: screen ? screen.scrollWidth - screen.clientWidth : null,
    vpOverflow: vp ? vp.scrollWidth - vp.clientWidth : null,
    pageW: page ? Math.round(r(page).width) : null,
    vpW: vp ? Math.round(r(vp).width) : null,
    vpScrollH: vp ? vp.scrollHeight : null,
    vpClientH: vp ? vp.clientHeight : null
  };
})()`);

async function setMetrics(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  // شاربه في القياس: السلوك السلس يقرأ scrollWidth عابر أثناء الحركة
  await evaljs(`(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    if (document.scrollingElement) document.scrollingElement.style.scrollBehavior = 'auto';
    const vp = document.getElementById('mushaf-viewport');
    if (vp) vp.style.scrollBehavior = 'auto';
  })()`);
  await sleep(700);
}

async function waitForReader() {
  for (let i = 0; i < 60; i++) {
    if (await evaljs(`!!document.querySelector('#verses-container .ayah')`)) return true;
    await sleep(300);
  }
  return false;
}

async function main() {
  console.log('═══ E2E: Mushaf reader fit ═══\n');

  const userDataDir = mkdtempSync(join(tmpdir(), 'e2e-mushaf-fit-'));
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
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  await connect(page.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');

  await send('Page.navigate', { url: BASE });
  await sleep(1800);
  await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
  await sleep(300);

  // سورة البقرة: صفحة طويلة بأطول نص — الحالة الأسوأ للثبات الأفقي
  await evaljs(`window.openSurah(2, 1)`);
  if (!await waitForReader()) throw new Error('reader never rendered');
  await sleep(600);

  // ─── (a) Portrait widths ──────────────────────────────────
  console.log('(a) portrait fit...');
  for (const w of [320, 390, 430]) {
    await setMetrics(w, Math.round(w * 2.1));
    const m = await measure();
    ok(`(a) ${w}px: document has no horizontal overflow`, m.docOverflow <= 0, JSON.stringify(m));
    ok(`(a) ${w}px: #screen-mushaf fits its own width`, m.screenOverflow <= 0, JSON.stringify(m));
    ok(`(a) ${w}px: viewport scrolls vertically only (no horizontal overflow)`,
      m.vpOverflow <= 0 && m.vpScrollH > m.vpClientH, JSON.stringify(m));
    ok(`(a) ${w}px: page narrower than the viewport`, m.pageW <= m.vpW, JSON.stringify(m));
    console.log(`  ${w}px — page ${m.pageW}px in viewport ${m.vpW}px, docOverflow ${m.docOverflow} ✓`);
  }

  // ─── (b) Landscape + the double-page spread ───────────────
  console.log('\n(b) landscape fit...');
  await setMetrics(844, 390);
  let m = await measure();
  ok('(b) landscape single layout: no horizontal overflow', m.docOverflow <= 0 && m.vpOverflow <= 0, JSON.stringify(m));
  console.log(`  single — page ${m.pageW}px, docOverflow ${m.docOverflow} ✓`);

  await evaljs(`window.ReaderSettings && ReaderSettings.set('reader_layout', 'double')`);
  await sleep(900);
  m = await evaljs(`(() => {
    const v = document.getElementById('mushaf-viewport');
    const pages = Array.from(document.querySelectorAll('#mushaf-viewport > .mushaf-page'));
    const r = el => el.getBoundingClientRect();
    return {
      innerW: window.innerWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      display: getComputedStyle(v).display,
      count: pages.length,
      widths: pages.map(p => Math.round(r(p).width)),
      lefts: pages.map(p => Math.round(r(p).left)),
      rights: pages.map(p => Math.round(r(p).right)),
      nextShown: getComputedStyle(document.getElementById('mushaf-page-next')).display !== 'none',
      nextFilled: !!document.querySelector('#mushaf-page-next .ayah')
    };
  })()`);
  ok('(b) double spread renders two columns side by side',
    m.display === 'flex' && m.count === 2 && m.nextShown && m.nextFilled, JSON.stringify(m));
  ok('(b) both columns stay inside the viewport',
    m.widths.length === 2 && m.widths.every(w => w > 100) &&
    Math.min(...m.lefts) >= 0 && Math.max(...m.rights) <= m.innerW, JSON.stringify(m));
  ok('(b) double spread: no horizontal overflow', m.docOverflow <= 0, JSON.stringify(m));
  console.log(`  double — columns ${JSON.stringify(m.widths)}px within ${m.innerW}px ✓`);
  await evaljs(`window.ReaderSettings && ReaderSettings.set('reader_layout', 'single')`);
  await sleep(400);

  // ─── (c) Zen mode: page-number foot on screen ─────────────
  console.log('\n(c) zen mode foot...');
  await setMetrics(390, 844);
  await evaljs(`window.toggleMushafHUD && document.body.classList.contains('mushaf-hud') && toggleMushafHUD()`);
  await sleep(500);
  // الصفحة أطول من الشاشة عمداً (سياسة الحجم الثابت + التمرير): مرّر للأسفل
  // حتى يصبح رقم الصفحة مرئياً
  await evaljs(`(() => {
    const vp = document.getElementById('mushaf-viewport');
    if (vp) vp.scrollTop = vp.scrollHeight;
  })()`);
  await sleep(400);
  const zen = await evaljs(`(() => {
    const foot = document.querySelector('#mushaf-page .mushaf-page-foot');
    const vp = document.getElementById('mushaf-viewport');
    if (!foot || !vp) return null;
    const r = foot.getBoundingClientRect();
    const vr = vp.getBoundingClientRect();
    return {
      zen: !document.body.classList.contains('mushaf-hud'),
      footText: foot.textContent.trim(),
      footW: Math.round(r.width), footH: Math.round(r.height),
      footVisible: r.bottom > vr.top && r.top < vr.bottom,
      // رقم الصفحة في المنتصف أفقيًا كما في المصحف المطبوع
      centered: Math.abs((r.left + r.right) / 2 - (vr.left + vr.right) / 2) < 4
    };
  })()`);
  if (!zen) throw new Error('no page foot in zen mode');
  ok('(c) zen mode active (HUD hidden)', zen.zen === true, JSON.stringify(zen));
  ok('(c) page-number foot rendered and reachable by scroll', !!zen.footText && zen.footVisible, JSON.stringify(zen));
  ok('(c) page-number foot centered horizontally', zen.centered, JSON.stringify(zen));
  console.log(`  zen foot "${zen.footText}" ${zen.footW}×${zen.footH}px centered ✓`);

  // ─── summary ──────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  console.log('\n──────────────────────────────────────');
  console.log(`${passed}/${results.length} passed`);
  failed.forEach(f => console.log(`  FAIL  ${f.name}  — ${f.detail}`));
  browser.kill();
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => {
  console.error('suite error:', e);
  process.exit(2);
});
