// ============================================================================
// SadaqaApp.kt — Application: seeds databases/sadaqa.db from assets on first
// run, opens the bundled SQLite (FTS5 via androidx.sqlite:sqlite-bundled),
// schedules adhan alarms, publishes widget state, sets theme state.
// ============================================================================

package app.sadaqa.android

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.data.WidgetNotifier
import app.sadaqa.android.platform.AdhanScheduler
import app.sadaqa.android.platform.WidgetStateBridge
import app.sadaqa.android.ui.ContextHolder
import app.sadaqa.android.ui.freshLocationOrNull
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class SadaqaApp : Application() {

    lateinit var db: SadaqaDb
        private set

    private val _themeKey = MutableStateFlow("dark")
    val themeKey: StateFlow<String> = _themeKey

    private val _fontScale = MutableStateFlow(1.0f)
    val fontScale: StateFlow<Float> = _fontScale

    override fun onCreate() {
        super.onCreate()
        ContextHolder.app = this

        val dbFile = File(filesDir, "databases/sadaqa.db")
        db = SadaqaDb.open(dbFile) { assets.open("sadaqa.db").readBytes() }

        // theme & font scale from settings
        _themeKey.value = db.setting("theme")?.str ?: "dark"
        _fontScale.value = (db.setting("font_scale")?.dbl?.toFloat() ?: 1.0f).coerceIn(0.8f, 2.0f)

        // keep widgets in sync on any settings/prayer write
        WidgetNotifier.prayersChanged = {
            WidgetStateBridge.publish(this, db)
            // Glance receivers recompute on their next update tick
        }
        WidgetStateBridge.publish(this, db)
        AdhanScheduler.scheduleNext(this, db)

        // Launch auto-city: only when location permission is ALREADY granted and
        // no city was ever chosen — silent, never prompts, never overrides a
        // manual pick (same policy as web/iOS).
        if (db.setting("location")?.obj?.get("cityId")?.dbl == null) {
            val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                // requestLocationUpdates needs a Looper thread → Main; heavy db work on IO
                CoroutineScope(Dispatchers.Main).launch {
                    val loc = freshLocationOrNull(this@SadaqaApp) ?: return@launch
                    val city = withContext(Dispatchers.IO) { db.findNearestCity(loc.latitude, loc.longitude) } ?: return@launch
                    // re-check: a manual pick made while the fix was in flight wins
                    if (db.setting("location")?.obj?.get("cityId")?.dbl != null) return@launch
                    withContext(Dispatchers.IO) { db.selectCity(city, gpsLat = loc.latitude, gpsLng = loc.longitude) }
                }
            }
        }
    }

    fun setTheme(key: String) {
        _themeKey.value = key
        db.setSetting("theme", app.sadaqa.android.backup.JsonValue.Str(key))
        WidgetStateBridge.publish(this, db)
    }

    fun setFontScale(scale: Float) {
        val clamped = scale.coerceIn(0.8f, 2.0f)
        _fontScale.value = clamped
        db.setSetting("font_scale", app.sadaqa.android.backup.JsonValue.Num(clamped.toDouble()))
    }
}
