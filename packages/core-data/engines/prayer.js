// ============================================================================
// prayer.js — Sadaqa Jaria v2 prayer-time engine (shared core, target-agnostic)
// ---------------------------------------------------------------------------
// Wraps the vendored adhan@4.4.6 build. Every target (web/Electron/iOS/Android)
// consumes THESE constants and THIS math — never per-platform reimplementations.
//
// Timezone contract (the "bit-for-bit" guarantee):
//   Verified against the vendored source: TimeComponents.utcDate builds results
//   with Date.UTC, and SolarTime's transit/hour-angle values are explicitly in
//   *universal time* — so `pt.fajr.getTime()` etc. are TRUE absolute instants.
//   The only device-dependent input is the civil date adhan reads from the
//   passed Date via runtime-local getters. This engine therefore anchors with
//   `new Date(y, mo, d, 12)` — whose local components are y/mo/d on EVERY
//   runtime — so the Julian day fed to adhan is the city's civil date. Output
//   = epoch-milliseconds, identical on every device for the same inputs.
//   (Empirically pinned: London 2026-03-28 maghrib = 2026-03-28T18:27:00Z.)
//
// Elevation decision (parity over micro-precision): adhan-js has no elevation
// parameter (adhan-swift/-kotlin do). To keep all four targets identical we
// never pass elevation anywhere; `cities.elevation` is stored for potential
// native use but the shared engine ignores it. Documented deviation from the
// city rows, deliberate.
// ============================================================================
import {
  Coordinates,
  CalculationMethod,
  CalculationParameters,
  PrayerTimes,
  SunnahTimes,
  Prayer,
  HighLatitudeRule,
  Madhab,
  Qibla as adhanQibla,
} from '../vendor/adhan/Adhan.js';

/** Canonical prayer order (display + API). */
export const PRAYER_NAMES = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

// NOTE: no "gulf" here (resolved 2026-11-18) — the vendored adhan 4.4.6 has no
// Gulf factory, so a gulf entry would be undefined and throw at buildParams()
// time. The Settings UI offers exactly the 12 resolvable methods below.
const METHOD_MAP = {
  muslim_world_league: CalculationMethod.MuslimWorldLeague,
  egyptian: CalculationMethod.Egyptian,
  umm_al_qura: CalculationMethod.UmmAlQura,
  karachi: CalculationMethod.Karachi,
  moonsighting: CalculationMethod.MoonsightingCommittee,
  north_america: CalculationMethod.NorthAmerica,
  dubai: CalculationMethod.Dubai,
  kuwait: CalculationMethod.Kuwait,
  qatar: CalculationMethod.Qatar,
  singapore: CalculationMethod.Singapore,
  turkey: CalculationMethod.Turkey,
  tehran: CalculationMethod.Tehran,
};

const MADHAB_MAP = { shafi: Madhab.Shafi, hanafi: Madhab.Hanafi };
const HLR_MAP = {
  middle_of_the_night: HighLatitudeRule.MiddleOfTheNight,
  seventh_of_the_night: HighLatitudeRule.SeventhOfTheNight,
  twilight_angle: HighLatitudeRule.TwilightAngle,
};

export const CALC_METHODS = Object.keys(METHOD_MAP);
export const MADHABS = Object.keys(MADHAB_MAP);
export const HIGH_LATITUDE_RULES = Object.keys(HLR_MAP);

// ---------------------------------------------------------------------------
// Timezone helpers (Intl-based, zero-dep)
// ---------------------------------------------------------------------------

/** Civil date/time parts of an instant in a timezone: {y, mo, d, h, mi, s}. */
export function civilParts(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(instant)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  // month 1-based → 0-based for Date.UTC/Date constructor parity
  return { y: p.year, mo: p.month - 1, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/**
 * Wall parts of a Date via RUNTIME-LOCAL getters (utility for display of
 * adhan-produced instants when the runtime tz matches the city; kept exported
 * for user-facing wall-clock conversion helpers like wallClockToInstant).
 */
export function localPartsOf(dt) {
  return { y: dt.getFullYear(), mo: dt.getMonth(), d: dt.getDate(), h: dt.getHours(), mi: dt.getMinutes(), s: dt.getSeconds() };
}

/**
 * UTC offset (minutes, east positive) of a timezone at a wall-clock moment.
 * Resolved by probing: interpret candidate offsets, format back in the same
 * timezone, and require the round-trip to reproduce the exact wall time.
 * Handles DST gaps/overlaps by preferring the offset whose round-trip matches.
 */
function tzOffsetMinutes(wallParts, timeZone) {
  const { y, mo, d, h, mi, s } = wallParts;
  const naive = Date.UTC(y, mo, d, h, mi, s);
  // DST transitions never jump more than ±2h; probe the plausible range.
  for (const guess of [0, 60, -60, 120, -120, 180, -180, 210, -210, 240, -240, 300, -300, 330, -330, 345, -345, 420, -420, 480, -480, 540, -540, 570, -570, 600, -600, 660, -660, 720, -720, 780, -780, 840, -840]) {
    const instant = naive - guess * 60_000;
    const back = civilParts(instant, timeZone);
    if (back.y === y && back.mo === mo && back.d === d && back.h === h && back.mi === mi && back.s === s) {
      return guess;
    }
  }
  throw new Error(`cannot resolve UTC offset for ${timeZone} at ${y}-${mo + 1}-${d} ${h}:${mi}:${s}`);
}

/** Wall-clock parts (in the city) → true instant (epoch ms). */
export function wallClockToInstant(wallParts, timeZone) {
  const off = tzOffsetMinutes(wallParts, timeZone);
  return Date.UTC(wallParts.y, wallParts.mo, wallParts.d, wallParts.h, wallParts.mi, wallParts.s) - off * 60_000;
}

/** Civil-date anchor in the city: local-noon Date whose local components match. */
function localNoonAnchor(y, mo, d) {
  return new Date(y, mo, d, 12, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

function buildParams({ method = 'umm_al_qura', madhab = 'shafi', highLatitudeRule = 'middle_of_the_night', offsets = {} } = {}) {
  const factory = METHOD_MAP[method];
  if (!factory) throw new Error(`unknown calc method: ${method} (allowed: ${CALC_METHODS.join(', ')})`);
  const params = factory(); // CalculationParameters
  params.madhab = MADHAB_MAP[madhab] ?? null;
  if (params.madhab === null) throw new Error(`unknown madhab: ${madhab} (allowed: ${MADHABS.join(', ')})`);
  if (highLatitudeRule !== undefined && highLatitudeRule !== null) {
    const hlr = HLR_MAP[highLatitudeRule];
    if (!hlr) throw new Error(`unknown highLatitudeRule: ${highLatitudeRule} (allowed: ${HIGH_LATITUDE_RULES.join(', ')})`);
    params.highLatitudeRule = hlr;
  }
  for (const [name, minutes] of Object.entries(offsets ?? {})) {
    if (!PRAYER_NAMES.includes(name)) throw new Error(`unknown prayer for offset: ${name}`);
    if (!Number.isFinite(minutes) || Math.abs(minutes) > 60) throw new Error(`offset for ${name} out of range: ${minutes}`);
    params.adjustments[name] = minutes; // adhan-js PrayerAdjustments
  }
  return params;
}

/**
 * computeForDate({ y, mo, d } civil date in `timeZone`, opts) →
 * { times: {fajr…isha: epochMs}, dayStart, dayEnd } — true instants.
 * opts: { lat, lng, timeZone, method, madhab, highLatitudeRule, offsets }
 */
export function computeForDate({ y, mo, d }, { lat, lng, timeZone, ...cfg } = {}) {
  if (!timeZone) throw new Error('timeZone is required (IANA name)');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`invalid lat: ${lat}`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error(`invalid lng: ${lng}`);
  const coords = new Coordinates(lat, lng);
  const params = buildParams(cfg);
  const pt = new PrayerTimes(coords, localNoonAnchor(y, mo, d), params);
  const times = {};
  for (const name of PRAYER_NAMES) {
    // adhan's output Dates are true UTC instants (see header contract); the
    // local-noon anchor guarantees the civil date was the city's.
    times[name] = pt.timeForPrayer(name).getTime();
  }
  return { times };
}

/**
 * daySchedule(dateIso, opts) → one day's schedule with the previous day's isha
 * included for countdown continuity. dateIso: "YYYY-MM-DD" interpreted in the
 * city timezone.
 */
export function daySchedule(dateIso, opts) {
  const [y, mo, d] = dateIso.split('-').map(Number);
  const { times } = computeForDate({ y, mo: mo - 1, d }, opts);
  const prev = new Date(Date.UTC(y, mo - 1, d - 1));
  const { y: py, mo: pmo, d: pd } = civilParts(prev, 'UTC');
  const { times: prevTimes } = computeForDate({ y: py, mo: pmo, d: pd }, opts);
  return {
    date: dateIso,
    timeZone: opts.timeZone,
    prayers: times,
    previousIsha: prevTimes.isha,
  };
}

/**
 * next(nowEpochMs, opts) → { name, at, previous: { name, at } }
 * Scans yesterday/today/tomorrow in the city timezone; `now` may belong to the
 * city's next civil day (travel). Deterministic, no recomputation loops.
 */
export function next(nowEpochMs, opts) {
  const parts = civilParts(nowEpochMs, opts.timeZone);
  const iso = (y, mo, d) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const mk = (y, mo, d) => daySchedule(iso(y, mo, d), opts);
  const yP = civilParts(nowEpochMs - 86_400_000, opts.timeZone);
  const tP = parts;
  const t = mk(tP.y, tP.mo, tP.d);
  const y = mk(yP.y, yP.mo, yP.d);
  const nP = civilParts(nowEpochMs + 86_400_000, opts.timeZone);
  const n = mk(nP.y, nP.mo, nP.d);

  const flat = [];
  for (const sched of [y, t, n]) {
    for (const name of PRAYER_NAMES) flat.push({ name, at: sched.prayers[name] });
  }
  const prevIdx = (() => {
    let last = -1;
    for (let i = 0; i < flat.length; i++) if (flat[i].at <= nowEpochMs) last = i;
    return last;
  })();
  const nextIdx = prevIdx + 1;
  if (nextIdx >= flat.length) throw new Error('no next prayer found (unreachable for ±1 day scan)');
  return { name: flat[nextIdx].name, at: flat[nextIdx].at, previous: flat[prevIdx] };
}

/**
 * schedule(year, monthNumber1Based, opts) → monthly table
 * (Ameen evidence: "View the full month's prayer schedule at a glance").
 * Rows: { date, prayers{…} } for every civil day of the month in the city tz.
 */
export function schedule(year, month1, opts) {
  if (month1 < 1 || month1 > 12) throw new Error('month must be 1..12');
  const days = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const rows = [];
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { times } = computeForDate({ y: year, mo: month1 - 1, d }, opts);
    rows.push({ date: iso, prayers: times });
  }
  return { year, month: month1, timeZone: opts.timeZone, rows };
}

/**
 * sunnahWindows(dateIso, opts) → { duha, duhaEnd, midnight, lastThird }
 * (REA_SPEC §4.3 formulas, derived from adhan's own sunrise/maghrib/fajr).
 */
export function sunnahWindows(dateIso, opts) {
  const [y, mo, d] = dateIso.split('-').map(Number);
  const coords = new Coordinates(opts.lat, opts.lng);
  const params = buildParams(opts);
  const pt = new PrayerTimes(coords, localNoonAnchor(y, mo - 1, d), params);
  const st = new SunnahTimes(pt); // night math uses next-day fajr internally
  const sunriseI = pt.sunrise.getTime();
  const maghribI = pt.maghrib.getTime();
  // next day's fajr as the night's end anchor (same math as SunnahTimes uses)
  const nextDay = new Date(Date.UTC(y, mo - 1, d + 1));
  const { y: ny, mo: nmo, d: nd } = civilParts(nextDay, 'UTC');
  const nextFajrI = computeForDate({ y: ny, mo: nmo, d: nd }, opts).times.fajr;
  const nightLength = nextFajrI - maghribI;
  return {
    duha: sunriseI + Math.round((maghribI - sunriseI) * 0.25),
    duhaEnd: sunriseI + Math.round((maghribI - sunriseI) * 0.5),
    midnight: maghribI + Math.round(nightLength / 2),
    lastThird: maghribI + Math.round((2 * nightLength) / 3),
    // adhan's own rounded outputs (kept for cross-checks):
    adhanMidnight: st.middleOfTheNight.getTime(),
    adhanLastThird: st.lastThirdOfTheNight.getTime(),
    nextFajr: nextFajrI,
  };
}

/** Bound engine object for reminder/anchor consumers (reminders.js ctx.prayerEngine). */
export function bindPrayerEngine(opts) {
  return {
    opts,
    daySchedule: (iso) => daySchedule(iso, opts),
    sunnahWindows: (iso) => sunnahWindows(iso, opts),
    next: (now) => next(now, opts),
  };
}

export { adhanQibla as rawQibla, Coordinates as RawCoordinates, CalculationParameters as RawParameters };
