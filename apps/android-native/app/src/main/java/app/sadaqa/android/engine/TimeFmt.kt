// ============================================================================
// TimeFmt.kt — port of packages/core-data/engines/timefmt.js (golden).
// 12-hour AM/PM clock shared by every screen and widget: "h:mm AM|PM" with
// Western digits, hour 1–12 (no leading zero), midnight = 12:00 AM,
// noon = 12:00 PM. Locale.US pins ASCII digits — the default locale on
// Arabic devices would render Arabic-Indic digits and break the contract.
// ============================================================================

package app.sadaqa.android.engine

import java.time.Instant
import java.time.ZoneId
import java.util.Locale

object TimeFmt {
    /** Mirrors formatClock12h(ms, timeZone) from engines/timefmt.js exactly. */
    fun clock12h(ms: Long, tz: ZoneId): String {
        val zdt = Instant.ofEpochMilli(ms).atZone(tz)
        val h24 = zdt.hour
        val suffix = if (h24 < 12) "AM" else "PM"
        val h12 = if (h24 % 12 == 0) 12 else h24 % 12
        return String.format(Locale.US, "%d:%02d %s", h12, zdt.minute, suffix)
    }
}
