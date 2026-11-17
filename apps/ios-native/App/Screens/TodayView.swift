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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    hero
                    smartCard
                    scheduleCard
                    qiyamCard
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(appState.theme.bg)
            .navigationTitle("اليوم")
            .onAppear { startTicker() }
            .onDisappear { timer?.invalidate() }
            .sheet(isPresented: $appState.searchPresented) { UniversalSearchView() }
        }
    }

    private func startTicker() {
        now = Date.nowMs
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            now = Date.nowMs // format-only recompute; engine values stay fixed
        }
    }

    private var engine: BoundPrayerEngine { PrayerEngine.bind(appState.engineOptions) }

    // hero — next prayer + Hijri date header
    private var hero: some View {
        let tz = appState.engineOptions.timeZone
        let hijri = HijriEngine.withAdjust(Self.iso(now, tz: tz), appState.hijriAdjust)
        let next = try? engine.next(now)
        return VStack(spacing: 4) {
            Text("\(HijriEngine.monthsArSafe(hijri.m)) \(hijri.d) \(hijri.y) هـ")
                .font(.system(size: 13)).foregroundStyle(appState.theme.textSecondary)
            if let n = next {
                Text(n.name.labelAr).font(.system(size: 30, weight: .bold))
                    .foregroundStyle(appState.theme.textPrimary)
                Text(Self.clock(n.at, tz: tz)).monospacedDigit()
                    .font(.system(size: 26, weight: .semibold)).foregroundStyle(appState.theme.accent)
                Text(Self.hms(n.at - now)).monospacedDigit()
                    .font(.system(size: 14)).foregroundStyle(appState.theme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 22)
        .background(appState.theme.surface.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 18))
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

    // 6-row daily schedule, next highlighted
    private var scheduleCard: some View {
        let tz = appState.engineOptions.timeZone
        let dateIso = Self.iso(now, tz: tz)
        let sched = try? engine.daySchedule(dateIso)
        let next = try? engine.next(now)
        return VStack(spacing: 0) {
            if let s = sched {
                ForEach(PrayerName.allCases, id: \.self) { name in
                    HStack {
                        Text(name.labelAr).font(.system(size: 14, weight: next?.name == name ? .bold : .regular))
                            .foregroundStyle(next?.name == name ? appState.theme.accent : appState.theme.textPrimary)
                        Spacer()
                        Text(Self.clock(s.prayers[name] ?? 0, tz: tz)).monospacedDigit()
                            .foregroundStyle(next?.name == name ? appState.theme.accent : appState.theme.textSecondary)
                    }
                    .padding(.vertical, 7)
                    Divider().overlay(appState.theme.border)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    // Qiyam windows (tonight)
    private var qiyamCard: some View {
        let tz = appState.engineOptions.timeZone
        let yIso = Self.iso(now - 86_400_000, tz: tz)
        let ws = try? engine.sunnahWindows(yIso)
        return VStack(alignment: .leading, spacing: 6) {
            Text("القيام").font(.system(size: 14, weight: .bold))
            if let w = ws {
                Text("منتصف الليل: \(Self.clock(w.midnight, tz: tz))")
                Text("الثلث الأخير: \(Self.clock(w.lastThird, tz: tz))")
            }
        }
        .font(.system(size: 13)).foregroundStyle(appState.theme.textSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16).background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    // formatters (same shapes as the web screens)
    static func iso(_ ms: Int64, tz: String) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: tz) ?? .current
        let c = cal.dateComponents([.year, .month, .day], from: Date(ms: ms))
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    static func clock(_ ms: Int64, tz: String) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: tz) ?? .current
        let c = cal.dateComponents([.hour, .minute], from: Date(ms: ms))
        return String(format: "%02d:%02d", c.hour!, c.minute!)
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
