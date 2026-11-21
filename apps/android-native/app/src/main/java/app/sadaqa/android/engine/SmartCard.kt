// ============================================================================
// SmartCard.kt — port of packages/core-data/engines/smart-card.js (golden).
// §9 order, first match wins; post-prayer outranks the morning window.
// Only `kind` is parity-pinned (fixtures assert kinds); display strings are
// the same Arabic copy as the web screens.
// ============================================================================

package app.sadaqa.android.engine

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class SmartCardKind(val key: String) {
    KAHF("kahf"), AFTER_PRAYER("after_prayer"), QIYAM("qiyam"),
    MORNING("morning"), EVENING("evening"), SLEEP("night"), NEXT_PRAYER("next_prayer");
}

data class SmartCard(
    val kind: SmartCardKind,
    val icon: String,
    val badge: String,
    val title: String,
    val sub: String,
    val actionLabel: String,
    val actionScreen: String,
)

object SmartCardResolver {

    private const val MIN_MS = 60_000L

    private val isoFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US)

    fun resolve(now: Long, engine: BoundPrayerEngine): SmartCard {
        val tz = ZoneId.of(engine.opts.timeZone)
        val instant = Instant.ofEpochMilli(now)
        val dateIso = isoFmt.withZone(tz).format(instant)
        val sched = engine.daySchedule(dateIso)
        val wsToday = engine.sunnahWindows(dateIso)
        val yIso = PrayerEngine.shiftCivilIso(dateIso, -1)
        val wsNight = engine.sunnahWindows(yIso) // the night in progress (maghrib → fajr)
        val dow = DateTimeFormatter.ofPattern("EEE", Locale.US).withZone(tz).format(instant)

        // 1. Friday between Fajr and Jumu'ah → Surah Al-Kahf
        if (dow == "Fri" && now >= sched.prayers.getValue(PrayerName.FAJR) && now < sched.prayers.getValue(PrayerName.DHUHR)) {
            return SmartCard(
                SmartCardKind.KAHF, "📖", "سنة الجمعة", "اقرأ سورة الكهف",
                "من قال في يوم الجمعة سورة الكهف أُضيئت له من النور ما بين الجمعتين",
                "افتح سورة الكهف", "mushaf-page",
            )
        }
        // 2. ±20 min after an obligatory prayer (sunrise is not a salah)
        val nxt = engine.next(now)
        val prevName = nxt.previousName
        val prevAt = nxt.previousAt
        if (prevName != null && prevAt != null && prevName != PrayerName.SUNRISE && now - prevAt >= 0 && now - prevAt <= 20 * MIN_MS) {
            return SmartCard(
                SmartCardKind.AFTER_PRAYER, "📿", "الوقت الحالي", "أذكار ما بعد الصلاة",
                "بعد صلاة ${prevName.labelAr} — الاستغفار والدعاء مستقراً",
                "ابدأ الأذكار", "adhkar-cat",
            )
        }
        // 3. Last third of the current night → Qiyam
        if (now >= wsNight.lastThird && now < sched.prayers.getValue(PrayerName.FAJR)) {
            return SmartCard(
                SmartCardKind.QIYAM, "🌙", "الثلث الأخير", "وقت القيام",
                "الثلث الأخير حتى الفجر ${clock(sched.prayers.getValue(PrayerName.FAJR), tz)}",
                "افتح حاسبة القيام", "tools-qiyam",
            )
        }
        // 4. Fajr window (fajr → duha start) → morning athkar
        if (now >= sched.prayers.getValue(PrayerName.FAJR) && now < wsToday.duha) {
            return SmartCard(
                SmartCardKind.MORNING, "🌅", "الوقت الحالي", "أذكار الصباح",
                "ورد الصباح من حصن المسلم — اقرأها قبل أن تنشغل",
                "ابدأ أذكار الصباح", "adhkar-cat",
            )
        }
        // 5. Asr window (asr → maghrib) → evening athkar
        if (now >= sched.prayers.getValue(PrayerName.ASR) && now < sched.prayers.getValue(PrayerName.MAGHRIB)) {
            return SmartCard(
                SmartCardKind.EVENING, "🌇", "الوقت الحالي", "أذكار المساء",
                "ورد المساء من حصن المسلم — قبل غروب الشمس",
                "ابدأ أذكار المساء", "adhkar-cat",
            )
        }
        // 5b. Night / sleep window (after Isha+20m until last third begins) → sleep athkar ('night' window)
        val isNightSleepWindow =
            (now >= sched.prayers.getValue(PrayerName.ISHA) && now < wsToday.lastThird) ||
                (now < sched.prayers.getValue(PrayerName.FAJR) && now < wsNight.lastThird)
        if (isNightSleepWindow) {
            return SmartCard(
                SmartCardKind.SLEEP, "🌙", "وقت النوم", "أذكار النوم",
                "ورد النوم من حصن المسلم — اقرأها قبل أن تنام",
                "ابدأ أذكار النوم", "adhkar-sleep",
            )
        }
        // 6. else → next-prayer details
        return SmartCard(
            SmartCardKind.NEXT_PRAYER, "🕌", "الوقت الحالي",
            "${nxt.name.labelAr} ${clock(nxt.at, tz)}",
            "الصلاة القادمة بعد ${hms(nxt.at - now)}",
            "التقويم الهجري", "tools-hijri",
        )
    }

    /** 12-hour wall clock "h:mm AM/PM" with Western ASCII digits in the city timezone. */
    fun clock(ms: Long, tz: ZoneId): String = TimeFmt.formatWallClock12h(ms, tz)

    /** Convenience overload accepting an IANA timezone id (falls back to Asia/Riyadh). */
    fun clock(ms: Long, timeZone: String): String = TimeFmt.formatWallClock12h(ms, timeZone)

    /** "HH:MM:SS" countdown with Western ASCII digits (web fmtHMS). */
    fun hms(msLeft: Long): String = TimeFmt.formatHms(msLeft)
}
