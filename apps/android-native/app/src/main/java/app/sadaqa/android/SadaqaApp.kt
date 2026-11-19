// ============================================================================
// SadaqaApp.kt — Application: seeds databases/sadaqa.db from assets on first
// run, opens the bundled SQLite (FTS5 via androidx.sqlite:sqlite-bundled),
// schedules adhan alarms, publishes widget state, sets theme state.
// ============================================================================

package app.sadaqa.android

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.glance.appwidget.updateAll
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.data.WidgetNotifier
import app.sadaqa.android.platform.AdhanScheduler
import app.sadaqa.android.platform.WidgetStateBridge
import app.sadaqa.android.ui.ContextHolder
import app.sadaqa.android.ui.freshLocationOrNull
import app.sadaqa.android.widget.DhikrWidget
import app.sadaqa.android.widget.PrayerCountdownWidget
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class SadaqaApp : Application() {

    sealed interface DbState {
        data object Loading : DbState
        data class Ready(val db: SadaqaDb) : DbState
        data class Failed(val message: String) : DbState
    }

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val dbDeferred = CompletableDeferred<SadaqaDb?>()

    private val _dbState = MutableStateFlow<DbState>(DbState.Loading)
    val dbState: StateFlow<DbState> = _dbState

    private val _themeKey = MutableStateFlow("dark")
    val themeKey: StateFlow<String> = _themeKey

    private val _fontScale = MutableStateFlow(1.0f)
    val fontScale: StateFlow<Float> = _fontScale

    suspend fun awaitDbOrNull(): SadaqaDb? = dbDeferred.await()

    override fun onCreate() {
        super.onCreate()
        ContextHolder.app = this

        appScope.launch {
            val dbFile = File(filesDir, "databases/sadaqa.db")
            val opened = runCatching {
                SadaqaDb.openWithStream(dbFile) { assets.open("sadaqa.db") }
            }
            val database = opened.getOrElse { err ->
                _dbState.value = DbState.Failed(err.message ?: "تعذر فتح قاعدة البيانات")
                dbDeferred.complete(null)
                return@launch
            }

            refreshPreferencesFromDb(database)

            WidgetNotifier.prayersChanged = {
                appScope.launch {
                    WidgetStateBridge.publish(this@SadaqaApp, database)
                    runCatching { PrayerCountdownWidget.updateAll(this@SadaqaApp) }
                    runCatching { DhikrWidget.updateAll(this@SadaqaApp) }
                    runCatching { AdhanScheduler.scheduleNext(this@SadaqaApp, database) }
                }
            }
            WidgetStateBridge.publish(this@SadaqaApp, database)
            runCatching { PrayerCountdownWidget.updateAll(this@SadaqaApp) }
            runCatching { DhikrWidget.updateAll(this@SadaqaApp) }
            AdhanScheduler.scheduleNext(this@SadaqaApp, database)

            _dbState.value = DbState.Ready(database)
            dbDeferred.complete(database)

            // Launch auto-city: only when location permission is ALREADY granted and
            // no city was ever chosen — silent, never prompts, never overrides a
            // manual pick (same policy as web/iOS).
            if (database.setting("location")?.obj?.get("cityId")?.dbl == null) {
                val granted = ContextCompat.checkSelfPermission(this@SadaqaApp, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(this@SadaqaApp, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    // requestLocationUpdates needs a Looper thread → Main; heavy db work on IO
                    withContext(Dispatchers.Main) {
                        val loc = freshLocationOrNull(this@SadaqaApp) ?: return@withContext
                        val city = withContext(Dispatchers.IO) { database.findNearestCity(loc.latitude, loc.longitude) } ?: return@withContext
                        if (database.setting("location")?.obj?.get("cityId")?.dbl != null) return@withContext
                        withContext(Dispatchers.IO) { database.selectCity(city, gpsLat = loc.latitude, gpsLng = loc.longitude) }
                    }
                }
            }
        }
    }

    fun refreshPreferencesFromDb(database: SadaqaDb) {
        _themeKey.value = database.setting("theme")?.str ?: "dark"
        _fontScale.value = (database.setting("font_scale")?.dbl?.toFloat() ?: 1.0f).coerceIn(0.8f, 2.0f)
    }

    fun setTheme(key: String) {
        _themeKey.value = key
        val database = (dbState.value as? DbState.Ready)?.db ?: return
        database.setSetting("theme", app.sadaqa.android.backup.JsonValue.Str(key))
        WidgetStateBridge.publish(this, database)
    }

    fun setFontScale(scale: Float) {
        val clamped = scale.coerceIn(0.8f, 2.0f)
        _fontScale.value = clamped
        val database = (dbState.value as? DbState.Ready)?.db ?: return
        database.setSetting("font_scale", app.sadaqa.android.backup.JsonValue.Num(clamped.toDouble()))
    }
}
