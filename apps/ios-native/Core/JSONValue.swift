// ============================================================================
// JSONValue.swift — untyped JSON tree with canonical serialization.
// Represents payload entities exactly like the JS golden code treats them
// (plain objects). Decodes numbers as Double like JS, preserving integer
// exactness for the values backups use (epoch ms, counts — all < 2^53).
// ============================================================================

import Foundation

public indirect enum JSONValue: Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    // conveniences
    public var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    public var doubleValue: Double? { if case .number(let n) = self { return n }; return nil }
    public var intValue: Int? { doubleValue.map { Int($0) } }
    public var int64Value: Int64? { doubleValue.map { Int64($0) } }
    public var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
    public var isNull: Bool { if case .null = self { return true }; return false }

    public subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }
}

extension JSONValue: Codable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let n = try? c.decode(Double.self) { self = .number(n); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        self = .null
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

public extension JSONValue {
    /// Parse a UTF-8/UTF-16 JSON document string.
    static func parse(_ text: String) throws -> JSONValue {
        guard let data = text.data(using: .utf8) else { throw BackupCodecError.notJSON }
        let v = try JSONDecoder().decode(JSONValue.self, from: data)
        return v
    }

    var arrayValue: [JSONValue]? { if case .array(let a) = self { return a }; return nil }
    var objectValue: [String: JSONValue]? { if case .object(let o) = self { return o }; return nil }
}
