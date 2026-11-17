// ============================================================================
// SmartCard.swift — port of packages/core-data/engines/smart-card.js (golden)
// ARCHITECTURE.md §9 resolution order, first match wins:
//   1. Friday Fajr→Jumu'ah → Al-Kahf   2. ±20 min post-prayer → dhikr
//   3. last third → Qiyam              4. Fajr window → morning athkar
//   5. Asr window → evening athkar     6. else next prayer
// Post-prayer (2) outranks the morning window (4) — fajr+15min is
// after_prayer, NOT morning (pinned by the Phase 4 e2e + parity fixtures).
// Pure: takes (nowMs, bound engine). Parity-verified by SmartCardParityTests.
// ============================================================================

import Foundation

public enum SmartCardKind: String, Codable, Sendable {
    case kahf, after_prayer, qiyam, morning, evening, next_prayer
}

public struct SmartCard: Sendable {
    public let kind: SmartCardKind
    public let icon: String
    public let badge: String
    public let title: String
    public let sub: String
    public let actionLabel: String
    public let actionScreen: String
}

public enum SmartCardResolver {

    static let minMs: Int64 = 60_000

    /// ISO date in the city timezone ("en-CA" = yyyy-MM-dd in the web code).
    static func isoDate(_ ms: Int64, tz: String) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: tz) ?? .current
        let c = cal.dateComponents([.year, .month, .day], from: Date(ms: ms))
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// "Fri"-style weekday abbreviation in the city timezone (web: en-US short).
    static func weekdayShort(_ ms: Int64, tz: String) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: tz) ?? .current
        let wd = cal.component(.weekday, from: Date(ms: ms))
        return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wd - 1]
    }

    /// Arabic 23h wall clock "HH:mm" in the city timezone (web fmtClock).
    static func clock(_ ms: Int64, tz: String) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: tz) ?? .current
        let c = cal.dateComponents([.hour, .minute], from: Date(ms: ms))
        return String(format: "%02d:%02d", c.hour!, c.minute!)
    }

    /// "HH:MM:SS" countdown (web fmtHMS).
    static func hms(_ msLeft: Int64) -> String {
        let s = max(0, Int(msLeft / 1000))
        return String(format: "%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
    }

    public static func resolve(now: Int64, engine: BoundPrayerEngine) -> SmartCard {
        let tz = engine.opts.timeZone
        let dateIso = isoDate(now, tz: tz)
        let sched = try! engine.daySchedule(dateIso)
        let wsToday = try! engine.sunnahWindows(dateIso)
        let yIso = isoDate(now - 86_400_000, tz: tz)
        let wsNight = try! engine.sunnahWindows(yIso) // the night in progress (maghrib → fajr)
        let dow = weekdayShort(now, tz: tz)

        // 1. Friday between Fajr and Jumu'ah → Surah Al-Kahf
        if dow == "Fri" && now >= sched.prayers[.fajr]! && now < sched.prayers[.dhuhr]! {
            return SmartCard(kind: .kahf, icon: "📖", badge: "سنة الجمعة", title: "اقرأ سورة الكهف",
                             sub: "من قال في يوم الجمعة سورة الكهف أُضيئت له من النور ما بين الجمعتين",
                             actionLabel: "افتح سورة الكهف", actionScreen: "mushaf-page")
        }
        // 2. ±20 min after an obligatory prayer (sunrise is not a salah)
        let nxt = try! engine.next(now)
        if let prevName = nxt.previousName, let prevAt = nxt.previousAt,
           prevName != .sunrise, now - prevAt >= 0, now - prevAt <= 20 * minMs {
            return SmartCard(kind: .after_prayer, icon: "📿", badge: "الوقت الحالي", title: "أذكار ما بعد الصلاة",
                             sub: "بعد صلاة \(prevName.labelAr) — الاستغفار والدعاء مستقراً",
                             actionLabel: "ابدأ الأذكار", actionScreen: "adhkar-cat")
        }
        // 3. Last third of the current night → Qiyam
        if now >= wsNight.lastThird && now < sched.prayers[.fajr]! {
            return SmartCard(kind: .qiyam, icon: "🌙", badge: "الثلث الأخير", title: "وقت القيام",
                             sub: "الثلث الأخير حتى الفجر \(clock(sched.prayers[.fajr]!, tz: tz))",
                             actionLabel: "افتح حاسبة القيام", actionScreen: "tools-qiyam")
        }
        // 4. Fajr window (fajr → duha start) → morning athkar
        if now >= sched.prayers[.fajr]! && now < wsToday.duha {
            return SmartCard(kind: .morning, icon: "🌅", badge: "الوقت الحالي", title: "أذكار الصباح",
                             sub: "ورد الصباح من حصن المسلم — اقرأها قبل أن تنشغل",
                             actionLabel: "ابدأ أذكار الصباح", actionScreen: "adhkar-cat")
        }
        // 5. Asr window (asr → maghrib) → evening athkar
        if now >= sched.prayers[.asr]! && now < sched.prayers[.maghrib]! {
            return SmartCard(kind: .evening, icon: "🌇", badge: "الوقت الحالي", title: "أذكار المساء",
                             sub: "ورد المساء من حصن المسلم — قبل غروب الشمس",
                             actionLabel: "ابدأ أذكار المساء", actionScreen: "adhkar-cat")
        }
        // 6. else → next-prayer details
        return SmartCard(kind: .next_prayer, icon: "🕌", badge: "الوقت الحالي",
                         title: "\(nxt.name.labelAr) \(clock(nxt.at, tz: tz))",
                         sub: "الصلاة القادمة بعد \(hms(nxt.at - now))",
                         actionLabel: "جدول الشهر", actionScreen: "tools-hijri")
    }
}
