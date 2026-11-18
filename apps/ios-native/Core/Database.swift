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

    public static let shared = try! SadaqaDatabase.open()

    public let queue: DatabaseQueue

    /// Internal (not private) so the parity test target can open isolated
    /// temp copies of the bundled db for round-trip tests.
    init(queue: DatabaseQueue) { self.queue = queue }

    /// Copy the bundled seed (Resources/sadaqa.db) to Application Support and open.
    static func open() throws -> SadaqaDatabase {
        let fm = FileManager.default
        let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("SadaqaJaria", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let dbUrl = dir.appendingPathComponent("sadaqa.db")
        if !FileManager.default.fileExists(atPath: dbUrl.path) {
            let bundled = Bundle.main.url(forResource: "sadaqa", withExtension: "db")
            guard let src = bundled else {
                throw NSError(domain: "SadaqaDB", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "bundled sadaqa.db missing — run scripts/tools/sync-native-assets.mjs"])
            }
            try fm.copyItem(at: src, to: dbUrl)
        }
        let queue = try DatabaseQueue(path: dbUrl.path)
        try queue.writeWithoutTransaction { db in
            try db.execute(sql: "PRAGMA journal_mode = WAL") // FK enforcement is per-connection: GRDB enables it via configuration
        }
        return SadaqaDatabase(queue: queue)
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
            Dictionary(arr.map { ($0["uuid"]!.stringValue!, $0) }, uniquingKeysWith: { a, _ in a })
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

        // local snapshots keyed by payload uuid (same remap as export)
        let remap: (String) -> String = { UUIDv7.isUUIDv7Shape($0) ? $0 : UUIDv7.synthUuid7("row:" + $0, now: now) }
        var local: [String: [String: JSONValue]] = ["reading": [:], "dhikr": [:], "prefs": [:], "meta": [:]]

        try queue.read { db in
            func put(_ group: String, _ uuidRaw: String, _ e: JSONValue) {
                local[group]![remap(uuidRaw)] = e
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
                let e = JSONValue.object([
                    "uuid": .string(UUIDv7.synthUuid7("adhkar:\(itemId):\(dayKey)", now: now)),
                    "type": .string("adhkarState"), "updatedAt": Self.jsonOf(r["updated_at"]),
                    "itemId": .string(itemId), "dayKey": .string(dayKey),
                    "count": Self.jsonOf(r["count"]), "completedAt": Self.jsonOf(r["completed_at"]),
                ])
                local["dhikr"]![e["uuid"]!.stringValue!] = e
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
                let e = JSONValue.object([
                    "uuid": .string(UUIDv7.synthUuid7("setting:\(key)", now: now)),
                    "type": .string("setting"), "updatedAt": Self.jsonOf(r["updated_at"]),
                    "key": .string(key), "value": value,
                ])
                local["prefs"]![e["uuid"]!.stringValue!] = e
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM streak_days") {
                let kind = Self.strOf(r["kind"]) ?? ""
                let dayKey = Self.strOf(r["day_key"]) ?? ""
                let e = JSONValue.object([
                    "uuid": .string(UUIDv7.synthUuid7("streak:\(kind):\(dayKey)", now: now)),
                    "type": .string("streakDay"), "updatedAt": Self.jsonOf(r["done_at"]),
                    "kind": .string(kind), "dayKey": .string(dayKey),
                ])
                local["meta"]![e["uuid"]!.stringValue!] = e
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
            try db.execute(sql: """
                INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """, arguments: [e["key"]?.stringValue ?? "", CanonicalJSON.serialize(e["value"] ?? .null), e["updatedAt"]?.int64Value ?? 0])
        default:
            throw BackupCodecError.refused("unsupported entity type: \(type)")
        }
    }
}

public extension Date {
    static var nowMs: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}
