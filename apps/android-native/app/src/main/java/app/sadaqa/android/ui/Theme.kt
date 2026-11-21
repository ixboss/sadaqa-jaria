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
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import java.io.File
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

@Immutable
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
    bg = Color(0xFF07110F), surface = Color(0xFF0D1B18), surfaceRaised = Color(0xFF122521),
    textPrimary = Color(0xFFF0F4F3), textSecondary = Color(0xFF9BB3AE), accent = Color(0xFFE5C158),
    accentContrast = Color(0xFF111612), border = Color(0xFF1B352F),
    mushafText = Color(0xFFF4EFE4), mushafBg = Color(0xFF07110F),
)

data class TokenPalette(
    val bg: String, val surface: String, val surfaceRaised: String, val textPrimary: String,
    val textSecondary: String, val accent: String, val accentContrast: String, val border: String,
    val mushafText: String, val mushafBg: String,
)

object SadaqaTheme {

    @Volatile
    private var cached: Map<String, TokenPalette>? = null
    private val colorsCache = ConcurrentHashMap<String, SadaqaColors>()
    private val schemeCache = ConcurrentHashMap<String, ColorScheme>()

    /** Map tokens.json theme keys to Compose colors (fallback = dark defaults). */
    fun colors(key: String): SadaqaColors {
        val resolved = if (key == "night") "oled" else key
        colorsCache[resolved]?.let { return it }
        val tokens = readTokens()
        val palette = tokens[resolved] ?: tokens["dark"] ?: return darkDefaults
        val built = SadaqaColors(
            bg = hex(palette.bg), surface = hex(palette.surface), surfaceRaised = hex(palette.surfaceRaised),
            textPrimary = hex(palette.textPrimary), textSecondary = hex(palette.textSecondary),
            accent = hex(palette.accent), accentContrast = hex(palette.accentContrast),
            border = hex(palette.border), mushafText = hex(palette.mushafText), mushafBg = hex(palette.mushafBg),
        )
        colorsCache[resolved] = built
        return built
    }

    fun colorScheme(key: String): ColorScheme {
        val resolved = if (key == "night") "oled" else key
        schemeCache[resolved]?.let { return it }
        val c = colors(resolved)
        val dark = resolved == "dark" || resolved == "oled"
        val builder = if (dark) darkColorScheme() else lightColorScheme()
        val built = builder.copy(
            background = c.bg, surface = c.surface, surfaceVariant = c.surfaceRaised,
            primary = c.accent, onPrimary = c.accentContrast,
            onBackground = c.textPrimary, onSurface = c.textPrimary,
            outline = c.border, secondary = c.surfaceRaised,
        )
        schemeCache[resolved] = built
        return built
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
                bg = s("bg", "#07110F"), surface = s("surface", "#0D1B18"),
                surfaceRaised = s("surfaceRaised", "#122521"), textPrimary = s("textPrimary", "#F0F4F3"),
                textSecondary = s("textSecondary", "#9BB3AE"), accent = s("accent", "#E5C158"),
                accentContrast = s("accentContrast", "#111612"), border = s("border", "#1B352F"),
                mushafText = s("mushafText", "#F4EFE4"), mushafBg = s("mushafBg", "#07110F"),
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
    private val cache = ConcurrentHashMap<Int, Pair<FontFamily, android.graphics.Typeface>>()
    @Volatile private var basmala: Pair<FontFamily, android.graphics.Typeface>? = null
    @Volatile private var uthmanicFamily: FontFamily? = null
    @Volatile private var uthmanicTf: android.graphics.Typeface? = null

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

    fun verifiedMushaf(context: Context, page: Int, sample: String): FontFamily? {
        val pair = loadPagePair(context, page) ?: return null
        return if (coversText(pair.second, sample)) pair.first else null
    }

    fun verifiedMushafTypeface(context: Context, page: Int, sample: String): android.graphics.Typeface? {
        val pair = loadPagePair(context, page) ?: return null
        return if (coversText(pair.second, sample)) pair.second else null
    }

    fun uthmanicTypeface(context: Context): android.graphics.Typeface {
        uthmanicTf?.let { return it }
        val tf = runCatching {
            val file = ensureExtracted(context, "fonts/UthmanicHafs1Ver18.ttf")
            if (file != null) android.graphics.Typeface.createFromFile(file) else android.graphics.Typeface.DEFAULT
        }.getOrDefault(android.graphics.Typeface.DEFAULT)
        uthmanicTf = tf
        return tf
    }

    fun verifiedBasmala(context: Context, sample: String): FontFamily? {
        val pair = loadBasmalaPair(context) ?: return null
        return if (coversText(pair.second, sample)) pair.first else null
    }

    private fun loadPagePair(context: Context, page: Int): Pair<FontFamily, android.graphics.Typeface>? {
        cache[page]?.let { return it }
        val file = ensureExtracted(context, String.format(Locale.US, "fonts/p%03d.ttf", page)) ?: return null
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
