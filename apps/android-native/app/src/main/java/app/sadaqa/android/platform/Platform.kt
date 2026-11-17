// ============================================================================
// Platform.kt — haptics (VibrationEffect patterns from tokens.json), adhan
// scheduling (AlarmManager.setExactAndAllowWhileIdle + foreground service,
// per ARCHITECTURE §3: exact alarm + FGS), AudioStore (files dir + starter
// pack from assets), widget state (SharedPreferences for Glance receivers).
// ============================================================================

package app.sadaqa.android.platform

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import app.sadaqa.android.R
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.engine.PrayerName
import app.sadaqa.android.engine.PrayerEngine
import app.sadaqa.android.engine.PrayerEngine.daySchedule
import java.io.File
import java.time.format.DateTimeFormatter

// ---------------------------------------------------------------------------
// Haptics — token patterns (ms arrays) → VibrationEffect timings.
// ---------------------------------------------------------------------------

object Haptics {
    fun tick(context: Context) = play(context, listOf(10L))
    fun complete(context: Context) = play(context, listOf(20, 60, 20, 60, 40))
    fun categoryComplete(context: Context) = play(context, listOf(40, 120, 40, 120, 40))
    fun pageFlip(context: Context) = play(context, listOf(15L))
    fun bookmark(context: Context) = play(context, listOf(25, 60, 25))

    private fun play(context: Context, patternMs: List<Long>) {
        val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        if (!vibrator.hasVibrator()) return
        val timings = patternMs.flatMap { listOf(0L, it) }.toLongArray() // off/on pairs
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(timings, -1)
        }
    }
}

// ---------------------------------------------------------------------------
// Adhan scheduling — exact alarms → receiver → foreground service.
// ---------------------------------------------------------------------------

object AdhanScheduler {

    const val CHANNEL_ID = "adhan"
    private const val REQUEST_BASE = 0x5ADAA

    fun scheduleNext(context: Context, db: SadaqaDb) {
        val opts = db.engineOptions()
        val now = System.currentTimeMillis()
        val iso = isoOf(now, opts.timeZone)
        val sched = runCatching { daySchedule(iso, opts) }.getOrNull() ?: return
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return

        // notifications permission (API 33+) — requested by the UI at first run
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, context.getString(R.string.adhan_channel), NotificationManager.IMPORTANCE_HIGH),
        )

        val upcoming = PrayerName.entries
            .map { it to (sched.prayers[it] ?: 0L) }
            .filter { it.second > now }
            .sortedBy { it.second }
        for ((name, at) in upcoming) {
            val pi = PendingIntent.getBroadcast(
                context,
                REQUEST_BASE + name.ordinal,
                Intent(context, AdhanReceiver::class.java).putExtra("prayer", name.key),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            // exact alarm when the platform grants it; inexact fallback otherwise
            val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
            if (exact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        }
    }

    fun isoOf(ms: Long, tz: String): String =
        DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(java.time.ZoneId.of(tz))
            .format(java.time.Instant.ofEpochMilli(ms))

    fun cancelAll(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        for (name in PrayerName.entries) {
            val pi = PendingIntent.getBroadcast(
                context,
                REQUEST_BASE + name.ordinal,
                Intent(context, AdhanReceiver::class.java),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            if (pi != null) am.cancel(pi)
        }
    }
}

class AdhanReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prayer = intent.getStringExtra("prayer") ?: return
        val service = Intent(context, AdhanService::class.java).putExtra("prayer", prayer)
        context.startForegroundService(service)
    }
}

class AdhanService : Service() {

    private var player: MediaPlayer? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prayer = intent?.getStringExtra("prayer") ?: "fajr"
        startForeground(NOTIF_ID, buildNotification(prayer))
        playAdhan()
        return START_NOT_STICKY
    }

    private fun buildNotification(prayer: String): Notification {
        val label = PrayerName.of(prayer)?.labelAr ?: prayer
        return NotificationCompat.Builder(this, AdhanScheduler.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("الأذان — $label")
            .setContentText("حان الآن وقت صلاة $label")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .build()
    }

    private fun playAdhan() {
        val uri = bundledAdhanUri() ?: return
        player = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            setDataSource(this@AdhanService, uri)
            setOnCompletionListener {
                stopSelf()
            }
            runCatching { prepare(); start() }.onFailure { stopSelf() }
        }
    }

    /** Bundled adhan clip from assets (shipped by the sync script). */
    private fun bundledAdhanUri(): Uri? = runCatching {
        val file = File(getExternalFilesDir(null), "adhan.mp3").takeIf { it.exists() }
            ?: return@runCatching null
        Uri.fromFile(file)
    }.getOrNull()

    override fun onDestroy() {
        player?.release()
        player = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?) = null

    private companion object {
        const val NOTIF_ID = 0xADA
    }
}

// ---------------------------------------------------------------------------
// AudioStore — per-ayah files under filesDir/audio/<reciter>/; starter pack
// (Fatiha · Alafasy) resolved from assets on first play (offline on boot).
// ---------------------------------------------------------------------------

object AudioStore {
    private fun baseDir(context: Context) = File(context.filesDir, "audio").apply { mkdirs() }

    /** Resolve local audio for an ayah: downloads dir → bundled starter → null. */
    fun localFile(context: Context, reciter: String, surah: Int, ayah: Int): File? {
        val key = "%03d%03d.mp3".format(surah, ayah)
        val downloaded = File(baseDir(context), "$reciter/$key")
        if (downloaded.exists()) return downloaded
        val starter = File(context.filesDir, "starter/alafasy/$key")
        if (!starter.exists()) {
            runCatching {
                context.assets.open("audio/starter/alafasy/$key").use { input ->
                    starter.parentFile?.mkdirs()
                    starter.outputStream().use { input.copyTo(it) }
                }
            }
        }
        return starter.takeIf { it.exists() }
    }

    fun store(context: Context, data: ByteArray, reciter: String, surah: Int, ayah: Int) {
        val dir = File(baseDir(context), reciter).apply { mkdirs() }
        File(dir, "%03d%03d.mp3".format(surah, ayah)).writeBytes(data)
    }
}

/** MediaPlayer chain with next-ayah callback (web player parity). */
class PlayerChain {
    private var player: MediaPlayer? = null
    private var onEnd: (() -> Unit)? = null

    fun play(file: File, onEnd: () -> Unit) {
        stop()
        this.onEnd = onEnd
        player = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            setDataSource(file.absolutePath)
            setOnCompletionListener { onEnd() }
            prepareAsync()
            setOnPreparedListener { it.start() }
        }
    }

    fun stop() {
        player?.run { runCatching { stop(); release() } }
        player = null
        this.onEnd = null
    }
}

// ---------------------------------------------------------------------------
// Widget state — app → widgets via SharedPreferences (Glance receivers read
// the same keys; recomputation happens with the same engine, offline).
// ---------------------------------------------------------------------------

object WidgetStateBridge {
    private const val PREFS = "widget-state"

    fun publish(context: Context, db: SadaqaDb) {
        val opts = db.engineOptions()
        val now = System.currentTimeMillis()
        val next = runCatching { PrayerEngine.next(now, opts) }.getOrNull()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("location", "%f;%f;%s;%s;%s;%s".format(opts.lat, opts.lng, opts.timeZone, opts.method, opts.madhab, opts.highLatitudeRule))
            .putString("next", next?.let { "${it.name.key};${it.at}" })
            .putLong("publishedAt", now)
            .putString("day", isoOf(now, opts.timeZone))
            .apply()
    }
}
