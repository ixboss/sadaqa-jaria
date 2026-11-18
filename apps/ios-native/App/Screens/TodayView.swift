// ============================================================================
// TodayView.swift — Today Hub port (web screens/today.js golden). Hero 1 Hz
// countdown formats engine values only; Smart Card comes from the shared
// §9 resolver port (Core/SmartCard.swift) — never a UI re-implementation.
// ============================================================================

import SwiftUI

struct TodayView: View {
    @EnvironmentObject var appState: AppState
    @State private var now = Date.nowMs
    @State private var timer: Timer?
    @State private var showMonthSchedule = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    topHeader
                    hero
                    smartCard
                    scheduleCard
                    quickAppsCard
                    qiyamCard
                    khatmahCard
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 100)
            }
            .background(appState.theme.bg)
            .navigationTitle("اليوم")
            .onAppear { startTicker() }
            .onDisappear { timer?.invalidate() }
            .sheet(isPresented: $appState.searchPresented) { UniversalSearchView() }
            .sheet(isPresented: $showMonthSchedule) { monthScheduleSheet }
        }
    }

    private func startTicker() {
        now = Date.nowMs
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            now = Date.nowMs // format-only recompute; engine values stay fixed
        }
    }

    private var engine: BoundPrayerEngine { PrayerEngine.bind(appState.engineOptions) }

    private var cityNameAr: String {
        if let loc = appState.db.setting("location"), case .object(let o) = loc,
           let name = o["name_ar"]?.stringValue, !name.isEmpty {
            return name
        }
        return "مكة المكرمة"
    }

    private var currentMushafPage: Int {
        Int(appState.db.setting("mushaf_page")?.doubleValue ?? 1)
    }

    private var topHeader: some View {
        let tz = appState.engineOptions.timeZone
        let hijri = HijriEngine.withAdjust(Self.iso(now, tz: tz), appState.hijriAdjust)
        let greg = Self.gregDate(now, tz: tz)
        return HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(hijri.d) \(HijriEngine.monthsArSafe(hijri.m)) \(hijri.y) هـ")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(appState.theme.textPrimary)
                Text(greg)
                    .font(.system(size: 11)).foregroundStyle(appState.theme.textSecondary)
            }
            Spacer()
            NavigationLink { CityPickerView() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "location.fill").font(.system(size: 11))
                    Text(cityNameAr).font(.system(size: 12, weight: .semibold))
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(appState.theme.surface)
                .foregroundStyle(appState.theme.accent)
                .clipShape(Capsule())
                .overlay(Capsule().strokeBorder(appState.theme.border))
            }
        }
    }

    // hero — next prayer + Hijri date header
    private var hero: some View {
        let tz = appState.engineOptions.timeZone
        let next = try? engine.next(now)
        let isTomorrow = next.map { Self.iso($0.at, tz: tz) != Self.iso(now, tz: tz) } ?? false
        return VStack(spacing: 4) {
            Text("الصلاة القادمة")
                .font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
            if let n = next {
                Text("\(n.name.labelAr)\(isTomorrow ? " (غداً)" : "")").font(.system(size: 32, weight: .bold))
                    .foregroundStyle(appState.theme.accent)
                Text(Self.hms(n.at - now)).monospacedDigit()
                    .font(.system(size: 28, weight: .bold)).foregroundStyle(appState.theme.textPrimary)
                Text("الأذان \(Self.clock(n.at, tz: tz))").monospacedDigit()
                    .font(.system(size: 13)).foregroundStyle(appState.theme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 22)
        .background(
            LinearGradient(colors: [appState.theme.accent.opacity(0.14), appState.theme.surface], startPoint: .top, endPoint: .bottom)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appState.theme.accent.opacity(0.32)))
    }

    // Smart Context-Aware Card — the shared resolver's verdict (§9)
    private var smartCard: some View {
        let card = SmartCardResolver.resolve(now: now, engine: engine)
        return HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(card.badge).font(.system(size: 11)).foregroundStyle(appState.theme.accent)
                Text(card.title).font(.system(size: 17, weight: .bold))
                Text(card.sub).font(.system(size: 13)).foregroundStyle(appState.theme.textSecondary)
                Button(card.actionLabel) { appState.openSmartCardAction(card) }
                    .buttonStyle(.borderedProminent)
                    .tint(appState.theme.accent)
                    .foregroundStyle(appState.theme.accentContrast)
            }
            Spacer()
            Text(card.icon).font(.system(size: 26))
        }
        .padding(16)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appState.theme.border))
    }

    // 6-prayer 3-column grid, next highlighted + month schedule trigger
    private var scheduleCard: some View {
        let tz = appState.engineOptions.timeZone
        let dateIso = Self.iso(now, tz: tz)
        let sched = try? engine.daySchedule(dateIso)
        let next = try? engine.next(now)
        let cols = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        return VStack(spacing: 10) {
            HStack {
                Text("مواقيت اليوم").font(.system(size: 15, weight: .bold)).foregroundStyle(appState.theme.textPrimary)
                Spacer()
                Button("جدول الشهر") { showMonthSchedule = true }
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(appState.theme.surfaceRaised)
                    .foregroundStyle(appState.theme.accent)
                    .clipShape(Capsule())
            }
            if let s = sched {
                LazyVGrid(columns: cols, spacing: 8) {
                    ForEach(PrayerName.allCases, id: \.self) { name in
                        let isNext = next?.name == name
                        VStack(spacing: 4) {
                            Text(prayerIcon(name)).font(.system(size: 15))
                            Text(name.labelAr).font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(isNext ? appState.theme.accent : appState.theme.textSecondary)
                            Text(Self.clock(s.prayers[name] ?? 0, tz: tz)).monospacedDigit()
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(isNext ? appState.theme.accent : appState.theme.textPrimary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(isNext ? appState.theme.accent.opacity(0.14) : appState.theme.surfaceRaised)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(isNext ? appState.theme.accent.opacity(0.45) : .clear))
                    }
                }
            }
        }
        .padding(16)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appState.theme.border))
    }

    // 4-column Quick Apps Grid
    private var quickAppsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("تطبيقاتك اليومية").font(.system(size: 15, weight: .bold)).foregroundStyle(appState.theme.textPrimary)
            HStack(spacing: 8) {
                NavigationLink { TasbihView() } label: { quickAppTile("📿", "السبحة") }
                Button { appState.tab = .athkar } label: { quickAppTile("🤲", "الأذكار") }
                Button { appState.tab = .mushaf } label: { quickAppTile("📖", "المصحف") }
                NavigationLink { QiblaView() } label: { quickAppTile("🧭", "القبلة") }
            }
        }
        .padding(16)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appState.theme.border))
    }

    private func quickAppTile(_ icon: String, _ title: String) -> some View {
        VStack(spacing: 6) {
            Text(icon).font(.system(size: 20))
            Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(appState.theme.textPrimary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(appState.theme.surfaceRaised)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Qiyam windows (tonight)
    private var qiyamCard: some View {
        let tz = appState.engineOptions.timeZone
        let yIso = Self.iso(now - 86_400_000, tz: tz)
        let ws = try? engine.sunnahWindows(yIso)
        return VStack(alignment: .leading, spacing: 6) {
            Text("قيام الليل").font(.system(size: 15, weight: .bold)).foregroundStyle(appState.theme.textPrimary)
            if let w = ws {
                Text("منتصف الليل: \(Self.clock(w.midnight, tz: tz))")
                Text("الثلث الأخير: \(Self.clock(w.lastThird, tz: tz)) — حتى الفجر \(Self.clock(w.nextFajr, tz: tz))")
            }
        }
        .font(.system(size: 13)).foregroundStyle(appState.theme.textSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16).background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appState.theme.border))
    }

    // Khatmah follow-up card
    private var khatmahCard: some View {
        let page = currentMushafPage
        let pct = Int((Double(page) / 604.0 * 100.0).rounded())
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("متابعة المصحف").font(.system(size: 15, weight: .bold)).foregroundStyle(appState.theme.textPrimary)
                    Text("وصلت إلى صفحة \(page) من ٦٠٤").font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                }
                Spacer()
                Text("\(pct)٪")
                    .font(.system(size: 12, weight: .bold)).monospacedDigit()
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(appState.theme.accent.opacity(0.15))
                    .foregroundStyle(appState.theme.accent)
                    .clipShape(Capsule())
            }
            HStack(spacing: 8) {
                Button("تابع القراءة — صفحة \(page)") { appState.tab = .mushaf }
                    .buttonStyle(.borderedProminent)
                    .tint(appState.theme.accent)
                    .foregroundStyle(appState.theme.accentContrast)
                NavigationLink("الإعدادات") { SettingsView() }
                    .buttonStyle(.bordered)
            }
        }
        .padding(16).background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appState.theme.border))
    }

    private var monthScheduleSheet: some View {
        let tz = appState.engineOptions.timeZone
        return NavigationStack {
            List(0..<30, id: \.self) { offset in
                let ms = now + Int64(offset) * 86_400_000
                let iso = Self.iso(ms, tz: tz)
                let sched = try? engine.daySchedule(iso)
                HStack {
                    Text(String(iso.dropFirst(5))).font(.system(size: 12, weight: .bold)).monospacedDigit().frame(width: 44, alignment: .leading)
                    if let s = sched {
                        ForEach([PrayerName.fajr, .dhuhr, .asr, .maghrib, .isha], id: \.self) { p in
                            Text(Self.clock(s.prayers[p] ?? 0, tz: tz)).font(.system(size: 11)).monospacedDigit().frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .navigationTitle("جدول ٣٠ يوماً")
            .toolbar { Button("إغلاق") { showMonthSchedule = false } }
        }
    }

    private func prayerIcon(_ name: PrayerName) -> String {
        switch name {
        case .fajr: return "🌅"
        case .sunrise: return "☀️"
        case .dhuhr: return "🌤️"
        case .asr: return "🌇"
        case .maghrib: return "🌆"
        case .isha: return "🌙"
        }
    }

    static func gregDate(_ ms: Int64, tz: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar")
        f.timeZone = TimeZone(identifier: tz) ?? .current
        f.dateFormat = "EEEE · d MMMM"
        return f.string(from: Date(ms: ms))
    }

    // formatters (same shapes as the web screens)
    static func iso(_ ms: Int64, tz: String) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: tz) ?? .current
        let c = cal.dateComponents([.year, .month, .day], from: Date(ms: ms))
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }
    static func clock(_ ms: Int64, tz: String) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: tz) ?? .current
        let c = cal.dateComponents([.hour, .minute], from: Date(ms: ms))
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
    static func hms(_ msLeft: Int64) -> String {
        let s = max(0, Int(msLeft / 1000))
        return String(format: "%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
    }
}

extension HijriEngine {
    static func monthsArSafe(_ m: Int) -> String { (try? monthNameAr(m)) ?? "" }
}

extension AppState {
    /// Smart-card action routing (screen names match the web contract).
    func openSmartCardAction(_ card: SmartCard) {
        switch card.actionScreen {
        case "mushaf-page": tab = .mushaf
        case "adhkar-cat": tab = .athkar
        case "tools-qiyam", "tools-hijri": tab = .tools
        default: break
        }
    }
}
