// ============================================================================
// TimeFmt.kt — Canonical 12-hour wall-clock formatting ("h:mm AM/PM") with
// Western ASCII digits (0-9, Locale.US) for all Android screens and Glance
// widgets. Never emits 24-hour times or Arabic-Indic digits.
// ============================================================================

package app.sadaqa.android.engine

import java.time.Instant
import java.time.ZoneId
import java.util.Locale

object TimeFmt {

    private val DEFAULT_ZONE: ZoneId = ZoneId.of("Asia/Riyadh")
    private val HHMM_24_RE = Regex("^(\\d{1,2}):(\\d{2})(?::\\d{2})?$")
    private val HHMM_12_RE = Regex("^(\\d{1,2}):(\\d{2})\\s*([AaPp][Mm])$")

    /** Formats an epoch millisecond timestamp as 12-hour "h:mm AM/PM" with Western ASCII digits. */
    fun formatWallClock12h(epochMs: Long, tzId: String): String {
        val zone = runCatching { ZoneId.of(tzId.trim()) }.getOrElse { DEFAULT_ZONE }
        return formatWallClock12h(epochMs, zone)
    }

    /** Formats an epoch millisecond timestamp as 12-hour "h:mm AM/PM" with Western ASCII digits. */
    fun formatWallClock12h(epochMs: Long, tz: ZoneId): String {
        val zdt = Instant.ofEpochMilli(epochMs).atZone(tz)
        return formatHourMinute12h(zdt.hour, zdt.minute)
    }

    /**
     * Converts a 24-hour "HH:mm" / "H:mm" string (including Arabic-Indic digits)
     * into 12-hour "h:mm AM/PM" with Western ASCII digits (Locale.US).
     * Examples: "14:34" -> "2:34 PM", "16:54" -> "4:54 PM", "00:57" -> "12:57 AM".
     */
    fun to12h(hhmm: String): String {
        val ascii = toAsciiDigits(hhmm).trim()
        HHMM_12_RE.matchEntire(ascii)?.let { m ->
            val h = m.groupValues[1].toIntOrNull() ?: return ascii
            val min = m.groupValues[2].toIntOrNull() ?: return ascii
            if (h in 1..12 && min in 0..59) {
                val period = m.groupValues[3].uppercase(Locale.US)
                return String.format(Locale.US, "%d:%02d %s", h, min, period)
            }
        }
        val match = HHMM_24_RE.matchEntire(ascii) ?: return ascii
        val hour24 = match.groupValues[1].toIntOrNull() ?: return ascii
        val minute = match.groupValues[2].toIntOrNull() ?: return ascii
        if (hour24 !in 0..23 || minute !in 0..59) return ascii
        return formatHourMinute12h(hour24, minute)
    }

    /** Formats a remaining duration in ms as "HH:MM:SS" with Western ASCII digits. */
    fun formatHms(msLeft: Long): String {
        val s = maxOf(0L, msLeft / 1000L)
        val hours = s / 3600L
        val mins = (s % 3600L) / 60L
        val secs = s % 60L
        return String.format(Locale.US, "%02d:%02d:%02d", hours, mins, secs)
    }

    private fun formatHourMinute12h(hour24: Int, minute: Int): String {
        val hour12 = when {
            hour24 == 0 -> 12
            hour24 > 12 -> hour24 - 12
            else -> hour24
        }
        val period = if (hour24 < 12) "AM" else "PM"
        return String.format(Locale.US, "%d:%02d %s", hour12, minute, period)
    }

    private fun toAsciiDigits(input: String): String {
        val sb = StringBuilder(input.length)
        for (ch in input) {
            when (ch) {
                in '\u0660'..'\u0669' -> sb.append(('0'.code + (ch.code - '\u0660'.code)).toChar())
                in '\u06F0'..'\u06F9' -> sb.append(('0'.code + (ch.code - '\u06F0'.code)).toChar())
                else -> sb.append(ch)
            }
        }
        return sb.toString()
    }
}
