// ============================================================================
// Screens.kt — Today Hub (hero countdown + §9 Smart Card + schedule), Athkar
// reader (tap-to-increment + ring + streaks), Tasbih (sync-first increment —
// the rapid-tap contract). All engine/db calls go through the Core ports.
// ============================================================================

package app.sadaqa.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.engine.*
import app.sadaqa.android.platform.Haptics
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.Instant
import java.time.format.DateTimeFormatter

// ---------------------------------------------------------------------------
// formatters (same shapes as the web screens)
// ---------------------------------------------------------------------------

fun isoOf(ms: Long, tz: String): String =
    DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneId.of(tz)).format(Instant.ofEpochMilli(ms))

fun clockOf(ms: Long, tz: String): String {
    val zdt = Instant.ofEpochMilli(ms).atZone(ZoneId.of(tz))
    return "%02d:%02d".format(zdt.hour, zdt.minute)
}

fun hmsOf(msLeft: Long): String {
    val s = maxOf(0, (msLeft / 1000).toInt())
    return "%02d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
}

fun dayKeyOf(ms: Long, tz: String): String = isoOf(ms, tz)

// ---------------------------------------------------------------------------
// Today Hub
// ---------------------------------------------------------------------------

@Composable
fun TodayScreen(db: SadaqaDb, onOpenTool: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val opts = db.engineOptions()
    val engine = PrayerEngine.bind(opts)
    val scope = rememberCoroutineScope()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(1000)
            now = System.currentTimeMillis() // format-only; engine values stay fixed
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        val hijri = HijriEngine.withAdjust(isoOf(now, opts.timeZone), db.hijriAdjust())
        Text("${HijriEngine.monthNameAr(hijri.m)} ${hijri.d} ${hijri.y} هـ", fontSize = 13.sp, color = theme.textSecondary)

        // hero — next prayer
        val next = remember(opts) { runCatching { engine.next(now) }.getOrNull() }
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                .background(theme.surface.copy(alpha = 0.5f)).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (next != null) {
                Text(next.name.labelAr, fontSize = 30.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary)
                Text(clockOf(next.at, opts.timeZone), fontSize = 26.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = theme.accent)
                Text(hmsOf(next.at - now), fontSize = 14.sp, color = theme.textSecondary)
            }
        }

        // Smart Context-Aware Card — the shared §9 resolver's verdict
        val card = remember(now / 60000) { SmartCardResolver.resolve(now, engine) }
        CardBox {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(card.badge, fontSize = 11.sp, color = theme.accent)
                    Text(card.title, fontSize = 17.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary)
                    Text(card.sub, fontSize = 13.sp, color = theme.textSecondary, lineHeight = 20.sp)
                    Button(colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast), onClick = {
                        when (card.actionScreen) {
                            "tools-qiyam", "tools-hijri" -> onOpenTool()
                            else -> scope.launch { AthkarNav.openCategory(db, card.kind.key) }
                        }
                    }) { Text(card.actionLabel) }
                }
                Text(card.icon, fontSize = 26.sp)
            }
        }

        // 6-row daily schedule, next highlighted
        val sched = remember(opts) { runCatching { engine.daySchedule(isoOf(now, opts.timeZone), opts) }.getOrNull() }
        if (sched != null) {
            CardBox {
                Column {
                    for (name in PrayerName.entries) {
                        val isNext = next?.name == name
                        Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) {
                            Text(name.labelAr, fontSize = 14.sp, color = if (isNext) theme.accent else theme.textPrimary, fontWeight = if (isNext) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Normal, modifier = Modifier.weight(1f))
                            Text(clockOf(sched.prayers.getValue(name), opts.timeZone), fontSize = 14.sp, color = if (isNext) theme.accent else theme.textSecondary)
                        }
                    }
                }
            }
        }

        // Qiyam windows (the night in progress)
        val wsNight = remember(opts) { runCatching { engine.sunnahWindows(isoOf(now - 86_400_000, opts.timeZone), opts) }.getOrNull() }
        if (wsNight != null) {
            CardBox {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("القيام", fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary)
                    Text("منتصف الليل: ${clockOf(wsNight.midnight, opts.timeZone)}", fontSize = 13.sp, color = theme.textSecondary)
                    Text("الثلث الأخير: ${clockOf(wsNight.lastThird, opts.timeZone)}", fontSize = 13.sp, color = theme.textSecondary)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun CardBox(content: @Composable ColumnScope.() -> Unit) {
    val theme = LocalSadaqaTheme.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
            .background(theme.surface).border(1.dp, theme.border, RoundedCornerShape(18.dp))
            .padding(16.dp),
        content = content,
    )
}

// ---------------------------------------------------------------------------
// Athkar (categories + reader)
// ---------------------------------------------------------------------------

/** Navigation bridge the smart card uses (screen names match the web contract). */
object AthkarNav {
    var pendingCategory: String? = null
    suspend fun openCategory(db: SadaqaDb, kind: String) {
        pendingCategory = when (kind) {
            "morning" -> db.firstCategoryByWindow("fajr")
            "evening" -> db.firstCategoryByWindow("asr")
            else -> db.firstCategoryByWindow("after_prayer")
        }
        pendingCategory?.let { Navigator.open("athkar-reader/$it") }
    }
}

private suspend fun SadaqaDb.firstCategoryByWindow(window: String): String? = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
    queryOne("SELECT category_id FROM athkar_categories WHERE solar_window = ? ORDER BY sort_order LIMIT 1", listOf(window))?.strings?.get("category_id")
}

@Composable
fun AthkarScreen(db: SadaqaDb) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    var categories by remember { mutableStateOf(listOf<Pair<String, String>>()) }
    var openReader by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        categories = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            db.query("SELECT category_id, name_ar, icon FROM athkar_categories ORDER BY sort_order")
                .map { (it.strings["category_id"] ?: "") to (it.strings["name_ar"] ?: "") }
        }
        // smart-card deep link
        AthkarNav.pendingCategory?.let { openReader = it; AthkarNav.pendingCategory = null }
        Navigator.current?.let { route ->
            if (route.startsWith("athkar-reader/")) openReader = route.substringAfter("athkar-reader/")
        }
    }

    if (openReader != null) {
        AthkarReaderScreen(db, openReader!!) { openReader = null }
        return
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Text("الأذكار", fontSize = 22.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary)
        for ((id, name) in categories) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(theme.surface).border(1.dp, theme.border, RoundedCornerShape(12.dp))
                    .clickable { openReader = id }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(name, fontSize = 15.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = theme.textPrimary, lineHeight = 22.sp, modifier = Modifier.weight(1f))
                Text("←", fontSize = 12.sp, color = theme.textSecondary)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun AthkarReaderScreen(db: SadaqaDb, categoryId: String, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    data class Item(val id: String, val text: String, val target: Int, val source: String?)
    var items by remember { mutableStateOf(listOf<Item>()) }
    var counts by remember { mutableStateOf(mapOf<String, Int>()) }

    LaunchedEffect(categoryId) {
        val day = dayKeyOf(System.currentTimeMillis(), "UTC") // local-day key (web parity: local date)
        val loaded = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val list = db.query("SELECT item_id, text_ar, count_target, source_ar FROM athkar_items WHERE category_id = ? ORDER BY sort_order", listOf(categoryId))
                .map { Item(it.strings["item_id"] ?: "", it.strings["text_ar"] ?: "", it.longs["count_target"]?.toInt() ?: 1, it.strings["source_ar"]) }
            val state = db.query("SELECT item_id, count FROM adhkar_state WHERE day_key = ?", listOf(day))
                .associate { (it.strings["item_id"] ?: "") to (it.longs["count"]?.toInt() ?: 0) }
            list to state
        }
        items = loaded.first
        counts = loaded.second
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("→", fontSize = 18.sp, color = theme.textSecondary, modifier = Modifier.clickable { onBack() }.padding(6.dp))
            Text("رجوع", fontSize = 13.sp, color = theme.textSecondary)
        }
        for (item in items) {
            val count = counts[item.id] ?: 0
            val done = item.target > 0 && count >= item.target
            val progress = if (item.target > 0) count.toFloat() / item.target else 0f
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(theme.surface)
                    .border(1.dp, if (done) theme.accent.copy(alpha = 0.55f) else theme.border, RoundedCornerShape(12.dp))
                    .clickable {
                        // synchronous local increment (rapid-tap contract)
                        val target = item.target
                        var c = counts[item.id] ?: 0
                        if (target != 0 && c >= target) return@clickable
                        c += 1
                        counts = counts + (item.id to c)
                        if (target > 0 && c == target) Haptics.complete(context) else Haptics.tick(context)
                        val now = System.currentTimeMillis()
                        val day = dayKeyOf(now, "UTC")
                        scope.launch {
                            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                                db.execute("INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at, updated_at = excluded.updated_at", listOf(item.id, day, c.toLong(), if (target > 0 && c >= target) now else null, now))
                                val kind = db.categoryStreakKind(categoryId)
                                if (kind != null && target > 0 && c >= target) {
                                    db.execute("INSERT OR REPLACE INTO streak_days (kind, day_key, done_at) VALUES (?, ?, ?)", listOf(kind, day, now))
                                }
                            }
                        }
                    }
                    .padding(16.dp),
            ) {
                Text(item.text, fontSize = 19.sp, color = theme.textPrimary, lineHeight = 30.sp)
                if (item.target > 0) {
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("$count", fontSize = 22.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.accent)
                        Text(" من ${item.target}", fontSize = 13.sp, color = theme.textSecondary)
                        Spacer(Modifier.weight(1f))
                        Box(
                            Modifier.size(46.dp).clip(CircleShape).background(theme.surfaceRaised),
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                Modifier.size(46.dp).clip(CircleShape).background(
                                    androidx.compose.ui.graphics.Brush.sweepGradient(
                                        0f to theme.accent,
                                        progress to theme.accent,
                                        progress to theme.surfaceRaised,
                                        1f to theme.surfaceRaised,
                                    ),
                                ),
                            )
                            Text("${minOf(count, item.target)}/${item.target}", fontSize = 11.sp, color = theme.textPrimary)
                        }
                    }
                }
                if (!item.source.isNullOrEmpty()) {
                    Text("التحقق: ${item.source}", fontSize = 12.sp, color = theme.textSecondary, lineHeight = 18.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

private suspend fun SadaqaDb.categoryStreakKind(categoryId: String): String? = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
    when (queryOne("SELECT solar_window FROM athkar_categories WHERE category_id = ?", listOf(categoryId))?.strings?.get("solar_window")) {
        "fajr" -> "adhkar_morning"
        "asr" -> "adhkar_evening"
        else -> null
    }
}

// ---------------------------------------------------------------------------
// Tasbih — dial with ring-to-target; LOCAL increment first (rapid taps),
// DB write behind it with count = count + 1 (never a stale absolute).
// ---------------------------------------------------------------------------

@Composable
fun TasbihScreen(db: SadaqaDb, onClose: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    data class Counter(val uuid: String, val label: String, val dhikr: String, val target: Int?, var count: Int, val lifetime: Int)
    var counters by remember { mutableStateOf(listOf<Counter>()) }
    var selected by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        counters = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            if (db.query("SELECT uuid FROM tasbih_counters WHERE deleted = 0").isEmpty()) {
                db.transaction {
                    for ((i, preset) in listOf(Triple("سبحان الله", 33), Triple("الحمد لله", 33), Triple("الله أكبر", 34)).withIndex()) {
                        db.execute("INSERT INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted) VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0)", listOf(UUID.randomUUID().let { app.sadaqa.android.backup.UUID7.uuid7() }, preset.first, preset.first, preset.second.toLong(), i.toLong(), System.currentTimeMillis()))
                    }
                }
            }
            db.query("SELECT * FROM tasbih_counters WHERE deleted = 0 ORDER BY sort_order").map {
                Counter(it.strings["uuid"] ?: "", it.strings["label_ar"] ?: "", it.strings["dhikr_text"] ?: "", it.longs["target"]?.toInt(), it.longs["count"]?.toInt() ?: 0, it.longs["total_lifetime"]?.toInt() ?: 0)
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("→", fontSize = 18.sp, color = theme.textSecondary, modifier = Modifier.clickable { onClose() }.padding(6.dp))
            Text("السبحة", fontSize = 22.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary)
        }
        val counter = counters.getOrNull(selected)
        if (counter != null) {
            val target = counter.target ?: 100
            val progress = ((counter.count % maxOf(target, 1)).toFloat()) / maxOf(target, 1)
            Box(
                Modifier.fillMaxWidth().padding(top = 10.dp).size(280.dp).clip(CircleShape)
                    .background(
                        androidx.compose.ui.graphics.Brush.sweepGradient(
                            0f to theme.accent,
                            progress to theme.accent,
                            progress to theme.surfaceRaised,
                            1f to theme.surfaceRaised,
                        ),
                    )
                    .clickable {
                        // THE rapid-tap contract: local count increments synchronously
                        val idx = counters.indexOfFirst { it.uuid == counter.uuid }
                        if (idx >= 0) {
                            val newCount = counters[idx].count + 1
                            counters = counters.toMutableList().also { it[idx] = counters[idx].copy(count = newCount) }
                            if (counter.target != null && newCount == counter.target) Haptics.complete(context) else Haptics.tick(context)
                            val cUuid = counter.uuid
                            val isComplete = counter.target != null && newCount == counter.target
                            scope.launch {
                                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                                    db.execute("UPDATE tasbih_counters SET count = count + 1, total_lifetime = total_lifetime + 1, updated_at = ? WHERE uuid = ?", listOf(System.currentTimeMillis(), cUuid))
                                    db.execute("INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, 1, ?)", listOf(app.sadaqa.android.backup.UUID7.uuid7(), cUuid, System.currentTimeMillis()))
                                    if (isComplete) {
                                        db.execute("INSERT OR IGNORE INTO streak_days (kind, day_key, done_at) VALUES ('tasbih', ?, ?)", listOf(dayKeyOf(System.currentTimeMillis(), "UTC"), System.currentTimeMillis()))
                                    }
                                }
                            }
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(220.dp).clip(CircleShape).background(theme.surface), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${counter.count}", fontSize = 52.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary)
                        Text(counter.dhikr, fontSize = 14.sp, color = theme.textSecondary)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                for ((i, c) in counters.withIndex()) {
                    Text(
                        c.label,
                        fontSize = 12.sp,
                        color = if (i == selected) theme.accentContrast else theme.textPrimary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(if (i == selected) theme.accent else theme.surface)
                            .clickable { selected = i }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                    )
                }
            }
            CardBox {
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Text("الإجمالي التاريخي", fontSize = 14.sp, color = theme.textPrimary, modifier = Modifier.weight(1f))
                    Text("${counter.lifetime}", fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** Minimal in-app navigation bridge (reader deep-links from the smart card). */
object Navigator {
    var current: String? = null
    fun open(route: String) { current = route }
}
