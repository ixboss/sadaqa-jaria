// ============================================================================
// BackupCodec.swift — `.sadaqa` v1 validator + Smart Merge (golden ports of
// packages/core-data/engines/backup-validate.js and backup-merge.js).
// Entity field names are the camelCase payload contract (see apps/web-desktop/
// js/data/backup.js ENT mappers). All decisions live here; the app layer only
// maps rows↔entities and applies the returned mutations in one transaction.
// ============================================================================

import Foundation

public enum BackupCodecError: Error, CustomStringConvertible {
    case notJSON
    case refused(String)   // validator refusal with joined reasons
    public var description: String {
        switch self { case .notJSON: return "ملف غير صالح — ليس JSON"; case .refused(let r): return "فشل التحقق: \(r)" }
    }
}

public struct BackupManifest: Codable, Sendable {
    public let format: String
    public let formatVersion: Int
    public let createdAt: Double
    public let deviceId: String
    public var entities: [String: Int]?
    public let integrity: String
}

public struct ValidationVerdict: Sendable {
    public let ok: Bool
    public let errors: [String]
    public let counts: [String: Int]
}

public struct MergeReport: Codable, Sendable, Equatable {
    public var added: Int
    public var updated: Int
    public var conflicts: Int
    public var skipped: Int
    public var deleted: Int
}

public struct Mutation: Sendable {
    public let group: String
    public let uuid: String
    public let entity: JSONValue
    public let action: String   // insert | apply | restore
}

public struct MergeResult: Sendable {
    public let report: MergeReport
    public let mutations: [Mutation]
    public let replaceMarkerAt: Int64?
}

public enum BackupCodec {

    public static let supportedFormatVersion = 1
    public static let backupGroups = ["reading", "dhikr", "prefs", "meta"]
    /// سقف إجمالي الكيانات — مطابق لـ MAX_ENTITIES في backup-validate.js (review 2026-11)
    public static let maxEntities = 50_000

    /// Which entity types may appear under each group (ARCHITECTURE §8.2 table).
    public static let groupEntityTypes: [String: [String]] = [
        "reading": ["khatmahPlan", "khatmahPageLog", "bookmark", "highlight", "note"],
        "dhikr": ["adhkarState", "tasbihCounter", "tasbihSession"],
        "prefs": ["setting"],
        "meta": ["streakDay"],
    ]

    static let highlightColors = ["gold", "emerald", "rose", "sky", "none"]
    static let streakKinds = ["adhkar_morning", "adhkar_evening", "tasbih", "khatmah"]
    static let dayKeyRegex = try? NSRegularExpression(pattern: "^\\d{4}-\\d{2}-\\d{2}$")

    static func isDayKey(_ s: JSONValue?) -> Bool {
        guard case .string(let v) = s, let regex = dayKeyRegex else { return false }
        let r = regex.firstMatch(in: v, range: NSRange(v.startIndex..., in: v))
        return r != nil
    }

    static func isInt(_ v: JSONValue?) -> Bool {
        guard case .number(let n) = v, n == n.rounded(), abs(n) < 2e53 else { return false }
        return true
    }

    static func isFinitePositive(_ v: JSONValue?) -> Bool {
        guard case .number(let n) = v, n > 0, n.isFinite else { return false }
        return true
    }

    // ------------------------------------------------------------------
    // validateBackup — backup-validate.js port
    // ------------------------------------------------------------------
    public static func validateBackup(manifest: JSONValue?, payload: JSONValue?) -> ValidationVerdict {
        var errors: [String] = []
        guard case .object(let m) = manifest else { return ValidationVerdict(ok: false, errors: ["manifest: must be an object"], counts: [:]) }

        if m["format"]?.stringValue != "sadaqa-backup" { errors.append("manifest.format: must be \"sadaqa-backup\"") }
        if let fv = m["formatVersion"], case .number(let n) = fv, n == n.rounded() {
            if Int(n) > supportedFormatVersion {
                errors.append("manifest.formatVersion \(Int(n)) is newer than supported \(supportedFormatVersion) — upgrade the app, then re-import")
            } else if Int(n) < 1 {
                errors.append("manifest.formatVersion: must be >= 1")
            }
        } else {
            errors.append("manifest.formatVersion: must be an integer")
        }
        if !isFinitePositive(m["createdAt"]) { errors.append("manifest.createdAt: must be epoch ms") }
        if m["deviceId"]?.stringValue.map({ $0.count >= 8 }) != true { errors.append("manifest.deviceId: must be a string (>= 8 chars)") }
        if m["integrity"]?.stringValue.map({ $0.count == 64 }) != true { errors.append("manifest.integrity: must be a sha-256 hex digest of payload.json") }

        guard case .object(let groups)? = payload else {
            errors.append("payload: must be an object")
            return ValidationVerdict(ok: false, errors: errors, counts: [:])
        }

        var counts: [String: Int] = [:]
        // خطة الملف نفسها: سجل صفحة بلا أب داخل الملف كان يمرّ على الويب وينفجر
        // FK على الأهداف الأصلية — تُرفض هنا لتطابق backup-validate.js (review 2026-11)
        let planUuids: Set<String> = Set(((groups["reading"] ?? .null).arrayValue ?? []).compactMap { e -> String? in
            if case .object(let o) = e, o["type"]?.stringValue == "khatmahPlan" { return o["uuid"]?.stringValue }
            return nil
        })
        var totalEntities = 0
        for (group, groupValue) in groups {
            guard case .array(let entities) = groupValue else {
                errors.append("payload.\(group): must be an array")
                continue
            }
            totalEntities += entities.count
            guard backupGroups.contains(group) else {
                errors.append("payload.\(group): unknown group (allowed: \(backupGroups.joined(separator: ", ")))")
                continue
            }
            let allowed = groupEntityTypes[group] ?? []
            for e in entities {
                guard case .object(let obj) = e else { errors.append("payload.\(group): entity must be an object"); continue }
                let uuid = obj["uuid"]?.stringValue ?? "?"
                if !UUIDv7.isUUIDv7Shape(obj["uuid"]?.stringValue ?? "") {
                    errors.append("payload.\(group)[\(uuid)].uuid: must be a UUIDv7")
                    continue
                }
                let type = obj["type"]?.stringValue ?? ""
                if !allowed.contains(type) {
                    errors.append("payload.\(group)[\(uuid)].type: must be one of \(allowed.joined(separator: ", "))")
                    continue
                }
                if !isFinitePositive(obj["updatedAt"]) {
                    errors.append("payload.\(group)[\(uuid)].updatedAt: must be epoch ms")
                    continue
                }
                // حد زمني مستقبلي: طابع بعيد في المستقبل كان يتفوق على كل الصفوف
                // المحلية في الدمج فيرجّع البيانات طواعية (backup-validate.js audit 2026-11)
                if let ts = obj["updatedAt"]?.int64Value, ts > Date.nowMs + 2 * 86_400_000 {
                    errors.append("payload.\(group)[\(uuid)].updatedAt: too far in the future")
                    continue
                }
                if let deletedVal = obj["deleted"], deletedVal.boolValue == nil {
                    errors.append("payload.\(group)[\(uuid)].deleted: must be boolean when present")
                    continue
                }
                counts[group, default: 0] += 1
                if let typeErr = validateEntityBody(group: group, type: type, obj: obj, planUuids: planUuids) {
                    errors.append("payload.\(group)[\(uuid)]: \(typeErr)")
                }
            }
        }
        if totalEntities > maxEntities { errors.append("payload: \(totalEntities) entities exceeds the \(maxEntities) cap") }
        return ValidationVerdict(ok: errors.isEmpty, errors: errors, counts: counts)
    }

    /// Type-specific required payload fields (validateEntityBody port —
    /// mirrors packages/core-data/engines/backup-validate.js 2026-11 audit:
    /// text caps, dangerous setting keys, page-log natural-key rules).
    static func validateEntityBody(group: String, type: String, obj: [String: JSONValue], planUuids: Set<String> = []) -> String? {
        switch "\(group)/\(type)" {
        case "reading/bookmark":
            guard isInt(obj["page"]), let page = obj["page"]?.intValue, (1...604).contains(page) else { return "page must be 1..604" }
            if let l = obj["labelAr"], !l.isNull {
                guard let s = l.stringValue, s.count <= 200 else { return "labelAr must be a string <= 200 chars" }
            }
            return nil
        case "reading/highlight":
            guard isInt(obj["ayahNumber"]), let ay = obj["ayahNumber"]?.intValue, (1...6236).contains(ay) else { return "ayahNumber must be 1..6236" }
            guard isInt(obj["wordStart"]), let ws = obj["wordStart"]?.intValue, ws >= 1 else { return "wordStart must be >= 1" }
            guard isInt(obj["wordEnd"]), let we = obj["wordEnd"]?.intValue, we >= ws else { return "wordEnd must be >= wordStart" }
            guard let c = obj["colorKey"]?.stringValue, highlightColors.contains(c) else { return "colorKey must be a token color key" }
            return nil
        case "reading/khatmahPlan":
            guard obj["mode"]?.stringValue == "deadline" || obj["mode"]?.stringValue == "rate" else { return "mode must be deadline|rate" }
            if obj["mode"]?.stringValue == "deadline" {
                guard isDayKey(obj["endDate"]) else { return "deadline mode requires endDate YYYY-MM-DD" }
            } else {
                guard isInt(obj["dailyPages"]), let dp = obj["dailyPages"]?.intValue, (1...604).contains(dp) else { return "rate mode requires dailyPages 1..604" }
            }
            guard isDayKey(obj["startDate"]) else { return "startDate must be YYYY-MM-DD" }
            if let n = obj["nameAr"] {
                guard let s = n.stringValue, s.count <= 120 else { return "nameAr must be a string <= 120 chars" }
            }
            return nil
        case "reading/khatmahPageLog":
            // سجل تقدم الختمة: مفتاح طبيعي (plan_uuid, page) — الـ uuid مُصنَّع
            // حتمياً من المفتاح عند التصدير (synthUuid7) فتميز جداول السحب/الدمج.
            guard let p = obj["planUuid"]?.stringValue, p.count >= 8 else { return "planUuid required" }
            guard planUuids.contains(p) else { return "planUuid must reference a khatmahPlan in this backup" }
            guard isInt(obj["page"]), let page = obj["page"]?.intValue, (1...604).contains(page) else { return "page must be 1..604" }
            guard isInt(obj["completedAt"]), let ca = obj["completedAt"]?.intValue, ca > 0 else { return "completedAt must be epoch ms" }
            return nil
        case "dhikr/tasbihCounter":
            guard let t = obj["dhikrText"]?.stringValue, !t.isEmpty else { return "dhikrText required" }
            if let targetVal = obj["target"], !targetVal.isNull {
                guard isInt(targetVal), let target = targetVal.intValue, target >= 1 else { return "target must be >= 1 or null" }
            }
            if let l = obj["labelAr"], !l.isNull {
                guard let s = l.stringValue, s.count <= 120 else { return "labelAr must be a string <= 120 chars" }
            }
            return nil
        case "dhikr/adhkarState":
            guard let it = obj["itemId"]?.stringValue, !it.isEmpty else { return "itemId required" }
            guard isDayKey(obj["dayKey"]) else { return "dayKey must be YYYY-MM-DD" }
            guard isInt(obj["count"]), let count = obj["count"]?.intValue, count >= 0 else { return "count must be >= 0" }
            return nil
        case "prefs/setting":
            guard let k = obj["key"]?.stringValue, !k.isEmpty else { return "key required" }
            if k.count > 64 { return "key must be <= 64 chars" }
            if k == "__proto__" || k == "constructor" || k == "prototype" { return "key must not be a dangerous object-literal key" }
            if obj["value"] == nil { return "value required (may be null)" }
            return nil
        case "meta/streakDay":
            guard let k = obj["kind"]?.stringValue, streakKinds.contains(k) else { return "kind must be a streak kind" }
            guard isDayKey(obj["dayKey"]) else { return "dayKey must be YYYY-MM-DD" }
            return nil
        case "dhikr/tasbihSession":
            guard let cu = obj["counterUuid"]?.stringValue, cu.count >= 8 else { return "counterUuid required" }
            guard isInt(obj["countDelta"]), let delta = obj["countDelta"]?.intValue, delta > 0, delta <= 1_000_000 else { return "countDelta must be 1..1000000" }
            guard isFinitePositive(obj["occurredAt"]) else { return "occurredAt must be epoch ms" }
            return nil
        case "reading/note":
            guard let b = obj["body"]?.stringValue else { return "body must be a string" }
            if b.count > 10_000 { return "body must be <= 10000 chars" }
            return nil
        default:
            return nil
        }
    }

    private static func orderedGroupKeys(_ groups: [String: JSONValue]) -> [String] {
        backupGroups.filter { groups[$0] != nil } + groups.keys.filter { !backupGroups.contains($0) }.sorted()
    }

    // ------------------------------------------------------------------
    // mergePayload — backup-merge.js port
    // ------------------------------------------------------------------
    /// FK-safe apply order (web backup.js rank): page_log after its parent
    /// khatmah_plans and before tasbih_sessions, everything else first.
    static func applyRank(_ type: String?) -> Int {
        if type == "tasbihSession" { return 2 }
        if type == "khatmahPageLog" { return 1 }
        return 0
    }

    public static func mergePayload(local: [String: [String: JSONValue]], payload: JSONValue?, mode: String, now: Int64) throws -> MergeResult {
        guard mode == "merge" || mode == "replace" else { throw BackupCodecError.refused("unknown merge mode: \(mode)") }

        if mode == "replace" {
            var mutations: [Mutation] = []
            var report = MergeReport(added: 0, updated: 0, conflicts: 0, skipped: 0, deleted: 0)
            if case .object(let groups) = payload {
                for group in orderedGroupKeys(groups) {
                    guard case .array(let entities)? = groups[group] else { continue }
                    for e in entities {
                        let uuid = e["uuid"]?.stringValue ?? ""
                        mutations.append(Mutation(group: group, uuid: uuid, entity: e, action: "insert"))
                        report.added += 1
                    }
                }
            }
            let sorted = mutations.sorted { applyRank($0.entity["type"]?.stringValue) < applyRank($1.entity["type"]?.stringValue) }
            return MergeResult(report: report, mutations: sorted, replaceMarkerAt: now)
        }

        var report = MergeReport(added: 0, updated: 0, conflicts: 0, skipped: 0, deleted: 0)
        var mutations: [Mutation] = []
        if case .object(let groups) = payload {
            for group in orderedGroupKeys(groups) {
                guard case .array(let entities)? = groups[group] else {
                    throw BackupCodecError.refused("payload.\(group): must be an array (run backup-validate first)")
                }
                let localMap = local[group]
                for e in entities {
                    let uuid = e["uuid"]?.stringValue ?? ""
                    guard let existing = localMap?[uuid] else {
                        mutations.append(Mutation(group: group, uuid: uuid, entity: e, action: "insert"))
                        report.added += 1
                        continue
                    }
                    if CanonicalJSON.serialize(existing) == CanonicalJSON.serialize(e) {
                        report.skipped += 1
                        continue
                    }
                    let localTime = existing["updatedAt"]?.int64Value ?? 0
                    let incomingTime = e["updatedAt"]?.int64Value ?? 0
                    if incomingTime > localTime {
                        let isResurrection = (existing["deleted"]?.boolValue == true) && (e["deleted"]?.boolValue != true)
                        mutations.append(Mutation(group: group, uuid: uuid, entity: e, action: isResurrection ? "restore" : "apply"))
                        report.updated += 1
                    } else if localTime > incomingTime {
                        if existing["deleted"]?.boolValue == true {
                            report.skipped += 1 // tombstone wins over older incoming copy
                        } else {
                            report.conflicts += 1 // local is newer and alive — keep local, log conflict
                        }
                    } else {
                        report.conflicts += 1 // same updatedAt, different content → deterministic tie-break
                    }
                }
            }
        }
        let sorted = mutations.sorted { applyRank($0.entity["type"]?.stringValue) < applyRank($1.entity["type"]?.stringValue) }
        return MergeResult(report: report, mutations: sorted, replaceMarkerAt: nil)
    }

    /** Serialize entities into a stable payload grouping (keys sorted, uuid-ordered). */
    public static func toPayloadGroups(_ mapByGroup: [String: [String: JSONValue]]) -> JSONValue {
        var out: [String: JSONValue] = [:]
        for (group, map) in mapByGroup {
            let arr = map.keys.sorted().compactMap { map[$0] }
            out[group] = .array(arr)
        }
        return .object(out)
    }

    /** The manifest integrity digest: sha-256 hex of the payload JSON string. */
    public static func integrityOf(payloadJson: String) -> String { sha256Hex(payloadJson) }

    /** Parse a `.sadaqa` file's bytes into (manifest, payload). */
    public static func parseFile(_ text: String) throws -> (manifest: JSONValue, payload: JSONValue) {
        guard let file = try? JSONValue.parse(text), case .object = file else { throw BackupCodecError.notJSON }
        guard let manifest = file["manifest"], let payload = file["payload"] else { throw BackupCodecError.notJSON }
        return (manifest, payload)
    }
}
