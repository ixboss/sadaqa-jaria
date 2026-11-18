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
    @EnvironmentObject var appState: AppState
    @State private var hubTab: MushafHubTab = .reader
    @State private var page: Int = 1
    @State private var lines: [MushafRepository.MushafLine] = []
    @State private var meta = MushafRepository.PageMeta(surahName: "", juz: 1, hizb: 1)
    @State private var isBookmarked = false
    @State private var selectedAyahNumber: Int?
    @State private var showAyahSheet = false
    @State private var surahQuery = ""
    @State private var surahs: [MushafRepository.SurahItem] = []
    @State private var juzStarts: [(juz: Int, page: Int)] = []
    @State private var bookmarks: [MushafRepository.BookmarkItem] = []
    @State private var showAudioSheet = false
    @State private var activeRecitation: (surah: Int, ayah: Int)?
    private let player = AudioPlayerChain()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("وضع المصحف", selection: $hubTab) {
                    ForEach(MushafHubTab.allCases) { t in
                        Text(t.rawValue).tag(t)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

                switch hubTab {
                case .reader:
                    readerBody
                case .reading:
                    readingBody
                case .index:
                    indexBody
                }
            }
            .background(appState.theme.bg)
            .onAppear {
                if page == 1, let saved = appState.db.setting("mushaf_page")?.intValue, (1...604).contains(saved) {
                    page = saved
                }
                reloadPage()
                loadHubData()
            }
            .onChange(of: page) { _ in reloadPage() }
            .sheet(isPresented: $showAyahSheet) {
                if let ayahNum = selectedAyahNumber {
                    AyahActionSheet(ayahNumber: ayahNum, onPlay: { surah, ayah in
                        showAyahSheet = false
                        playAyah(surah: surah, ayah: ayah)
                    })
                    .environmentObject(appState)
                }
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
    // 1. Reader surface
    // -----------------------------------------------------------------------
    private var readerBody: some View {
        VStack(spacing: 0) {
            // Top bar: Surah + Juz/Hizb + Page + Bookmark + Font scale
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(meta.surahName.isEmpty ? "المصحف الشريف" : meta.surahName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(appState.theme.textPrimary)
                    Text("ص \(page) · الجزء \(meta.juz) · الحزب \(meta.hizb)")
                        .font(.system(size: 11))
                        .foregroundStyle(appState.theme.textSecondary)
                }
                Spacer()
                Button {
                    let nextScale = appState.fontScale >= 1.6 ? 1.0 : appState.fontScale + 0.15
                    appState.setSetting("font_scale", .number(nextScale))
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
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(appState.theme.surface)

            ScrollView(.vertical) {
                MushafPlate(
                    page: page,
                    lines: lines,
                    theme: appState.theme,
                    fontScale: appState.fontScale,
                    selectedAyah: selectedAyahNumber,
                    onSelectAyah: { ayahNumber in
                        selectedAyahNumber = ayahNumber
                        showAyahSheet = true
                    }
                )
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 36).onEnded { g in
                        // In RTL Arabic layout: swipe right-to-left (negative width) advances page;
                        // swipe left-to-right (positive width) goes back — support both intuitively.
                        if g.translation.width < -40 && page < 604 {
                            page += 1
                            HapticsEngine.shared.play(pattern: appState.theme.all.haptics?.pageFlipSettle ?? [10])
                        } else if g.translation.width > 40 && page > 1 {
                            page -= 1
                            HapticsEngine.shared.play(pattern: appState.theme.all.haptics?.pageFlipSettle ?? [10])
                        }
                    }
                )
            }
            .background(appState.theme.mushafBg)

            // Mini audio bar when reciting + page step footer
            VStack(spacing: 6) {
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
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(appState.theme.surfaceRaised)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 14)
                }

                HStack {
                    Button {
                        if page > 1 { page -= 1 }
                    } label: {
                        Label("السابقة", systemImage: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .disabled(page <= 1)

                    Spacer()
                    Text("صفحة \(page) من ٦٠٤")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(appState.theme.textSecondary)
                    Spacer()

                    Button {
                        if page < 604 { page += 1 }
                    } label: {
                        Label("التالية", systemImage: "chevron.left")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .disabled(page >= 604)
                }
                .foregroundStyle(appState.theme.accent)
                .padding(.horizontal, 18)
                .padding(.vertical, 8)
            }
            .background(appState.theme.surface)
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
            .padding(.bottom, 24)
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
                                    Text("\(s.revelationType == "Meccan" ? "مكية" : "مدنية") · \(s.ayahCount) آية")
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
            .padding(.bottom, 24)
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    private func reloadPage() {
        FontRegistry.registerPage(page)
        lines = MushafRepository.lines(page: page, db: appState.db)
        meta = MushafRepository.meta(page: page, db: appState.db)
        isBookmarked = MushafRepository.isBookmarked(page: page, db: appState.db)
        try? appState.db.setSetting("mushaf_page", .number(Double(page)))
        WidgetStateBridge.publishReadingPosition(page: page, db: appState.db)
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
                    revelationType: $0["revelation_type"] as String? ?? "Meccan",
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
// Mushaf Plate — runtime glyph-verified QPC1 or safe UthmanicHafs fallback
// ---------------------------------------------------------------------------

struct MushafPlate: View {
    let page: Int
    let lines: [MushafRepository.MushafLine]
    let theme: SadaqaThemeColors
    let fontScale: Double
    let selectedAyah: Int?
    let onSelectAyah: (Int) -> Void

    var body: some View {
        let sample = lines.first(where: { !$0.words.isEmpty })?.words.map(\.glyphs).joined() ?? ""
        let verifiedPageFont = sample.isEmpty
            ? nil
            : FontRegistry.verifiedMushafFont(page: page, size: 20 * CGFloat(fontScale), sample: sample)

        VStack(spacing: 4) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                lineView(line, verifiedPageFont: verifiedPageFont)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    @ViewBuilder
    private func lineView(_ line: MushafRepository.MushafLine, verifiedPageFont: UIFont?) -> some View {
        if line.kind == "bismillah" {
            if let bsmlFont = FontRegistry.verifiedBasmalaFont(size: 22 * CGFloat(fontScale), sample: line.glyphs) {
                Text(line.glyphs)
                    .font(Font(bsmlFont))
                    .foregroundStyle(theme.mushafText)
                    .environment(\.layoutDirection, .leftToRight)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 2)
            } else {
                Text(line.textAr ?? "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ")
                    .font(Font(FontRegistry.uthmanicFont(size: 20 * CGFloat(fontScale))))
                    .foregroundStyle(theme.mushafText)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.vertical, 2)
            }
        } else if line.kind == "surah_name" {
            Text(line.textAr ?? "")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(theme.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(theme.accent.opacity(0.35), lineWidth: 1))
                .padding(.vertical, 2)
        } else {
            let lineText = verifiedPageFont != nil
                ? line.words.map(\.glyphs).joined(separator: " ")
                : (line.textAr ?? line.words.map(\.wordText).joined(separator: " "))
            let useFont = verifiedPageFont ?? FontRegistry.uthmanicFont(size: 19 * CGFloat(fontScale))
            let primaryAyah = line.words.first?.ayah

            Text(lineText)
                .font(Font(useFont))
                .foregroundStyle(theme.mushafText)
                .lineSpacing(verifiedPageFont == nil ? 6 : 2)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .padding(.vertical, 1)
                .background(
                    (primaryAyah != nil && selectedAyah == primaryAyah)
                        ? theme.accent.opacity(0.16)
                        : Color.clear
                )
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .onTapGesture {
                    if let ayah = primaryAyah {
                        onSelectAyah(ayah)
                    }
                }
        }
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
                Text("📖")
                    .font(.system(size: 24))
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
