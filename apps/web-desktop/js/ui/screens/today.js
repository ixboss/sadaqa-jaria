// ============================================================================
// today.js — Today Hub (Phase 4): prayer hero countdown + daily schedule +
// Hijri date + Smart Context-Aware Card (ARCHITECTURE.md §9 resolution order:
// Friday Fajr–Jumu'ah → Al-Kahf; ±20 min post-prayer → after-prayer dhikr;
// Fajr window → morning athkar; Asr window → evening athkar; last third of
// night → Qiyam; else next-prayer details). Ticker formats only — deterministic
// engine values never recompute inside the 1 Hz loop. e2e clock hook:
// window.__sadaqa.state.clockOverride.
// ============================================================================
import { state, nowMs, haptic, saveSetting, prayerEngineForSettings, HAPTICS } from '../../app-state.js';
import { monthNameAr, withAdjust } from '../../../../../packages/core-data/engines/hijri.js';
import { resolveSmartCard } from '../../../../../packages/core-data/engines/smart-card.js';
import { navigate } from '../router.js';

const fmtClock = (ms, tz) => new Intl.DateTimeFormat('ar', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const fmtHMS = (msLeft) => {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};
const PRAYER_LABELS = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
const PRAYER_ICONS = { fajr: '🌅', sunrise: '☀️', dhuhr: '🌤️', asr: '🌇', maghrib: '🌆', isha: '🌙' };
const DAY_LABELS = { Sunday: 'الأحد', Monday: 'الإثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت' };

// The resolver itself lives in the shared engines dir (Phase 5 parity): all
// four targets execute the same §9 golden logic — re-exported here so the
// e2e probes keep importing it from this screen module unchanged.
export { resolveSmartCard };

/** Map smart-card athkar actions to the right Hisn al-Muslim category rows. */
async function resolveAdhkarCategory(db, kind) {
  if (kind === 'morning') {
    return db.queryOne(`SELECT category_id FROM athkar_categories WHERE solar_window = 'fajr' ORDER BY sort_order LIMIT 1`);
  }
  if (kind === 'evening') {
    return db.queryOne(`SELECT category_id FROM athkar_categories WHERE solar_window = 'asr' AND name_ar LIKE '%المَسَاءِ%' ORDER BY sort_order LIMIT 1`);
  }
  if (kind === 'after_prayer') {
    return db.queryOne(`SELECT category_id FROM athkar_categories WHERE solar_window = 'after_prayer' ORDER BY sort_order LIMIT 1`);
  }
  return null;
}

export function renderToday(root) {
  const engine = prayerEngineForSettings();
  const tz = engine.opts.timeZone;
  const now = nowMs();
  const next = engine.next(now);
  const dateIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  const day = engine.daySchedule(dateIso);
  const windows = engine.sunnahWindows(dateIso);
  const locName = state.settings.location?.name_ar ?? 'مكة المكرمة';
  const hijri = withAdjust(dateIso, Number(state.settings.hijri_adjust ?? 0));
  const dowEn = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now);
  const gregText = new Intl.DateTimeFormat('ar', { timeZone: tz, day: 'numeric', month: 'long' }).format(now);

  const card = resolveSmartCard(now, engine);
  root.innerHTML = `
  <div class="screen">
    <div class="screen-header">
      <div class="today-toprow">
        <div>
          <h1>اليوم</h1>
          <div class="sub">${DAY_LABELS[dowEn]} · ${hijri.d} ${monthNameAr(hijri.m)} ${hijri.y} هـ · ${gregText}</div>
        </div>
        <button class="city-pill" id="today-city-btn" aria-label="تغيير المدينة">📍 ${locName}</button>
      </div>
    </div>

    <div class="card hub-hero" id="prayer-hero">
      <div class="hh-label">الصلاة القادمة</div>
      <div class="hh-name">${PRAYER_LABELS[next.name]}</div>
      <div class="hh-clock" id="hero-countdown">${fmtHMS(next.at - now)}</div>
      <div class="hh-at">الأذان ${fmtClock(next.at, tz)}</div>
    </div>

    <div class="card smart-card" id="smart-card" data-kind="${card.kind}">
      <span class="sc-badge">${card.badge}</span>
      <div class="sc-icon">${card.icon}</div>
      <h3 class="sc-title">${card.title}</h3>
      <p class="sc-sub">${card.sub}</p>
      <button class="btn primary" id="sc-action">${card.action.label}</button>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0;font-size:15px">مواقيت اليوم</h3>
        <button class="city-pill" id="today-month-btn">جدول الشهر</button>
      </div>
      <div class="prayer-grid">
        ${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((n) => `
          <div class="prayer-row ${next.name === n ? 'next' : ''}" data-prayer="${n}">
            <span class="p-icon" aria-hidden="true">${PRAYER_ICONS[n]}</span>
            <span class="p-name">${PRAYER_LABELS[n]}</span>
            <span class="p-time">${fmtClock(day.prayers[n], tz)}</span>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:15px">تطبيقاتك اليومية</h3>
      <div class="quick-apps-grid">
        <button class="qa-btn" data-go="tasbih-screen"><span class="qa-ico">📿</span><span>السبحة</span></button>
        <button class="qa-btn" data-go="adhkar-screen"><span class="qa-ico">🤲</span><span>الأذكار</span></button>
        <button class="qa-btn" data-go="mushaf-surah-index"><span class="qa-ico">📖</span><span>الفهرس</span></button>
        <button class="qa-btn" data-go="tools-qibla"><span class="qa-ico">🧭</span><span>القبلة</span></button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:15px">قيام الليل</h3>
      <div style="font-size:14px;line-height:2">
        منتصف الليل: <strong style="font-variant-numeric:tabular-nums">${fmtClock(windows.midnight, tz)}</strong><br>
        الثلث الأخير: <strong style="font-variant-numeric:tabular-nums">${fmtClock(windows.lastThird, tz)}</strong> — حتى الفجر ${fmtClock(windows.nextFajr, tz)}
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-size:15px;font-weight:700">متابعة المصحف</div>
          <div style="font-size:12px;color:var(--color-text-secondary)">وصلت إلى صفحة ${state.progress.page} من ٦٠٤</div>
        </div>
        <span class="badge on">${Math.round((state.progress.page / 604) * 100)}٪</span>
      </div>
      <div class="row-actions">
        <button class="btn primary" id="t-read">تابع القراءة — صفحة ${state.progress.page}</button>
        <button class="btn" id="t-khatmah">الختمة</button>
        <button class="btn" id="t-settings">الإعدادات</button>
      </div>
    </div>
  </div>`;

  // smart-card action: athkar kinds route to the actual category row
  root.querySelector('#sc-action').addEventListener('click', async () => {
    if (card.action.screen === 'mushaf-page' && card.action.args.page === 'kahf') {
      const s = await state.db.queryOne(`SELECT start_page FROM surahs WHERE number = 18`);
      navigate('mushaf-page', { page: s?.start_page ?? 301 });
      return;
    }
    if (['morning', 'evening', 'after_prayer'].includes(card.kind)) {
      const cat = await resolveAdhkarCategory(state.db, card.kind);
      if (cat) { navigate('adhkar-cat', { id: cat.category_id }); return; }
      haptic(HAPTICS.pageFlipSettle); // fall through to the generic route below
    }
    navigate(card.action.screen, card.action.args ?? {});
  });
  for (const btn of root.querySelectorAll('.qa-btn[data-go]')) {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  }
  root.querySelector('#t-read').addEventListener('click', () => navigate('mushaf-page', { page: state.progress.page }));
  root.querySelector('#t-khatmah').addEventListener('click', () => navigate('mushaf-khatmah'));
  root.querySelector('#t-settings').addEventListener('click', () => navigate('tools-settings'));
  root.querySelector('#today-city-btn')?.addEventListener('click', () => openCityPicker(root));
  root.querySelector('#today-month-btn')?.addEventListener('click', () => openMonthSchedule(engine, dateIso, tz));

  // 1 Hz ticker — formats only, never recomputes times (deterministic, cheap)
  const cd = root.querySelector('#hero-countdown');
  const timer = setInterval(() => {
    const left = next.at - nowMs();
    if (left <= -1500) { clearInterval(timer); renderToday(root); return; }
    cd.textContent = fmtHMS(left);
  }, 1000);
  // stop the ticker when the screen is replaced
  new MutationObserver(() => {
    if (!document.getElementById('hero-countdown')) clearInterval(timer);
  }).observe(root, { childList: true, subtree: true });
}

function openCityPicker(root) {
  const host = document.getElementById('sheet-root');
  host.innerHTML = `
  <div class="sheet-backdrop" id="sh-backdrop"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="اختر المدينة">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h2>تحديد المدينة (٦,٢٨٩ مدينة)</h2><button class="sheet-close" id="sh-close">✕</button></div>
    <div class="sheet-body">
      <input class="search-input" id="city-pick-input" type="search" placeholder="ابحث باسم المدينة بالعربية أو الإنجليزية…" autocomplete="off">
      <div id="city-pick-results" style="margin-top:10px"></div>
    </div>
  </div>`;
  const close = () => { host.innerHTML = ''; };
  host.querySelector('#sh-close').addEventListener('click', close);
  host.querySelector('#sh-backdrop').addEventListener('click', close);
  const input = host.querySelector('#city-pick-input');
  const resEl = host.querySelector('#city-pick-results');
  input.focus();
  let seq = 0;
  input.addEventListener('input', async () => {
    const my = ++seq;
    const q = input.value.trim();
    if (q.length < 2) { resEl.innerHTML = ''; return; }
    const { ftsQuery } = await import('../../../../../packages/core-data/engines/search.js');
    const rows = await state.db.query(
      `SELECT c.city_id, c.name_ar, c.country_ar, c.lat, c.lng, c.timezone FROM cities c
       WHERE c.rowid IN (SELECT rowid FROM fts_cities WHERE fts_cities MATCH ?) LIMIT 12`,
      [ftsQuery(q)]);
    if (my !== seq) return;
    resEl.innerHTML = rows.map((r) => `<div class="result-item" data-cid="${r.city_id}" role="button" tabindex="0">
      <div style="font-weight:700">${r.name_ar}</div>
      <div class="meta">${r.country_ar} · ${r.timezone}</div>
    </div>`).join('') || `<div class="mode-note">لا توجد نتائج مطابقة</div>`;
    for (const item of resEl.querySelectorAll('[data-cid]')) {
      item.addEventListener('click', async () => {
        const row = rows.find((r) => String(r.city_id) === item.dataset.cid);
        await saveSetting('location', { lat: row.lat, lng: row.lng, tz: row.timezone, name_ar: row.name_ar });
        close();
        renderToday(root);
      });
    }
  });
}

function openMonthSchedule(engine, startIso, tz) {
  const host = document.getElementById('sheet-root');
  const baseMs = Date.parse(`${startIso}T12:00:00Z`);
  const rows = Array.from({ length: 30 }, (_, i) => {
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(baseMs + i * 86_400_000);
    const s = engine.daySchedule(iso);
    return `<tr>
      <td>${iso.slice(5)}</td>
      <td>${fmtClock(s.prayers.fajr, tz)}</td>
      <td>${fmtClock(s.prayers.dhuhr, tz)}</td>
      <td>${fmtClock(s.prayers.asr, tz)}</td>
      <td>${fmtClock(s.prayers.maghrib, tz)}</td>
      <td>${fmtClock(s.prayers.isha, tz)}</td>
    </tr>`;
  }).join('');
  host.innerHTML = `
  <div class="sheet-backdrop" id="sh-backdrop"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="جدول الشهر">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h2>مواقيت ٣٠ يوماً</h2><button class="sheet-close" id="sh-close">✕</button></div>
    <div class="sheet-body" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;font-variant-numeric:tabular-nums">
        <thead><tr style="color:var(--color-accent);border-bottom:1px solid var(--color-border)">
          <th style="padding:6px">التاريخ</th><th>الفجر</th><th>الظهر</th><th>العصر</th><th>المغرب</th><th>العشاء</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
  const close = () => { host.innerHTML = ''; };
  host.querySelector('#sh-close').addEventListener('click', close);
  host.querySelector('#sh-backdrop').addEventListener('click', close);
}
