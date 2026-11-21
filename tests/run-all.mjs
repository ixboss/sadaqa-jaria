/**
 * مرحّل الاختبارات الشامل — يشغّل وحدات الاختبار والفحوصات بالتسلسل.
 * الاستخدام: npm test   (أو node tests/run-all.mjs)
 *
 * متغيرات البيئة:
 *   E2E_BROWSER  مسار متصفح Chromium/Edge (افتراضي: Edge على Windows)
 *   SKIP_E2E=1   تشغيل الاختبارات الوحدية فقط (بلا متصفح)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveDefaultBrowser() {
  if (process.env.E2E_BROWSER && existsSync(process.env.E2E_BROWSER)) {
    return process.env.E2E_BROWSER;
  }
  const candidates = process.platform === 'win32'
    ? [
        join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join('C:', 'Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join('C:', 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : [
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/microsoft-edge',
          '/snap/bin/chromium',
        ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  if (process.platform !== 'win32') {
    for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'microsoft-edge']) {
      const r = spawnSync('which', [bin], { encoding: 'utf8' });
      const found = r.status === 0 ? r.stdout.trim() : '';
      if (found && existsSync(found)) return found;
    }
  }
  return process.env.E2E_BROWSER || '';
}

const resolvedBrowser = resolveDefaultBrowser();
const childEnv = resolvedBrowser ? { ...process.env, E2E_BROWSER: resolvedBrowser } : process.env;

const __dirname = dirname(fileURLToPath(import.meta.url));
const UNIT = ['unit-backup.mjs', 'unit-dbguard.mjs', 'unit-mushaf.mjs', 'unit-v1engines.mjs'];
// الاختبارات الشاملة: النواة أوفلاين + الأذكار + المصحف + التفسير + النسخ الاحتياطي …
const E2E = [
  'e2e-offline-shell.mjs',
  'e2e-nav-tabs.mjs',
  'e2e-sw-update.mjs',
  'e2e-tafsir.mjs',
  'e2e-adhkar-pager.mjs',
  'e2e-mushaf-fit.mjs',
  // ملاحظة: مجموعات المصحف المصغّر/الشريط/قلب الصفحة تقلع تطبيق v2 الذي يحتاج
  // packages/core-data/build/sadaqa.db — تُشغَّل في خطوة CI اللاحقة (test:v2:fixes)
  // بعد db:build، وليس هنا قبل البناء (CI 2026-11-20: "db write channel not registered").
  'e2e-mushaf.mjs',
  'e2e-backup.mjs',
  'e2e-khatmah-lifecycle.mjs',
  'e2e-progress-streak.mjs',
  'e2e-quran-layout.mjs',
  'e2e-reader-nav-theme.mjs',
  'probe-backup-geometry.mjs',
  'probe-deeplinks.mjs',
  'probe-pageturn-direction.mjs',
  'probe-reader-back.mjs',
  'probe-reader-chrome.mjs',
  'probe-reader-theme-matrix.mjs',
  'probe-reader-theme.mjs',
  'probe-settings-screen.mjs',
  'service-worker-cache.mjs',
];

let failed = [];
const run = (file) => {
  console.log(`\n▶ ${file}`);
  const r = spawnSync('node', [join(__dirname, file)], { stdio: 'inherit', env: childEnv });
  if (r.status !== 0) failed.push(file);
};

for (const f of UNIT) run(f);
if (process.env.SKIP_E2E !== '1') {
  // شغّل الخادم كعملية منفصلة ثم انتظر حتى يستجيب
  const { spawn } = await import('node:child_process');
  const { default: net } = await import('node:net');
  const serverProc = spawn('node', [join(__dirname, 'run-server.mjs'), '8123'], { stdio: 'ignore', detached: true });
  const up = await new Promise((res) => {
    let tries = 0;
    const ping = () => {
      const s = net.connect(8123, '127.0.0.1');
      s.on('connect', () => { s.end(); res(true); });
      s.on('error', () => { if (++tries > 40) res(false); else setTimeout(ping, 250); });
    };
    ping();
  });
  if (!up) { console.error('✗ فشل تشغيل خادم الاختبار'); serverProc.kill(); process.exit(1); }
  try { for (const f of E2E) run(f); }
  finally { try { serverProc.kill(); } catch {} }
}

console.log('\n════════════════════════════');
if (failed.length) {
  console.error(`✗ فشلت ${failed.length} وحدة: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('✅ جميع وحدات الاختبار نجحت');
