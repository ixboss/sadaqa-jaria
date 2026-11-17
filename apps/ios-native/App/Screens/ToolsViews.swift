// ============================================================================
// ToolsViews.swift — Tools hub + Qibla (CoreLocation heading) + Hijri calendar
// (umalqura grid + White Days + 5 events) + Zakat + Qiyam + Settings. All
// math/engine calls go through the Core ports — no UI-side reimplementation.
// ============================================================================

import SwiftUI
import CoreLocation

struct ToolsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    toolTile(" القبلة", "بوصلة محددة القبلة", "safari") { QiblaView() }
                    toolTile("التقويم الهجري", "الأيام البيضاء والمناسبات", "calendar") { HijriCalendarView() }
                    toolTile("حاسبة الزكاة", "الذهب والفضة والنقود", "scalemass") { ZakatView() }
                    toolTile("حاسبة القيام", "منتصف الليل والثلث الأخير", "moon.stars") { QiyamView() }
                    toolTile("النسخ الاحتياطي", "ملف .sadaqa — دمج أو استبدال", "externaldrive") { BackupView() }
                    toolTile("الإعدادات", "المظهر والموقع وطريقة الحساب", "gearshape") { SettingsView() }
                }
                .padding(.horizontal, 16)
            }
            .background(appState.theme.bg)
            .navigationTitle("الأدوات")
        }
    }

    @ViewBuilder
    private func toolTile(_ name: String, _ sub: String, _ icon: String, @ViewBuilder dest: @escaping () -> some View) -> some View {
        NavigationLink {
            dest()
        } label: {
            HStack {
                Image(systemName: icon).font(.system(size: 20)).foregroundStyle(appState.theme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(.system(size: 15, weight: .semibold)).foregroundStyle(appState.theme.textPrimary)
                    Text(sub).font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                }
                Spacer()
                Image(systemName: "chevron.backward").font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
            }
            .padding(16)
            .background(appState.theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}

// ---------------------------------------------------------------------------
// Qibla — engine bearing + CLHeading live compass + manual dial fallback.
// ---------------------------------------------------------------------------

struct QiblaView: View {
    @EnvironmentObject var appState: AppState
    @State private var heading: Double?
    @State private var manualOffset: Double = 0
    @StateObject private var locator = CompassLocator()

    var body: some View {
        let opts = appState.engineOptions
        let bearing = QiblaEngine.qiblaBearing(lat: opts.lat, lng: opts.lng)
        let northDeg = locator.heading ?? manualOffset
        VStack(spacing: 14) {
            ZStack {
                Circle().stroke(appState.theme.border, lineWidth: 1).frame(maxWidth: 280, maxHeight: 280)
                // north group rotates -northDeg; Kaaba marker at (bearing - northDeg)
                ForEach(0..<8, id: \.self) { i in
                    Text(["ش", "شر", "ج", "غرب", "ش", "شرق", "ج", "غ"][i])
                        .font(.system(size: 11)).foregroundStyle(appState.theme.textSecondary)
                        .offset(y: -124)
                        .rotationEffect(.degrees(Double(i) * 45 - northDeg))
                }
                Image(systemName: "location.north.fill")
                    .rotationEffect(.degrees(-northDeg))
                    .font(.system(size: 18)).foregroundStyle(appState.theme.textSecondary)
                Image(systemName: "building.2.fill") // الكعبة
                    .font(.system(size: 26)).foregroundStyle(appState.theme.accent)
                    .rotationEffect(.degrees(bearing - northDeg))
                    .offset(y: -92)
            }
            .frame(width: 280, height: 280)
            Text("\(Int((bearing - northDeg + 360).truncatingRemainder(dividingBy: 360)))°")
                .font(.system(size: 22, weight: .bold)).monospacedDigit()
            HStack(spacing: 10) {
                Button("−1°") { manualOffset -= 1; locator.stop() }
                    .monospacedDigit()
                Text(locator.heading == nil ? "يدوي" : "بواصلة").font(.system(size: 12))
                    .foregroundStyle(appState.theme.textSecondary)
                Button("+1°") { manualOffset += 1; locator.stop() }
                    .monospacedDigit()
            }
            Text("الاتجاه من موقعك إلى الكعبة: \(String(format: "%.1f", bearing))°")
                .font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .background(appState.theme.bg)
        .navigationTitle("القبلة")
        .onAppear { locator.start() }
        .onDisappear { locator.stop() }
    }
}

@MainActor
final class CompassLocator: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var heading: Double?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.headingFilter = 3
    }

    func start() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingHeading()
    }

    func stop() { manager.stopUpdatingHeading() }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        // trueHeading preferred (magnetic declination corrected); webkitCompassHeading parity
        heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        heading = nil
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
        _hijriMonth = State(initialValue: HijriEngine.withAdjust(Self.todayIso(), 0))
    }

    static func todayIso() -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Button("‹") { shift(-1) }.font(.system(size: 16, weight: .bold))
                    Spacer()
                    Text("\(HijriEngine.monthsArSafe(hijriMonth.m)) \(hijriMonth.y) هـ")
                        .font(.system(size: 15, weight: .bold))
                    Spacer()
                    Button("›") { shift(1) }.font(.system(size: 16, weight: .bold))
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
        .onAppear { rebuild() }
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
        let todayIso = Self.todayIso()
        let adjust = appState.hijriAdjust
        var length = 29
        if (try? HijriEngine.fromHijri(HijriDate(y: hijriMonth.y, m: hijriMonth.m, d: 30))) != nil { length = 30 }
        for i in 0..<firstDow { cells.append(HijriCell(id: -i - 1, day: 0, gregorianIso: "", isToday: false, isWhiteDay: false)) }
        for d in 1...length {
            guard let g = try? HijriEngine.fromHijri(HijriDate(y: hijriMonth.y, m: hijriMonth.m, d: d)) else { continue }
            let h = HijriEngine.withAdjust(g, -adjust) // compare in unadjusted space
            let isToday = h == HijriEngine.withAdjust(todayIso, adjust)
            cells.append(HijriCell(id: d, day: d, gregorianIso: g, isToday: isToday, isWhiteDay: d >= 13 && d <= 15))
        }
        events = HijriEngine.events(Calendar.current.component(.year, from: Date()))
            .filter { HijriEngine.withAdjust($0.gregorian, adjust).m == hijriMonth.m }
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
        let p = iso.split("-").map { Int($0)! }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let d = cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))!
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
    @State private var persisted = false

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

    @ViewBuilder private field(_ label: String, _ binding: Binding<String>) -> some View {
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
        let yIso = TodayView.iso(now - 86_400_000, tz: tz)
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
            Text(value).font(.system(size: 14)).monospacedDigit().foregroundStyle(appState.theme.accent)
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

    var body: some View {
        Form {
            Section("المظهر") {
                Picker("السمة", selection: $appState.currentThemeKey) {
                    ForEach(SadaqaTheme.offeredKeys, id: \.self) { key in
                        Text(themeName(key)).tag(key)
                    }
                }
                .onChange(of: appState.currentThemeKey) { key in appState.setSetting("theme", .string(key)) }
                Picker("حجم الخط", selection: $appState.fontScale) {
                    ForEach([0.8, 1.0, 1.3, 1.5, 2.0], id: \.self) { s in
                        Text("\(Int(s * 100))٪").tag(s)
                    }
                }
                .onChange(of: appState.fontScale) { v in appState.setSetting("font_scale", .number(v)) }
            }
            Section("الموقع والحساب") {
                NavigationLink("اختيار المدينة") { CityPickerView() }
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
        }
        .navigationTitle("الإعدادات")
        .onAppear {
            calcMethod = appState.db.setting("calc_method")?.stringValue ?? "umm_al_qura"
            madhab = appState.db.setting("madhab")?.stringValue ?? "shafi"
            hlr = appState.db.setting("high_latitude_rule")?.stringValue ?? "middle_of_the_night"
        }
        @State var calcMethod: String = "umm_al_qura"
        @State var madhab: String = "shafi"
        @State var hlr: String = "middle_of_the_night"
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

/// Offline FTS city picker over the seeded 6,289 cities (vocalized input OK —
/// the index is normalized with remove_diacritics).
struct CityPickerView: View {
    @EnvironmentObject var appState: AppState
    @State private var query = ""
    @State private var results: [(id: Int, name: String, country: String)] = []

    var body: some View {
        List {
            Section {
                TextField("ابحث عن مدينة…", text: $query)
                    .autocorrectionDisabled()
                    .onChange(of: query) { q in search(q) }
            }
            ForEach(results, id: \.id) { r in
                Button {
                    appState.setSetting("location", .object([
                        "lat": .number(0), // filled below from the row
                        "lng": .number(0),
                        "timeZone": .string(""),
                        "cityId": .number(Double(r.id)),
                    ]))
                    select(cityId: r.id)
                } label: {
                    VStack(alignment: .leading) {
                        Text(r.name).font(.system(size: 15))
                        Text(r.country).font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                    }
                }
            }
        }
        .navigationTitle("المدينة")
    }

    /// FTS5 MATCH — parameter-bound query; the ftsQuery escape port lives in
    /// the engine (search.js ftsQuery wraps tokens in double quotes).
    private func search(_ q: String) {
        guard q.count >= 2 else { results = []; return }
        let term = q.split(separator: " ").map { "\"\($0)\"" }.joined(separator: " ")
        try? appState.db.queue.read { db in
            results = try Row.fetchAll(db, sql: """
                SELECT c.city_id, c.name_ar, c.country_ar, c.lat, c.lng, c.timezone
                FROM cities c WHERE c.rowid IN (SELECT rowid FROM fts_cities WHERE fts_cities MATCH ?) LIMIT 12
                """, arguments: [term]).map { r in
                (id: r["city_id"] as Int? ?? 0,
                 name: r["name_ar"] as String? ?? "",
                 country: r["country_ar"] as String? ?? "")
            }
        }
    }

    private func select(cityId: Int) {
        try? appState.db.queue.read { db in
            if let r = try Row.fetchOne(db, sql: "SELECT * FROM cities WHERE city_id = ?", arguments: [cityId]) {
                appState.setSetting("location", .object([
                    "lat": .number(r["lat"] as Double? ?? 0),
                    "lng": .number(r["lng"] as Double? ?? 0),
                    "timeZone": .string(r["timezone"] as String? ?? "UTC"),
                    "cityId": .number(Double(cityId)),
                ]))
                AdhanScheduler.shared.reschedule(db: appState.db)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Universal search (FTS ayahs + athkar + surahs) — sheet from the search pill.
// ---------------------------------------------------------------------------

struct UniversalSearchView: View {
    @EnvironmentObject var appState: AppState
    @State private var query = ""
    @State private var ayahs: [(n: Int, surah: String, text: String)] = []

    var body: some View {
        NavigationStack {
            List {
                TextField("ابحث في القرآن والأذكار…", text: $query)
                    .autocorrectionDisabled()
                    .onChange(of: query) { q in search(q) }
                ForEach(ayahs, id: \.n) { a in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(a.surah) — آية \(a.n)").font(.system(size: 12)).foregroundStyle(appState.theme.accent)
                        Text(a.text).font(.system(size: 17)).lineSpacing(8)
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("البحث")
            .toolbar { Button("إغلاق") { appState.searchPresented = false } }
        }
    }

    private func search(_ q: String) {
        guard q.count >= 2 else { ayahs = []; return }
        let term = q.split(separator: " ").map { "\"\($0)\"" }.joined(separator: " ")
        try? appState.db.queue.read { db in
            ayahs = try Row.fetchAll(db, sql: """
                SELECT a.ayah_number, a.text_uthmani, s.name_ar
                FROM ayahs a WHERE a.ayah_number IN (SELECT rowid FROM fts_ayahs WHERE fts_ayahs MATCH ?) LIMIT 25
                """, arguments: [term]).map { r in
                (n: r["ayah_number"] as Int? ?? 0,
                 surah: r["name_ar"] as String? ?? "",
                 text: r["text_uthmani"] as String? ?? "")
            }
        }
    }
}
