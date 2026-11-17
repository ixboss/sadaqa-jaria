// ============================================================================
// SadaqaApp.kt — Application: seeds databases/sadaqa.db from assets on first
// run, opens the bundled SQLite (FTS5 via androidx.sqlite:sqlite-bundled),
// schedules adhan alarms, publishes widget state, sets theme state.
// ============================================================================

package app.sadaqa.android

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.data.WidgetNotifier
import app.sadaqa.android.platform.AdhanScheduler
import app.sadaqa.android.platform.WidgetStateBridge
import app.sadaqa.android.ui.ContextHolder
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File

class SadaqaApp : Application() {

    lateinit var db: SadaqaDb
        private set

    private val _themeKey = MutableStateFlow("dark")
    val themeKey: StateFlow<String> = _themeKey

    override fun onCreate() {
        super.onCreate()
        ContextHolder.app = this

        val dbFile = File(filesDir, "databases/sadaqa.db")
        db = SadaqaDb.open(dbFile) { assets.open("sadaqa.db").readBytes() }

        // theme from settings (web parity: theme ∈ dark|light|sepia|night)
        _themeKey.value = db.setting("theme")?.str ?: "dark"

        // keep widgets in sync on any settings/prayer write
        WidgetNotifier.prayersChanged = {
            WidgetStateBridge.publish(this, db)
            // Glance receivers recompute on their next update tick
        }
        WidgetStateBridge.publish(this, db)
        AdhanScheduler.scheduleNext(this, db)
    }

    fun setTheme(key: String) {
        _themeKey.value = key
        db.setSetting("theme", app.sadaqa.android.backup.JsonValue.Str(key))
        WidgetStateBridge.publish(this, db)
    }
}
