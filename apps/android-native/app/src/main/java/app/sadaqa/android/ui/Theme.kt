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
// QPC1 fonts — per-page subset TTFs from assets/fonts (Phase 3 parity: the
// same PUA glyph codepoints, codepoint-parity by construction). Files are
// extracted to filesDir on first use (Typeface needs a real file path).
// ---------------------------------------------------------------------------

object QpcFonts {
    private val cache = mutableMapOf<Int, FontFamily>()
    private var basmala: FontFamily? = null

    fun mushaf(context: Context, page: Int): FontFamily {
        cache[page]?.let { return it }
        val family = ensureExtracted(context, "fonts/p%03d.ttf".format(page))
            ?.let { FontFamily(Font(it)) }
            ?: FontFamily.Default
        cache[page] = family
        return family
    }

    /** BSML basmala font — visual-ORDER glyphs, must render LTR-isolated. */
    fun basmala(context: Context): FontFamily {
        basmala?.let { return it }
        val family = ensureExtracted(context, "fonts/QPC1BSML.ttf")
            ?.let { FontFamily(Font(it)) }
            ?: FontFamily.Default
        basmala = family
        return family
    }

    private fun ensureExtracted(context: Context, assetPath: String): File? {
        val file = File(context.filesDir, assetPath)
        if (!file.exists()) {
            runCatching {
                context.assets.open(assetPath).use { input ->
                    file.parentFile?.mkdirs()
                    file.outputStream().use { input.copyTo(it) }
                }
            }
        }
        return file.takeIf { it.exists() }
    }
}
