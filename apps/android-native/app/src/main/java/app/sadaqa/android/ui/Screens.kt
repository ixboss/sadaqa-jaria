// ============================================================================
// Screens.kt — Today Hub (hero countdown + §9 Smart Card + schedule), Athkar
// reader (tap-to-increment + ring + streaks), Tasbih (sync-first increment —
// the rapid-tap contract). All engine/db calls go through the Core ports.
// ============================================================================

package app.sadaqa.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.sadaqa.android.backup.JsonValue
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.engine.*
import app.sadaqa.android.platform.Haptics
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
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
fun TodayScreen(db: SadaqaDb, onOpenTool: () -> Unit, onNavigate: (String) -> Unit = {}) {
    val theme = LocalSadaqaTheme.current
    var opts by remember { mutableStateOf(db.engineOptions()) }
    val engine = PrayerEngine.bind(opts)
    val scope = rememberCoroutineScope()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var showCityPicker by remember { mutableStateOf(false) }
    var showMonthSchedule by remember { mutableStateOf(false) }
    var cityName by remember {
        mutableStateOf(
            db.setting("location")?.get("name_ar")?.str ?: "مكة المكرمة"
        )
    }
    val currentPage = remember { (db.setting("mushaf_page")?.dbl?.toInt() ?: 1).coerceIn(1, 604) }

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
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("اليوم", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                Text("${hijri.d} ${HijriEngine.monthNameAr(hijri.m)} ${hijri.y} هـ · ${isoOf(now, opts.timeZone)}", fontSize = 12.sp, color = theme.textSecondary)
            }
            Text(
                "📍 $cityName",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = theme.accent,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(theme.surface)
                    .border(1.dp, theme.border, RoundedCornerShape(50))
                    .clickable { showCityPicker = true }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }

        // hero — next prayer
        val next = remember(opts) { runCatching { engine.next(now) }.getOrNull() }
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                .background(Brush.verticalGradient(listOf(theme.accent.copy(alpha = 0.14f), theme.surface)))
                .border(1.dp, theme.accent.copy(alpha = 0.32f), RoundedCornerShape(18.dp))
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("الصلاة القادمة", fontSize = 12.sp, color = theme.textSecondary)
            if (next != null) {
                Text(next.name.labelAr, fontSize = 32.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                Text(hmsOf(next.at - now), fontSize = 28.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                Text("الأذان ${clockOf(next.at, opts.timeZone)}", fontSize = 13.sp, color = theme.textSecondary)
            }
        }

        // Smart Context-Aware Card — the shared §9 resolver's verdict
        val card = remember(now / 60000, opts) { SmartCardResolver.resolve(now, engine) }
        CardBox {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(card.badge, fontSize = 11.sp, color = theme.accent)
                    Text(card.title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                    Text(card.sub, fontSize = 13.sp, color = theme.textSecondary, lineHeight = 20.sp)
                    Button(colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast), onClick = {
                        when (card.actionScreen) {
                            "mushaf-page" -> onNavigate("mushaf")
                            "tools-qiyam", "tools-hijri" -> onOpenTool()
                            else -> scope.launch { AthkarNav.openCategory(db, card.kind.key); onNavigate("athkar") }
                        }
                    }) { Text(card.actionLabel) }
                }
                Text(card.icon, fontSize = 26.sp)
            }
        }

        // 6-prayer 3-column grid, next highlighted + month schedule trigger
        val sched = remember(opts) { runCatching { engine.daySchedule(isoOf(now, opts.timeZone)) }.getOrNull() }
        if (sched != null) {
            CardBox {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("مواقيت اليوم", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, modifier = Modifier.weight(1f))
                        Text(
                            "جدول الشهر",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = theme.accent,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(theme.surfaceRaised)
                                .clickable { showMonthSchedule = true }.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                    val icons = mapOf(
                        PrayerName.FAJR to "🌅", PrayerName.SUNRISE to "☀️", PrayerName.DHUHR to "🌤️",
                        PrayerName.ASR to "🌇", PrayerName.MAGHRIB to "🌆", PrayerName.ISHA to "🌙",
                    )
                    for (chunk in PrayerName.entries.chunked(3)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (name in chunk) {
                                val isNext = next?.name == name
                                Column(
                                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                                        .background(if (isNext) theme.accent.copy(alpha = 0.14f) else theme.surfaceRaised)
                                        .border(1.dp, if (isNext) theme.accent.copy(alpha = 0.45f) else Color.Transparent, RoundedCornerShape(12.dp))
                                        .padding(vertical = 10.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(icons[name] ?: "🕌", fontSize = 15.sp)
                                    Text(name.labelAr, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = if (isNext) theme.accent else theme.textSecondary)
                                    Text(clockOf(sched.prayers.getValue(name), opts.timeZone), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = if (isNext) theme.accent else theme.textPrimary)
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4-column Quick Apps Grid
        CardBox {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("تطبيقاتك اليومية", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((ico, label, targetTab) in listOf(
                        Triple("📿", "السبحة", "tools"),
                        Triple("🤲", "الأذكار", "athkar"),
                        Triple("📖", "المصحف", "mushaf"),
                        Triple("🧭", "القبلة", "tools"),
                    )) {
                        Column(
                            Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(theme.surfaceRaised)
                                .clickable { onNavigate(targetTab) }.padding(vertical = 10.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(ico, fontSize = 20.sp)
                            Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary)
                        }
                    }
                }
            }
        }

        // Qiyam windows (the night in progress)
        val wsNight = remember(opts) { runCatching { engine.sunnahWindows(isoOf(now - 86_400_000, opts.timeZone)) }.getOrNull() }
        if (wsNight != null) {
            CardBox {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("قيام الليل", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                    Text("منتصف الليل: ${clockOf(wsNight.midnight, opts.timeZone)}", fontSize = 13.sp, color = theme.textSecondary)
                    Text("الثلث الأخير: ${clockOf(wsNight.lastThird, opts.timeZone)} — حتى الفجر ${clockOf(wsNight.nextFajr, opts.timeZone)}", fontSize = 13.sp, color = theme.textSecondary)
                }
            }
        }

        // Khatmah follow-up card
        CardBox {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("متابعة المصحف", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                        Text("وصلت إلى صفحة $currentPage من ٦٠٤", fontSize = 12.sp, color = theme.textSecondary)
                    }
                    Text(
                        "${((currentPage / 604.0) * 100).toInt()}٪",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = theme.accent,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(theme.accent.copy(alpha = 0.14f)).padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
                Button(
                    onClick = { onNavigate("mushaf") },
                    colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("تابع القراءة — صفحة $currentPage") }
            }
        }
        Spacer(Modifier.height(24.dp))
    }

    if (showCityPicker) {
        var q by remember { mutableStateOf("") }
        var cities by remember { mutableStateOf(listOf<Map<String, Any>>()) }
        LaunchedEffect(q) {
            if (q.trim().length < 2) { cities = emptyList(); return@LaunchedEffect }
            val term = q.trim().split(" ").filter { it.isNotBlank() }.joinToString(" ") { "\"$it\"" }
            cities = withContext(Dispatchers.IO) {
                db.query(
                    "SELECT c.city_id, c.name_ar, c.country_ar, c.lat, c.lng, c.timezone FROM cities c WHERE c.rowid IN (SELECT rowid FROM fts_cities WHERE fts_cities MATCH ?) LIMIT 12",
                    listOf(term),
                ).map {
                    mapOf(
                        "name" to (it.strings["name_ar"] ?: ""),
                        "country" to (it.strings["country_ar"] ?: ""),
                        "lat" to (it.doubles["lat"] ?: 21.4225),
                        "lng" to (it.doubles["lng"] ?: 39.8262),
                        "tz" to (it.strings["timezone"] ?: "Asia/Riyadh"),
                    )
                }
            }
        }
        AlertDialog(
            onDismissRequest = { showCityPicker = false },
            containerColor = theme.surface,
            title = { Text("تحديد المدينة (٦,٢٨٩ مدينة)", color = theme.textPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextField(value = q, onValueChange = { q = it }, placeholder = { Text("ابحث باسم المدينة…") }, singleLine = true)
                    Column(Modifier.heightIn(max = 260.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (c in cities) {
                            val name = c["name"] as? String ?: ""
                            val country = c["country"] as? String ?: ""
                            val lat = c["lat"] as? Double ?: 21.4225
                            val lng = c["lng"] as? Double ?: 39.8262
                            val tz = c["tz"] as? String ?: "Asia/Riyadh"
                            Column(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised)
                                    .clickable {
                                        scope.launch {
                                            withContext(Dispatchers.IO) {
                                                db.setSetting("location", JsonValue.Obj(mapOf(
                                                    "lat" to JsonValue.Num(lat),
                                                    "lng" to JsonValue.Num(lng),
                                                    "timeZone" to JsonValue.Str(tz),
                                                    "name_ar" to JsonValue.Str(name),
                                                )))
                                            }
                                            opts = db.engineOptions()
                                            cityName = name
                                            showCityPicker = false
                                        }
                                    }.padding(10.dp),
                            ) {
                                Text(name, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                                Text("$country · $tz", fontSize = 11.sp, color = theme.textSecondary)
                            }
                        }
                    }
                }
            },
            confirmButton = { Button(onClick = { showCityPicker = false }) { Text("إغلاق") } },
        )
    }

    if (showMonthSchedule) {
        AlertDialog(
            onDismissRequest = { showMonthSchedule = false },
            containerColor = theme.surface,
            title = { Text("جدول ٣٠ يوماً", color = theme.textPrimary) },
            text = {
                Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (offset in 0 until 30) {
                        val ms = now + offset * 86_400_000L
                        val iso = isoOf(ms, opts.timeZone)
                        val s = runCatching { engine.daySchedule(iso) }.getOrNull()
                        if (s != null) {
                            Row(Modifier.fillMaxWidth()) {
                                Text(iso.drop(5), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = theme.accent, modifier = Modifier.width(44.dp))
                                for (p in listOf(PrayerName.FAJR, PrayerName.DHUHR, PrayerName.ASR, PrayerName.MAGHRIB, PrayerName.ISHA)) {
                                    Text(clockOf(s.prayers.getValue(p), opts.timeZone), fontSize = 11.sp, color = theme.textPrimary, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = { Button(onClick = { showMonthSchedule = false }) { Text("إغلاق") } },
        )
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
    data class CatRow(val id: String, val name: String, val window: String, val count: Int)
    var categories by remember { mutableStateOf(listOf<CatRow>()) }
    var openReader by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var windowFilter by remember { mutableStateOf("all") }

    LaunchedEffect(Unit) {
        categories = withContext(Dispatchers.IO) {
            db.query("SELECT c.category_id, c.name_ar, c.solar_window, (SELECT COUNT(*) FROM athkar_items i WHERE i.category_id = c.category_id) AS items FROM athkar_categories c ORDER BY c.sort_order")
                .map {
                    CatRow(
                        id = it.strings["category_id"] ?: "",
                        name = it.strings["name_ar"] ?: "",
                        window = it.strings["solar_window"] ?: "general",
                        count = it.longs["items"]?.toInt() ?: 0,
                    )
                }
        }
        // smart-card deep link
        AthkarNav.pendingCategory?.let { openReader = it; AthkarNav.pendingCategory = null }
        Navigator.current?.let { route ->
            if (route.startsWith("athkar-reader/")) openReader = route.substringAfter("athkar-reader/")
        }
    }

    openReader?.let { catId ->
        AthkarReaderScreen(db, catId) { openReader = null }
        return
    }

    fun iconForWindow(w: String): String = when (w) {
        "fajr" -> "🌅"
        "asr" -> "🌇"
        "night" -> "🌙"
        "duha" -> "☀️"
        "after_prayer" -> "🕌"
        else -> "📿"
    }

    val morning = categories.firstOrNull { it.window == "fajr" }
    val evening = categories.firstOrNull { it.window == "asr" && it.name.contains("المَسَاء") } ?: categories.firstOrNull { it.window == "asr" }
    val afterPrayer = categories.firstOrNull { it.window == "after_prayer" }
    val sleep = categories.firstOrNull { it.name.contains("النَّوْم") || it.name.contains("النوم") } ?: categories.firstOrNull { it.window == "night" }

    val filtered = categories.filter { c ->
        (windowFilter == "all" || c.window == windowFilter) && (query.isBlank() || c.name.contains(query.trim()))
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Text("الأذكار", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)

        // Featured 2-column dashboard
        val featured = listOfNotNull(
            morning?.let { Triple(it.id, "🌅 أذكار الصباح", "${it.count} ذكراً") },
            evening?.let { Triple(it.id, "🌇 أذكار المساء", "${it.count} ذكراً") },
            afterPrayer?.let { Triple(it.id, "🕌 أذكار بعد الصلاة", "${it.count} ذكراً") },
            sleep?.let { Triple(it.id, "🌙 أذكار النوم", "${it.count} ذكراً") },
        )
        for (pair in featured.chunked(2)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for ((id, title, sub) in pair) {
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(theme.surface)
                            .border(1.dp, theme.border, RoundedCornerShape(16.dp))
                            .clickable { openReader = id }.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                        Text(sub, fontSize = 11.sp, color = theme.textSecondary)
                    }
                }
            }
        }

        TextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("ابحث في أقسام حصن المسلم…") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((k, label) in listOf("all" to "الكل", "fajr" to "الصباح", "asr" to "المساء", "after_prayer" to "بعد الصلاة", "night" to "النوم والليل")) {
                val active = windowFilter == k
                Text(
                    label,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (active) theme.accentContrast else theme.textSecondary,
                    modifier = Modifier.clip(RoundedCornerShape(50))
                        .background(if (active) theme.accent else theme.surface)
                        .border(1.dp, theme.border, RoundedCornerShape(50))
                        .clickable { windowFilter = k }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }

        for (c in filtered) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                    .background(theme.surface).border(1.dp, theme.border, RoundedCornerShape(14.dp))
                    .clickable { openReader = c.id }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(iconForWindow(c.window), fontSize = 20.sp)
                Column(Modifier.weight(1f)) {
                    Text(c.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary, lineHeight = 22.sp)
                    Text("${c.count} ${if (c.count == 1) "ذكر" else "أذكار"}", fontSize = 11.sp, color = theme.textSecondary)
                }
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
    var categoryName by remember { mutableStateOf("الأذكار") }
    var items by remember { mutableStateOf(listOf<Item>()) }
    var counts by remember { mutableStateOf(mapOf<String, Int>()) }

    LaunchedEffect(categoryId) {
        val day = dayKeyOf(System.currentTimeMillis(), "UTC") // local-day key (web parity: local date)
        val loaded = withContext(Dispatchers.IO) {
            categoryName = db.queryOne("SELECT name_ar FROM athkar_categories WHERE category_id = ?", listOf(categoryId))?.strings?.get("name_ar") ?: "الأذكار"
            val list = db.query("SELECT item_id, text_ar, count_target, source_ar FROM athkar_items WHERE category_id = ? ORDER BY sort_order", listOf(categoryId))
                .map { Item(it.strings["item_id"] ?: "", it.strings["text_ar"] ?: "", it.longs["count_target"]?.toInt() ?: 1, it.strings["source_ar"]) }
            val state = db.query("SELECT item_id, count FROM adhkar_state WHERE day_key = ?", listOf(day))
                .associate { (it.strings["item_id"] ?: "") to (it.longs["count"]?.toInt() ?: 0) }
            list to state
        }
        items = loaded.first
        counts = loaded.second
    }

    val doneTotal = items.count { it -> val c = counts[it.id] ?: 0; if (it.target > 0) c >= it.target else c > 0 }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("→", fontSize = 18.sp, color = theme.textSecondary, modifier = Modifier.clickable { onBack() }.padding(6.dp))
            Text(categoryName, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, modifier = Modifier.weight(1f))
            Text("$doneTotal / ${items.size}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = theme.accent)
        }
        LinearProgressIndicator(
            progress = { if (items.isEmpty()) 0f else doneTotal.toFloat() / items.size },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)),
            color = theme.accent,
            trackColor = theme.surfaceRaised,
        )
        for (item in items) {
            val count = counts[item.id] ?: 0
            val done = if (item.target > 0) count >= item.target else count > 0
            val progress = if (item.target > 0) (count.toFloat() / item.target).coerceIn(0f, 1f) else if (done) 1f else 0f
            Column(
                Modifier.fillMaxWidth().defaultMinSize(minHeight = 160.dp).clip(RoundedCornerShape(16.dp))
                    .background(theme.surface)
                    .border(1.dp, if (done) theme.accent.copy(alpha = 0.6f) else theme.border, RoundedCornerShape(16.dp))
                    .clickable {
                        // synchronous local increment (rapid-tap contract)
                        val target = item.target
                        val cur = counts[item.id] ?: 0
                        if (target > 0 && cur >= target) return@clickable
                        val c = cur + 1
                        counts = counts + (item.id to c)
                        if (target > 0 && c == target) Haptics.complete(context) else Haptics.tick(context)
                        val now = System.currentTimeMillis()
                        val day = dayKeyOf(now, "UTC")
                        scope.launch {
                            withContext(Dispatchers.IO) {
                                db.incrementDhikrTap(item.id, categoryId, cur, target, day, now)
                            }
                        }
                    }
                    .padding(18.dp),
            ) {
                Text(item.text, fontSize = 21.sp, color = theme.textPrimary, lineHeight = 34.sp)
                if (item.target > 0) {
                    Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("$count", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                        Text(" من ${item.target}", fontSize = 13.sp, color = theme.textSecondary)
                        Spacer(Modifier.weight(1f))
                        Box(
                            Modifier.size(46.dp).clip(CircleShape).background(theme.surfaceRaised),
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                Modifier.size(46.dp).clip(CircleShape).background(
                                    Brush.sweepGradient(
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
            db.ensureDefaultTasbihPresets(System.currentTimeMillis())
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
                            val targetVal = counter.target
                            val now = System.currentTimeMillis()
                            val day = dayKeyOf(now, "UTC")
                            scope.launch {
                                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                                    db.recordTasbihTap(cUuid, targetVal, newCount, day, now)
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
