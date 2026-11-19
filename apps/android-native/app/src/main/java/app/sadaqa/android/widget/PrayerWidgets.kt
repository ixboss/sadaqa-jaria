// ============================================================================
// PrayerWidgets.kt — Glance app widgets: prayer countdown + daily dhikr.
// Data: SharedPreferences ("widget-state", published by the app process via
// WidgetStateBridge) + recomputation via the SAME engine — offline, and the
// widget process NEVER opens the app's SQLite db (2026-11 audit fix: opening
// the app's WAL db from a separate process re-issued journal_mode=WAL while
// the app held it; all cross-process data now flows through the prefs bridge).
// ============================================================================

package app.sadaqa.android.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.sadaqa.android.engine.EngineOptions
import app.sadaqa.android.engine.PrayerEngine
import app.sadaqa.android.engine.PrayerName

/** Reads the app-published widget state; recomputes next prayer offline. */
object WidgetData {
    private fun prefs(context: Context) = context.getSharedPreferences("widget-state", Context.MODE_PRIVATE)

    internal fun parseLocation(loc: String): EngineOptions? {
        val parts = loc.split(";")
        if (parts.size < 3) return null
        val lat = parts[0].replace(',', '.').toDoubleOrNull() ?: return null
        val lng = parts[1].replace(',', '.').toDoubleOrNull() ?: return null
        val tz = parts[2].ifBlank { return null }
        val method = parts.getOrNull(3)?.takeIf { it.isNotBlank() } ?: "umm_al_qura"
        val madhab = parts.getOrNull(4)?.takeIf { it.isNotBlank() } ?: "shafi"
        val hlr = parts.getOrNull(5)?.takeIf { it.isNotBlank() } ?: "middle_of_the_night"
        return EngineOptions(lat = lat, lng = lng, timeZone = tz, method = method, madhab = madhab, highLatitudeRule = hlr)
    }

    fun nextPrayer(context: Context): Triple<PrayerName, Long, String>? {
        val loc = prefs(context).getString("location", null) ?: return null
        val opts = parseLocation(loc) ?: return null
        val now = System.currentTimeMillis()
        val next = runCatching {
            PrayerEngine.next(now, opts)
        }.getOrNull() ?: return null
        return Triple(next.name, next.at, opts.timeZone)
    }

    /** App-published daily dhikr pick (empty until the app first publishes). */
    fun dailyDhikr(context: Context): String =
        prefs(context).getString("dhikr", null) ?: ""
}

// ---------------------------------------------------------------------------
// Prayer countdown widget
// ---------------------------------------------------------------------------

class PrayerCountdownReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = PrayerCountdownWidget
}

object PrayerCountdownWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val next = WidgetData.nextPrayer(context)
        provideContent { Content(next) }
    }

    @Composable
    private fun Content(next: Triple<PrayerName, Long, String>?) {
        GlanceTheme {
            Column(
                modifier = GlanceModifier.fillMaxSize().background(ColorProvider(Color(0xEE07110F))).padding(10.dp),
                verticalAlignment = Alignment.Top,
                horizontalAlignment = Alignment.Start,
            ) {
                Text(
                    "الصلاة القادمة",
                    style = TextStyle(color = ColorProvider(Color(0xFF9BB3AE)), fontSize = 11.sp),
                )
                if (next != null) {
                    Text(
                        next.first.labelAr,
                        style = TextStyle(color = ColorProvider(Color(0xFFE5C158)), fontSize = 20.sp),
                    )
                    val zone = runCatching { java.time.ZoneId.of(next.third) }.getOrElse { java.time.ZoneId.of("Asia/Riyadh") }
                    val zdt = java.time.Instant.ofEpochMilli(next.second).atZone(zone)
                    Text(
                        "%02d:%02d".format(zdt.hour, zdt.minute),
                        style = TextStyle(color = ColorProvider(Color.White), fontSize = 15.sp),
                    )
                } else {
                    Text(
                        "افتح التطبيق لضبط الموقع",
                        style = TextStyle(color = ColorProvider(Color.White), fontSize = 12.sp),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Daily dhikr widget
// ---------------------------------------------------------------------------

class DhikrWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DhikrWidget
}

object DhikrWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val dhikr = WidgetData.dailyDhikr(context)
        provideContent { Content(dhikr) }
    }

    @Composable
    private fun Content(dhikr: String) {
        GlanceTheme {
            Column(
                modifier = GlanceModifier.fillMaxSize().background(ColorProvider(Color(0xEE07110F))).padding(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    "ذكر اليوم",
                    style = TextStyle(color = ColorProvider(Color(0xFF9BB3AE)), fontSize = 11.sp),
                )
                Text(
                    dhikr.ifEmpty { "أذكار الصباح" },
                    style = TextStyle(color = ColorProvider(Color.White), fontSize = 13.sp),
                    maxLines = 5,
                )
            }
        }
    }
}
