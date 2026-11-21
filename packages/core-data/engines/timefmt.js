// ============================================================================
// timefmt.js — 12-hour AM/PM clock formatting (shared display contract).
// ---------------------------------------------------------------------------
// ONE formatter for every target: web screens, Electron tray, and the native
// ports (Android/iOS mirror this exact branch order — see SmartCard.kt note).
// The output is hand-rolled ("2:34 PM", "12:57 AM") and NEVER delegated to
// Intl/locale engines, so digits and AM/PM suffixes are identical on every
// device and ICU version — same bit-for-bit discipline as the prayer math.
//
// Rules pinned by timefmt.test.js:
//   hour 1..12, no leading zero on the hour, minutes zero-padded,
//   midnight = 12:00 AM, noon = 12:00 PM, Western digits, "AM/PM" uppercase.
// ============================================================================
import { civilParts } from './prayer.js';

/**
 * Civil clock of an instant in a timezone as "h:mm AM|PM" (Western digits).
 * @param {number} ms epoch milliseconds
 * @param {string} timeZone IANA name
 * @returns {string} e.g. "2:34 PM", "12:57 AM"
 */
export function formatClock12h(ms, timeZone) {
  const p = civilParts(ms, timeZone);
  const suffix = p.h < 12 ? 'AM' : 'PM';
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.mi).padStart(2, '0')} ${suffix}`;
}
