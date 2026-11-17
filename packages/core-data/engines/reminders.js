// ============================================================================
// reminders.js — prayer-anchored reminder resolver (REA_SPEC §4.7)
// Anchors are expressions, never fixed clock hours (except explicit
// user-defined daily_at). Resolved lazily against the shared prayer + hijri
// engines so DST / city / method changes propagate automatically.
// ============================================================================

/**
 * resolveAnchor(anchor, ctx) → [{ at: epochMs, label }]
 * ctx: { dayStartInstant, days (count), prayerEngine, hijriEngine, now }
 * anchor kinds:
 *   { kind:'prayer_offset', prayer:'fajr'|…, offsetMinutes:-30..+120 }
 *   { kind:'solar', window:'duha'|'duhaEnd'|'midnight'|'lastThird' }
 *   { kind:'hijri_event', event:'ramadan_start'|'eid_fitr'|'arafah'|'eid_adha'|'ashura', offsetDays?: n }
 *   { kind:'hijri_date', month:1..12, day:1..30, offsetDays?: n }   // e.g. personal hijri occasions
 *   { kind:'daily_at', time:'HH:MM' }                               // user-defined fixed time only
 */
export function resolveAnchor(anchor, ctx) {
  if (!ctx || !ctx.prayerEngine || !ctx.hijriEngine) throw new Error('resolveAnchor requires prayerEngine and hijriEngine in ctx');
  const days = ctx.days ?? 1;
  const out = [];

  if (anchor.kind === 'daily_at') {
    if (!/^\d{2}:\d{2}$/.test(anchor.time)) throw new Error('daily_at.time must be HH:MM');
    for (let i = 0; i < days; i++) {
      const [h, m] = anchor.time.split(':').map(Number);
      const at = ctx.dayStartInstant + i * 86_400_000 + (h * 60 + m) * 60_000;
      out.push({ at, label: `daily_at ${anchor.time}` });
    }
    return out;
  }

  if (anchor.kind === 'prayer_offset') {
    if (!Number.isInteger(anchor.offsetMinutes) || anchor.offsetMinutes < -30 || anchor.offsetMinutes > 120) {
      throw new Error('prayer_offset.offsetMinutes must be within -30..+120');
    }
    for (let i = 0; i < days; i++) {
      const dayStart = ctx.dayStartInstant + i * 86_400_000;
      const sched = ctx.prayerEngine.daySchedule(isoOf(dayStart, ctx.prayerEngine.opts.timeZone), ctx.prayerEngine.opts);
      for (const name of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
        if (anchor.prayer && name !== anchor.prayer) continue;
        out.push({ at: sched.prayers[name] + anchor.offsetMinutes * 60_000, label: `${name}+${anchor.offsetMinutes}` });
      }
    }
    return out;
  }

  if (anchor.kind === 'solar') {
    for (let i = 0; i < days; i++) {
      const dayStart = ctx.dayStartInstant + i * 86_400_000;
      const w = ctx.prayerEngine.sunnahWindows(isoOf(dayStart, ctx.prayerEngine.opts.timeZone), ctx.prayerEngine.opts);
      const allowed = ['duha', 'duhaEnd', 'midnight', 'lastThird'];
      if (!allowed.includes(anchor.window)) throw new Error(`solar.window must be one of ${allowed.join(', ')}`);
      out.push({ at: w[anchor.window], label: `solar:${anchor.window}` });
    }
    return out;
  }

  if (anchor.kind === 'hijri_event') {
    // window may straddle a Gregorian year boundary — scan both years, then
    // filter to the requested window
    const y0 = new Date(ctx.dayStartInstant).getUTCFullYear();
    const y1 = new Date(ctx.dayStartInstant + days * 86_400_000 - 1).getUTCFullYear();
    const lo = ctx.dayStartInstant;
    const hi = ctx.dayStartInstant + days * 86_400_000;
    for (const year of [...new Set([y0, y1])]) {
      const evts = ctx.hijriEngine.events(year).filter((e) => e.key === anchor.event);
      for (const e of evts) {
        const at = Date.parse(`${e.gregorian}T12:00:00Z`) + (anchor.offsetDays ?? 0) * 86_400_000;
        if (at >= lo && at < hi) out.push({ at, label: `${anchor.event} (${e.gregorian})` });
      }
    }
    return out;
  }

  if (anchor.kind === 'hijri_date') {
    // derive the relevant HIJRI years from the window endpoints (never confuse
    // Gregorian and Hijri year numbers)
    const lo = ctx.dayStartInstant;
    const hi = ctx.dayStartInstant + days * 86_400_000;
    const hy0 = ctx.hijriEngine.toHijri(isoOf(lo, 'UTC')).y - 1;
    const hy1 = ctx.hijriEngine.toHijri(isoOf(hi - 1, 'UTC')).y + 1;
    for (let y = hy0; y <= hy1; y++) {
      try {
        const g = ctx.hijriEngine.fromHijri({ y, m: anchor.month, d: anchor.day });
        const at = Date.parse(`${g}T12:00:00Z`) + (anchor.offsetDays ?? 0) * 86_400_000;
        if (at >= lo && at < hi) out.push({ at, label: `hijri ${anchor.month}/${anchor.day}` });
      } catch { /* month/date not present in that lunar year — fine */ }
    }
    return out;
  }

  throw new Error(`unknown anchor kind: ${anchor.kind}`);
}

function isoOf(instant, timeZone) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  return p; // en-CA yields YYYY-MM-DD
}
