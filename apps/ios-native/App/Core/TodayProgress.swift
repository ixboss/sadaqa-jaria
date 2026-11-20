// ============================================================================
// TodayProgress.swift — pure aggregation for the Today screen's ورد اليوم
// card: athkar window (الصباح/المساء/النوم) completion + shape only. The DB
// queries live in TodayView; this type is unit-tested against fixtures.
// ============================================================================

import Foundation
import GRDB

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

    /// Today-window aggregation straight from the app DB — lives here (not in
    /// TodayView.swift) because GRDB's `Configuration` type shadows
    /// `ButtonStyle.Configuration` when both are imported into one file.
    static func load(db: SadaqaDatabase, dayKey: String) -> [WindowProgress] {
        var cats: [Category] = []
        var items: [Item] = []
        var states: [StateRow] = []
        try? db.queue.read { q in
            for r in try Row.fetchAll(q, sql: "SELECT category_id, name_ar, solar_window FROM athkar_categories") {
                cats.append(Category(
                    id: r["category_id"] as String? ?? "",
                    titleAr: r["name_ar"] as String? ?? "",
                    solarWindow: r["solar_window"] as String?))
            }
            for r in try Row.fetchAll(q, sql: "SELECT item_id, category_id, count_target FROM athkar_items") {
                items.append(Item(
                    id: r["item_id"] as String? ?? "",
                    categoryId: r["category_id"] as String? ?? "",
                    target: r["count_target"] as Int? ?? 1))
            }
            for r in try Row.fetchAll(q, sql: "SELECT item_id, count, completed_at FROM adhkar_state WHERE day_key = ?", arguments: [dayKey]) {
                states.append(StateRow(
                    itemId: r["item_id"] as String? ?? "",
                    count: r["count"] as Int? ?? 0,
                    completedAt: r["completed_at"] as Int64?))
            }
        }
        return compute(categories: cats, items: items, states: states).windows
    }
}