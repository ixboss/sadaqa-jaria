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

    static let fallbackDarkTheme = TokenTheme(
        bg: "#07110F", surface: "#0D1B18", surfaceRaised: "#122521",
        textPrimary: "#F0F4F3", textSecondary: "#9BB3AE", accent: "#E5C158",
        accentContrast: "#111612", border: "#1B352F", mushafText: "#F4EFE4", mushafBg: "#07110F"
    )

    static func loadFile() -> TokensFile {
        let url = Bundle.main.url(forResource: "tokens", withExtension: "json", subdirectory: "Resources")
            ?? Bundle.main.url(forResource: "tokens", withExtension: "json")
        guard let url,
              let data = try? Data(contentsOf: url),
              let tokens = try? JSONDecoder().decode(TokensFile.self, from: data) else {
            return TokensFile(themes: ["dark": fallbackDarkTheme], glass: nil, motion: nil, haptics: nil, typography: nil)
        }
        return tokens
    }

    static func load(key: String) -> SadaqaThemeColors {
        let file = loadFile()
        let resolvedKey = (key == "night") ? "oled" : key
        let t = file.themes[resolvedKey] ?? file.themes["dark"] ?? fallbackDarkTheme
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
// QPC1BSML.ttf + canonical KFGQPC UthmanicHafs1Ver18.ttf fallback.
// Resolving via CTFontManagerCreateFontDescriptorsFromURL guarantees the exact
// internal PostScript name (QCF_P001..QCF_P604, QCF_BSML, KFGQPC...) and
// runtime CTFontGetGlyphsForCharacters prevents any PUA tofu/gibberish.
// ============================================================================

enum FontRegistry {
    private static var registeredPostScriptNames: [String: String] = [:]

    static func fontURL(named resource: String) -> URL? {
        let base = (resource as NSString).deletingPathExtension
        let ext = (resource as NSString).pathExtension
        return Bundle.main.url(forResource: base, withExtension: ext, subdirectory: "Resources/fonts")
            ?? Bundle.main.url(forResource: base, withExtension: ext, subdirectory: "fonts")
            ?? Bundle.main.url(forResource: base, withExtension: ext, subdirectory: "Resources")
            ?? Bundle.main.url(forResource: base, withExtension: ext)
    }

    @discardableResult
    static func registerAndResolveName(named resource: String) -> String? {
        if let cached = registeredPostScriptNames[resource] { return cached }
        guard let url = fontURL(named: resource) else { return nil }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        if let descs = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
           let first = descs.first,
           let psName = CTFontDescriptorCopyAttribute(first, kCTFontNameAttribute) as? String,
           !psName.isEmpty {
            registeredPostScriptNames[resource] = psName
            return psName
        }
        return nil
    }

    static func registerBasmala() {
        _ = registerAndResolveName(named: "QPC1BSML.ttf")
        _ = registerAndResolveName(named: "UthmanicHafs1Ver18.ttf")
    }

    static func registerPage(_ page: Int) {
        let name = String(format: "p%03d.ttf", page)
        _ = registerAndResolveName(named: name)
    }

    /// Verify every non-whitespace UTF-16 code unit maps to a non-zero glyph.
    static func coversText(_ font: UIFont, sample: String) -> Bool {
        let trimmed = sample.unicodeScalars.filter { !$0.properties.isWhitespace }
        guard !trimmed.isEmpty else { return false }
        let utf16 = Array(String(trimmed).utf16)
        var glyphs = [CGGlyph](repeating: 0, count: utf16.count)
        let ctFont = font as CTFont
        guard CTFontGetGlyphsForCharacters(ctFont, utf16, &glyphs, utf16.count) else {
            return false
        }
        return glyphs.allSatisfy { $0 != 0 }
    }

    static func uthmanicFont(size: CGFloat) -> UIFont {
        if let ps = registerAndResolveName(named: "UthmanicHafs1Ver18.ttf"),
           let f = UIFont(name: ps, size: size) {
            return f
        }
        if let f = UIFont(name: "KFGQPCHAFSUthmanicScript-Regula", size: size) { return f }
        if let f = UIFont(name: "KFGQPC HAFS Uthmanic Script", size: size) { return f }
        return UIFont.systemFont(ofSize: size)
    }

    /// Returns verified per-page QCF font if registered AND covers `sample`;
    /// nil tells the caller to render plain `word_text`/`text_uthmani` instead.
    static func verifiedMushafFont(page: Int, size: CGFloat, sample: String) -> UIFont? {
        let res = String(format: "p%03d.ttf", page)
        if let ps = registerAndResolveName(named: res),
           let f = UIFont(name: ps, size: size),
           coversText(f, sample: sample) {
            return f
        }
        let fallbackName = String(format: "QCF_P%03d", page)
        if let f = UIFont(name: fallbackName, size: size), coversText(f, sample: sample) {
            return f
        }
        return nil
    }

    /// Verified BSML font — nil triggers Arabic UthmanicHafs Basmala fallback.
    static func verifiedBasmalaFont(size: CGFloat, sample: String) -> UIFont? {
        if let ps = registerAndResolveName(named: "QPC1BSML.ttf"),
           let f = UIFont(name: ps, size: size),
           coversText(f, sample: sample) {
            return f
        }
        if let f = UIFont(name: "QCF_BSML", size: size), coversText(f, sample: sample) {
            return f
        }
        return nil
    }
}
