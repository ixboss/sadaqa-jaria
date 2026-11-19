// ============================================================================
// SadaqaApp.swift — Phase 5 iOS port entry. Liquid Glass stays on the control
// layer only (tokens.glassPolicy): the TabView bar + search pill adopt the iOS
// 26 glass APIs behind #available guards (deployment target 18.0); content
// surfaces are solid, per ARCHITECTURE §6.
// ============================================================================

import SwiftUI
import CoreLocation

@main
struct SadaqaApp: App {
    @StateObject private var appState = AppState()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environment(\.layoutDirection, .rightToLeft) // RTL-first app
                .preferredColorScheme(appState.theme.colorScheme)
                .task { await appState.bootstrap() }
        }
        .onChange(of: scenePhase) { _, phase in
            // Re-arm the adhan window on every foreground: the triggers are
            // non-repeating and cold launch alone left later days unarmed.
            if phase == .active {
                AdhanScheduler.shared.reschedule(db: appState.db)
            }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        if appState.db.loadError != nil {
            // Blocking recovery state: the db opened read-only or in-memory —
            // browsing an apparently-empty copy would hide the user's data and
            // lose session writes (2026-11 audit fix). Nothing is writable
            // behind this screen.
            DatabaseRecoveryView(error: appState.db.loadError ?? "")
        } else {
            mainTabs
        }
    }

    private var mainTabs: some View {
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
        // font_scale ("حجم الخط") must actually scale UI text — mapped onto
        // Apple's Dynamic Type steps (1.3 → .large keeps the shipped default look)
        .dynamicTypeSize(Self.dynamicSize(forScale: appState.fontScale))
        // iOS 26 Liquid Glass system bar. Scroll-minimize is deliberately not
        // applied: it collapses to a small circle that fails to auto-restore
        // on real devices — the bar stays visible (Mushaf manages its own chrome).
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

    /// font_scale (0.8–2.0) → Dynamic Type step; 1.3 maps to .large so the
    /// shipped default look is unchanged while the setting now applies app-wide.
    private static func dynamicSize(forScale s: Double) -> DynamicTypeSize {
        switch s {
        case ..<0.9: return .xSmall
        case ..<1.1: return .medium
        case ..<1.4: return .large
        case ..<1.8: return .xLarge
        default: return .xxLarge
        }
    }
}

/// Full-screen gate shown when the database failed to open read-write
/// (read-only or in-memory recovery queue). User data is never silently
/// swapped for an empty copy — the failure is explicit and blocking.
struct DatabaseRecoveryView: View {
    let error: String

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "externaldrive.badge.exclamationmark")
                .font(.system(size: 46))
                .foregroundStyle(.secondary)
            Text("تعذّر فتح قاعدة البيانات")
                .font(.title2.weight(.semibold))
            Text("بياناتك محفوظة ولم تُمس، لكن التطبيق لا يستطيع الكتابة عليها الآن. أعد تشغيل التطبيق؛ وإن تكرر الخطأ فجرّب تحرير مساحة التخزين أو تثبيت التحديث الأخير.")
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 28)
            Text(error)
                .font(.caption2.monospaced())
                .foregroundStyle(.tertiary)
                .lineLimit(3)
                .padding(.horizontal, 28)
            Button("إعادة تشغيل التطبيق") {
                exit(0) // tray-free iOS app: relaunch re-runs the recovery ladder
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
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

enum RootTab: Hashable { case today, mushaf, athkar, tools }

/// App-wide state bridged to the GRDB database + settings.
@MainActor
final class AppState: ObservableObject {
    @Published var tab: RootTab = .today
    @Published var searchPresented = false
    @Published var targetMushafPage: Int?
    @Published var targetAthkarWindow: String?
    @Published var targetTool: String?
    @Published var fontScale: Double = 1.3
    @Published var mushafScale: Double = 1.0
    @Published var hijriAdjust: Int = 0
    @Published var engineOptions: EngineOptions = EngineOptions(lat: 21.4225, lng: 39.8262, timeZone: "Asia/Riyadh")

    let db = SadaqaDatabase.shared
    // retained while the launch auto-detect request is in flight
    private var cityDetector: CityLocationDetector?

    var theme: SadaqaThemeColors {
        SadaqaTheme.load(key: currentThemeKey)
    }

    @Published var currentThemeKey: String = "dark"

    func bootstrap() async {
        reloadFromDatabase()
        FontRegistry.registerBasmala()
        autoDetectCityIfNeeded()
    }

    /// Refresh in-memory AppState + widgets + Adhan schedule from SQLite without bumping updated_at.
    func reloadFromDatabase() {
        currentThemeKey = db.setting("theme")?.stringValue ?? "dark"
        fontScale = db.setting("font_scale")?.doubleValue ?? 1.3
        mushafScale = db.setting("mushaf_scale")?.doubleValue ?? 1.0
        hijriAdjust = db.hijriAdjust()
        engineOptions = db.engineOptions()
        WidgetStateBridge.publishWidgetState(db: db)
        AdhanScheduler.shared.reschedule(db: db)
    }

    /// Launch auto-city: only when location permission is ALREADY granted and
    /// no city was ever chosen — never prompts, never overrides a manual pick.
    private func autoDetectCityIfNeeded() {
        guard db.setting("location")?.objectValue?["cityId"] == nil else { return }
        let status = CLLocationManager().authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return }
        let detector = CityLocationDetector()
        cityDetector = detector
        detector.detectNearest(in: db) { [weak self] city in
            // re-check: a manual pick made while the fix was in flight wins
            guard let self, self.db.setting("location")?.objectValue?["cityId"] == nil else { return }
            self.selectCity(city, gps: detector.lastFix)
            self.cityDetector = nil
        }
    }

    func setSetting(_ key: String, _ value: JSONValue) {
        try? db.setSetting(key, value)
        if key == "theme", let s = value.stringValue { currentThemeKey = s }
        if key == "font_scale" { fontScale = value.doubleValue ?? fontScale }
        if key == "mushaf_scale" { mushafScale = value.doubleValue ?? mushafScale }
        if key == "hijri_adjust" { hijriAdjust = value.intValue ?? hijriAdjust }
        if key == "location" || key == "calc_method" || key == "madhab" || key == "high_latitude_rule" {
            engineOptions = db.engineOptions()
            WidgetStateBridge.publishWidgetState(db: db)
            AdhanScheduler.shared.reschedule(db: db)
        }
    }

    func selectCity(_ city: SadaqaDatabase.CityRow, gps: CityLocationDetector.GpsFix? = nil) {
        if let loc = try? db.selectCity(city, gpsLat: gps?.lat, gpsLng: gps?.lng) {
            setSetting("location", loc)
        }
    }
}
