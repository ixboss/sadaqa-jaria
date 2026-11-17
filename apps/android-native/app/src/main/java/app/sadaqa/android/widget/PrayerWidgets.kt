// ============================================================================
// PrayerWidgets.kt — Glance app widgets: prayer countdown + daily dhikr.
// Data: SharedPreferences (WidgetStateBridge) + recomputation via the SAME
// engine — offline, no db from the widget process. (Receivers must have a
// no-arg constructor; the db is opened read-only against the app's copy.)
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
import androidx.glance.layout.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.engine.EngineOptions
import app.sadaqa.android.engine.PrayerEngine
import app.sadaqa.android.engine.PrayerName
import java.io.File

/** Reads the app-published widget state; recomputes next prayer offline. */
object WidgetData {
    private fun dbFile(context: Context): File = File(context.filesDir, "databases/sadaqa.db")

    private fun readState(context: Context): Triple<Double, Double, String>? {
        val prefs = context.getSharedPreferences("widget-state", Context.MODE_PRIVATE)
        val loc = prefs.getString("location", null) ?: return null
        val parts = loc.split(";")
        if (parts.size < 3) return null
        return Triple(parts[0].toDoubleOrNull() ?: return null, parts[1].toDoubleOrNull() ?: return null, parts[2])
    }

    fun nextPrayer(context: Context): Pair<PrayerName, Long>? {
        val (lat, lng, tz) = readState(context) ?: return null
        val now = System.currentTimeMillis()
        val next = runCatching {
            PrayerEngine.next(now, EngineOptions(lat, lng, tz))
        }.getOrNull() ?: return null
        return next.name to next.at
    }

    fun dailyDhikr(context: Context): String {
        // deterministic daily pick: first morning-window item (web parity)
        return runCatching {
            val db = SadaqaDb.open(dbFile(context))
            val row = db.queryOne(
                "SELECT text_ar FROM athkar_items WHERE category_id = (SELECT category_id FROM athkar_categories WHERE solar_window = ? LIMIT 1) ORDER BY sort_order LIMIT 1",
                listOf("fajr"),
            )
            db.close()
            row?.strings?.get("text_ar") ?: ""
        }.getOrDefault("")
    }
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
    private fun Content(next: Pair<PrayerName, Long>?) {
        GlanceTheme {
            Column(
                modifier = GlanceModifier.fillMaxSize().background(ColorProvider(android.graphics.Color.argb(0xEE, 0x07, 0x16, 0x1B))).padding(10.dp),
                verticalAlignment = Alignment.Top,
                horizontalAlignment = Alignment.Start,
            ) {
                Text(
                    "الصلاة القادمة",
                    style = TextStyle(color = ColorProvider(android.graphics.Color.argb(0xFF, 0xA7, 0xB7, 0xBD)), fontSize = 11.sp),
                )
                if (next != null) {
                    Text(
                        next.first.labelAr,
                        style = TextStyle(color = ColorProvider(android.graphics.Color.argb(0xFF, 0xE7, 0xC1, 0x4C)), fontSize = 20.sp),
                    )
                    val zdt = java.time.Instant.ofEpochMilli(next.second).atZone(java.time.ZoneId.systemDefault())
                    Text(
                        "%02d:%02d".format(zdt.hour, zdt.minute),
                        style = TextStyle(color = ColorProvider(android.graphics.Color.WHITE), fontSize = 15.sp),
                    )
                } else {
                    Text(
                        "افتح التطبيق لضبط الموقع",
                        style = TextStyle(color = ColorProvider(android.graphics.Color.WHITE), fontSize = 12.sp),
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
                modifier = GlanceModifier.fillMaxSize().background(ColorProvider(android.graphics.Color.argb(0xEE, 0x07, 0x16, 0x1B))).padding(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    "ذكر اليوم",
                    style = TextStyle(color = ColorProvider(android.graphics.Color.argb(0xFF, 0xA7, 0xB7, 0xBD)), fontSize = 11.sp),
                )
                Text(
                    dhikr.ifEmpty { "أذكار الصباح" },
                    style = TextStyle(color = ColorProvider(android.graphics.Color.WHITE), fontSize = 13.sp),
                    maxLines = 5,
                )
            }
        }
    }
}
