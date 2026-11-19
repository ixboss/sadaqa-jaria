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
import { iconSvg } from './ui/icons.js';
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
import { autoLocateCity } from './ui/geo.js';

const root = document.getElementById('screen-root');
let routeSeq = 0;
let lastRoute = null;

export function mountTheme() {
  const raw = state.settings.theme ?? 'dark';
  const theme = raw === 'night' ? 'oled' : raw;
  document.body.dataset.theme = theme;
  document.body.style.setProperty('--font-scale', String(state.settings.font_scale ?? 1.3));
  const bgMap = { dark: '#07110F', oled: '#000000', light: '#FAF7F0', sepia: '#F4E8D0' };
  const color = bgMap[theme] ?? '#07110F';
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    m.setAttribute('content', color);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

function positionTabIndicator(instant = false) {
  const bar = document.getElementById('tabbar');
  const ind = document.getElementById('tab-indicator');
  const active = bar?.querySelector('.tab-btn[aria-current="page"]');
  if (!bar || !ind || !active) return;
  if (instant) ind.style.transition = 'none';
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.height = `${active.offsetHeight}px`;
  ind.style.transform = `translate3d(${active.offsetLeft}px, ${active.offsetTop}px, 0)`;
  ind.classList.add('ready');
  if (instant) {
    void ind.offsetWidth;
    ind.style.transition = '';
  }
}

function renderRoute({ screen, args }) {
  const seq = ++routeSeq;
  // تذكّر موضع التمرير للشاشة الغادرة حتى لا يفقد المستخدم مكانه عائداً إليها
  if (lastRoute && lastRoute.screen !== screen && lastRoute.screen !== 'mushaf-page') {
    const prev = root.querySelector('.screen');
    if (prev) scrollMemory.set(lastRoute.screen, prev.scrollTop);
  }
  lastRoute = { screen, args };
  document.body.classList.toggle('reading', screen.startsWith('mushaf'));
  if (screen !== 'mushaf-page') document.body.classList.remove('chrome-hidden');
  document.body.classList.remove('dock-min');
  const tab = SCREEN_TAB[screen] ?? 'today';
  for (const btn of document.querySelectorAll('.glass-tabbar .tab-btn')) {
    btn.getAttribute('data-tab') === tab ? btn.setAttribute('aria-current', 'page') : btn.removeAttribute('aria-current');
  }
  requestAnimationFrame(() => positionTabIndicator(false));
  // شريط قسم المصحف الطافي: شاشات القسم الخارجة عن القارئ فقط
  const hub = document.getElementById('mushaf-hub-dock');
  if (hub) {
    hub.hidden = !(tab === 'mushaf' && screen !== 'mushaf-page');
    for (const b of hub.querySelectorAll('[data-go]')) b.classList.toggle('on', b.dataset.go === screen);
  }
  const fn = SCREENS[screen] ?? renderToday;
  Promise.resolve()
    .then(() => fn(root, args ?? {}))
    .catch((err) => {
      if (seq !== routeSeq) return;
      console.error('[route]', screen, err);
      root.innerHTML = `<div class="screen"><div class="empty-state">
        <div class="icon">${iconSvg('alert', 24)}</div>
        <h2>تعذر تحميل هذه الشاشة</h2>
        <p style="margin-bottom:16px">${escapeHtml(err?.message ?? err)}</p>
        <button class="btn primary" id="route-retry-btn">إعادة المحاولة</button>
      </div></div>`;
      document.getElementById('route-retry-btn')?.addEventListener('click', () => renderRoute({ screen, args }));
    })
    .finally(() => {
      if (seq !== routeSeq) return;
      const el = root.querySelector('.screen');
      if (el && scrollMemory.has(screen)) el.scrollTop = scrollMemory.get(screen);
      // انتقال ناعم عند تبديل الأقسام بدل الاستبدال المفاجئ
      root.firstElementChild?.classList.add('route-enter');
    });
}

// مواضع التمرير المحفوظة لكل شاشة (استمرارية التنقّل ذهاباً وإياباً)
const scrollMemory = new Map();

function wireNav() {
  for (const btn of document.querySelectorAll('.glass-tabbar .tab-btn')) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return; // rail extras (بحث) carry no route — wired below
      const targets = {
        today: 'today',
        mushaf: 'mushaf-page',
        athkar: 'adhkar-screen',
        tools: 'tools-phase4',
      };
      navigate(targets[tab]);
    });
  }
  // Desktop rail: search entry + collapse/restore handle
  document.getElementById('rail-search')?.addEventListener('click', async () => {
    const { renderSearchSheet } = await import('./ui/screens/search.js');
    renderSearchSheet();
  });
  document.getElementById('rail-collapse')?.addEventListener('click', () => {
    document.body.classList.add('rail-collapsed');
  });
  document.getElementById('rail-restore')?.addEventListener('click', () => {
    document.body.classList.remove('rail-collapsed');
  });
  // شريط قسم المصحف الطافي: زر واحد لكل شاشة من شاشات القسم
  document.getElementById('mushaf-hub-dock')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-go]');
    if (btn) navigate(btn.dataset.go);
  });
  const bar = document.getElementById('tabbar');
  if (bar && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => positionTabIndicator(true)).observe(bar);
  }
  window.addEventListener('resize', () => positionTabIndicator(true));
}

// Dock minimize on scroll-down; auto-restores on scroll-up, at top/bottom,
// when scroll settles (~240ms), or on touch/pointer release so it never sticks.
function wireDockScroll() {
  const lastYMap = new WeakMap();
  let idleTimer = null;
  const minimize = () => document.body.classList.add('dock-min');
  const restore = () => document.body.classList.remove('dock-min');
  const scheduleRestore = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(restore, 240);
  };
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest('#screen-root')) return;
    if (document.body.classList.contains('reading')) { restore(); return; }
    const y = t.scrollTop ?? 0;
    const prevY = lastYMap.get(t) ?? y;
    const nearBottom = t.scrollHeight > 0 && (y + t.clientHeight >= t.scrollHeight - 72);
    if (y <= 64 || nearBottom || y < prevY - 6) restore();
    else if (y > prevY + 8) minimize();
    lastYMap.set(t, y);
    scheduleRestore();
  }, true);
  document.addEventListener('scrollend', restore, true);
  document.addEventListener('touchend', scheduleRestore, { passive: true });
  document.addEventListener('pointerup', scheduleRestore, { passive: true });
}

function renderBootProgress(loaded = 0, total = 0, phase = 'wasm') {
  if (window.__sadaqaReady) return;
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const label = phase === 'downloading'
    ? `تجهيز قاعدة البيانات للعمل دون اتصال${total > 0 ? ` — ${pct}٪` : ''}`
    : phase === 'importing'
      ? 'تهيئة الفهرس والمصحف'
      : 'تشغيل إسلامي';
  let box = document.getElementById('boot-progress-box');
  if (!box) {
    root.innerHTML = `<div class="screen"><div class="empty-state" id="boot-progress-box">
      <div class="icon">${iconSvg('mushaf', 24)}</div>
      <h2>إسلامي</h2>
      <p id="boot-progress-label">${label}</p>
      <div style="margin:16px auto 0;width:min(280px,80%);height:6px;border-radius:999px;background:var(--color-surface-raised);overflow:hidden;border:1px solid var(--color-border)">
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

/** إعادة المحاولة فقط: إعادة تحميل بلا أي حذف — أكثر إخفاقات الإقلاع عابرة
 * (قفل OPFS من تبويب آخر، ارتجاج wasm) والبيانات يجب أن تبقى (audit 2026-11). */
async function retryBootAndReload() {
  location.reload();
}

/** إعادة تهيئة كاملة: حاجز تأكيد من خطوتين قبل مسح OPFS — الخطوة الأولى تحذير
 * صريح بخطوات أهدأ، والثانية تأكيد. في Electron لا يوجد window.prompt إطلاقاً
 * (يرمي ويترك الزر ميتاً — review 2026-11) فتُستخدم سلسلة confirm() بدله. */
async function resetAppStorageAndReload() {
  const warned = window.confirm(
    'الإعادة الكاملة ستحذف جميع بياناتك المحلية نهائياً (الختمة، المرجعيات، الملاحظات، العدّادات).\n\n' +
    'جرّب «إعادة المحاولة» أولاً — أكثر إخفاقات الإقلاع عابرة (قفل من تبويب آخر أو ارتجاج مؤقت). هل تريد المتابعة إلى الحذف؟'
  );
  if (!warned) return;
  const isElectron = Boolean(window.sadaqaBridge);
  const typed = isElectron
    ? (window.confirm('خطوة أخيرة: اضغط «موافق» لحذف جميع البيانات نهائياً وغير القابل للاسترجاع.') ? 'امسح' : null)
    : window.prompt('خطوة أخيرة للتأكيد: اكتب «امسح» دون اقتباس');
  if (typed === null || String(typed).trim() !== 'امسح') return;
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

function mountMemoryStorageBanner() {
  if (document.getElementById('storage-mode-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'storage-mode-banner';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;top:0;inset-inline:0;z-index:9999;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 14px;background:#7c2d12;color:#fef3c7;font-size:12px;line-height:1.5;border-bottom:1px solid rgba(255,255,255,.15)';
  const msg = document.createElement('span');
  msg.textContent = 'تنبيه: التخزين المؤقت نشط الآن (تعذر فتح التخزين الدائم OPFS — قد يكون هناك تبويب آخر مفتوحاً أو وضع تصفح خاص). التغييرات لن تُحفظ بعد إغلاق التبويب.';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'إغلاق';
  close.style.cssText = 'background:rgba(255,255,255,.15);color:inherit;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;flex-shrink:0';
  close.addEventListener('click', () => bar.remove());
  bar.append(msg, close);
  document.body.prepend(bar);
}

async function boot() {
  renderBootProgress(0, 0, 'wasm');
  window.addEventListener('sadaqa:boot-progress', (ev) => {
    const d = ev.detail ?? {};
    renderBootProgress(d.loaded ?? 0, d.total ?? 0, d.phase ?? 'wasm');
  });

  state.bridge = await resolveBridge();
  // سجل SW فقط على الويب: داخل Electron كان يخزّن أصول مثبّتة مكررة في
  // userData ويقدم نسخة قديمة من الواجهة بعد تحديث المثبِّت (audit 2026-11)
  if (state.bridge.kind === 'web' && 'serviceWorker' in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update().catch(() => {})).catch((e) => console.warn('[sw]', e.message));
  }
  const db = await state.bridge.dbHost();
  registerWrite((sql, params, opts) => db.write(sql, params, opts));
  // اطلب التخزين الدائم: بلا persist() قد يجلي المتصفح OPFS بالكامل تحت ضغط
  // القرص وتضيع قاعدة البيانات (audit 2026-11) — الأوفلاين أولاً يستحق المنح.
  try { navigator.storage?.persist?.().then((ok) => console.info('[storage] persisted:', ok)).catch(() => {}); } catch { /* ignore */ }
  await loadState(db);
  // one-time v1 localStorage migration + reciter catalog sync (both idempotent)
  state.v1Migration = await maybeMigrateV1(db);
  syncReciters(db).catch((e) => console.warn('[audio-catalog]', e.message));
  mountTheme();
  wireNav();
  wireDockScroll();
  onNavigate(renderRoute);
  bootRouter();
  if (db.mode && db.mode !== 'opfs-sahpool') {
    mountMemoryStorageBanner();
  }
  // test/debug hook (v1 harness pattern): observable state + db proxy
  window.__sadaqa = { state, db, navigate, renderSearchSheet };
  window.__sadaqaReady = true;
  // Launch auto-city: silent, runs only when permission is already granted
  // and no city was ever chosen; re-renders the hub on success.
  autoLocateCity(db).then((city) => {
    if (city && lastRoute) renderRoute(lastRoute);
  }).catch(() => {});
}

boot().catch((e) => {
  console.error('[boot]', e);
  // زران منفصلان: المحاولة الآمنة أولاً — الحذف الكامل يتطلب تأكيداً مزدوجاً
  // ولا يُعرض إلا كخيار ثانوي (audit 2026-11)
  root.innerHTML = `<div class="screen"><div class="empty-state"><div class="icon">${iconSvg('alert', 24)}</div>
    <h2>تعذر تشغيل التطبيق</h2><p style="margin-bottom:16px">${escapeHtml(e.message ?? e)}</p>
    <button class="btn primary" id="boot-retry-btn">إعادة المحاولة (تبقى بياناتك)</button>
    <button class="btn" id="boot-reset-btn" style="margin-top:10px">إعادة تهيئة كاملة (حذف البيانات)</button></div></div>`;
  document.getElementById('boot-retry-btn')?.addEventListener('click', retryBootAndReload);
  document.getElementById('boot-reset-btn')?.addEventListener('click', resetAppStorageAndReload);
});
