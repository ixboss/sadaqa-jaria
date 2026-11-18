// ============================================================================
// Theme.kt — tokens.json mapped to Compose (Material color scheme + the app's
// own SadaqaColors). Reads tokens.json + per-page QPC1 TTFs from assets
// (synced by scripts/tools/sync-native-assets.mjs). Glass stays on the
// control layer only (tokens.glassPolicy) — content surfaces are solid.
// ============================================================================

package app.sadaqa.android.ui

import android.content.Context
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import java.io.File

data class SadaqaColors(
    val bg: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val accent: Color,
    val accentContrast: Color,
    val border: Color,
    val mushafText: Color,
    val mushafBg: Color,
)

val LocalSadaqaTheme = staticCompositionLocalOf { darkDefaults }

/** "night" maps to the tokens 'oled' palette (web alias parity). */
val OFFERED_THEMES = listOf("dark", "light", "sepia", "night")

val darkDefaults = SadaqaColors(
    bg = Color(0xFF07161B), surface = Color(0xFF0E2228), surfaceRaised = Color(0xFF17333B),
    textPrimary = Color(0xFFE8EEF2), textSecondary = Color(0xFFA7B7BD), accent = Color(0xFFE7C14C),
    accentContrast = Color(0xFF1A1206), border = Color(0xFF1E3A44),
    mushafText = Color(0xFFF2EFE6), mushafBg = Color(0xFF0A1C22),
)

data class TokenPalette(
    val bg: String, val surface: String, val surfaceRaised: String, val textPrimary: String,
    val textSecondary: String, val accent: String, val accentContrast: String, val border: String,
    val mushafText: String, val mushafBg: String,
)

object SadaqaTheme {

    private var cached: Map<String, TokenPalette>? = null

    /** Map tokens.json theme keys to Compose colors (fallback = dark defaults). */
    fun colors(key: String): SadaqaColors {
        val palette = readTokens()[key] ?: readTokens()["dark"] ?: return darkDefaults
        return SadaqaColors(
            bg = hex(palette.bg), surface = hex(palette.surface), surfaceRaised = hex(palette.surfaceRaised),
            textPrimary = hex(palette.textPrimary), textSecondary = hex(palette.textSecondary),
            accent = hex(palette.accent), accentContrast = hex(palette.accentContrast),
            border = hex(palette.border), mushafText = hex(palette.mushafText), mushafBg = hex(palette.mushafBg),
        )
    }

    fun colorScheme(key: String): ColorScheme {
        val c = colors(key)
        val dark = key == "dark" || key == "night"
        val builder = if (dark) darkColorScheme() else lightColorScheme()
        return builder.copy(
            background = c.bg, surface = c.surface, surfaceVariant = c.surfaceRaised,
            primary = c.accent, onPrimary = c.accentContrast,
            onBackground = c.textPrimary, onSurface = c.textPrimary,
            outline = c.border, secondary = c.surfaceRaised,
        )
    }

    private fun readTokens(): Map<String, TokenPalette> {
        cached?.let { return it }
        val map = runCatching {
            val text = ContextHolder.app?.assets?.open("tokens.json")?.bufferedReader()?.readText()
            if (text == null) emptyMap() else parseTokens(text)
        }.getOrDefault(emptyMap())
        cached = map
        return map
    }

    private fun parseTokens(text: String): Map<String, TokenPalette> {
        val root = (kotlinx.serialization.json.Json.parseToJsonElement(text) as? kotlinx.serialization.json.JsonObject)
            ?: return emptyMap()
        val themes = (root["themes"] as? kotlinx.serialization.json.JsonObject) ?: return emptyMap()
        return themes.mapValues { (_, v) ->
            val t = (v as? kotlinx.serialization.json.JsonObject) ?: kotlinx.serialization.json.JsonObject(emptyMap())
            fun s(k: String, d: String): String =
                ((t[k] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content) ?: d
            TokenPalette(
                bg = s("bg", "#07161B"), surface = s("surface", "#0E2228"),
                surfaceRaised = s("surfaceRaised", "#17333B"), textPrimary = s("textPrimary", "#E8EEF2"),
                textSecondary = s("textSecondary", "#A7B7BD"), accent = s("accent", "#E7C14C"),
                accentContrast = s("accentContrast", "#1A1206"), border = s("border", "#1E3A44"),
                mushafText = s("mushafText", "#F2EFE6"), mushafBg = s("mushafBg", "#0A1C22"),
            )
        }
    }

    private fun hex(s: String): Color = Color(android.graphics.Color.parseColor(s))
}

/** App-scoped context for asset reads (set in SadaqaApp.onCreate). */
object ContextHolder {
    var app: Context? = null
}

// ---------------------------------------------------------------------------
// QPC1 fonts — per-page subset TTFs from assets/fonts + canonical UthmanicHafs
// fallback (`res/font/uthmanic_hafs.ttf` / `assets/fonts/UthmanicHafs1Ver18.ttf`).
// Paint.hasGlyph() verification ensures we NEVER pass PUA glyphs to a fallback font.
// ---------------------------------------------------------------------------

object QpcFonts {
    private val cache = mutableMapOf<Int, Pair<FontFamily, android.graphics.Typeface>>()
    private var basmala: Pair<FontFamily, android.graphics.Typeface>? = null
    private var uthmanicFamily: FontFamily? = null

    fun uthmanic(context: Context): FontFamily {
        uthmanicFamily?.let { return it }
        val family = runCatching {
            val file = ensureExtracted(context, "fonts/UthmanicHafs1Ver18.ttf")
            if (file != null) FontFamily(Font(file))
            else {
                val resId = context.resources.getIdentifier("uthmanic_hafs", "font", context.packageName)
                if (resId != 0) FontFamily(Font(resId)) else FontFamily.Default
            }
        }.getOrDefault(FontFamily.Default)
        uthmanicFamily = family
        return family
    }

    fun mushaf(context: Context, page: Int): FontFamily =
        loadPagePair(context, page)?.first ?: uthmanic(context)

    fun verifiedMushaf(context: Context, page: Int, sample: String): FontFamily? {
        val pair = loadPagePair(context, page) ?: return null
        return if (coversText(pair.second, sample)) pair.first else null
    }

    /** BSML basmala font — visual-ORDER glyphs, must render LTR-isolated. */
    fun basmala(context: Context): FontFamily =
        loadBasmalaPair(context)?.first ?: uthmanic(context)

    fun verifiedBasmala(context: Context, sample: String): FontFamily? {
        val pair = loadBasmalaPair(context) ?: return null
        return if (coversText(pair.second, sample)) pair.first else null
    }

    private fun loadPagePair(context: Context, page: Int): Pair<FontFamily, android.graphics.Typeface>? {
        cache[page]?.let { return it }
        val file = ensureExtracted(context, "fonts/p%03d.ttf".format(page)) ?: return null
        return runCatching {
            val tf = android.graphics.Typeface.createFromFile(file)
            val pair = FontFamily(Font(file)) to tf
            cache[page] = pair
            pair
        }.getOrNull()
    }

    private fun loadBasmalaPair(context: Context): Pair<FontFamily, android.graphics.Typeface>? {
        basmala?.let { return it }
        val file = ensureExtracted(context, "fonts/QPC1BSML.ttf") ?: return null
        return runCatching {
            val tf = android.graphics.Typeface.createFromFile(file)
            val pair = FontFamily(Font(file)) to tf
            basmala = pair
            pair
        }.getOrNull()
    }

    private fun coversText(typeface: android.graphics.Typeface, sample: String): Boolean {
        val trimmed = sample.filter { !it.isWhitespace() }
        if (trimmed.isEmpty()) return false
        val paint = android.graphics.Paint().apply { this.typeface = typeface }
        var idx = 0
        while (idx < trimmed.length) {
            val cp = trimmed.codePointAt(idx)
            val ch = String(Character.toChars(cp))
            if (!paint.hasGlyph(ch)) return false
            idx += Character.charCount(cp)
        }
        return true
    }

    private fun ensureExtracted(context: Context, assetPath: String): File? {
        val file = File(context.filesDir, assetPath)
        if (!file.exists() || file.length() == 0L) {
            runCatching {
                context.assets.open(assetPath).use { input ->
                    file.parentFile?.mkdirs()
                    file.outputStream().use { input.copyTo(it) }
                }
            }
        }
        return file.takeIf { it.exists() && it.length() > 0L }
    }
}
