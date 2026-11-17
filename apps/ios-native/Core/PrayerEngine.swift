// ============================================================================
// PrayerEngine.swift — port of packages/core-data/engines/prayer.js (golden)
// ---------------------------------------------------------------------------
// CONTRACT (see prayer.js header): adhan's output Dates are true UTC instants;
// the only device-dependent input is the civil date read from the anchor Date
// via RUNTIME-LOCAL getters. Web anchors with `new Date(y, mo, d, 12)` — a
// runtime-local noon. Swift equivalent: Calendar.current.date(from:) with
// hour 12 — identical semantics (local calendar, local components). Output is
// epoch ms, identical on every device for the same inputs. CI proves this by
// replaying the web-generated fixtures (Fixtures/prayer/*.json) with 0 ms
// tolerance for 6 cities × DST months × 2 method/madhab/HLR variants.
//
// Elevation decision (parity over micro-precision): adhan-js has no elevation
// parameter, so the shared engine never passes elevation anywhere — this port
// must not add it either (cities.elevation is stored but ignored, deliberate).
// ============================================================================

import Foundation
import Adhan

/// Canonical prayer order (display + API) — matches prayer.js PRAYER_NAMES.
public enum PrayerName: String, CaseIterable, Codable, Sendable {
    case fajr, sunrise, dhuhr, asr, maghrib, isha

    var adhan: Prayer {
        switch self {
        case .fajr: return .fajr
        case .sunrise: return .sunrise
        case .dhuhr: return .dhuhr
        case .asr: return .asr
        case .maghrib: return .maghrib
        case .isha: return .isha
        }
    }

    /// Arabic display label (single source: today.js PRAYER_LABELS).
    public var labelAr: String {
        switch self {
        case .fajr: return "الفجر"
        case .sunrise: return "الشروق"
        case .dhuhr: return "الظهر"
        case .asr: return "العصر"
        case .maghrib: return "المغرب"
        case .isha: return "العشاء"
        }
    }
}

public struct EngineOptions: Codable, Equatable, Sendable {
    public var lat: Double
    public var lng: Double
    public var timeZone: String
    public var method: String      // CALC_METHODS keys (prayer.js METHOD_MAP)
    public var madhab: String      // 'shafi' | 'hanafi'
    public var highLatitudeRule: String
    public var offsets: [String: Int]  // per-prayer minute adjustments

    public init(lat: Double, lng: Double, timeZone: String,
                method: String = "umm_al_qura", madhab: String = "shafi",
                highLatitudeRule: String = "middle_of_the_night", offsets: [String: Int] = [:]) {
        self.lat = lat; self.lng = lng; self.timeZone = timeZone
        self.method = method; self.madhab = madhab; self.highLatitudeRule = highLatitudeRule
        self.offsets = offsets
    }
}

public struct DaySchedule: Sendable {
    public let date: String
    public let prayers: [PrayerName: Int64]   // epoch ms
    public let previousIsha: Int64
}

public struct NextPrayer: Sendable {
    public let name: PrayerName
    public let at: Int64
    public let previousName: PrayerName?
    public let previousAt: Int64?
}

public struct SunnahWindows: Sendable {
    public let duha: Int64
    public let duhaEnd: Int64
    public let midnight: Int64
    public let lastThird: Int64
    public let nextFajr: Int64
}

public enum PrayerError: Error, CustomStringConvertible {
    case unknownMethod(String)
    case unknownMadhab(String)
    case unknownHLR(String)
    case invalidCoords
    case invalidOffset(String)
    case cannotResolveOffset(String)
    public var description: String {
        switch self {
        case .unknownMethod(let m): return "unknown calc method: \(m)"
        case .unknownMadhab(let m): return "unknown madhab: \(m)"
        case .unknownHLR(let m): return "unknown highLatitudeRule: \(m)"
        case .invalidCoords: return "invalid lat/lng"
        case .invalidOffset(let s): return s
        case .cannotResolveOffset(let s): return s
        }
    }
}

public enum PrayerEngine {

    // prayer.js METHOD_MAP — same 12 methods, same order semantics ("gulf"
    // deliberately absent — no Gulf factory in vendored adhan 4.4.6).
    public static let calcMethods: [String] = [
        "muslim_world_league", "egyptian", "umm_al_qura", "karachi",
        "moonsighting", "north_america", "dubai", "kuwait", "qatar",
        "singapore", "turkey", "tehran",
    ]
    public static let madhabs: [String] = ["shafi", "hanafi"]
    public static let highLatitudeRules: [String] = [
        "middle_of_the_night", "seventh_of_the_night", "twilight_angle",
    ]

    // ------------------------------------------------------------------
    // parameters (buildParams port)
    // ------------------------------------------------------------------
    static func buildParams(_ opts: EngineOptions) throws -> CalculationParameters {
        // PARITY NOTE: "gulf" is deliberately absent everywhere (resolved
        // 2026-11-18) — the vendored adhan 4.4.6 defines no Gulf factory, so
        // the golden METHOD_MAP no longer lists it and the Settings UIs offer
        // exactly these 12 methods. A stale "gulf" pref falls to the nil case
        // below and throws, matching the golden buildParams.
        guard let name = adhanMethodName(opts.method),
              let method = CalculationMethod(rawValue: name) else {
            throw PrayerError.unknownMethod(opts.method)
        }
        var params = method.params
        // adhan-swift's madhab is a non-optional field with a default — reject
        // unknown values BEFORE assignment (golden throws too).
        let madhab: Madhab
        switch opts.madhab {
        case "shafi": madhab = .shafi
        case "hanafi": madhab = .hanafi
        default: throw PrayerError.unknownMadhab(opts.madhab)
        }
        params.madhab = madhab
        switch opts.highLatitudeRule {
        case "middle_of_the_night": params.highLatitudeRule = .middleOfTheNight
        case "seventh_of_the_night": params.highLatitudeRule = .seventhOfTheNight
        case "twilight_angle": params.highLatitudeRule = .twilightAngle
        default: throw PrayerError.unknownHLR(opts.highLatitudeRule)
        }
        for (name, minutes) in opts.offsets {
            guard let prayer = PrayerName(rawValue: name) else {
                throw PrayerError.invalidOffset("unknown prayer for offset: \(name)")
            }
            guard abs(minutes) <= 60 else {
                throw PrayerError.invalidOffset("offset for \(name) out of range: \(minutes)")
            }
            params.adjustments.fajr = prayer == .fajr ? minutes : params.adjustments.fajr
            params.adjustments.sunrise = prayer == .sunrise ? minutes : params.adjustments.sunrise
            params.adjustments.dhuhr = prayer == .dhuhr ? minutes : params.adjustments.dhuhr
            params.adjustments.asr = prayer == .asr ? minutes : params.adjustments.asr
            params.adjustments.maghrib = prayer == .maghrib ? minutes : params.adjustments.maghrib
            params.adjustments.isha = prayer == .isha ? minutes : params.adjustments.isha
        }
        return params
    }

    /// Web keys → adhan-swift CalculationMethod rawValues (camelCase in the
    /// Swift port). Unknown keys (incl. "gulf") return nil → unknownMethod.
    static func adhanMethodName(_ key: String) -> String? {
        switch key {
        case "muslim_world_league": return "muslimWorldLeague"
        case "egyptian": return "egyptian"
        case "umm_al_qura": return "ummAlQura"
        case "karachi": return "karachi"
        case "moonsighting": return "moonsightingCommittee"
        case "north_america": return "northAmerica"
        case "dubai": return "dubai"
        case "kuwait": return "kuwait"
        case "qatar": return "qatar"
        case "singapore": return "singapore"
        case "turkey": return "turkey"
        case "tehran": return "tehran"
        default: return nil
        }
    }

    // ------------------------------------------------------------------
    // timezone helpers (civilParts / tzOffsetMinutes / wallClockToInstant)
    // ------------------------------------------------------------------
    public struct CivilParts: Equatable {
        var y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int // mo 0-based (JS parity)
    }

    /** Civil date/time parts of an instant in a timezone (hourCycle h23).
     *  Throws on unknown tz — the golden (Intl) rejects unknown zones loudly. */
    public static func civilParts(_ instantMs: Int64, timeZone: String) throws -> CivilParts {
        guard let tz = TimeZone(identifier: timeZone) else {
            throw PrayerError.cannotResolveOffset("unknown timezone: \(timeZone)")
        }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let comps = cal.dateComponents([.year, .month, .day, .hour, .minute, .second], from: Date(ms: instantMs))
        return CivilParts(y: comps.year!, mo: comps.month! - 1, d: comps.day!, h: comps.hour!, mi: comps.minute!, s: comps.second!)
    }

    /**
     * UTC offset (minutes, east positive) of a timezone at a wall-clock moment.
     * Same probe list as prayer.js (DST jumps never exceed ±2h).
     */
    static func tzOffsetMinutes(_ p: CivilParts, timeZone: String) throws -> Int {
        let naive = utcMs(y: p.y, mo: p.mo, d: p.d, h: p.h, mi: p.mi, s: p.s)
        let guesses = [0, 60, -60, 120, -120, 180, -180, 210, -210, 240, -240, 300, -300, 330, -330, 345, -345, 420, -420, 480, -480, 540, -540, 570, -570, 600, -600, 660, -660, 720, -720, 780, -780, 840, -840]
        for guess in guesses {
            let instant = naive - Int64(guess) * 60_000
            let back = try civilParts(instant, timeZone: timeZone)
            if back == p { return guess }
        }
        throw PrayerError.cannotResolveOffset("cannot resolve UTC offset for \(timeZone) at \(p.y)-\(p.mo + 1)-\(p.d) \(p.h):\(p.mi):\(p.s)")
    }

    /** Wall-clock parts (in the city) → true instant (epoch ms). */
    public static func wallClockToInstant(_ p: CivilParts, timeZone: String) throws -> Int64 {
        let off = try tzOffsetMinutes(p, timeZone: timeZone)
        return utcMs(y: p.y, mo: p.mo, d: p.d, h: p.h, mi: p.mi, s: p.s) - Int64(off) * 60_000
    }

    static func utcMs(y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int) -> Int64 {
        var comps = DateComponents()
        comps.year = y; comps.month = mo + 1; comps.day = d; comps.hour = h; comps.minute = mi; comps.second = s
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return Int64(cal.date(from: comps)!.timeIntervalSince1970 * 1000)
    }

    /// Civil-date anchor in the city: RUNTIME-LOCAL noon (the parity anchor).
    static func localNoonAnchor(y: Int, mo: Int, d: Int) -> Date {
        var comps = DateComponents()
        comps.year = y; comps.month = mo + 1; comps.day = d; comps.hour = 12; comps.minute = 0; comps.second = 0
        return Calendar.current.date(from: comps)!
    }

    // ------------------------------------------------------------------
    // core computation
    // ------------------------------------------------------------------
    public static func computeForDate(y: Int, mo: Int, d: Int, opts: EngineOptions) throws -> [PrayerName: Int64] {
        guard opts.lat >= -90 && opts.lat <= 90, opts.lng >= -180 && opts.lng <= 180 else { throw PrayerError.invalidCoords }
        let params = try buildParams(opts)
        let coords = Coordinates(latitude: opts.lat, longitude: opts.lng)
        let anchor = localNoonAnchor(y: y, mo: mo, d: d)
        let pt = PrayerTimes(coordinates: coords, date: anchor, calculationParameters: params)
        var times: [PrayerName: Int64] = [:]
        for name in PrayerName.allCases {
            guard let t = pt.timeForPrayer(name.adhan) else { throw PrayerError.invalidCoords }
            times[name] = t.ms
        }
        return times
    }

    /** daySchedule(dateIso, opts) — includes the previous day's isha. */
    public static func daySchedule(_ dateIso: String, _ opts: EngineOptions) throws -> DaySchedule {
        let parts = dateIso.split("-").map { Int($0)! }
        let (y, mo, d) = (parts[0], parts[1], parts[2])
        let times = try computeForDate(y: y, mo: mo - 1, d: d, opts: opts)
        // prev civil day in UTC (JS: new Date(Date.UTC(y, mo-1, d-1)))
        let prev = try civilParts(utcMs(y: y, mo: mo - 1, d: d - 1, h: 12, mi: 0, s: 0), timeZone: "UTC")
        let prevTimes = try computeForDate(y: prev.y, mo: prev.mo, d: prev.d, opts: opts)
        return DaySchedule(date: dateIso, prayers: times, previousIsha: prevTimes[.isha]!)
    }

    /** next(nowEpochMs, opts) — scans yesterday/today/tomorrow in the city tz. */
    public static func next(_ nowMs: Int64, _ opts: EngineOptions) throws -> NextPrayer {
        let parts = try civilParts(nowMs, timeZone: opts.timeZone)
        func iso(_ p: CivilParts) -> String {
            String(format: "%04d-%02d-%02d", p.y, p.mo + 1, p.d)
        }
        let yP = try civilParts(nowMs - 86_400_000, timeZone: opts.timeZone)
        let nP = try civilParts(nowMs + 86_400_000, timeZone: opts.timeZone)
        let yesterday = try daySchedule(iso(yP), opts)
        let today = try daySchedule(iso(parts), opts)
        let tomorrow = try daySchedule(iso(nP), opts)

        struct Flat { let name: PrayerName; let at: Int64 }
        let flat: [Flat] =
            PrayerName.allCases.map { Flat(name: $0, at: yesterday.prayers[$0]!) } +
            PrayerName.allCases.map { Flat(name: $0, at: today.prayers[$0]!) } +
            PrayerName.allCases.map { Flat(name: $0, at: tomorrow.prayers[$0]!) }
        var prevIdx = -1
        for (i, f) in flat.enumerated() where f.at <= nowMs { prevIdx = i }
        let nextIdx = prevIdx + 1
        guard nextIdx < flat.count else { throw PrayerError.invalidOffset("no next prayer found (unreachable for ±1 day scan)") }
        let prev = prevIdx >= 0 ? flat[prevIdx] : nil
        return NextPrayer(name: flat[nextIdx].name, at: flat[nextIdx].at,
                          previousName: prev?.name, previousAt: prev?.at)
    }

    /** sunnahWindows(dateIso, opts) — REA_SPEC §4.3 formulas. */
    public static func sunnahWindows(_ dateIso: String, _ opts: EngineOptions) throws -> SunnahWindows {
        let parts = dateIso.split("-").map { Int($0)! }
        let (y, mo, d) = (parts[0], parts[1], parts[2])
        let params = try buildParams(opts)
        let coords = Coordinates(latitude: opts.lat, longitude: opts.lng)
        let pt = PrayerTimes(coordinates: coords, date: localNoonAnchor(y: y, mo: mo - 1, d: d), calculationParameters: params)
        let sunriseI = try pt.timeForPrayer(.sunrise)!.ms
        let maghribI = try pt.timeForPrayer(.maghrib)!.ms
        let nextDay = try civilParts(utcMs(y: y, mo: mo - 1, d: d + 1, h: 12, mi: 0, s: 0), timeZone: "UTC")
        let nextFajrI = try computeForDate(y: nextDay.y, mo: nextDay.mo, d: nextDay.d, opts: opts)[.fajr]!
        let nightLength = nextFajrI - maghribI
        return SunnahWindows(
            duha: sunriseI + Int64(((Double(maghribI - sunriseI)) * 0.25).rounded()),
            duhaEnd: sunriseI + Int64(((Double(maghribI - sunriseI)) * 0.5).rounded()),
            midnight: maghribI + Int64((Double(nightLength) / 2).rounded()),
            lastThird: maghribI + Int64(((Double(nightLength) * 2) / 3).rounded()),
            nextFajr: nextFajrI)
    }

    /** Bound engine (reminders/anchors consumers). */
    public static func bind(_ opts: EngineOptions) -> BoundPrayerEngine {
        BoundPrayerEngine(opts: opts)
    }
}

public struct BoundPrayerEngine: Sendable {
    public let opts: EngineOptions
    public func daySchedule(_ iso: String) throws -> DaySchedule { try PrayerEngine.daySchedule(iso, opts) }
    public func sunnahWindows(_ iso: String) throws -> SunnahWindows { try PrayerEngine.sunnahWindows(iso, opts) }
    public func next(_ now: Int64) throws -> NextPrayer { try PrayerEngine.next(now, opts) }
}

extension Date {
    init(ms: Int64) { self = Date(timeIntervalSince1970: Double(ms) / 1000) }
    var ms: Int64 { Int64((timeIntervalSince1970 * 1000).rounded()) }
}
