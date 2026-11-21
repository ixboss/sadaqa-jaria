// ============================================================================
// HijriEngine.swift — port of packages/core-data/engines/hijri.js (golden)
// Uses Calendar(identifier: .islamicUmmAlQura) — Apple ICU's umalqura tables,
// the same dataset Intl's islamic-umalqura (web) uses. ICU-version caveat from
// hijri.js applies verbatim: device tables may differ ±1 day; `hijri_adjust`
// (user setting) is the user-facing correction, never a silent code fix.
// ============================================================================

import Foundation

public enum HijriError: Error {
    case invalidDate(String)
    case monthNotFound(String)
    case dateDoesNotExist(String)
}

public struct HijriDate: Codable, Equatable, Sendable {
    public var y: Int
    public var m: Int
    public var d: Int
}

public enum HijriEngine {

    static let monthsAr = ["محرم", "صفر", "ربيع الأول", "ربيع الثاني", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"]

    static let utcTimeZone = TimeZone(secondsFromGMT: 0) ?? .current

    static func umalqura() -> Calendar {
        var cal = Calendar(identifier: .islamicUmmAlQura)
        cal.timeZone = utcTimeZone
        return cal
    }

    static func gregorianUTC() -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = utcTimeZone
        return cal
    }

    static func noonUTC(_ iso: String) -> Date {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3,
              let d = gregorianUTC().date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12)) else {
            return Date()
        }
        return d
    }

    /** Hijri parts of a UTC-noon instant (web hijriParts parity). */
    static func hijriParts(_ instant: Date) -> HijriDate {
        let c = umalqura().dateComponents([.year, .month, .day], from: instant)
        return HijriDate(y: c.year ?? 1445, m: c.month ?? 1, d: c.day ?? 1)
    }

    static func isoOf(_ instant: Date) -> String {
        let c = gregorianUTC().dateComponents([.year, .month, .day], from: instant)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    /// Gregorian "YYYY-MM-DD" (UTC day) → Hijri.
    public static func toHijri(_ dateIso: String) -> HijriDate {
        hijriParts(noonUTC(dateIso))
    }

    /// Hijri → Gregorian "YYYY-MM-DD" (anchored day-scan — hijri.js parity).
    public static func fromHijri(_ h: HijriDate) throws -> String {
        guard h.m >= 1 && h.m <= 12 && h.d >= 1 && h.d <= 30 else { throw HijriError.invalidDate("invalid hijri date: \(h.y)-\(h.m)-\(h.d)") }
        // Reference: Muharram 1, 1445 AH = 19 July 2023 (Umm al-Qura).
        let ref = gregorianUTC().date(from: DateComponents(year: 2023, month: 7, day: 19, hour: 12)) ?? Date(timeIntervalSince1970: 1689768000)
        let yearStart = ref.addingTimeInterval(Double(Int64((Double(h.y - 1445) * 354.36707).rounded())) * 86_400)
        let anchor = yearStart.addingTimeInterval(Double(Int64((Double(h.m - 1) * 29.53).rounded()) - 14) * 86_400)
        var first: Date?
        for i in 0...90 {
            let t = anchor.addingTimeInterval(Double(i) * 86_400)
            let p = hijriParts(t)
            if p.y == h.y && p.m == h.m { first = t; break }
        }
        guard let f = first else { throw HijriError.monthNotFound("hijri month not found: \(h.y)-\(h.m)") }
        let instant = f.addingTimeInterval(Double(h.d - 1) * 86_400)
        let p = hijriParts(instant)
        guard p.y == h.y && p.m == h.m && p.d == h.d else { throw HijriError.dateDoesNotExist("hijri date does not exist: \(h.y)-\(h.m)-\(h.d)") }
        return isoOf(instant)
    }

    public static func monthNameAr(_ m: Int) throws -> String {
        guard m >= 1 && m <= 12 else { throw HijriError.invalidDate("hijri month must be 1..12") }
        return monthsAr[m - 1]
    }

    public static let minAdjust = -3
    public static let maxAdjust = 3

    /// Clamps `hijri_adjust` to the supported [-3, +3] day window.
    public static func clampAdjust(_ adjust: Int) -> Int {
        min(max(adjust, minAdjust), maxAdjust)
    }

    /// ±N day adjustment applied at the display layer (schema: hijri_adjust).
    public static func withAdjust(_ dateIso: String, _ adjust: Int) -> HijriDate {
        let clamped = clampAdjust(adjust)
        let shifted = noonUTC(dateIso).addingTimeInterval(Double(clamped) * 86_400)
        return toHijri(isoOf(shifted))
    }

    /// Day-scan over a Gregorian year (scanYear port; skipAfterMatch jumps the
    /// cursor once a match is found — 20 for single-day events, 1 for clusters).
    static func scanYear(_ year: Int, predicate: (HijriDate) -> Bool, skipAfterMatch: Int = 20) -> [(instant: Date, hijri: HijriDate)] {
        var out: [(Date, HijriDate)] = []
        guard var t = gregorianUTC().date(from: DateComponents(year: year, month: 1, day: 1, hour: 12)),
              let end = gregorianUTC().date(from: DateComponents(year: year + 1, month: 1, day: 1, hour: 12)) else {
            return out
        }
        while t < end {
            let h = hijriParts(t)
            if predicate(h) {
                out.append((t, h))
                t = t.addingTimeInterval(Double(skipAfterMatch) * 86_400)
                continue
            }
            t = t.addingTimeInterval(86_400)
        }
        return out
    }

    public struct IslamicEvent: Codable, Sendable {
        public let key: String
        public let hijri: HijriDate
        public let gregorian: String
    }

    /// ramadan_start (9/1), eid_fitr (10/1), arafah (12/9), eid_adha (12/10), ashura (1/10).
    public static func events(_ gregorianYear: Int) -> [IslamicEvent] {
        let targets: [(key: String, m: Int, d: Int)] = [
            ("ashura", 1, 10), ("ramadan_start", 9, 1), ("eid_fitr", 10, 1), ("arafah", 12, 9), ("eid_adha", 12, 10),
        ]
        var out: [IslamicEvent] = []
        for t in targets {
            for hit in scanYear(gregorianYear, predicate: { h in h.y >= 1400 && h.y <= 1600 && h.m == t.m && h.d == t.d }) {
                out.append(IslamicEvent(key: t.key, hijri: HijriDate(y: hit.hijri.y, m: t.m, d: t.d), gregorian: isoOf(hit.instant)))
            }
        }
        return out.sorted { $0.gregorian < $1.gregorian }
    }

    /// White Days (13/14/15 of every lunar month) intersecting a Gregorian year.
    public static func whiteDays(_ gregorianYear: Int) -> [IslamicEvent] {
        scanYear(gregorianYear, predicate: { h in h.y >= 1400 && h.y <= 1600 && (h.d == 13 || h.d == 14 || h.d == 15) }, skipAfterMatch: 1)
            .map { IslamicEvent(key: "white_day", hijri: $0.hijri, gregorian: isoOf($0.instant)) }
            .sorted { $0.gregorian < $1.gregorian }
    }
}
