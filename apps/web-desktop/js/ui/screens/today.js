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

  const card = resolveSmartCard(now, engine);
  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>اليوم</h1><div class="sub">${DAY_LABELS[dowEn]} · ${hijri.d} ${monthNameAr(hijri.m)} ${hijri.y} هـ · ${locName}</div></div>

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
      <h3 style="margin:0 0 10px;font-size:15px">مواقيت اليوم</h3>
      ${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((n) => `
        <div class="prayer-row ${next.name === n ? 'next' : ''}" data-prayer="${n}">
          <span class="p-name">${PRAYER_LABELS[n]}</span><span class="p-time">${fmtClock(day.prayers[n], tz)}</span>
        </div>`).join('')}
    </div>

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:15px">قيام الليل</h3>
      <div style="font-size:14px;line-height:2">
        منتصف الليل: <strong style="font-variant-numeric:tabular-nums">${fmtClock(windows.midnight, tz)}</strong><br>
        الثلث الأخير: <strong style="font-variant-numeric:tabular-nums">${fmtClock(windows.lastThird, tz)}</strong> — حتى الفجر ${fmtClock(windows.nextFajr, tz)}
      </div>
    </div>

    <div class="card">
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
  root.querySelector('#t-read').addEventListener('click', () => navigate('mushaf-page', { page: state.progress.page }));
  root.querySelector('#t-khatmah').addEventListener('click', () => navigate('mushaf-khatmah'));
  root.querySelector('#t-settings').addEventListener('click', () => navigate('tools-settings'));

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
