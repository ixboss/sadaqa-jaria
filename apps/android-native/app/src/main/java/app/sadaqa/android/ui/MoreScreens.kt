// ============================================================================
// MoreScreens.kt — Mushaf (per-page QPC fonts + LTR-isolated BSML), Tools
// (Qibla compass / Hijri calendar / Zakat / Qiyam / Settings), Backup (.sadaqa
// SAF export + import Merge/Replace), Audio (pack catalog + starter playback),
// Search (FTS5 vocalized). Engine/db calls go through the Core ports only.
// ============================================================================

package app.sadaqa.android.ui

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.sadaqa.android.backup.CanonicalJson
import app.sadaqa.android.backup.JsonValue
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.engine.*
import app.sadaqa.android.platform.AudioStore
import app.sadaqa.android.platform.Haptics
import app.sadaqa.android.platform.PlayerChain
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

// ---------------------------------------------------------------------------
// Mushaf — 604 page plates from v_page_words (golden data), per-page QPC1
// subset font, BSML lines rendered LTR-isolated (visual-order glyphs).
// ---------------------------------------------------------------------------

@Composable
fun MushafScreen(db: SadaqaDb) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    var page by remember { mutableIntStateOf(1) }
    var lines by remember { mutableStateOf(listOf<Triple<String, String, List<String>>>()) } // (kind, text, wordGlyphs)

    LaunchedEffect(page) {
        withContext(Dispatchers.IO) {
            val rows = db.query("SELECT line_number, kind, glyphs_qpc, text_ar FROM mushaf_lines WHERE page_number = ? ORDER BY line_number", listOf(page.toLong()))
            val words = db.query("SELECT line_number, glyphs_qpc FROM v_page_words WHERE page_number = ? ORDER BY line_number, line_position", listOf(page.toLong()))
            val byLine = words.groupBy { it.longs["line_number"]?.toInt() ?: 0 }.mapValues { (_, v) -> v.mapNotNull { it.strings["glyphs_qpc"] } }
            lines = (1..15).map { line ->
                val deco = rows.firstOrNull { (it.longs["line_number"]?.toInt() ?: 0) == line }
                val plates = byLine[line] ?: emptyList()
                when {
                    deco != null && deco.strings["kind"] == "bismillah" ->
                        Triple("bismillah", deco.strings["glyphs_qpc"] ?: "", emptyList())
                    deco != null && deco.strings["kind"] == "surah_name" ->
                        Triple("surah_name", deco.strings["text_ar"] ?: "", emptyList())
                    plates.isNotEmpty() -> Triple("text", "", plates)
                    else -> Triple("blank", "", emptyList())
                }
            }
        }
        Haptics.pageFlip(context)
    }

    Column(
        Modifier.fillMaxSize().background(theme.mushafBg),
    ) {
        Text("صفحة $page", fontSize = 13.sp, color = theme.textSecondary, modifier = Modifier.padding(top = 8.dp))
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp, vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            for ((kind, text, words) in lines) {
                when (kind) {
                    "bismillah" -> Text(
                        text,
                        fontFamily = QpcFonts.basmala(context),
                        fontSize = 22.sp,
                        color = theme.mushafText,
                        textAlign = TextAlign.Left, // LTR isolation for visual-order BSML glyphs
                        modifier = Modifier.fillMaxWidth(),
                    )
                    "surah_name" -> Text(text, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.mushafText)
                    "text" -> Text(
                        words.joinToString(" "),
                        fontFamily = QpcFonts.mushaf(context, page),
                        fontSize = (20 * 1.3).sp,
                        color = theme.mushafText,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            // page flip controls (swipe/flip parity: tap-thirds + buttons)
            Row(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                Button(onClick = { if (page < 604) page += 1 }) { Text("التالية") }
                Button(onClick = { if (page > 1) page -= 1 }) { Text("السابقة") }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tools hub + Qibla + Hijri + Zakat + Qiyam + Settings + Backup + Audio
// ---------------------------------------------------------------------------

@Composable
fun ToolsScreen(db: SadaqaDb) {
    val theme = LocalSadaqaTheme.current
    var sub by remember { mutableStateOf<String?>(null) }

    if (sub == "qibla") return QiblaScreen(db) { sub = null }
    if (sub == "hijri") return HijriScreen(db) { sub = null }
    if (sub == "zakat") return ZakatScreen(db) { sub = null }
    if (sub == "qiyam") return QiyamScreen(db) { sub = null }
    if (sub == "backup") return BackupScreen(db) { sub = null }
    if (sub == "settings") return SettingsScreen(db) { sub = null }
    if (sub == "audio") return AudioScreen(db) { sub = null }
    if (sub == "tasbih") return TasbihScreen(db) { sub = null }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Text("الأدوات", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
        for ((key, name, sub2) in listOf(
            Triple("qibla", "القبلة", "بوصلة محددة القبلة"),
            Triple("hijri", "التقويم الهجري", "الأيام البيضاء والمناسبات"),
            Triple("zakat", "حاسبة الزكاة", "الذهب والفضة والنقود"),
            Triple("qiyam", "حاسبة القيام", "منتصف الليل والثلث الأخير"),
            Triple("tasbih", "السبحة", "السبحة الإلكترونية"),
            Triple("backup", "النسخ الاحتياطي", "ملف .sadaqa — دمج أو استبدال"),
            Triple("audio", "التلاوة", "الحزم الصوتية والتشغيل"),
            Triple("settings", "الإعدادات", "المظهر والموقع وطريقة الحساب"),
        )) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(theme.surface).border(1.dp, theme.border, RoundedCornerShape(12.dp))
                    .clickable { sub = key }.padding(16.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary)
                    Text(sub2, fontSize = 12.sp, color = theme.textSecondary)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun SubHeader(title: String, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 8.dp)) {
        Text("→", fontSize = 18.sp, color = theme.textSecondary, modifier = Modifier.clickable { onBack() }.padding(6.dp))
        Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
    }
}

// Qibla — engine bearing + manual dial fallback (sensor compass behind a
// capability check; emulator/desktop CI runs never have one).
@Composable
fun QiblaScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val opts = db.engineOptions()
    val bearing = remember(opts) { QiblaEngine.qiblaBearing(opts.lat, opts.lng) }
    var offset by remember { mutableDoubleStateOf(0.0) }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SubHeader("القبلة", onBack)
        Box(Modifier.size(280.dp).clip(CircleShape).border(1.dp, theme.border, CircleShape), contentAlignment = Alignment.Center) {
            Text("🕋", fontSize = 26.sp, color = theme.accent, modifier = Modifier.offset(y = (-92).dp).rotate((bearing - offset).toFloat()))
        }
        Text("${(((bearing - offset) % 360 + 360) % 360).toInt()}°", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = { offset -= 1.0 }) { Text("−1°") }
            Button(onClick = { offset += 1.0 }) { Text("+1°") }
        }
        Text("الاتجاه من موقعك إلى الكعبة: %.1f°".format(bearing), fontSize = 12.sp, color = theme.textSecondary)
        Spacer(Modifier.height(24.dp))
    }
}

// Hijri calendar — umalqura grid + White Days + 5 events (engine port).
@Composable
fun HijriScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    var month by remember { mutableStateOf(HijriEngine.toHijri(isoOf(System.currentTimeMillis(), "UTC"))) }
    val adjust = db.hijriAdjust()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
    ) {
        SubHeader("التقويم الهجري", onBack)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = { month = shiftMonth(month, -1) }) { Text("‹") }
            Text("${HijriEngine.monthNameAr(month.m)} ${month.y} هـ", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Button(onClick = { month = shiftMonth(month, 1) }) { Text("›") }
        }
        val firstIso = runCatching { HijriEngine.fromHijri(HijriEngine.HijriDate(month.y, month.m, 1)) }.getOrNull()
        if (firstIso != null) {
            val firstDow = HijriEngine.weekdayOf(firstIso)
            val todayIso = isoOf(System.currentTimeMillis(), ZoneId.systemDefault().id)
            var length = 29
            if (runCatching { HijriEngine.fromHijri(HijriEngine.HijriDate(month.y, month.m, 30)) }.isSuccess) length = 30
            val dows = listOf("ح", "ن", "ث", "ر", "خ", "ج", "س")
            Row(Modifier.fillMaxWidth()) {
                for (d in dows) Text(d, fontSize = 11.sp, color = theme.textSecondary, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            }
            val cells = (1 until firstDow + 1).map { null } + (1..length).map { d ->
                val g = runCatching { HijriEngine.fromHijri(HijriEngine.HijriDate(month.y, month.m, d)) }.getOrNull()
                val isToday = g != null && HijriEngine.withAdjust(g, adjust) == HijriEngine.toHijri(todayIso)
                Triple(d, isToday, d in 13..15)
            }
            for (row in cells.chunked(7)) {
                Row(Modifier.fillMaxWidth()) {
                    for (cell in row) {
                        Box(Modifier.weight(1f).padding(2.dp), contentAlignment = Alignment.Center) {
                            if (cell != null) {
                                Text(
                                    "${cell.first}",
                                    fontSize = 13.sp,
                                    fontWeight = if (cell.second) FontWeight.Bold else FontWeight.Normal,
                                    color = if (cell.second) theme.accentContrast else theme.textPrimary,
                                    modifier = Modifier
                                        .background(if (cell.second) theme.accent else Color.Transparent, RoundedCornerShape(8.dp))
                                        .border(if (cell.third) 1.dp else 0.dp, theme.accent.copy(alpha = 0.55f), RoundedCornerShape(8.dp))
                                        .padding(8.dp),
                                )
                            }
                        }
                    }
                }
            }
            // derived events of the current Gregorian year
            val events = HijriEngine.events(LocalDate.now().year)
            for (ev in events.filter { HijriEngine.withAdjust(it.gregorian, adjust).m == month.m }) {
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) {
                    Text(eventNameAr(ev.key), fontSize = 13.sp, color = theme.textPrimary, modifier = Modifier.weight(1f))
                    Text(ev.gregorian, fontSize = 13.sp, color = theme.textSecondary)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

private fun shiftMonth(m: HijriEngine.HijriDate, dir: Int): HijriEngine.HijriDate {
    var mm = m.m + dir
    var yy = m.y
    if (mm > 12) { mm = 1; yy += 1 }
    if (mm < 1) { mm = 12; yy -= 1 }
    return HijriEngine.HijriDate(yy, mm, m.d)
}

private fun eventNameAr(key: String) = when (key) {
    "ramadan_start" -> "بداية رمضان"
    "eid_fitr" -> "عيد الفطر"
    "arafah" -> "يوم عرفة"
    "eid_adha" -> "عيد الأضحى"
    "ashura" -> "يوم عاشوراء"
    else -> key
}

// Zakat — cash/gold/silver/goods/debts + gold/silver nisab, inputs persisted.
@Composable
fun ZakatScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val scope = rememberCoroutineScope()
    data class Inputs(val cash: String, val gold: String, val silver: String, val goods: String, val debts: String, val goldPrice: String, val silverPrice: String, val standard: String)
    var inputs by remember { mutableStateOf(Inputs("", "", "", "", "", "", "", "gold")) }

    LaunchedEffect(Unit) {
        val saved = db.setting("zakat_inputs") ?: return@LaunchedEffect
        if (saved.obj != null) {
            inputs = Inputs(
                saved["cash"].str ?: "", saved["gold"].str ?: "", saved["silver"].str ?: "",
                saved["goods"].str ?: "", saved["debts"].str ?: "", saved["goldPrice"].str ?: "",
                saved["silverPrice"].str ?: "", saved["standard"].str ?: "gold",
            )
        }
    }

    fun num(s: String) = s.replace(",", ".").toDoubleOrNull() ?: 0.0

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SubHeader("الزكاة", onBack)
        for ((label, key) in listOf("النقود" to "cash", "الذهب (جرام)" to "gold", "الفضة (جرام)" to "silver", "السلع والتجارة" to "goods", "الديون عليك" to "debts", "سعر جرام الذهب" to "goldPrice", "سعر جرام الفضة" to "silverPrice")) {
            val value = when (key) {
                "cash" -> inputs.cash; "gold" -> inputs.gold; "silver" -> inputs.silver
                "goods" -> inputs.goods; "debts" -> inputs.debts
                "goldPrice" -> inputs.goldPrice; else -> inputs.silverPrice
            }
            TextField(
                value = value,
                onValueChange = { v ->
                    inputs = when (key) {
                        "cash" -> inputs.copy(cash = v); "gold" -> inputs.copy(gold = v)
                        "silver" -> inputs.copy(silver = v); "goods" -> inputs.copy(goods = v)
                        "debts" -> inputs.copy(debts = v); "goldPrice" -> inputs.copy(goldPrice = v)
                        else -> inputs.copy(silverPrice = v)
                    }
                    scope.launch {
                        withContext(Dispatchers.IO) {
                            db.setSetting("zakat_inputs", JsonValue.Obj(mapOf(
                                "cash" to JsonValue.Str(inputs.cash), "gold" to JsonValue.Str(inputs.gold),
                                "silver" to JsonValue.Str(inputs.silver), "goods" to JsonValue.Str(inputs.goods),
                                "debts" to JsonValue.Str(inputs.debts), "goldPrice" to JsonValue.Str(inputs.goldPrice),
                                "silverPrice" to JsonValue.Str(inputs.silverPrice), "standard" to JsonValue.Str(inputs.standard),
                            )))
                        }
                    }
                },
                label = { Text(label) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        val wealth = num(inputs.cash) + num(inputs.goods) - num(inputs.debts) + num(inputs.gold) * num(inputs.goldPrice) + num(inputs.silver) * num(inputs.silverPrice)
        val nisab = if (inputs.standard == "gold") 85.0 * num(inputs.goldPrice) else 595.0 * num(inputs.silverPrice)
        val due = if (wealth >= nisab && nisab > 0) (wealth * 0.025).toLong() else 0L
        Text("الزكاة الواجبة: $due ريال", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = theme.accent)
        Text(
            if (nisab <= 0) "أدخل الأصول وأسعار السوق"
            else if (wealth < nisab) "المال أقل من النصاب (${nisab.toInt()} ريال) — لا زكاة"
            else "النصاب ${if (inputs.standard == "gold") "الذهبي" else "الفضي"}: ${nisab.toInt()} ريال — 2.5% من المال",
            fontSize = 12.sp, color = theme.textSecondary,
        )
        Spacer(Modifier.height(24.dp))
    }
}

// Qiyam — tonight's windows (the night whose fajr hasn't passed).
@Composable
fun QiyamScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val opts = db.engineOptions()
    val now = System.currentTimeMillis()
    val today = runCatching { PrayerEngine.sunnahWindows(isoOf(now, opts.timeZone), opts) }.getOrNull()
    val yest = runCatching { PrayerEngine.sunnahWindows(isoOf(now - 86_400_000, opts.timeZone), opts) }.getOrNull()
    val tonight = if (yest != null && now < yest.nextFajr) yest else today
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SubHeader("القيام", onBack)
        for ((label, v) in listOf("منتصف الليل" to tonight?.midnight, "الثلث الأخير" to tonight?.lastThird, "الفجر" to tonight?.nextFajr)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary, modifier = Modifier.weight(1f))
                Text(v?.let { clockOf(it, opts.timeZone) } ?: "—", fontSize = 14.sp, color = theme.accent)
            }
        }
        Text("خطة القيام: نام بعد العشاء واستيقظ قبل الفجر بـ ٧٠ دقيقة — الليل أفضل ساعة للدعاء.", fontSize = 13.sp, color = theme.textSecondary, lineHeight = 20.sp)
        Spacer(Modifier.height(24.dp))
    }
}

// Settings — 4 themes, font scale, 13 calc methods, madhab, HLR, hijri adjust.
@Composable
fun SettingsScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val app = context.applicationContext as app.sadaqa.android.SadaqaApp
    val opts = db.engineOptions()
    var method by remember { mutableStateOf(db.setting("calc_method")?.str ?: "umm_al_qura") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SubHeader("الإعدادات", onBack)
        Text("السمة", fontSize = 13.sp, color = theme.textSecondary)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (t in OFFERED_THEMES) {
                Button(
                    onClick = { app.setTheme(t) },
                    colors = ButtonDefaults.buttonColors(containerColor = SadaqaTheme.colors(t).surface),
                ) { Text(t, color = SadaqaTheme.colors(t).textPrimary) }
            }
        }
        Text("طريقة الحساب", fontSize = 13.sp, color = theme.textSecondary)
        // 12 methods — compact chips
        for (chunk in PrayerEngine.CALC_METHODS.chunked(3)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (m in chunk) {
                    Text(
                        m,
                        fontSize = 11.sp,
                        color = if (method == m) theme.accentContrast else theme.textPrimary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(if (method == m) theme.accent else theme.surfaceRaised)
                            .clickable {
                                method = m
                                db.setSetting("calc_method", JsonValue.Str(m))
                            }
                            .padding(horizontal = 8.dp, vertical = 5.dp),
                    )
                }
            }
        }
        Text("المذهب (العصر): ${if (opts.madhab == "hanafi") "الحنفي" else "الشافعي"} — بدّلها من ملف الإعدادات المتقدم", fontSize = 12.sp, color = theme.textSecondary)
        Text("تعديل الهجري: ${db.hijriAdjust()} (±٣) — يُطبَّق على العرض فقط", fontSize = 12.sp, color = theme.textSecondary)
        Spacer(Modifier.height(24.dp))
    }
}

// Backup — .sadaqa export via SAF (CREATE_DOCUMENT) + import (OPEN_DOCUMENT)
// with Merge and Full Replace (web contract; SAF = the §3 platform hook).
@Composable
fun BackupScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    var importMode by remember { mutableStateOf("merge") }
    var report by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var counts by remember { mutableStateOf(mapOf<String, Int>()) }

    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            // fixed table→SQL pairs (no identifier interpolation; bound where args exist)
            val pairs: List<Pair<String, String>> = listOf(
                "bookmarks" to "SELECT COUNT(*) AS n FROM bookmarks",
                "highlights" to "SELECT COUNT(*) AS n FROM highlights",
                "notes" to "SELECT COUNT(*) AS n FROM notes",
                "khatmah_plans" to "SELECT COUNT(*) AS n FROM khatmah_plans",
                "tasbih_counters" to "SELECT COUNT(*) AS n FROM tasbih_counters",
                "tasbih_sessions" to "SELECT COUNT(*) AS n FROM tasbih_sessions",
                "adhkar_state" to "SELECT COUNT(*) AS n FROM adhkar_state",
                "streak_days" to "SELECT COUNT(*) AS n FROM streak_days",
            )
            counts = pairs.associate { (t, sql) -> t to (db.queryOne(sql)?.longs?.get("n")?.toInt() ?: 0) }
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) {
            scopeSafe {
                withContext(Dispatchers.IO) {
                    val now = System.currentTimeMillis()
                    val (manifest, payloadJson) = db.buildExportPayload(now)
                    val doc = CanonicalJson.serialize(JsonValue.Obj(mapOf("manifest" to manifest, "payload" to runCatching { CanonicalJson.parse(payloadJson) }.getOrDefault(JsonValue.Null))))
                    context.contentResolver.openOutputStream(uri)?.use { it.write(doc.toByteArray(Charsets.UTF_8)) }
                    // audit row carries the real entity counts (golden parity)
                    val countsJson = CanonicalJson.serialize(manifest["entities"] ?: JsonValue.Obj(emptyMap()))
                    db.execute("INSERT INTO backup_log (direction, mode, format_version, counts_json, created_at) VALUES ('export', NULL, 1, ?, ?)", listOf(countsJson, now))
                }
                report = "تم التصدير"
            }
        }
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scopeSafe {
                withContext(Dispatchers.IO) {
                    val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
                    val r = db.importBackup(text, importMode)
                    withContext(kotlinx.coroutines.Dispatchers.Main) {
                        report = "تم الاستيراد: أُضيف ${r.added}، حُدِّث ${r.updated}، تعارض ${r.conflicts}، تخطي ${r.skipped}"
                    }
                }
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SubHeader("النسخ الاحتياطي", onBack)
        for ((name, value) in counts) {
            Row(Modifier.fillMaxWidth()) {
                Text(backupLabel(name), fontSize = 13.sp, color = theme.textSecondary, modifier = Modifier.weight(1f))
                Text("$value", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
            }
        }
        Button(
            onClick = { exportLauncher.launch("sadaqa-backup-%s.sadaqa".format(java.time.LocalDate.now())) },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast),
        ) { Text("تصدير ملف .sadaqa") }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((key, label) in listOf("merge" to "دمج ذكي", "replace" to "استبدال كامل")) {
                Text(
                    label, fontSize = 13.sp,
                    color = if (importMode == key) theme.accentContrast else theme.textPrimary,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (importMode == key) theme.accent else theme.surface)
                        .border(1.dp, theme.border, RoundedCornerShape(50))
                        .clickable { importMode = key }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
        Text(
            if (importMode == "merge") "الدمج الذكي: يضيف الجديد ويحدّث الأحدث زمنياً، ولا يمسح ما لديك."
            else "الاستبدال الكامل: يمسح بيانات القراءة والذكر المحلية ويعيد بناءها من الملف.",
            fontSize = 12.sp, color = theme.textSecondary, lineHeight = 18.sp,
        )
        Button(onClick = {
            importLauncher.launch(arrayOf("application/json", "application/octet-stream", "*/*"))
        }, modifier = Modifier.fillMaxWidth()) { Text("استيراد ملف .sadaqa") }
        report?.let { Text(it, fontSize = 13.sp, color = theme.textPrimary) }
        error?.let { Text(it, fontSize = 13.sp, color = Color(0xFFE5636F)) }
        Spacer(Modifier.height(24.dp))
    }
}

private fun backupLabel(t: String) = when (t) {
    "bookmarks" -> "العلامات المرجعية"
    "highlights" -> "التظليلات"
    "notes" -> "الملاحظات"
    "khatmah_plans" -> "خطط الختمة"
    "tasbih_counters" -> "عدّادات السبحة"
    "tasbih_sessions" -> "جلسات السبحة"
    "adhkar_state" -> "حالة الأذكار"
    "streak_days" -> "سلاسل الأيام"
    else -> t
}

/** Runs a block on a detached IO coroutine (SAF callbacks live off-Composable). */
private fun scopeSafe(block: suspend () -> Unit) {
    kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch { runCatching { block() } }
}

// Audio — pack catalog + per-surah downloads + starter playback (offline).
@Composable
fun AudioScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val player = remember { PlayerChain() }
    var surah by remember { mutableIntStateOf(1) }
    var playing by remember { mutableStateOf<String?>(null) }
    data class Reciter(val id: String, val nameAr: String, val style: String, val template: String)
    var reciters by remember { mutableStateOf(listOf<Reciter>()) }

    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            val text = ContextHolder.app?.assets?.open("audio-catalog.json")?.bufferedReader()?.readText()
            if (text != null) {
                val root = (kotlinx.serialization.json.Json.parseToJsonElement(text) as? kotlinx.serialization.json.JsonObject) ?: kotlinx.serialization.json.JsonObject(emptyMap())
                val arr = root["reciters"] as? kotlinx.serialization.json.JsonArray ?: kotlinx.serialization.json.JsonArray(emptyList())
                reciters = arr.mapNotNull { e ->
                    val o = e as? kotlinx.serialization.json.JsonObject ?: return@mapNotNull null
                    fun s(k: String) = (o[k] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
                    Reciter(s("id"), s("nameAr"), s("style"), s("audio_url_template").replace("{SSSAAA}", ""))
                }
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SubHeader("التلاوة", onBack)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("السورة", fontSize = 13.sp, color = theme.textSecondary)
            Button(onClick = { if (surah > 1) surah -= 1 }) { Text("−") }
            Text("$surah", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
            Button(onClick = { if (surah < 114) surah += 1 }) { Text("+") }
        }
        if (playing != null) {
            Text("آية 1 — سورة $surah يعمل الآن", fontSize = 14.sp, color = theme.accent)
            Button(onClick = { player.stop(); playing = null }) { Text("إيقاف") }
        }
        for (r in reciters) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(theme.surface).border(1.dp, theme.border, RoundedCornerShape(12.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(r.nameAr, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary)
                    Text(if (r.style == "murattal") "مرتّل" else "مجوَّد", fontSize = 12.sp, color = theme.textSecondary)
                }
                Text(
                    "تشغيل", fontSize = 13.sp, color = theme.accent,
                    modifier = Modifier.clickable {
                        val file = AudioStore.localFile(context, r.id, surah, 1)
                        if (file != null) {
                            playing = r.id
                            player.play(file) { playing = null }
                        }
                    }.padding(8.dp),
                )
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

// Search — universal FTS5 (vocalized input OK; index normalized at ingestion).
@Composable
fun SearchSheet(db: SadaqaDb, onClose: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(listOf<Triple<Int, String, String>>()) }

    LaunchedEffect(query) {
        if (query.length < 2) { results = emptyList(); return@LaunchedEffect }
        withContext(Dispatchers.IO) {
            val term = query.split(" ").joinToString(" ") { "\"$it\"" }
            results = db.query(
                "SELECT a.ayah_number AS n, a.text_uthmani AS t, s.name_ar AS sn FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.ayah_number IN (SELECT rowid FROM fts_ayahs WHERE fts_ayahs MATCH ?) LIMIT 25",
                listOf(term),
            ).map { Triple((it.longs["n"] ?: 0).toInt(), it.strings["sn"] ?: "", it.strings["t"] ?: "") }
        }
    }

    Column(Modifier.fillMaxSize().background(theme.bg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextField(value = query, onValueChange = { query = it }, label = { Text("ابحث في القرآن والأذكار…") }, modifier = Modifier.weight(1f))
            Text("إغلاق", fontSize = 13.sp, color = theme.textSecondary, modifier = Modifier.clickable { onClose() }.padding(8.dp))
        }
        for ((n, surah, text) in results) {
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Text("$surah — آية $n", fontSize = 12.sp, color = theme.accent)
                Text(text, fontSize = 17.sp, color = theme.textPrimary, lineHeight = 26.sp)
            }
        }
    }
}
