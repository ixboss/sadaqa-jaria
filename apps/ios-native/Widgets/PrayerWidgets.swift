// ============================================================================
// PrayerWidgets.swift — WidgetKit: Home Screen countdown + Lock Screen
// accessory widgets + a daily-dhikr widget. Data contract: the app publishes
// widget-state.json (engine options + next prayer + daily dhikr pick) into the
// shared App Group; the provider recomputes the countdown OFFLINE with the
// same adhan engine — no db access from the widget (cheap timelines).
// ============================================================================

import WidgetKit
import SwiftUI
import Adhan

private let appGroupId = "group.app.sadaqa.shared"

/// Local stand-ins for TodayView helpers (the widget target compiles without
/// the App sources — semantics must stay identical).
private func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

private func isoToday(_ ms: Int64, tz: String) -> String {
    var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: tz) ?? .current
    let c = cal.dateComponents([.year, .month, .day], from: Date(ms: ms))
    return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
}

private func clock(_ ms: Int64, tz: String) -> String {
    PrayerEngine.formatClock12h(ms, timeZone: tz)
}

struct WidgetState: Codable {
    struct Location: Codable {
        let lat: Double
        let lng: Double
        let timeZone: String
        let method: String
        let madhab: String
        let highLatitudeRule: String
    }
    struct Next: Codable { let name: String; let at: Double; let prevName: String; let prevAt: Double }
    let location: Location
    let publishedAt: Double
    let next: Next?
    let dailyDhikr: String?
    let day: String?
}

extension WidgetState {
    static func load() -> WidgetState? {
        guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent("widget-state.json"),
            let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WidgetState.self, from: data)
    }

    func options() -> EngineOptions {
        EngineOptions(lat: location.lat, lng: location.lng, timeZone: location.timeZone,
                      method: location.method, madhab: location.madhab,
                      highLatitudeRule: location.highLatitudeRule)
    }

    /// Recompute "next" NOW from the engine (the stored snapshot ages within
    /// hours; the timeline entries regenerate from this each refresh).
    func liveNext(now: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) -> NextPrayer? {
        try? PrayerEngine.next(now, options())
    }
}

// ---------------------------------------------------------------------------
// Timeline — 1 entry per remaining prayer of the ±1 day window.
// ---------------------------------------------------------------------------

struct PrayerEntry: TimelineEntry {
    let date: Date
    let state: WidgetState?
    let next: NextPrayer?
    let dhikr: String
}

struct PrayerProvider: TimelineProvider {
    func placeholder(in context: Context) -> PrayerEntry {
        PrayerEntry(date: Date(), state: nil, next: nil, dhikr: "")
    }

    func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
        let state = WidgetState.load()
        completion(PrayerEntry(date: Date(), state: state, next: state?.liveNext(), dhikr: state?.dailyDhikr ?? ""))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
        let state = WidgetState.load()
        let now = nowMs()
        var entries: [PrayerEntry] = []
        // one entry per future prayer instant across the scan window
        if let state {
            let opts = state.options()
            let todayIso = isoToday(now, tz: opts.timeZone)
            let tomorrowIso = PrayerEngine.shiftCivilIso(todayIso, by: 1)
            var upcoming: [(name: PrayerName, at: Int64)] = []
            for dayIso in [todayIso, tomorrowIso] {
                if let sched = try? PrayerEngine.daySchedule(dayIso, opts) {
                    for name in PrayerName.allCases {
                        if let at = sched.prayers[name], at > now {
                            upcoming.append((name: name, at: at))
                        }
                    }
                }
            }
            upcoming.sort { $0.at < $1.at }
            var windowStart = now
            for p in upcoming {
                entries.append(PrayerEntry(date: Date(ms: windowStart),
                                           state: state,
                                           next: NextPrayer(name: p.name, at: p.at, previousName: nil, previousAt: nil),
                                           dhikr: state.dailyDhikr ?? ""))
                windowStart = max(windowStart, p.at)
            }
        }
        if entries.isEmpty {
            entries = [PrayerEntry(date: Date(), state: state, next: state?.liveNext(), dhikr: state?.dailyDhikr ?? "")]
        }
        // refresh after the last entry (next day)
        let refresh = Calendar.current.date(byAdding: .hour, value: 12, to: Date()) ?? Date().addingTimeInterval(43_200)
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

struct PrayerCountdownWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PrayerEntry

    private static let labels: [String: String] = [
        "fajr": "الفجر", "sunrise": "الشروق", "dhuhr": "الظهر",
        "asr": "العصر", "maghrib": "المغرب", "isha": "العشاء",
    ]

    var body: some View {
        switch family {
        case .accessoryCircular, .accessoryRectangular, .accessoryInline:
            lockScreen
        default:
            homeScreen
        }
    }

    private var homeScreen: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let n = entry.next ?? entry.state?.liveNext() {
                Text("الصلاة القادمة").font(.system(size: 12)).foregroundStyle(.secondary)
                Text(Self.labels[n.name.rawValue] ?? n.name.rawValue)
                    .font(.system(size: 22, weight: .bold))
                Text(clock(n.at, tz: entry.state?.location.timeZone ?? "UTC"))
                    .font(.system(size: 15)).monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(Date(ms: n.at), style: .timer)
                    .font(.system(size: 13)).monospacedDigit().foregroundStyle(.secondary)
            } else {
                Text("افتح التطبيق لضبط الموقع").font(.system(size: 13))
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(4)
    }

    private var lockScreen: some View {
        let n = entry.next ?? entry.state?.liveNext()
        return VStack(alignment: .leading, spacing: 2) {
            if let n {
                Text(Self.labels[n.name.rawValue] ?? "")
                    .font(.system(size: 13, weight: .semibold))
                Text(clock(n.at, tz: entry.state?.location.timeZone ?? "UTC"))
                    .font(.system(size: 13)).monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
    }
}

struct DhikrWidgetView: View {
    let entry: PrayerEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("ذكر اليوم").font(.system(size: 11)).foregroundStyle(.secondary)
            Text(entry.dhikr.isEmpty ? "أذكار الصباح" : entry.dhikr)
                .font(.system(size: 13))
                .lineLimit(4)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .padding(4)
    }
}

// ---------------------------------------------------------------------------
// Widget declarations
// ---------------------------------------------------------------------------

struct PrayerCountdownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SadaqaPrayerCountdown", provider: PrayerProvider()) { entry in
            PrayerCountdownWidgetView(entry: entry)
        }
        .configurationDisplayName("عدّاد الصلاة")
        .description("الوقت المتبقي للصلاة القادمة — يعمل بدون إنترنت")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct DailyDhikrWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SadaqaDailyDhikr", provider: PrayerProvider()) { entry in
            DhikrWidgetView(entry: entry)
        }
        .configurationDisplayName("ذكر اليوم")
        .description("ذكر من حصن المسلم يتجدد يومياً")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

@main
struct SadaqaWidgetBundle: WidgetBundle {
    var body: some Widget {
        PrayerCountdownWidget()
        DailyDhikrWidget()
    }
}
