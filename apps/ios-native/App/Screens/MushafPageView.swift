// ============================================================================
// MushafPageView.swift — Full Mushaf Hub (المصحف | قراءاتي وختمتي | الفهرس):
// 604-page QPC1 plates with runtime glyph verification (fallback to plain
// text_uthmani + bundled UthmanicHafs1Ver18 if QPC1 glyphs fail verification —
// zero PUA tofu/gibberish ever), LTR-isolated BSML, bookmark toggle, RTL swipe,
// Surah/Juz/Hizb header, Ayah Action Sheet (Tafsir, Mutashabihat, Bookmark,
// Copy, Share, Play), plus Khatmah & 114-Surah / 30-Juz navigator.
// ============================================================================

import SwiftUI
import GRDB
import UIKit

enum MushafHubTab: String, CaseIterable, Identifiable {
    case reader = "المصحف"
    case reading = "قراءاتي وختمتي"
    case index = "الفهرس"
    var id: String { rawValue }
}

struct MushafPageView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @EnvironmentObject var appState: AppState
    @State private var hubTab: MushafHubTab = .reader
    @State private var page: Int = 1
    @State private var sliderPage: Double = 1
    @State private var isDraggingSlider = false
    @State private var hudVisible = false
    @State private var meta = MushafRepository.PageMeta(surahName: "", juz: 1, hizb: 1)
    @State private var isBookmarked = false
@State private var selectedAyahNumber: Int?
@State private var showAyahSheet = false
@State private var showAppearanceSheet = false
    @State private var surahQuery = ""
    @State private var surahs: [MushafRepository.SurahItem] = []
    @State private var juzStarts: [(juz: Int, page: Int)] = []
    @State private var bookmarks: [MushafRepository.BookmarkItem] = []
    @State private var showAudioSheet = false
    @State private var activeRecitation: (surah: Int, ayah: Int)?
    @StateObject private var pageCache = MushafPageCache()
    @StateObject private var player = AudioPlayerChain()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                switch hubTab {
                case .reader:
                    readerBody
                case .reading:
                    readingBody
                case .index:
                    indexBody
                }

                // Mushaf Hub segmented bar — bottom thumb zone (above the tab
                // bar), hidden in full-screen reader mode where the HUD covers it
                if hubTab != .reader {
                    Picker("وضع المصحف", selection: $hubTab) {
                        ForEach(MushafHubTab.allCases) { t in
                            Text(t.rawValue).tag(t)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
            .background(hubTab == .reader ? appState.theme.mushafBg : appState.theme.bg)
            // Liquid Glass dock stays visible in the reader; the HUD floats above it
            .toolbar(.visible, for: .tabBar)
            .onAppear {
                if let target = appState.targetMushafPage, (1...604).contains(target) {
                    page = target
                    appState.targetMushafPage = nil
                } else if page == 1, let saved = appState.db.setting("mushaf_page")?.intValue, (1...604).contains(saved) {
                    page = saved
                }
                sliderPage = Double(page)
                reloadPage()
                loadHubData()
            }
            .onDisappear {
                player.stop()
                activeRecitation = nil
            }
            .onChange(of: appState.targetMushafPage) { target in
                if let target, (1...604).contains(target) {
                    page = target
                    sliderPage = Double(target)
                    hubTab = .reader
                    appState.targetMushafPage = nil
                }
            }
            .onChange(of: page) { newPage in
                if !isDraggingSlider { sliderPage = Double(newPage) }
                reloadPage()
                HapticsEngine.shared.play(pattern: appState.theme.all.haptics?.pageFlipSettle ?? [10])
            }
            .sheet(isPresented: $showAyahSheet) {
                if let ayahNum = selectedAyahNumber {
                    AyahActionSheet(ayahNumber: ayahNum, onPlay: { surah, ayah in
                        showAyahSheet = false
                        playAyah(surah: surah, ayah: ayah)
                    })
                    .environmentObject(appState)
                }
            }
            .sheet(isPresented: $showAppearanceSheet) {
                MushafAppearanceSheet()
                    .environmentObject(appState)
                    .presentationDetents([.medium])
            }
            .sheet(isPresented: $showAudioSheet) {
                NavigationStack {
                    AudioView()
                        .environmentObject(appState)
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // 1. Reader surface — Full-screen immersive RTL Mushaf + tap-to-toggle HUD
    // -----------------------------------------------------------------------
    private var readerBody: some View {
        ZStack {
            VStack(spacing: 0) {
                // Minimal unobtrusive top metadata strip (hidden while the HUD
                // is up — the HUD bar carries the same meta, never double-rendered)
                if !hudVisible {
                    HStack {
                        Text(meta.surahName.isEmpty ? "المصحف الشريف" : meta.surahName)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(appState.theme.textSecondary)
                        Spacer()
                        Text("ص \(page) · الجزء \(meta.juz) · الحزب \(meta.hizb)")
                            .font(.system(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(appState.theme.textSecondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 4)
                    .padding(.bottom, 2)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(hudAnimation()) { hudVisible = true }
                    }
                }

                // True RTL horizontal paged Mushaf (RootView enforces .rightToLeft,
                // so page 1 sits on the right and swiping left-to-right advances 1 -> 2).
                MushafPagerView(
                    page: $page,
                    pageCache: pageCache,
                    db: appState.db,
                    theme: appState.theme,
                    mushafScale: appState.mushafScale,
                    selectedAyah: selectedAyahNumber,
                    hudVisible: hudVisible,
                    onSelectAyah: { ayahNumber in
                        selectedAyahNumber = ayahNumber
                        showAyahSheet = true
                    },
                    onToggleHud: {
                        withAnimation(hudAnimation()) { hudVisible.toggle() }
                    }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                // Compact bottom page pill when HUD is hidden
                if !hudVisible {
                    HStack(spacing: 14) {
                        Button {
                            if page > 1 { page -= 1 }
                        } label: {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 13, weight: .semibold))
                                .padding(6)
                        }
                        .disabled(page <= 1)

                        Button {
                            withAnimation(hudAnimation()) { hudVisible = true }
                        } label: {
                            Text("صفحة \(page) / ٦٠٤")
                                .font(.system(size: 12, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(appState.theme.textSecondary)
                        }

                        Button {
                            if page < 604 { page += 1 }
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 13, weight: .semibold))
                                .padding(6)
                        }
                        .disabled(page >= 604)
                    }
                    .foregroundStyle(appState.theme.accent)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 3)
                    .background(appState.theme.surface.opacity(0.88))
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(appState.theme.border))
                    .padding(.bottom, 6)
                }
            }
            .background(appState.theme.mushafBg)

            // Floating Liquid Glass HUD overlay (revealed on tap)
            if hudVisible {
                VStack(spacing: 0) {
                    readerTopHudBar
                    Spacer()
                    readerBottomHudCard
                }
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.96)))
            }
        }
    }

    private func hudAnimation() -> Animation? {
        reduceMotion ? nil : .spring(response: 0.30, dampingFraction: 0.86)
    }

    private func surahTitle(forPage p: Int) -> String {
        surahs.last(where: { $0.startPage <= p })?.nameAr ?? "المصحف الشريف"
    }

    private var readerTopHudBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Button {
                    hudVisible = false
                    appState.tab = .today
                } label: {
                    Image(systemName: "chevron.forward")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(appState.theme.textSecondary)
                        .padding(7)
                }
                .accessibilityLabel("رجوع")

                VStack(alignment: .leading, spacing: 2) {
                    Text(meta.surahName.isEmpty ? "المصحف الشريف" : meta.surahName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(appState.theme.textPrimary)
                    Text("ص \(page) · الجزء \(meta.juz) · الحزب \(meta.hizb)")
                        .font(.system(size: 11))
                        .monospacedDigit()
                        .foregroundStyle(appState.theme.textSecondary)
                }
                Spacer()
                Button {
                    showAppearanceSheet = true
                } label: {
                    Image(systemName: "textformat.size")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(appState.theme.textSecondary)
                        .padding(7)
                }
                Button {
                    togglePageBookmark()
                } label: {
                    Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(isBookmarked ? appState.theme.accent : appState.theme.textSecondary)
                        .padding(7)
                }
                Button {
                    withAnimation(hudAnimation()) { hudVisible = false }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(appState.theme.textSecondary)
                        .padding(7)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(appState.theme.border))
            .shadow(color: .black.opacity(0.22), radius: 12, y: 4)

            // Top segmented hub switcher — cleanly stacked below the Surah/Juz bar
            Picker("أقسام المصحف", selection: Binding(
                get: { hubTab },
                set: { nextTab in
                    hudVisible = false
                    hubTab = nextTab
                }
            )) {
                ForEach(MushafHubTab.allCases) { t in
                    Text(t.rawValue).tag(t)
                }
            }
            .pickerStyle(.segmented)
            .padding(4)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(appState.theme.border))
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
    }

    private var readerBottomHudCard: some View {
        let previewPage = min(max(Int(sliderPage.rounded()), 1), 604)
        return VStack(spacing: 10) {
            if let active = activeRecitation {
                HStack {
                    Image(systemName: "waveform").foregroundStyle(appState.theme.accent)
                    Text("تلاوة سورة \(active.surah) · آية \(active.ayah)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(appState.theme.textPrimary)
                    Spacer()
                    Button("إيقاف") {
                        player.stop()
                        activeRecitation = nil
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(appState.theme.accent)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(appState.theme.surfaceRaised)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            if isDraggingSlider {
                Text("ص \(previewPage) — \(surahTitle(forPage: previewPage))")
                    .font(.system(size: 12, weight: .bold))
                    .monospacedDigit()
                    .padding(.horizontal, 14)
                    .padding(.vertical, 5)
                    .background(appState.theme.surface)
                    .foregroundStyle(appState.theme.accent)
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(appState.theme.accent.opacity(0.45)))
            }

            HStack(spacing: 8) {
                Text("ص \(isDraggingSlider ? previewPage : page)")
                    .font(.system(size: 12, weight: .bold)).monospacedDigit()
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(appState.theme.accent.opacity(0.16))
                    .foregroundStyle(appState.theme.accent)
                    .clipShape(Capsule())

                Button {
                    if page > 1 { page -= 1 }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .bold))
                        .frame(width: 30, height: 30)
                        .background(appState.theme.surface.opacity(0.85))
                        .clipShape(Circle())
                }
                .disabled(page <= 1)

                Slider(
                    value: $sliderPage,
                    in: 1...604,
                    step: 1,
                    onEditingChanged: { editing in
                        isDraggingSlider = editing
                        if !editing {
                            let target = min(max(Int(sliderPage.rounded()), 1), 604)
                            if target != page { page = target }
                        }
                    }
                )
                .tint(appState.theme.accent)

                Button {
                    if page < 604 { page += 1 }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 13, weight: .bold))
                        .frame(width: 30, height: 30)
                        .background(appState.theme.surface.opacity(0.85))
                        .clipShape(Circle())
                }
                .disabled(page >= 604)
            }

            HStack(spacing: 8) {
                hudButton("الفهرس", icon: "list.bullet") {
                    hudVisible = false
                    hubTab = .index
                }
                hudButton("بحث", icon: "magnifyingglass") {
                    hudVisible = false
                    appState.searchPresented = true
                }
                hudButton("الختمة", icon: "book.pages") {
                    hudVisible = false
                    hubTab = .reading
                }
                hudButton("إخفاء", icon: "eye.slash") {
                    withAnimation(.easeOut(duration: 0.2)) { hudVisible = false }
                }
            }

            // Main-nav escape hatch — jump straight to a tab from the reader
            HStack(spacing: 8) {
                hudButton("اليوم", icon: "sun.max") {
                    hudVisible = false
                    appState.tab = .today
                }
                hudButton("الأذكار", icon: "hands.sparkles") {
                    hudVisible = false
                    appState.tab = .athkar
                }
                hudButton("الأدوات", icon: "square.grid.2x2") {
                    hudVisible = false
                    appState.tab = .tools
                }
            }
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(appState.theme.border))
        .shadow(color: .black.opacity(0.24), radius: 14, y: 4)
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
    }

    private func hudButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 12))
                Text(title).font(.system(size: 12, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(appState.theme.surface.opacity(0.85))
            .foregroundStyle(appState.theme.textPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(appState.theme.border))
        }
    }

    // -----------------------------------------------------------------------
    // 2. My Reading & Khatmah tab
    // -----------------------------------------------------------------------
    private var readingBody: some View {
        ScrollView {
            VStack(spacing: 14) {
                KhatmahView()
                    .environmentObject(appState)
                    .frame(minHeight: 260)

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("التلاوات الصوتية")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(appState.theme.textPrimary)
                        Spacer()
                        Button("إدارة القراء") { showAudioSheet = true }
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(appState.theme.accent)
                    }
                    Text("تلاوة الفاتحة للشيخ مشاري العفاسي متاحة دون اتصال على الفور، مع ١٨ قارئاً للتنزيل.")
                        .font(.system(size: 12))
                        .foregroundStyle(appState.theme.textSecondary)
                }
                .padding(16)
                .background(appState.theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal, 16)

                VStack(alignment: .leading, spacing: 10) {
                    Text("العلامات المرجعية")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(appState.theme.textPrimary)
                    if bookmarks.isEmpty {
                        Text("لا توجد علامات بعد — اضغط أيقونة العلامة أثناء القراءة أو اختر آية لحفظ موضعك.")
                            .font(.system(size: 13))
                            .foregroundStyle(appState.theme.textSecondary)
                    } else {
                        ForEach(bookmarks) { b in
                            Button {
                                page = b.page
                                hubTab = .reader
                            } label: {
                                HStack {
                                    Image(systemName: "bookmark.fill").foregroundStyle(appState.theme.accent)
                                    Text(b.labelAr.isEmpty ? "صفحة \(b.page)" : b.labelAr)
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundStyle(appState.theme.textPrimary)
                                    Spacer()
                                    Text("ص \(b.page)")
                                        .font(.system(size: 12))
                                        .foregroundStyle(appState.theme.textSecondary)
                                }
                                .padding(.vertical, 6)
                            }
                        }
                    }
                }
                .padding(16)
                .background(appState.theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 120)
        }
        .onAppear { loadHubData() }
    }

    // -----------------------------------------------------------------------
    // 3. Surah & Juz index tab
    // -----------------------------------------------------------------------
    private var indexBody: some View {
        let q = surahQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = q.isEmpty ? surahs : surahs.filter {
            $0.nameAr.contains(q) || "\($0.number)".contains(q) || $0.nameTranslit.localizedCaseInsensitiveContains(q)
        }
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(appState.theme.textSecondary)
                    TextField("ابحث عن سورة بالاسم أو الرقم…", text: $surahQuery)
                        .font(.system(size: 14))
                }
                .padding(12)
                .background(appState.theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(appState.theme.border, lineWidth: 1))
                .padding(.horizontal, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(juzStarts, id: \.juz) { item in
                            Button {
                                page = item.page
                                hubTab = .reader
                            } label: {
                                Text("الجزء \(item.juz)")
                                    .font(.system(size: 12, weight: .semibold))
                                    .padding(.horizontal, 12).padding(.vertical, 7)
                                    .background(appState.theme.surface)
                                    .foregroundStyle(appState.theme.textPrimary)
                                    .clipShape(Capsule())
                                    .overlay(Capsule().stroke(appState.theme.border, lineWidth: 1))
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }

                LazyVStack(spacing: 8) {
                    ForEach(filtered) { s in
                        Button {
                            page = s.startPage
                            hubTab = .reader
                        } label: {
                            HStack(spacing: 12) {
                                Text("\(s.number)")
                                    .font(.system(size: 13, weight: .bold))
                                    .monospacedDigit()
                                    .frame(width: 34, height: 34)
                                    .background(appState.theme.surfaceRaised)
                                    .foregroundStyle(appState.theme.accent)
                                    .clipShape(Circle())
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.nameAr)
                                        .font(.system(size: 16, weight: .bold))
                                        .foregroundStyle(appState.theme.textPrimary)
                                    Text("\(s.revelationType == "makkah" ? "مكية" : "مدنية") · \(s.ayahCount) آية")
                                        .font(.system(size: 12))
                                        .foregroundStyle(appState.theme.textSecondary)
                                }
                                Spacer()
                                Text("ص \(s.startPage)")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(appState.theme.accent)
                            }
                            .padding(12)
                            .background(appState.theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(appState.theme.border, lineWidth: 1))
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
            .padding(.bottom, 120)
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    private func reloadPage() {
        let curPage = page
        let db = appState.db
        _ = pageCache.lines(for: curPage, db: db)
        meta = MushafRepository.meta(page: curPage, db: db)
        isBookmarked = MushafRepository.isBookmarked(page: curPage, db: db)
        pageCache.preload(around: curPage, db: db)
        Task {
            try? db.setSetting("mushaf_page", .number(Double(curPage)))
            WidgetStateBridge.publishReadingPosition(page: curPage, db: db)
        }
    }

    private func loadHubData() {
        surahs = MushafRepository.surahs(db: appState.db)
        juzStarts = MushafRepository.juzStarts(db: appState.db)
        bookmarks = MushafRepository.bookmarks(db: appState.db)
    }

    private func togglePageBookmark() {
        let label = meta.surahName.isEmpty ? "صفحة \(page)" : "\(meta.surahName) · ص \(page)"
        if let added = try? appState.db.toggleBookmark(page: page, lineNumber: 1, ayahNumber: nil, labelAr: label, now: Date.nowMs) {
            isBookmarked = added
            HapticsEngine.shared.play(pattern: appState.theme.all.haptics?.bookmarkSaved ?? [15, 40])
            loadHubData()
        }
    }

    private func playAyah(surah: Int, ayah: Int) {
        if let url = AudioStore.shared.localURL(reciter: "alafasy", surah: surah, ayah: ayah) {
            activeRecitation = (surah, ayah)
            player.play(url: url) { activeRecitation = nil }
        } else {
            showAudioSheet = true
        }
    }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

enum MushafRepository {
    struct MushafLine {
        let kind: String
        let glyphs: String
        let textAr: String?
        let words: [WordPlate]
    }
    struct WordPlate {
        let glyphs: String
        let wordText: String
        let surah: Int
        let ayah: Int
        let wordSeq: Int
        let numberInSurah: Int
    }
    struct PageMeta { let surahName: String; let juz: Int; let hizb: Int }
    struct SurahItem: Identifiable {
        let number: Int
        let nameAr: String
        let nameTranslit: String
        let revelationType: String
        let ayahCount: Int
        let startPage: Int
        var id: Int { number }
    }
    struct BookmarkItem: Identifiable {
        let uuid: String
        let page: Int
        let labelAr: String
        var id: String { uuid }
    }

    static func lines(page: Int, db: SadaqaDatabase) -> [MushafLine] {
        var out: [MushafLine] = []
        try? db.queue.read { db in
            let rows = try Row.fetchAll(db, sql: """
                SELECT * FROM v_page_words WHERE page_number = ? ORDER BY line_number, line_position
                """, arguments: [page])
            let deco = try Row.fetchAll(db, sql: "SELECT * FROM mushaf_lines WHERE page_number = ? ORDER BY line_number", arguments: [page])
            var byLine: [Int: [WordPlate]] = [:]
            for r in rows {
                let line = (r["line_number"] as Int?) ?? 0
                byLine[line, default: []].append(WordPlate(
                    glyphs: r["glyphs_qpc"] as String? ?? "",
                    wordText: r["word_text"] as String? ?? "",
                    surah: (r["surah"] as Int?) ?? 0,
                    ayah: (r["ayah_number"] as Int?) ?? 0,
                    wordSeq: (r["word_seq"] as Int?) ?? 0,
                    numberInSurah: (r["number_in_surah"] as Int?) ?? 0))
            }
            for line in 1...15 {
                let plates = byLine[line] ?? []
                let d = deco.first { ($0["line_number"] as Int?) == line }
                if let d, let kind = d["kind"] as String?, kind != "text", kind != "blank" {
                    out.append(MushafLine(kind: kind, glyphs: d["glyphs_qpc"] as String? ?? "",
                                          textAr: d["text_ar"] as String?, words: []))
                } else if !plates.isEmpty {
                    out.append(MushafLine(kind: "text", glyphs: "", textAr: d?["text_ar"] as String?, words: plates))
                }
            }
        }
        return out
    }

    static func meta(page: Int, db: SadaqaDatabase) -> PageMeta {
        var surahName = ""
        var juz = 1
        var hizb = 1
        try? db.queue.read { q in
            if let s = try Row.fetchOne(q, sql: "SELECT s.name_ar FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.page = ? ORDER BY a.ayah_number LIMIT 1", arguments: [page]) {
                surahName = s["name_ar"] as String? ?? ""
            }
            if let p = try Row.fetchOne(q, sql: "SELECT juz_start, hizb_start FROM mushaf_pages WHERE page_number = ?", arguments: [page]) {
                juz = p["juz_start"] as Int? ?? 1
                hizb = p["hizb_start"] as Int? ?? 1
            }
        }
        return PageMeta(surahName: surahName, juz: juz, hizb: hizb)
    }

    static func isBookmarked(page: Int, db: SadaqaDatabase) -> Bool {
        (try? db.queue.read { q in
            try Int.fetchOne(q, sql: "SELECT COUNT(*) FROM bookmarks WHERE page = ? AND deleted = 0", arguments: [page])
        }) ?? 0 > 0
    }

    static func surahs(db: SadaqaDatabase) -> [SurahItem] {
        (try? db.queue.read { q in
            try Row.fetchAll(q, sql: "SELECT number, name_ar, name_translit, revelation_type, ayah_count, start_page FROM surahs ORDER BY number").map {
                SurahItem(
                    number: $0["number"] as Int? ?? 1,
                    nameAr: $0["name_ar"] as String? ?? "",
                    nameTranslit: $0["name_translit"] as String? ?? "",
                    revelationType: $0["revelation_type"] as String? ?? "makkah",
                    ayahCount: $0["ayah_count"] as Int? ?? 0,
                    startPage: $0["start_page"] as Int? ?? 1
                )
            }
        }) ?? []
    }

    static func juzStarts(db: SadaqaDatabase) -> [(juz: Int, page: Int)] {
        (try? db.queue.read { q in
            try Row.fetchAll(q, sql: "SELECT juz, MIN(page) AS p FROM ayahs GROUP BY juz ORDER BY juz").map {
                ($0["juz"] as Int? ?? 1, $0["p"] as Int? ?? 1)
            }
        }) ?? []
    }

    static func bookmarks(db: SadaqaDatabase) -> [BookmarkItem] {
        (try? db.queue.read { q in
            try Row.fetchAll(q, sql: "SELECT uuid, page, label_ar FROM bookmarks WHERE deleted = 0 ORDER BY updated_at DESC LIMIT 30").map {
                BookmarkItem(
                    uuid: $0["uuid"] as String? ?? "",
                    page: $0["page"] as Int? ?? 1,
                    labelAr: $0["label_ar"] as String? ?? ""
                )
            }
        }) ?? []
    }
}

// ---------------------------------------------------------------------------
// Mushaf Plate — runtime glyph-verified QPC1 or safe UthmanicHafs fallback,
// dynamically fitted to a 15-line full-screen frame with zero vertical scroll.
// ---------------------------------------------------------------------------

@MainActor
final class MushafPageCache: ObservableObject {
    private var cache: [Int: [MushafRepository.MushafLine]] = [:]
    private var fontSizeCache: [String: (size: CGFloat, isQpc: Bool)] = [:]
    private var preloadTask: Task<Void, Never>?

    func lines(for page: Int, db: SadaqaDatabase) -> [MushafRepository.MushafLine] {
        if let hit = cache[page] { return hit }
        FontRegistry.registerPage(page)
        let loaded = MushafRepository.lines(page: page, db: db)
        if cache.count > 16 {
            cache.removeAll(keepingCapacity: true)
        }
        cache[page] = loaded
        return loaded
    }

    func preload(around center: Int, db: SadaqaDatabase) {
        preloadTask?.cancel()
        preloadTask = Task { [weak self] in
            let targets = [center - 1, center + 1, center - 2, center + 2]
                .filter { (1...604).contains($0) }
            for p in targets {
                if Task.isCancelled { return }
                FontRegistry.registerPage(p)
                if self?.cache[p] == nil {
                    let loaded = await Task.detached(priority: .utility) {
                        MushafRepository.lines(page: p, db: db)
                    }.value
                    if Task.isCancelled { return }
                    self?.cache[p] = loaded
                }
            }
        }
    }

    func cachedLayout(key: String) -> (size: CGFloat, isQpc: Bool)? {
        fontSizeCache[key]
    }

    func storeLayout(key: String, size: CGFloat, isQpc: Bool) {
        if fontSizeCache.count > 24 { fontSizeCache.removeAll(keepingCapacity: true) }
        fontSizeCache[key] = (size, isQpc)
    }
}

// True native pager — UIPageViewController (scroll / horizontal) with RTL page
// order (page 1 sits right, a left-to-right swipe advances 1 -> 2). Only the
// current ± adjacent slots are instantiated on demand; the binding stays the
// single source of truth for slider / chevron / index navigation.
private struct MushafPagerView: UIViewControllerRepresentable {
    @Binding var page: Int
    @ObservedObject var pageCache: MushafPageCache
    let db: SadaqaDatabase
    let theme: SadaqaThemeColors
    let mushafScale: Double
    let selectedAyah: Int?
    let hudVisible: Bool
    let onSelectAyah: (Int) -> Void
    let onToggleHud: () -> Void

    func makeCoordinator() -> PagerCoordinator { PagerCoordinator(self) }

    func makeUIViewController(context: Context) -> UIPageViewController {
        let pvc = UIPageViewController(transitionStyle: .scroll, navigationOrientation: .horizontal)
        pvc.dataSource = context.coordinator
        pvc.delegate = context.coordinator
        pvc.view.backgroundColor = .clear
        context.coordinator.show(page, animated: false, in: pvc)
        return pvc
    }

    func updateUIViewController(_ pvc: UIPageViewController, context: Context) {
        context.coordinator.parent = self
        context.coordinator.refreshSlotContent()
        context.coordinator.syncExternalPage(in: pvc)
    }
}

@MainActor
final class PagerCoordinator: NSObject, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
    var parent: MushafPagerView
    private var current = 0
    private var slots: [Int: UIHostingController<MushafLazyPageSlot>] = [:]

    init(_ parent: MushafPagerView) { self.parent = parent }

    private func slotView(_ p: Int) -> MushafLazyPageSlot {
        MushafLazyPageSlot(
            slotPage: p,
            currentPage: p,
            cache: parent.pageCache,
            db: parent.db,
            theme: parent.theme,
            mushafScale: parent.mushafScale,
            selectedAyah: parent.selectedAyah,
            hudVisible: parent.hudVisible,
            onSelectAyah: parent.onSelectAyah,
            onToggleHud: parent.onToggleHud
        )
        // Manually-created hosting controllers do not inherit the SwiftUI
        // environment — re-assert the app-wide RTL direction for the plate.
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func slot(for p: Int) -> UIHostingController<MushafLazyPageSlot> {
        if let hit = slots[p] { return hit }
        let stale = slots.keys.filter { abs($0 - current) > 3 }
        for key in stale { slots[key] = nil }
        let vc = UIHostingController(rootView: slotView(p))
        vc.view.backgroundColor = .clear
        slots[p] = vc
        return vc
    }

    func refreshSlotContent() {
        for (key, vc) in slots { vc.rootView = slotView(key) }
    }

    func show(_ p: Int, animated: Bool, in pvc: UIPageViewController) {
        let target = min(max(p, 1), 604)
        guard target != current else { return }
        // RTL mushaf: the next page (+1) is the LEFT neighbour, so advancing
        // slides in from the left (.reverse); going back slides from the right.
        let direction: UIPageViewController.NavigationDirection = target > current ? .reverse : .forward
        current = target
        pvc.setViewControllers([slot(for: target)], direction: direction, animated: animated)
    }

    func syncExternalPage(in pvc: UIPageViewController) {
        if parent.page != current {
            // Single steps animate; slider/index jumps replace instantly.
            show(parent.page, animated: abs(parent.page - current) == 1, in: pvc)
        }
    }

    // RTL ordering: a rightward finger swipe reveals the left neighbour = the
    // NEXT page (+1); a leftward swipe reveals the right neighbour = −1.
    func pageViewController(_ pvc: UIPageViewController, viewControllerBefore viewController: UIViewController) -> UIViewController? {
        guard let p = page(of: viewController), p < 604 else { return nil }
        return slot(for: p + 1)
    }

    func pageViewController(_ pvc: UIPageViewController, viewControllerAfter viewController: UIViewController) -> UIViewController? {
        guard let p = page(of: viewController), p > 1 else { return nil }
        return slot(for: p - 1)
    }

    func pageViewController(_ pvc: UIPageViewController, didFinishAnimating finished: Bool, previousViewControllers: [UIViewController], transitionCompleted completed: Bool) {
        guard completed, let vc = pvc.viewControllers?.first, let p = page(of: vc) else { return }
        current = p
        if parent.page != p { parent.page = p }
    }

    private func page(of vc: UIViewController) -> Int? {
        (vc as? UIHostingController<MushafLazyPageSlot>)?.rootView.slotPage
    }
}

struct MushafLazyPageSlot: View {
    let slotPage: Int
    let currentPage: Int
    @ObservedObject var cache: MushafPageCache
    let db: SadaqaDatabase
    let theme: SadaqaThemeColors
    let mushafScale: Double
    let selectedAyah: Int?
    let hudVisible: Bool
    let onSelectAyah: (Int) -> Void
    let onToggleHud: () -> Void

    var body: some View {
        if abs(slotPage - currentPage) <= 2 {
            let pageLines = cache.lines(for: slotPage, db: db)
            MushafPlate(
                page: slotPage,
                lines: pageLines,
                cache: cache,
                theme: theme,
                mushafScale: mushafScale,
                selectedAyah: selectedAyah,
                hudVisible: hudVisible,
                onSelectAyah: onSelectAyah,
                onToggleHud: onToggleHud
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            Color.clear
        }
    }
}

// ---------------------------------------------------------------------------
// Zoomed (>100%) flow — pure, testable grouping of plate lines into ayah-group
// paragraph blocks (one block per ayah so a block-level long-press selects it).
// ---------------------------------------------------------------------------

enum MushafFlowBlock: Identifiable {
    case surahName(id: Int, text: String)
    case bismillah(id: Int, text: String)
    case words(id: Int, items: [MushafRepository.WordPlate])

    var id: Int {
        switch self {
        case .surahName(let id, _), .bismillah(let id, _), .words(let id, _): return id
        }
    }
}

enum MushafFlowModel {
    static let bismillahFallback = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"

    static func buildBlocks(from lines: [MushafRepository.MushafLine]) -> [MushafFlowBlock] {
        var blocks: [MushafFlowBlock] = []
        var curWords: [MushafRepository.WordPlate] = []
        var curAyah = 0
        var nextId = 0
        func flushWords() {
            if !curWords.isEmpty {
                blocks.append(.words(id: nextId, items: curWords))
                nextId += 1
                curWords = []
            }
        }
        for line in lines {
            if line.kind == "surah_name" {
                flushWords()
                blocks.append(.surahName(id: nextId, text: line.textAr ?? ""))
                nextId += 1
            } else if line.kind == "bismillah" {
                flushWords()
                blocks.append(.bismillah(id: nextId, text: line.textAr ?? bismillahFallback))
                nextId += 1
            } else if !line.words.isEmpty {
                for w in line.words {
                    if w.ayah != curAyah && !curWords.isEmpty {
                        flushWords()
                    }
                    curAyah = w.ayah
                    curWords.append(w)
                }
            }
        }
        flushWords()
        return blocks
    }
}

/// Zoomed (>100%) ayah paragraph — pure SwiftUI `Text` sized by the layout pass
/// itself (no UITextView intrinsic-size guessing, so no one-line collapse).
private struct MushafAyahFlowText: View {
    let words: [MushafRepository.WordPlate]
    let fontSize: CGFloat
    let theme: SadaqaThemeColors
    let selectedAyah: Int?
    let onSelectAyah: (Int) -> Void

    private var paragraph: Text {
        var flow = Text("")
        for (idx, w) in words.enumerated() {
            if idx > 0 { flow = flow + Text(" ") }
            flow = flow + Text(w.wordText)
        }
        return flow
    }

    var body: some View {
        paragraph
            .font(Font(FontRegistry.uthmanicFont(size: fontSize)))
            .foregroundStyle(theme.mushafText)
            .multilineTextAlignment(.leading) // RTL env: leading = right edge
            .lineSpacing(fontSize * 0.42)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(selectedAyah == words.first?.ayah ? theme.accent.opacity(0.24) : Color.clear)
            )
            // Long-press (≈0.45s) selects the paragraph's ayah; a quick tap
            // falls through to the plate's HUD toggle.
            .onLongPressGesture(minimumDuration: 0.45, maximumDistance: 18) {
                HapticsEngine.shared.play(pattern: [20])
                onSelectAyah(words.first?.ayah ?? 0)
            }
    }
}

struct MushafPlate: View {
    let page: Int
    let lines: [MushafRepository.MushafLine]
    let cache: MushafPageCache
    let theme: SadaqaThemeColors
    let mushafScale: Double
    let selectedAyah: Int?
    let hudVisible: Bool
    let onSelectAyah: (Int) -> Void
    let onToggleHud: () -> Void

    var body: some View {
        GeometryReader { geo in
            let horizPad: CGFloat = 9
            let availW = max(200, geo.size.width - horizPad * 2)
            let availH = max(260, geo.size.height - 8)
            let slotCount = (page <= 2) ? max(lines.count, 8) : 15
            let slotH = (page <= 2) ? min(availH / CGFloat(slotCount), 48) : (availH / 15.0)
            let isZoomed = mushafScale > 1.01
            let metrics = resolveMetrics(availW: availW, slotH: slotH, isZoomed: isZoomed)
            let fontSize = metrics.size
            let isQpc = metrics.isQpc
            let sample = lines.first(where: { !$0.words.isEmpty })?.words.map(\.glyphs).joined() ?? ""
            let pageFont: UIFont = (isQpc && !isZoomed)
                ? (FontRegistry.verifiedMushafFont(page: page, size: fontSize, sample: sample) ?? FontRegistry.uthmanicFont(size: fontSize))
                : FontRegistry.uthmanicFont(size: fontSize)

            if isZoomed {
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(spacing: max(10, fontSize * 0.36)) {
                        ForEach(buildFlowBlocks()) { block in
                            switch block {
                            case .surahName(_, let title):
                                Text(title)
                                    .font(.system(size: min(17, max(13, fontSize * 0.56)), weight: .bold))
                                    .foregroundStyle(theme.accent)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                                    .padding(.horizontal, 12)
                                    .background(theme.surface)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(theme.accent.opacity(0.35), lineWidth: 1))
                                    .padding(.top, 4)
                            case .bismillah(_, let text):
                                Text(text)
                                    .font(Font(FontRegistry.uthmanicFont(size: fontSize * 0.96)))
                                    .foregroundStyle(theme.mushafText)
                                    .multilineTextAlignment(.center)
                                    .frame(maxWidth: .infinity, alignment: .center)
                                    .padding(.vertical, 4)
                            case .words(_, let items):
                                MushafAyahFlowText(
                                    words: items,
                                    fontSize: fontSize,
                                    theme: theme,
                                    selectedAyah: selectedAyah,
                                    onSelectAyah: onSelectAyah
                                )
                            }
                        }
                    }
                    .frame(width: availW, alignment: .center)
                    .padding(.horizontal, horizPad)
                    .padding(.top, hudVisible ? 112 : 10)
                    .padding(.bottom, hudVisible ? 220 : 28)
                }
                .contentShape(Rectangle())
                .onTapGesture { onToggleHud() }
            } else {
                VStack(spacing: 0) {
                    if page <= 2 { Spacer(minLength: 0) }
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        lineView(line, pageFont: pageFont, fontSize: fontSize, isQpc: isQpc, availW: availW, slotH: slotH)
                    }
                    if page <= 2 { Spacer(minLength: 0) }
                }
                .frame(width: availW, height: availH, alignment: .center)
                .padding(.horizontal, horizPad)
                .padding(.vertical, 4)
                .contentShape(Rectangle())
                .onTapGesture { onToggleHud() }
            }
        }
    }

    private func buildFlowBlocks() -> [MushafFlowBlock] {
        MushafFlowModel.buildBlocks(from: lines)
    }

    private func resolveMetrics(availW: CGFloat, slotH: CGFloat, isZoomed: Bool) -> (size: CGFloat, isQpc: Bool) {
        let key = "\(page)-\(Int(availW.rounded()))-\(Int(slotH.rounded()))-\(Int((mushafScale * 100).rounded()))"
        if let hit = cache.cachedLayout(key: key) { return hit }
        let sample = lines.first(where: { !$0.words.isEmpty })?.words.map(\.glyphs).joined() ?? ""
        let isQpc = !sample.isEmpty && FontRegistry.verifiedMushafFont(page: page, size: 20, sample: sample) != nil
        let size = computeUniformFontSize(availW: availW, slotH: slotH, isQpc: isQpc, isZoomed: isZoomed)
        cache.storeLayout(key: key, size: size, isQpc: isQpc)
        return (size, isQpc)
    }

    private func computeUniformFontSize(availW: CGFloat, slotH: CGFloat, isQpc: Bool, isZoomed: Bool) -> CGFloat {
        // mushaf_scale is the reader's own zoom (0.8–2.0), independent of app font_scale
        let prefFactor = CGFloat(min(max(mushafScale, 0.8), 2.0))
        if isZoomed {
            let base = min(slotH * 0.82, availW / 11.2, 32)
            return max(17, base * prefFactor)
        }
        var baseSize = min(slotH * 0.86, 42)
        let probeFont = isQpc
            ? (FontRegistry.verifiedMushafFont(page: page, size: baseSize, sample: lines.first(where: { !$0.words.isEmpty })?.words.map(\.glyphs).joined() ?? "") ?? FontRegistry.uthmanicFont(size: baseSize))
            : FontRegistry.uthmanicFont(size: baseSize)

        var maxLineW: CGFloat = 0
        for line in lines where line.kind == "text" {
            let txt = isQpc
                ? line.words.map(\.glyphs).joined(separator: " ")
                : line.words.map(\.wordText).joined(separator: " ")
            let w = (txt as NSString).size(withAttributes: [.font: probeFont]).width
            if w > maxLineW { maxLineW = w }
        }
        if maxLineW > availW && maxLineW > 0 {
            baseSize *= (availW / maxLineW) * 0.97
        }
        return max(12, min(baseSize * prefFactor, slotH * 0.92))
    }

    @ViewBuilder
    private func lineView(_ line: MushafRepository.MushafLine, pageFont: UIFont, fontSize: CGFloat, isQpc: Bool, availW: CGFloat, slotH: CGFloat) -> some View {
        if line.kind == "bismillah" {
            if let bsmlFont = FontRegistry.verifiedBasmalaFont(size: min(fontSize * 1.04, slotH * 0.82), sample: line.glyphs) {
                Text(line.glyphs)
                    .font(Font(bsmlFont))
                    .foregroundStyle(theme.mushafText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .environment(\.layoutDirection, .leftToRight)
                    .frame(maxWidth: .infinity, minHeight: slotH, maxHeight: slotH, alignment: .center)
            } else {
                Text(line.textAr ?? "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ")
                    .font(Font(FontRegistry.uthmanicFont(size: min(fontSize * 0.94, slotH * 0.78))))
                    .foregroundStyle(theme.mushafText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(maxWidth: .infinity, minHeight: slotH, maxHeight: slotH, alignment: .center)
                    .multilineTextAlignment(.center)
            }
        } else if line.kind == "surah_name" {
            Text(line.textAr ?? "")
                .font(.system(size: min(15, max(12, slotH * 0.46)), weight: .bold))
                .foregroundStyle(theme.accent)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity)
                .frame(height: max(20, slotH - 4))
                .background(theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(theme.accent.opacity(0.35), lineWidth: 1))
                .padding(.vertical, 2)
        } else {
            let lineText = isQpc
                ? line.words.map(\.glyphs).joined(separator: " ")
                : line.words.map(\.wordText).joined(separator: " ")
            let naturalW = (lineText as NSString).size(withAttributes: [.font: pageFont]).width
            let justify = page > 2 && line.words.count >= 3 && naturalW >= availW * 0.58

            if justify {
                HStack(spacing: 0) {
                    ForEach(Array(line.words.enumerated()), id: \.offset) { idx, w in
                        if idx > 0 { Spacer(minLength: 2) }
                        wordView(w, pageFont: pageFont, isQpc: isQpc)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: slotH, maxHeight: slotH, alignment: .center)
            } else {
                HStack(spacing: 4) {
                    ForEach(Array(line.words.enumerated()), id: \.offset) { _, w in
                        wordView(w, pageFont: pageFont, isQpc: isQpc)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: slotH, maxHeight: slotH, alignment: .center)
            }
        }
    }

    private func wordView(_ w: MushafRepository.WordPlate, pageFont: UIFont, isQpc: Bool) -> some View {
        Text(isQpc ? w.glyphs : w.wordText)
            .font(Font(pageFont))
            .foregroundStyle(theme.mushafText)
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            .padding(.horizontal, 1)
            .background(selectedAyah == w.ayah ? theme.accent.opacity(0.22) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            // Long-press (≈0.45s) is the ONLY way to select an ayah —
            // a quick tap anywhere falls through to the plate (HUD toggle)
            .onLongPressGesture(minimumDuration: 0.45, maximumDistance: 18) {
                HapticsEngine.shared.play(pattern: [20])
                onSelectAyah(w.ayah)
            }
    }
}

// ---------------------------------------------------------------------------
// Reader Appearance — Mushaf font-scale slider (0.8×–2.0×) with live preview
// ---------------------------------------------------------------------------

struct MushafAppearanceSheet: View {
    @EnvironmentObject var appState: AppState
    @State private var scale: Double

    init() {
        _scale = State(initialValue: SadaqaDatabase.shared.setting("mushaf_scale")?.doubleValue ?? 1.0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("مظهر القراءة")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(appState.theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .center)

            HStack(spacing: 14) {
                Button {
                    setScale(scale - 0.05)
                } label: {
                    Image(systemName: "minus")
                        .font(.system(size: 15, weight: .bold))
                        .frame(width: 40, height: 40)
                        .background(appState.theme.surface)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(appState.theme.border))
                }
                .accessibilityLabel("تصغير الخط")

                Slider(value: Binding(
                    get: { scale },
                    set: { setScale($0) }
                ), in: 0.8...2.0, step: 0.05)
                .tint(appState.theme.accent)

                Button {
                    setScale(scale + 0.05)
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .bold))
                        .frame(width: 40, height: 40)
                        .background(appState.theme.surface)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(appState.theme.border))
                }
                .accessibilityLabel("تكبير الخط")
            }

            HStack {
                Text("حجم خط المصحف")
                    .font(.system(size: 13))
                    .foregroundStyle(appState.theme.textSecondary)
                Spacer()
                Text("\(Int((scale * 100).rounded()))٪")
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(appState.theme.accent)
            }

            // Live preview — the same uthmanic font the plate renders with
            ZStack {
                RoundedRectangle(cornerRadius: 16)
                    .fill(appState.theme.mushafBg)
                    .frame(height: 92)
                Text("وَمَنْ أَعْرَضَ عَن ذِكْرِي فَإِنَّ لَهُ مَعِيشَةً ضَنكًا")
                    .font(Font(FontRegistry.uthmanicFont(size: CGFloat(16 * scale))))
                    .foregroundStyle(appState.theme.mushafText)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 18)
            }
        }
        .padding(20)
    }

    private func setScale(_ v: Double) {
        let clamped = min(max(v, 0.8), 2.0)
        scale = (clamped * 20).rounded() / 20
        appState.setSetting("mushaf_scale", .number(scale))
    }
}

// ---------------------------------------------------------------------------
// Ayah Action Sheet — Tafsir, Mutashabihat, Bookmark, Copy, Share, Play
// ---------------------------------------------------------------------------

struct AyahActionSheet: View {
    @EnvironmentObject var appState: AppState
    let ayahNumber: Int
    let onPlay: (Int, Int) -> Void

    @State private var surah = 1
    @State private var ayahInSurah = 1
    @State private var surahName = ""
    @State private var textUthmani = ""
    @State private var page = 1
    @State private var extraTitle = ""
    @State private var extraBody = ""
    @State private var bookmarked = false
    @State private var copied = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(textUthmani)
                        .font(Font(FontRegistry.uthmanicFont(size: 24)))
                        .foregroundStyle(appState.theme.mushafText)
                        .lineSpacing(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(appState.theme.mushafBg)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(appState.theme.border, lineWidth: 1))

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        actionButton("التفسير الميسر", icon: "book.pages", primary: true) { loadTafsir() }
                        actionButton("آيات مشابهة", icon: "link") { loadMutashabihat() }
                        actionButton(bookmarked ? "محفوظة" : "حفظ علامة", icon: bookmarked ? "bookmark.fill" : "bookmark") { toggleBookmark() }
                        actionButton(copied ? "تم النسخ" : "نسخ الآية", icon: "doc.on.doc") { copyAyah() }
                        actionButton("تشغيل التلاوة", icon: "play.fill") { onPlay(surah, ayahInSurah) }
                        if !textUthmani.isEmpty {
                            ShareLink(item: "\(textUthmani)\n— \(surahName) · الآية \(ayahInSurah)") {
                                HStack {
                                    Image(systemName: "square.and.arrow.up")
                                    Text("مشاركة")
                                }
                                .font(.system(size: 13, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                                .background(appState.theme.surface)
                                .foregroundStyle(appState.theme.textPrimary)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(appState.theme.border, lineWidth: 1))
                            }
                        }
                    }

                    if !extraBody.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(extraTitle)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(appState.theme.accent)
                            Text(extraBody)
                                .font(.system(size: 15))
                                .foregroundStyle(appState.theme.textPrimary)
                                .lineSpacing(6)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(appState.theme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding(16)
            }
            .background(appState.theme.bg)
            .navigationTitle("\(surahName) · الآية \(ayahInSurah)")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { loadAyah() }
        }
        .presentationDetents([.medium, .large])
    }

    private func actionButton(_ label: String, icon: String, primary: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                Text(label)
            }
            .font(.system(size: 13, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(primary ? appState.theme.accent : appState.theme.surface)
            .foregroundStyle(primary ? appState.theme.accentContrast : appState.theme.textPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(primary ? Color.clear : appState.theme.border, lineWidth: 1))
        }
    }

    private func loadAyah() {
        try? appState.db.queue.read { q in
            if let r = try Row.fetchOne(q, sql: "SELECT a.surah, a.number_in_surah, a.text_uthmani, a.page, s.name_ar FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.ayah_number = ?", arguments: [ayahNumber]) {
                surah = r["surah"] as Int? ?? 1
                ayahInSurah = r["number_in_surah"] as Int? ?? 1
                textUthmani = r["text_uthmani"] as String? ?? ""
                page = r["page"] as Int? ?? 1
                surahName = r["name_ar"] as String? ?? ""
            }
            let bmCount = try Int.fetchOne(q, sql: "SELECT COUNT(*) FROM bookmarks WHERE ayah_number = ? AND deleted = 0", arguments: [ayahNumber]) ?? 0
            bookmarked = bmCount > 0
        }
    }

    private func loadTafsir() {
        extraTitle = "التفسير الميسر"
        extraBody = (try? appState.db.queue.read { q in
            try String.fetchOne(q, sql: "SELECT body FROM tafsirs WHERE book_id = 'muyassar' AND ayah_number = ?", arguments: [ayahNumber])
        }) ?? "غير متوفر في هذه النسخة."
    }

    private func loadMutashabihat() {
        extraTitle = "آيات مشابهة"
        let rows = (try? appState.db.queue.read { q in
            try Row.fetchAll(q, sql: "SELECT a.text_uthmani, m.note_ar FROM mutashabihat m JOIN ayahs a ON a.ayah_number = m.similar_ayah WHERE m.ayah_number = ?", arguments: [ayahNumber])
        }) ?? []
        extraBody = rows.isEmpty
            ? "لا توجد متشابهات مسجلة لهذه الآية."
            : rows.map { ($0["text_uthmani"] as String? ?? "") + "\n" + ($0["note_ar"] as String? ?? "") }.joined(separator: "\n\n")
    }

    private func toggleBookmark() {
        if let added = try? appState.db.toggleBookmark(page: page, lineNumber: 1, ayahNumber: ayahNumber, labelAr: "\(surahName) \(ayahInSurah)", now: Date.nowMs) {
            bookmarked = added
            HapticsEngine.shared.play(pattern: appState.theme.all.haptics?.bookmarkSaved ?? [15, 40])
        }
    }

    private func copyAyah() {
        UIPasteboard.general.string = "\(textUthmani)\n— \(surahName) · الآية \(ayahInSurah)"
        copied = true
    }
}

struct KhatmahView: View {
    @EnvironmentObject var appState: AppState
    @State private var planName: String = "ختمتي"
    @State private var planUuid: String?
    @State private var completedPages: Int = 0
    @State private var dailyPages: Int = 20

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(planUuid == nil ? "ابدأ ختمة جديدة" : planName)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(appState.theme.textPrimary)
                    Text(planUuid == nil
                         ? "اختر ورداً يومياً وتابع تقدمك من ٦٠٤ صفحات."
                         : "أُنجز \(completedPages) من ٦٠٤ صفحة (\(Int((Double(completedPages) / 604.0 * 100.0).rounded()))٪)")
                        .font(.system(size: 12))
                        .foregroundStyle(appState.theme.textSecondary)
                }
                Spacer()
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(appState.theme.accent.opacity(0.14))
                        .frame(width: 40, height: 40)
                    Image(systemName: "book.closed")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(appState.theme.accent)
                }
            }

            if planUuid != nil {
                ProgressView(value: Double(completedPages), total: 604.0)
                    .tint(appState.theme.accent)
                Button("تسجيل قراءة الصفحة الحالية") {
                    logCurrentPage()
                }
                .buttonStyle(.borderedProminent)
                .tint(appState.theme.accent)
                .foregroundStyle(appState.theme.accentContrast)
            } else {
                HStack(spacing: 8) {
                    ForEach([10, 20, 40], id: \.self) { rate in
                        Button("\(rate) صفحة/يوم") {
                            dailyPages = rate
                        }
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(dailyPages == rate ? appState.theme.accent : appState.theme.surfaceRaised)
                        .foregroundStyle(dailyPages == rate ? appState.theme.accentContrast : appState.theme.textPrimary)
                        .clipShape(Capsule())
                    }
                }
                Button("إنشاء خطة الختمة") {
                    createPlan()
                }
                .buttonStyle(.borderedProminent)
                .tint(appState.theme.accent)
                .foregroundStyle(appState.theme.accentContrast)
            }
        }
        .padding(16)
        .background(appState.theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .onAppear { reload() }
    }

    private func reload() {
        try? appState.db.queue.read { q in
            if let r = try Row.fetchOne(q, sql: "SELECT p.uuid, p.name_ar, (SELECT COUNT(*) FROM khatmah_page_log l WHERE l.plan_uuid = p.uuid) AS done FROM khatmah_plans p WHERE p.deleted = 0 AND p.active = 1 LIMIT 1") {
                planUuid = r["uuid"] as String?
                planName = r["name_ar"] as String? ?? "ختمتي"
                completedPages = r["done"] as Int? ?? 0
            } else {
                planUuid = nil
                completedPages = 0
            }
        }
    }

    private func createPlan() {
        let now = Date.nowMs
        let uuid = UUIDv7.uuid7(now: now)
        let iso = TodayView.iso(now, tz: appState.engineOptions.timeZone)
        try? appState.db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO khatmah_plans (uuid, name_ar, mode, start_date, daily_pages, active, created_at, updated_at, deleted)
                VALUES (?, 'ختمتي', 'rate', ?, ?, 1, ?, ?, 0)
                """, arguments: [uuid, iso, dailyPages, now, now])
        }
        reload()
    }

    private func logCurrentPage() {
        guard let uuid = planUuid else { return }
        let page = min(max(appState.db.setting("mushaf_page")?.intValue ?? 1, 1), 604)
        let now = Date.nowMs
        try? appState.db.queue.write { db in
            try db.execute(sql: "INSERT OR REPLACE INTO khatmah_page_log (plan_uuid, page, completed_at) VALUES (?, ?, ?)",
                           arguments: [uuid, page, now])
        }
        reload()
    }
}
