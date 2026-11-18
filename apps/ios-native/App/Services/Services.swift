// ============================================================================
// Services.swift — CoreHaptics (token patterns), Adhan scheduling
// (UNCalendarNotificationTrigger on the next prayer), AudioStore (app
// container; starter pack bundled), BackupIO (document picker + iCloud Drive),
// WidgetStateBridge (App Group JSON the widgets read).
// ============================================================================

import Foundation
import UIKit
import CoreHaptics
import AVFoundation
import UserNotifications

// ---------------------------------------------------------------------------
// Haptics — CH patterns built from tokens.json haptics arrays (durations in ms
// → intensities), with UIImpactFeedbackGenerator fallback when the engine
// cannot start (older devices / simulator).
// ---------------------------------------------------------------------------

final class HapticsEngine {
    static let shared = HapticsEngine()
    private var engine: CHHapticEngine?
    private var supportsHaptics = false

    init() {
        supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
        if supportsHaptics {
            engine = try? CHHapticEngine()
            engine?.resetHandler = { try? self.engine?.start() }
        }
    }

    func prepare() { if supportsHaptics { try? engine?.start() } }

    /// tokens.json pattern, e.g. dhikrComplete [20, 60, 20, 60, 40].
    func play(pattern: [Int]) {
        if supportsHaptics {
            do {
                var events: [CHHapticEvent] = []
                var t: TimeInterval = 0
                for (i, ms) in pattern.enumerated() {
                    let intensity = i % 2 == 0 ? 1.0 : 0.55
                    events.append(CHHapticEvent(eventType: .hapticTransient, parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: Float(intensity)),
                    ], relativeTime: t))
                    t += TimeInterval(ms) / 1000
                }
                let pattern = try CHHapticPattern(events: events, parameters: [CHHapticParameter]())
                try engine?.playPattern(pattern)
                return
            } catch { /* fall through to generator */ }
        }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    func tick() { play(pattern: HapticsPatterns.dhikrTick) }
    func complete() { play(pattern: HapticsPatterns.dhikrComplete) }
    func categoryComplete() { play(pattern: HapticsPatterns.categoryComplete) }
    func pageFlip() { play(pattern: HapticsPatterns.pageFlipSettle) }
    func bookmarkSaved() { play(pattern: HapticsPatterns.bookmarkSaved) }
}

/// Tokens are loaded once (sync script guarantees the file in Resources).
enum HapticsPatterns {
    static let file = SadaqaTheme.loadFile()
    static var dhikrTick: [Int] { file.haptics?.dhikrTick ?? [10] }
    static var dhikrComplete: [Int] { file.haptics?.dhikrComplete ?? [20, 60, 20, 60, 40] }
    static var categoryComplete: [Int] { file.haptics?.categoryComplete ?? [40, 120, 40, 120, 40] }
    static var pageFlipSettle: [Int] { file.haptics?.pageFlipSettle ?? [15] }
    static var bookmarkSaved: [Int] { file.haptics?.bookmarkSaved ?? [25, 60, 25] }
}

// ---------------------------------------------------------------------------
// Adhan scheduling — UNCalendarNotificationTrigger on the next prayer instant
// (UNCalendar = the exact OS schedule from the platform matrix §3).
// ---------------------------------------------------------------------------

struct AdhanScheduler {
    static let shared = AdhanScheduler()

    func reschedule(db: SadaqaDatabase) {
        let opts = db.engineOptions()
        let tz = opts.timeZone
        let now = Date.nowMs
        let iso = TodayView.iso(now, tz: tz)
        let next = try? PrayerEngine.next(now, opts)
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        guard let n = next else { return }
        let content = UNMutableNotificationContent()
        content.title = "الأذان — \(n.name.labelAr)"
        content.body = "حان الآن وقت صلاة \(n.name.labelAr)"
        content.sound = UNNotificationSound(named: UNNotificationSoundName("adhan.caf"))
        var comps = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day, .hour, .minute], from: Date(ms: n.at))
        comps.timeZone = TimeZone(identifier: tz)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let req = UNNotificationRequest(identifier: "adhan-\(n.name.rawValue)", content: content, trigger: trigger)
        center.add(req)
        // follow-on request for the day's remaining prayers (recomputed on app use)
        if let sched = try? PrayerEngine.daySchedule(iso, opts) {
            for name in PrayerName.allCases where name != n.name && sched.prayers[name]! > now {
                let c2 = UNMutableNotificationContent()
                c2.title = "الأذان — \(name.labelAr)"
                c2.body = "حان الآن وقت صلاة \(name.labelAr)"
                c2.sound = UNNotificationSound(named: UNNotificationSoundName("adhan.caf"))
                var c2d = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day, .hour, .minute], from: Date(ms: sched.prayers[name]!))
                c2d.timeZone = TimeZone(identifier: tz)
                let t2 = UNCalendarNotificationTrigger(dateMatching: c2d, repeats: false)
                center.add(UNNotificationRequest(identifier: "adhan-\(name.rawValue)", content: c2, trigger: t2))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// AudioStore — per-ayah files under Application Support/audio/<reciter>/;
// starter pack (Fatiha · Alafasy) ships in Resources/audio.
// ---------------------------------------------------------------------------

final class AudioStore {
    static let shared = AudioStore()

    private var baseDir: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SadaqaJaria/audio", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Resolve local audio for an ayah: downloads dir → bundled starter → nil.
    func localURL(reciter: String, surah: Int, ayah: Int) -> URL? {
        let key = String(format: "%03d%03d.mp3", surah, ayah)
        let downloaded = baseDir.appendingPathComponent("\(reciter)/\(key)")
        if FileManager.default.fileExists(atPath: downloaded.path) { return downloaded }
        let starter = Bundle.main.resourceURL?.appendingPathComponent("audio/starter/alafasy/\(key)")
        if let s = starter, FileManager.default.fileExists(atPath: s.path) { return s }
        return nil
    }

    func store(data: Data, reciter: String, surah: Int, ayah: Int) throws {
        let dir = baseDir.appendingPathComponent(reciter, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try data.write(to: dir.appendingPathComponent(String(format: "%03d%03d.mp3", surah, ayah)))
    }
}

// ---------------------------------------------------------------------------
// BackupIO — `.sadaqa` via UIDocumentPicker (Files/iCloud Drive). Export uses
// ShareSheet (user may pick iCloud Drive → the iCloud hook), import uses
// UIDocumentPickerViewController restricted to .sadaqa/JSON.
// ---------------------------------------------------------------------------

enum BackupIO {
    static func writeTempSadaqa(payloadJson: String, manifest: JSONValue, now: Int64) -> URL? {
        let name = "sadaqa-backup-\(TodayView.iso(now, tz: "UTC")).sadaqa"
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        let doc = JSONValue.object(["manifest": manifest, "payload": (try? JSONValue.parse(payloadJson)) ?? .null])
        guard let data = CanonicalJSON.serialize(doc).data(using: .utf8) else { return nil }
        try? data.write(to: tmp)
        return tmp
    }
}

// ---------------------------------------------------------------------------
// WidgetStateBridge — app group JSON the WidgetKit providers read: engine
// options + next prayer + a daily dhikr pick + reading position.
// ---------------------------------------------------------------------------

enum WidgetStateBridge {
    static let appGroupId = "group.app.sadaqa.shared"

    static func writeShared(_ json: String, as name: String) {
        guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent(name) else { return }
        try? json.data(using: .utf8)?.write(to: url)
    }

    static func prayersChanged() { /* timeline invalidation happens in publish */ }

    /// Publish current settings + next prayer so widgets compute offline.
    static func publishWidgetState(db: SadaqaDatabase) {
        let opts = db.engineOptions()
        let next = try? PrayerEngine.next(Date.nowMs, opts)
        var state: [String: JSONValue] = [
            "location": .object([
                "lat": .number(opts.lat), "lng": .number(opts.lng),
                "timeZone": .string(opts.timeZone),
                "method": .string(opts.method), "madhab": .string(opts.madhab),
                "highLatitudeRule": .string(opts.highLatitudeRule),
            ]),
            "publishedAt": .number(Double(Date.nowMs)),
        ]
        if let n = next {
            state["next"] = .object([
                "name": .string(n.name.rawValue), "at": .number(Double(n.at)),
                "prevName": .string(n.previousName?.rawValue ?? ""), "prevAt": .number(Double(n.previousAt ?? 0)),
            ])
        }
        // daily dhikr pick: deterministic by day so all widgets agree
        let day = dayKeyOf(Date.nowMs)
        var dhikr = ""
        try? db.queue.read { db in
            let row = try Row.fetchOne(db, sql: "SELECT item_id FROM athkar_items WHERE category_id = (SELECT category_id FROM athkar_categories WHERE solar_window = 'fajr' LIMIT 1) ORDER BY sort_order LIMIT 1")
            if let id = row?["item_id"] as String? {
                let text = try Row.fetchOne(db, sql: "SELECT text_ar FROM athkar_items WHERE item_id = ?", arguments: [id])
                dhikr = text?["text_ar"] as String? ?? ""
            }
        }
        state["dailyDhikr"] = .string(dhikr)
        state["day"] = .string(day)
        writeShared(CanonicalJSON.serialize(.object(state)), as: "widget-state.json")
        WidgetCenterWrapper.reloadAll()
    }

    static func publishReadingPosition(page: Int, db: SadaqaDatabase) {
        writeShared("{\"page\":\(page)}", as: "reading-position.json")
    }
}

import WidgetKit
/// Re-export point so the app target can request widget timeline refreshes.
enum WidgetCenterWrapper {
    static func reloadAll() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
