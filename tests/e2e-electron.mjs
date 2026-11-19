#!/usr/bin/env node
// ============================================================================
// e2e-electron.mjs — launch-verify the Electron desktop shell (Phase 4).
// Boots the real app with SADAQA_PROBE=1: main-process better-sqlite3 (FTS5 +
// live MATCH query on the userData DB copy), app:// protocol serving the UI,
// QPC fonts and the bundled sadaqa.db from local assets, prayer engine +
// Tray + native notifications, and the preload bridge under full
// contextIsolation (no Node globals in the renderer).
// ============================================================================
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON_DIR = join(ROOT, 'apps', 'electron');

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };

const electronBin = join(
  ELECTRON_DIR,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
);

async function main() {
  console.log('═══ E2E: Electron desktop shell (IPC SQLite + protocol + tray + isolation) ═══\n');
  if (!existsSync(electronBin)) {
    // داخل npm test العام تتقدم الاختبارات على تثبيت تبعيات Electron في CI —
    // التخطي هو السلوك المحفوظ؛ خطوة CI المخصصة (بعد التثبيت) تفرض الفحص عبر
    // SADAQA_REQUIRE_ELECTRON=1 فيفشل تراجعُ التثبيت فعلاً (audit 2026-11)
    const required = process.env.SADAQA_REQUIRE_ELECTRON === '1';
    if (!required || process.env.SKIP_ELECTRON === '1') {
      console.log(`(electron binary not found at ${electronBin}; skipped${required ? ' — SKIP_ELECTRON=1 set' : ''})`);
      return;
    }
    console.error(`✗ electron binary not found at ${electronBin} — run: cd apps/electron && npm install`);
    process.exitCode = 1;
    return;
  }

  const proc = spawn(electronBin, [ELECTRON_DIR, '--no-sandbox'], {
    cwd: ELECTRON_DIR,
    env: { ...process.env, SADAQA_PROBE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (d) => { out += d.toString(); });
  proc.stderr.on('data', (d) => { out += d.toString(); });

  const code = await new Promise((resolve) => {
    const t = setTimeout(() => { proc.kill('SIGKILL'); resolve(-1); }, 90_000);
    proc.on('exit', (c) => { clearTimeout(t); resolve(c); });
  });

  const line = out.split('\n').find((l) => l.includes('SADAQA_PROBE_JSON:'));
  if (!line) {
    ok('probe: self-check JSON emitted', false, out.slice(-400));
    process.exitCode = 1;
    return;
  }
  const { ok: overall, checks } = JSON.parse(line.slice(line.indexOf('SADAQA_PROBE_JSON:') + 'SADAQA_PROBE_JSON:'.length));

  ok('electron: overall probe verdict', overall === true, `exit=${code}`);
  ok('electron: main-process better-sqlite3 opens (Electron ABI)', checks.sqlite === true);
  ok('electron: bundled SQLite has FTS5 + live MATCH query', checks.fts5 === true && checks.ftsQuery === true);
  ok('electron: 114 surahs in the userData DB copy', checks.surahs === 114);
  ok('electron: app:// serves index.html (no dev server)', checks.protocol === true);
  ok('electron: app:// serves QPC font subsets', checks.protocolFonts === true);
  ok('electron: app:// serves bundled sadaqa.db', checks.protocolDb === true);
  ok('electron: prayer engine runs in main (next prayer computed)', checks.engine === true);
  ok('electron: system Tray created', checks.tray === true);
  ok('electron: native notifications supported', checks.notifications === true);
  ok('electron: preload bridge = v2 electron adapter', checks.bridge?.kind === 'electron');
  ok('electron: contextIsolation holds (no window.process/require)', checks.bridge?.isolated === true);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== RESULT: ${passed}/${results.length} passed ===`);
  if (passed !== results.length || code !== 0) process.exitCode = 1;
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
