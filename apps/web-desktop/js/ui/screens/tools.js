// ============================================================================
// tools.js — Phase 4 tools: hub tiles, offline Qibla compass (DeviceOrientation
// + manual-dial fallback), Hijri calendar & events & White Days, Zakat
// calculator, Qiyam calculator/planner, settings (theme/location/method).
// Engines are the shared packages/core-data ones — UI never re-implements math.
// ============================================================================
import { state, saveSetting, nowMs, haptic } from '../../app-state.js';
import { prayerEngineForSettings } from '../../app-state.js';
import { qiblaBearing, distanceKm } from '../../../../../packages/core-data/engines/qibla.js';
import { toHijri, fromHijri, monthNameAr, events, withAdjust } from '../../../../../packages/core-data/engines/hijri.js';
import { CALC_METHODS, MADHABS, HIGH_LATITUDE_RULES } from '../../../../../packages/core-data/engines/prayer.js';
import { navigate } from '../router.js';
import { iconSvg } from '../icons.js';
import { mountTheme } from '../../main.js';
import { renderBackup } from './backup.js';
import { findNearestCity, searchCitiesOffline } from './today.js';
import { getGpsFix, persistLocation } from '../geo.js';

const fmtClock = (ms, tz) => new Intl.DateTimeFormat('ar', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);

const TOOLS = [
  { screen: 'tools-qibla', icon: 'qibla', name: 'اتجاه القبلة', sub: 'بوصلة تعمل دون اتصال + قرص يدوي' },
  { screen: 'tools-hijri', icon: 'calendar', name: 'التقويم الهجري', sub: 'الأشهر والأيام البيض والمناسبات' },
  { screen: 'tools-zakat', icon: 'scale', name: 'حاسبة الزكاة', sub: 'نقود وذهب وفضة وعروض' },
  { screen: 'tools-qiyam', icon: 'moon', name: 'حاسبة القيام', sub: 'الثلث الأخير وتخطيط النوم' },
  { screen: 'tools-backup', icon: 'backup', name: 'النسخ الاحتياطي', sub: 'تصدير واستيراد .sadaqa' },
  { screen: 'tools-settings', icon: 'settings', name: 'الإعدادات', sub: 'الموقع والمذهب والسمة والخط' },
];

export function renderTools(root) {
  const loc = state.settings.location?.name_ar ?? 'مكة المكرمة';
  const themeLabel = { dark: 'داكنة', light: 'فاتحة', sepia: 'ورقية', night: 'ليلية' }[state.settings.theme ?? 'dark'] ?? 'داكنة';
  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>الأدوات</h1><div class="sub">${loc} · سمة ${themeLabel}</div></div>
    <div id="tool-list" class="tools-bento">${TOOLS.map((t) => `
      <div class="tool-tile" data-screen="${t.screen}" role="button" tabindex="0" aria-label="${t.name}">
        <span class="t-icon">${iconSvg(t.icon, 20)}</span>
        <div>
          <div class="t-name">${t.name}</div>
          <div class="t-sub">${t.sub}</div>
        </div>
      </div>`).join('')}</div>
  </div>`;
  for (const el of root.querySelectorAll('.tool-tile')) {
    el.addEventListener('click', () => navigate(el.dataset.screen));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(el.dataset.screen); } });
  }
}

// ---------------------------------------------------------------------------
// Qibla — engine bearing + live compass (absolute heading when available),
// manual dial fallback otherwise. No network, no geolocation service.
// ---------------------------------------------------------------------------
export function renderQibla(root) {
  const loc = state.settings.location ?? { lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh', name_ar: 'مكة المكرمة' };
  // bearing from the live GPS fix when one is saved, else the selected city
  const src = loc.gps ?? loc;
  const bearing = qiblaBearing({ lat: src.lat, lng: src.lng });
  const dist = distanceKm({ lat: src.lat, lng: src.lng });
  const srcLabel = loc.gps ? 'موقعك الحالي (GPS)' : (loc.cityId ? loc.name_ar : `${loc.name_ar} — افتراضي، حدّد موقعك`);
  const degenerate = dist < 5;

  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>اتجاه القبلة</h1><div class="sub">${srcLabel} — ${bearing.toFixed(1)}° من الشمال · ${Math.round(dist).toLocaleString('ar-EG')} كم إلى الكعبة</div></div>
    <div class="card">
      <div class="qibla-wrap"><div class="qibla-dial" id="q-dial"></div></div>
      <div class="qibla-heading"><span id="q-reading">—</span></div>
      <div class="compass-btns" id="q-manual" hidden>
        <button class="btn" id="q-minus" aria-label="دوران عكس عقارب الساعة">−</button>
        <span class="deg" id="q-north">الشمال: 0°</span>
        <button class="btn" id="q-plus" aria-label="دوران مع عقارب الساعة">+</button>
      </div>
      <div class="qibla-note" id="q-note">${degenerate
        ? 'موقعك قريب جداً من الكعبة — داخل الحرم تُقدَّر القبلة باتجاه الكعبة نفسه.'
        : 'وجّه علامة الشمال (▲) نحو الشمال الحقيقي؛ تظهر قببة الكعبة عند اتجاه القبلة.'}</div>
      <div class="row-actions" style="justify-content:center">
        <button class="btn primary" id="q-compass">تشغيل البوصلة</button>
        <button class="btn" id="q-dial-mode">القرص اليدوي</button>
        <button class="btn" id="q-gps">${iconSvg('location', 15)}<span>تحديد موقعي (GPS)</span></button>
      </div>
    </div>
  </div>`;

  const NS = 'http://www.w3.org/2000/svg';
  const dialEl = root.querySelector('#q-dial');
  let northDeg = 0; // live heading offset (compass) or manual offset
  let live = false;
  let alignedPulse = false;

  // Build SVG once and update only group transforms on 60Hz sensor events
  dialEl.innerHTML = '';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  const mk = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
  const outerRing = mk('circle', { cx: 100, cy: 100, r: 96, fill: 'var(--color-surface-raised)', stroke: 'var(--color-border)', 'stroke-width': 2 });
  svg.appendChild(outerRing);
  for (let d = 0; d < 360; d += 15) {
    const a = (d * Math.PI) / 180;
    const major = d % 45 === 0;
    const r1 = major ? 84 : 90;
    svg.appendChild(mk('line', {
      x1: 100 + r1 * Math.sin(a), y1: 100 - r1 * Math.cos(a),
      x2: 100 + 96 * Math.sin(a), y2: 100 - 96 * Math.cos(a),
      stroke: 'var(--color-border)', 'stroke-width': major ? 2 : 1,
    }));
  }
  const northG = mk('g', { id: 'q-north-g' });
  northG.appendChild(mk('polygon', { points: '100,8 94,22 106,22', fill: 'var(--color-text-primary)' }));
  northG.appendChild(mk('text', { x: 100, y: 36, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--color-text-primary)' })).textContent = 'ش';
  svg.appendChild(northG);
  const kabG = mk('g', { id: 'q-kaaba-g' });
  kabG.appendChild(mk('path', {
    d: 'M100 44 l10 6 v12 l-10 6 -10 -6 v-12 z',
    fill: 'var(--color-accent)', stroke: 'var(--color-accent-contrast)', 'stroke-width': 1.5,
  }));
  svg.appendChild(kabG);
  svg.appendChild(mk('circle', { cx: 100, cy: 100, r: 5, fill: 'var(--color-text-secondary)' }));
  dialEl.appendChild(svg);

  function paint() {
    northG.setAttribute('transform', `rotate(${-northDeg} 100 100)`);
    kabG.setAttribute('transform', `rotate(${bearing - northDeg} 100 100)`);
    const rel = ((bearing - northDeg + 360) % 360);
    const delta = ((bearing - northDeg + 540) % 360) - 180;
    const isAligned = live && Math.abs(delta) <= 5;
    outerRing.setAttribute('stroke', isAligned ? 'var(--color-accent)' : 'var(--color-border)');
    if (isAligned && !alignedPulse) {
      alignedPulse = true;
      haptic([15, 30, 15]);
    } else if (!isAligned) {
      alignedPulse = false;
    }
    const reading = root.querySelector('#q-reading');
    if (reading) reading.textContent = `${rel.toFixed(1)}°`;
    const northEl = root.querySelector('#q-north');
    if (northEl) northEl.textContent = `الشمال: ${Math.round(northDeg)}°`;
  }
  paint();

  function setHeading(deg) {
    northDeg = ((deg % 360) + 360) % 360;
    paint();
  }

  let headingHandler = null;
  function stopCompassListeners() {
    if (headingHandler) {
      window.removeEventListener('deviceorientationabsolute', headingHandler, true);
      window.removeEventListener('deviceorientation', headingHandler, true);
      headingHandler = null;
    }
  }

  const manualBox = root.querySelector('#q-manual');
  root.querySelector('#q-dial-mode').addEventListener('click', () => {
    live = false;
    stopCompassListeners();
    manualBox.hidden = false;
    root.querySelector('#q-note').textContent = 'الوضع اليدوي: ضع الهاتف موازياً للأرض وأدر القرص حتى تتحاذى علامة الشمال مع الشمال الحقيقي.';
    haptic([10]);
    paint();
  });
  root.querySelector('#q-minus').addEventListener('click', () => setHeading(northDeg - 1));
  root.querySelector('#q-plus').addEventListener('click', () => setHeading(northDeg + 1));

  root.querySelector('#q-gps')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const note = root.querySelector('#q-note');
    try {
      const fix = await getGpsFix();
      const nearest = await findNearestCity(state.db, fix.lat, fix.lng);
      if (!nearest) throw new Error('تعذر مطابقة الإحداثيات مع قاعدة المدن.');
      await persistLocation(nearest, fix);
      haptic([15, 40, 15]);
      renderQibla(root); // re-render from the new saved coords
    } catch (err) {
      if (note) note.textContent = err?.message ?? 'تعذر تحديد الموقع.';
      btn.disabled = false;
    }
  });

  root.querySelector('#q-compass').addEventListener('click', async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') throw new Error('permission denied');
      }
      stopCompassListeners();
      headingHandler = (e) => {
        const abs = e.absolute === true && typeof e.alpha === 'number' ? e.alpha : null;
        const webkit = typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : null;
        const heading = webkit ?? (abs !== null ? 360 - abs : null);
        if (heading === null) return;
        live = true;
        manualBox.hidden = true;
        const delta = ((bearing - heading + 540) % 360) - 180;
        const qNote = root.querySelector('#q-note');
        if (qNote) {
          qNote.textContent = Math.abs(delta) <= 5
            ? 'باتجاه القبلة الصحيح'
            : 'البوصلة الحيّة تعمل — أبقِ الجهاز مستوياً.';
        }
        setHeading(heading);
      };
      window.addEventListener('deviceorientationabsolute', headingHandler, true);
      window.addEventListener('deviceorientation', headingHandler, true);
      const qNote = root.querySelector('#q-note');
      if (qNote) qNote.textContent = 'حرّك الجهاز بحركة ٨ لمعايرة البوصلة…';
    } catch {
      manualBox.hidden = false;
      const qNote = root.querySelector('#q-note');
      if (qNote) qNote.textContent = 'لا يوجد مستشعر بوصلة على هذا الجهاز — استخدم القرص اليدوي.';
    }
  });

  const qObs = new MutationObserver(() => {
    if (!document.getElementById('q-dial')) {
      stopCompassListeners();
      qObs.disconnect();
    }
  });
  qObs.observe(root, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Hijri calendar + events + White Days
// ---------------------------------------------------------------------------
export function renderHijriCalendar(root) {
  const today = withAdjust(new Intl.DateTimeFormat('en-CA').format(new Date(nowMs())), Number(state.settings.hijri_adjust ?? 0));
  const view = { y: today.y, m: today.m };
  const EV_LABEL = { ramadan_start: 'بداية رمضان', eid_fitr: 'عيد الفطر', arafah: 'يوم عرفة', eid_adha: 'عيد الأضحى', ashura: 'يوم عاشوراء' };

  function monthCells() {
    const first = fromHijri({ y: view.y, m: view.m, d: 1 });
    let len = 29;
    try { fromHijri({ y: view.y, m: view.m, d: 30 }); len = 30; } catch { /* 29-day month */ }
    const [gy, gm, gd] = first.split('-').map(Number);
    // weekday of the 1st (0=Sunday) — computed in UTC to match fromHijri anchoring
    const dowFirst = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
    const cells = [...Array(dowFirst).fill(null)];
    for (let d = 1; d <= len; d++) cells.push(d);
    return { cells, len, first };
  }

  function eventsInView() {
    const [gy] = monthCells().first.split('-').map(Number);
    const out = [];
    for (const y of [gy - 1, gy, gy + 1]) {
      for (const ev of events(y)) {
        const h = toHijri(ev.gregorian);
        if (h.y === view.y && h.m === view.m) out.push({ ...ev, day: h.d });
      }
    }
    return out.sort((a, b) => a.day - b.day);
  }

  function paint() {
    const { cells, len } = monthCells();
    const evs = eventsInView();
    const evDays = new Set(evs.map((e) => e.day));
    const isWhite = (d) => d === 13 || d === 14 || d === 15;
    root.innerHTML = `
    <div class="screen">
      <div class="screen-header"><h1>التقويم الهجري</h1><div class="sub">تقويم أم القرى — الأحد بداية الأسبوع</div></div>
      <div class="card">
        <div class="hc-head">
          <button class="btn" id="hc-prev" aria-label="الشهر السابق">${iconSvg('chevron-right', 16)}</button>
          <strong style="font-size:17px">${monthNameAr(view.m)} ${view.y} هـ</strong>
          <button class="btn" id="hc-next" aria-label="الشهر التالي">${iconSvg('chevron-left', 16)}</button>
        </div>
        <div class="hc-grid">
          ${['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((d) => `<div class="hc-dow">${d}</div>`).join('')}
          ${cells.map((d) => d === null ? '<div></div>' : `
            <div class="hc-cell ${d === today.d && view.m === today.m && view.y === today.y ? 'today' : ''} ${evDays.has(d) ? 'evday' : ''} ${isWhite(d) ? 'whday' : ''}" ${evDays.has(d) ? `title="${EV_LABEL[evs.find((e) => e.day === d).key]}"` : ''}>${d}</div>`).join('')}
        </div>
        <div class="hc-events" id="hc-events">
          <h3 style="margin:8px 0;font-size:14px">مناسبات الشهر والأيام البيض</h3>
          ${(evs.length ? evs.map((e) => `<div class="ev"><span>${EV_LABEL[e.key]}</span><span class="badge on">${e.day} ${monthNameAr(view.m)}</span></div>`).join('')
            : '<div style="font-size:13px;color:var(--color-text-secondary);padding:6px 0">لا مناسبات في هذا الشهر.</div>')}
          ${[13, 14, 15].filter((d) => d <= len).map((d) => `<div class="ev"><span>اليوم الأبيض ${d}</span><span class="badge">صيام مستحب</span></div>`).join('')}
        </div>
      </div>
    </div>`;
    root.querySelector('#hc-prev').addEventListener('click', () => { view.m--; if (view.m < 1) { view.m = 12; view.y--; } paint(); });
    root.querySelector('#hc-next').addEventListener('click', () => { view.m++; if (view.m > 12) { view.m = 1; view.y++; } paint(); });
  }
  paint();
}

// ---------------------------------------------------------------------------
// Zakat calculator — user supplies prices (offline; no live rates by design)
// ---------------------------------------------------------------------------
export function renderZakat(root) {
  const saved = state.settings.zakat_inputs ?? {};
  const F = [
    ['cash', 'النقود (النقد والودائع)', 'number'],
    ['goldGrams', 'الذهب (غرام)', 'number'],
    ['silverGrams', 'الفضة (غرام)', 'number'],
    ['goodsValue', 'قيمة العروض التجارية', 'number'],
    ['debts', 'الديون المستحقة عليك', 'number'],
    ['goldPrice', 'سعر جرام الذهب الآن', 'number'],
    ['silverPrice', 'سعر جرام الفضة الآن', 'number'],
  ];
  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>حاسبة الزكاة</h1><div class="sub">الزكاة ٢.٥٪ · الحولان تحسبها بنفسك — الأسعار تُدخل يدوياً (لا أسعار حية)</div></div>
    <div class="card">
      ${F.map(([k, label]) => `
        <div class="field"><label>${label}</label><input id="z-${k}" type="number" min="0" step="any" inputmode="decimal" value="${saved[k] ?? ''}"></div>`).join('')}
      <div class="field"><label>معيار النصاب</label>
        <select id="z-nisab">
          <option value="silver" ${(saved.nisab ?? state.settings.nisab_standard) === 'silver' ? 'selected' : ''}>الفضة — ٥٩٥ غرام (أكثر احتياطاً)</option>
          <option value="gold" ${saved.nisab === 'gold' ? 'selected' : ''}>الذهب — ٨٥ غرام</option>
        </select></div>
      <div class="row-actions"><button class="btn primary" id="z-calc">احسب الزكاة</button></div>
      <div class="calc-out" id="z-out" hidden></div>
    </div>
  </div>`;
  const out = root.querySelector('#z-out');
  root.querySelector('#z-calc').addEventListener('click', () => {
    const v = {};
    for (const [k] of F) v[k] = Math.max(0, Number(root.querySelector(`#z-${k}`).value) || 0);
    v.nisab = root.querySelector('#z-nisab').value;
    const nisabValue = v.nisab === 'gold' ? 85 * v.goldPrice : 595 * v.silverPrice;
    const wealth = v.cash + v.goldGrams * v.goldPrice + v.silverGrams * v.silverPrice + v.goodsValue - v.debts;
    const due = wealth >= nisabValue ? wealth * 0.025 : 0;
    const fmt = (n) => Math.round(n).toLocaleString('ar-EG');
    out.hidden = false;
    out.innerHTML = `
      <div class="stat-row"><span>إجمالي المال الزكوي</span><span class="v">${fmt(wealth)}</span></div>
      <div class="stat-row"><span>قيمة النصاب</span><span class="v">${fmt(nisabValue)}</span></div>
      <div class="stat-row"><span>${wealth >= nisabValue ? 'الزكاة الواجبة (٢.٥٪)' : 'الحالة'}</span><span class="v">${wealth >= nisabValue ? fmt(due) : 'لا زكاة — دون النصاب'}</span></div>
      ${wealth >= nisabValue ? `<div class="big" style="margin-top:10px">${fmt(due)}</div>` : ''}`;
    saveSetting('zakat_inputs', v);
    haptic([10]);
  });
}

// ---------------------------------------------------------------------------
// Qiyam calculator — tonight's windows + sleep planner
// ---------------------------------------------------------------------------
export function renderQiyam(root) {
  const engine = prayerEngineForSettings();
  const tz = engine.opts.timeZone;
  const now = nowMs();
  const iso = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(ms);
  const today = engine.sunnahWindows(iso(now));
  const yest = engine.sunnahWindows(iso(now - 86_400_000));
  // "tonight" = the night whose last third has not ended yet
  const tonight = now < yest.nextFajr ? yest : today;

  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>حاسبة القيام</h1><div class="sub">الثلث الأخير من الليل — فاز بمن قام فيه</div></div>
    <div class="card">
      <h3 style="margin:0 0 10px;font-size:15px">هذه الليلة</h3>
      <div style="font-size:14px;line-height:2">
        منتصف الليل: <strong style="font-variant-numeric:tabular-nums">${fmtClock(tonight.midnight, tz)}</strong><br>
        بداية الثلث الأخير: <strong style="font-variant-numeric:tabular-nums">${fmtClock(tonight.lastThird, tz)}</strong><br>
        حتى الفجر: <strong style="font-variant-numeric:tabular-nums">${fmtClock(tonight.nextFajr, tz)}</strong>
      </div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 10px;font-size:15px">مخطط النوم للقيام</h3>
      <div class="field"><label>أريد الاستيقاظ قبل الفجر بـ (دقائق)</label><input id="qy-before" type="number" min="0" max="180" value="20"></div>
      <div class="field"><label>مدة النوم المناسبة (ساعات)</label><input id="qy-hours" type="number" min="1" max="12" step="0.5" value="6"></div>
      <div class="row-actions"><button class="btn primary" id="qy-calc">احسب موعد النوم</button></div>
      <div class="calc-out" id="qy-out" hidden></div>
    </div>
  </div>`;

  root.querySelector('#qy-calc').addEventListener('click', () => {
    const rawBefore = Number(root.querySelector('#qy-before').value);
    const rawHours = Number(root.querySelector('#qy-hours').value);
    const before = Number.isFinite(rawBefore) ? Math.max(0, rawBefore) : 20;
    const hours = Number.isFinite(rawHours) ? Math.max(1, rawHours) : 6;
    const wake = tonight.nextFajr - before * 60_000;
    const bedtime = wake - hours * 3_600_000;
    const inLastThird = wake >= tonight.lastThird;
    const fmtFull = (ms) => new Intl.DateTimeFormat('ar', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
    const out = root.querySelector('#qy-out');
    out.hidden = false;
    out.innerHTML = `
      <div class="stat-row"><span>موعد النوم</span><span class="v">${fmtFull(bedtime)}</span></div>
      <div class="stat-row"><span>موعد الاستيقاظ</span><span class="v">${fmtFull(wake)} · ${inLastThird ? 'داخل الثلث الأخير' : 'قبل الثلث الأخير'}</span></div>
      <div class="mode-note">الاستيقاظ داخل الثلث الأخير أفضل؛ إن تعب جسدك فالنوم الكافي مقدم على قيام مُتعِب.</div>`;
  });
}

// ---------------------------------------------------------------------------
// Settings — theme / font / location (offline city search) / method / madhab
// ---------------------------------------------------------------------------
const THEMES = ['dark', 'light', 'sepia', 'night'];

export async function renderSettings(root) {
  const s = state.settings;
  const loc = s.location ?? {};
  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>الإعدادات</h1><div class="sub">كل الإعدادات تُحفظ محلياً في قاعدة البيانات</div></div>
    <div class="card">
      <div class="field"><label>السمة</label>
        <select id="s-theme">${THEMES.map((t) => `<option value="${t}" ${s.theme === t ? 'selected' : ''}>${{ dark: 'داكنة', light: 'فاتحة', sepia: 'ورقية', night: 'ليلية' }[t]}</option>`).join('')}</select></div>
      <div class="field"><label>حجم خط الواجهة (${(s.font_scale ?? 1.3).toFixed(1)}×)</label>
        <input id="s-font" type="range" min="1" max="2" step="0.1" value="${s.font_scale ?? 1.3}"></div>
      <div class="field"><label>حجم خط المصحف — يُطبَّق على صفحات القراءة (${(s.mushaf_scale ?? 1).toFixed(2)}×)</label>
        <input id="s-mushaf-font" type="range" min="0.8" max="2" step="0.05" value="${s.mushaf_scale ?? 1}"></div>
      <div class="field"><label>طريقة الحساب</label>
        <select id="s-method">${CALC_METHODS.map((m) => `<option value="${m}" ${s.calc_method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="field"><label>المذهب (العصر)</label>
        <select id="s-madhab">${MADHABS.map((m) => `<option value="${m}" ${s.madhab === m ? 'selected' : ''}>${m === 'shafi' ? 'الجمهور (شافعي/مالكي/حنبلي)' : 'حنفي'}</option>`).join('')}</select></div>
      <div class="field"><label>قاعدة خطوط العرض العالية</label>
        <select id="s-hlr">${HIGH_LATITUDE_RULES.map((m) => `<option value="${m}" ${s.high_latitude_rule === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="field"><label>تصحيح التقويم الهجري (±٣ أيام)</label>
        <input id="s-hadj" type="number" min="-3" max="3" step="1" value="${s.hijri_adjust ?? 0}"></div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 8px;font-size:15px">الموقع</h3>
      <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:8px" id="s-loc-current">الحالي: ${loc.name_ar ?? 'مكة المكرمة'} (${loc.lat?.toFixed(3) ?? '21.423'}, ${loc.lng?.toFixed(3) ?? '39.826'})</div>
      <button class="btn primary" id="s-gps-btn" style="width:100%;margin-bottom:10px">${iconSvg('location', 16)}<span>تحديد الموقع تلقائياً (GPS)</span></button>
      <div class="field"><label>ابحث في مدن التطبيق (تعمل دون اتصال — ٦,٢٨٩ مدينة)</label>
        <input id="s-city" class="search-input" placeholder="اكتب اسم المدينة" autocomplete="off"></div>
      <div id="s-city-results"></div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 8px;font-size:15px">بيانات الإصدار الأول</h3>
      <div class="mode-note">الترحيل لمرة واحدة من تطبيق v1 (السمة، الخط، السبحة) يتم تلقائياً عند أول تشغيل. سلسلة الختمة القديمة تُعاد إعدادها يدوياً — النموذج تغيّر.</div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 8px;font-size:15px">عن التطبيق</h3>
      <div class="mode-note">«إسلامي» — مصحف كامل وأذكار ومواقيت وختمة تعمل دون اتصال، وبياناتك تبقى على جهازك.</div>
      <div style="font-size:13px;color:var(--color-text-secondary);line-height:var(--lh-arabic,1.9);margin-top:8px">
        هذا المشروع صدقة جارية وليّةً لله تعالى، مُهداة عن المطوّر <strong style="color:var(--color-accent)">ixboss</strong> ووالديه وأحبته جميعاً — فمن انتفع به فليدعُ لهم بالثواب والأجر.
      </div>
    </div>
  </div>`;

  const rerender = () => { mountTheme(); };
  root.querySelector('#s-theme').addEventListener('change', async (e) => { await saveSetting('theme', e.target.value); rerender(); });
  root.querySelector('#s-font').addEventListener('input', async (e) => { await saveSetting('font_scale', Number(e.target.value)); rerender(); });
  root.querySelector('#s-mushaf-font').addEventListener('input', async (e) => {
    const v = Number(e.target.value);
    await saveSetting('mushaf_scale', v);
    const label = e.target.closest('.field')?.querySelector('label');
    if (label) label.textContent = `حجم خط المصحف — يُطبَّق على صفحات القراءة (${v.toFixed(2)}×)`;
  });
  root.querySelector('#s-method').addEventListener('change', async (e) => { await saveSetting('calc_method', e.target.value); });
  root.querySelector('#s-madhab').addEventListener('change', async (e) => { await saveSetting('madhab', e.target.value); });
  root.querySelector('#s-hlr').addEventListener('change', async (e) => { await saveSetting('high_latitude_rule', e.target.value); });
  root.querySelector('#s-hadj').addEventListener('change', async (e) => {
    await saveSetting('hijri_adjust', Math.max(-3, Math.min(3, Number(e.target.value) || 0)));
  });

  const input = root.querySelector('#s-city');
  const results = root.querySelector('#s-city-results');
  const applyCity = async (row) => {
    const saved = await persistLocation(row);
    root.querySelector('#s-loc-current').textContent = `الحالي: ${saved.name_ar} (${saved.lat.toFixed(3)}, ${saved.lng.toFixed(3)})`;
    haptic([15, 40, 15]);
  };
  root.querySelector('#s-gps-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const statusEl = root.querySelector('#s-loc-current');
    btn.disabled = true;
    statusEl.textContent = 'جاري تحديد موقعك…';
    try {
      const fix = await getGpsFix();
      const nearest = await findNearestCity(state.db, fix.lat, fix.lng);
      if (!nearest) throw new Error('تعذر مطابقة الإحداثيات مع قاعدة المدن.');
      const saved = await persistLocation(nearest, fix);
      statusEl.textContent = `الحالي: ${saved.name_ar} (${saved.lat.toFixed(3)}, ${saved.lng.toFixed(3)})${saved.gps ? ' · GPS' : ''}`;
      haptic([15, 40, 15]);
    } catch (err) {
      statusEl.textContent = err?.message ?? 'تعذر تحديد الموقع — يمكنك البحث أو الاختيار من القائمة أدناه.';
    } finally {
      btn.disabled = false;
    }
  });

  let seq = 0;
  const renderCityRows = async (q) => {
    const my = ++seq;
    const rows = await searchCitiesOffline(state.db, q);
    if (my !== seq) return;
    results.innerHTML = rows.length === 0
      ? `<div class="mode-note">لا نتائج — جرّب بدون "ال" أو بصيغة أقصر.</div>`
      : rows.slice(0, 12).map((r) => `<div class="result-item" data-city="${r.city_id}" role="button" tabindex="0">
          <div style="font-weight:600">${r.name_ar}</div><div class="meta">${r.country_ar} · ${r.lat.toFixed(2)}, ${r.lng.toFixed(2)} · ${r.timezone}</div>
        </div>`).join('');
    for (const el of results.querySelectorAll('[data-city]')) {
      const pick = () => {
        const row = rows.find((r) => String(r.city_id) === el.dataset.city);
        if (row) applyCity(row);
      };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
    }
  };
  renderCityRows('');
  input.addEventListener('input', () => renderCityRows(input.value));
}
