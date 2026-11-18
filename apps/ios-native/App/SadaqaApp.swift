// ============================================================================
// SadaqaApp.swift — Phase 5 iOS port entry. Liquid Glass stays on the control
// layer only (tokens.glassPolicy): the TabView bar + search pill adopt the iOS
// 26 glass APIs behind #available guards (deployment target 18.0); content
// surfaces are solid, per ARCHITECTURE §6.
// ============================================================================

import SwiftUI

@main
struct SadaqaApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environment(\.layoutDirection, .rightToLeft) // RTL-first app
                .preferredColorScheme(appState.theme.colorScheme)
                .task { await appState.bootstrap() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        TabView(selection: $appState.tab) {
            TodayView()
                .tabItem { Label("اليوم", systemImage: "sun.max") }
                .tag(RootTab.today)
            MushafPageView()
                .tabItem { Label("المصحف", systemImage: "book.closed") }
                .tag(RootTab.mushaf)
            AthkarView()
                .tabItem { Label("الأذكار", systemImage: "hands.sparkles") }
                .tag(RootTab.athkar)
            ToolsView()
                .tabItem { Label("الأدوات", systemImage: "square.grid.2x2") }
                .tag(RootTab.tools)
        }
        .tint(appState.theme.accent)
        // iOS 26 Liquid Glass: floating bar minimizes on scroll + trailing
        // Search pill. On iOS 18 these modifiers no-op (compiled-out).
        .applyGlassTabBar()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationSearchPill()
            }
        }
        .sheet(isPresented: $appState.searchPresented) {
            UniversalSearchView()
                .environmentObject(appState)
        }
    }
}

/// Trailing Search pill → Universal search sheet (FTS5 vocalized search).
struct NavigationSearchPill: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Button {
            appState.searchPresented = true
        } label: {
            Image(systemName: "magnifyingglass")
        }
        .accessibilityLabel("بحث")
    }
}

private extension View {
    /// `tabBarMinimizeBehavior(.onScrollDown)` + search pill minimize — iOS 26 only.
    @ViewBuilder
    func applyGlassTabBar() -> some View {
        if #available(iOS 26.0, *) {
            self.tabBarMinimizeBehavior(.onScrollDown)
                .searchToolbarBehavior(.minimize)
        } else {
            self
        }
    }
}

enum RootTab: Hashable { case today, mushaf, athkar, tools }

/// App-wide state bridged to the GRDB database + settings.
@MainActor
final class AppState: ObservableObject {
    @Published var tab: RootTab = .today
    @Published var searchPresented = false
    @Published var targetMushafPage: Int?
    @Published var fontScale: Double = 1.3
    @Published var hijriAdjust: Int = 0
    @Published var engineOptions: EngineOptions = EngineOptions(lat: 21.4225, lng: 39.8262, timeZone: "Asia/Riyadh")

    let db = SadaqaDatabase.shared

    var theme: SadaqaThemeColors {
        SadaqaTheme.load(key: currentThemeKey)
    }

    @Published var currentThemeKey: String = "dark"

    func bootstrap() async {
        if let t = db.setting("theme")?.stringValue { currentThemeKey = t }
        fontScale = db.setting("font_scale")?.doubleValue ?? 1.3
        hijriAdjust = db.hijriAdjust()
        engineOptions = db.engineOptions()
        WidgetStateBridge.publishWidgetState(db: db)
        AdhanScheduler.shared.reschedule(db: db)
        FontRegistry.registerBasmala()
    }

    func setSetting(_ key: String, _ value: JSONValue) {
        try? db.setSetting(key, value)
        if key == "theme", let s = value.stringValue { currentThemeKey = s }
        if key == "font_scale" { fontScale = value.doubleValue ?? fontScale }
        if key == "hijri_adjust" { hijriAdjust = value.intValue ?? hijriAdjust }
        if key == "location" || key == "calc_method" || key == "madhab" || key == "high_latitude_rule" {
            engineOptions = db.engineOptions()
            WidgetStateBridge.publishWidgetState(db: db)
            AdhanScheduler.shared.reschedule(db: db)
        }
    }

    func selectCity(_ city: SadaqaDatabase.CityRow) {
        if let loc = try? db.selectCity(city) {
            setSetting("location", loc)
        }
    }
}
