// ============================================================================
// Calendars.kt — HijriEngine (hijri.js port via java.time HijrahDate — the
// JDK's umalqura tables) + QiblaEngine (qibla.js port). ICU-version caveat
// from hijri.js applies: device umalqura tables may differ ±1 day; the
// hijri_adjust user setting is the correction, never a silent code fix.
// Parity fixtures (hijri/roundtrip.json, qibla/bearings.json) replay in CI.
// ============================================================================

package app.sadaqa.android.engine

import java.time.LocalDate
import java.time.ZoneOffset
import java.time.chrono.HijrahDate
import java.time.chrono.HijrahChronology

object HijriEngine {

    val MONTHS_AR = listOf(
        "محرم", "صفر", "ربيع الأول", "ربيع الثاني", "جمادى الأولى", "جمادى الآخرة",
        "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
    )

    data class HijriDate(val y: Int, val m: Int, val d: Int)

    /** Gregorian "YYYY-MM-DD" (UTC day) → Hijri. */
    fun toHijri(dateIso: String): HijriDate {
        val g = LocalDate.parse(dateIso).atStartOfDay(ZoneOffset.UTC).toLocalDate()
        val h = HijrahDate.from(g)
        return HijriDate(h.get(java.time.temporal.ChronoField.YEAR), h.get(java.time.temporal.ChronoField.MONTH_OF_YEAR), h.get(java.time.temporal.ChronoField.DAY_OF_MONTH))
    }

    /** Hijri → Gregorian "YYYY-MM-DD" (throws on nonexistent dates, like the web). */
    fun fromHijri(h: HijriDate): String {
        require(h.m in 1..12 && h.d in 1..30) { "invalid hijri date: ${h.y}-${h.m}-${h.d}" }
        val hd = HijrahChronology.INSTANCE.date(h.y, h.m, h.d) // throws HijrahDateTimeException if absent
        val g = LocalDate.from(hd)
        return "%04d-%02d-%02d".format(g.year, g.monthValue, g.dayOfMonth)
    }

    fun monthNameAr(m: Int): String {
        require(m in 1..12) { "hijri month must be 1..12" }
        return MONTHS_AR[m - 1]
    }

    /** ±N day adjustment applied at the display layer (schema: hijri_adjust). */
    fun withAdjust(dateIso: String, adjust: Int): HijriDate {
        val shifted = LocalDate.parse(dateIso).plusDays(adjust.toLong())
        return toHijri("%04d-%02d-%02d".format(shifted.year, shifted.monthValue, shifted.dayOfMonth))
    }

    data class IslamicEvent(val key: String, val hijri: HijriDate, val gregorian: String)

    /** Day-scan over a Gregorian year (scanYear port). */
    private fun scanYear(year: Int, predicate: (HijriDate) -> Boolean, skipAfterMatch: Int = 20): List<Pair<LocalDate, HijriDate>> {
        val out = mutableListOf<Pair<LocalDate, HijriDate>>()
        var t = LocalDate.of(year, 1, 1)
        val end = LocalDate.of(year + 1, 1, 1)
        while (t.isBefore(end)) {
            val h = toHijri("%04d-%02d-%02d".format(t.year, t.monthValue, t.dayOfMonth))
            if (predicate(h)) {
                out.add(t to h)
                t = t.plusDays(skipAfterMatch.toLong())
                continue
            }
            t = t.plusDays(1)
        }
        return out
    }

    /** ramadan_start (9/1), eid_fitr (10/1), arafah (12/9), eid_adha (12/10), ashura (1/10). */
    fun events(gregorianYear: Int): List<IslamicEvent> {
        val targets = listOf(
            Triple("ashura", 1, 10), Triple("ramadan_start", 9, 1),
            Triple("eid_fitr", 10, 1), Triple("arafah", 12, 9), Triple("eid_adha", 12, 10),
        )
        val out = mutableListOf<IslamicEvent>()
        for ((key, m, d) in targets) {
            for ((instant, hijri) in scanYear(gregorianYear) { it.y in 1400..1600 && it.m == m && it.d == d }) {
                out.add(IslamicEvent(key, HijriDate(hijri.y, m, d), isoOf(instant)))
            }
        }
        return out.sortedBy { it.gregorian }
    }

    /** White Days (13/14/15 of every lunar month) intersecting a Gregorian year. */
    fun whiteDays(gregorianYear: Int): List<IslamicEvent> =
        scanYear(gregorianYear, { it.y in 1400..1600 && it.d in 13..15 }, 1)
            .map { IslamicEvent("white_day", it.second, isoOf(it.first)) }
            .sortedBy { it.gregorian }

    /** 0=Sunday dow of a gregorian ISO day (UTC semantics, hijri.js parity). */
    fun weekdayOf(iso: String): Int {
        val d = LocalDate.parse(iso)
        return (d.dayOfWeek.value % 7) // MONDAY=1..SUNDAY=7 → SUNDAY=0
    }

    private fun isoOf(d: LocalDate): String = "%04d-%02d-%02d".format(d.year, d.monthValue, d.dayOfMonth)
}

object QiblaEngine {
    const val KAABA_LAT = 21.4225
    const val KAABA_LNG = 39.8262

    /** Initial great-circle bearing (degrees, 0=N, clockwise) to the Kaaba. */
    fun qiblaBearing(lat: Double, lng: Double): Double {
        val p1 = Math.toRadians(lat)
        val p2 = Math.toRadians(KAABA_LAT)
        val dl = Math.toRadians(KAABA_LNG - lng)
        val theta = kotlin.math.atan2(
            kotlin.math.sin(dl) * kotlin.math.cos(p2),
            kotlin.math.cos(p1) * kotlin.math.sin(p2) - kotlin.math.sin(p1) * kotlin.math.cos(p2) * kotlin.math.cos(dl),
        )
        return (Math.toDegrees(theta) + 360.0) % 360.0
    }

    /** Great-circle distance in km (haversine). */
    fun distanceKm(lat: Double, lng: Double): Double {
        val r = 6371.0088
        val p1 = Math.toRadians(lat)
        val p2 = Math.toRadians(KAABA_LAT)
        val dp = Math.toRadians(KAABA_LAT - lat)
        val dl = Math.toRadians(KAABA_LNG - lng)
        val a = kotlin.math.sin(dp / 2) * kotlin.math.sin(dp / 2) +
            kotlin.math.cos(p1) * kotlin.math.cos(p2) * kotlin.math.sin(dl / 2) * kotlin.math.sin(dl / 2)
        return 2 * r * kotlin.math.asin(kotlin.math.sqrt(a))
    }
}
