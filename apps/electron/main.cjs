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
        if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
          return new Response(fs.readFileSync(file), {
            headers: { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' },
          });
        }
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

function openDatabase() {
  const Database = require('better-sqlite3');
  const userDb = path.join(app.getPath('userData'), 'sadaqa.db');
  if (!fs.existsSync(userDb)) fs.copyFileSync(SEED_DB, userDb);
  db = new Database(userDb);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/** Bound, typed IPC — SQL never concatenated here; params must be arrays. */
function guardParams(params) {
  if (params === undefined || params === null) return [];
  if (!Array.isArray(params)) throw new Error('params must be an array');
  return params;
}

function registerIpc() {
  ipcMain.handle('db:query', (_e, { sql, params }) => db.prepare(String(sql)).all(...guardParams(params)));
  ipcMain.handle('db:queryOne', (_e, { sql, params }) => db.prepare(String(sql)).get(...guardParams(params)) ?? null);
  ipcMain.handle('db:write', (_e, { sql, params }) => {
    const s = String(sql);
    db.prepare(s).run(...guardParams(params));
    if (s.includes('user_settings')) loadEngine().catch(() => {});
    return { ok: true };
  });
  ipcMain.handle('db:batch', (_e, { stmts }) => {
    if (!Array.isArray(stmts) || stmts.length === 0) throw new Error('batch: stmts required');
    const runAll = db.transaction(() => {
      let count = 0;
      for (const { sql, params } of stmts) {
        db.prepare(String(sql)).run(...guardParams(params));
        count++;
      }
      return count;
    });
    return { ok: true, count: runAll() };
  });
  ipcMain.handle('db:export', () => fs.readFileSync(path.join(app.getPath('userData'), 'sadaqa.db')));

  // audio store → userData/audio/<reciter>/<key>.mp3 (local filesystem pack cache)
  const audioDirFor = (reciter, key) => {
    const safeReciter = String(reciter).replace(/[^a-z0-9_-]/gi, '');
    const safeKey = String(key).replace(/[^a-z0-9_-]/gi, '');
    if (!safeReciter || !safeKey) throw new Error('bad audio key');
    const dir = path.join(app.getPath('userData'), 'audio', safeReciter);
    return { dir, file: path.join(dir, `${safeKey}.mp3`) };
  };
  ipcMain.handle('audio:put', (_e, { reciter, key, bytes }) => {
    const { dir, file } = audioDirFor(reciter, key);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, Buffer.from(bytes));
    return { ok: true };
  });
  ipcMain.handle('audio:get', (_e, { reciter, key }) => {
    const { file } = audioDirFor(reciter, key);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  });
  ipcMain.handle('audio:delete', (_e, { reciter, key }) => {
    const { file } = audioDirFor(reciter, key);
    if (fs.existsSync(file)) fs.rmSync(file);
    return { ok: true };
  });

  // .sadaqa files via native dialogs
  ipcMain.handle('file:save', async (_e, { bytes, name }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: name });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, Buffer.from(bytes));
    return true;
  });
  ipcMain.handle('file:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Sadaqa Backup', extensions: ['sadaqa'] }] });
    if (canceled || filePaths.length === 0) return null;
    return fs.readFileSync(filePaths[0]);
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
  let loc = { lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh', name_ar: 'مكة المكرمة' };
  let method = 'umm_al_qura', madhab = 'shafi', hlr = 'middle_of_the_night';
  try {
    const rows = db.prepare(`SELECT key, value FROM user_settings`).all();
    for (const r of rows) {
      let v; try { v = JSON.parse(r.value); } catch { v = r.value; }
      if (r.key === 'location' && v && Number.isFinite(v.lat)) loc = v;
      if (r.key === 'calc_method') method = String(v);
      if (r.key === 'madhab') madhab = String(v);
      if (r.key === 'high_latitude_rule') hlr = String(v);
    }
  } catch { /* defaults */ }
  engine = prayer.bindPrayerEngine({
    lat: loc.lat,
    lng: loc.lng,
    timeZone: loc.timeZone || loc.tz || 'Asia/Riyadh',
    method,
    madhab,
    highLatitudeRule: hlr,
  });
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
  tray.setToolTip('صدقة جارية');
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!engine) return;
  const now = Date.now();
  const next = engine.next(now);
  const tz = engine.opts.timeZone;
  const clock = (ms) => new Intl.DateTimeFormat('ar', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  const items = [
    { label: `الصلاة القادمة: ${PRAYER_AR[next.name]} ${clock(next.at)} — بعد ${fmtHMS(next.at - now)}`, enabled: false },
    { type: 'separator' },
    { label: 'فتح التطبيق', click: () => createWindow() },
    { type: 'separator' },
    { label: 'خروج', click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(`الصلاة القادمة: ${PRAYER_AR[next.name]} بعد ${fmtHMS(next.at - now)}`);
}

function checkAdhan() {
  if (!engine || !Notification.isSupported()) return;
  const now = Date.now();
  const n = engine.next(now);
  if (n.name === 'sunrise' || now < n.at || now - n.at > 90_000) return;
  const key = `${n.name}@${n.at}`;
  if (firedAdhan.has(key)) return;
  firedAdhan.add(key);
  new Notification({ title: `حان الآن موعد أذان ${PRAYER_AR[n.name]}`, body: 'حي على الصلاة · حي على الفلاح', silent: false }).show();
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
    backgroundColor: '#07161B',
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
    const d = openDatabase();
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
app.whenReady().then(async () => {
  registerAppProtocol();
  registerIpc();
  try { openDatabase(); } catch (e) { console.error('[db]', e.message); }
  await loadEngine().catch(() => {});
  createTray();
  setInterval(rebuildTrayMenu, 1000);
  setInterval(checkAdhan, 10_000);
  if (process.env.SADAQA_PROBE === '1' || process.argv.includes('--probe')) {
    setTimeout(runProbe, 300);
    return;
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { app.__quitting = true; });
app.on('window-all-closed', () => { /* tray-resident: stay alive */ });
