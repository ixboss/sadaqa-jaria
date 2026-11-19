// ============================================================================
// TodayView.swift — Today Hub port (web screens/today.js golden). Hero 1 Hz
// countdown formats engine values only; Smart Card comes from the shared
// §9 resolver port (Core/SmartCard.swift) — never a UI re-implementation.
// ============================================================================

import SwiftUI
import UIKit

struct TodayView: View {
    @EnvironmentObject var appState: AppState
    @State private var now = Date.nowMs
    @State private var showMonthSchedule = false
    @State private var dhikrIdx = 0

    private static let dhikrPillTexts = ["لا إله إلا الله", "سبحان الله وبحمده", "الحمد لله", "أستغفر الله", "اللهم صلِّ على نبينا محمد"]

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
                .padding(.bottom, 120)
            }
            .background(appState.theme.bg)
            .navigationTitle("اليوم")
            .task {
                now = Date.nowMs
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    now = Date.nowMs // format-only recompute; engine values stay fixed
                }
            }
            .task {
                // dhikr pill ambient rotation — 25s cycle, tap advances
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 25_000_000_000)
                    dhikrIdx = (dhikrIdx + 1) % Self.dhikrPillTexts.count
                }
            }
            .sheet(isPresented: $showMonthSchedule) { monthScheduleSheet }
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
            dhikrPill
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
        .animation(.easeInOut(duration: 0.35), value: dhikrIdx)
    }

    private var dhikrTransition: AnyTransition {
        UIAccessibility.isReduceMotionEnabled
            ? .opacity
            : .opacity.combined(with: .offset(y: 6))
    }

    // subtle rotating dhikr across from the title — shares the city-pill capsule style
    private var dhikrPill: some View {
        Button {
            dhikrIdx = (dhikrIdx + 1) % Self.dhikrPillTexts.count
            HapticsEngine.shared.tick()
        } label: {
            Text(Self.dhikrPillTexts[dhikrIdx % Self.dhikrPillTexts.count])
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(appState.theme.accent)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(appState.theme.surface)
                .clipShape(Capsule())
                .overlay(Capsule().strokeBorder(appState.theme.border))
                .id(dhikrIdx)
                .transition(dhikrTransition)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("الذكر التالي"))
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
                    .environment(\.layoutDirection, .leftToRight)
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
        let card = contextualCard(SmartCardResolver.resolve(now: now, engine: engine))
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(appState.theme.accent.opacity(0.14))
                        .frame(width: 36, height: 36)
                    Image(systemName: smartCardSymbol(card.kind))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(appState.theme.accent)
                }
                Spacer()
                Text(card.badge)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(appState.theme.accent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .overlay(Capsule().strokeBorder(appState.theme.accent.opacity(0.36)))
            }
            Text(card.title).font(.system(size: 17, weight: .semibold)).foregroundStyle(appState.theme.textPrimary)
            Text(card.sub).font(.system(size: 13)).foregroundStyle(appState.theme.textSecondary)
            Button(card.actionLabel) { appState.openSmartCardAction(card) }
                .buttonStyle(.borderedProminent)
                .tint(appState.theme.accent)
                .foregroundStyle(appState.theme.accentContrast)
        }
        .padding(16)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appState.theme.border))
    }

    /// When the resolver can only offer the countdown duplicate, swap in a
    /// time-of-day contextual card (same windows as the web Today screen —
    /// reuses existing SmartCardKind cases to stay parity-safe).
    private func contextualCard(_ card: SmartCard) -> SmartCard {
        guard card.kind == .next_prayer else { return card }
        let tz = appState.engineOptions.timeZone
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: tz) ?? .current
        let hour = cal.component(.hour, from: Date(ms: now))
        switch hour {
        case 4..<11:
            return SmartCard(kind: .morning, icon: "🌅", badge: "الوقت الحالي", title: "أذكار الصباح",
                             sub: "ورد الصباح من حصن المسلم — اقرأها قبل أن تنشغل",
                             actionLabel: "افتح أذكار الصباح", actionScreen: "adhkar-cat")
        case 11..<16:
            let h = HijriEngine.withAdjust(Self.iso(now, tz: tz), appState.hijriAdjust)
            return SmartCard(kind: .next_prayer, icon: "📅", badge: "التاريخ الهجري", title: "التقويم الهجري",
                             sub: "اليوم \(h.d) \(HijriEngine.monthsArSafe(h.m)) \(h.y) هـ",
                             actionLabel: "افتح الأدوات", actionScreen: "tools-hijri")
        case 16..<20:
            return SmartCard(kind: .evening, icon: "🌇", badge: "الوقت الحالي", title: "أذكار المساء",
                             sub: "ورد المساء من حصن المسلم — قبل غروب الشمس",
                             actionLabel: "افتح أذكار المساء", actionScreen: "adhkar-cat")
        default:
            return SmartCard(kind: .qiyam, icon: "🌙", badge: "وقت النوم", title: "أذكار النوم",
                             sub: "تسبيح ما قبل النوم يكفيك حاسدك الليلة",
                             actionLabel: "افتح الأذكار", actionScreen: "adhkar-cat")
        }
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
                            Image(systemName: prayerSymbol(name))
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(isNext ? appState.theme.accent : appState.theme.textSecondary)
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
                NavigationLink { TasbihView() } label: { quickAppTile("circle.dashed", "السبحة") }
                    .buttonStyle(TactileCardButtonStyle())
                Button { appState.tab = .athkar } label: { quickAppTile("hands.sparkles", "الأذكار") }
                    .buttonStyle(TactileCardButtonStyle())
                Button { appState.tab = .mushaf } label: { quickAppTile("book.closed", "المصحف") }
                    .buttonStyle(TactileCardButtonStyle())
                NavigationLink { QiblaView() } label: { quickAppTile("safari", "القبلة") }
                    .buttonStyle(TactileCardButtonStyle())
            }
        }
        .padding(16)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appState.theme.border))
    }

    private func quickAppTile(_ symbol: String, _ title: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(appState.theme.accent)
            Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(appState.theme.textPrimary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(appState.theme.surfaceRaised)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Qiyam windows (tonight = the night whose Fajr has not passed yet)
    private var qiyamCard: some View {
        let tz = appState.engineOptions.timeZone
        let todayIso = Self.iso(now, tz: tz)
        let todaySched = try? engine.daySchedule(todayIso)
        let qiyamIso = (todaySched.flatMap { $0.prayers[.fajr] }.map { now < $0 } ?? false)
            ? PrayerEngine.shiftCivilIso(todayIso, by: -1)
            : todayIso
        let ws = try? engine.sunnahWindows(qiyamIso)
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
        // يُحسب مرة واحدة عند الفتح (حتى يتغيّر اليوم المدني) — كان يعيد بناء
        // 30 daySchedule مع كل تكّة ثانية للحالة أثناء فتح الورقة (review 2026-11)
        MonthScheduleSheet(options: appState.engineOptions)
    }

    private func prayerSymbol(_ name: PrayerName) -> String {
        switch name {
        case .fajr: return "sunrise"
        case .sunrise: return "sun.max"
        case .dhuhr: return "sun.haze"
        case .asr: return "sunset"
        case .maghrib: return "moon.haze"
        case .isha: return "moon.stars"
        }
    }

    private func smartCardSymbol(_ kind: SmartCardKind) -> String {
        switch kind {
        case .kahf: return "book.closed"
        case .after_prayer: return "circle.dashed"
        case .qiyam: return "moon.stars"
        case .morning: return "sunrise"
        case .evening: return "sunset"
        case .next_prayer: return "building.columns"
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

/// جدول ٣٠ يوماً — يُحسب مرة واحدة عند الفتح (وعند تغيّر اليوم المدني فقط)
/// بدل إعادة 30 daySchedule مع كل تكّة ثانية للحالة (review 2026-11).
private struct MonthScheduleSheet: View {
    let options: EngineOptions
    @State private var rows: [(iso: String, cells: [String])] = []
    @State private var loadedKey = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(rows.indices, id: \.self) { i in
                HStack {
                    Text(String(rows[i].iso.dropFirst(5))).font(.system(size: 12, weight: .bold)).monospacedDigit().frame(width: 44, alignment: .leading)
                    ForEach(rows[i].cells, id: \.self) { c in
                        Text(c).font(.system(size: 11)).monospacedDigit().frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle("جدول ٣٠ يوماً")
            .toolbar { Button("إغلاق") { dismiss() } }
            .task(id: TodayView.iso(Date.nowMs, tz: options.timeZone)) {
                // civil-day shift in the city tz (epoch-ms offset math duplicates/skips
                // days across DST transitions)
                let todayIso = TodayView.iso(Date.nowMs, tz: options.timeZone)
                guard loadedKey != todayIso else { return }
                let engine = PrayerEngine.bind(options)
                let tz = options.timeZone
                var out: [(iso: String, cells: [String])] = []
                for offset in 0..<30 {
                    let iso = PrayerEngine.shiftCivilIso(todayIso, by: offset)
                    var cells: [String] = []
                    if let s = try? engine.daySchedule(iso) {
                        for p in [PrayerName.fajr, .dhuhr, .asr, .maghrib, .isha] {
                            cells.append(TodayView.clock(s.prayers[p] ?? 0, tz: tz))
                        }
                    }
                    out.append((iso, cells))
                }
                rows = out
                loadedKey = todayIso
            }
        }
    }
}

struct TactileCardButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(reduceMotion ? nil : .spring(response: 0.24, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

extension AppState {
    /// Smart-card action routing (screen names match the web contract).
    func openSmartCardAction(_ card: SmartCard) {
        switch card.actionScreen {
        case "mushaf-page":
            targetMushafPage = 293 // سورة الكهف
            tab = .mushaf
        case "adhkar-cat":
            targetAthkarWindow = card.kind == .after_prayer ? "after_prayer" : (card.kind == .evening ? "asr" : "fajr")
            tab = .athkar
        case "tools-qiyam":
            targetTool = "qiyam"
            tab = .tools
        case "tools-hijri":
            targetTool = "hijri"
            tab = .tools
        default: break
        }
    }
}
