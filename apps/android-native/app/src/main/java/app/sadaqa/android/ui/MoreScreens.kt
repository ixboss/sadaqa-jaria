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
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.LayoutDirection
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
// Mushaf Hub — المصحف | قراءاتي وختمتي | الفهرس
// 604 page plates from v_page_words with Paint.hasGlyph() verification
// (never passing PUA glyphs to fallback fonts; falls back to text_uthmani
// + UthmanicHafs1Ver18), LTR-isolated BSML, bookmark toggle, swipe nav,
// and Ayah Action sheet (Tafsir, Mutashabihat, Bookmark, Copy, Share, Play).
// ---------------------------------------------------------------------------

private data class MushafWordRow(
    val glyphs: String,
    val wordText: String,
    val surah: Int,
    val ayahNumber: Int,
    val numberInSurah: Int,
)

private data class MushafLineItem(
    val kind: String,
    val glyphs: String,
    val textAr: String,
    val words: List<MushafWordRow>,
)

@Composable
fun MushafScreen(db: SadaqaDb) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val player = remember { PlayerChain() }

    var hubTab by remember { mutableStateOf("reader") } // reader | reading | index
    var page by remember { mutableIntStateOf((db.setting("mushaf_page")?.dbl?.toInt() ?: 1).coerceIn(1, 604)) }
    var fontScale by remember { mutableStateOf((db.setting("font_scale")?.dbl ?: 1.3).toFloat()) }
    var lines by remember { mutableStateOf(listOf<MushafLineItem>()) }
    var surahTitle by remember { mutableStateOf("المصحف الشريف") }
    var juzNum by remember { mutableIntStateOf(1) }
    var hizbNum by remember { mutableIntStateOf(1) }
    var isBookmarked by remember { mutableStateOf(false) }

    var selectedAyah by remember { mutableStateOf<Int?>(null) }
    var ayahInfo by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var ayahExtraTitle by remember { mutableStateOf("") }
    var ayahExtraBody by remember { mutableStateOf("") }

    var surahFilter by remember { mutableStateOf("") }
    var surahs by remember { mutableStateOf(listOf<Map<String, Any>>()) }
    var juzStarts by remember { mutableStateOf(listOf<Pair<Int, Int>>()) }
    var bookmarks by remember { mutableStateOf(listOf<Pair<Int, String>>()) }

    fun refreshBookmarks() {
        scope.launch {
            bookmarks = withContext(Dispatchers.IO) {
                db.query("SELECT page, label_ar FROM bookmarks WHERE deleted = 0 ORDER BY updated_at DESC LIMIT 30").map {
                    (it.longs["page"]?.toInt() ?: 1) to (it.strings["label_ar"] ?: "")
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            surahs = db.query("SELECT number, name_ar, name_translit, revelation_type, ayah_count, start_page FROM surahs ORDER BY number").map {
                mapOf(
                    "number" to (it.longs["number"]?.toInt() ?: 1),
                    "nameAr" to (it.strings["name_ar"] ?: ""),
                    "translit" to (it.strings["name_translit"] ?: ""),
                    "rev" to (it.strings["revelation_type"] ?: "Meccan"),
                    "ayahs" to (it.longs["ayah_count"]?.toInt() ?: 0),
                    "page" to (it.longs["start_page"]?.toInt() ?: 1),
                )
            }
            juzStarts = db.query("SELECT juz, MIN(page) AS p FROM ayahs GROUP BY juz ORDER BY juz").map {
                (it.longs["juz"]?.toInt() ?: 1) to (it.longs["p"]?.toInt() ?: 1)
            }
        }
        refreshBookmarks()
    }

    LaunchedEffect(page) {
        withContext(Dispatchers.IO) {
            val rows = db.query("SELECT line_number, kind, glyphs_qpc, text_ar FROM mushaf_lines WHERE page_number = ? ORDER BY line_number", listOf(page.toLong()))
            val words = db.query("SELECT line_number, glyphs_qpc, word_text, surah, ayah_number, number_in_surah FROM v_page_words WHERE page_number = ? ORDER BY line_number, line_position", listOf(page.toLong()))
            val byLine = words.groupBy { it.longs["line_number"]?.toInt() ?: 0 }.mapValues { (_, list) ->
                list.map {
                    MushafWordRow(
                        glyphs = it.strings["glyphs_qpc"] ?: "",
                        wordText = it.strings["word_text"] ?: "",
                        surah = it.longs["surah"]?.toInt() ?: 1,
                        ayahNumber = it.longs["ayah_number"]?.toInt() ?: 1,
                        numberInSurah = it.longs["number_in_surah"]?.toInt() ?: 1,
                    )
                }
            }
            lines = (1..15).mapNotNull { line ->
                val deco = rows.firstOrNull { (it.longs["line_number"]?.toInt() ?: 0) == line }
                val plates = byLine[line] ?: emptyList()
                val kind = deco?.strings?.get("kind") ?: ""
                when {
                    kind == "bismillah" -> MushafLineItem("bismillah", deco?.strings?.get("glyphs_qpc") ?: "", deco?.strings?.get("text_ar") ?: "", emptyList())
                    kind == "surah_name" -> MushafLineItem("surah_name", "", deco?.strings?.get("text_ar") ?: "", emptyList())
                    plates.isNotEmpty() -> MushafLineItem("text", "", deco?.strings?.get("text_ar") ?: "", plates)
                    else -> null
                }
            }
            surahTitle = db.queryOne("SELECT s.name_ar FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.page = ? ORDER BY a.ayah_number LIMIT 1", listOf(page.toLong()))
                ?.strings?.get("name_ar") ?: "المصحف الشريف"
            val pMeta = db.queryOne("SELECT juz_start, hizb_start FROM mushaf_pages WHERE page_number = ?", listOf(page.toLong()))
            juzNum = pMeta?.longs?.get("juz_start")?.toInt() ?: 1
            hizbNum = pMeta?.longs?.get("hizb_start")?.toInt() ?: 1
            isBookmarked = (db.queryOne("SELECT COUNT(*) AS n FROM bookmarks WHERE page = ? AND deleted = 0", listOf(page.toLong()))?.longs?.get("n") ?: 0L) > 0L
            db.setSetting("mushaf_page", JsonValue.Num(page.toDouble()))
        }
        Haptics.pageFlip(context)
    }

    LaunchedEffect(selectedAyah) {
        val ayahNum = selectedAyah ?: return@LaunchedEffect
        ayahExtraTitle = ""
        ayahExtraBody = ""
        withContext(Dispatchers.IO) {
            val row = db.queryOne("SELECT a.surah, a.number_in_surah, a.text_uthmani, a.page, s.name_ar FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.ayah_number = ?", listOf(ayahNum.toLong()))
            if (row != null) {
                ayahInfo = mapOf(
                    "surah" to (row.longs["surah"]?.toString() ?: "1"),
                    "nis" to (row.longs["number_in_surah"]?.toString() ?: "1"),
                    "text" to (row.strings["text_uthmani"] ?: ""),
                    "page" to (row.longs["page"]?.toString() ?: "$page"),
                    "surahName" to (row.strings["name_ar"] ?: ""),
                )
            }
        }
    }

    Column(Modifier.fillMaxSize().background(theme.bg)) {
        // Segmented Mushaf Hub bar
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for ((k, label) in listOf("reader" to "المصحف", "reading" to "قراءاتي وختمتي", "index" to "الفهرس")) {
                val active = hubTab == k
                Text(
                    label,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (active) theme.accentContrast else theme.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(50))
                        .background(if (active) theme.accent else theme.surface)
                        .border(1.dp, if (active) theme.accent else theme.border, RoundedCornerShape(50))
                        .clickable { hubTab = k }
                        .padding(vertical = 8.dp),
                )
            }
        }

        when (hubTab) {
            "reader" -> {
                val sample = lines.firstOrNull { it.words.isNotEmpty() }?.words?.joinToString("") { it.glyphs } ?: ""
                val verifiedPageFont = remember(page, sample) {
                    if (sample.isEmpty()) null else QpcFonts.verifiedMushaf(context, page, sample)
                }

                // Header bar
                Row(
                    Modifier.fillMaxWidth().background(theme.surface).padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(surahTitle, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                        Text("ص $page · الجزء $juzNum · الحزب $hizbNum", fontSize = 11.sp, color = theme.textSecondary)
                    }
                    Text(
                        "أ±",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = theme.textSecondary,
                        modifier = Modifier.clickable {
                            fontScale = if (fontScale >= 1.6f) 1.0f else fontScale + 0.15f
                            scope.launch { withContext(Dispatchers.IO) { db.setSetting("font_scale", JsonValue.Num(fontScale.toDouble())) } }
                        }.padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                    Text(
                        if (isBookmarked) "★" else "🔖",
                        fontSize = 16.sp,
                        color = if (isBookmarked) theme.accent else theme.textSecondary,
                        modifier = Modifier.clickable {
                            scope.launch {
                                val added = withContext(Dispatchers.IO) {
                                    db.toggleBookmark(page, null, null, "$surahTitle · ص $page", System.currentTimeMillis())
                                }
                                isBookmarked = added
                                Haptics.complete(context)
                                refreshBookmarks()
                            }
                        }.padding(horizontal = 8.dp, vertical = 6.dp),
                    )
                }

                // Page plate with horizontal swipe navigation
                var dragAccum by remember { mutableFloatStateOf(0f) }
                Column(
                    Modifier.weight(1f).fillMaxWidth().background(theme.mushafBg)
                        .pointerInput(page) {
                            detectHorizontalDragGestures(
                                onHorizontalDrag = { _, dragAmount -> dragAccum += dragAmount },
                                onDragEnd = {
                                    if (dragAccum < -90f && page < 604) page += 1
                                    else if (dragAccum > 90f && page > 1) page -= 1
                                    dragAccum = 0f
                                },
                                onDragCancel = { dragAccum = 0f },
                            )
                        }
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    for (item in lines) {
                        when (item.kind) {
                            "bismillah" -> {
                                val bsmlFont = QpcFonts.verifiedBasmala(context, item.glyphs)
                                if (bsmlFont != null) {
                                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                        Text(
                                            item.glyphs,
                                            fontFamily = bsmlFont,
                                            fontSize = (20f * fontScale).sp,
                                            color = theme.mushafText,
                                            textAlign = TextAlign.Center,
                                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                                        )
                                    }
                                } else {
                                    Text(
                                        item.textAr.ifEmpty { "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ" },
                                        fontFamily = QpcFonts.uthmanic(context),
                                        fontSize = (18f * fontScale).sp,
                                        color = theme.mushafText,
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                                    )
                                }
                            }
                            "surah_name" -> Box(
                                Modifier.fillMaxWidth().padding(vertical = 3.dp)
                                    .clip(RoundedCornerShape(10.dp)).background(theme.surface)
                                    .border(1.dp, theme.accent.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                                    .padding(vertical = 6.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(item.textAr, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                            }
                            "text" -> {
                                val lineText = if (verifiedPageFont != null) {
                                    item.words.joinToString(" ") { it.glyphs }
                                } else {
                                    item.textAr.ifEmpty { item.words.joinToString(" ") { it.wordText } }
                                }
                                val firstAyah = item.words.firstOrNull()?.ayahNumber
                                Text(
                                    lineText,
                                    fontFamily = verifiedPageFont ?: QpcFonts.uthmanic(context),
                                    fontSize = (18f * fontScale).sp,
                                    lineHeight = (28f * fontScale).sp,
                                    color = theme.mushafText,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.fillMaxWidth()
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(if (firstAyah != null && selectedAyah == firstAyah) theme.accent.copy(alpha = 0.16f) else Color.Transparent)
                                        .clickable(enabled = firstAyah != null) { selectedAyah = firstAyah }
                                        .padding(vertical = 1.dp),
                                )
                            }
                        }
                    }
                }

                // Bottom page switcher
                Row(
                    Modifier.fillMaxWidth().background(theme.surface).padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "السابقة",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (page > 1) theme.accent else theme.textSecondary,
                        modifier = Modifier.clickable(enabled = page > 1) { page -= 1 }.padding(6.dp),
                    )
                    Text("صفحة $page من 604", fontSize = 12.sp, color = theme.textSecondary)
                    Text(
                        "التالية",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (page < 604) theme.accent else theme.textSecondary,
                        modifier = Modifier.clickable(enabled = page < 604) { page += 1 }.padding(6.dp),
                    )
                }
            }
            "reading" -> {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val plan = remember(bookmarks) {
                        db.queryOne("SELECT p.*, (SELECT COUNT(*) FROM khatmah_page_log l WHERE l.plan_uuid = p.uuid) AS done FROM khatmah_plans p WHERE p.deleted = 0 AND p.active = 1 LIMIT 1")
                    }
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(theme.surface)
                            .border(1.dp, theme.border, RoundedCornerShape(16.dp)).padding(16.dp),
                    ) {
                        Text("الختمة الجارية", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                        val donePages = plan?.longs?.get("done")?.toInt() ?: 0
                        Text(
                            if (plan != null) "أُنجز $donePages من 604 صفحة (${(donePages * 100 / 604)}%)" else "تقرأ حالياً صفحة $page من 604",
                            fontSize = 13.sp,
                            color = theme.textSecondary,
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            onClick = { hubTab = "reader" },
                            colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast),
                        ) { Text("متابعة القراءة (ص $page)") }
                    }

                    Text("العلامات المرجعية", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                    if (bookmarks.isEmpty()) {
                        Text("لا توجد علامات مرجعية بعد — اضغط أيقونة العلامة أثناء القراءة لحفظ موضعك.", fontSize = 13.sp, color = theme.textSecondary)
                    } else {
                        for ((bPage, bLabel) in bookmarks) {
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(theme.surface)
                                    .border(1.dp, theme.border, RoundedCornerShape(14.dp))
                                    .clickable { page = bPage; hubTab = "reader" }.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("★", fontSize = 15.sp, color = theme.accent, modifier = Modifier.padding(end = 10.dp))
                                Text(bLabel.ifEmpty { "صفحة $bPage" }, fontSize = 14.sp, color = theme.textPrimary, modifier = Modifier.weight(1f))
                                Text("ص $bPage", fontSize = 12.sp, color = theme.accent)
                            }
                        }
                    }
                }
            }
            "index" -> {
                Column(Modifier.fillMaxSize()) {
                    TextField(
                        value = surahFilter,
                        onValueChange = { surahFilter = it },
                        placeholder = { Text("ابحث عن سورة بالاسم أو الرقم…") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        for ((juz, startP) in juzStarts) {
                            Text(
                                "الجزء $juz",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = theme.textPrimary,
                                modifier = Modifier.clip(RoundedCornerShape(50)).background(theme.surface)
                                    .border(1.dp, theme.border, RoundedCornerShape(50))
                                    .clickable { page = startP; hubTab = "reader" }
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            )
                        }
                    }
                    val q = surahFilter.trim()
                    val list = if (q.isEmpty()) surahs else surahs.filter {
                        (it["nameAr"] as? String ?: "").contains(q) ||
                            (it["number"]?.toString() ?: "").contains(q) ||
                            (it["translit"] as? String ?: "").contains(q, ignoreCase = true)
                    }
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        for (s in list) {
                            val num = s["number"] as? Int ?: 1
                            val sName = s["nameAr"] as? String ?: ""
                            val sPage = s["page"] as? Int ?: 1
                            val rev = if (s["rev"] == "Meccan") "مكية" else "مدنية"
                            val aCount = s["ayahs"] as? Int ?: 0
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(theme.surface)
                                    .border(1.dp, theme.border, RoundedCornerShape(14.dp))
                                    .clickable { page = sPage; hubTab = "reader" }.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    Modifier.size(34.dp).clip(CircleShape).background(theme.surfaceRaised),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("$num", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                                }
                                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                    Text(sName, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                                    Text("$rev · $aCount آية", fontSize = 11.sp, color = theme.textSecondary)
                                }
                                Text("ص $sPage", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
                            }
                        }
                        Spacer(Modifier.height(24.dp))
                    }
                }
            }
        }
    }

    // Ayah Action Modal
    val activeAyah = selectedAyah
    if (activeAyah != null && ayahInfo.isNotEmpty()) {
        val text = ayahInfo["text"] ?: ""
        val sName = ayahInfo["surahName"] ?: ""
        val nis = ayahInfo["nis"] ?: "1"
        val sNum = ayahInfo["surah"]?.toIntOrNull() ?: 1
        val aNum = nis.toIntOrNull() ?: 1
        val pNum = ayahInfo["page"]?.toIntOrNull() ?: page

        AlertDialog(
            onDismissRequest = { selectedAyah = null },
            containerColor = theme.surface,
            title = { Text("$sName · الآية $nis", color = theme.textPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text,
                        fontFamily = QpcFonts.uthmanic(context),
                        fontSize = 21.sp,
                        lineHeight = 34.sp,
                        color = theme.mushafText,
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                scope.launch {
                                    val body = withContext(Dispatchers.IO) {
                                        db.queryOne("SELECT body FROM tafsirs WHERE book_id = 'muyassar' AND ayah_number = ?", listOf(activeAyah.toLong()))?.strings?.get("body")
                                    } ?: "غير متوفر في هذه النسخة."
                                    ayahExtraTitle = "التفسير الميسر"
                                    ayahExtraBody = body
                                }
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast),
                        ) { Text("التفسير", fontSize = 12.sp) }
                        Button(
                            onClick = {
                                scope.launch {
                                    val rows = withContext(Dispatchers.IO) {
                                        db.query("SELECT a.text_uthmani, m.note_ar FROM mutashabihat m JOIN ayahs a ON a.ayah_number = m.similar_ayah WHERE m.ayah_number = ?", listOf(activeAyah.toLong()))
                                    }
                                    ayahExtraTitle = "آيات مشابهة"
                                    ayahExtraBody = if (rows.isEmpty()) "لا توجد متشابهات مسجلة." else rows.joinToString("\n\n") { (it.strings["text_uthmani"] ?: "") + "\n" + (it.strings["note_ar"] ?: "") }
                                }
                            },
                            modifier = Modifier.weight(1f),
                        ) { Text("متشابهات", fontSize = 12.sp) }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                scope.launch {
                                    withContext(Dispatchers.IO) {
                                        db.toggleBookmark(pNum, null, activeAyah, "$sName $nis", System.currentTimeMillis())
                                    }
                                    Haptics.complete(context)
                                    refreshBookmarks()
                                    ayahExtraTitle = "العلامات"
                                    ayahExtraBody = "تم تحديث علامة الآية."
                                }
                            },
                            modifier = Modifier.weight(1f),
                        ) { Text("علامة", fontSize = 12.sp) }
                        Button(
                            onClick = {
                                clipboard.setText(AnnotatedString("$text\n— $sName · الآية $nis"))
                                ayahExtraTitle = "النسخ"
                                ayahExtraBody = "تم نسخ نص الآية إلى الحافظة."
                            },
                            modifier = Modifier.weight(1f),
                        ) { Text("نسخ", fontSize = 12.sp) }
                        Button(
                            onClick = {
                                val f = AudioStore.localFile(context, "alafasy", sNum, aNum)
                                if (f != null) player.play(f) {}
                                else {
                                    ayahExtraTitle = "التلاوة"
                                    ayahExtraBody = "نزّل حزمة السورة من الأدوات ← التلاوة للاستماع دون اتصال."
                                }
                            },
                            modifier = Modifier.weight(1f),
                        ) { Text("تشغيل", fontSize = 12.sp) }
                    }
                    if (ayahExtraBody.isNotEmpty()) {
                        Text(ayahExtraTitle, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                        Text(ayahExtraBody, fontSize = 14.sp, color = theme.textPrimary, lineHeight = 22.sp)
                    }
                }
            },
            confirmButton = {
                Button(onClick = { selectedAyah = null }) { Text("إغلاق") }
            },
        )
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

    val toolsList = listOf(
        listOf("qibla", "🧭", "القبلة", "بوصلة محددة القبلة"),
        listOf("hijri", "📅", "التقويم الهجري", "الأيام البيضاء والمناسبات"),
        listOf("zakat", "⚖️", "حاسبة الزكاة", "الذهب والفضة والنقود"),
        listOf("qiyam", "🌙", "حاسبة القيام", "منتصف الليل والثلث الأخير"),
        listOf("tasbih", "📿", "السبحة", "السبحة الإلكترونية"),
        listOf("backup", "💾", "النسخ الاحتياطي", "ملف .sadaqa — دمج أو استبدال"),
        listOf("audio", "🎧", "التلاوة", "الحزم الصوتية والتشغيل"),
        listOf("settings", "⚙️", "الإعدادات", "المظهر والموقع وطريقة الحساب"),
    )

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Text("الأدوات", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
        for (pair in toolsList.chunked(2)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (t in pair) {
                    Column(
                        Modifier.weight(1f).defaultMinSize(minHeight = 122.dp).clip(RoundedCornerShape(16.dp))
                            .background(theme.surface).border(1.dp, theme.border, RoundedCornerShape(16.dp))
                            .clickable { sub = t[0] }.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(
                            Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(theme.accent.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(t[1], fontSize = 18.sp)
                        }
                        Text(t[2], fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                        Text(t[3], fontSize = 12.sp, color = theme.textSecondary, lineHeight = 16.sp)
                    }
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
