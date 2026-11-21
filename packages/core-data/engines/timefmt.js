// ============================================================================
// timefmt.js — Shared 12-hour ASCII wall-clock formatter (all JS targets).
// Produces strict `h:mm AM/PM` with Western ASCII digits (0-9) and regular
// ASCII space — never 24-hour, never Arabic-Indic digits, never U+202F.
// ============================================================================

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

function normalizeDigits(str) {
  return String(str).replace(/[٠-٩]/g, (ch) => String(ARABIC_INDIC.indexOf(ch)));
}

function formatHm12(hour24, minute) {
  const h24 = ((hour24 % 24) + 24) % 24;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * Convert a 24-hour wall-clock string ("HH:MM", "H:MM", or "HH:MM:SS") — or
 * an already-formatted 12-hour string ("h:mm AM/PM") — into canonical ASCII
 * 12-hour format: `h:mm AM/PM` (e.g. "14:34" → "2:34 PM", "00:57" → "12:57 AM").
 * Returns '' on malformed or out-of-range inputs.
 */
export function to12h(hhmm) {
  if (typeof hhmm !== 'string') return '';
  const clean = normalizeDigits(hhmm).trim();
  if (!clean) return '';

  // Already 12-hour: e.g. "2:34 pm", "12:05 AM"
  const m12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (m12) {
    const h = Number(m12[1]);
    const mi = Number(m12[2]);
    const mer = m12[3].toUpperCase();
    if (h < 1 || h > 12 || mi < 0 || mi > 59) return '';
    return `${h}:${String(mi).padStart(2, '0')} ${mer}`;
  }

  // 24-hour: "00:00" .. "23:59" (optional ":ss")
  const m24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m24) return '';
  const h = Number(m24[1]);
  const mi = Number(m24[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return '';
  return formatHm12(h, mi);
}

/**
 * Format a Date or epoch-ms instant in `timeZone` as canonical ASCII 12-hour
 * `h:mm AM/PM` (e.g. "4:54 PM", "12:57 AM"). Degrades to '' on non-finite dates
 * and falls back to UTC if an invalid IANA timezone string is supplied.
 */
export function formatTime12h(date, timeZone) {
  const ms = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(ms)) return '';

  const opts = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  let dtf;
  if (typeof timeZone === 'string' && timeZone.length > 0) {
    try {
      dtf = new Intl.DateTimeFormat('en-US', { ...opts, timeZone });
    } catch {
      dtf = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' });
    }
  } else {
    dtf = new Intl.DateTimeFormat('en-US', opts);
  }

  let h = NaN;
  let mi = NaN;
  for (const { type, value } of dtf.formatToParts(ms)) {
    if (type === 'hour') h = Number(value);
    else if (type === 'minute') mi = Number(value);
  }
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return '';
  return formatHm12(h, mi);
}
