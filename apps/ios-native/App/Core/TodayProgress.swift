// ============================================================================
// TodayProgress.swift — pure aggregation for the Today screen's ورد اليوم
// card: athkar window (الصباح/المساء/النوم) completion + shape only. The DB
// queries live in TodayView; this type is unit-tested against fixtures.
// ============================================================================

import Foundation

enum AthkarProgress {
    struct Category { let id: String; let titleAr: String; let solarWindow: String? }
    struct Item { let id: String; let categoryId: String; let target: Int }
    struct StateRow { let itemId: String; let count: Int; let completedAt: Int64? }
    struct WindowProgress: Equatable { let titleAr: String; let completed: Int; let total: Int }
    struct Report { let windows: [WindowProgress] }

    static let windowTitles: [(key: String, titleAr: String)] = [
        ("fajr", "الصباح"), ("asr", "المساء"), ("isha", "النوم"),
    ]

    /// Completion rule mirrors AthkarReaderView: count >= target (or any tap
    /// when the dhikr has no numeric target).
    static func compute(categories: [Category], items: [Item], states: [StateRow]) -> Report {
        var windowOf: [String: String] = [:]
        for c in categories where c.solarWindow != nil { windowOf[c.id] = c.solarWindow }
        let itemById = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let done: Set<String> = Set(states.compactMap { s in
            guard let item = itemById[s.itemId] else { return nil }
            let complete = item.target > 0 ? s.count >= item.target : s.count > 0
            return complete ? s.itemId : nil
        })
        let windows = windowTitles
            .map { key, title -> WindowProgress in
                let windowItems = items.filter { windowOf[$0.categoryId] == key }
                let completed = windowItems.filter { done.contains($0.id) }.count
                return WindowProgress(titleAr: title, completed: completed, total: windowItems.count)
            }
            .filter { $0.total > 0 } // never show an empty window row
        return Report(windows: windows)
    }
}