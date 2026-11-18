// ============================================================================
// main.js — boot: SW registration → PlatformBridge → DB (opfs-sahpool worker)
// → state → v1 migration (one-time) → audio catalog sync → router → Liquid
// Glass nav wiring. Screens mount into #screen-root.
// ============================================================================
import { resolveBridge } from './platform/bridge.js';
import { state, loadState, registerWrite } from './app-state.js';
import { maybeMigrateV1 } from './data/migrate-v1.js';
import { syncReciters } from './data/audio-catalog.js';
import { bootRouter, onNavigate, SCREEN_TAB, navigate } from './ui/router.js';
import { renderToday } from './ui/screens/today.js';
import { renderMushaf } from './ui/screens/mushaf.js';
import { renderKhatmah } from './ui/screens/khatmah.js';
import { renderAudio } from './ui/screens/audio.js';
import { renderSearchSheet } from './ui/screens/search.js';
import { renderAthkar, renderAthkarReader } from './ui/screens/athkar.js';
import { renderTasbih } from './ui/screens/tasbih.js';
import { renderTools, renderQibla, renderHijriCalendar, renderZakat, renderQiyam, renderSettings } from './ui/screens/tools.js';
import { renderBackup } from './ui/screens/backup.js';
import { renderSurahIndex } from './ui/screens/surah-index.js';

const root = document.getElementById('screen-root');

function mountTheme() {
  document.body.dataset.theme = state.settings.theme ?? 'dark';
  document.body.style.setProperty('--font-scale', String(state.settings.font_scale ?? 1.3));
}

const SCREENS = {
  'today': renderToday,
  'mushaf-page': (r, args) => renderMushaf(r, { page: args.page }),
  'mushaf-khatmah': renderKhatmah,
  'mushaf-audio': renderAudio,
  'mushaf-surah-index': renderSurahIndex,
  'adhkar-screen': renderAthkar,
  'adhkar-cat': renderAthkarReader,
  'tasbih-screen': renderTasbih,
  'tools-phase4': renderTools,
  'tools-qibla': renderQibla,
  'tools-hijri': renderHijriCalendar,
  'tools-zakat': renderZakat,
  'tools-qiyam': renderQiyam,
  'tools-backup': renderBackup,
  'tools-settings': renderSettings,
};

function renderRoute({ screen, args }) {
  document.body.classList.toggle('reading', screen.startsWith('mushaf'));
  if (screen !== 'mushaf-page') document.body.classList.remove('chrome-hidden');
  const fn = SCREENS[screen] ?? renderToday;
  fn(root, args ?? {});
  const tab = SCREEN_TAB[screen] ?? 'today';
  for (const btn of document.querySelectorAll('.glass-tabbar .tab-btn')) {
    btn.getAttribute('data-tab') === tab ? btn.setAttribute('aria-current', 'page') : btn.removeAttribute('aria-current');
  }
}

function wireNav() {
  for (const btn of document.querySelectorAll('.glass-tabbar .tab-btn')) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      const targets = {
        today: 'today',
        mushaf: 'mushaf-page',
        athkar: 'adhkar-screen',
        tools: 'tools-phase4',
      };
      navigate(targets[tab]);
    });
  }
  const pill = document.getElementById('searchpill');
  pill.addEventListener('click', renderSearchSheet);
  pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderSearchSheet(); } });
}

function renderBootProgress(loaded = 0, total = 0, phase = 'wasm') {
  if (window.__sadaqaReady) return;
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const label = phase === 'downloading'
    ? `جاري تجهيز قاعدة البيانات القرآنية للعمل بدون إنترنت… ${total > 0 ? `${pct}٪` : ''}`
    : phase === 'importing'
      ? 'جاري تهيئة الفهرس والمصحف…'
      : 'جاري تشغيل صدقة جارية…';
  let box = document.getElementById('boot-progress-box');
  if (!box) {
    root.innerHTML = `<div class="screen"><div class="empty-state" id="boot-progress-box">
      <div class="icon">📖</div>
      <h2>صدقة جارية</h2>
      <p id="boot-progress-label">${label}</p>
      <div style="margin:16px auto 0;width:min(280px,80%);height:8px;border-radius:999px;background:var(--color-surface-raised);overflow:hidden;border:1px solid var(--color-border)">
        <div id="boot-progress-bar" style="height:100%;width:${pct}%;background:var(--color-accent);transition:width 120ms ease-out"></div>
      </div>
    </div></div>`;
    return;
  }
  const lblEl = document.getElementById('boot-progress-label');
  const barEl = document.getElementById('boot-progress-bar');
  if (lblEl) lblEl.textContent = label;
  if (barEl) barEl.style.width = `${phase === 'importing' ? 100 : pct}%`;
}

async function resetAppStorageAndReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (navigator.storage?.getDirectory) {
      const dir = await navigator.storage.getDirectory();
      for await (const name of dir.keys()) {
        await dir.removeEntry(name, { recursive: true }).catch(() => {});
      }
    }
  } catch { /* ignore */ }
  location.reload();
}

async function boot() {
  renderBootProgress(0, 0, 'wasm');
  window.addEventListener('sadaqa:boot-progress', (ev) => {
    const d = ev.detail ?? {};
    renderBootProgress(d.loaded ?? 0, d.total ?? 0, d.phase ?? 'wasm');
  });

  if ('serviceWorker' in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update().catch(() => {})).catch((e) => console.warn('[sw]', e.message));
  }
  state.bridge = await resolveBridge();
  const db = await state.bridge.dbHost();
  registerWrite((sql, params) => db.write(sql, params));
  await loadState(db);
  // one-time v1 localStorage migration + reciter catalog sync (both idempotent)
  state.v1Migration = await maybeMigrateV1(db);
  syncReciters(db).catch((e) => console.warn('[audio-catalog]', e.message));
  mountTheme();
  wireNav();
  onNavigate(renderRoute);
  bootRouter();
  // test/debug hook (v1 harness pattern): observable state + db proxy
  window.__sadaqa = { state, db, navigate, renderSearchSheet };
  window.__sadaqaReady = true;
}

boot().catch((e) => {
  console.error('[boot]', e);
  root.innerHTML = `<div class="screen"><div class="empty-state"><div class="icon">⚠️</div>
    <h2>تعذر تشغيل التطبيق</h2><p style="margin-bottom:16px">${String(e.message ?? e)}</p>
    <button class="btn primary" id="boot-retry-btn">إعادة تهيئة التطبيق</button></div></div>`;
  document.getElementById('boot-retry-btn')?.addEventListener('click', resetAppStorageAndReload);
});
