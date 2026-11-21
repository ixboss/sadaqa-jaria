// ============================================================================
// today.js — Today Hub (Phase 4): prayer hero countdown + daily schedule +
// Hijri date + Smart Context-Aware Card (ARCHITECTURE.md §9 resolution order:
// Friday Fajr–Jumu'ah → Al-Kahf; ±20 min post-prayer → after-prayer dhikr;
// Fajr window → morning athkar; Asr window → evening athkar; last third of
// night → Qiyam; else next-prayer details). Ticker formats only — deterministic
// engine values never recompute inside the 1 Hz loop. e2e clock hook:
// window.__sadaqa.state.clockOverride.
// ============================================================================
import { state, nowMs, haptic, prayerEngineForSettings, HAPTICS } from '../../app-state.js';
import { shiftCivilIso } from '../../../../../packages/core-data/engines/prayer.js';
import { formatTime12h } from '../../../../../packages/core-data/engines/timefmt.js';
import { computeDailyProgress } from '../../../../../packages/core-data/engines/today-progress.js';
import { monthNameAr, withAdjust } from '../../../../../packages/core-data/engines/hijri.js';
import { resolveSmartCard } from '../../../../../packages/core-data/engines/smart-card.js';
import { getGpsFix, findNearestCity, persistLocation } from '../geo.js';
import { navigate } from '../router.js';
import { iconSvg, prayerIconName, smartCardIconName } from '../icons.js';

const fmtClock = (ms, tz) => formatTime12h(ms, tz);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtHMS = (msLeft) => {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};
const PRAYER_LABELS = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
const DAY_LABELS = { Sunday: 'الأحد', Monday: 'الإثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت' };

// Today header dhikr pill — ambient session-only rotation (25s, tap to advance)
const DHIKR_PILL_TEXTS = ['لا إله إلا الله', 'سبحان الله وبحمده', 'الحمد لله', 'أستغفر الله', 'اللهم صلِّ على نبينا محمد'];
let dhikrIdx = 0;

// Active timers/observers cleanup per mount root (prevents leaked 1 Hz timers on re-render)
const activeCleanups = new WeakMap();
// Static bundled athkar catalog cache per DB instance (avoids re-scanning immutable tables)
const athkarCatalogCache = new WeakMap();

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
  if (kind === 'night' || kind === 'sleep' || kind === 'isha') {
    return db.queryOne(`SELECT category_id FROM athkar_categories WHERE solar_window IN ('night', 'isha') ORDER BY sort_order LIMIT 1`);
  }
  if (kind === 'after_prayer') {
    return db.queryOne(`SELECT category_id FROM athkar_categories WHERE solar_window = 'after_prayer' ORDER BY sort_order LIMIT 1`);
  }
  return null;
}

export { findNearestCity };

export async function searchCitiesOffline(db, rawQuery) {
  const q = String(rawQuery ?? '').trim();
  if (q.length < 2) {
    return db.query(
      `SELECT city_id, name_ar, country_ar, lat, lng, timezone
       FROM cities
       WHERE is_preseed = 1
       ORDER BY CASE WHEN country_en IN ('Egypt','Saudi Arabia','United Arab Emirates','Kuwait','Qatar','Jordan','Oman','Bahrain') THEN 0 ELSE 1 END,
                population DESC
       LIMIT 40`,
    );
  }
  const { ftsQuery } = await import('../../../../../packages/core-data/engines/search.js');
  let rows = [];
  const fts = ftsQuery(q);
  if (fts) {
    rows = await db.query(
      `SELECT c.city_id, c.name_ar, c.country_ar, c.lat, c.lng, c.timezone FROM cities c
       WHERE c.rowid IN (SELECT rowid FROM fts_cities WHERE fts_cities MATCH ?)
       ORDER BY c.population DESC LIMIT 16`,
      [fts],
    );
  }
  if (rows.length === 0) {
    const like = `%${q}%`;
    rows = await db.query(
      `SELECT city_id, name_ar, country_ar, lat, lng, timezone FROM cities
       WHERE name_ar LIKE ? OR name_en LIKE ?
       ORDER BY population DESC LIMIT 16`,
      [like, like],
    );
  }
  return rows;
}

/**
 * UI-layer fallback swap (the §9 engine stays parity-golden): when the
 * resolver would return next-prayer details — a duplicate of the hero
 * countdown directly above it — render a contextual daily action card.
 */
function contextualDailyCard(now, engine) {
  const card = resolveSmartCard(now, engine);
  if (card.kind !== 'next_prayer') return card;
  const tz = engine.opts.timeZone;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (hour >= 4 && hour < 11) {
    return { kind: 'daily_morning', adhkar: 'morning', badge: 'ورد اليوم', title: 'أذكار الصباح', sub: 'ما تيسّر من أذكار الصباح قبل انشغال النهار', action: { label: 'ابدأ أذكار الصباح', screen: 'adhkar-cat', args: {} } };
  }
  if (hour >= 11 && hour < 16) {
    return { kind: 'daily_hijri', badge: 'ورد اليوم', title: 'التقويم الهجري والأيام البيض', sub: 'الأشهر والمناسبات والأيام البيض من كل شهر هجري', action: { label: 'افتح التقويم', screen: 'tools-hijri', args: {} } };
  }
  if (hour >= 16 && hour < 20) {
    return { kind: 'daily_evening', adhkar: 'evening', badge: 'ورد اليوم', title: 'أذكار المساء', sub: 'ما تيسّر من أذكار المساء قبل غروب الشمس', action: { label: 'ابدأ أذكار المساء', screen: 'adhkar-cat', args: {} } };
  }
  return { kind: 'daily_sleep', adhkar: 'night', badge: 'قبل النوم', title: 'أذكار النوم', sub: 'الاستغفار والآيات الواقية قبل أن تنام', action: { label: 'افتح الأذكار', screen: 'adhkar-screen', args: {} } };
}

/** Load immutable bundled athkar categories/items once per DB instance. */
async function loadAthkarCatalog(db) {
  let cached = athkarCatalogCache.get(db);
  if (!cached) {
    cached = Promise.all([
      db.query(`SELECT category_id, solar_window FROM athkar_categories`),
      db.query(`SELECT item_id, category_id, count_target FROM athkar_items`),
    ]).then(([categories, items]) => ({ categories, items }));
    athkarCatalogCache.set(db, cached);
    cached.catch(() => athkarCatalogCache.delete(db));
  }
  return cached;
}

/** ورد اليوم — athkar-window completion for today via the shared golden engine. */
async function loadDailyProgress(db, now) {
  const dayKey = new Intl.DateTimeFormat('en-CA').format(now);
  const [{ categories, items }, states] = await Promise.all([
    loadAthkarCatalog(db),
    db.query(`SELECT item_id, count FROM adhkar_state WHERE day_key = ?`, [dayKey]),
  ]);
  return computeDailyProgress(categories, items, states).windows;
}

export async function renderToday(root) {
  // Always tear down any prior timers/observers bound to this root before re-rendering
  const prevCleanup = activeCleanups.get(root);
  if (prevCleanup) { prevCleanup(); activeCleanups.delete(root); }

  const engine = prayerEngineForSettings();
  const tz = engine.opts.timeZone;
  const now = nowMs();
  const daily = await loadDailyProgress(state.db, now);
  const windowsDone = daily.filter((w) => w.completed >= w.total).length;
  const khatmahPct = Math.round((state.progress.page / 604) * 100);
  let next = engine.next(now);
  let dateIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  const nextIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(next.at);
  let day = engine.daySchedule(dateIso);
  const qiyamIso = now < day.prayers.fajr
    ? shiftCivilIso(dateIso, -1)
    : dateIso;
  const windows = engine.sunnahWindows(qiyamIso);
  const locName = state.settings.location?.name_ar ?? 'مكة المكرمة';
  const hijri = withAdjust(dateIso, Number(state.settings.hijri_adjust ?? 0));
  const dowEn = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now);
  const gregText = new Intl.DateTimeFormat('ar', { timeZone: tz, day: 'numeric', month: 'long' }).format(now);
  const nextLabel = nextIso !== dateIso ? `${PRAYER_LABELS[next.name]} (غداً)` : PRAYER_LABELS[next.name];

  let card = contextualDailyCard(now, engine);
  root.innerHTML = `
  <div class="screen">
    <div class="screen-header">
      <div class="today-toprow">
        <div>
          <h1>اليوم</h1>
          <div class="sub" id="today-date-sub">${DAY_LABELS[dowEn]} · ${hijri.d} ${monthNameAr(hijri.m)} ${hijri.y} هـ · ${gregText}</div>
        </div>
        <div class="today-actions">
          <button class="city-pill icon-pill" id="today-search-btn" aria-label="بحث شامل" title="بحث في القرآن والأذكار">${iconSvg('search', 15)}</button>
          <button class="city-pill" id="today-city-btn" aria-label="تغيير المدينة">${iconSvg('location', 14)}<span>${esc(locName)}</span></button>
          <button class="city-pill dhikr-pill" id="today-dhikr" aria-label="الذكر التالي"><span class="dhikr-txt">${DHIKR_PILL_TEXTS[dhikrIdx % DHIKR_PILL_TEXTS.length]}</span></button>
        </div>
      </div>
    </div>

    <div class="card hub-hero" id="prayer-hero">
      <div class="hh-label">الصلاة القادمة</div>
      <div class="hh-name" id="hero-name">${nextLabel}</div>
      <div class="hh-clock" id="hero-countdown" dir="ltr">${fmtHMS(next.at - now)}</div>
      <div class="hh-at" id="hero-at">الأذان <span dir="ltr">${fmtClock(next.at, tz)}</span></div>
    </div>

    <div class="card smart-card" id="smart-card" data-kind="${esc(card.kind)}">
      <div class="sc-head">
        <div class="sc-icon">${iconSvg(smartCardIconName(card.kind), 18)}</div>
        <span class="sc-badge">${esc(card.badge)}</span>
      </div>
      <h3 class="sc-title">${esc(card.title)}</h3>
      <p class="sc-sub">${esc(card.sub)}</p>
      <button class="btn primary" id="sc-action">${esc(card.action.label)}</button>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0;font-size:15px">مواقيت اليوم</h3>
        <button class="city-pill" id="today-month-btn">جدول الشهر</button>
      </div>
      <div class="prayer-grid">
        ${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((n) => `
          <div class="prayer-row ${next.name === n ? 'next' : ''}" data-prayer="${n}">
            <span class="p-icon" aria-hidden="true">${iconSvg(prayerIconName(n), 17)}</span>
            <span class="p-name">${PRAYER_LABELS[n]}</span>
            <span class="p-time" dir="ltr">${fmtClock(day.prayers[n], tz)}</span>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:15px">تطبيقاتك اليومية</h3>
      <div class="quick-apps-grid">
        <button class="qa-btn" data-go="tasbih-screen"><span class="qa-ico">${iconSvg('tasbih', 20)}</span><span>السبحة</span></button>
        <button class="qa-btn" data-go="adhkar-screen"><span class="qa-ico">${iconSvg('athkar', 20)}</span><span>الأذكار</span></button>
        <button class="qa-btn" data-go="mushaf-surah-index"><span class="qa-ico">${iconSvg('mushaf', 20)}</span><span>الفهرس</span></button>
        <button class="qa-btn" data-go="tools-qibla"><span class="qa-ico">${iconSvg('qibla', 20)}</span><span>القبلة</span></button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:15px">قيام الليل</h3>
      <div id="today-qiyam-body" style="font-size:14px;line-height:2">
        منتصف الليل: <strong dir="ltr" style="font-variant-numeric:tabular-nums">${fmtClock(windows.midnight, tz)}</strong><br>
        الثلث الأخير: <strong dir="ltr" style="font-variant-numeric:tabular-nums">${fmtClock(windows.lastThird, tz)}</strong> — حتى الفجر <span dir="ltr">${fmtClock(windows.nextFajr, tz)}</span>
      </div>
    </div>

    <div class="card" id="daily-progress-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0;font-size:15px">ورد اليوم</h3>
        <span class="badge on">${windowsDone} / ${daily.length} أوراد</span>
      </div>
      ${daily.map((w) => `
      <div class="dp-row">
        <span class="dp-title">${w.titleAr}</span>
        <span class="dp-bar"><span class="dp-fill" style="width:${w.total > 0 ? Math.round((w.completed / w.total) * 100) : 0}%"></span></span>
        <span class="dp-count">${w.completed}/${w.total}</span>
      </div>`).join('')}
      <div class="dp-khatmah">الختمة: ${khatmahPct}٪ (صفحة ${state.progress.page} من ٦٠٤)</div>
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
    if (['morning', 'evening', 'after_prayer', 'night', 'sleep'].includes(card.kind) || card.adhkar) {
      const cat = await resolveAdhkarCategory(state.db, card.adhkar ?? card.kind);
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
  root.querySelector('#today-search-btn')?.addEventListener('click', async () => {
    const { renderSearchSheet } = await import('./search.js');
    renderSearchSheet();
  });
  root.querySelector('#today-month-btn')?.addEventListener('click', () => openMonthSchedule(engine, dateIso, tz));

  // Unified cleanup for all Today timers and observers (no subtree observation on 1 Hz ticks)
  let dTimer = null;
  let dSwapTimer = null;
  let timer = null;
  let rootObs = null;
  const cleanup = () => {
    if (dTimer !== null) { clearInterval(dTimer); dTimer = null; }
    if (dSwapTimer !== null) { clearTimeout(dSwapTimer); dSwapTimer = null; }
    if (timer !== null) { clearInterval(timer); timer = null; }
    if (rootObs !== null) { rootObs.disconnect(); rootObs = null; }
  };
  activeCleanups.set(root, cleanup);

  // dhikr pill — 25s ambient rotation, tap advances; swap = fade/slide via .swapping
  const dhikrBtn = root.querySelector('#today-dhikr');
  if (dhikrBtn) {
    const dhikrTxt = dhikrBtn.querySelector('.dhikr-txt');
    const swapDhikr = () => {
      dhikrBtn.classList.add('swapping');
      if (dSwapTimer !== null) clearTimeout(dSwapTimer);
      dSwapTimer = setTimeout(() => {
        dSwapTimer = null;
        if (!dhikrBtn.isConnected) return;
        dhikrIdx++;
        dhikrTxt.textContent = DHIKR_PILL_TEXTS[dhikrIdx % DHIKR_PILL_TEXTS.length];
        dhikrBtn.classList.remove('swapping');
      }, 330);
    };
    dhikrBtn.addEventListener('click', () => { haptic(HAPTICS.dhikrTick); swapDhikr(); });
    dTimer = setInterval(() => {
      if (!dhikrBtn.isConnected) { cleanup(); return; }
      swapDhikr();
    }, 25000);
  }

  // 1 Hz ticker — formats only; on prayer boundary rolls over in-place with zero DB reads / full re-render
  const cd = root.querySelector('#hero-countdown');
  const heroNameEl = root.querySelector('#hero-name');
  const heroAtEl = root.querySelector('#hero-at');
  const smartCardEl = root.querySelector('#smart-card');
  const prayerRows = [...root.querySelectorAll('.prayer-row[data-prayer]')];

  const syncRolloverInPlace = (curNow) => {
    const updatedNext = engine.next(curNow);
    if (updatedNext.at <= curNow) return; // guard against frozen clockOverride
    next = updatedNext;
    const curDateIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(curNow);
    const updatedNextIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(next.at);
    if (heroNameEl) heroNameEl.textContent = updatedNextIso !== curDateIso ? `${PRAYER_LABELS[next.name]} (غداً)` : PRAYER_LABELS[next.name];
    if (heroAtEl) heroAtEl.innerHTML = `الأذان <span dir="ltr">${fmtClock(next.at, tz)}</span>`;
    if (curDateIso !== dateIso) {
      dateIso = curDateIso;
      day = engine.daySchedule(dateIso);
      const qIso = curNow < day.prayers.fajr ? shiftCivilIso(dateIso, -1) : dateIso;
      const w = engine.sunnahWindows(qIso);
      const qBody = root.querySelector('#today-qiyam-body');
      if (qBody) {
        qBody.innerHTML = `منتصف الليل: <strong dir="ltr" style="font-variant-numeric:tabular-nums">${fmtClock(w.midnight, tz)}</strong><br>`
          + `الثلث الأخير: <strong dir="ltr" style="font-variant-numeric:tabular-nums">${fmtClock(w.lastThird, tz)}</strong> — حتى الفجر <span dir="ltr">${fmtClock(w.nextFajr, tz)}</span>`;
      }
      const h = withAdjust(dateIso, Number(state.settings.hijri_adjust ?? 0));
      const dEn = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(curNow);
      const gTxt = new Intl.DateTimeFormat('ar', { timeZone: tz, day: 'numeric', month: 'long' }).format(curNow);
      const subEl = root.querySelector('#today-date-sub');
      if (subEl) subEl.textContent = `${DAY_LABELS[dEn]} · ${h.d} ${monthNameAr(h.m)} ${h.y} هـ · ${gTxt}`;
      for (const row of prayerRows) {
        const p = row.dataset.prayer;
        const tEl = row.querySelector('.p-time');
        if (tEl && day.prayers[p] !== undefined) tEl.textContent = fmtClock(day.prayers[p], tz);
      }
    }
    for (const row of prayerRows) row.classList.toggle('next', row.dataset.prayer === next.name);
    card = contextualDailyCard(curNow, engine);
    if (smartCardEl) {
      smartCardEl.dataset.kind = card.kind;
      const ico = smartCardEl.querySelector('.sc-icon');
      const badge = smartCardEl.querySelector('.sc-badge');
      const title = smartCardEl.querySelector('.sc-title');
      const sub = smartCardEl.querySelector('.sc-sub');
      const act = smartCardEl.querySelector('#sc-action');
      if (ico) ico.innerHTML = iconSvg(smartCardIconName(card.kind), 18);
      if (badge) badge.textContent = card.badge;
      if (title) title.textContent = card.title;
      if (sub) sub.textContent = card.sub;
      if (act) act.textContent = card.action.label;
    }
  };

  timer = setInterval(() => {
    if (!cd.isConnected) { cleanup(); return; }
    const curNow = nowMs();
    let left = next.at - curNow;
    if (left <= -1500) {
      syncRolloverInPlace(curNow);
      left = next.at - curNow;
    }
    cd.textContent = fmtHMS(left);
  }, 1000);

  // Stop timers only when the screen root's direct children are replaced (not on subtree text ticks)
  rootObs = new MutationObserver(() => {
    if (!cd.isConnected) cleanup();
  });
  rootObs.observe(root, { childList: true });
}

function openCityPicker(root) {
  const host = document.getElementById('sheet-root');
  host.innerHTML = `
  <div class="sheet-backdrop" id="sh-backdrop"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="اختر المدينة">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h2>تحديد المدينة</h2><button class="sheet-close" id="sh-close" aria-label="إغلاق">${iconSvg('close', 18)}</button></div>
    <div class="sheet-body">
      <button class="btn primary" id="city-gps-btn" style="width:100%;margin-bottom:10px">${iconSvg('location', 16)}<span>تحديد الموقع تلقائياً (GPS)</span></button>
      <div id="city-gps-status" class="mode-note" style="margin-bottom:8px" hidden></div>
      <input class="search-input" id="city-pick-input" type="search" placeholder="بحث باسم المدينة" autocomplete="off">
      <div id="city-pick-results" style="margin-top:10px"></div>
    </div>
  </div>`;
  const close = () => {
    host.querySelector('.sheet')?.classList.add('closing');
    host.querySelector('.sheet-backdrop')?.classList.add('closing');
    setTimeout(() => { host.innerHTML = ''; }, 200);
  };
  host.querySelector('#sh-close').addEventListener('click', close);
  host.querySelector('#sh-backdrop').addEventListener('click', close);
  const input = host.querySelector('#city-pick-input');
  const resEl = host.querySelector('#city-pick-results');
  const gpsBtn = host.querySelector('#city-gps-btn');
  const gpsStatus = host.querySelector('#city-gps-status');

  const chooseCity = async (row, gps = null) => {
    await persistLocation(row, gps);
    haptic([15, 40, 15]);
    close();
    renderToday(root);
  };

  let seq = 0;
  const loadList = async (q) => {
    const my = ++seq;
    const rows = await searchCitiesOffline(state.db, q);
    if (my !== seq) return;
    const heading = q.trim().length < 2
      ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px">المدن الشائعة والعواصم</div>`
      : '';
    resEl.innerHTML = heading + (rows.map((r) => `<div class="result-item" data-cid="${esc(r.city_id)}" role="button" tabindex="0">
      <div style="font-weight:700">${esc(r.name_ar)}</div>
      <div class="meta">${esc(r.country_ar)} · ${esc(r.timezone)}</div>
    </div>`).join('') || `<div class="mode-note">لا توجد نتائج مطابقة</div>`);
    for (const item of resEl.querySelectorAll('[data-cid]')) {
      const pick = () => {
        const row = rows.find((r) => String(r.city_id) === item.dataset.cid);
        if (row) chooseCity(row);
      };
      item.addEventListener('click', pick);
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }
  };

  gpsBtn.addEventListener('click', async () => {
    gpsBtn.disabled = true;
    gpsStatus.hidden = false;
    gpsStatus.textContent = 'جاري تحديد موقعك…';
    try {
      const fix = await getGpsFix();
      const nearest = await findNearestCity(state.db, fix.lat, fix.lng);
      if (!nearest) {
        gpsStatus.textContent = 'تعذر مطابقة الإحداثيات مع قاعدة المدن — اختر مدينتك من القائمة.';
        return;
      }
      await chooseCity(nearest, fix);
    } catch (err) {
      gpsStatus.textContent = err?.message ?? 'تعذر تحديد الموقع — يمكنك البحث أو الاختيار من القائمة أدناه.';
    } finally {
      gpsBtn.disabled = false;
    }
  });

  loadList('');
  input.addEventListener('input', () => loadList(input.value));
}

function openMonthSchedule(engine, startIso, tz) {
  const host = document.getElementById('sheet-root');
  const baseMs = Date.parse(`${startIso}T12:00:00Z`);
  const rows = Array.from({ length: 30 }, (_, i) => {
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(baseMs + i * 86_400_000);
    const s = engine.daySchedule(iso);
    return `<tr>
      <td>${iso.slice(5)}</td>
      <td dir="ltr">${fmtClock(s.prayers.fajr, tz)}</td>
      <td dir="ltr">${fmtClock(s.prayers.dhuhr, tz)}</td>
      <td dir="ltr">${fmtClock(s.prayers.asr, tz)}</td>
      <td dir="ltr">${fmtClock(s.prayers.maghrib, tz)}</td>
      <td dir="ltr">${fmtClock(s.prayers.isha, tz)}</td>
    </tr>`;
  }).join('');
  host.innerHTML = `
  <div class="sheet-backdrop" id="sh-backdrop"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="جدول الشهر">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h2>مواقيت ٣٠ يوماً</h2><button class="sheet-close" id="sh-close" aria-label="إغلاق">${iconSvg('close', 18)}</button></div>
    <div class="sheet-body" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:center;font-variant-numeric:tabular-nums">
        <thead><tr style="color:var(--color-accent);border-bottom:1px solid var(--color-border)">
          <th style="padding:6px">التاريخ</th><th>الفجر</th><th>الظهر</th><th>العصر</th><th>المغرب</th><th>العشاء</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
  const close = () => {
    host.querySelector('.sheet')?.classList.add('closing');
    host.querySelector('.sheet-backdrop')?.classList.add('closing');
    setTimeout(() => { host.innerHTML = ''; }, 200);
  };
  host.querySelector('#sh-close').addEventListener('click', close);
  host.querySelector('#sh-backdrop').addEventListener('click', close);
}
