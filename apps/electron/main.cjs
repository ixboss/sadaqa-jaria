// ============================================================================
// main.cjs — Electron desktop shell (Phase 4). Security model first:
//   contextIsolation: true, nodeIntegration: false, sandbox: true,
//   single custom `app://` protocol (fetch-capable) serving ONLY from two
//   allowlisted roots (web assets + shared packages), every path resolved and
//   verified under its root before read. All renderer access goes through the
//   preload contextBridge (IPC) — the DB (better-sqlite3) lives HERE in the
//   main process. Tray: live prayer countdown. Native Adhan notifications on
//   prayer entry. Zero-server: everything loads from packaged local assets.
// Probe mode (SADAQA_PROBE=1): self-checks → JSON on stdout → exit.
// ============================================================================
const { app, protocol, net, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');

// ---------------------------------------------------------------------------
// resource layout (dev = repo checkout; packaged = electron-builder layout)
// ---------------------------------------------------------------------------
const WEB_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..', 'web-desktop');
const PKG_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'packages')
  : path.join(__dirname, '..', '..', 'packages');
const SEED_DB = path.join(PKG_DIR, 'core-data', 'build', 'sadaqa.db');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// app:// must be standard+secure so ES modules, fetch and wasm all behave like https
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

/** Resolve a request path against an allowlisted root (symlinks resolved). */
function resolveUnder(root, urlPath) {
  try {
    const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
    if (clean.includes('..')) return null; // defense in depth on top of realpath
    const abs = path.resolve(root, clean);
    const real = fs.realpathSync.native(abs); // throws when absent
    const rootReal = fs.realpathSync.native(root);
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null;
    return real;
  } catch {
    return null;
  }
}

function registerAppProtocol() {
  const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'none';";
  protocol.handle('app', async (request) => {
    try {
      const u = new URL(request.url);
      const candidates = [];
      // single host: web assets first, then the shared packages tree. Module
      // imports resolve `/js/data/../../../../packages/...` → `/packages/…`,
      // so strip that virtual prefix when mapping onto PKG_DIR.
      candidates.push(resolveUnder(WEB_DIR, u.pathname));
      if (u.pathname.startsWith('/packages/')) {
        candidates.push(resolveUnder(PKG_DIR, u.pathname.slice('/packages'.length)));
      }
      for (const file of candidates) {
        if (!file) continue;
        try {
          const st = await fsp.stat(file);
          if (!st.isFile()) continue;
          const ext = path.extname(file).toLowerCase();
          const headers = { 'content-type': MIME[ext] ?? 'application/octet-stream' };
          if (ext === '.html') headers['content-security-policy'] = CSP;
          const body = await fsp.readFile(file);
          return new Response(body, { headers });
        } catch { /* try next candidate */ }
      }
      return new Response('not found', { status: 404 });
    } catch {
      return new Response('bad request', { status: 400 });
    }
  });
}

// ---------------------------------------------------------------------------
// main-process SQLite (better-sqlite3) — copy seed → userData on first run
// ---------------------------------------------------------------------------
let db = null;

// schema_version (meta table, schema.sql:42) is now read on every open —
// migrations run keyed on it; a db written by a NEWER build is never touched.
const SCHEMA_VERSION = 1;

function migrateDb(database) {
  let raw = null;
  try {
    const row = database.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get();
    raw = row?.value;
  } catch { /* absent meta table/row */ }
  let v = 0;
  if (raw !== undefined && raw !== null) {
    let parsed;
    try { parsed = Number(JSON.parse(String(raw))); } catch { parsed = Number(raw); }
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`sadaqa.db invalid schema_version: ${raw}`);
    }
    v = parsed;
  }
  if (v > SCHEMA_VERSION) {
    throw new Error(`sadaqa.db schema_version ${v} is newer than this build (${SCHEMA_VERSION}) — update the app (data left untouched)`);
  }
  if (v < SCHEMA_VERSION) {
    database.transaction(() => {
      // future migration steps when SCHEMA_VERSION > 1
      database.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`).run(String(SCHEMA_VERSION));
    })();
  }
  return SCHEMA_VERSION;
}

async function openDatabase() {
  if (db) return db;
  const Database = require('better-sqlite3');
  const userDb = path.join(app.getPath('userData'), 'sadaqa.db');
  try {
    await fsp.access(userDb);
  } catch {
    await fsp.copyFile(SEED_DB, userDb);
  }
  const instance = new Database(userDb);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  migrateDb(instance);
  db = instance;
  return db;
}

/** Bound, typed IPC — SQL never concatenated here; params must be arrays. */
function guardParams(params) {
  if (params === undefined || params === null) return [];
  if (!Array.isArray(params)) throw new Error('params must be an array');
  return params;
}

function guardSql(kind, sql) {
  const s = String(sql ?? '').trim();
  if (!s) throw new Error('empty sql');
  if (s.includes(';')) throw new Error('multi-statement sql forbidden');
  if (/^\s*(SELECT|WITH)\b/i.test(s)) {
    if (kind !== 'read') throw new Error('read query not allowed in write channel');
    return s;
  }
  if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(s)) {
    if (kind !== 'write') throw new Error('write statement not allowed in read channel');
    return s;
  }
  throw new Error('disallowed sql operation');
}

function registerIpc() {
  // db قد تكون null إذا فشل الفتح عند الإقلاع — رسالة واضحة بدل TypeError غامض
  // يصل الـ renderer كفشل إقلاع بلا سبب (audit 2026-11)
  const requireDb = () => { if (!db) throw new Error('sadaqa.db unavailable — قاعدة البيانات غير مفتوحة (انظر سجل الإقلاع)'); return db; };
  ipcMain.handle('db:query', (_e, { sql, params }) => requireDb().prepare(guardSql('read', sql)).all(...guardParams(params)));
  ipcMain.handle('db:queryOne', (_e, { sql, params }) => requireDb().prepare(guardSql('read', sql)).get(...guardParams(params)) ?? null);
  ipcMain.handle('db:write', (_e, { sql, params, engineReload }) => {
    const s = guardSql('write', sql);
    requireDb().prepare(s).run(...guardParams(params));
    // explicit flag from the renderer's settings writer (no SQL sniffing —
    // 2026-11 audit): settings changes rebind the tray/adhan engine
    if (engineReload === true) loadEngine().catch(() => {});
    return { ok: true };
  });
  ipcMain.handle('db:batch', (_e, { stmts, engineReload }) => {
    requireDb();
    if (!Array.isArray(stmts) || stmts.length === 0) throw new Error('batch: stmts required');
    const checked = stmts.map(({ sql, params }) => ({ sql: guardSql('write', sql), params: guardParams(params) }));
    const runAll = db.transaction(() => {
      let count = 0;
      for (const { sql, params } of checked) {
        db.prepare(sql).run(...params);
        count++;
      }
      return count;
    });
    const count = runAll();
    if (engineReload === true) loadEngine().catch(() => {});
    return { ok: true, count };
  });
  // (db:export IPC حُذف 2026-11: لا يستدعيه أي كود واجهة — سلسلة exportDb
  // الميتة exportDb→db:export قراءةً للملف الخام أثناء قفل WAL. التصدير
  // الرسمي هو ملف .sadaqa عبر file:save.)

  // audio store → userData/audio/<reciter>/<key>.mp3 (local filesystem pack cache)
  const audioDirFor = (reciter, key) => {
    const safeReciter = String(reciter).replace(/[^a-z0-9_-]/gi, '');
    const safeKey = String(key).replace(/[^a-z0-9_-]/gi, '');
    if (!safeReciter || !safeKey) throw new Error('bad audio key');
    const dir = path.join(app.getPath('userData'), 'audio', safeReciter);
    return { dir, file: path.join(dir, `${safeKey}.mp3`) };
  };
  ipcMain.handle('audio:put', async (_e, { reciter, key, bytes }) => {
    const { dir, file } = audioDirFor(reciter, key);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(file, Buffer.from(bytes));
    return { ok: true };
  });
  ipcMain.handle('audio:get', async (_e, { reciter, key }) => {
    const { file } = audioDirFor(reciter, key);
    try {
      return await fsp.readFile(file);
    } catch (err) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  });
  ipcMain.handle('audio:delete', async (_e, { reciter, key }) => {
    const { file } = audioDirFor(reciter, key);
    await fsp.rm(file, { force: true });
    return { ok: true };
  });

  // .sadaqa files via native dialogs — defaultPath اسم ملف فقط (لا مسار مطلق
  // من الـ renderer) وبمرشّح امتداد واحد (audit 2026-11)
  ipcMain.handle('file:save', async (_e, { bytes, name }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.basename(String(name ?? 'sadaqa-backup.sadaqa')),
      filters: [{ name: 'Sadaqa Backup', extensions: ['sadaqa'] }],
    });
    if (canceled || !filePath) return false;
    await fsp.writeFile(filePath, Buffer.from(bytes));
    return true;
  });
  ipcMain.handle('file:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Sadaqa Backup', extensions: ['sadaqa'] }] });
    if (canceled || filePaths.length === 0) return null;
    return await fsp.readFile(filePaths[0]);
  });
  ipcMain.handle('notify', (_e, payload) => {
    if (!Notification.isSupported()) return false;
    new Notification({ title: String(payload.title), body: String(payload.body), silent: false }).show();
    return true;
  });
}

// ---------------------------------------------------------------------------
// shared engines in the MAIN process: tray countdown + adhan notifications
// ---------------------------------------------------------------------------
let tray = null;
const firedAdhan = new Set();
let engine = null;

async function loadEngine() {
  const prayer = await import(pathToFileURL(path.join(PKG_DIR, 'core-data', 'engines', 'prayer.js')).href);
  const settings = {};
  try {
    const rows = db.prepare(`SELECT key, value FROM user_settings`).all();
    for (const r of rows) {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    }
  } catch { /* defaults */ }
  engine = prayer.bindPrayerEngineFromSettings(settings);
  return engine;
}

const PRAYER_AR = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
const fmtHMS = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

function trayIcon() {
  // generated at runtime — a gold crescent on the app's dark teal (no binary asset needed)
  const W = 32, data = Buffer.alloc(W * W * 4);
  const cx = 16, cy = 16, r1 = 13, r2 = 10, ox = 7;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d1 = Math.hypot(x - cx, y - cy);
      const d2 = Math.hypot(x - cx - ox, y - cy);
      let r = 7, g = 0x16, b = 0x1b, a = 255; // #07161B
      if (d1 <= r1 && !(d2 <= r2)) { r = 0xd4; g = 0xaf; b = 0x37; } // gold crescent
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return nativeImage.createFromBuffer(encodePng(data, W, W));
}

function encodePng(raw, w, h) {
  const CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return (buf) => { let c = -1; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  })();
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const head = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(head));
    return Buffer.concat([len, head, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const scan = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    scan[y * (stride + 1)] = 0;
    raw.copy(scan, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scan)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('إسلامي');
  rebuildTrayMenu();
}

let lastTrayMenuLabel = '';
function rebuildTrayMenu() {
  if (!engine || !tray) return;
  const now = Date.now();
  const next = engine.next(now);
  const tz = engine.opts.timeZone;
  const clock = (ms) => new Intl.DateTimeFormat('ar', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  const menuLabel = `الصلاة القادمة: ${PRAYER_AR[next.name]} ${clock(next.at)}`;
  if (menuLabel !== lastTrayMenuLabel) {
    lastTrayMenuLabel = menuLabel;
    const items = [
      { label: menuLabel, enabled: false },
      { type: 'separator' },
      { label: 'فتح التطبيق', click: () => createWindow() },
      { type: 'separator' },
      { label: 'خروج', click: () => app.quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(items));
  }
  tray.setToolTip(`الصلاة القادمة: ${PRAYER_AR[next.name]} بعد ${fmtHMS(next.at - now)}`);
}

function checkAdhan() {
  if (!engine || !Notification.isSupported()) return;
  const now = Date.now();
  const n = engine.next(now);
  const prev = n.previous;
  if (!prev || prev.name === 'sunrise' || now - prev.at < 0 || now - prev.at > 90_000) return;
  const key = `${prev.name}@${prev.at}`;
  if (firedAdhan.has(key)) return;
  if (firedAdhan.size > 64) firedAdhan.clear();
  firedAdhan.add(key);
  new Notification({ title: `حان الآن موعد أذان ${PRAYER_AR[prev.name]}`, body: 'حي على الصلاة · حي على الفلاح', silent: false }).show();
}

// ---------------------------------------------------------------------------
// window
// ---------------------------------------------------------------------------
function createWindow() {
  const existing = BrowserWindow.getAllWindows().find((w) => w.__sadaqaMain);
  if (existing) { existing.show(); existing.focus(); return existing; }
  const win = new BrowserWindow({
    width: 1180, height: 800, minWidth: 380, minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#07110F',
    icon: trayIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,       // renderer never sees Node
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.__sadaqaMain = true;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://sadaqa/')) e.preventDefault();
  });
  // انهيار الـ renderer (OOM/wasm) كان يترك نافذة بيضاء مع close-to-tray
  // فتبدو تعليقاً — أعد التحميل بميزانية بسيطة (audit 2026-11)
  let goneReloads = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return;
    if (++goneReloads > 3) return; // لا حلقة إعادة تحميل لا نهائية
    setTimeout(() => { try { win.webContents.reload(); } catch { /* ignore */ } }, 500);
  });
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    if (!app.__quitting) { e.preventDefault(); win.hide(); } // tray-resident close
  });
  win.loadURL('app://sadaqa/index.html');
  return win;
}

// ---------------------------------------------------------------------------
// probe mode (e2e): self-checks → JSON stdout → exit
// ---------------------------------------------------------------------------
async function runProbe() {
  const checks = {};
  try {
    const d = await openDatabase();
    checks.sqlite = true;
    checks.fts5 = d.pragma('compile_options').some((r) => String(r.compile_options).includes('ENABLE_FTS5'));
    checks.ftsQuery = d.prepare("SELECT COUNT(*) n FROM fts_ayahs WHERE fts_ayahs MATCH ?").get('الله').n > 0;
    checks.surahs = d.prepare('SELECT COUNT(*) n FROM surahs').get().n;
    checks.userDbPath = d.name;
  } catch (e) { checks.sqliteError = String(e.message); }
  try {
    const res = await net.fetch('app://sadaqa/index.html');
    const text = await res.text();
    checks.protocol = res.status === 200 && text.startsWith('<!DOCTYPE');
    checks.protocolFonts = (await net.fetch('app://sadaqa/assets/fonts/qpc1/p001.woff2')).status === 200;
    checks.protocolDb = (await net.fetch('app://sadaqa/packages/core-data/build/sadaqa.db')).status === 200;
  } catch (e) { checks.protocolError = String(e.message); }
  try {
    await loadEngine();
    const n = engine.next(Date.now());
    checks.engine = Boolean(n && n.name && n.at > 0);
    checks.tray = Boolean(tray);
    checks.notifications = Notification.isSupported();
  } catch (e) { checks.engineError = String(e.message); }
  // renderer: preload bridge + isolation (hidden window, no full boot wait)
  checks.bridge = await new Promise((resolve) => {
    const win = new BrowserWindow({ show: false, webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
    } });
    win.webContents.on('dom-ready', async () => {
      try {
        const r = await win.webContents.executeJavaScript(
          `({ kind: window.sadaqaBridge?.kind ?? null, isolated: typeof window.process === 'undefined' && typeof window.require === 'undefined', caps: window.sadaqaBridge?.capabilities ?? null })`);
        resolve(r);
      } catch (e) { resolve({ error: String(e.message) }); }
      win.destroy();
    });
    win.loadURL('app://sadaqa/index.html');
    setTimeout(() => resolve({ error: 'timeout' }), 15000);
  });
  const ok = checks.sqlite && checks.fts5 && checks.ftsQuery && checks.surahs === 114 && checks.protocol && checks.protocolFonts
    && checks.protocolDb && checks.engine && checks.tray && checks.notifications
    && checks.bridge?.kind === 'electron' && checks.bridge?.isolated === true;
  console.log('SADAQA_PROBE_JSON:' + JSON.stringify({ ok, checks }));
  app.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
const isProbe = process.env.SADAQA_PROBE === '1' || process.argv.includes('--probe');
if (!isProbe) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on('second-instance', () => { createWindow(); });
  }
}

app.whenReady().then(async () => {
  // هوية الإشعارات على Windows: بدون AUMID مطابق للاختصار يُسقط النظام
  // الإشعارات بصمت على بعض الإعدادات، وتُنسب لـ Electron العام (audit 2026-11)
  app.setAppUserModelId('app.sadaqa.desktop');
  registerAppProtocol();
  registerIpc();
  try { await openDatabase(); } catch (e) { console.error('[db]', e.message); }
  await loadEngine().catch(() => {});
  createTray();
  // حلقات الرئيسية لا تجوز أن تُسقط من استثناء واحد (إعداد موقع تالف كان يجمّد
  // العدّاد والأذان للأبد — المحرك يتحقق من المنطقة الزمنية الآن، وهنا حزام
  // ثانٍ) (audit 2026-11)
  setInterval(() => { try { rebuildTrayMenu(); } catch (e) { console.error('[tray]', e.message); } }, 1000);
  setInterval(() => { try { checkAdhan(); } catch (e) { console.error('[adhan]', e.message); } }, 10_000);
  if (isProbe) {
    setTimeout(runProbe, 300);
    return;
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { app.__quitting = true; });
app.on('window-all-closed', () => { /* tray-resident: stay alive */ });
