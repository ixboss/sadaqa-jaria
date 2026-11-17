// ============================================================================
// PrayerEngine.kt — port of packages/core-data/engines/prayer.js (golden),
// backed by the SAME adhan library family (batoulapps adhan 1.2.1).
//
// Parity anchor: adhan-java takes DateComponents(year, month, day) — the
// CIVIL DATE directly. The web engine feeds adhan-js a runtime-local noon
// Date so adhan reads exactly that civil date; the effective input is
// identical, and output Dates are true UTC instants (epoch ms) on both.
// Elevation: never passed anywhere (parity over micro-precision — prayer.js).
// CI proves 0 ms drift by replaying Fixtures/prayer/*.json (web-generated).
// ============================================================================

package app.sadaqa.android.engine

import com.batoulapps.adhan.Coordinates
import com.batoulapps.adhan.CalculationMethod
import com.batoulapps.adhan.CalculationParameters
import com.batoulapps.adhan.DateComponents
import com.batoulapps.adhan.HighLatitudeRule
import com.batoulapps.adhan.Madhab
import com.batoulapps.adhan.Prayer
import com.batoulapps.adhan.PrayerAdjustments
import com.batoulapps.adhan.PrayerTimes
import com.batoulapps.adhan.SunnahTimes
import java.util.Date
import java.util.TimeZone

/** Canonical prayer order (display + API) — matches prayer.js PRAYER_NAMES. */
enum class PrayerName(val key: String, val labelAr: String) {
    FAJR("fajr", "الفجر"),
    SUNRISE("sunrise", "الشروق"),
    DHUHR("dhuhr", "الظهر"),
    ASR("asr", "العصر"),
    MAGHRIB("maghrib", "المغرب"),
    ISHA("isha", "العشاء");

    val adhan: Prayer
        get() = when (this) {
            FAJR -> Prayer.FAJR
            SUNRISE -> Prayer.SUNRISE
            DHUHR -> Prayer.DHUHR
            ASR -> Prayer.ASR
            MAGHRIB -> Prayer.MAGHRIB
            ISHA -> Prayer.ISHA
        }

    companion object {
        fun of(key: String): PrayerName? = entries.firstOrNull { it.key == key }
    }
}

data class EngineOptions(
    val lat: Double,
    val lng: Double,
    val timeZone: String,
    val method: String = "umm_al_qura",
    val madhab: String = "shafi",
    val highLatitudeRule: String = "middle_of_the_night",
    val offsets: Map<String, Int> = emptyMap(),
)

data class DaySchedule(val date: String, val prayers: Map<PrayerName, Long>, val previousIsha: Long)
data class NextPrayer(val name: PrayerName, val at: Long, val previousName: PrayerName?, val previousAt: Long?)
data class SunnahWindows(val duha: Long, val duhaEnd: Long, val midnight: Long, val lastThird: Long, val nextFajr: Long)

object PrayerEngine {

    val CALC_METHODS = listOf(
        "muslim_world_league", "egyptian", "umm_al_qura", "karachi",
        "moonsighting", "north_america", "dubai", "kuwait", "qatar",
        "singapore", "turkey", "tehran",
    )
    val MADHABS = listOf("shafi", "hanafi")
    val HIGH_LATITUDE_RULES = listOf("middle_of_the_night", "seventh_of_the_night", "twilight_angle")

    /** buildParams port — same 12 method keys, same madhab/HLR/offset semantics.
     *
     *  PARITY NOTES:
     *  - "gulf" is deliberately absent everywhere (resolved 2026-11-18): the
     *    golden's vendored adhan 4.4.6 defines no Gulf factory, so the golden
     *    METHOD_MAP no longer lists it. A stale "gulf" pref hits the else
     *    branch and throws, matching the golden buildParams.
     *  - "turkey"/"tehran": adhan 1.2.1 lacks enum entries; they are built
     *    from the vendored 4.4.6 values (CalculationMethod.js:75-85). Tehran's
     *    maghribAngle (4.5°) has no equivalent field in adhan 1.2.1 — its
     *    maghrib falls back to sunset, a documented deviation (fixtures never
     *    exercise tehran). */
    fun buildParams(opts: EngineOptions): CalculationParameters {
        val params: CalculationParameters = when (opts.method) {
            "muslim_world_league" -> CalculationMethod.MUSLIM_WORLD_LEAGUE.parameters
            "egyptian" -> CalculationMethod.EGYPTIAN.parameters
            "umm_al_qura" -> CalculationMethod.UMM_AL_QURA.parameters
            "karachi" -> CalculationMethod.KARACHI.parameters
            "moonsighting" -> CalculationMethod.MOON_SIGHTING_COMMITTEE.parameters
            "north_america" -> CalculationMethod.NORTH_AMERICA.parameters
            "dubai" -> CalculationMethod.DUBAI.parameters
            "kuwait" -> CalculationMethod.KUWAIT.parameters
            "qatar" -> CalculationMethod.QATAR.parameters
            "singapore" -> CalculationMethod.SINGAPORE.parameters
            "turkey" -> handBuiltTurkey()
            "tehran" -> handBuiltTehran()
            else -> throw IllegalArgumentException("unknown calc method: ${opts.method}")
        }
        params.madhab = when (opts.madhab) {
            "shafi" -> Madhab.SHAFI
            "hanafi" -> Madhab.HANAFI
            else -> throw IllegalArgumentException("unknown madhab: ${opts.madhab}")
        }
        params.highLatitudeRule = when (opts.highLatitudeRule) {
            "middle_of_the_night" -> HighLatitudeRule.MIDDLE_OF_THE_NIGHT
            "seventh_of_the_night" -> HighLatitudeRule.SEVENTH_OF_THE_NIGHT
            "twilight_angle" -> HighLatitudeRule.TWILIGHT_ANGLE
            else -> throw IllegalArgumentException("unknown highLatitudeRule: ${opts.highLatitudeRule}")
        }
        if (opts.offsets.isNotEmpty()) {
            val adj = PrayerAdjustments()
            for ((name, minutes) in opts.offsets) {
                require(PrayerName.of(name) != null) { "unknown prayer for offset: $name" }
                require(kotlin.math.abs(minutes) <= 60) { "offset for $name out of range: $minutes" }
                when (PrayerName.of(name)) {
                    PrayerName.FAJR -> adj.fajr = minutes
                    PrayerName.SUNRISE -> adj.sunrise = minutes
                    PrayerName.DHUHR -> adj.dhuhr = minutes
                    PrayerName.ASR -> adj.asr = minutes
                    PrayerName.MAGHRIB -> adj.maghrib = minutes
                    PrayerName.ISHA -> adj.isha = minutes
                    else -> {}
                }
            }
            params.adjustments = adj
        }
        return params
    }

    /** vendored adhan 4.4.6 Turkey(): fajr 18, isha 17, adj sunrise −7 dhuhr 5 asr 4 maghrib 7.
     *  (adhan 1.2.1 CalculationParameters has only angle constructors; `method`
     *  stays OTHER — 1.2.1 switches on method only for nightPortions where
     *  non-moonsighting values hit the same default branch as the golden.) */
    private fun handBuiltTurkey(): CalculationParameters {
        val p = CalculationParameters(18.0, 17.0)
        val adj = PrayerAdjustments().apply {
            sunrise = -7; dhuhr = 5; asr = 4; maghrib = 7
        }
        p.methodAdjustments = adj
        return p
    }

    /** vendored adhan 4.4.6 Tehran(): fajr 17.7, isha 14 (maghribAngle 4.5 not
     *  expressible in adhan 1.2.1 — see note above). */
    private fun handBuiltTehran(): CalculationParameters {
        return CalculationParameters(17.7, 14.0)
    }

    private fun dateComponentsOf(dateIso: String): DateComponents {
        val p = dateIso.split("-").map { it.toInt() }
        return DateComponents(p[0], p[1], p[2])
    }

    /** computeForDate → true UTC instants (epoch ms) for the 6 prayers.
     *  Unresolvable prayer times THROW (golden parity — never silent epoch-0). */
    fun computeForDate(dateIso: String, opts: EngineOptions): Map<PrayerName, Long> {
        require(opts.lat in -90.0..90.0 && opts.lng in -180.0..180.0) { "invalid lat/lng" }
        val pt = PrayerTimes(Coordinates(opts.lat, opts.lng), dateComponentsOf(dateIso), buildParams(opts))
        val out = mutableMapOf<PrayerName, Long>()
        for (name in PrayerName.entries) {
            out[name] = pt.timeForPrayer(name.adhan).requireTime(name.key)
        }
        return out
    }

    /** daySchedule — includes the previous day's isha (countdown continuity). */
    fun daySchedule(dateIso: String, opts: EngineOptions): DaySchedule {
        val times = computeForDate(dateIso, opts)
        // previous civil day in UTC (JS: new Date(Date.UTC(y, mo-1, d-1)))
        val p = dateIso.split("-").map { it.toInt() }
        val prevCal = java.util.Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            clear()
            set(p[0], p[1] - 1, p[2] - 1, 12, 0, 0)
        }
        val prevIso = "%04d-%02d-%02d".format(
            prevCal.get(java.util.Calendar.YEAR),
            prevCal.get(java.util.Calendar.MONTH) + 1,
            prevCal.get(java.util.Calendar.DAY_OF_MONTH),
        )
        val prevTimes = computeForDate(prevIso, opts)
        return DaySchedule(dateIso, times, prevTimes.getValue(PrayerName.ISHA))
    }

    /** next(nowEpochMs) — scans yesterday/today/tomorrow in the city tz. */
    fun next(nowMs: Long, opts: EngineOptions): NextPrayer {
        fun isoOf(ms: Long): String {
            val fmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")
                .withZone(java.time.ZoneId.of(opts.timeZone))
            return fmt.format(java.time.Instant.ofEpochMilli(ms))
        }
        val yesterday = daySchedule(isoOf(nowMs - 86_400_000), opts)
        val today = daySchedule(isoOf(nowMs), opts)
        val tomorrow = daySchedule(isoOf(nowMs + 86_400_000), opts)

        data class Flat(val name: PrayerName, val at: Long)
        val flat = PrayerName.entries.map { Flat(it, yesterday.prayers.getValue(it)) } +
            PrayerName.entries.map { Flat(it, today.prayers.getValue(it)) } +
            PrayerName.entries.map { Flat(it, tomorrow.prayers.getValue(it)) }
        var prevIdx = -1
        for ((i, f) in flat.withIndex()) if (f.at <= nowMs) prevIdx = i
        val nextIdx = prevIdx + 1
        require(nextIdx < flat.size) { "no next prayer found (unreachable for ±1 day scan)" }
        val prev = if (prevIdx >= 0) flat[prevIdx] else null
        return NextPrayer(flat[nextIdx].name, flat[nextIdx].at, prev?.name, prev?.at)
    }

    /** sunnahWindows — REA_SPEC §4.3 formulas over adhan's own outputs. */
    fun sunnahWindows(dateIso: String, opts: EngineOptions): SunnahWindows {
        val pt = PrayerTimes(Coordinates(opts.lat, opts.lng), dateComponentsOf(dateIso), buildParams(opts))
        val sunriseI = pt.timeForPrayer(Prayer.SUNRISE).requireTime("sunrise")
        val maghribI = pt.timeForPrayer(Prayer.MAGHRIB).requireTime("maghrib")
        val nextFajrI = nextDayFajr(dateIso, opts)
        val nightLength = nextFajrI - maghribI
        fun r(d: Double): Long = Math.round(d)
        return SunnahWindows(
            duha = sunriseI + r((maghribI - sunriseI) * 0.25),
            duhaEnd = sunriseI + r((maghribI - sunriseI) * 0.5),
            midnight = maghribI + r(nightLength / 2.0),
            lastThird = maghribI + r((2.0 * nightLength) / 3.0),
            nextFajr = nextFajrI,
        )
    }

    /** next-day fajr as the night's end anchor (civil scan, prayer.js parity). */
    private fun nextDayFajr(dateIso: String, opts: EngineOptions): Long {
        val cal = java.util.Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            clear()
            val p = dateIso.split("-").map { it.toInt() }
            set(p[0], p[1] - 1, p[2] + 1, 12, 0, 0)
        }
        val nextIso = "%04d-%02d-%02d".format(
            cal.get(java.util.Calendar.YEAR),
            cal.get(java.util.Calendar.MONTH) + 1,
            cal.get(java.util.Calendar.DAY_OF_MONTH),
        )
        return computeForDate(nextIso, opts).getValue(PrayerName.FAJR)
    }

    /** Bound engine (smart card + reminder consumers). */
    fun bind(opts: EngineOptions) = BoundPrayerEngine(opts)
}

class BoundPrayerEngine(val opts: EngineOptions) {
    fun daySchedule(iso: String) = PrayerEngine.daySchedule(iso, opts)
    fun sunnahWindows(iso: String) = PrayerEngine.sunnahWindows(iso, opts)
    fun next(now: Long) = PrayerEngine.next(now, opts)
}

/** Unresolvable prayer times throw — golden behavior (never silent epoch-0). */
private fun Date?.requireTime(name: String): Long =
    this?.time ?: throw IllegalArgumentException("adhan could not resolve prayer time: $name (check lat/lng + high-latitude rule)")
