// ============================================================================
// AthkarView.swift + TasbihView.swift — Hisn al-Muslim reader (133 categories,
// per-item counters with ring progress, auto-advance, streak writes) and the
// electronic Tasbih (sync-first increment — the rapid-tap contract from the
// web port: local count updates SYNCHRONOUSLY, the DB write rides behind it).
// Haptics: CoreHaptics patterns from tokens.json (dhikrTick/complete/...).
// ============================================================================

import SwiftUI
import CoreHaptics

// ---------------------------------------------------------------------------
// Athkar
// ---------------------------------------------------------------------------

struct AthkarCategory: Identifiable {
    let id: String
    let nameAr: String
    let icon: String
}

struct AthkarItemData: Identifiable {
    let id: String
    let textAr: String
    let countTarget: Int
    let sourceAr: String?
    let grade: String?
    let fadlAr: String?
}

struct AthkarView: View {
    @EnvironmentObject var appState: AppState
    @State private var categories: [AthkarCategory] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(categories) { cat in
                        NavigationLink(value: cat.id) {
                            HStack {
                                Text(cat.icon).font(.system(size: 22))
                                Text(cat.nameAr).font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(appState.theme.textPrimary)
                                    .lineSpacing(6)
                                Spacer()
                                Image(systemName: "chevron.backward")
                                    .font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                            }
                            .padding(14)
                            .background(appState.theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .background(appState.theme.bg)
            .navigationTitle("الأذكار")
            .navigationDestination(for: String.self) { categoryId in
                AthkarReaderView(categoryId: categoryId)
            }
            .onAppear { loadCategories() }
        }
    }

    private func loadCategories() {
        var out: [AthkarCategory] = []
        try? appState.db.queue.read { db in
            for r in try Row.fetchAll(db, sql: "SELECT * FROM athkar_categories ORDER BY sort_order") {
                out.append(AthkarCategory(id: r["category_id"] as String? ?? "",
                                          nameAr: r["name_ar"] as String? ?? "",
                                          icon: r["icon"] as String? ?? "dhikr"))
            }
        }
        categories = out
    }
}

struct AthkarReaderView: View {
    @EnvironmentObject var appState: AppState
    let categoryId: String
    @State private var items: [AthkarItemData] = []
    @State private var counts: [String: Int] = [:]
    @State private var autoMode = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                    dhikrCard(item, index: idx)
                }
            }
            .padding(.horizontal, 16)
        }
        .background(appState.theme.bg)
        .navigationTitle("")
        .onAppear {
            loadItems()
            HapticsEngine.shared.prepare()
        }
    }

    private var dayKey: String {
        var cal = Calendar(identifier: .gregorian)
        let c = cal.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    private func loadItems() {
        var out: [AthkarItemData] = []
        try? appState.db.queue.read { db in
            for r in try Row.fetchAll(db, sql: "SELECT * FROM athkar_items WHERE category_id = ? ORDER BY sort_order", arguments: [categoryId]) {
                out.append(AthkarItemData(
                    id: r["item_id"] as String? ?? "",
                    textAr: r["text_ar"] as String? ?? "",
                    countTarget: (r["count_target"] as Int?) ?? 1,
                    sourceAr: r["source_ar"] as String?,
                    grade: r["grade"] as String?,
                    fadlAr: r["fadl_ar"] as String?))
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM adhkar_state WHERE day_key = ?", arguments: [dayKey]) {
                if let id = r["item_id"] as String?, let c = r["count"] as Int? { counts[id] = c }
            }
        }
        items = out
    }

    private func dhikrCard(_ item: AthkarItemData, index: Int) -> some View {
        let count = counts[item.id] ?? 0
        let done = item.countTarget > 0 && count >= item.countTarget
        let progress = item.countTarget > 0 ? Double(count) / Double(item.countTarget) : 0
        return VStack(alignment: .leading, spacing: 10) {
            Text(item.textAr)
                .font(.system(size: 19)).lineSpacing(10)
                .foregroundStyle(appState.theme.textPrimary)
            if item.countTarget > 0 {
                HStack {
                    Text("\(count)").font(.system(size: 22, weight: .bold)).monospacedDigit()
                        .foregroundStyle(appState.theme.accent)
                    Text("من \(item.countTarget)").font(.system(size: 13))
                        .foregroundStyle(appState.theme.textSecondary)
                    Spacer()
                    ZStack {
                        Circle().stroke(appState.theme.surfaceRaised, lineWidth: 6)
                        Circle().trim(to: progress).stroke(appState.theme.accent, lineWidth: 6)
                            .rotationEffect(.degrees(-90))
                        Text(item.countTarget > 0 ? "\(min(count, item.countTarget))/\(item.countTarget)" : "✓")
                            .font(.system(size: 11, weight: .bold)).monospacedDigit()
                    }
                    .frame(width: 46, height: 46)
                }
            }
            if let src = item.sourceAr, !src.isEmpty {
                (Text("التحقق: ").font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                 + Text(src).font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary))
                    .lineLimit(2)
            }
        }
        .padding(16)
        .background(appState.theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(done ? appState.theme.accent.opacity(0.55) : appState.theme.border))
        .contentShape(Rectangle())
        .onTapGesture { tap(item) }
    }

    private func tap(_ item: AthkarItemData) {
        let target = item.countTarget
        var c = counts[item.id] ?? 0
        guard target == 0 || c < target else { return }
        c += 1 // synchronous local increment (rapid-tap contract)
        counts[item.id] = c
        if c == target {
            HapticsEngine.shared.complete()
        } else {
            HapticsEngine.shared.tick()
        }
        let now = Date.nowMs
        try? appState.db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at, updated_at = excluded.updated_at
                """, arguments: [item.id, dayKey, c, c >= target && target > 0 ? now : nil, now])
            // streak write for window-tagged categories (morning/evening parity)
            if c >= target && target > 0, let kind = streakKind(for: categoryId) {
                try db.execute(sql: "INSERT OR REPLACE INTO streak_days (kind, day_key, done_at) VALUES (?, ?, ?)",
                               arguments: [kind, dayKey, now])
            }
        }
    }

    /// solar-window → streak kind (web: fajr→adhkar_morning, asr→adhkar_evening).
    private func streakKind(for categoryId: String) -> String? {
        var kind: String?
        try? appState.db.queue.read { db in
            let row = try Row.fetchOne(db, sql: "SELECT solar_window FROM athkar_categories WHERE category_id = ?", arguments: [categoryId])
            switch row?["solar_window"] as String? {
            case "fajr": kind = "adhkar_morning"
            case "asr": kind = "adhkar_evening"
            default: kind = nil
            }
        }
        return kind
    }
}

// ---------------------------------------------------------------------------
// Tasbih — dial with ring-to-target, sessions log, daily streak, stats.
// ---------------------------------------------------------------------------

struct TasbihCounter: Identifiable {
    let uuid: String
    let labelAr: String
    let dhikrText: String
    let target: Int?
    var count: Int
    let totalLifetime: Int
}

struct TasbihView: View {
    @EnvironmentObject var appState: AppState
    @State private var counters: [TasbihCounter] = []
    @State private var selected = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let c = counters[safe: selected] { dial(c) }
                    presetPicker
                    if let c = counters[safe: selected] { stats(c) }
                }
                .padding(.horizontal, 16)
            }
            .background(appState.theme.bg)
            .navigationTitle("السبحة")
            .onAppear { reload() }
        }
    }

    private func reload() {
        var out: [TasbihCounter] = []
        try? appState.db.queue.read { db in
            let rows = try Row.fetchAll(db, sql: "SELECT * FROM tasbih_counters WHERE deleted = 0 ORDER BY sort_order")
            if rows.isEmpty {
                // first-run presets (web parity: 33/33/34 lazily created)
                try db.execute(sql: """
                    INSERT OR IGNORE INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted)
                    VALUES (?, ?, ?, ?, 0, 0, 0, ?, 0)
                    """, arguments: [UUIDv7.uuid7(), "سبحان الله", "سبحان الله", 33, Date.nowMs])
                try db.execute(sql: """
                    INSERT OR IGNORE INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted)
                    VALUES (?, ?, ?, ?, 0, 0, 1, ?, 0)
                    """, arguments: [UUIDv7.uuid7(), "الحمد لله", "الحمد لله", 33, Date.nowMs])
                try db.execute(sql: """
                    INSERT OR IGNORE INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted)
                    VALUES (?, ?, ?, ?, 0, 0, 2, ?, 0)
                    """, arguments: [UUIDv7.uuid7(), "الله أكبر", "الله أكبر", 34, Date.nowMs])
            }
            for r in try Row.fetchAll(db, sql: "SELECT * FROM tasbih_counters WHERE deleted = 0 ORDER BY sort_order") {
                out.append(TasbihCounter(
                    uuid: r["uuid"] as String? ?? "",
                    labelAr: r["label_ar"] as String? ?? "",
                    dhikrText: r["dhikr_text"] as String? ?? "",
                    target: r["target"] as Int?,
                    count: (r["count"] as Int?) ?? 0,
                    totalLifetime: (r["total_lifetime"] as Int?) ?? 0))
            }
        }
        counters = out
        if selected >= out.count { selected = 0 }
    }

    private func dial(_ c: TasbihCounter) -> some View {
        let progress = c.target.map { Double(c.count % max($0, 1)) / Double($0) } ?? Double(c.count % 100) / 100
        return ZStack {
            Circle().stroke(appState.theme.surfaceRaised, lineWidth: 14)
            Circle().trim(to: progress).stroke(appState.theme.accent, lineWidth: 14)
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.15), value: progress)
            VStack(spacing: 6) {
                Text("\(c.count)").font(.system(size: 52, weight: .bold)).monospacedDigit()
                    .foregroundStyle(appState.theme.textPrimary)
                Text(c.dhikrText).font(.system(size: 14))
                    .foregroundStyle(appState.theme.textSecondary)
                if let t = c.target {
                    Text("من \(t)").font(.system(size: 12)).monospacedDigit()
                        .foregroundStyle(appState.theme.textSecondary)
                }
            }
        }
        .frame(maxWidth: 300, maxHeight: 300)
        .contentShape(Circle())
        .onTapGesture { tap(c) }
        .padding(.top, 18)
    }

    /// THE rapid-tap contract (web tap() port): increment the LOCAL count
    /// synchronously first — the DB write (count = count + 1, never a stale
    /// absolute value) rides the same atomic transaction for sessions+streak.
    private func tap(_ c: TasbihCounter) {
        guard let idx = counters.firstIndex(where: { $0.uuid == c.uuid }) else { return }
        let newCount = counters[idx].count + 1
        counters[idx].count = newCount // synchronous, async batch would race
        if let t = c.target, newCount == t { HapticsEngine.shared.complete() } else { HapticsEngine.shared.tick() }

        let now = Date.nowMs
        try? appState.db.queue.write { db in
            try db.execute(sql: "UPDATE tasbih_counters SET count = count + 1, total_lifetime = total_lifetime + 1, updated_at = ? WHERE uuid = ?",
                           arguments: [now, c.uuid])
            try db.execute(sql: "INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, 1, ?)",
                           arguments: [UUIDv7.uuid7(), c.uuid, now])
            if let t = c.target, newCount == t {
                try db.execute(sql: "INSERT OR IGNORE INTO streak_days (kind, day_key, done_at) VALUES ('tasbih', ?, ?)",
                               arguments: [dayKeyOf(now), now])
            }
        }
        WidgetStateBridge.prayersChanged() // cheap: refresh widget timeline data
    }

    private var presetPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(Array(counters.enumerated()), id: \.element.uuid) { idx, c in
                    Button(c.labelAr) { selected = idx }
                        .font(.system(size: 13))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(idx == selected ? appState.theme.accent : appState.theme.surface)
                        .foregroundStyle(idx == selected ? appState.theme.accentContrast : appState.theme.textPrimary)
                        .clipShape(Capsule())
                }
            }
        }
    }

    private func stats(_ c: TasbihCounter) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("الإجمالي التاريخي").font(.system(size: 14))
                Spacer()
                Text("\(c.totalLifetime)").font(.system(size: 14, weight: .bold)).monospacedDigit()
            }.padding(.vertical, 6)
            Divider().overlay(appState.theme.border)
            HStack {
                Text("جلسات اليوم").font(.system(size: 14))
                Spacer()
                Text("\(todaySessions(c))").font(.system(size: 14, weight: .bold)).monospacedDigit()
            }.padding(.vertical, 6)
        }
        .padding(.horizontal, 16)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private func todaySessions(_ c: TasbihCounter) -> Int {
        var n = 0
        try? appState.db.queue.read { db in
            n = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM tasbih_sessions WHERE counter_uuid = ? AND occurred_at >= ?",
                                 arguments: [c.uuid, dayKeyOf(Date.nowMs).startOfDayMs]) ?? 0
        }
        return n
    }
}

func dayKeyOf(_ ms: Int64) -> String {
    var cal = Calendar(identifier: .gregorian)
    let d = Date(ms: ms)
    let c = cal.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

extension String {
    /// Local-day start (00:00) as epoch ms — used by today-session queries.
    var startOfDayMs: Int64 {
        var cal = Calendar(identifier: .gregorian)
        let p = split(separator: "-").map { Int($0) ?? 0 }
        let d = cal.date(from: DateComponents(year: p.first ?? 0, month: p.dropFirst().first ?? 1, day: p.last ?? 1)) ?? Date()
        return Int64(d.timeIntervalSince1970 * 1000)
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
