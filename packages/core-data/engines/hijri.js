// ============================================================================
// hijri.js — Hijri conversion & Islamic events (zero-dep, ICU-backed)
// Uses Intl's islamic-umalqura calendar (bundled ICU in every modern browser,
// Node ≥14, and WebViews). Inverse conversion (Hijri→Gregorian) is resolved by
// binary search over Gregorian days — O(≈354) probes, cheap.
// ICU caveat: umalqura tables are embedded per ICU version; a device ICU may
// differ by ±1 day from the Umm al-Qura printed calendar. `user_settings.
// hijri_adjust` (schema: prayer_overrides.hijri_adjust) is the user-facing
// correction for exactly this — never silently "fix" it in code.
// ============================================================================

const HIJRI_MONTHS_AR = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

function hijriParts(instant) {
  const dtf = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
    timeZone: 'UTC',
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(instant)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  return { day: p.day, month: p.month, year: p.year };
}

/** Gregorian "YYYY-MM-DD" (interpreted as UTC day) → Hijri {y, m, d}. */
export function toHijri(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const instant = Date.UTC(y, m - 1, d, 12); // noon UTC keeps the civil day stable
  const h = hijriParts(instant);
  return { y: h.year, m: h.month, d: h.day };
}

/** Hijri {y, m, d} → Gregorian "YYYY-MM-DD" (anchored day-scan). */
export function fromHijri({ y, m, d }) {
  if (m < 1 || m > 12 || d < 1 || d > 30) throw new Error(`invalid hijri date: ${y}-${m}-${d}`);
  // Reference: Muharram 1, 1445 AH = 19 July 2023 (Umm al-Qura). Interpolate the
  // year start with the mean lunar year (354.36707 d); drift of the true table
  // vs the mean stays within ~a week over ±25 AH years → ±14-day scan margin.
  const REF = Date.UTC(2023, 6, 19, 12); // Muharram 1, 1445
  const yearStart = REF + Math.round((y - 1445) * 354.36707) * 86_400_000;
  const anchor = yearStart + Math.round((m - 1) * 29.53) * 86_400_000 - 14 * 86_400_000;
  let first = -1;
  for (let t = anchor; t <= anchor + 90 * 86_400_000; t += 86_400_000) {
    const p = hijriParts(t);
    if (p.year === y && p.month === m) { first = t; break; }
  }
  if (first === -1) throw new Error(`hijri month not found: ${y}-${m}`);
  const instant = first + (d - 1) * 86_400_000;
  const p = hijriParts(instant);
  if (p.year !== y || p.month !== m || p.day !== d) {
    throw new Error(`hijri date does not exist: ${y}-${m}-${d}`);
  }
  const g = new Date(instant);
  return `${g.getUTCFullYear()}-${String(g.getUTCMonth() + 1).padStart(2, '0')}-${String(g.getUTCDate()).padStart(2, '0')}`;
}

export function monthNameAr(m) {
  if (m < 1 || m > 12) throw new Error('hijri month must be 1..12');
  return HIJRI_MONTHS_AR[m - 1];
}

/** ±N day adjustment applied at the display layer (schema: hijri_adjust).
 *  Defensive against imported-garbage settings: non-finite → 0, and finite
 *  values clamp to the schema's own ±3 contract (schema.sql:262 CHECK) — a
 *  crafted 1e15 used to overflow Date.UTC into an Invalid-time RangeError
 *  that blanked the whole Today screen (audit 2026-11-21). */
export function withAdjust(dateIso, adjust) {
  const n = Number(adjust);
  const adj = Number.isFinite(n) ? Math.max(-3, Math.min(3, Math.trunc(n))) : 0;
  const [y, m, d] = dateIso.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + adj, 12));
  return toHijri(`${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`);
}

/**
 * Day-scan over a Gregorian year: yields { instant, hijri } for each civil day
 * (UTC noon anchors). `skipAfterMatch` jumps ahead once a match is found —
 * single-day clusters (e.g. 9/1) can skip ~20 days; multi-day clusters
 * (White Days 13/14/15) must skip 1 to catch the rest of the cluster.
 */
function* scanYear(gregorianYear, predicate, skipAfterMatch = 20) {
  let t0 = Date.UTC(gregorianYear, 0, 1, 12);
  const t1 = Date.UTC(gregorianYear + 1, 0, 1, 12);
  while (t0 < t1) {
    const h = hijriParts(t0);
    if (predicate(h)) {
      yield { instant: t0, hijri: h };
      t0 += skipAfterMatch * 86_400_000;
      continue;
    }
    t0 += 86_400_000;
  }
}

function gregorianIsoOf(instant) {
  const g = new Date(instant);
  return `${g.getUTCFullYear()}-${String(g.getUTCMonth() + 1).padStart(2, '0')}-${String(g.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Islamic events for a Gregorian year (derived, not hand-typed):
 * ramadan_start (9/1), eid_fitr (10/1), arafah (12/9), eid_adha (12/10),
 * ashura (1/10). A Gregorian year can contain two occurrences of the same
 * hijri date — all matches are returned.
 */
export function events(gregorianYear) {
  const targets = [
    { key: 'ashura', m: 1, d: 10 },
    { key: 'ramadan_start', m: 9, d: 1 },
    { key: 'eid_fitr', m: 10, d: 1 },
    { key: 'arafah', m: 12, d: 9 },
    { key: 'eid_adha', m: 12, d: 10 },
  ];
  const out = [];
  for (const t of targets) {
    for (const { instant, hijri } of scanYear(gregorianYear, (h) => h.year >= 1400 && h.year <= 1600 && h.month === t.m && h.day === t.d)) {
      out.push({ key: t.key, hijri: { y: hijri.year, m: t.m, d: t.d }, gregorian: gregorianIsoOf(instant) });
    }
  }
  return out.sort((a, b) => a.gregorian.localeCompare(b.gregorian));
}

/** White Days (13/14/15 of every lunar month) intersecting a Gregorian year. */
export function whiteDays(gregorianYear) {
  const out = [];
  for (const { instant, hijri } of scanYear(gregorianYear, (h) => h.year >= 1400 && h.year <= 1600 && (h.day === 13 || h.day === 14 || h.day === 15), 1)) {
    out.push({ hijri: { y: hijri.year, m: hijri.month, d: hijri.day }, gregorian: gregorianIsoOf(instant) });
  }
  return out.sort((a, b) => a.gregorian.localeCompare(b.gregorian));
}
