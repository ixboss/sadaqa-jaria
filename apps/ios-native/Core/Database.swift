// ============================================================================
// Database.swift — GRDB hosting of the exact sadaqa.db (schema.sql, same file
// the web/Electron targets ship). Copies the bundled seed into Application
// Support on first run, opens WAL + FK ON. The `.sadaqa` export/import
// pipeline mirrors apps/web-desktop/js/data/backup.js statement-for-statement:
// same queries, same entity mappers, same upserts — all via GRDB bound
// arguments (parameter binding; no string-assembled SQL anywhere; table names
// in the wipe list and SELECT lists are fixed literals, never user input).
// ============================================================================

import Foundation
import GRDB
import CryptoKit

public final class SadaqaDatabase: @unchecked Sendable {

    public static let shared: SadaqaDatabase = SadaqaDatabase.openOrFallback()

    public let queue: DatabaseQueue
    public let loadError: String?
    /// True when running on the read-only or in-memory recovery queues — the
    /// app shows the blocking recovery screen (SadaqaApp.RootView) instead of
    /// silently browsing an empty copy of the user's data (2026-11 audit fix:
    /// the old behavior swapped to an in-memory queue invisibly, so user data
    /// disappeared and session writes were lost on exit).
    public let isReadOnly: Bool

    /// Internal (not private) so the parity test target can open isolated
    /// temp copies of the bundled db for round-trip tests.
    init(queue: DatabaseQueue, loadError: String? = nil, isReadOnly: Bool = false) {
        self.queue = queue
        self.loadError = loadError
        self.isReadOnly = isReadOnly
    }

    static func openOrFallback() -> SadaqaDatabase {
        do {
            return try open()
        } catch {
            // Never crash on launch — but never pretend everything is fine
            // either. Recovery ladder:
            //   1. re-open the EXISTING file read-only (user data stays visible)
            //   2. in-memory queue as the last resort; both surface loadError,
            //      and the app gates the UI behind the recovery screen.
            if let roQueue = try? openReadOnly() {
                return SadaqaDatabase(queue: roQueue, loadError: error.localizedDescription, isReadOnly: true)
            }
            do {
                let memQueue = try DatabaseQueue()
                return SadaqaDatabase(queue: memQueue, loadError: error.localizedDescription, isReadOnly: true)
            } catch {
                fatalError("Failed to open in-memory fallback database: \(error)")
            }
        }
    }

    /// Application Support copy of sadaqa.db (no seed copy side effects).
    static func resolveDbUrl() throws -> URL {
        let fm = FileManager.default
        let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("SadaqaJaria", isDirectory: true)
        return dir.appendingPathComponent("sadaqa.db")
    }

    /// Read-only re-open of the existing db file (recovery step 1). No WAL
    /// pragma switch — a read-only connection cannot change journal mode.
    static func openReadOnly() throws -> DatabaseQueue {
        let dbUrl = try resolveDbUrl()
        guard FileManager.default.fileExists(atPath: dbUrl.path) else {
            throw NSError(domain: "SadaqaDB", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "no existing sadaqa.db to open read-only"])
        }
        var config = Configuration()
        config.readonly = true
        config.foreignKeysEnabled = true
        return try DatabaseQueue(path: dbUrl.path, configuration: config)
    }

    /// Resolve a resource in either the Resources folder-reference or bundle root.
    static func bundledDbUrl() -> URL? {
        let bundles = [Bundle.main, Bundle(for: SadaqaDatabase.self)]
        for b in bundles {
            if let u = b.url(forResource: "sadaqa", withExtension: "db", subdirectory: "Resources") { return u }
            if let u = b.url(forResource: "sadaqa", withExtension: "db") { return u }
        }
        return nil
    }

    /// Copy the bundled seed (Resources/sadaqa.db) to Application Support and open read-write.
    static func open() throws -> SadaqaDatabase {
        let fm = FileManager.default
        let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("SadaqaJaria", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let dbUrl = try resolveDbUrl()
        let existingSize = (try? fm.attributesOfItem(atPath: dbUrl.path)[.size] as? NSNumber)?.intValue ?? 0
        if !fm.fileExists(atPath: dbUrl.path) || existingSize == 0 {
            if fm.fileExists(atPath: dbUrl.path) {
                try? fm.removeItem(at: dbUrl)
            }
            guard let src = bundledDbUrl() else {
                throw NSError(domain: "SadaqaDB", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "bundled sadaqa.db missing — run scripts/tools/sync-native-assets.mjs"])
            }
            try fm.copyItem(at: src, to: dbUrl)
        }
        if !fm.isWritableFile(atPath: dbUrl.path) {
            try? fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: dbUrl.path)
        }
        var config = Configuration()
        config.readonly = false
        config.foreignKeysEnabled = true
        let queue = try DatabaseQueue(path: dbUrl.path, configuration: config)
        try queue.writeWithoutTransaction { db in
            try db.execute(sql: "PRAGMA journal_mode = WAL")
            try Self.migrate(db)
        }
        return SadaqaDatabase(queue: queue)
    }

    /// meta.schema_version (schema.sql:42) baseline — now read on every open;
    /// a db written by a NEWER build refuses to open (downgrade protection,
    /// 2026-11 audit) and lands on the recovery screen instead of misreading rows.
    static let schemaVersion = 1

    static func migrate(_ db: Database) throws {
        let row = try Row.fetchOne(db, sql: "SELECT value FROM meta WHERE key = 'schema_version'")
        var v = 0
        if let raw = row.flatMap({ strOf($0["value"]) }) { v = Int(Double(raw) ?? 0) }
        if v > schemaVersion {
            NSLog("[SadaqaDB] sadaqa.db schema_version \(v) is newer than this build (\(schemaVersion)) — update the app")
            throw NSError(domain: "SadaqaDB", code: 10,
                          userInfo: [NSLocalizedDescriptionKey: "database schema \(v) is newer than the app (\(schemaVersion)) — update the app"])
        }
        if v < schemaVersion {
            try db.execute(sql: "UPDATE meta SET value = ? WHERE key = 'schema_version'", arguments: [String(schemaVersion)])
        }
    }

    // ------------------------------------------------------------------
    // row decoding helpers (DatabaseValue → JSONValue, JS-parity nulls)
    // ------------------------------------------------------------------
    static func jsonOf(_ v: DatabaseValue) -> JSONValue {
        if v.isNull { return .null }
        if let i = Int64.fromDatabaseValue(v) { return .number(Double(i)) }
        if let d = Double.fromDatabaseValue(v) { return .number(d) }
        if let s = String.fromDatabaseValue(v) { return .string(s) }
        return .null
    }

    static func intOf(_ v: DatabaseValue) -> Int64? { Int64.fromDatabaseValue(v) }
    static func strOf(_ v: DatabaseValue) -> String? { String.fromDatabaseValue(v) }
    static func flagOf(_ v: DatabaseValue) -> Bool { intOf(v) == 1 }

    // ------------------------------------------------------------------
    // settings (user_settings — JSON-encoded values)
    // ------------------------------------------------------------------
    public func setting(_ key: String) -> JSONValue? {
        try? queue.read { db in
            let row = try Row.fetchOne(db, sql: "SELECT value FROM user_settings WHERE key = ?", arguments: [key])
            guard let raw = Self.strOf(row?["value"] ?? DatabaseValue.null) else { return nil }
            return try? JSONValue.parse(raw)
        }
    }

    public func setSetting(_ key: String, _ value: JSONValue, now: Int64 = Date.nowMs) throws {
        try queue.write { db in
            try db.execute(sql: """
                INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """, arguments: [key, CanonicalJSON.serialize(value), now])
        }
        WidgetStateBridge.prayersChanged()
    }

    /// Engine options derived from settings (defaults mirror app-state.js).
    public func engineOptions() -> EngineOptions {
        let defaults = EngineOptions(lat: 21.4225, lng: 39.8262, timeZone: "Asia/Riyadh")
        guard let loc = setting("location"), case .object(let o) = loc else { return defaults }
        return EngineOptions(
            lat: o["lat"]?.doubleValue ?? defaults.lat,
            lng: o["lng"]?.doubleValue ?? defaults.lng,
            timeZone: o["timeZone"]?.stringValue ?? defaults.timeZone,
            method: setting("calc_method")?.stringValue ?? "umm_al_qura",
            madhab: setting("madhab")?.stringValue ?? "shafi",
            highLatitudeRule: setting("high_latitude_rule")?.stringValue ?? "middle_of_the_night")
    }

    public func hijriAdjust() -> Int { setting("hijri_adjust")?.intValue ?? 0 }

    // ------------------------------------------------------------------
    // Cities & Arabic FTS normalization (mirrors packages/core-data/engines/search.js)
    // ------------------------------------------------------------------
    public struct CityRow: Identifiable, Sendable, Equatable {
        public let id: Int
        public let nameAr: String
        public let nameEn: String
        public let countryAr: String
        public let lat: Double
        public let lng: Double
        public let timeZone: String
    }

    public static func normalizeArabicForSearch(_ input: String) -> String {
        var s = input.precomposedStringWithCanonicalMapping
        // Remove tashkeel + Quranic annotation marks + tatweel
        let stripped = s.unicodeScalars.filter { sc in
            let v = sc.value
            if v == 0x0640 { return false }
            if (0x0610...0x061A).contains(v) { return false }
            if (0x064B...0x065F).contains(v) { return false }
            if v == 0x0670 { return false }
            if (0x06D6...0x06ED).contains(v) { return false }
            return true
        }
        s = String(String.UnicodeScalarView(stripped))
        s = s
            .replacingOccurrences(of: "أ", with: "ا")
            .replacingOccurrences(of: "إ", with: "ا")
            .replacingOccurrences(of: "آ", with: "ا")
            .replacingOccurrences(of: "ٱ", with: "ا")
            .replacingOccurrences(of: "ؤ", with: "و")
            .replacingOccurrences(of: "ئ", with: "ي")
            .replacingOccurrences(of: "ة", with: "ه")
            .replacingOccurrences(of: "ى", with: "ي")
        // Fold non-initial hamza
        let chars = Array(s)
        var out = ""
        for (i, ch) in chars.enumerated() {
            if ch == "ء" && i > 0 && !chars[i - 1].isWhitespace { continue }
            out.append(ch)
        }
        let punct = CharacterSet(charactersIn: ".,;:!?«»\"'()-—–[]{}…•*/\\|+_=~<>،؛۔﴿﴾؟")
        out = out.components(separatedBy: punct).joined(separator: " ")
        return out.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    public static func ftsQuery(_ userInput: String) -> String? {
        let norm = normalizeArabicForSearch(userInput)
        guard !norm.isEmpty else { return nil }
        let terms = norm.split(separator: " ").map(String.init)
        guard !terms.isEmpty else { return nil }
        var quoted = terms.map { "\"\($0.replacingOccurrences(of: "\"", with: "\"\""))\"" }
        quoted[quoted.count - 1] += "*"
        return quoted.joined(separator: " ")
    }

    private static func mapCityRow(_ r: Row) -> CityRow {
        CityRow(
            id: r["city_id"] as Int? ?? 0,
            nameAr: r["name_ar"] as String? ?? "",
            nameEn: r["name_en"] as String? ?? "",
            countryAr: r["country_ar"] as String? ?? "",
            lat: r["lat"] as Double? ?? 0,
            lng: r["lng"] as Double? ?? 0,
            timeZone: r["timezone"] as String? ?? "UTC"
        )
    }

    public func searchCities(query: String, limit: Int = 20) -> [CityRow] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        var rows: [CityRow] = []
        try? queue.read { db in
            if trimmed.count < 2 {
                rows = try Row.fetchAll(db, sql: """
                    SELECT city_id, name_ar, name_en, country_ar, lat, lng, timezone
                    FROM cities WHERE is_preseed = 1
                    ORDER BY COALESCE(population, 0) DESC LIMIT ?
                    """, arguments: [limit]).map(Self.mapCityRow)
                return
            }
            var seen = Set<Int>()
            if let term = Self.ftsQuery(trimmed) {
                let ftsRows = (try? Row.fetchAll(db, sql: """
                    SELECT c.city_id, c.name_ar, c.name_en, c.country_ar, c.lat, c.lng, c.timezone
                    FROM cities c WHERE c.rowid IN (SELECT rowid FROM fts_cities WHERE fts_cities MATCH ?)
                    ORDER BY COALESCE(c.population, 0) DESC LIMIT ?
                    """, arguments: [term, limit])) ?? []
                for r in ftsRows {
                    let c = Self.mapCityRow(r)
                    if seen.insert(c.id).inserted { rows.append(c) }
                }
            }
            if rows.count < limit {
                let likePattern = "%\(trimmed)%"
                let normPattern = "%\(trimmed.replacingOccurrences(of: "ة", with: "ه").replacingOccurrences(of: "أ", with: "ا").replacingOccurrences(of: "إ", with: "ا").replacingOccurrences(of: "آ", with: "ا"))%"
                let likeRows = (try? Row.fetchAll(db, sql: """
                    SELECT city_id, name_ar, name_en, country_ar, lat, lng, timezone
                    FROM cities
                    WHERE name_ar LIKE ? OR name_en LIKE ? OR country_ar LIKE ?
                       OR REPLACE(REPLACE(REPLACE(REPLACE(name_ar, 'ة', 'ه'), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا') LIKE ?
                    ORDER BY COALESCE(population, 0) DESC LIMIT ?
                    """, arguments: [likePattern, likePattern, likePattern, normPattern, limit])) ?? []
                for r in likeRows {
                    let c = Self.mapCityRow(r)
                    if seen.insert(c.id).inserted {
                        rows.append(c)
                        if rows.count >= limit { break }
                    }
                }
            }
        }
        return rows
    }

    public func findNearestCity(lat: Double, lng: Double) -> CityRow? {
        var best: CityRow?
        var bestScore = Double.greatestFiniteMagnitude
        let cosLat = cos(lat * .pi / 180.0)
        try? queue.read { db in
            let cursor = try Row.fetchCursor(db, sql: """
                SELECT city_id, name_ar, name_en, country_ar, lat, lng, timezone FROM cities
                """)
            while let r = try cursor.next() {
                let cLat = r["lat"] as Double? ?? 0
                let cLng = r["lng"] as Double? ?? 0
                let dLat = cLat - lat
                let dLng = (cLng - lng) * cosLat
                let score = dLat * dLat + dLng * dLng
                if score < bestScore {
                    bestScore = score
                    best = Self.mapCityRow(r)
                }
            }
        }
        return best
    }

    @discardableResult
    public func selectCity(_ city: CityRow, gpsLat: Double? = nil, gpsLng: Double? = nil, now: Int64 = Date.nowMs) throws -> JSONValue {
        var fields: [String: JSONValue] = [
            "lat": .number(city.lat),
            "lng": .number(city.lng),
            "timeZone": .string(city.timeZone),
            "cityId": .number(Double(city.id)),
            "name_ar": .string(city.nameAr),
            "name_en": .string(city.nameEn),
        ]
        // persist the exact live GPS fix alongside the city (Qibla source)
        if let gl = gpsLat, let gn = gpsLng {
            fields["gps"] = .object(["lat": .number(gl), "lng": .number(gn), "at": .number(Double(now))])
        }
        let loc = JSONValue.object(fields)
        try setSetting("location", loc, now: now)
        return loc
    }

    @discardableResult
    public func selectCity(cityId: Int, now: Int64 = Date.nowMs) throws -> CityRow? {
        let city: CityRow? = try queue.read { db in
            guard let r = try Row.fetchOne(db, sql: """
                SELECT city_id, name_ar, name_en, country_ar, lat, lng, timezone
                FROM cities WHERE city_id = ?
                """, arguments: [cityId]) else { return nil }
            return Self.mapCityRow(r)
        }
        guard let city else { return nil }
        try selectCity(city, now: now)
        return city
    }

    // ------------------------------------------------------------------
    // Safe atomic UI write paths (no nested queue.read inside queue.write!)
    // ------------------------------------------------------------------
    public struct TasbihRowData: Sendable {
        public let uuid: String
        public let labelAr: String
        public let dhikrText: String
        public let target: Int?
        public var count: Int
        public let totalLifetime: Int
    }

    @discardableResult
    public func incrementDhikrTap(itemId: String, categoryId: String, currentCount: Int, target: Int, dayKey: String, now: Int64 = Date.nowMs) throws -> Int {
        guard target == 0 || currentCount < target else { return currentCount }
        let nextCount = currentCount + 1
        let isDone = target > 0 && nextCount >= target
        try queue.write { db in
            try db.execute(sql: """
                INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at, updated_at = excluded.updated_at
                """, arguments: [itemId, dayKey, nextCount, isDone ? now : nil, now])
            if isDone {
                let row = try Row.fetchOne(db, sql: "SELECT solar_window FROM athkar_categories WHERE category_id = ?", arguments: [categoryId])
                let solarWindow = Self.strOf(row?["solar_window"] ?? DatabaseValue.null)
                let kind: String? = switch solarWindow {
                case "fajr": "adhkar_morning"
                case "asr": "adhkar_evening"
                default: nil
                }
                if let kind {
                    try db.execute(sql: "INSERT OR REPLACE INTO streak_days (kind, day_key, done_at) VALUES (?, ?, ?)",
                                   arguments: [kind, dayKey, now])
                }
            }
        }
        return nextCount
    }

    public func ensureDefaultTasbihPresets(now: Int64 = Date.nowMs) throws -> [TasbihRowData] {
        try queue.write { db in
            var rows = try Row.fetchAll(db, sql: "SELECT * FROM tasbih_counters WHERE deleted = 0 ORDER BY sort_order")
            if rows.isEmpty {
                let presets: [(String, Int, Int)] = [
                    ("سبحان الله", 33, 0),
                    ("الحمد لله", 33, 1),
                    ("الله أكبر", 34, 2),
                ]
                for (label, target, order) in presets {
                    try db.execute(sql: """
                        INSERT OR IGNORE INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted)
                        VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0)
                        """, arguments: [UUIDv7.uuid7(now: now), label, label, target, order, now])
                }
                rows = try Row.fetchAll(db, sql: "SELECT * FROM tasbih_counters WHERE deleted = 0 ORDER BY sort_order")
            }
            return rows.map { r in
                TasbihRowData(
                    uuid: Self.strOf(r["uuid"]) ?? "",
                    labelAr: Self.strOf(r["label_ar"]) ?? "",
                    dhikrText: Self.strOf(r["dhikr_text"]) ?? "",
                    target: Self.intOf(r["target"]).map(Int.init),
                    count: Self.intOf(r["count"]).map(Int.init) ?? 0,
                    totalLifetime: Self.intOf(r["total_lifetime"]).map(Int.init) ?? 0
                )
            }
        }
    }

    public func recordTasbihTap(counterUuid: String, target: Int?, newCount: Int, dayKey: String, now: Int64 = Date.nowMs) throws {
        try queue.write { db in
            try db.execute(sql: "UPDATE tasbih_counters SET count = count + 1, total_lifetime = total_lifetime + 1, updated_at = ? WHERE uuid = ?",
                           arguments: [now, counterUuid])
            try db.execute(sql: "INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, 1, ?)",
                           arguments: [UUIDv7.uuid7(now: now), counterUuid, now])
            if let t = target, newCount == t {
                try db.execute(sql: "INSERT OR IGNORE INTO streak_days (kind, day_key, done_at) VALUES ('tasbih', ?, ?)",
                               arguments: [dayKey, now])
            }
        }
    }

    @discardableResult
    public func toggleBookmark(page: Int, lineNumber: Int = 1, ayahNumber: Int? = nil, labelAr: String, now: Int64 = Date.nowMs) throws -> Bool {
        var added = false
        try queue.write { db in
            let existing: Row?
            if let ayah = ayahNumber {
                existing = try Row.fetchOne(db, sql: "SELECT uuid, deleted FROM bookmarks WHERE ayah_number = ? LIMIT 1", arguments: [ayah])
            } else {
                existing = try Row.fetchOne(db, sql: "SELECT uuid, deleted FROM bookmarks WHERE page = ? AND ayah_number IS NULL LIMIT 1", arguments: [page])
            }
            if let existing, let uuid = Self.strOf(existing["uuid"]) {
                let wasDeleted = Self.flagOf(existing["deleted"])
                let nextDeleted = wasDeleted ? 0 : 1
                try db.execute(sql: "UPDATE bookmarks SET deleted = ?, updated_at = ?, label_ar = ? WHERE uuid = ?",
                               arguments: [nextDeleted, now, labelAr, uuid])
                added = wasDeleted
            } else {
                try db.execute(sql: """
                    INSERT INTO bookmarks (uuid, page, line_number, ayah_number, label_ar, created_at, updated_at, deleted)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                    """, arguments: [UUIDv7.uuid7(now: now), page, lineNumber, ayahNumber, labelAr, now, now])
                added = true
            }
        }
        return added
    }

    // ------------------------------------------------------------------
    // device id (same contract as backup.js deviceId())
    // ------------------------------------------------------------------
    func deviceId() throws -> String {
        if let existing = setting("device_id")?.stringValue { return existing }
        let id = UUIDv7.uuid7()
        try queue.write { db in
            try db.execute(sql: "INSERT INTO user_settings (key, value, updated_at) VALUES ('device_id', ?, ?)",
                           arguments: [CanonicalJSON.serialize(.string(id)), Date.nowMs])
        }
        return id
    }

    // ------------------------------------------------------------------
    // EXPORT — buildExportPayload port (9 queries → entities → groups → sha)
    // ------------------------------------------------------------------
    public func buildExportPayload(now: Int64 = Date.nowMs) throws -> (manifest: JSONValue, payloadJson: String) {
        let remap: (String) -> String = { UUIDv7.isUUIDv7Shape($0) ? $0 : UUIDv7.synthUuid7("row:" + $0, now: now) }

        var reading: [JSONValue] = []
        var dhikr: [JSONValue] = []
        var prefs: [JSONValue] = []
        var meta: [JSONValue] = []

        try queue.read { db in
            for r in try Row.fetchAll(db, sql: "SELECT * FROM bookmarks") {
                reading.append(.object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")),
                    "type": .string("bookmark"),
                    "updatedAt": Self.jsonOf(r["updated_at"]),
                    "deleted": .bool(Self.flagOf(r["deleted"])),
                    "page": Self.jsonOf(r["page"]),
                    "lineNumber": Self.jsonOf(r["line_number"]),
                    "ayahNumber": Self.jsonOf(r["ayah_number"]),
                    "labelAr": Self.jsonOf(r["label_ar"]),
                    "createdAt": Self.jsonOf(r["created_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM highlights") {
                reading.append(.object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")),
                    "type": .string("highlight"),
                    "updatedAt": Self.jsonOf(r["updated_at"]),
                    "deleted": .bool(Self.flagOf(r["deleted"])),
                    "ayahNumber": Self.jsonOf(r["ayah_number"]),
                    "wordStart": Self.jsonOf(r["word_start"]),
                    "wordEnd": Self.jsonOf(r["word_end"]),
                    "colorKey": Self.jsonOf(r["color_key"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM notes") {
                reading.append(.object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")),
                    "type": .string("note"),
                    "updatedAt": Self.jsonOf(r["updated_at"]),
                    "deleted": .bool(Self.flagOf(r["deleted"])),
                    "ayahNumber": Self.jsonOf(r["ayah_number"]),
                    "body": Self.jsonOf(r["body"]),
                    "createdAt": Self.jsonOf(r["created_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM khatmah_plans") {
                reading.append(.object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")),
                    "type": .string("khatmahPlan"),
                    "updatedAt": Self.jsonOf(r["updated_at"]),
                    "deleted": .bool(Self.flagOf(r["deleted"])),
                    "nameAr": Self.jsonOf(r["name_ar"]),
                    "mode": Self.jsonOf(r["mode"]),
                    "startDate": Self.jsonOf(r["start_date"]),
                    "endDate": Self.jsonOf(r["end_date"]),
                    "dailyPages": Self.jsonOf(r["daily_pages"]),
                    "active": .bool(Self.flagOf(r["active"])),
                    "createdAt": Self.jsonOf(r["created_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM adhkar_state") {
                let itemId = Self.strOf(r["item_id"]) ?? ""
                let dayKey = Self.strOf(r["day_key"]) ?? ""
                dhikr.append(.object([
                    "uuid": .string(UUIDv7.synthUuid7("adhkar:\(itemId):\(dayKey)", now: now)),
                    "type": .string("adhkarState"),
                    "updatedAt": Self.jsonOf(r["updated_at"]),
                    "itemId": .string(itemId),
                    "dayKey": .string(dayKey),
                    "count": Self.jsonOf(r["count"]),
                    "completedAt": Self.jsonOf(r["completed_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM tasbih_counters") {
                dhikr.append(.object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")),
                    "type": .string("tasbihCounter"),
                    "updatedAt": Self.jsonOf(r["updated_at"]),
                    "deleted": .bool(Self.flagOf(r["deleted"])),
                    "labelAr": Self.jsonOf(r["label_ar"]),
                    "dhikrText": Self.jsonOf(r["dhikr_text"]),
                    "target": Self.jsonOf(r["target"]),
                    "count": Self.jsonOf(r["count"]),
                    "totalLifetime": Self.jsonOf(r["total_lifetime"]),
                    "sortOrder": Self.jsonOf(r["sort_order"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM tasbih_sessions") {
                dhikr.append(.object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")),
                    "type": .string("tasbihSession"),
                    "updatedAt": Self.jsonOf(r["occurred_at"]),
                    "counterUuid": Self.jsonOf(r["counter_uuid"]),
                    "countDelta": Self.jsonOf(r["count_delta"]),
                    "occurredAt": Self.jsonOf(r["occurred_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM user_settings WHERE key != 'device_id'") {
                let key = Self.strOf(r["key"]) ?? ""
                // safeParse parity: unparseable stored values export as the raw
                // STRING (web backup.js), never as null.
                let value = Self.strOf(r["value"]).map { raw in (try? JSONValue.parse(raw)) ?? .string(raw) } ?? .null
                prefs.append(.object([
                    "uuid": .string(UUIDv7.synthUuid7("setting:\(key)", now: now)),
                    "type": .string("setting"),
                    "updatedAt": Self.jsonOf(r["updated_at"]),
                    "key": .string(key),
                    "value": value,
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM streak_days") {
                let kind = Self.strOf(r["kind"]) ?? ""
                let dayKey = Self.strOf(r["day_key"]) ?? ""
                meta.append(.object([
                    "uuid": .string(UUIDv7.synthUuid7("streak:\(kind):\(dayKey)", now: now)),
                    "type": .string("streakDay"),
                    "updatedAt": Self.jsonOf(r["done_at"]),
                    "kind": .string(kind),
                    "dayKey": .string(dayKey),
                ]))
            }
        }

        func mapOf(_ arr: [JSONValue]) -> [String: JSONValue] {
            var out: [String: JSONValue] = [:]
            for item in arr {
                if let uuid = item["uuid"]?.stringValue, out[uuid] == nil {
                    out[uuid] = item
                }
            }
            return out
        }
        let payload = BackupCodec.toPayloadGroups([
            "reading": mapOf(reading), "dhikr": mapOf(dhikr), "prefs": mapOf(prefs), "meta": mapOf(meta),
        ])

        // payloadJson must be byte-stable — canonical serializer (keys sorted)
        let payloadJson = CanonicalJSON.serialize(payload)
        var entities: [String: Int] = [:]
        if case .object(let groups) = payload {
            for (g, v) in groups { if case .array(let a) = v { entities[g] = a.count } }
        }
        let manifest = JSONValue.object([
            "format": .string("sadaqa-backup"),
            "formatVersion": .number(Double(BackupCodec.supportedFormatVersion)),
            "createdAt": .number(Double(now)),
            "deviceId": .string(try deviceId()),
            "entities": .object(entities.mapValues { .number(Double($0)) }),
            "integrity": .string(BackupCodec.integrityOf(payloadJson: payloadJson)),
        ])
        return (manifest, payloadJson)
    }

    // ------------------------------------------------------------------
    // IMPORT — validate → local snapshots → merge → atomic batch → audit row
    // ------------------------------------------------------------------
    public func importBackup(text: String, mode: String, now: Int64 = Date.nowMs) throws -> MergeReport {
        let (manifest, payload) = try BackupCodec.parseFile(text)
        let verdict = BackupCodec.validateBackup(manifest: manifest, payload: payload)
        guard verdict.ok else { throw BackupCodecError.refused(verdict.errors.prefix(3).joined(separator: " · ")) }
        // Recompute manifest.integrity over the payload bytes BEFORE any write
        // (parity with packages/core-data/engines/backup-validate.js
        // integrityMatches). Re-serialization reorders keys, so the digest is
        // taken over CanonicalJSON.serialize(payload) — byte-identical to what
        // every exporter (web/Kotlin/Swift) hashed at export time.
        let expectedDigest = manifest["integrity"]?.stringValue
        let actualDigest = BackupCodec.integrityOf(payloadJson: CanonicalJSON.serialize(payload))
        guard expectedDigest?.lowercased() == actualDigest.lowercased() else {
            throw BackupCodecError.refused("manifest.integrity — البصمة لا تطابق محتوى الملف (تلف أو تلاعب)")
        }

        // local snapshots keyed by payload uuid (same remap as export)
        let remap: (String) -> String = { UUIDv7.isUUIDv7Shape($0) ? $0 : UUIDv7.synthUuid7("row:" + $0, now: now) }
        var local: [String: [String: JSONValue]] = ["reading": [:], "dhikr": [:], "prefs": [:], "meta": [:]]

        try queue.read { db in
            func put(_ group: String, _ uuidRaw: String, _ e: JSONValue) {
                local[group, default: [:]][remap(uuidRaw)] = e
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM bookmarks") {
                put("reading", Self.strOf(r["uuid"]) ?? "", .object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")), "type": .string("bookmark"),
                    "updatedAt": Self.jsonOf(r["updated_at"]), "deleted": .bool(Self.flagOf(r["deleted"])),
                    "page": Self.jsonOf(r["page"]), "lineNumber": Self.jsonOf(r["line_number"]),
                    "ayahNumber": Self.jsonOf(r["ayah_number"]), "labelAr": Self.jsonOf(r["label_ar"]),
                    "createdAt": Self.jsonOf(r["created_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM highlights") {
                put("reading", Self.strOf(r["uuid"]) ?? "", .object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")), "type": .string("highlight"),
                    "updatedAt": Self.jsonOf(r["updated_at"]), "deleted": .bool(Self.flagOf(r["deleted"])),
                    "ayahNumber": Self.jsonOf(r["ayah_number"]), "wordStart": Self.jsonOf(r["word_start"]),
                    "wordEnd": Self.jsonOf(r["word_end"]), "colorKey": Self.jsonOf(r["color_key"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM notes") {
                put("reading", Self.strOf(r["uuid"]) ?? "", .object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")), "type": .string("note"),
                    "updatedAt": Self.jsonOf(r["updated_at"]), "deleted": .bool(Self.flagOf(r["deleted"])),
                    "ayahNumber": Self.jsonOf(r["ayah_number"]), "body": Self.jsonOf(r["body"]),
                    "createdAt": Self.jsonOf(r["created_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM khatmah_plans") {
                put("reading", Self.strOf(r["uuid"]) ?? "", .object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")), "type": .string("khatmahPlan"),
                    "updatedAt": Self.jsonOf(r["updated_at"]), "deleted": .bool(Self.flagOf(r["deleted"])),
                    "nameAr": Self.jsonOf(r["name_ar"]), "mode": Self.jsonOf(r["mode"]),
                    "startDate": Self.jsonOf(r["start_date"]), "endDate": Self.jsonOf(r["end_date"]),
                    "dailyPages": Self.jsonOf(r["daily_pages"]), "active": .bool(Self.flagOf(r["active"])),
                    "createdAt": Self.jsonOf(r["created_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM adhkar_state") {
                let itemId = Self.strOf(r["item_id"]) ?? ""
                let dayKey = Self.strOf(r["day_key"]) ?? ""
                let synthUuid = UUIDv7.synthUuid7("adhkar:\(itemId):\(dayKey)", now: now)
                let e = JSONValue.object([
                    "uuid": .string(synthUuid),
                    "type": .string("adhkarState"), "updatedAt": Self.jsonOf(r["updated_at"]),
                    "itemId": .string(itemId), "dayKey": .string(dayKey),
                    "count": Self.jsonOf(r["count"]), "completedAt": Self.jsonOf(r["completed_at"]),
                ])
                local["dhikr", default: [:]][synthUuid] = e
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM tasbih_counters") {
                put("dhikr", Self.strOf(r["uuid"]) ?? "", .object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")), "type": .string("tasbihCounter"),
                    "updatedAt": Self.jsonOf(r["updated_at"]), "deleted": .bool(Self.flagOf(r["deleted"])),
                    "labelAr": Self.jsonOf(r["label_ar"]), "dhikrText": Self.jsonOf(r["dhikr_text"]),
                    "target": Self.jsonOf(r["target"]), "count": Self.jsonOf(r["count"]),
                    "totalLifetime": Self.jsonOf(r["total_lifetime"]), "sortOrder": Self.jsonOf(r["sort_order"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM tasbih_sessions") {
                put("dhikr", Self.strOf(r["uuid"]) ?? "", .object([
                    "uuid": .string(remap(Self.strOf(r["uuid"]) ?? "")), "type": .string("tasbihSession"),
                    "updatedAt": Self.jsonOf(r["occurred_at"]), "counterUuid": Self.jsonOf(r["counter_uuid"]),
                    "countDelta": Self.jsonOf(r["count_delta"]), "occurredAt": Self.jsonOf(r["occurred_at"]),
                ]))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM user_settings WHERE key != 'device_id'") {
                let key = Self.strOf(r["key"]) ?? ""
                let value = Self.strOf(r["value"]).map { raw in (try? JSONValue.parse(raw)) ?? .string(raw) } ?? .null
                let synthUuid = UUIDv7.synthUuid7("setting:\(key)", now: now)
                let e = JSONValue.object([
                    "uuid": .string(synthUuid),
                    "type": .string("setting"), "updatedAt": Self.jsonOf(r["updated_at"]),
                    "key": .string(key), "value": value,
                ])
                local["prefs", default: [:]][synthUuid] = e
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM streak_days") {
                let kind = Self.strOf(r["kind"]) ?? ""
                let dayKey = Self.strOf(r["day_key"]) ?? ""
                let synthUuid = UUIDv7.synthUuid7("streak:\(kind):\(dayKey)", now: now)
                let e = JSONValue.object([
                    "uuid": .string(synthUuid),
                    "type": .string("streakDay"), "updatedAt": Self.jsonOf(r["done_at"]),
                    "kind": .string(kind), "dayKey": .string(dayKey),
                ])
                local["meta", default: [:]][synthUuid] = e
            }
        }

        let result = try BackupCodec.mergePayload(local: local, payload: payload, mode: mode, now: now)

        try queue.write { db in
            if mode == "replace" {
                // Full Replace — fixed, parameterless wipe of every backed-up
                // table (backup_log is device-local and survives by design).
                for t in ["bookmarks", "highlights", "notes", "khatmah_plans", "adhkar_state", "tasbih_sessions", "tasbih_counters", "streak_days"] {
                    try db.execute(sql: "DELETE FROM \(t)")
                }
                try db.execute(sql: "DELETE FROM user_settings WHERE key != 'device_id'")
            }
            for m in result.mutations {
                try apply(m.entity, db: db)
            }
            let report = JSONValue.object([
                "added": .number(Double(result.report.added)), "updated": .number(Double(result.report.updated)),
                "conflicts": .number(Double(result.report.conflicts)), "skipped": .number(Double(result.report.skipped)),
                "deleted": .number(Double(result.report.deleted)),
            ])
            try db.execute(sql: "INSERT INTO backup_log (direction, mode, format_version, counts_json, created_at) VALUES ('import', ?, ?, ?, ?)",
                           arguments: [mode, Double(manifest["formatVersion"]?.intValue ?? 1), CanonicalJSON.serialize(report), now])
        }
        WidgetStateBridge.prayersChanged()
        return result.report
    }

    /// One payload entity → bound upsert (entityStmts port, order preserved).
    func apply(_ e: JSONValue, db: Database) throws {
        let del = e["deleted"]?.boolValue == true ? 1 : 0
        let type = e["type"]?.stringValue ?? ""
        let uuid = e["uuid"]?.stringValue ?? ""
        switch type {
        case "bookmark":
            try db.execute(sql: """
                INSERT INTO bookmarks (uuid, page, line_number, ayah_number, label_ar, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET page = excluded.page, line_number = excluded.line_number, ayah_number = excluded.ayah_number, label_ar = excluded.label_ar, updated_at = excluded.updated_at, deleted = excluded.deleted
                """, arguments: [uuid, e["page"]?.intValue ?? 1, e["lineNumber"]?.intValue ?? 1, e["ayahNumber"]?.intValue, e["labelAr"]?.stringValue, e["createdAt"]?.int64Value ?? e["updatedAt"]?.int64Value ?? 0, e["updatedAt"]?.int64Value ?? 0, del])
        case "highlight":
            try db.execute(sql: """
                INSERT INTO highlights (uuid, ayah_number, word_start, word_end, color_key, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET ayah_number = excluded.ayah_number, word_start = excluded.word_start, word_end = excluded.word_end, color_key = excluded.color_key, updated_at = excluded.updated_at, deleted = excluded.deleted
                """, arguments: [uuid, e["ayahNumber"]?.intValue, e["wordStart"]?.intValue, e["wordEnd"]?.intValue, e["colorKey"]?.stringValue, e["updatedAt"]?.int64Value ?? 0, del])
        case "note":
            try db.execute(sql: """
                INSERT INTO notes (uuid, ayah_number, body, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET ayah_number = excluded.ayah_number, body = excluded.body, updated_at = excluded.updated_at, deleted = excluded.deleted
                """, arguments: [uuid, e["ayahNumber"]?.intValue, e["body"]?.stringValue ?? "", e["createdAt"]?.int64Value ?? e["updatedAt"]?.int64Value ?? 0, e["updatedAt"]?.int64Value ?? 0, del])
        case "khatmahPlan":
            try db.execute(sql: """
                INSERT INTO khatmah_plans (uuid, name_ar, mode, start_date, end_date, daily_pages, active, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET name_ar = excluded.name_ar, mode = excluded.mode, start_date = excluded.start_date, end_date = excluded.end_date, daily_pages = excluded.daily_pages, active = excluded.active, updated_at = excluded.updated_at, deleted = excluded.deleted
                """, arguments: [uuid, e["nameAr"]?.stringValue ?? "ختمتي", e["mode"]?.stringValue ?? "rate", e["startDate"]?.stringValue, e["endDate"]?.stringValue, e["dailyPages"]?.intValue, e["active"]?.boolValue == false ? 0 : 1, e["createdAt"]?.int64Value ?? e["updatedAt"]?.int64Value ?? 0, e["updatedAt"]?.int64Value ?? 0, del])
        case "tasbihCounter":
            try db.execute(sql: """
                INSERT INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET label_ar = excluded.label_ar, dhikr_text = excluded.dhikr_text, target = excluded.target, count = excluded.count, total_lifetime = excluded.total_lifetime, sort_order = excluded.sort_order, updated_at = excluded.updated_at, deleted = excluded.deleted
                """, arguments: [uuid, e["labelAr"]?.stringValue ?? "ورد", e["dhikrText"]?.stringValue ?? "", e["target"]?.intValue, e["count"]?.intValue ?? 0, e["totalLifetime"]?.intValue ?? 0, e["sortOrder"]?.intValue ?? 0, e["updatedAt"]?.int64Value ?? 0, del])
        case "tasbihSession":
            try db.execute(sql: """
                INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET count_delta = excluded.count_delta, occurred_at = excluded.occurred_at
                """, arguments: [uuid, e["counterUuid"]?.stringValue ?? "", e["countDelta"]?.intValue ?? 1, e["occurredAt"]?.int64Value ?? 0])
        case "adhkarState":
            try db.execute(sql: """
                INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at, updated_at = excluded.updated_at
                """, arguments: [e["itemId"]?.stringValue ?? "", e["dayKey"]?.stringValue ?? "", e["count"]?.intValue ?? 0, e["completedAt"]?.int64Value, e["updatedAt"]?.int64Value ?? 0])
        case "streakDay":
            try db.execute(sql: "INSERT OR REPLACE INTO streak_days (kind, day_key, done_at) VALUES (?, ?, ?)",
                           arguments: [e["kind"]?.stringValue ?? "", e["dayKey"]?.stringValue ?? "", e["updatedAt"]?.int64Value ?? 0])
        case "setting":
            let key = e["key"]?.stringValue ?? ""
            if key == "device_id" { return }
            try db.execute(sql: """
                INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """, arguments: [key, CanonicalJSON.serialize(e["value"] ?? .null), e["updatedAt"]?.int64Value ?? 0])
        default:
            throw BackupCodecError.refused("unsupported entity type: \(type)")
        }
    }
}

public extension Date {
    static var nowMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}
