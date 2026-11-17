// ============================================================================
// BackupView.swift + AudioView.swift — `.sadaqa` export/import UI (Merge and
// Replace modes, counts preview via the codec) and the reciter pack manager
// (catalog.json bundled by the sync script; starter pack plays offline).
// ============================================================================

import SwiftUI
import AVFoundation
import UniformTypeIdentifiers

struct BackupView: View {
    @EnvironmentObject var appState: AppState
    @State private var counts: [String: Int] = [:]
    @State private var exportDone = false
    @State private var shareURL: URL?
    @State private var importMode: String = "merge"
    @State private var importReport: String?
    @State private var showImporter = false
    @State private var lastError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                // live entity counts (same 9-table snapshot as export)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(countLabels, id: \.0) { label, value in
                        VStack(spacing: 2) {
                            Text("\(value)").font(.system(size: 18, weight: .bold)).monospacedDigit()
                            Text(label).font(.system(size: 12)).foregroundStyle(appState.theme.textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(10)
                        .background(appState.theme.surfaceRaised)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }

                Button {
                    export()
                } label: {
                    Label("تصدير ملف .sadaqa", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(appState.theme.accent)
                .foregroundStyle(appState.theme.accentContrast)

                Divider()

                Picker("وضع الاستيراد", selection: $importMode) {
                    Text("دمج ذكي").tag("merge")
                    Text("استبدال كامل").tag("replace")
                }
                .pickerStyle(.segmented)

                Text(importMode == "merge"
                     ? "الدمج الذكي: يضيف الجديد ويحدّث الأحدث زمنياً، ولا يمسح ما لديك."
                     : "الاستبدال الكامل: يمسح بيانات القراءة والذكر المحلية ويعيد بناءها من الملف.")
                    .font(.system(size: 12)).lineSpacing(6)
                    .foregroundStyle(appState.theme.textSecondary)

                Button {
                    showImporter = true
                } label: {
                    Label("استيراد ملف .sadaqa", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                if let report = importReport { Text(report).font(.system(size: 13)) }
                if let err = lastError { Text(err).font(.system(size: 13)).foregroundStyle(.red) }
            }
            .padding(16)
        }
        .background(appState.theme.bg)
        .navigationTitle("النسخ الاحتياطي")
        .onAppear { refreshCounts() }
        .sheet(isPresented: $showShare) {
            if let url = shareURL { ShareSheet(items: [url]) }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.sadaqaType, UTType.json]) { result in
            importFile(result)
        }
    }

    @State private var showShare = false

    private var countLabels: [(String, Int)] {
        [
            ("العلامات المرجعية", counts["bookmarks"] ?? 0),
            ("التظليلات", counts["highlights"] ?? 0),
            ("الملاحظات", counts["notes"] ?? 0),
            ("خطط الختمة", counts["khatmah_plans"] ?? 0),
            ("عدّادات السبحة", counts["tasbih_counters"] ?? 0),
            ("جلسات السبحة", counts["tasbih_sessions"] ?? 0),
            ("حالة الأذكار", counts["adhkar_state"] ?? 0),
            ("سلاسل الأيام", counts["streak_days"] ?? 0),
            ("الإعدادات", counts["user_settings"] ?? 0),
        ]
    }

    private func refreshCounts() {
        var c: [String: Int] = [:]
        try? appState.db.queue.read { db in
            for t in ["bookmarks", "highlights", "notes", "khatmah_plans", "tasbih_counters", "tasbih_sessions", "adhkar_state", "streak_days"] {
                c[t] = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM \(t)") ?? 0
            }
            c["user_settings"] = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM user_settings WHERE key != 'device_id'") ?? 0
        }
        counts = c
    }

    private func export() {
        do {
            let now = Date.nowMs
            let (manifest, payloadJson) = try appState.db.buildExportPayload(now: now)
            guard let url = BackupIO.writeTempSadaqa(payloadJson: payloadJson, manifest: manifest, now: now) else {
                lastError = "تعذّر تجهيز الملف"; return
            }
            try appState.db.queue.write { db in
                try db.execute(sql: "INSERT INTO backup_log (direction, mode, format_version, counts_json, created_at) VALUES ('export', NULL, 1, ?, ?)",
                               arguments: ["{}", now])
            }
            shareURL = url
            showShare = true
            lastError = nil
        } catch {
            lastError = String(describing: error)
        }
    }

    private func importFile(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let e): lastError = String(describing: e)
        case .success(let url):
            do {
                let secured = url.startAccessingSecurityScopedResource()
                defer { if secured { url.stopAccessingSecurityScopedResource() } }
                let text = try String(contentsOf: url, encoding: .utf8)
                let report = try appState.db.importBackup(text: text, mode: importMode)
                importReport = "تم الاستيراد: أُضيف \(report.added)، حُدِّث \(report.updated)، تعارض \(report.conflicts)، تخطي \(report.skipped)"
                lastError = nil
                refreshCounts()
                AdhanScheduler.shared.reschedule(db: appState.db)
            } catch {
                lastError = String(describing: error)
            }
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

extension UTType {
    /// The `.sadaqa` document type (declared in Info.plist via UTExportedTypeDeclarations on release; JSON-compatible here).
    static var sadaqaType: UTType {
        UTType(filenameExtension: "sadaqa") ?? UTType.json
    }
}

// ---------------------------------------------------------------------------
// Audio pack manager — 18 EveryAyah reciters (catalog.json), starter pack
// (Fatiha · Alafasy) offline on first boot; per-surah downloads via URLSession
// into the AudioStore. Player chains ayahs with next-ayah preload.
// ---------------------------------------------------------------------------

struct AudioReciter: Identifiable {
    let id: String
    let nameAr: String
    let style: String
}

struct AudioCatalog: Codable {
    struct Entry: Codable {
        let id: String
        let nameAr: String
        let nameEn: String
        let style: String
        let audioUrlTemplate: String
    }
    let formatVersion: Int
    let reciters: [Entry]
}

struct AudioView: View {
    @EnvironmentObject var appState: AppState
    @State private var catalog: AudioCatalog?
    @State private var playing: (surah: Int, ayah: Int, reciter: String)?
    @State private var progress: [String: Double] = [:]
    @State private var surahPick = 1
    private let player = AudioPlayerChain()

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                HStack {
                    Picker("السورة", selection: $surahPick) {
                        ForEach(1...114, id: \.self) { Text("سورة \($0)").tag($0) }
                    }
                }
                if let playing {
                    HStack {
                        Image(systemName: "waveform").foregroundStyle(appState.theme.accent)
                        Text("آية \(playing.ayah) — سورة \(playing.surah)")
                            .font(.system(size: 14))
                        Spacer()
                        Button("إيقاف") { player.stop(); self.playing = nil }
                            .font(.system(size: 13))
                    }
                    .padding(12).background(appState.theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                ForEach(catalog?.reciters ?? []) { r in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.nameAr).font(.system(size: 15, weight: .semibold))
                            Text(r.style == "murattal" ? "مرتّل" : "مجوَّد").font(.system(size: 12))
                                .foregroundStyle(appState.theme.textSecondary)
                        }
                        Spacer()
                        if let p = progress[r.id] {
                            Text("\(Int(p * 100))٪").monospacedDigit().font(.system(size: 12))
                                .foregroundStyle(appState.theme.accent)
                        }
                        Button("تشغيل") { play(surah: surahPick, ayah: 1, reciter: r) }
                            .font(.system(size: 13))
                        Button("تنزيل السورة") { download(surah: surahPick, reciter: r) }
                            .font(.system(size: 13)).foregroundStyle(appState.theme.accent)
                    }
                    .padding(12)
                    .background(appState.theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(16)
        }
        .background(appState.theme.bg)
        .navigationTitle("التلاوة")
        .onAppear { loadCatalog() }
    }

    private func loadCatalog() {
        guard catalog == nil,
              let url = Bundle.main.url(forResource: "audio-catalog", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let cat = try? JSONDecoder().decode(AudioCatalog.self, from: data) else { return }
        catalog = cat
    }

    private func play(surah: Int, ayah: Int, reciter: AudioCatalog.Entry) {
        guard let url = AudioStore.shared.localURL(reciter: reciter.id, surah: surah, ayah: ayah) else {
            download(surah: surah, reciter: reciter)
            return
        }
        playing = (surah, ayah, reciter.id)
        player.play(url: url) {
            // onended chain — next ayah (web player parity)
            guard let n = try? appState.db.queue.read({ db in
                try Int.fetchOne(db, sql: "SELECT number_in_surah FROM ayahs WHERE surah = ? AND ayah_number = (SELECT ayah_number FROM ayahs WHERE surah = ? AND number_in_surah = ? LIMIT 1)", arguments: [surah, surah, ayah + 1])
            }), let nextAyah = n, ayah < nextAyah + 1 else { return }
            if let u = AudioStore.shared.localURL(reciter: reciter.id, surah: surah, ayah: ayah + 1) {
                playing = (surah, ayah + 1, reciter.id)
                player.play(url: u) { self.play(surah: surah, ayah: ayah + 1, reciter: reciter) }
            }
        }
    }

    /// Per-surah pack download into the AudioStore (EveryAyah `{SSS}{AAA}.mp3`).
    private func download(surah: Int, reciter: AudioCatalog.Entry) {
        Task {
            var ayah = 1
            var total = 0
            while true {
                guard let count = try? appState.db.queue.read({ db in
                    try Int.fetchOne(db, sql: "SELECT ayah_count FROM surahs WHERE number = ?", arguments: [surah])
                }), let ayahCount = count, ayah <= ayahCount else { break }
                let urlString = reciter.audioUrlTemplate
                    .replacingOccurrences(of: "{SSSAAA}", with: String(format: "%03d%03d", surah, ayah))
                guard let url = URL(string: urlString) else { break }
                do {
                    let (data, resp) = try await URLSession.shared.data(from: url)
                    if let http = resp as? HTTPURLResponse, http.statusCode == 200, data.count > 1000 {
                        try AudioStore.shared.store(data: data, reciter: reciter.id, surah: surah, ayah: ayah)
                        total += data.count
                        ayah += 1
                        progress[reciter.id] = Double(ayah - 1) / Double(ayahCount)
                    } else { break }
                } catch { break }
            }
            progress[reciter.id] = 1.0
        }
    }
}

/// AVAudioPlayer chain with next-ayah preload slot.
final class AudioPlayerChain: NSObject, AVAudioPlayerDelegate {
    private var current: AVAudioPlayer?

    func play(url: URL, onEnd: @escaping () -> Void) {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: url)
            p.delegate = self
            p.prepareToPlay()
            p.play()
            current = p
            onFinish = onEnd
        } catch { onFinish = nil }
    }

    func stop() { current?.stop(); current = nil }

    private var onFinish: (() -> Void)?
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        onFinish?()
    }
}
