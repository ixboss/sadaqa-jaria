#!/usr/bin/env node
/**
 * Probe — reader page theme + auto resolution (bug 1)
 * Verifies: night tokens land in dark mode, heritage in light mode, and the
 * paper/ink pair clears WCAG AA contrast in both. Throwaway; the committed
 * suite is tests/e2e-reader-nav-theme.mjs.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8123/index.html';
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9273);
const BROWSER = process.env.E2E_BROWSER || join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');

let ws, idSeq = 0;
const pending = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect(wsUrl) {
  await new Promise((res, rej) => { ws = new WebSocket(wsUrl); ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idSeq; pending.set(id, m => m.error ? rej(m.error) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaljs = expr => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).then(r => {
  if (r.exceptionDetails) throw new Error('eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300));
  return r.result?.value;
});

// parse a hex token like "#17211d" into an rgb triple
const hexToRgb = h => { const m = /^#([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null;
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// relative luminance (WCAG)
function lum([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [la, lb] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}
const parseColor = s => {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map(Number);
  return [p[0], p[1], p[2]];
};

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

async function readTheme() {
  return evaljs(`(() => {
    const cs = getComputedStyle(document.body);
    const meta = document.getElementById('surah-view-meta');
    const metaCs = meta ? getComputedStyle(meta) : null;
    const card = document.querySelector('.mushaf-topbar .surah-header-card');
    const cardCs = card ? getComputedStyle(card) : null;
    return {
      paper: cs.getPropertyValue('--mushaf-paper').trim(),
      paper2: cs.getPropertyValue('--mushaf-paper-2').trim(),
      ink: cs.getPropertyValue('--mushaf-ink').trim(),
      frame: cs.getPropertyValue('--mushaf-frame').trim(),
      nightClass: document.body.classList.contains('mushaf-theme-night'),
      floralClass: document.body.classList.contains('mushaf-theme-floral'),
      themeLight: document.body.classList.contains('theme-light'),
      pageBg: getComputedStyle(document.querySelector('.mushaf-page') || document.body).backgroundColor,
      pageColor: getComputedStyle(document.querySelector('.mushaf-page') || document.body).color,
      metaColor: metaCs ? metaCs.color : null,
      cardBg: cardCs ? cardCs.backgroundColor : null
    };
  })()`);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'probe-theme-'));
  const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--disable-gpu', '--no-first-run', '--disable-sync', 'about:blank'], { stdio: 'ignore' });
  await sleep(1800);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(1800);
  await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
  await sleep(300);
  await evaljs(`localStorage.clear()`);
  await send('Page.navigate', { url: BASE });
  await sleep(1800);
  await evaljs(`document.getElementById('occasion-modal-ok')?.click()`);
  await sleep(200);
  await evaljs(`window.openSurah(2, 1)`);
  for (let i = 0; i < 60; i++) { if (await evaljs(`!!document.querySelector('#verses-container .ayah')`)) break; await sleep(300); }
  await sleep(800);

  // ── dark mode (app default): auto must resolve to night ──
  let t = await readTheme();
  console.log('DARK  →', JSON.stringify(t));
  ok('dark: auto resolves to night theme class', t.nightClass && !t.floralClass);
  ok('dark: paper is dark (#17/11 range)', /#17|#16|#15|#12|#13/i.test(t.paper));
  const darkContrast = contrast(hexToRgb(t.paper), hexToRgb(t.ink));
  ok(`dark: page text contrast ≥ 4.5 (got ${darkContrast.toFixed(2)})`, darkContrast >= 4.5);
  ok('dark: resolved tokens match the night block', t.paper.startsWith('#17') && t.ink.startsWith('#ec'));
  const darkMeta = t.metaColor && t.cardBg ? contrast(parseColor(t.cardBg), parseColor(t.metaColor)) : null;
  ok(`dark: surah-h-meta contrast on topbar card ≥ 4.5 (got ${darkMeta != null ? darkMeta.toFixed(2) : 'n/a'})`, darkMeta != null && darkMeta >= 4.5);

  // ── light mode: auto must resolve to heritage ──
  await evaljs(`window.applyTheme('light')`);
  await sleep(900);
  t = await readTheme();
  console.log('LIGHT →', JSON.stringify(t));
  ok('light: auto resolves to heritage (no night class)', !t.nightClass && !t.floralClass);
  const lightContrast = contrast(hexToRgb(t.paper), hexToRgb(t.ink));
  ok(`light: page text contrast ≥ 4.5 (got ${lightContrast.toFixed(2)})`, lightContrast >= 4.5);
  const metaOnCard = t.metaColor && t.cardBg ? contrast(parseColor(t.cardBg), parseColor(t.metaColor)) : null;
  ok(`light: surah-h-meta contrast on topbar card ≥ 4.5 (got ${metaOnCard != null ? metaOnCard.toFixed(2) : 'n/a'})`, metaOnCard != null && metaOnCard >= 4.5);

  // ── explicit night in light mode stays night (user override) ──
  await evaljs(`localStorage.setItem('reader_theme','night'); window.ReaderSettings.applyAll()`);
  await sleep(500);
  t = await readTheme();
  ok('override: explicit night survives light app theme', t.nightClass);

  // ── explicit floral survives too ──
  await evaljs(`localStorage.setItem('reader_theme','floral'); window.ReaderSettings.applyAll()`);
  await sleep(500);
  t = await readTheme();
  ok('override: explicit floral applied', t.floralClass && !t.nightClass);

  // ── back to auto, toggle theme twice: live re-resolution ──
  await evaljs(`localStorage.setItem('reader_theme','auto'); window.ReaderSettings.applyAll(); window.applyTheme('dark')`);
  await sleep(700);
  t = await readTheme();
  ok('auto re-resolves to night after toggle to dark', t.nightClass);
  await evaljs(`window.applyTheme('light')`);
  await sleep(700);
  t = await readTheme();
  ok('auto re-resolves to heritage after toggle to light', !t.nightClass && !t.floralClass);

  // ── the legacy fixed near-white meta must be gone in light mode ──
  t = await readTheme();
  ok('light: meta is not the legacy rgba(244,241,232)', !/rgba\(244,\s*241,\s*232/.test(String(t.metaColor)));

  console.log('\n' + results.map(r => `${r.pass ? '✓' : '✗'} ${r.name}${r.detail && !r.pass ? ' — ' + r.detail : ''}`).join('\n'));
  const fails = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  browser.kill();
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
