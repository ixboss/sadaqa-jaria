// ============================================================================
// Theme.swift — design tokens (packages/design-tokens/tokens.json, copied into
// Resources by scripts/tools/sync-native-assets.mjs) mapped to SwiftUI. Four
// themes the settings screen offers (web parity: dark/light/sepia/night);
// glass values drive the CONTROL layer only (tokens.glassPolicy).
// ============================================================================

import SwiftUI
import UIKit

struct TokenTheme: Codable {
    let bg: String
    let surface: String
    let surfaceRaised: String
    let textPrimary: String
    let textSecondary: String
    let accent: String
    let accentContrast: String
    let border: String
    let mushafText: String
    let mushafBg: String
}

struct TokensFile: Codable {
    let themes: [String: TokenTheme]
    struct Glass: Codable { let fill, fillStrong, blur: String?; let borderHighlight: String? }
    let glass: Glass?
    struct Motion: Codable { struct Durations: Codable { let tick, complete: Int? }; let durations: Durations? }
    let motion: Motion?
    struct Haptics: Codable { let dhikrTick: [Int]; let dhikrComplete: [Int]; let categoryComplete: [Int]; let pageFlipSettle: [Int]; let bookmarkSaved: [Int] }
    let haptics: Haptics?
    struct Typography: Codable { let arabicLineHeight: Double?; let fontScaleSteps: [Double]?; let defaultFontScale: Double? }
    let typography: Typography?
}

enum SadaqaTheme {
    static let offeredKeys = ["dark", "light", "sepia", "night"] // settings-screen parity with web

    static func loadFile() -> TokensFile {
        guard let url = Bundle.main.url(forResource: "tokens", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let tokens = try? JSONDecoder().decode(TokensFile.self, from: data) else {
            // minimal dark fallback if the synced file is missing (never in CI)
            let dark = TokenTheme(bg: "#07161B", surface: "#0E2228", surfaceRaised: "#17333B",
                                  textPrimary: "#E8EEF2", textSecondary: "#A7B7BD", accent: "#E7C14C",
                                  accentContrast: "#1A1206", border: "#1E3A44", mushafText: "#F2EFE6", mushafBg: "#0A1C22")
            return TokensFile(themes: ["dark": dark], glass: nil, motion: nil, haptics: nil, typography: nil)
        }
        return tokens
    }

    static func load(key: String) -> SadaqaThemeColors {
        let file = loadFile()
        let t = file.themes[key] ?? file.themes["dark"]!
        return SadaqaThemeColors(token: t, all: file)
    }
}

/// "night" maps to the tokens 'oled' palette (web theme alias parity).
struct SadaqaThemeColors {
    let token: TokenTheme
    let all: TokensFile

    var colorScheme: ColorScheme? {
        switch token.bg {
        case "#000000": return .dark
        default: break
        }
        // light/sepia are light schemes; dark/oled are dark
        let key = offeredAlias
        return (key == "light" || key == "sepia") ? .light : .dark
    }

    private var offeredAlias: String {
        if token.bg == "#FAF7F0" { return "light" }
        if token.bg == "#F4E8D0" { return "sepia" }
        return "dark"
    }

    var bg: Color { UIColor(hex: token.bg).color }
    var surface: Color { UIColor(hex: token.surface).color }
    var surfaceRaised: Color { UIColor(hex: token.surfaceRaised).color }
    var textPrimary: Color { UIColor(hex: token.textPrimary).color }
    var textSecondary: Color { UIColor(hex: token.textSecondary).color }
    var accent: Color { UIColor(hex: token.accent).color }
    var accentContrast: Color { UIColor(hex: token.accentContrast).color }
    var border: Color { UIColor(hex: token.border).color }
    var mushafText: Color { UIColor(hex: token.mushafText).color }
    var mushafBg: Color { UIColor(hex: token.mushafBg).color }
}

extension UIColor {
    convenience init(hex: String) {
        var h = hex.trimmingCharacters(in: .alphanumerics.inverted)
        if h.count == 6 { h = "FF" + h } // add alpha
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
                  blue: CGFloat(v & 0xFF) / 255, alpha: CGFloat((v >> 24) & 0xFF) / 255)
    }
    var color: Color { Color(self) }
}

// ============================================================================
// FontRegistry — per-page QPC1 subset TTFs (Resources/fonts/pNNN.ttf) +
// QPC1BSML.ttf. Fonts are converted from the web woff2 subsets by the sync
// script — codepoint parity by construction (same PUA glyphs, same fonts).
// ============================================================================

enum FontRegistry {
    static var registeredPages = Set<Int>()

    static func registerBasmala() {
        register(named: "QPC1BSML.ttf")
    }

    /// Register the page's QPC1 subset lazily (eviction unnecessary on iOS —
    /// CTFontManager caches; 605 small subsets ≈ tens of MB worst case).
    static func registerPage(_ page: Int) {
        guard !registeredPages.contains(page) else { return }
        let name = String(format: "p%03d.ttf", page)
        if register(named: name) {
            registeredPages.insert(page)
        }
    }

    /// CTFontManager registration is idempotent per process — the completion
    /// handler returns true for already-registered URLs, so failures are the
    /// only false path (missing resource file).
    @discardableResult
    static func register(named resource: String) -> Bool {
        guard let url = Bundle.main.url(forResource: (resource as NSString).deletingPathExtension, withExtension: (resource as NSString).pathExtension) else { return false }
        let done = UnsafeMutablePointer<Bool>.allocate(capacity: 1)
        done.initialize(to: false)
        CTFontManagerRegisterFontURLs([url] as CFArray, .process, true) { _, _ in
            done.pointee = true
            return true
        }
        let ok = done.pointee
        done.deinitialize(count: 1)
        done.deallocate()
        return ok
    }

    /// The mushaf page font — per-page family fallback chain.
    static func mushafFont(page: Int, size: CGFloat) -> UIFont {
        registerPage(page)
        let name = "QPC1-\(page)"
        if let f = UIFont(name: name, size: size) { return f }
        return UIFont.systemFont(ofSize: size)
    }

    /// Basmala (BSML) font — visual-ORDER glyphs, must render LTR-isolated.
    static func basmalaFont(size: CGFloat) -> UIFont {
        registerBasmala()
        return UIFont(name: "QPC1BSML", size: size) ?? UIFont.systemFont(ofSize: size)
    }
}
