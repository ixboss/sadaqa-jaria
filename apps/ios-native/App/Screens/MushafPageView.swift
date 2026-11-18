// ============================================================================
// MushafPageView.swift — 604-page QPC1 plates from v_page_words (golden data
// contract), per-page subset font + BSML basmala with LTR bidi isolation
// (Phase 3 finding: basmala glyphs are visual-order — LTR isolate or they
// mirror). Swipe = page flip; tap thirds = turn.
// ============================================================================

import SwiftUI
import GRDB

struct MushafPageView: View {
    @EnvironmentObject var appState: AppState
    @State private var page: Int = 1
    @State private var lines: [MushafRepository.MushafLine] = []

    var body: some View {
        VStack(spacing: 0) {
            Text("صفحة \(page)")
                .font(.system(size: 13)).foregroundStyle(appState.theme.textSecondary)
                .padding(.top, 8)
            ScrollView([.horizontal]) {
                MushafPlate(page: page, lines: lines, theme: appState.theme, fontScale: appState.fontScale)
                    .frame(minWidth: UIScreen.main.bounds.width)
                    .gesture(
                        DragGesture(minimumDistance: 30).onEnded { g in
                            if g.translation.width < -40 && page < 604 { page += 1; reload() }
                            if g.translation.width > 40 && page > 1 { page -= 1; reload() }
                        })
            }
            .simultaneousGesture(TapGesture().onEnded { _ in }) // taps handled by plate
        }
        .background(appState.theme.mushafBg)
        .onAppear { reload() }
        .onChange(of: page) { _ in reload() }
    }

    private func reload() {
        FontRegistry.registerPage(page)
        lines = MushafRepository.lines(page: page, db: appState.db)
        WidgetStateBridge.publishReadingPosition(page: page, db: appState.db)
    }
}

struct MushafLineData: Identifiable {
    let id: Int
    let kind: String
    let glyphs: String          // glyphs_qpc (PUA) — rendering canonical
    let textAr: String?
    let pageNumber: Int
    let lineNumber: Int
}

/// DB query surface for mushaf plates (v_page_words + mushaf_lines).
enum MushafRepository {
    struct MushafLine { let kind: String; let glyphs: String; let textAr: String?; let words: [WordPlate] }
    struct WordPlate { let glyphs: String; let surah: Int; let ayah: Int; let wordSeq: Int }

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
                    surah: (r["surah"] as Int?) ?? 0,
                    ayah: (r["ayah_number"] as Int?) ?? 0,
                    wordSeq: (r["word_seq"] as Int?) ?? 0))
            }
            // 15 rows per page; decorative rows from mushaf_lines, text rows aggregate plates
            for line in 1...15 {
                let plates = byLine[line] ?? []
                let d = deco.first { ($0["line_number"] as Int?) == line }
                if let d, let kind = d["kind"] as String?, kind != "text", kind != "blank" {
                    out.append(MushafLine(kind: kind, glyphs: d["glyphs_qpc"] as String? ?? "",
                                          textAr: d["text_ar"] as String?, words: []))
                } else if !plates.isEmpty {
                    out.append(MushafLine(kind: "text", glyphs: "", textAr: nil, words: plates))
                }
            }
        }
        return out
    }
}

/// One page plate: lines of QPC1 HAFS calligraphy (font per page subset).
struct MushafPlate: View {
    let page: Int
    let lines: [MushafRepository.MushafLine]
    let theme: SadaqaThemeColors
    let fontScale: Double

    var body: some View {
        VStack(spacing: 2) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                lineView(line)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
    }

    @ViewBuilder
    private func lineView(_ line: MushafRepository.MushafLine) -> some View {
        if line.kind == "bismillah" {
            // BSML glyphs are ASCII-mapped VISUAL ORDER → LTR isolated line.
            Text(line.glyphs)
                .font(Font(FontRegistry.basmalaFont(size: 22 * CGFloat(fontScale))))
                .environment(\.layoutDirection, .leftToRight) // LTR isolation (see Phase 3)
                .frame(maxWidth: .infinity)
        } else if line.kind == "surah_name" {
            Text(line.textAr ?? "")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(theme.mushafText)
                .frame(maxWidth: .infinity)
        } else {
            Text(line.words.map { $0.glyphs }.joined(separator: " "))
                .font(Font(FontRegistry.mushafFont(page: page, size: 20 * CGFloat(fontScale))))
                .foregroundStyle(theme.mushafText)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }
}
