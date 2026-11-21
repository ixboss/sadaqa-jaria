// ============================================================================
// smart-card.js — Smart Context-Aware Card resolver (ARCHITECTURE.md §9)
// ---------------------------------------------------------------------------
// Phase 5: moved verbatim from apps/web-desktop/js/ui/screens/today.js into the
// shared engines dir so ALL FOUR targets execute the same golden resolver —
// the native ports (iOS/Android) port THIS file, never a per-platform fork.
//
// Resolution order (evaluated top-down, FIRST MATCH WINS):
//   1. Friday between Fajr and Jumu'ah            → Surah Al-Kahf
//   2. ±20 min after an obligatory prayer (NOT sunrise) → after-prayer dhikr
//   3. Last third of the current night            → Qiyam
//   4. Fajr window (fajr → duha start)            → morning athkar
//   5. Asr window (asr → maghrib)                 → evening athkar
//   6. else                                       → next-prayer details
// NOTE the deliberate precedence: post-prayer (2) outranks the morning window
// (4) — fajr+15min is after_prayer, not morning (pinned by Phase 4 e2e).
//
// `engine` is the bound object from prayer.js bindPrayerEngine(opts):
//   { opts: { timeZone, lat, lng, … }, daySchedule(iso), sunnahWindows(iso), next(now) }
// `now` is epoch ms. Pure — no clock reads, no DOM, no settings access.
// ============================================================================

import { shiftCivilIso } from './prayer.js';
import { formatClock12h } from './timefmt.js';

const MIN = 60_000;

const PRAYER_LABELS = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };

const fmtClock = formatClock12h;
const fmtHMS = (msLeft) => {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

/** Smart Context-Aware Card (§9 order — evaluated top-down, first match wins). */
export function resolveSmartCard(now, engine) {
  const tz = engine.opts.timeZone;
  // date components pinned — bare en-CA default pattern is ICU-dependent and
  // an unpinned format could stop being y-M-d someday (audit 2026-11-21)
  const iso = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  const dateIso = iso(now);
  const sched = engine.daySchedule(dateIso);
  const wsToday = engine.sunnahWindows(dateIso);
  const yIso = shiftCivilIso(dateIso, -1);
  const wsNight = engine.sunnahWindows(yIso); // the night currently in progress (maghrib → fajr)
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);

  // 1. Friday between Fajr and Jumu'ah → Surah Al-Kahf
  if (dow === 'Fri' && now >= sched.prayers.fajr && now < sched.prayers.dhuhr) {
    return { kind: 'kahf', icon: '📖', badge: 'سنة الجمعة', title: 'اقرأ سورة الكهف', sub: 'من قال في يوم الجمعة سورة الكهف أُضيئت له من النور ما بين الجمعتين', action: { label: 'افتح سورة الكهف', screen: 'mushaf-page', args: { page: 'kahf' } } };
  }
  // 2. ±20 min after any obligatory prayer (sunrise is not a salah) → post-prayer dhikr
  const prev = engine.next(now).previous;
  if (prev && prev.name !== 'sunrise' && now - prev.at >= 0 && now - prev.at <= 20 * MIN) {
    return { kind: 'after_prayer', icon: '📿', badge: 'الوقت الحالي', title: 'أذكار ما بعد الصلاة', sub: `بعد صلاة ${PRAYER_LABELS[prev.name]} — الاستغفار والدعاء مستقراً`, action: { label: 'ابدأ الأذكار', screen: 'adhkar-cat', args: { id: 'after-prayer' } } };
  }
  // 3. Last third of night (current night) → Qiyam
  if (now >= wsNight.lastThird && now < sched.prayers.fajr) {
    return { kind: 'qiyam', icon: '🌙', badge: 'الثلث الأخير', title: 'وقت القيام', sub: `الثلث الأخير حتى الفجر ${fmtClock(sched.prayers.fajr, tz)}`, action: { label: 'افتح حاسبة القيام', screen: 'tools-qiyam' } };
  }
  // 4. Fajr window (fajr → duha start) → morning athkar
  if (now >= sched.prayers.fajr && now < wsToday.duha) {
    return { kind: 'morning', icon: '🌅', badge: 'الوقت الحالي', title: 'أذكار الصباح', sub: 'ورد الصباح من حصن المسلم — اقرأها قبل أن تنشغل', action: { label: 'ابدأ أذكار الصباح', screen: 'adhkar-cat', args: { id: 'morning' } } };
  }
  // 5. Asr window (asr → maghrib) → evening athkar
  if (now >= sched.prayers.asr && now < sched.prayers.maghrib) {
    return { kind: 'evening', icon: '🌇', badge: 'الوقت الحالي', title: 'أذكار المساء', sub: 'ورد المساء من حصن المسلم — قبل غروب الشمس', action: { label: 'ابدأ أذكار المساء', screen: 'adhkar-cat', args: { id: 'evening' } } };
  }
  // 6. else → next-prayer details
  const next = engine.next(now);
  return { kind: 'next_prayer', icon: '🕌', badge: 'الوقت الحالي', title: `${PRAYER_LABELS[next.name]} ${fmtClock(next.at, tz)}`, sub: `الصلاة القادمة بعد ${fmtHMS(next.at - now)}`, action: { label: 'التقويم الهجري', screen: 'tools-hijri', args: {} } };
}

export { PRAYER_LABELS };
