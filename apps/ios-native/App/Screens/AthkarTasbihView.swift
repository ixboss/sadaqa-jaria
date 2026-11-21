// ============================================================================
// AthkarView.swift + TasbihView.swift — Hisn al-Muslim reader (133 categories,
// per-item counters with ring progress, auto-advance, streak writes) and the
// electronic Tasbih (sync-first increment — the rapid-tap contract from the
// web port: local count updates SYNCHRONOUSLY, the DB write rides behind it).
// Haptics: CoreHaptics patterns from tokens.json (dhikrTick/complete/...).
// ============================================================================

import SwiftUI
import CoreHaptics
import GRDB

// ---------------------------------------------------------------------------
// Athkar
// ---------------------------------------------------------------------------

struct AthkarCategory: Identifiable {
    let id: String
    let nameAr: String
    let solarWindow: String?
    let itemCount: Int

    var displaySymbol: String {
        switch solarWindow {
        case "fajr": return "sunrise"
        case "asr": return "sunset"
        case "night", "isha": return "moon.stars"
        case "duha": return "sun.max"
        case "after_prayer": return "building.columns"
        default: return "hands.sparkles"
        }
    }

    var windowBadge: String? {
        switch solarWindow {
        case "fajr": return "الصباح"
        case "asr": return "المساء"
        case "night", "isha": return "الليل"
        case "duha": return "الضحى"
        case "after_prayer": return "بعد الصلاة"
        default: return nil
        }
    }
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
    @State private var query = ""
    @State private var windowFilter = "all"
    @State private var navPath = NavigationPath()

    private var filtered: [AthkarCategory] {
        let targetFilter = SmartCardResolver.normalizeAthkarWindow(windowFilter) ?? windowFilter
        return categories.filter { c in
            let normalizedWindow = SmartCardResolver.normalizeAthkarWindow(c.solarWindow)
            let winOk = windowFilter == "all" || normalizedWindow == targetFilter
            let qOk = query.isEmpty || c.nameAr.contains(query)
            return winOk && qOk
        }
    }

    var body: some View {
        NavigationStack(path: $navPath) {
            ScrollView {
                VStack(spacing: 12) {
                    featuredGrid
                    searchAndFilters
                    ForEach(filtered) { cat in
                        NavigationLink(value: cat.id) {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(appState.theme.surfaceRaised)
                                        .frame(width: 36, height: 36)
                                    Image(systemName: cat.displaySymbol)
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundStyle(appState.theme.accent)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(cat.nameAr).font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(appState.theme.textPrimary)
                                        .lineSpacing(4)
                                    Text("\(cat.windowBadge.map { "\($0) · " } ?? "")\(cat.itemCount) \(cat.itemCount == 1 ? "ذكر" : "أذكار")")
                                        .font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.backward")
                                    .font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                            }
                            .padding(14)
                            .background(appState.theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(appState.theme.border))
                        }
                        .buttonStyle(TactileCardButtonStyle())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 120)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(appState.theme.bg)
            .navigationTitle("الأذكار")
            .navigationDestination(for: String.self) { categoryId in
                AthkarReaderView(categoryId: categoryId)
            }
            .onAppear {
                loadCategories()
                openTargetWindowIfNeeded()
            }
            .onChange(of: appState.targetAthkarWindow) { _ in
                openTargetWindowIfNeeded()
            }
        }
    }

    private func openTargetWindowIfNeeded() {
        guard let rawWin = appState.targetAthkarWindow else { return }
        let win = SmartCardResolver.normalizeAthkarWindow(rawWin) ?? rawWin
        if categories.isEmpty { loadCategories() }
        if win == "night",
           let sleepCat = categories.first(where: { $0.nameAr.contains("النَّوْم") || $0.nameAr.contains("النوم") }) {
            navPath = NavigationPath([sleepCat.id])
        } else if let cat = categories.first(where: { SmartCardResolver.normalizeAthkarWindow($0.solarWindow) == win }) {
            navPath = NavigationPath([cat.id])
        } else {
            windowFilter = win
        }
        appState.targetAthkarWindow = nil
    }

    private var featuredGrid: some View {
        let morning = categories.first { $0.solarWindow == "fajr" }
        let evening = categories.first { $0.solarWindow == "asr" && $0.nameAr.contains("المَسَاء") } ?? categories.first { $0.solarWindow == "asr" }
        let afterPrayer = categories.first { $0.solarWindow == "after_prayer" }
        let sleep = categories.first { $0.nameAr.contains("النَّوْم") || $0.nameAr.contains("النوم") } ?? categories.first { $0.solarWindow == "night" }
        let cols = [GridItem(.flexible()), GridItem(.flexible())]
        return LazyVGrid(columns: cols, spacing: 10) {
            if let m = morning {
                NavigationLink(value: m.id) { featuredCard("sunrise", "أذكار الصباح", "\(m.itemCount) ذكراً") }
                    .buttonStyle(TactileCardButtonStyle())
            }
            if let e = evening {
                NavigationLink(value: e.id) { featuredCard("sunset", "أذكار المساء", "\(e.itemCount) ذكراً") }
                    .buttonStyle(TactileCardButtonStyle())
            }
            if let a = afterPrayer {
                NavigationLink(value: a.id) { featuredCard("building.columns", "أذكار بعد الصلاة", "\(a.itemCount) ذكراً") }
                    .buttonStyle(TactileCardButtonStyle())
            }
            if let s = sleep {
                NavigationLink(value: s.id) { featuredCard("moon.stars", "أذكار النوم", "\(s.itemCount) ذكراً") }
                    .buttonStyle(TactileCardButtonStyle())
            }
            NavigationLink { TasbihView() } label: { featuredCard("circle.dashed", "السبحة الإلكترونية", "التسبيح والأوراد") }
                .buttonStyle(TactileCardButtonStyle())
            NavigationLink { AudioView() } label: { featuredCard("headphones", "التلاوة الصوتية", "استماع دون اتصال") }
                .buttonStyle(TactileCardButtonStyle())
        }
    }

    private func featuredCard(_ symbol: String, _ title: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(appState.theme.accent.opacity(0.14))
                    .frame(width: 36, height: 36)
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(appState.theme.accent)
            }
            Text(title).font(.system(size: 14, weight: .bold)).foregroundStyle(appState.theme.textPrimary)
            Text(sub).font(.system(size: 11)).monospacedDigit().foregroundStyle(appState.theme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(appState.theme.border))
    }

    private var searchAndFilters: some View {
        VStack(spacing: 8) {
            TextField("ابحث في أقسام حصن المسلم…", text: $query)
                .padding(10)
                .background(appState.theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(appState.theme.border))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach([("all", "الكل"), ("fajr", "الصباح"), ("asr", "المساء"), ("after_prayer", "بعد الصلاة"), ("night", "النوم والليل")], id: \.0) { k, label in
                        Button(label) { windowFilter = k }
                            .font(.system(size: 12, weight: .semibold))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(windowFilter == k ? appState.theme.accent : appState.theme.surface)
                            .foregroundStyle(windowFilter == k ? appState.theme.accentContrast : appState.theme.textSecondary)
                            .clipShape(Capsule())
                    }
                }
            }
        }
    }

    private func loadCategories() {
        var out: [AthkarCategory] = []
        try? appState.db.queue.read { db in
            for r in try Row.fetchAll(db, sql: """
                SELECT c.category_id, c.name_ar, c.solar_window,
                       (SELECT COUNT(*) FROM athkar_items i WHERE i.category_id = c.category_id) AS items
                FROM athkar_categories c ORDER BY c.sort_order
                """) {
                out.append(AthkarCategory(
                    id: r["category_id"] as String? ?? "",
                    nameAr: r["name_ar"] as String? ?? "",
                    solarWindow: r["solar_window"] as String?,
                    itemCount: r["items"] as Int? ?? 0
                ))
            }
        }
        categories = out
    }
}

struct AthkarReaderView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let categoryId: String
    @State private var categoryName = ""
    @State private var items: [AthkarItemData] = []
    @State private var counts: [String: Int] = [:]
    @State private var autoMode = false

    private var completedCount: Int {
        items.filter { it in
            let c = counts[it.id] ?? 0
            return it.countTarget > 0 ? c >= it.countTarget : c > 0
        }.count
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 12) {
                    // Progress summary bar
                    VStack(spacing: 6) {
                        HStack {
                            Text("\(completedCount) / \(items.count)").font(.system(size: 13, weight: .bold)).monospacedDigit()
                                .foregroundStyle(appState.theme.accent)
                            Spacer()
                            Toggle("بدون يدين", isOn: $autoMode).labelsHidden()
                            Text("بدون يدين").font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                        }
                        ProgressView(value: items.isEmpty ? 0 : Double(completedCount) / Double(items.count))
                            .tint(appState.theme.accent)
                            .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85), value: completedCount)
                    }
                    .padding(14)
                    .background(appState.theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                        dhikrCard(item, index: idx, proxy: proxy)
                            .id(item.id)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 120)
            }
            .task(id: autoMode) {
                guard autoMode else { return }
                while !Task.isCancelled && autoMode {
                    guard let idx = nextIncompleteIndex() else {
                        autoMode = false
                        break
                    }
                    let item = items[idx]
                    let delayNs = UInt64(Self.repSeconds(for: item.textAr) * 1_000_000_000)
                    try? await Task.sleep(nanoseconds: delayNs)
                    guard !Task.isCancelled && autoMode else { break }
                    tap(item, index: idx, proxy: proxy)
                }
            }
        }
        .background(appState.theme.bg)
        .navigationTitle(categoryName)
        .onAppear {
            loadItems()
            HapticsEngine.shared.prepare()
        }
        .onDisappear {
            autoMode = false
        }
    }

    private func nextIncompleteIndex() -> Int? {
        items.firstIndex { item in
            let count = counts[item.id] ?? 0
            return item.countTarget > 0 ? count < item.countTarget : count == 0
        }
    }

    private static func repSeconds(for text: String) -> Double {
        let words = text.split { $0.isWhitespace }.count
        return min(14.0, max(3.5, Double(words) * 0.45 + 1.5))
    }

    private var dayKey: String {
        let cal = Calendar(identifier: .gregorian)
        let c = cal.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    private func loadItems() {
        var out: [AthkarItemData] = []
        try? appState.db.queue.read { db in
            categoryName = (try String.fetchOne(db, sql: "SELECT name_ar FROM athkar_categories WHERE category_id = ?", arguments: [categoryId])) ?? "الأذكار"
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

    private func dhikrCard(_ item: AthkarItemData, index: Int, proxy: ScrollViewProxy) -> some View {
        let count = counts[item.id] ?? 0
        let done = item.countTarget > 0 ? count >= item.countTarget : count > 0
        let progress = item.countTarget > 0 ? min(1.0, Double(count) / Double(item.countTarget)) : (done ? 1.0 : 0.0)
        return VStack(alignment: .leading, spacing: 12) {
            Text(item.textAr)
                .font(.system(size: 22)).lineSpacing(12)
                .foregroundStyle(appState.theme.textPrimary)
            if item.countTarget > 0 {
                HStack {
                    Text("\(count)").font(.system(size: 22, weight: .bold)).monospacedDigit()
                        .foregroundStyle(appState.theme.accent)
                    Text("من \(item.countTarget)").font(.system(size: 13))
                        .foregroundStyle(appState.theme.textSecondary)
                    if done {
                        Text("✓ اكتمل")
                            .font(.system(size: 11, weight: .bold))
                            .padding(.horizontal, 9).padding(.vertical, 3)
                            .background(appState.theme.accent.opacity(0.16))
                            .foregroundStyle(appState.theme.accent)
                            .clipShape(Capsule())
                            .transition(.scale.combined(with: .opacity))
                    }
                    Spacer()
                    ZStack {
                        Circle().stroke(appState.theme.surfaceRaised, lineWidth: 6)
                        Circle().trim(to: progress)
                            .stroke(appState.theme.accent, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.85), value: progress)
                        Text("\(min(count, item.countTarget))/\(item.countTarget)")
                            .font(.system(size: 11, weight: .bold)).monospacedDigit()
                    }
                    .frame(width: 46, height: 46)
                }
            }
            if let fadl = item.fadlAr, !fadl.isEmpty {
                Text(fadl).font(.system(size: 12)).foregroundStyle(appState.theme.accent)
            }
            if let src = item.sourceAr, !src.isEmpty {
                (Text("التحقق: ").font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                 + Text(src).font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary))
                    .lineLimit(3)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 160, alignment: .leading)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(done ? appState.theme.accent.opacity(0.6) : appState.theme.border))
        .contentShape(Rectangle())
        .onTapGesture { tap(item, index: index, proxy: proxy) }
    }

    private func tap(_ item: AthkarItemData, index: Int, proxy: ScrollViewProxy) {
        let target = item.countTarget
        let current = counts[item.id] ?? 0
        guard target == 0 || current < target else { return }
        let c = current + 1 // synchronous local increment (rapid-tap contract)
        counts[item.id] = c
        let completedNow = target == 0 || c == target
        if target > 0 && c == target {
            HapticsEngine.shared.complete()
        } else {
            HapticsEngine.shared.tick()
        }
        let now = Date.nowMs
        let day = dayKey
        // Single non-reentrant atomic GRDB write (fixes instant crash on card tap)
        _ = try? appState.db.incrementDhikrTap(
            itemId: item.id,
            categoryId: categoryId,
            currentCount: current,
            target: target,
            dayKey: day,
            now: now
        )
        if completedNow, let nextItem = items[safe: index + 1] {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.36) {
                if reduceMotion {
                    proxy.scrollTo(nextItem.id, anchor: .center)
                } else {
                    withAnimation(.easeInOut(duration: 0.32)) {
                        proxy.scrollTo(nextItem.id, anchor: .center)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tasbih — dial with ring-to-target, sessions log, daily streak, stats.
// ---------------------------------------------------------------------------

struct TasbihCounter: Identifiable {
    var id: String { uuid }
    let uuid: String
    let labelAr: String
    let dhikrText: String
    let target: Int?
    var count: Int
    var totalLifetime: Int
}

struct TasbihView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var counters: [TasbihCounter] = []
    @State private var selected = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let c = counters[safe: selected] { dial(c) }
                presetPicker
                if let c = counters[safe: selected] { stats(c) }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 120)
        }
        .background(appState.theme.bg)
        .navigationTitle("السبحة")
        .onAppear { reload() }
    }

    private func reload() {
        let rows = (try? appState.db.ensureDefaultTasbihPresets(now: Date.nowMs)) ?? []
        counters = rows.map {
            TasbihCounter(
                uuid: $0.uuid,
                labelAr: $0.labelAr,
                dhikrText: $0.dhikrText,
                target: $0.target,
                count: $0.count,
                totalLifetime: $0.totalLifetime
            )
        }
        if selected >= counters.count { selected = 0 }
    }

    private func dial(_ c: TasbihCounter) -> some View {
        let target = c.target
        let done = target.map { c.count >= $0 } ?? false
        let progress = target.map { min(1.0, Double(c.count) / Double(max($0, 1))) } ?? Double(c.count % 100) / 100
        return ZStack {
            Circle().stroke(appState.theme.surfaceRaised, lineWidth: 14)
            Circle().trim(to: progress)
                .stroke(appState.theme.accent, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.82), value: progress)
            VStack(spacing: 6) {
                Text("\(c.count)").font(.system(size: 52, weight: .bold)).monospacedDigit()
                    .foregroundStyle(appState.theme.textPrimary)
                Text(c.dhikrText).font(.system(size: 14))
                    .foregroundStyle(appState.theme.textSecondary)
                if let t = target {
                    if done {
                        Text("✓ اكتمل")
                            .font(.system(size: 12, weight: .bold))
                            .padding(.horizontal, 10).padding(.vertical, 3)
                            .background(appState.theme.accent.opacity(0.16))
                            .foregroundStyle(appState.theme.accent)
                            .clipShape(Capsule())
                    } else {
                        Text("من \(t)").font(.system(size: 12)).monospacedDigit()
                            .foregroundStyle(appState.theme.textSecondary)
                    }
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
        counters[idx].totalLifetime += 1
        if let t = c.target, newCount == t { HapticsEngine.shared.complete() } else { HapticsEngine.shared.tick() }

        let now = Date.nowMs
        try? appState.db.recordTasbihTap(counterUuid: c.uuid, target: c.target, newCount: newCount, dayKey: dayKeyOf(now), now: now)
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
    let cal = Calendar(identifier: .gregorian)
    let d = Date(ms: ms)
    let c = cal.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
}

extension String {
    /// Local-day start (00:00) as epoch ms — used by today-session queries.
    var startOfDayMs: Int64 {
        let cal = Calendar(identifier: .gregorian)
        let p = split(separator: "-").map { Int($0) ?? 0 }
        let d = cal.date(from: DateComponents(year: p.first ?? 0, month: p.dropFirst().first ?? 1, day: p.last ?? 1)) ?? Date()
        return Int64(d.timeIntervalSince1970 * 1000)
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
