// ============================================================================
// ToolsViews.swift — Tools hub + Qibla (CoreLocation heading) + Hijri calendar
// (umalqura grid + White Days + 5 events) + Zakat + Qiyam + Settings. All
// math/engine calls go through the Core ports — no UI-side reimplementation.
// ============================================================================

import SwiftUI
import CoreLocation
import GRDB

struct ToolsView: View {
    @EnvironmentObject var appState: AppState
    @State private var navPath = NavigationPath()

    var body: some View {
        let cols = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
        NavigationStack(path: $navPath) {
            ScrollView {
                LazyVGrid(columns: cols, spacing: 10) {
                    toolTile("القبلة", "بوصلة محددة القبلة", "safari") { QiblaView() }
                    toolTile("التقويم الهجري", "الأيام البيضاء والمناسبات", "calendar") { HijriCalendarView() }
                    toolTile("حاسبة الزكاة", "الذهب والفضة والنقود", "scalemass") { ZakatView() }
                    toolTile("حاسبة القيام", "منتصف الليل والثلث الأخير", "moon.stars") { QiyamView() }
                    toolTile("النسخ الاحتياطي", "ملف .sadaqa — دمج أو استبدال", "externaldrive") { BackupView() }
                    toolTile("الإعدادات", "المظهر والموقع وطريقة الحساب", "gearshape") { SettingsView() }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 120)
            }
            .background(appState.theme.bg)
            .navigationTitle("الأدوات")
            .navigationDestination(for: String.self) { tool in
                switch tool {
                case "qiyam": QiyamView()
                case "hijri": HijriCalendarView()
                default: EmptyView()
                }
            }
            .onAppear { openTargetToolIfNeeded() }
            .onChange(of: appState.targetTool) { _ in openTargetToolIfNeeded() }
        }
    }

    private func openTargetToolIfNeeded() {
        guard let tool = appState.targetTool else { return }
        navPath = NavigationPath([tool])
        appState.targetTool = nil
    }

    @ViewBuilder
    private func toolTile(_ name: String, _ sub: String, _ icon: String, @ViewBuilder dest: @escaping () -> some View) -> some View {
        NavigationLink {
            dest()
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(appState.theme.accent.opacity(0.14))
                        .frame(width: 40, height: 40)
                    Image(systemName: icon).font(.system(size: 18)).foregroundStyle(appState.theme.accent)
                }
                Text(name).font(.system(size: 15, weight: .bold)).foregroundStyle(appState.theme.textPrimary)
                Text(sub).font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary).lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 122, alignment: .topLeading)
            .padding(14)
            .background(appState.theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(appState.theme.border))
        }
        .buttonStyle(TactileCardButtonStyle())
    }
}

// ---------------------------------------------------------------------------
// Qibla — engine bearing + CLHeading live compass + manual dial fallback.
// ---------------------------------------------------------------------------

struct QiblaView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var manualOffset: Double = 0
    @State private var animNorth: Double = 0
    @State private var animKaaba: Double = 0
    @StateObject private var locator = CompassLocator()
    @StateObject private var gps = CityLocationDetector()

    private static let compassLabels = ["ش", "ش.شر", "شر", "ج.شر", "ج", "ج.غ", "غ", "ش.غ"]

    private static func shortestDelta(from: Double, to: Double) -> Double {
        var d = (to - from).truncatingRemainder(dividingBy: 360)
        if d > 180 { d -= 360 }
        if d < -180 { d += 360 }
        return d
    }

    var body: some View {
        let opts = appState.engineOptions
        // bearing from the live GPS fix when one is saved, else the selected city
        let locJson = appState.db.setting("location")?.objectValue
        let qLat = locJson?["gps"]?.objectValue?["lat"]?.doubleValue ?? opts.lat
        let qLng = locJson?["gps"]?.objectValue?["lng"]?.doubleValue ?? opts.lng
        let bearing = QiblaEngine.qiblaBearing(lat: qLat, lng: qLng)
        let distKm = QiblaEngine.distanceKm(lat: qLat, lng: qLng)
        let northDeg = locator.heading ?? manualOffset
        let relativeDeg = (bearing - northDeg + 360).truncatingRemainder(dividingBy: 360)
        let signedDelta = abs(((relativeDeg + 180).truncatingRemainder(dividingBy: 360)) - 180)
        let isAligned = signedDelta <= 5.0

        ScrollView {
            VStack(spacing: 14) {
                ZStack {
                    Circle()
                        .stroke(isAligned ? appState.theme.accent : appState.theme.border, lineWidth: isAligned ? 2.5 : 1)
                        .frame(maxWidth: 280, maxHeight: 280)
                    // Fixed top reference pointer (phone heading)
                    Capsule()
                        .fill(isAligned ? appState.theme.accent : appState.theme.textSecondary.opacity(0.6))
                        .frame(width: 4, height: 18)
                        .offset(y: -140)
                    // North group rotates -animNorth; Kaaba orbits dial via shortest arc
                    ForEach(0..<8, id: \.self) { i in
                        Text(Self.compassLabels[i])
                            .font(.system(size: 11, weight: i == 0 ? .bold : .regular))
                            .foregroundStyle(i == 0 ? appState.theme.accent : appState.theme.textSecondary)
                            .offset(y: -120)
                            .rotationEffect(.degrees(Double(i) * 45 + animNorth))
                    }
                    Image(systemName: "location.north.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(appState.theme.textSecondary)
                        .rotationEffect(.degrees(animNorth))
                    Image(systemName: "building.2.fill") // الكعبة — offset BEFORE rotation so it orbits
                        .font(.system(size: 26))
                        .foregroundStyle(appState.theme.accent)
                        .offset(y: -90)
                        .rotationEffect(.degrees(animKaaba))
                }
                .frame(width: 280, height: 280)
                .padding(.top, 8)
                .animation(reduceMotion ? nil : .interpolatingSpring(stiffness: 180, damping: 20), value: animNorth)
                .animation(reduceMotion ? nil : .interpolatingSpring(stiffness: 180, damping: 20), value: animKaaba)
                .onAppear {
                    animNorth = -northDeg
                    animKaaba = bearing - northDeg
                }
                .onChange(of: northDeg) { newNorth in
                    animNorth += Self.shortestDelta(from: animNorth, to: -newNorth)
                    animKaaba += Self.shortestDelta(from: animKaaba, to: bearing - newNorth)
                }
                .onChange(of: bearing) { newBearing in
                    animKaaba += Self.shortestDelta(from: animKaaba, to: newBearing - northDeg)
                }

                Text("\(Int(relativeDeg.rounded()))°")
                    .font(.system(size: 26, weight: .bold)).monospacedDigit()
                    .foregroundStyle(isAligned ? appState.theme.accent : appState.theme.textPrimary)

                if isAligned {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("باتجاه القبلة")
                    }
                    .font(.system(size: 13, weight: .bold))
                    .padding(.horizontal, 14).padding(.vertical, 6)
                    .background(appState.theme.accent.opacity(0.18))
                    .foregroundStyle(appState.theme.accent)
                    .clipShape(Capsule())
                }

                HStack(spacing: 12) {
                    Button("−1°") {
                        manualOffset = (manualOffset - 1 + 360).truncatingRemainder(dividingBy: 360)
                        locator.stop()
                    }
                    .buttonStyle(.bordered)
                    .monospacedDigit()

                    Button(locator.heading == nil ? "تفعيل البوصلة" : "بوصلة مباشرة") {
                        locator.start()
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(locator.heading == nil ? appState.theme.accent : appState.theme.textSecondary)

                    Button("+1°") {
                        manualOffset = (manualOffset + 1).truncatingRemainder(dividingBy: 360)
                        locator.stop()
                    }
                    .buttonStyle(.bordered)
                    .monospacedDigit()
                }

                if let statusNote = locator.statusNote, locator.heading == nil {
                    Text(statusNote)
                        .font(.system(size: 12))
                        .foregroundStyle(appState.theme.textSecondary)
                        .multilineTextAlignment(.center)
                }

                if distKm < 5 {
                    Text("موقعك قريب جداً من الكعبة — داخل الحرم تُقدَّر القبلة باتجاه الكعبة نفسه.")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(appState.theme.accent)
                        .multilineTextAlignment(.center)
                } else {
                    Text("الاتجاه من موقعك إلى الكعبة: \(String(format: "%.1f", bearing))° · \(Int(distKm.rounded())) كم")
                        .font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                }

                if let gpsError = gps.errorMessage {
                    Text(gpsError)
                        .font(.system(size: 12))
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                Button {
                    gps.detectNearest(in: appState.db) { city in
                        appState.selectCity(city, gps: gps.lastFix)
                    }
                } label: {
                    HStack(spacing: 6) {
                        if gps.isLocating {
                            ProgressView()
                        } else {
                            Image(systemName: "location.fill")
                        }
                        Text(gps.isLocating ? "جاري تحديد موقعك…" : "تحديد موقعي (GPS)")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(appState.theme.accent)
                }
                .disabled(gps.isLocating)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .padding(.horizontal, 16)
            .padding(.bottom, 100)
        }
        .background(appState.theme.bg)
        .navigationTitle("القبلة")
        .onAppear {
            HapticsEngine.shared.prepare()
            locator.start()
        }
        .onDisappear { locator.stop() }
        .onChange(of: isAligned) { aligned in
            if aligned { HapticsEngine.shared.tick() }
        }
    }
}

@MainActor
final class CompassLocator: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var heading: Double?
    @Published var statusNote: String?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.headingFilter = 2
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func start() {
        guard CLLocationManager.headingAvailable() else {
            heading = nil
            statusNote = "حساس البوصلة غير متاح — استخدم الضبط اليدوي"
            return
        }
        statusNote = nil
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
        manager.startUpdatingHeading()
    }

    func stop() {
        manager.stopUpdatingHeading()
        manager.stopUpdatingLocation()
        // clear the last heading so northDeg falls back to manualOffset —
        // the ±1° manual trim is dead while a stale heading still overrides it
        heading = nil
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        let deg = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        guard deg >= 0 else { return }
        Task { @MainActor in
            self.heading = deg
            self.statusNote = nil
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            if status == .denied || status == .restricted {
                self.statusNote = "الإذن مرفوض — البوصلة المغناطيسية أو الضبط اليدوي نشط"
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            if self.heading == nil {
                self.statusNote = "تعذر قراءة البوصلة — استخدم الضبط اليدوي"
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Hijri calendar — umalqura month grid, White-Days dots, 5 derived events.
// ---------------------------------------------------------------------------

struct HijriCalendarView: View {
    @EnvironmentObject var appState: AppState
    @State private var hijriMonth: HijriDate
    @State private var cells: [HijriCell] = []
    @State private var events: [HijriEngine.IslamicEvent] = []

    struct HijriCell: Identifiable {
        let id: Int
        let day: Int
        let gregorianIso: String
        let isToday: Bool
        let isWhiteDay: Bool
    }

    init() {
        _hijriMonth = State(initialValue: HijriEngine.withAdjust(Self.todayIso(tz: "Asia/Riyadh"), 0))
    }

    static func todayIso(tz: String) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: tz) ?? .current
        let c = cal.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Button { shift(-1) } label: { Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).padding(6) }
                    Spacer()
                    Text("\(HijriEngine.monthsArSafe(hijriMonth.m)) \(hijriMonth.y) هـ")
                        .font(.system(size: 15, weight: .bold))
                    Spacer()
                    Button { shift(1) } label: { Image(systemName: "chevron.left").font(.system(size: 15, weight: .semibold)).padding(6) }
                }
                let dows = ["ح", "ن", "ث", "ر", "خ", "ج", "س"] // أحد..سبت (RTL grid starts Sunday)
                HStack {
                    ForEach(dows, id: \.self) { d in
                        Text(d).font(.system(size: 11)).foregroundStyle(appState.theme.textSecondary)
                            .frame(maxWidth: .infinity)
                    }
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 4) {
                    ForEach(cells) { cell in
                        VStack(spacing: 2) {
                            Text("\(cell.day)")
                                .font(.system(size: 13, weight: cell.isToday ? .bold : .regular)).monospacedDigit()
                                .frame(maxWidth: .infinity, minHeight: 34)
                                .background(cell.isToday ? appState.theme.accent : Color.clear)
                                .foregroundStyle(cell.isToday ? appState.theme.accentContrast : appState.theme.textPrimary)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(cell.isWhiteDay ? appState.theme.accent.opacity(0.55) : .clear))
                        }
                    }
                }
                VStack(spacing: 0) {
                    ForEach(events, id: \.gregorian) { ev in
                        HStack {
                            Text(eventNameAr(ev.key)).font(.system(size: 13))
                            Spacer()
                            Text(ev.gregorian).font(.system(size: 13)).monospacedDigit()
                                .foregroundStyle(appState.theme.textSecondary)
                        }
                        .padding(.vertical, 7)
                        Divider().overlay(appState.theme.border)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .background(appState.theme.bg)
        .navigationTitle("التقويم الهجري")
        .onAppear {
            hijriMonth = HijriEngine.withAdjust(Self.todayIso(tz: appState.engineOptions.timeZone), appState.hijriAdjust)
            rebuild()
        }
    }

    private func shift(_ dir: Int) {
        var m = hijriMonth
        m.m += dir
        if m.m > 12 { m.m = 1; m.y += 1 }
        if m.m < 1 { m.m = 12; m.y -= 1 }
        hijriMonth = m
        rebuild()
    }

    /// Month grid via fromHijri day-1 + 29/30 probe (hijri.js monthCells parity).
    private func rebuild() {
        cells = []
        events = []
        guard let first = try? HijriEngine.fromHijri(HijriDate(y: hijriMonth.y, m: hijriMonth.m, d: 1)) else { return }
        // weekday of day 1 (0=Sunday) — the web uses UTC dow of the gregorian iso
        let firstDow = HijriEngine.weekdayOf(first)
        let todayIso = Self.todayIso(tz: appState.engineOptions.timeZone)
        let adjust = appState.hijriAdjust
        let todayHijri = HijriEngine.withAdjust(todayIso, adjust)
        var length = 29
        if (try? HijriEngine.fromHijri(HijriDate(y: hijriMonth.y, m: hijriMonth.m, d: 30))) != nil { length = 30 }
        for i in 0..<firstDow { cells.append(HijriCell(id: -i - 1, day: 0, gregorianIso: "", isToday: false, isWhiteDay: false)) }
        for d in 1...length {
            guard let g = try? HijriEngine.fromHijri(HijriDate(y: hijriMonth.y, m: hijriMonth.m, d: d)) else { continue }
            let isToday = (hijriMonth.y == todayHijri.y && hijriMonth.m == todayHijri.m && d == todayHijri.d)
            cells.append(HijriCell(id: d, day: d, gregorianIso: g, isToday: isToday, isWhiteDay: d >= 13 && d <= 15))
        }
        let lastIso = (try? HijriEngine.fromHijri(HijriDate(y: hijriMonth.y, m: hijriMonth.m, d: length))) ?? first
        let startYear = Int(first.prefix(4)) ?? Calendar.current.component(.year, from: Date())
        let endYear = Int(lastIso.prefix(4)) ?? startYear
        var seen = Set<String>()
        var allEvents: [HijriEngine.IslamicEvent] = []
        for yr in min(startYear, endYear)...max(startYear, endYear) {
            for ev in HijriEngine.events(yr) where seen.insert("\(ev.key)|\(ev.gregorian)").inserted {
                allEvents.append(ev)
            }
        }
        events = allEvents.filter {
            let h = HijriEngine.withAdjust($0.gregorian, adjust)
            return h.y == hijriMonth.y && h.m == hijriMonth.m
        }
    }

    private func eventNameAr(_ key: String) -> String {
        switch key {
        case "ramadan_start": return "بداية رمضان"
        case "eid_fitr": return "عيد الفطر"
        case "arafah": return "يوم عرفة"
        case "eid_adha": return "عيد الأضحى"
        case "ashura": return "يوم عاشوراء"
        default: return key
        }
    }
}

extension HijriEngine {
    /// 0=Sunday dow of a gregorian ISO day (UTC semantics, hijri.js parity).
    static func weekdayOf(_ iso: String) -> Int {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return 0 }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        guard let d = cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return 0 }
        return cal.component(.weekday, from: d) - 1
    }
}

// ---------------------------------------------------------------------------
// Zakat — cash/gold/silver/goods/debts, gold/silver nisab standards.
// ---------------------------------------------------------------------------

struct ZakatView: View {
    @EnvironmentObject var appState: AppState
    @State private var cash = ""
    @State private var gold = ""
    @State private var silver = ""
    @State private var goods = ""
    @State private var debts = ""
    @State private var goldPrice = ""
    @State private var silverPrice = ""
    @State private var standard = "gold"

    var body: some View {
        Form {
            Section("الأصول") {
                field("النقود", $cash)
                field("الذهب (جرام)", $gold)
                field("الفضة (جرام)", $silver)
                field("السلع والتجارة", $goods)
                field("الديون عليك", $debts)
            }
            Section("أسعار السوق") {
                field("سعر جرام الذهب", $goldPrice)
                field("سعر جرام الفضة", $silverPrice)
                Picker("النصاب بـ", selection: $standard) {
                    Text("الذهب").tag("gold")
                    Text("الفضة").tag("silver")
                }
                .onChange(of: standard) { _ in saveInputs() }
            }
            Section("الزكاة الواجبة") {
                let out = compute()
                Text("\(out.due) ريال").font(.system(size: 26, weight: .bold)).monospacedDigit()
                    .foregroundStyle(appState.theme.accent)
                Text(out.note).font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
            }
        }
        .navigationTitle("الزكاة")
        .onAppear { loadInputs() }
    }

    @ViewBuilder private func field(_ label: String, _ binding: Binding<String>) -> some View {
        TextField(label, text: binding)
            .keyboardType(.decimalPad)
            .onChange(of: binding.wrappedValue) { _ in saveInputs() }
    }

    private func num(_ s: String) -> Double { Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }

    /// nisab = 85×goldPrice | 595×silverPrice; due = wealth ≥ nisab ? wealth×0.025 : 0
    private func compute() -> (due: String, note: String) {
        let wealth = num(cash) + num(goods) - num(debts)
            + num(gold) * num(goldPrice) + num(silver) * num(silverPrice)
        let nisab = standard == "gold" ? 85.0 * num(goldPrice) : 595.0 * num(silverPrice)
        if wealth <= 0 || nisab <= 0 { return ("٠", "أدخل الأصول وأسعار السوق") }
        if wealth < nisab {
            return ("٠", "المال أقل من النصاب (\(Int(nisab)) ريال) — لا زكاة")
        }
        let due = (wealth * 0.025).rounded()
        return ("\(Int(due))", "النصاب \(standard == "gold" ? "الذهبي" : "الفضي"): \(Int(nisab)) ريال — 2.5% من المال")
    }

    private func loadInputs() {
        if let v = appState.db.setting("zakat_inputs"), case .object(let o) = v {
            cash = o["cash"]?.stringValue ?? ""
            gold = o["gold"]?.stringValue ?? ""
            silver = o["silver"]?.stringValue ?? ""
            goods = o["goods"]?.stringValue ?? ""
            debts = o["debts"]?.stringValue ?? ""
            goldPrice = o["goldPrice"]?.stringValue ?? ""
            silverPrice = o["silverPrice"]?.stringValue ?? ""
            standard = o["standard"]?.stringValue ?? "gold"
        }
    }

    private func saveInputs() {
        appState.setSetting("zakat_inputs", .object([
            "cash": .string(cash), "gold": .string(gold), "silver": .string(silver),
            "goods": .string(goods), "debts": .string(debts),
            "goldPrice": .string(goldPrice), "silverPrice": .string(silverPrice),
            "standard": .string(standard),
        ]))
    }
}

// ---------------------------------------------------------------------------
// Qiyam planner — tonight's midnight/last-third windows.
// ---------------------------------------------------------------------------

struct QiyamView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        let tz = appState.engineOptions.timeZone
        let now = Date.nowMs
        // tonight = the night whose fajr hasn't passed yet (web parity)
        let dateIso = TodayView.iso(now, tz: tz)
        let yIso = PrayerEngine.shiftCivilIso(dateIso, by: -1)
        let today = try? PrayerEngine.sunnahWindows(dateIso, appState.engineOptions)
        let yest = try? PrayerEngine.sunnahWindows(yIso, appState.engineOptions)
        let tonight = now < (yest?.nextFajr ?? 0) ? yest : today
        return ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                row("منتصف الليل", TonightWindow(tonight?.midnight, tz))
                row("الثلث الأخير", TonightWindow(tonight?.lastThird, tz))
                row("الفجر", TonightWindow(tonight?.nextFajr, tz))
                Text("خطة القيام: نام بعد العشاء واستيقظ قبل الفجر بـ ٧٠ دقيقة — الليل أفضل ساعة للدعاء.")
                    .font(.system(size: 13)).lineSpacing(8)
                    .foregroundStyle(appState.theme.textSecondary)
            }
            .padding(16)
        }
        .background(appState.theme.bg)
        .navigationTitle("القيام")
    }

    @ViewBuilder
    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 14, weight: .semibold))
            Spacer()
            Text(value)
                .font(.system(size: 14))
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
                .foregroundStyle(appState.theme.accent)
        }
        .padding(.vertical, 6)
    }
}

private func TonightWindow(_ ms: Int64?, _ tz: String) -> String {
    guard let ms else { return "—" }
    return TodayView.clock(ms, tz: tz)
}

// ---------------------------------------------------------------------------
// Settings — 4 themes, font scale, 13 calc methods, madhab, HLR, hijri adjust.
// (City picker over the 6,289-city FTS index lives in CityPickerView.)
// ---------------------------------------------------------------------------

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var calcMethod: String = "umm_al_qura"
    @State private var madhab: String = "shafi"
    @State private var hlr: String = "middle_of_the_night"

    private static let fontPresets: [(scale: Double, label: String)] = [
        (0.85, "صغير"),
        (1.0, "متوسط"),
        (1.3, "كبير"),
        (1.6, "كبير جداً"),
    ]

    private var fontPresetBinding: Binding<Double> {
        Binding(
            get: {
                Self.fontPresets.min(by: { abs($0.scale - appState.fontScale) < abs($1.scale - appState.fontScale) })?.scale ?? 1.3
            },
            set: { newVal in
                appState.setSetting("font_scale", .number(newVal))
            }
        )
    }

    private var mushafScaleBinding: Binding<Double> {
        Binding(
            get: { min(max(appState.mushafScale, 0.8), 2.0) },
            set: { newVal in
                appState.setSetting("mushaf_scale", .number(newVal))
            }
        )
    }

    var body: some View {
        Form {
            Section("المظهر") {
                Picker("السمة", selection: $appState.currentThemeKey) {
                    ForEach(SadaqaTheme.offeredKeys, id: \.self) { key in
                        Text(themeName(key)).tag(key)
                    }
                }
                .onChange(of: appState.currentThemeKey) { key in appState.setSetting("theme", .string(key)) }
                Picker("حجم الخط", selection: fontPresetBinding) {
                    ForEach(Self.fontPresets, id: \.scale) { p in
                        Text(p.label).tag(p.scale)
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("حجم خط المصحف")
                        Spacer()
                        Text("\(Int((appState.mushafScale * 100).rounded()))٪")
                            .monospacedDigit()
                            .foregroundStyle(appState.theme.accent)
                    }
                    Slider(value: mushafScaleBinding, in: 0.8...2.0, step: 0.05)
                        .tint(appState.theme.accent)
                }
            }
            Section("الموقع والحساب") {
                NavigationLink {
                    CityPickerView()
                } label: {
                    HStack {
                        Text("اختيار المدينة")
                        Spacer()
                        Text(appState.db.setting("location")?.objectValue?["name_ar"]?.stringValue ?? "مكة المكرمة")
                            .font(.system(size: 13))
                            .foregroundStyle(appState.theme.textSecondary)
                    }
                }
                Picker("طريقة الحساب", selection: $calcMethod) {
                    ForEach(PrayerEngine.calcMethods, id: \.self) { m in Text(calcName(m)).tag(m) }
                }
                .onChange(of: calcMethod) { appState.setSetting("calc_method", .string($0)) }
                Picker("المذهب (العصر)", selection: $madhab) {
                    Text("الشافعي").tag("shafi")
                    Text("الحنفي").tag("hanafi")
                }
                .onChange(of: madhab) { appState.setSetting("madhab", .string($0)) }
                Picker("خطوط العرض العالية", selection: $hlr) {
                    Text("منتصف الليل").tag("middle_of_the_night")
                    Text("سُبع الليل").tag("seventh_of_the_night")
                    Text("زاوية الشفق").tag("twilight_angle")
                }
                .onChange(of: hlr) { appState.setSetting("high_latitude_rule", .string($0)) }
                Picker("تعديل الهجري (±٣)", selection: $appState.hijriAdjust) {
                    ForEach([-3, -2, -1, 0, 1, 2, 3], id: \.self) { v in Text("\(v)").tag(v) }
                }
                .onChange(of: appState.hijriAdjust) { appState.setSetting("hijri_adjust", .number(Double($0))) }
            }
            Section("عن التطبيق") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("صدقة جارية — مصحف كامل وأذكار ومواقيت وختمة تعمل دون اتصال، وبياناتك تبقى على جهازك.")
                        .font(.system(size: 14))
                    Text("هذا المشروع صدقة جارية وليّةً لله تعالى، مُهداة عن المطوّر ixboss ووالديه وأحبته جميعاً — فمن انتفع به فليدعُ لهم بالثواب والأجر.")
                        .font(.system(size: 13))
                        .foregroundStyle(appState.theme.textSecondary)
                }
                .padding(.vertical, 2)
            }
        }
        .navigationTitle("الإعدادات")
        .onAppear {
            calcMethod = appState.db.setting("calc_method")?.stringValue ?? "umm_al_qura"
            madhab = appState.db.setting("madhab")?.stringValue ?? "shafi"
            hlr = appState.db.setting("high_latitude_rule")?.stringValue ?? "middle_of_the_night"
        }
    }

    private func themeName(_ key: String) -> String {
        switch key {
        case "dark": return "داكن"
        case "light": return "فاتح"
        case "sepia": return "سيبيا"
        case "night": return "ليلي (OLED)"
        default: return key
        }
    }

    private func calcName(_ key: String) -> String {
        [
            "muslim_world_league": "رابطة العالم الإسلامي", "egyptian": "المصرية (الهيئة العامة للمساحة)",
            "umm_al_qura": "أم القرى (مكة)", "karachi": "كراتشي", "moonsighting": "لجنة رؤية الهلال",
            "north_america": "أمريكا الشمالية (ISNA)", "dubai": "دبي", "kuwait": "الكويت", "qatar": "قطر",
            "singapore": "سنغافورة", "turkey": "تركيا (Diyanet)", "tehran": "طهران",
        ][key] ?? key
    }
}

/// Offline FTS city picker over the seeded 6,289 cities + one-tap GPS nearest
/// city detection (atomic GRDB write, zero reentrant read/write nesting).
struct CityPickerView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [SadaqaDatabase.CityRow] = []
    @StateObject private var gps = CityLocationDetector()

    var body: some View {
        List {
            Section {
                Button {
                    gps.detectNearest(in: appState.db) { city in
                        appState.selectCity(city, gps: gps.lastFix)
                        dismiss()
                    }
                } label: {
                    HStack(spacing: 8) {
                        if gps.isLocating {
                            ProgressView()
                        } else {
                            Image(systemName: "location.fill")
                        }
                        Text(gps.isLocating ? "جاري تحديد موقعك…" : "تحديد موقعي الحالي تلقائياً (GPS)")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(appState.theme.accent)
                }
                .disabled(gps.isLocating)

                if let error = gps.errorMessage {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(.red)
                }

                TextField("ابحث عن مدينة… (مثال: الزقازيق، القاهرة، الرياض)", text: $query)
                    .autocorrectionDisabled()
                    .onChange(of: query) { q in
                        results = appState.db.searchCities(query: q, limit: 25)
                    }
            }

            Section(query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 ? "مدن مختارة" : "النتائج") {
                ForEach(results) { city in
                    Button {
                        appState.selectCity(city)
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(city.nameAr).font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(appState.theme.textPrimary)
                                Text(city.countryAr).font(.system(size: 12))
                                    .foregroundStyle(appState.theme.textSecondary)
                            }
                            Spacer()
                            Text(city.timeZone).font(.system(size: 11))
                                .foregroundStyle(appState.theme.textSecondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("المدينة")
        .onAppear {
            if results.isEmpty {
                results = appState.db.searchCities(query: "", limit: 25)
            }
        }
    }
}

@MainActor
final class CityLocationDetector: NSObject, ObservableObject, CLLocationManagerDelegate {
    struct GpsFix: Sendable {
        let lat: Double
        let lng: Double
    }

    @Published var isLocating = false
    @Published var errorMessage: String?
    private(set) var lastFix: GpsFix?
    private let manager = CLLocationManager()
    private var db: SadaqaDatabase?
    private var onFound: ((SadaqaDatabase.CityRow) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func detectNearest(in db: SadaqaDatabase, onFound: @escaping (SadaqaDatabase.CityRow) -> Void) {
        self.db = db
        self.onFound = onFound
        errorMessage = nil
        isLocating = true
        let status = manager.authorizationStatus
        if status == .denied || status == .restricted {
            isLocating = false
            errorMessage = "تم رفض إذن الموقع من إعدادات الجهاز — يمكنك البحث عن مدينتك يدوياً."
            return
        }
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestLocation()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            guard self.isLocating else { return }
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                self.manager.requestLocation()
            } else if status == .denied || status == .restricted {
                self.isLocating = false
                self.errorMessage = "تم رفض إذن الموقع — اختر مدينتك من البحث."
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        let lat = loc.coordinate.latitude
        let lng = loc.coordinate.longitude
        Task { @MainActor in
            self.lastFix = GpsFix(lat: lat, lng: lng)
            self.isLocating = false
            if let city = self.db?.findNearestCity(lat: lat, lng: lng) {
                let cb = self.onFound
                self.onFound = nil
                cb?(city)
            } else {
                self.errorMessage = "تعذر العثور على مدينة قريبة في القاعدة المحلية."
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.isLocating = false
            self.errorMessage = "تعذر تحديد الموقع الحالي — تأكد من تفعيل GPS أو ابحث بالاسم."
        }
    }
}

// ---------------------------------------------------------------------------
// Universal search (FTS ayahs + athkar + surahs) — sheet from the search pill.
// ---------------------------------------------------------------------------

struct UniversalSearchView: View {
    @EnvironmentObject var appState: AppState
    @State private var query = ""
    @State private var ayahs: [(id: Int, nis: Int, page: Int, surah: String, text: String)] = []

    var body: some View {
        NavigationStack {
            List {
                TextField("ابحث في القرآن والأذكار", text: $query)
                    .autocorrectionDisabled()
                    .onChange(of: query) { q in search(q) }
                ForEach(ayahs, id: \.id) { a in
                    Button {
                        appState.targetMushafPage = a.page
                        appState.tab = .mushaf
                        appState.searchPresented = false
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(a.surah) · الآية \(a.nis) · ص \(a.page)")
                                .font(.system(size: 12))
                                .foregroundStyle(appState.theme.accent)
                            Text(a.text)
                                .font(.system(size: 17))
                                .foregroundStyle(appState.theme.textPrimary)
                                .lineSpacing(8)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("البحث")
            .toolbar { Button("إغلاق") { appState.searchPresented = false } }
        }
    }

    private func search(_ q: String) {
        let trimmed = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2, let term = SadaqaDatabase.ftsQuery(trimmed) else { ayahs = []; return }
        try? appState.db.queue.read { db in
            ayahs = try Row.fetchAll(db, sql: """
                SELECT a.ayah_number, a.number_in_surah, a.page, a.text_uthmani, s.name_ar
                FROM ayahs a
                JOIN surahs s ON s.number = a.surah
                WHERE a.ayah_number IN (SELECT rowid FROM fts_ayahs WHERE fts_ayahs MATCH ?) LIMIT 25
                """, arguments: [term]).map { r in
                (id: r["ayah_number"] as Int? ?? 0,
                 nis: r["number_in_surah"] as Int? ?? 1,
                 page: r["page"] as Int? ?? 1,
                 surah: r["name_ar"] as String? ?? "",
                 text: r["text_uthmani"] as String? ?? "")
            }
        }
    }
}
