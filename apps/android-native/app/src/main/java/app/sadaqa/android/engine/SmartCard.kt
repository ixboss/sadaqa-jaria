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

enum class SmartCardKind(val key: String) {
    KAHF("kahf"), AFTER_PRAYER("after_prayer"), QIYAM("qiyam"),
    MORNING("morning"), EVENING("evening"), NEXT_PRAYER("next_prayer");
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

    private val isoFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    fun resolve(now: Long, engine: BoundPrayerEngine): SmartCard {
        val tz = ZoneId.of(engine.opts.timeZone)
        val instant = Instant.ofEpochMilli(now)
        val dateIso = isoFmt.withZone(tz).format(instant)
        val sched = engine.daySchedule(dateIso)
        val wsToday = engine.sunnahWindows(dateIso)
        val yIso = PrayerEngine.shiftCivilIso(dateIso, -1)
        val wsNight = engine.sunnahWindows(yIso) // the night in progress (maghrib → fajr)
        val dow = DateTimeFormatter.ofPattern("EEE", java.util.Locale.US).withZone(tz).format(instant)

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
        // 6. else → next-prayer details
        return SmartCard(
            SmartCardKind.NEXT_PRAYER, "🕌", "الوقت الحالي",
            "${nxt.name.labelAr} ${clock(nxt.at, tz)}",
            "الصلاة القادمة بعد ${hms(nxt.at - now)}",
            "التقويم الهجري", "tools-hijri",
        )
    }

    /** Arabic 23h wall clock "HH:mm" in the city timezone (web fmtClock). */
    fun clock(ms: Long, tz: ZoneId): String {
        val zdt = Instant.ofEpochMilli(ms).atZone(tz)
        return "%02d:%02d".format(zdt.hour, zdt.minute)
    }

    /** "HH:MM:SS" countdown (web fmtHMS). */
    fun hms(msLeft: Long): String {
        val s = maxOf(0, (msLeft / 1000).toInt())
        return "%02d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
    }
}
