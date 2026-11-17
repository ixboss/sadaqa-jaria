// ============================================================================
// UUIDv7.swift — port of apps/web-desktop/js/data/uuid7.js (golden)
// The .sadaqa validator accepts UUIDv7-shaped ids only. synthUuid7 must be
// BYTE-IDENTICAL across targets (Smart Merge dedupe) — parity vectors are
// pinned in Fixtures/uuid7/synth.json and asserted by UUID7ParityTests.
// FNV-1a iterates JS UTF-16 code units; the natural keys in practice
// (`setting:<k>`, `adhkar:<item>:<day>`, `streak:<kind>:<day>`, `row:<uuid>`)
// are ASCII by construction where code units == UTF-8 bytes (see uuid7.js).
// ============================================================================

import Foundation
import CryptoKit

public enum UUIDv7 {

    static func hex(_ v: UInt32, _ len: Int) -> String {
        String(format: "%0\(len)x", v)
    }

    static func shape(_ h: String, nowMs: Int64) -> String {
        // web: HEX(t, 12).slice(-12) = last 12 hex digits of the ms value.
        // Reproduce exactly: format the full 48-bit value as 12 lowercase hex.
        let ts48 = String(format: "%012llx", UInt64(bitPattern: Int64(nowMs)))
        let t12 = ts48.suffix(12)
        let idx = t12.index(t12.startIndex, offsetBy: 8)
        let a = String(t12[t12.startIndex..<idx])
        let b = String(t12[idx...])
        return "\(a)-\(b)-7\(h.prefix(3))-b\(h.dropFirst(3).prefix(3))-\(h.dropFirst(6).prefix(12))"
    }

    /// Fresh time-ordered UUIDv7 (crypto-random 10 bytes).
    public static func uuid7(now: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) -> String {
        var bytes = [UInt8](repeating: 0, count: 10)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let h = bytes.map { String(format: "%02x", $0) }.joined()
        return shape(h, nowMs: now)
    }

    /// Deterministic UUIDv7-shaped id from an arbitrary key (FNV-1a ×4).
    public static func synthUuid7(_ key: String, now: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) -> String {
        let seeds: [UInt32] = [0x811c9dc5, 0x0193dc47, 0x9e3779b9, 0x85ebca6b]
        let units: [UInt32] = key.unicodeScalars.map { UInt32($0.value) } // UTF-16 code units
        let hexes = seeds.map { seed -> String in
            var h = seed
            for c in units {
                h = (h ^ c) &* 0x01000193
            }
            return hex(h, 8)
        }
        return shape(hexes.joined(), nowMs: now)
    }

    /// The validator contract: `[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`
    public static func isUUIDv7Shape(_ s: String) -> Bool {
        guard s.count == 36 else { return false }
        let p = Array(s.utf8)
        func isHex(_ c: UInt8) -> Bool { (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46) }
        func hyphens(_ i: [Int]) -> Bool { i.allSatisfy { p[$0] == 0x2D } }
        guard hyphens([8, 13, 18, 23]) else { return false }
        for i in [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35] where !isHex(p[i]) { return false }
        // version nibble must be 7 (case-insensitive), variant nibble in [89ab]
        guard p[14] == 0x37 || p[14] == 0x67 else { return false }
        return [0x38, 0x39, 0x61, 0x62, 0x41, 0x42].contains(p[19])
    }
}

/// Canonical key-sorting serializer — the merge `equal()` port relies on
/// byte-stable JSON with recursively sorted keys and JS number formatting.
public enum CanonicalJSON {
    public static func serialize(_ value: JSONValue) -> String {
        var out = ""
        write(value, into: &out)
        return out
    }

    static func write(_ value: JSONValue, into out: inout String) {
        switch value {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .number(let n): out += formatNumber(n)
        case .string(let s): out += escapeString(s)
        case .array(let a):
            out += "["
            for (i, v) in a.enumerated() { if i > 0 { out += "," }; write(v, into: &out) }
            out += "]"
        case .object(let o):
            out += "{"
            for (i, k) in sortedKeys(o).enumerated() {
                if i > 0 { out += "," }
                out += escapeString(k) + ":"
                write(o[k]!, into: &out)
            }
            out += "}"
        }
    }

    /// Keys sorted; the `.sadaqa` top-level groups get the golden's fixed
    /// payload order (reading, dhikr, prefs, meta — backup.js insertion order)
    /// so payload bytes match the web exporter byte-for-byte.
    static func sortedKeys(_ o: [String: JSONValue]) -> [String] {
        let priority: [String: Int] = ["reading": 0, "dhikr": 1, "prefs": 2, "meta": 3]
        return o.keys.sorted {
            let pa = priority[$0], pb = priority[$1]
            if pa != nil || pb != nil { return (pa ?? 99) < (pb ?? 99) }
            return $0 < $1
        }
    }

    /// JS JSON.stringify number formatting for the finite values backups use
    /// (integers without a fractional part; doubles in shortest round-trip).
    static func formatNumber(_ d: Double) -> String {
        if d == d.rounded() && abs(d) < 1e15 {
            return String(Int64(d))
        }
        return "\(d)"
    }

    static func escapeString(_ s: String) -> String {
        var out = "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }
}

public func sha256Hex(_ s: String) -> String {
    let digest = SHA256.hash(data: Data(s.utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
}
