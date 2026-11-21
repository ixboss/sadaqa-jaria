// ============================================================================
// SadaqaApp.swift — Phase 5 iOS port entry. Liquid Glass stays on the control
// layer only (tokens.glassPolicy): the floating dock + search pill are glass;
// content surfaces are solid, per ARCHITECTURE §6. Tabs are custom layers (not
// a TabView): the active dock pill slides via matchedGeometryEffect and tab
// content cross-fades without remounting, so Mushaf state survives switching.
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
        ZStack {
            tabLayer(.today) { TodayView() }
            tabLayer(.mushaf) { MushafPageView() }
            tabLayer(.athkar) { AthkarView() }
            tabLayer(.tools) { ToolsView() }
        }
        .overlay(alignment: .bottom) {
            LiquidGlassDock()
                .padding(.bottom, 4)
        }
        // One modifier drives every tab change (dock taps, HUD escape buttons,
        // smart-card routing): dock pill spring + content cross-fade together.
        .animation(reduceMotion ? nil : Self.tabSpring, value: appState.tab)
        .tint(appState.theme.accent)
        // font_scale ("حجم الخط") must actually scale UI text — mapped onto
        // Apple's Dynamic Type steps (1.3 → .large keeps the shipped default look)
        .dynamicTypeSize(Self.dynamicSize(forScale: appState.fontScale))
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

    /// Tight spring shared by the dock pill and the content cross-fade.
    private static let tabSpring = Animation.spring(response: 0.32, dampingFraction: 0.8)

    /// Tab layers mount on first visit and stay alive afterwards (TabView
    /// lifetime parity): Mushaf reader state survives switching. Inactive
    /// layers fade to 0 and drop hit-testing; their layout is never rebuilt.
    @ViewBuilder
    private func tabLayer<Content: View>(_ tab: RootTab, @ViewBuilder content: () -> Content) -> some View {
        if appState.visitedTabs.contains(tab) {
            let active = appState.tab == tab
            content()
                .opacity(active ? 1 : 0)
                .scaleEffect(active || reduceMotion ? 1 : 0.99)
                .allowsHitTesting(active)
                .accessibilityHidden(!active)
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

// ============================================================================
// LiquidGlassDock — the app's 4-tab floating control layer (اليوم · المصحف ·
// الأذكار · الأدوات). Liquid Glass lives ONLY on this control surface; the
// active pill slides via matchedGeometryEffect on the tight tab spring.
// ============================================================================

enum DockMetrics {
    /// Dock capsule height (icon + label + paddings) for clearance math.
    static let height: CGFloat = 62
    /// Content clearance under the dock (dock + breathing room). Full-bleed
    /// readers pad their viewport by this so glyphs never hide behind glass.
    static let reservedHeight: CGFloat = 80
}

struct LiquidGlassDock: View {
    @EnvironmentObject var appState: AppState
    @Namespace private var pillNS

    private struct Item: Identifiable {
        let tab: RootTab
        let title: String
        let icon: String
        var id: RootTab { tab }
    }

    // Order matches the RTL dock: اليوم first (rightmost in RTL layout).
    private let items: [Item] = [
        .init(tab: .today, title: "اليوم", icon: "sun.max"),
        .init(tab: .mushaf, title: "المصحف", icon: "book.closed"),
        .init(tab: .athkar, title: "الأذكار", icon: "hands.sparkles"),
        .init(tab: .tools, title: "الأدوات", icon: "square.grid.2x2"),
    ]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(items) { item in
                dockButton(item)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        // Liquid Glass — floating control layer only (tokens.glassPolicy)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(appState.theme.border))
        .shadow(color: .black.opacity(0.20), radius: 12, y: 5)
        .padding(.horizontal, 28)
    }

    private func dockButton(_ item: Item) -> some View {
        let active = appState.tab == item.tab
        return Button {
            if appState.tab != item.tab {
                appState.tab = item.tab
                HapticsEngine.shared.tick()
            }
        } label: {
            VStack(spacing: 2) {
                Image(systemName: item.icon)
                    .font(.system(size: 17, weight: active ? .semibold : .medium))
                Text(item.title)
                    .font(.system(size: 10, weight: active ? .bold : .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(active ? appState.theme.accent : appState.theme.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background {
                if active {
                    Capsule()
                        .fill(appState.theme.accent.opacity(0.16))
                        .overlay(Capsule().strokeBorder(appState.theme.accent.opacity(0.40), lineWidth: 1))
                        .matchedGeometryEffect(id: "dock.activePill", in: pillNS)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(active ? [.isSelected] : [])
    }
}

enum RootTab: Hashable { case today, mushaf, athkar, tools }

/// App-wide state bridged to the GRDB database + settings.
@MainActor
final class AppState: ObservableObject {
    /// Tab lifetime: each tab mounts on first visit and stays alive afterwards
    /// — Mushaf reader state (page, HUD, hub tab) survives switching.
    @Published var tab: RootTab = .today {
        didSet { visitedTabs.insert(tab) }
    }
    @Published private(set) var visitedTabs: Set<RootTab> = [.today]
    @Published var searchPresented = false
    @Published var targetMushafPage: Int?
    @Published var targetAthkarWindow: String?
    @Published var targetTool: String?
    @Published var fontScale: Double = 1.3
    @Published var mushafScale: Double = 1.0
    @Published var hijriAdjust: Int = 0
    @Published var engineOptions: EngineOptions = EngineOptions(lat: 21.4225, lng: 39.8262, timeZone: "Asia/Riyadh")
    // Cached for views whose body re-evaluates every second (Today hero 1 Hz
    // countdown): reading user_settings through GRDB there ran a main-thread
    // SQLite query per tick (audit 2026-11-21).
    @Published var mushafPage: Int = 1
    @Published var cityNameAr: String = "مكة المكرمة"

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
        mushafPage = db.setting("mushaf_page")?.intValue ?? 1
        let city = db.setting("location")?.objectValue?["name_ar"]?.stringValue ?? ""
        cityNameAr = city.isEmpty ? "مكة المكرمة" : city
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
        if key == "mushaf_page" { mushafPage = value.intValue ?? mushafPage }
        if key == "location" {
            let city = value.objectValue?["name_ar"]?.stringValue ?? ""
            cityNameAr = city.isEmpty ? cityNameAr : city
        }
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
