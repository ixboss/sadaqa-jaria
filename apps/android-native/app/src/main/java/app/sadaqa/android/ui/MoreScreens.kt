// ============================================================================
// MoreScreens.kt — Mushaf (per-page QPC fonts + LTR-isolated BSML), Tools
// (Qibla compass / Hijri calendar / Zakat / Qiyam / Settings), Backup (.sadaqa
// SAF export + import Merge/Replace), Audio (pack catalog + starter playback),
// Search (FTS5 vocalized). Engine/db calls go through the Core ports only.
// ============================================================================

package app.sadaqa.android.ui

import android.Manifest
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerDefaults
import androidx.compose.foundation.pager.PagerSnapDistance
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Adjust
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Headphones
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.NightsStay
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import java.util.Locale
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import app.sadaqa.android.backup.CanonicalJson
import app.sadaqa.android.backup.JsonValue
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.data.WidgetNotifier
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

// Top-level AnimatedVisibility wrapper outside ColumnScope/RowScope so BoxScope call sites
// do not trigger Kotlin's ColumnScope.AnimatedVisibility implicit-receiver ambiguity.
@Composable
private fun OverlayAnimatedVisibility(
    visible: Boolean,
    enter: EnterTransition,
    exit: ExitTransition,
    content: @Composable AnimatedVisibilityScope.() -> Unit,
) {
    AnimatedVisibility(visible = visible, enter = enter, exit = exit, content = content)
}

// ---------------------------------------------------------------------------
// Mushaf Hub — المصحف | قراءاتي وختمتي | الفهرس
// 604 page plates from v_page_words with Paint.hasGlyph() verification
// (never passing PUA glyphs to fallback fonts; falls back to text_uthmani
// + UthmanicHafs1Ver18), LTR-isolated BSML, bookmark toggle, swipe nav,
// and Ayah Action sheet (Tafsir, Mutashabihat, Bookmark, Copy, Share, Play).
// ---------------------------------------------------------------------------

@Immutable
private data class MushafWordRow(
    val glyphs: String,
    val wordText: String,
    val surah: Int,
    val ayahNumber: Int,
    val numberInSurah: Int,
)

@Immutable
private data class MushafLineItem(
    val kind: String,
    val glyphs: String,
    val textAr: String,
    val words: List<MushafWordRow>,
)

@Immutable
private data class SurahRow(
    val number: Int,
    val nameAr: String,
    val normalizedName: String,
    val translit: String,
    val rev: String,
    val ayahs: Int,
    val page: Int,
)

private val MUSHAF_HUB_TABS: List<Pair<String, String>> = listOf(
    "reader" to "المصحف",
    "reading" to "قراءاتي وختمتي",
    "index" to "الفهرس",
)
private val HUD_CAPSULE_SHAPE = RoundedCornerShape(20.dp)
private val HUD_PILL_SHAPE = RoundedCornerShape(50)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MushafScreen(db: SadaqaDb, onNavigateMain: (String) -> Unit = {}, onOpenSearch: () -> Unit = {}) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val player = remember { PlayerChain() }
    DisposableEffect(player) {
        onDispose { player.stop() }
    }

    var hubTab by remember { mutableStateOf("reader") } // reader | reading | index
    var page by remember { mutableIntStateOf((db.setting("mushaf_page")?.dbl?.toInt() ?: 1).coerceIn(1, 604)) }
    var sliderPage by remember { mutableFloatStateOf(page.toFloat()) }
    var isSliding by remember { mutableStateOf(false) }
    var mushafScale by remember { mutableStateOf((db.setting("mushaf_scale")?.dbl ?: 1.0).toFloat().coerceIn(0.8f, 2.0f)) }
    var showAppearance by remember { mutableStateOf(false) }
    var hudVisible by remember { mutableStateOf(false) }
    val pageCache = remember { mutableStateMapOf<Int, List<MushafLineItem>>() }
    val pageMeta = remember { mutableStateMapOf<Int, Triple<String, Int, Int>>() }
    var surahTitle by remember { mutableStateOf("المصحف الشريف") }
    var juzNum by remember { mutableIntStateOf(1) }
    var hizbNum by remember { mutableIntStateOf(1) }
    var isBookmarked by remember { mutableStateOf(false) }

    var selectedAyah by remember { mutableStateOf<Int?>(null) }
    var ayahInfo by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var ayahExtraTitle by remember { mutableStateOf("") }
    var ayahExtraBody by remember { mutableStateOf("") }

    var surahFilter by remember { mutableStateOf("") }
    var surahs by remember { mutableStateOf(listOf<SurahRow>()) }
    var juzStarts by remember { mutableStateOf(listOf<Pair<Int, Int>>()) }
    var bookmarks by remember { mutableStateOf(listOf<Pair<Int, String>>()) }
    var khatmahDonePages by remember { mutableStateOf<Int?>(null) }

    fun refreshBookmarks() {
        scope.launch {
            val loaded = withContext(Dispatchers.IO) {
                val bms = db.query("SELECT page, label_ar FROM bookmarks WHERE deleted = 0 ORDER BY updated_at DESC LIMIT 30").map {
                    (it.longs["page"]?.toInt() ?: 1) to (it.strings["label_ar"] ?: "")
                }
                val done = db.queryOne("SELECT (SELECT COUNT(*) FROM khatmah_page_log l WHERE l.plan_uuid = p.uuid) AS done FROM khatmah_plans p WHERE p.deleted = 0 AND p.active = 1 LIMIT 1")
                    ?.longs?.get("done")?.toInt()
                bms to done
            }
            bookmarks = loaded.first
            khatmahDonePages = loaded.second
        }
    }

    fun setMushafScale(v: Float) {
        mushafScale = ((v * 20f).roundToInt().toFloat() / 20f).coerceIn(0.8f, 2.0f)
        scope.launch { withContext(Dispatchers.IO) { db.setSetting("mushaf_scale", JsonValue.Num(mushafScale.toDouble())) } }
    }

    LaunchedEffect(Unit) {
        val loaded = withContext(Dispatchers.IO) {
            val loadedSurahs = db.query("SELECT number, name_ar, name_translit, revelation_type, ayah_count, start_page FROM surahs ORDER BY number").map {
                val nameAr = it.strings["name_ar"] ?: ""
                SurahRow(
                    number = it.longs["number"]?.toInt() ?: 1,
                    nameAr = nameAr,
                    normalizedName = SadaqaDb.normalizeArabicForSearch(nameAr),
                    translit = it.strings["name_translit"] ?: "",
                    rev = it.strings["revelation_type"] ?: "Meccan",
                    ayahs = it.longs["ayah_count"]?.toInt() ?: 0,
                    page = it.longs["start_page"]?.toInt() ?: 1,
                )
            }
            val loadedJuz = db.query("SELECT juz, MIN(page) AS p FROM ayahs GROUP BY juz ORDER BY juz").map {
                (it.longs["juz"]?.toInt() ?: 1) to (it.longs["p"]?.toInt() ?: 1)
            }
            loadedSurahs to loadedJuz
        }
        surahs = loaded.first
        juzStarts = loaded.second
        refreshBookmarks()
    }

    suspend fun loadPageData(p: Int) {
        if (pageCache.containsKey(p) && pageMeta.containsKey(p)) return
        val loaded = withContext(Dispatchers.IO) {
            val rows = db.query("SELECT line_number, kind, glyphs_qpc, text_ar FROM mushaf_lines WHERE page_number = ? ORDER BY line_number", listOf(p.toLong()))
            val words = db.query("SELECT line_number, glyphs_qpc, word_text, surah, ayah_number, number_in_surah FROM v_page_words WHERE page_number = ? ORDER BY line_number, line_position", listOf(p.toLong()))
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
            val builtLines = (1..15).mapNotNull { line ->
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
            val title = db.queryOne("SELECT s.name_ar FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.page = ? ORDER BY a.ayah_number LIMIT 1", listOf(p.toLong()))
                ?.strings?.get("name_ar") ?: "المصحف الشريف"
            val pMeta = db.queryOne("SELECT juz_start, hizb_start FROM mushaf_pages WHERE page_number = ?", listOf(p.toLong()))
            val juz = pMeta?.longs?.get("juz_start")?.toInt() ?: 1
            val hizb = pMeta?.longs?.get("hizb_start")?.toInt() ?: 1
            builtLines to Triple(title, juz, hizb)
        }
        pageCache[p] = loaded.first
        pageMeta[p] = loaded.second
    }

    LaunchedEffect(page) {
        if (!isSliding) sliderPage = page.toFloat()
        loadPageData(page)
        pageMeta[page]?.let { (title, juz, hizb) ->
            surahTitle = title
            juzNum = juz
            hizbNum = hizb
        }
        launch(Dispatchers.IO) {
            for (adj in listOf(page - 1, page + 1, page - 2, page + 2)) {
                if (adj in 1..604 && !pageCache.containsKey(adj)) loadPageData(adj)
            }
        }
        withContext(Dispatchers.IO) {
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

    Column(Modifier.fillMaxSize().background(theme.mushafBg)) {
        when (hubTab) {
            "reader" -> {
                val pagerState = rememberPagerState(initialPage = page - 1, pageCount = { 604 })
                LaunchedEffect(page) {
                    if (pagerState.settledPage != page - 1 && pagerState.targetPage != page - 1) {
                        pagerState.scrollToPage(page - 1)
                    }
                }
                LaunchedEffect(pagerState) {
                    snapshotFlow { pagerState.settledPage + 1 }
                        .distinctUntilChanged()
                        .collect { settled -> if (settled != page) page = settled }
                }

                Box(Modifier.weight(1f).fillMaxWidth()) {
                    Column(Modifier.fillMaxSize()) {
                        // Subtle top metadata strip (hidden while the HUD is up —
                        // the HUD bar carries the same meta, never double-rendered)
                        if (!hudVisible) {
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(surahTitle, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.textSecondary, modifier = Modifier.weight(1f))
                                Text("الجزء $juzNum · الحزب $hizbNum", fontSize = 11.sp, color = theme.textSecondary)
                            }
                        }

                        // RTL HorizontalPager: page 1 on right, swipe left->right advances to next page
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                            HorizontalPager(
                                state = pagerState,
                                beyondViewportPageCount = 2,
                                flingBehavior = PagerDefaults.flingBehavior(
                                    state = pagerState,
                                    pagerSnapDistance = PagerSnapDistance.atMost(1),
                                    snapAnimationSpec = spring(dampingRatio = 0.88f, stiffness = Spring.StiffnessMediumLow),
                                ),
                                modifier = Modifier.weight(1f).fillMaxWidth(),
                            ) { slotIdx ->
                                val slotPage = slotIdx + 1
                                LaunchedEffect(slotPage) { loadPageData(slotPage) }
                                val slotLines = pageCache[slotPage] ?: emptyList()
                                MushafPagePlate(
                                    page = slotPage,
                                    lines = slotLines,
                                    mushafScale = mushafScale,
                                    selectedAyah = selectedAyah,
                                    hudVisible = hudVisible,
                                    onSelectAyah = { Haptics.tick(context); selectedAyah = it },
                                    onToggleHud = { hudVisible = !hudVisible },
                                )
                            }
                        }

                        // Compact bottom Liquid Glass page pill (clears floating bottom nav)
                        Box(
                            Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 84.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "ص $page / 604",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = theme.textSecondary,
                                modifier = Modifier
                                    .liquidGlassPill(shape = HUD_PILL_SHAPE, elevation = 6.dp)
                                    .clickable { hudVisible = !hudVisible }
                                    .padding(horizontal = 14.dp, vertical = 4.dp),
                            )
                        }
                    }

                    // Tap-to-toggle Floating Liquid Glass HUD (spring transition)
                    OverlayAnimatedVisibility(
                        visible = hudVisible,
                        enter = fadeIn(spring(stiffness = Spring.StiffnessMedium)) +
                            scaleIn(initialScale = 0.96f, animationSpec = spring(stiffness = Spring.StiffnessMedium)),
                        exit = fadeOut(spring(stiffness = Spring.StiffnessMediumLow)) +
                            scaleOut(targetScale = 0.96f),
                    ) {
                        val glass = rememberGlassPalette()
                        val previewPage = sliderPage.roundToInt().coerceIn(1, 604)
                        val previewSurah = remember(previewPage, surahs) {
                            surahs.lastOrNull { it.page <= previewPage }?.nameAr ?: "المصحف الشريف"
                        }
                        Column(
                            Modifier.fillMaxSize().padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 88.dp),
                            verticalArrangement = Arrangement.SpaceBetween,
                        ) {
                            // Top Liquid Glass HUD capsule + segmented hub pill stacked underneath
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                LiquidGlassSurface(
                                    shape = HUD_CAPSULE_SHAPE,
                                    elevation = 14.dp,
                                    glass = glass,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Row(
                                        Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Box(
                                            Modifier.clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable { hudVisible = false; onNavigateMain("today") }
                                                .padding(7.dp),
                                        ) {
                                            Icon(Icons.Outlined.ArrowForward, contentDescription = "رجوع", tint = theme.textSecondary, modifier = Modifier.size(16.dp))
                                        }
                                        Column(Modifier.weight(1f)) {
                                            Text(surahTitle, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text("ص $page · الجزء $juzNum · الحزب $hizbNum", fontSize = 11.sp, color = theme.textSecondary, maxLines = 1)
                                        }
                                        Text(
                                            "أ±",
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = theme.accent,
                                            modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable { showAppearance = true }.padding(horizontal = 10.dp, vertical = 6.dp),
                                        )
                                        Box(
                                            Modifier.clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable {
                                                    scope.launch {
                                                        val added = withContext(Dispatchers.IO) {
                                                            db.toggleBookmark(page, 1, null, "$surahTitle · ص $page", System.currentTimeMillis())
                                                        }
                                                        isBookmarked = added
                                                        Haptics.complete(context)
                                                        refreshBookmarks()
                                                    }
                                                }.padding(horizontal = 10.dp, vertical = 6.dp),
                                        ) {
                                            Icon(
                                                if (isBookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                                                contentDescription = "علامة مرجعية",
                                                tint = if (isBookmarked) theme.accent else theme.textSecondary,
                                                modifier = Modifier.size(18.dp),
                                            )
                                        }
                                        Text(
                                            "بحث",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = theme.textPrimary,
                                            modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable { hudVisible = false; onOpenSearch() }
                                                .padding(horizontal = 10.dp, vertical = 6.dp),
                                        )
                                    }
                                }

                                LiquidGlassSurface(
                                    shape = HUD_PILL_SHAPE,
                                    elevation = 10.dp,
                                    glass = glass,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Row(
                                        Modifier.fillMaxWidth().padding(4.dp),
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        for ((k, label) in MUSHAF_HUB_TABS) {
                                            val active = hubTab == k
                                            Text(
                                                label,
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = if (active) theme.accentContrast else theme.textSecondary,
                                                textAlign = TextAlign.Center,
                                                modifier = Modifier.weight(1f).clip(HUD_PILL_SHAPE)
                                                    .background(if (active) theme.accent else Color.Transparent)
                                                    .clickable { hudVisible = false; hubTab = k }
                                                    .padding(vertical = 6.dp),
                                            )
                                        }
                                    }
                                }
                            }

                            // Bottom Liquid Glass HUD capsule with floating preview pill + RTL page slider + ±1 buttons
                            LiquidGlassSurface(
                                shape = HUD_CAPSULE_SHAPE,
                                elevation = 14.dp,
                                glass = glass,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(
                                    Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    if (isSliding) {
                                        Text(
                                            "ص $previewPage — $previewSurah",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = theme.accent,
                                            modifier = Modifier
                                                .clip(HUD_PILL_SHAPE)
                                                .background(theme.surfaceRaised.copy(alpha = 0.85f))
                                                .border(1.dp, theme.accent.copy(alpha = 0.45f), HUD_PILL_SHAPE)
                                                .padding(horizontal = 12.dp, vertical = 4.dp),
                                        )
                                    }
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Box(
                                            Modifier.size(32.dp).clip(CircleShape).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable(enabled = page > 1) { page -= 1 },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(Icons.Outlined.ChevronRight, contentDescription = "السابقة", tint = if (page > 1) theme.accent else theme.textSecondary, modifier = Modifier.size(18.dp))
                                        }
                                        Box(Modifier.weight(1f)) {
                                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                                                Slider(
                                                    value = sliderPage,
                                                    onValueChange = {
                                                        isSliding = true
                                                        sliderPage = it
                                                    },
                                                    onValueChangeFinished = {
                                                        isSliding = false
                                                        val target = sliderPage.roundToInt().coerceIn(1, 604)
                                                        if (target != page) page = target
                                                    },
                                                    valueRange = 1f..604f,
                                                    colors = SliderDefaults.colors(thumbColor = theme.accent, activeTrackColor = theme.accent),
                                                )
                                            }
                                        }
                                        Box(
                                            Modifier.size(32.dp).clip(CircleShape).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable(enabled = page < 604) { page += 1 },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(Icons.Outlined.ChevronLeft, contentDescription = "التالية", tint = if (page < 604) theme.accent else theme.textSecondary, modifier = Modifier.size(18.dp))
                                        }
                                    }
                                    Row(
                                        Modifier.fillMaxWidth(),
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
                                        Text("صفحة ${if (isSliding) previewPage else page} من 604", fontSize = 12.sp, color = theme.textSecondary)
                                        Text(
                                            "التالية",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = if (page < 604) theme.accent else theme.textSecondary,
                                            modifier = Modifier.clickable(enabled = page < 604) { page += 1 }.padding(6.dp),
                                        )
                                    }

                                    // Main-nav escape hatch — jump straight to a tab from the reader
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Text(
                                            "اليوم",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = theme.textPrimary,
                                            textAlign = TextAlign.Center,
                                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable { hudVisible = false; onNavigateMain("today") }
                                                .padding(vertical = 7.dp),
                                        )
                                        Text(
                                            "الأذكار",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = theme.textPrimary,
                                            textAlign = TextAlign.Center,
                                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable { hudVisible = false; onNavigateMain("athkar") }
                                                .padding(vertical = 7.dp),
                                        )
                                        Text(
                                            "الأدوات",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = theme.textPrimary,
                                            textAlign = TextAlign.Center,
                                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised.copy(alpha = 0.72f))
                                                .clickable { hudVisible = false; onNavigateMain("tools") }
                                                .padding(vertical = 7.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            "reading" -> {
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item(key = "khatmah-card") {
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(theme.surface)
                                .border(1.dp, theme.border, RoundedCornerShape(16.dp)).padding(16.dp),
                        ) {
                            Text("الختمة الجارية", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                            val donePages = khatmahDonePages
                            Text(
                                if (donePages != null) "أُنجز $donePages من 604 صفحة (${(donePages * 100 / 604)}%)" else "تقرأ حالياً صفحة $page من 604",
                                fontSize = 13.sp,
                                color = theme.textSecondary,
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(
                                onClick = { hubTab = "reader" },
                                colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast),
                            ) { Text("متابعة القراءة (ص $page)") }
                        }
                    }

                    item(key = "bookmarks-header") {
                        Text("العلامات المرجعية", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                    }
                    if (bookmarks.isEmpty()) {
                        item(key = "bookmarks-empty") {
                            Text("لا توجد علامات مرجعية بعد — اضغط أيقونة العلامة أثناء القراءة لحفظ موضعك.", fontSize = 13.sp, color = theme.textSecondary)
                        }
                    } else {
                        items(bookmarks.size, key = { idx -> "bm-$idx-${bookmarks[idx].first}" }) { idx ->
                            val (bPage, bLabel) = bookmarks[idx]
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(theme.surface)
                                    .border(1.dp, theme.border, RoundedCornerShape(14.dp))
                                    .clickable { page = bPage; hubTab = "reader" }.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Outlined.Bookmark, contentDescription = null, tint = theme.accent, modifier = Modifier.padding(end = 10.dp).size(18.dp))
                                Text(bLabel.ifEmpty { "صفحة $bPage" }, fontSize = 14.sp, color = theme.textPrimary, modifier = Modifier.weight(1f))
                                Text("ص $bPage", fontSize = 12.sp, color = theme.accent, style = TextStyle(fontFeatureSettings = "tnum"))
                            }
                        }
                    }
                }
            }
            "index" -> {
                val filteredSurahs by remember {
                    derivedStateOf {
                        val q = surahFilter.trim()
                        if (q.isEmpty()) surahs
                        else {
                            val normQ = SadaqaDb.normalizeArabicForSearch(q)
                            surahs.filter { s ->
                                s.nameAr.contains(q) ||
                                    (normQ.isNotEmpty() && s.normalizedName.contains(normQ)) ||
                                    s.number.toString().contains(q) ||
                                    s.translit.contains(q, ignoreCase = true)
                            }
                        }
                    }
                }
                Column(Modifier.weight(1f)) {
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
                                modifier = Modifier.clip(HUD_PILL_SHAPE).background(theme.surface)
                                    .border(1.dp, theme.border, HUD_PILL_SHAPE)
                                    .clickable { page = startP; hubTab = "reader" }
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            )
                        }
                    }
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(filteredSurahs, key = { it.number }, contentType = { "surah-row" }) { s ->
                            val rev = if (s.rev == "makkah" || s.rev == "Meccan") "مكية" else "مدنية"
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(theme.surface)
                                    .border(1.dp, theme.border, RoundedCornerShape(14.dp))
                                    .clickable { page = s.page; hubTab = "reader" }.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    Modifier.size(34.dp).clip(CircleShape).background(theme.surfaceRaised),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("${s.number}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                                }
                                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                    Text(s.nameAr, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                                    Text("$rev · ${s.ayahs} آية", fontSize = 11.sp, color = theme.textSecondary)
                                }
                                Text("ص ${s.page}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
                            }
                        }
                    }
                }
            }
        }

        // Segmented Liquid Glass Mushaf Hub bar — bottom thumb zone above the floating app nav
        if (hubTab != "reader") {
            Box(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 86.dp)) {
                LiquidGlassSurface(
                    shape = HUD_PILL_SHAPE,
                    elevation = 10.dp,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        for ((k, label) in MUSHAF_HUB_TABS) {
                            val active = hubTab == k
                            Text(
                                label,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (active) theme.accentContrast else theme.textSecondary,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.weight(1f).clip(HUD_PILL_SHAPE)
                                    .background(if (active) theme.accent else Color.Transparent)
                                    .clickable { hubTab = k }
                                    .padding(vertical = 8.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    // Reader Appearance — Mushaf font-scale slider (0.8×–2.0×) with live preview
    if (showAppearance) {
        ModalBottomSheet(
            onDismissRequest = { showAppearance = false },
            containerColor = theme.surface,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("مظهر القراءة", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "−",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = theme.textPrimary,
                        modifier = Modifier.size(44.dp).clip(CircleShape).background(theme.surfaceRaised)
                            .clickable { setMushafScale(mushafScale - 0.05f) }
                            .wrapContentSize(Alignment.Center),
                    )
                    Slider(
                        value = mushafScale,
                        onValueChange = { setMushafScale(it) },
                        valueRange = 0.8f..2.0f,
                        steps = 23, // 0.05 increments
                        colors = SliderDefaults.colors(thumbColor = theme.accent, activeTrackColor = theme.accent),
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "+",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = theme.textPrimary,
                        modifier = Modifier.size(44.dp).clip(CircleShape).background(theme.surfaceRaised)
                            .clickable { setMushafScale(mushafScale + 0.05f) }
                            .wrapContentSize(Alignment.Center),
                    )
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("حجم خط المصحف", fontSize = 13.sp, color = theme.textSecondary, modifier = Modifier.weight(1f))
                    Text("${(mushafScale * 100).roundToInt()}٪", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                }
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(theme.mushafBg)
                        .padding(vertical = 24.dp, horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "وَمَنْ أَعْرَضَ عَن ذِكْرِي فَإِنَّ لَهُ مَعِيشَةً ضَنكًا",
                        fontFamily = QpcFonts.uthmanic(context),
                        fontSize = (16f * mushafScale).sp,
                        color = theme.mushafText,
                        textAlign = TextAlign.Center,
                        lineHeight = (26f * mushafScale).sp,
                    )
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
                                        db.toggleBookmark(pNum, 1, activeAyah, "$sName $nis", System.currentTimeMillis())
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

private sealed interface AndroidFlowBlock {
    data class SurahName(val title: String) : AndroidFlowBlock
    data class Bismillah(val text: String) : AndroidFlowBlock
    data class Words(val items: List<MushafWordRow>) : AndroidFlowBlock
}

@Composable
private fun MushafPagePlate(
    page: Int,
    lines: List<MushafLineItem>,
    mushafScale: Float,
    selectedAyah: Int?,
    hudVisible: Boolean,
    onSelectAyah: (Int) -> Unit,
    onToggleHud: () -> Unit,
) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val baseDensity = LocalDensity.current
    val sample = remember(page, lines) {
        lines.firstOrNull { it.words.isNotEmpty() }?.words?.joinToString("") { it.glyphs } ?: ""
    }
    val verifiedPageFont = remember(page, sample) {
        if (sample.isEmpty()) null else QpcFonts.verifiedMushaf(context, page, sample)
    }
    val verifiedTypeface = remember(page, sample) {
        if (sample.isEmpty()) null else QpcFonts.verifiedMushafTypeface(context, page, sample)
    }
    val uthmanicFont = remember(context) { QpcFonts.uthmanic(context) }
    val uthmanicTypeface = remember(context) { QpcFonts.uthmanicTypeface(context) }
    val isZoomed = mushafScale > 1.01f

    val fixedDensity = remember(baseDensity.density) { Density(baseDensity.density, fontScale = 1f) }
    // Mushaf scales solely via mushafScale (0.8–2.0), never double-scaled by app fontScale
    CompositionLocalProvider(LocalDensity provides fixedDensity) {
        val density = LocalDensity.current
        BoxWithConstraints(
        Modifier.fillMaxSize()
            .pointerInput(Unit) { detectTapGestures { onToggleHud() } }
            .padding(horizontal = 9.dp, vertical = 2.dp),
        contentAlignment = if (isZoomed) Alignment.TopCenter else Alignment.Center,
    ) {
        val availWidthPx = with(density) { maxWidth.toPx() }.coerceAtLeast(100f)
        val slotCount = maxOf(lines.size, 15)
        val slotHeightDp = maxHeight / slotCount
        val uniformSp = remember(page, lines, maxWidth, maxHeight, mushafScale, verifiedPageFont) {
            if (isZoomed) {
                val baseSp = minOf(maxWidth.value / 11.2f, slotHeightDp.value * 0.82f, 32f)
                (baseSp * mushafScale).coerceIn(17f, 60f)
            } else {
                val tf = if (verifiedPageFont != null) (verifiedTypeface ?: uthmanicTypeface) else uthmanicTypeface
                val paint = android.graphics.Paint().apply {
                    typeface = tf
                    textSize = with(density) { 20f.sp.toPx() }
                }
                var maxLineW = 1f
                for (item in lines) {
                    if (item.kind != "text") continue
                    val txt = if (verifiedPageFont != null) item.words.joinToString(" ") { it.glyphs }
                    else item.words.joinToString(" ") { it.wordText }
                    val w = paint.measureText(txt)
                    if (w > maxLineW) maxLineW = w
                }
                val widthFitSp = (20f * (availWidthPx * 0.97f) / maxLineW).coerceIn(11f, 44f)
                val heightFitSp = (slotHeightDp.value * 0.82f * mushafScale).coerceIn(11f, 44f)
                minOf(widthFitSp, heightFitSp).coerceAtMost(slotHeightDp.value * 0.92f)
            }
        }

        if (isZoomed) {
            val flowBlocks = remember(lines) {
                val blocks = mutableListOf<AndroidFlowBlock>()
                val curWords = mutableListOf<MushafWordRow>()
                fun flush() {
                    if (curWords.isNotEmpty()) {
                        blocks.add(AndroidFlowBlock.Words(curWords.toList()))
                        curWords.clear()
                    }
                }
                for (item in lines) {
                    when (item.kind) {
                        "surah_name" -> {
                            flush()
                            blocks.add(AndroidFlowBlock.SurahName(item.textAr))
                        }
                        "bismillah" -> {
                            flush()
                            blocks.add(AndroidFlowBlock.Bismillah(item.textAr.ifEmpty { "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ" }))
                        }
                        else -> if (item.words.isNotEmpty()) curWords.addAll(item.words)
                    }
                }
                flush()
                blocks
            }

            Column(
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(
                        top = if (hudVisible) 116.dp else 10.dp,
                        bottom = if (hudVisible) 220.dp else 28.dp,
                    ),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                for (block in flowBlocks) {
                    when (block) {
                        is AndroidFlowBlock.SurahName -> Box(
                            Modifier.fillMaxWidth()
                                .padding(top = 4.dp)
                                .clip(RoundedCornerShape(10.dp)).background(theme.surface)
                                .border(1.dp, theme.accent.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                                .padding(vertical = 7.dp, horizontal = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(block.title, fontSize = minOf(uniformSp * 0.56f, 17f).coerceAtLeast(13f).sp, fontWeight = FontWeight.Bold, color = theme.accent, maxLines = 1)
                        }
                        is AndroidFlowBlock.Bismillah -> Text(
                            block.text,
                            fontFamily = uthmanicFont,
                            fontSize = (uniformSp * 0.96f).sp,
                            lineHeight = (uniformSp * 1.70f).sp,
                            color = theme.mushafText,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        )
                        is AndroidFlowBlock.Words -> {
                            val annotated = remember(block.items, selectedAyah, theme.accent) {
                                buildAnnotatedString {
                                    block.items.forEachIndexed { idx, w ->
                                        if (idx > 0) append(" ")
                                        pushStringAnnotation(tag = "ayah", annotation = w.ayahNumber.toString())
                                        if (selectedAyah == w.ayahNumber) {
                                            withStyle(SpanStyle(background = theme.accent.copy(alpha = 0.24f))) {
                                                append(w.wordText)
                                            }
                                        } else {
                                            append(w.wordText)
                                        }
                                        pop()
                                    }
                                }
                            }
                            var layoutResult by remember { mutableStateOf<TextLayoutResult?>(null) }
                            Text(
                                text = annotated,
                                style = TextStyle(
                                    fontFamily = uthmanicFont,
                                    fontSize = uniformSp.sp,
                                    lineHeight = (uniformSp * 1.85f).sp,
                                    color = theme.mushafText,
                                    textAlign = TextAlign.Justify,
                                    textDirection = TextDirection.Rtl,
                                ),
                                onTextLayout = { layoutResult = it },
                                modifier = Modifier.fillMaxWidth().pointerInput(annotated) {
                                    detectTapGestures(
                                        onTap = { onToggleHud() },
                                        onLongPress = { offset ->
                                            val lr = layoutResult ?: return@detectTapGestures
                                            val idx = lr.getOffsetForPosition(offset)
                                            val hit = annotated.getStringAnnotations("ayah", idx, idx).firstOrNull()
                                                ?: annotated.getStringAnnotations(
                                                    "ayah",
                                                    (idx - 1).coerceAtLeast(0),
                                                    (idx + 1).coerceAtMost(annotated.length),
                                                ).firstOrNull()
                                            hit?.item?.toIntOrNull()?.let(onSelectAyah)
                                        },
                                    )
                                },
                            )
                        }
                    }
                }
            }
        } else {
            val lineTf = if (verifiedPageFont != null) (verifiedTypeface ?: uthmanicTypeface) else uthmanicTypeface
            val linePaint = remember(lineTf, uniformSp, density) {
                android.graphics.Paint().apply {
                    typeface = lineTf
                    textSize = with(density) { uniformSp.sp.toPx() }
                }
            }
            val justifyFlags = remember(lines, verifiedPageFont, linePaint, availWidthPx, page) {
                lines.map { item ->
                    if (item.kind != "text" || page <= 2 || item.words.size < 3) false
                    else {
                        val lineText = if (verifiedPageFont != null) item.words.joinToString(" ") { it.glyphs }
                        else item.words.joinToString(" ") { it.wordText }
                        linePaint.measureText(lineText) >= availWidthPx * 0.58f
                    }
                }
            }

            Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = if (page <= 2) Arrangement.Center else Arrangement.SpaceEvenly,
            ) {
                lines.forEachIndexed { lineIdx, item ->
                    val rowMod = if (page <= 2) Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    else Modifier.weight(1f).fillMaxWidth()
                    Box(rowMod, contentAlignment = Alignment.Center) {
                        when (item.kind) {
                            "bismillah" -> {
                                val bsmlFont = remember(context, item.glyphs) { QpcFonts.verifiedBasmala(context, item.glyphs) }
                                if (bsmlFont != null) {
                                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                        Text(
                                            item.glyphs,
                                            fontFamily = bsmlFont,
                                            fontSize = (uniformSp * 1.04f).sp,
                                            color = theme.mushafText,
                                            textAlign = TextAlign.Center,
                                            maxLines = 1,
                                        )
                                    }
                                } else {
                                    Text(
                                        item.textAr.ifEmpty { "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ" },
                                        fontFamily = uthmanicFont,
                                        fontSize = uniformSp.sp,
                                        lineHeight = (uniformSp * 1.55f).sp,
                                        color = theme.mushafText,
                                        textAlign = TextAlign.Center,
                                        maxLines = 1,
                                    )
                                }
                            }
                            "surah_name" -> Box(
                                Modifier.fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp)).background(theme.surface)
                                    .border(1.dp, theme.accent.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                                    .padding(vertical = 3.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(item.textAr, fontSize = minOf(uniformSp * 0.85f, 16f).sp, fontWeight = FontWeight.Bold, color = theme.accent, maxLines = 1)
                            }
                            "text" -> {
                                val justify = justifyFlags.getOrElse(lineIdx) { false }
                                val activeFont = verifiedPageFont ?: uthmanicFont

                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = if (justify) Arrangement.SpaceBetween else Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    for (w in item.words) {
                                        Text(
                                            if (verifiedPageFont != null) w.glyphs else w.wordText,
                                            fontFamily = activeFont,
                                            fontSize = uniformSp.sp,
                                            color = theme.mushafText,
                                            maxLines = 1,
                                            softWrap = false,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(if (selectedAyah == w.ayahNumber) theme.accent.copy(alpha = 0.20f) else Color.Transparent)
                                                // Long-press is the ONLY way to select an ayah — a quick
                                                // tap toggles the HUD, exactly like the plate around it
                                                .pointerInput(w.ayahNumber) {
                                                    detectTapGestures(
                                                        onTap = { onToggleHud() },
                                                        onLongPress = { onSelectAyah(w.ayahNumber) },
                                                    )
                                                },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        }
    }
}

// ---------------------------------------------------------------------------
// Tools hub + Qibla + Hijri + Zakat + Qiyam + Settings + Backup + Audio
// ---------------------------------------------------------------------------

@Immutable
private data class ToolEntry(val key: String, val icon: ImageVector, val name: String, val sub: String)

private val TOOLS_PAIRS: List<List<ToolEntry>> = listOf(
    ToolEntry("qibla", Icons.Outlined.Explore, "القبلة", "بوصلة محددة القبلة"),
    ToolEntry("hijri", Icons.Outlined.DateRange, "التقويم الهجري", "الأيام البيضاء والمناسبات"),
    ToolEntry("zakat", Icons.Outlined.Calculate, "حاسبة الزكاة", "الذهب والفضة والنقود"),
    ToolEntry("qiyam", Icons.Outlined.NightsStay, "حاسبة القيام", "منتصف الليل والثلث الأخير"),
    ToolEntry("tasbih", Icons.Outlined.Adjust, "السبحة", "السبحة الإلكترونية"),
    ToolEntry("backup", Icons.Outlined.Save, "النسخ الاحتياطي", "ملف .sadaqa — دمج أو استبدال"),
    ToolEntry("audio", Icons.Outlined.Headphones, "التلاوة", "الحزم الصوتية والتشغيل"),
    ToolEntry("settings", Icons.Outlined.Settings, "الإعدادات", "المظهر والموقع وطريقة الحساب"),
).chunked(2)

private val COMPASS_DIRS: List<String> = listOf("ش", "ش.شر", "شر", "ج.شر", "ج", "ج.غ", "غ", "ش.غ")
private val HIJRI_DOWS: List<String> = listOf("ح", "ن", "ث", "ر", "خ", "ج", "س")

@Composable
fun ToolsScreen(db: SadaqaDb, initialSub: String? = null, onClearInitial: () -> Unit = {}) {
    val theme = LocalSadaqaTheme.current
    var sub by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(initialSub) {
        if (initialSub != null) {
            sub = initialSub
            onClearInitial()
        }
    }

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
        for (pair in TOOLS_PAIRS) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (t in pair) {
                    Column(
                        Modifier.weight(1f).defaultMinSize(minHeight = 122.dp).clip(RoundedCornerShape(16.dp))
                            .background(theme.surface).border(1.dp, theme.border, RoundedCornerShape(16.dp))
                            .tactilePress { sub = t.key }.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(
                            Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(theme.accent.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(t.icon, contentDescription = null, tint = theme.accent, modifier = Modifier.size(20.dp))
                        }
                        Text(t.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                        Text(t.sub, fontSize = 12.sp, color = theme.textSecondary, lineHeight = 16.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(96.dp))
    }
}

@Composable
fun SubHeader(title: String, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 8.dp)) {
        Icon(Icons.Outlined.ArrowForward, contentDescription = "رجوع", tint = theme.textSecondary, modifier = Modifier.clickable { onBack() }.padding(6.dp).size(20.dp))
        Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
    }
}

// Qibla — engine bearing + live SensorManager compass + manual dial fallback.
@Composable
fun QiblaScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var opts by remember { mutableStateOf(db.engineOptions()) }
    // Qibla uses the exact live GPS fix when one is persisted, else the city coords
    val gpsFix = remember(opts) { db.setting("location")?.get("gps") }
    val qLat = gpsFix?.get("lat")?.dbl ?: opts.lat
    val qLng = gpsFix?.get("lng")?.dbl ?: opts.lng
    val bearing = remember(opts) { QiblaEngine.qiblaBearing(qLat, qLng) }
    val distKm = remember(opts) { QiblaEngine.distanceKm(qLat, qLng) }
    var northDeg by remember { mutableDoubleStateOf(0.0) }
    var hasSensor by remember { mutableStateOf(false) }
    var gpsMsg by remember { mutableStateOf<String?>(null) }
    var cityLabel by remember {
        val loc = db.setting("location")
        val name = loc?.get("name_ar")?.str ?: "مكة المكرمة"
        mutableStateOf(if (loc?.get("gps") != null) "$name · GPS" else name)
    }

    val declination = remember(qLat, qLng) {
        android.hardware.GeomagneticField(qLat.toFloat(), qLng.toFloat(), 0f, System.currentTimeMillis()).declination
    }
    DisposableEffect(context, qLat, qLng, declination) {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val rot = sm?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        val listener = object : SensorEventListener {
            private val rMat = FloatArray(9)
            private val mapped = FloatArray(9)
            private val ori = FloatArray(3)
            override fun onSensorChanged(event: SensorEvent) {
                SensorManager.getRotationMatrixFromVector(rMat, event.values)
                // Map the device frame to the flat screen frame so azimuth stays true
                // regardless of display rotation.
                val rotation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    runCatching { context.display?.rotation }.getOrNull()
                } else {
                    @Suppress("DEPRECATION")
                    (context.getSystemService(Context.WINDOW_SERVICE) as? android.view.WindowManager)?.defaultDisplay?.rotation
                } ?: android.view.Surface.ROTATION_0
                when (rotation) {
                    android.view.Surface.ROTATION_90 -> SensorManager.remapCoordinateSystem(rMat, SensorManager.AXIS_Y, SensorManager.AXIS_MINUS_X, mapped)
                    android.view.Surface.ROTATION_180 -> SensorManager.remapCoordinateSystem(rMat, SensorManager.AXIS_MINUS_X, SensorManager.AXIS_MINUS_Y, mapped)
                    android.view.Surface.ROTATION_270 -> SensorManager.remapCoordinateSystem(rMat, SensorManager.AXIS_MINUS_Y, SensorManager.AXIS_X, mapped)
                    else -> SensorManager.remapCoordinateSystem(rMat, SensorManager.AXIS_X, SensorManager.AXIS_Y, mapped)
                }
                SensorManager.getOrientation(mapped, ori)
                var deg = (Math.toDegrees(ori[0].toDouble()) + 360.0) % 360.0
                // getOrientation azimuth is relative to MAGNETIC north — convert
                // to true north with the local declination (east-positive)
                deg = (deg + declination + 360.0) % 360.0
                northDeg = deg
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        if (sm != null && rot != null) {
            hasSensor = sm.registerListener(listener, rot, SensorManager.SENSOR_DELAY_UI)
        }
        onDispose { sm?.unregisterListener(listener) }
    }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants[Manifest.permission.ACCESS_FINE_LOCATION] == true || grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true) {
            gpsMsg = "جارٍ تحديد موقعك…"
            scope.launch {
                val loc = freshLocationOrNull(context)
                if (loc == null) { gpsMsg = "تعذر تحديد الإحداثيات الحالية."; return@launch }
                val city = withContext(Dispatchers.IO) {
                    db.findNearestCity(loc.latitude, loc.longitude)?.also { db.selectCity(it, gpsLat = loc.latitude, gpsLng = loc.longitude) }
                }
                if (city != null) {
                    opts = db.engineOptions()
                    cityLabel = "${city.nameAr} · GPS"
                    gpsMsg = null
                } else gpsMsg = "لم يتم العثور على مدينة قريبة."
            }
        } else gpsMsg = "يلزم السماح بالموقع لتحديث إحداثيات القبلة."
    }

    val dialAngle = (((bearing - northDeg) % 360.0) + 360.0) % 360.0
    val diff = abs(((dialAngle + 540.0) % 360.0) - 180.0)
    val aligned = diff <= 5.0
    var animNorth by remember { mutableFloatStateOf(northDeg.toFloat()) }
    var animDial by remember { mutableFloatStateOf(dialAngle.toFloat()) }
    LaunchedEffect(northDeg) {
        val delta = (((northDeg - animNorth) % 360.0 + 540.0) % 360.0) - 180.0
        animNorth += delta.toFloat()
    }
    LaunchedEffect(dialAngle) {
        val delta = (((dialAngle - animDial) % 360.0 + 540.0) % 360.0) - 180.0
        animDial += delta.toFloat()
    }
    val smoothNorth by animateFloatAsState(
        targetValue = animNorth,
        animationSpec = spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
        label = "qibla-north",
    )
    val smoothDial by animateFloatAsState(
        targetValue = animDial,
        animationSpec = spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
        label = "qibla-dial",
    )
    LaunchedEffect(aligned) { if (aligned && hasSensor) Haptics.tick(context) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SubHeader("القبلة", onBack)
        Text(cityLabel, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
        val density = LocalDensity.current
        val compassRadiusPx = remember(density) { with(density) { 114.dp.toPx() } }
        Box(
            Modifier.size(280.dp).clip(CircleShape)
                .background(theme.surface)
                .border(2.dp, if (aligned) theme.accent else theme.border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            COMPASS_DIRS.forEachIndexed { idx, label ->
                Text(
                    label,
                    fontSize = 11.sp,
                    fontWeight = if (idx == 0) FontWeight.Bold else FontWeight.Normal,
                    color = if (idx == 0) theme.accent else theme.textSecondary,
                    modifier = Modifier.offset {
                        val rad = Math.toRadians(idx * 45.0 - smoothNorth)
                        IntOffset(
                            x = (sin(rad) * compassRadiusPx).roundToInt(),
                            y = (-cos(rad) * compassRadiusPx).roundToInt(),
                        )
                    },
                )
            }
            // Rotate around center FIRST in draw/layer phase, then offset outward so the Kaaba emblem orbits the compass ring
            Canvas(Modifier.graphicsLayer { rotationZ = smoothDial }.offset(y = (-78).dp).size(26.dp)) {
                drawRect(color = Color(0xFF141816), size = size)
                drawRect(color = theme.accent, topLeft = Offset(0f, size.height * 0.22f), size = Size(size.width, size.height * 0.18f))
            }
            if (aligned) {
                Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = theme.accent, modifier = Modifier.size(22.dp))
            } else {
                Text("▲", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
            }
        }
        Text("${dialAngle.roundToInt()}°", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, style = TextStyle(fontFeatureSettings = "tnum"))
        if (aligned) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = theme.accent, modifier = Modifier.size(16.dp))
                Text("باتجاه القبلة", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = theme.accent)
            }
        }
        Text(
            if (hasSensor) "البوصلة الحية نشطة — وجّه الهاتف نحو رمز الكعبة"
            else "وضع المعايرة اليدوي (لا يتوفر مستشعر اتجاه على هذا الجهاز)",
            fontSize = 12.sp,
            color = theme.textSecondary,
            textAlign = TextAlign.Center,
        )
        if (!hasSensor) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { northDeg = (northDeg - 5.0 + 360.0) % 360.0 }) { Text("−5°") }
                Button(onClick = { northDeg = (northDeg + 5.0) % 360.0 }) { Text("+5°") }
            }
        }
        Button(onClick = {
            if (hasLocationPermission(context)) {
                gpsMsg = "جارٍ تحديد موقعك…"
                scope.launch {
                    val loc = freshLocationOrNull(context)
                    if (loc == null) { gpsMsg = "تعذر الحصول على الموقع الحالي."; return@launch }
                    val city = withContext(Dispatchers.IO) {
                        db.findNearestCity(loc.latitude, loc.longitude)?.also { db.selectCity(it, gpsLat = loc.latitude, gpsLng = loc.longitude) }
                    }
                    if (city != null) {
                        opts = db.engineOptions()
                        cityLabel = "${city.nameAr} · GPS"
                        gpsMsg = null
                    } else gpsMsg = "لم يتم العثور على مدينة قريبة."
                }
            } else {
                permLauncher.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
            }
        }) {
            Icon(Icons.Outlined.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("تحديث موقعي (GPS)")
        }
        gpsMsg?.let { Text(it, fontSize = 12.sp, color = Color(0xFFE5636F)) }
        if (distKm < 5.0) {
            // Degenerate coords (Mecca default / GPS inside the sanctuary) — a
            // bearing readout here would be a misleading 0.0°
            Text(
                "موقعك قريب جداً من الكعبة — فعّل GPS لتحديد الاتجاه الدقيق من مكانك.",
                fontSize = 12.sp,
                color = theme.textSecondary,
                textAlign = TextAlign.Center,
            )
        } else {
            Text(String.format(Locale.US, "الاتجاه من موقعك إلى الكعبة: %.1f° · المسافة %.0f كم", bearing, distKm), fontSize = 12.sp, color = theme.textSecondary)
        }
        Spacer(Modifier.height(96.dp))
    }
}

@Immutable
private data class HijriMonthModel(
    val rows: List<List<Triple<Int, Boolean, Boolean>?>>,
    val monthEvents: List<HijriEngine.IslamicEvent>,
)

// Hijri calendar — umalqura grid + White Days + 5 events (engine port).
@Composable
fun HijriScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val tzId = remember { db.engineOptions().timeZone }
    var adjust by remember { mutableIntStateOf(db.hijriAdjust()) }
    var month by remember { mutableStateOf(HijriEngine.toHijri(isoOf(System.currentTimeMillis(), tzId))) }

    LaunchedEffect(Unit) {
        adjust = withContext(Dispatchers.IO) { db.hijriAdjust() }
    }

    val monthModel = remember(month, adjust, tzId) {
        val firstIso = runCatching { HijriEngine.fromHijri(HijriEngine.HijriDate(month.y, month.m, 1)) }.getOrNull()
            ?: return@remember null
        val firstDow = HijriEngine.weekdayOf(firstIso)
        val todayIso = isoOf(System.currentTimeMillis(), tzId)
        val todayHijri = HijriEngine.withAdjust(todayIso, adjust)
        val length = if (runCatching { HijriEngine.fromHijri(HijriEngine.HijriDate(month.y, month.m, 30)) }.isSuccess) 30 else 29
        val cells = List(firstDow) { null } + (1..length).map { d ->
            val isToday = HijriEngine.HijriDate(month.y, month.m, d) == todayHijri
            Triple(d, isToday, d in 13..15)
        }
        val lastIso = runCatching { HijriEngine.fromHijri(HijriEngine.HijriDate(month.y, month.m, length)) }.getOrNull() ?: firstIso
        val startYear = firstIso.substring(0, 4).toIntOrNull() ?: LocalDate.now().year
        val endYear = lastIso.substring(0, 4).toIntOrNull() ?: startYear
        val events = (startYear..endYear)
            .flatMap { HijriEngine.events(it) }
            .distinctBy { it.key to it.gregorian }
            .filter { ev ->
                val adj = HijriEngine.withAdjust(ev.gregorian, adjust)
                adj.y == month.y && adj.m == month.m
            }
        HijriMonthModel(rows = cells.chunked(7), monthEvents = events)
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
    ) {
        SubHeader("التقويم الهجري", onBack)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = { month = shiftMonth(month, -1) }) {
                Icon(Icons.Outlined.ChevronRight, contentDescription = "الشهر السابق", modifier = Modifier.size(18.dp))
            }
            Text("${HijriEngine.monthNameAr(month.m)} ${month.y} هـ", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Button(onClick = { month = shiftMonth(month, 1) }) {
                Icon(Icons.Outlined.ChevronLeft, contentDescription = "الشهر التالي", modifier = Modifier.size(18.dp))
            }
        }
        if (monthModel != null) {
            Row(Modifier.fillMaxWidth()) {
                for (d in HIJRI_DOWS) Text(d, fontSize = 11.sp, color = theme.textSecondary, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            }
            for (row in monthModel.rows) {
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
            for (ev in monthModel.monthEvents) {
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) {
                    Text(eventNameAr(ev.key), fontSize = 13.sp, color = theme.textPrimary, modifier = Modifier.weight(1f))
                    Text(ev.gregorian, fontSize = 13.sp, color = theme.textSecondary)
                }
            }
        }
        Spacer(Modifier.height(96.dp))
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

@Immutable
private data class ZakatInputs(
    val cash: String = "",
    val gold: String = "",
    val silver: String = "",
    val goods: String = "",
    val debts: String = "",
    val goldPrice: String = "",
    val silverPrice: String = "",
    val standard: String = "gold",
)

private val ZAKAT_FIELDS: List<Pair<String, String>> = listOf(
    "النقود" to "cash",
    "الذهب (جرام)" to "gold",
    "الفضة (جرام)" to "silver",
    "السلع والتجارة" to "goods",
    "الديون عليك" to "debts",
    "سعر جرام الذهب" to "goldPrice",
    "سعر جرام الفضة" to "silverPrice",
)

// Zakat — cash/gold/silver/goods/debts + gold/silver nisab, inputs persisted.
@Composable
fun ZakatScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val scope = rememberCoroutineScope()
    var inputs by remember { mutableStateOf(ZakatInputs()) }

    LaunchedEffect(Unit) {
        val saved = withContext(Dispatchers.IO) { db.setting("zakat_inputs") } ?: return@LaunchedEffect
        if (saved.obj != null) {
            inputs = ZakatInputs(
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
        for ((label, key) in ZAKAT_FIELDS) {
            val value = when (key) {
                "cash" -> inputs.cash; "gold" -> inputs.gold; "silver" -> inputs.silver
                "goods" -> inputs.goods; "debts" -> inputs.debts
                "goldPrice" -> inputs.goldPrice; else -> inputs.silverPrice
            }
            TextField(
                value = value,
                onValueChange = { v ->
                    val nextInputs = when (key) {
                        "cash" -> inputs.copy(cash = v); "gold" -> inputs.copy(gold = v)
                        "silver" -> inputs.copy(silver = v); "goods" -> inputs.copy(goods = v)
                        "debts" -> inputs.copy(debts = v); "goldPrice" -> inputs.copy(goldPrice = v)
                        else -> inputs.copy(silverPrice = v)
                    }
                    inputs = nextInputs
                    scope.launch {
                        withContext(Dispatchers.IO) {
                            db.setSetting("zakat_inputs", JsonValue.Obj(mapOf(
                                "cash" to JsonValue.Str(nextInputs.cash), "gold" to JsonValue.Str(nextInputs.gold),
                                "silver" to JsonValue.Str(nextInputs.silver), "goods" to JsonValue.Str(nextInputs.goods),
                                "debts" to JsonValue.Str(nextInputs.debts), "goldPrice" to JsonValue.Str(nextInputs.goldPrice),
                                "silverPrice" to JsonValue.Str(nextInputs.silverPrice), "standard" to JsonValue.Str(nextInputs.standard),
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
        Spacer(Modifier.height(96.dp))
    }
}

// Qiyam — tonight's windows (the night whose fajr hasn't passed).
@Composable
fun QiyamScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val qiyamData = remember {
        val opts = db.engineOptions()
        val now = System.currentTimeMillis()
        val today = runCatching { PrayerEngine.sunnahWindows(isoOf(now, opts.timeZone), opts) }.getOrNull()
        val yest = runCatching { PrayerEngine.sunnahWindows(PrayerEngine.shiftCivilIso(isoOf(now, opts.timeZone), -1), opts) }.getOrNull()
        val tonight = if (yest != null && now < yest.nextFajr) yest else today
        listOf(
            "منتصف الليل" to tonight?.midnight?.let { clockOf(it, opts.timeZone) },
            "الثلث الأخير" to tonight?.lastThird?.let { clockOf(it, opts.timeZone) },
            "الفجر" to tonight?.nextFajr?.let { clockOf(it, opts.timeZone) },
        )
    }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SubHeader("القيام", onBack)
        CardBox {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((label, formatted) in qiyamData) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary, modifier = Modifier.weight(1f))
                        Text(
                            formatted ?: "—",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = theme.accent,
                            style = TextStyle(fontFeatureSettings = "tnum", textDirection = TextDirection.Ltr),
                        )
                    }
                }
            }
        }
        Text("خطة القيام: نام بعد العشاء واستيقظ قبل الفجر بـ ٧٠ دقيقة — الليل أفضل ساعة للدعاء.", fontSize = 13.sp, color = theme.textSecondary, lineHeight = 20.sp)
        Spacer(Modifier.height(96.dp))
    }
}

private val FONT_PRESETS: List<Pair<Float, String>> = listOf(
    0.85f to "صغير",
    1.0f to "متوسط",
    1.3f to "كبير",
    1.6f to "كبير جداً",
)

private val CALC_METHOD_CHUNKS: List<List<String>> = PrayerEngine.CALC_METHODS.chunked(3)

private fun themeLabelAr(key: String): String = when (key) {
    "dark" -> "داكنة"
    "light" -> "فاتحة"
    "sepia" -> "ورقية"
    "night", "oled" -> "ليلية"
    else -> key
}

// Settings — 4 themes, city/GPS, font scale, 13 calc methods, madhab, HLR, hijri adjust.
@Composable
fun SettingsScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val app = context.applicationContext as app.sadaqa.android.SadaqaApp
    val scope = rememberCoroutineScope()
    val activeThemeKey by app.themeKey.collectAsState()
    val fontScale by app.fontScale.collectAsState()
    var mushafScale by remember { mutableFloatStateOf((db.setting("mushaf_scale")?.dbl ?: 1.0).toFloat().coerceIn(0.8f, 2.0f)) }
    var opts by remember { mutableStateOf(db.engineOptions()) }
    var hijriAdjust by remember { mutableIntStateOf(db.hijriAdjust()) }
    var cityName by remember { mutableStateOf(db.locationNameAr()) }
    var showCityPicker by remember { mutableStateOf(false) }
    var showAbout by remember { mutableStateOf(false) }
    var method by remember { mutableStateOf(db.setting("calc_method")?.str ?: "umm_al_qura") }
    val exactAlarmsBlocked = remember(context) {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            (context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager)?.canScheduleExactAlarms() == false
    }

    LaunchedEffect(Unit) {
        hijriAdjust = withContext(Dispatchers.IO) { db.hijriAdjust() }
    }

    val activePreset = remember(fontScale) {
        FONT_PRESETS.minByOrNull { abs(it.first - fontScale) }?.first ?: 1.0f
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SubHeader("الإعدادات", onBack)
        Text("المدينة والموقع", fontSize = 13.sp, color = theme.textSecondary)
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(theme.surface)
                .border(1.dp, theme.border, RoundedCornerShape(12.dp))
                .clickable { showCityPicker = true }.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(cityName, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                Text(
                    String.format(Locale.US, "%s · %.2f, %.2f", opts.timeZone, opts.lat, opts.lng),
                    fontSize = 11.sp,
                    color = theme.textSecondary,
                )
            }
            Text("تغيير / GPS", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
        }
        // Android 14+ revokes SCHEDULE_EXACT_ALARM by default — the adhan
        // chain degrades to inexact alarms, so deep-link the user to the
        // system grant (audit 2026-11).
        if (exactAlarmsBlocked) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(theme.surface)
                    .border(1.dp, theme.border, RoundedCornerShape(12.dp))
                    .clickable {
                        runCatching {
                            context.startActivity(
                                Intent(AndroidSettings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                                    .setData(Uri.fromParts("package", context.packageName, null)),
                            )
                        }
                    }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("تنبيهات الأذان الدقيقة معطّلة", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                    Text("اسمح للتطبيق بجدولة التنبيهات بدقة من إعدادات النظام", fontSize = 11.sp, color = theme.textSecondary)
                }
                Text("تفعيل", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
            }
        }
        Text("السمة", fontSize = 13.sp, color = theme.textSecondary)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (t in OFFERED_THEMES) {
                val preview = SadaqaTheme.colors(t)
                val isSelected = activeThemeKey == t || (activeThemeKey == "oled" && t == "night")
                Text(
                    themeLabelAr(t),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = preview.textPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(preview.surface)
                        .border(if (isSelected) 2.dp else 1.dp, if (isSelected) theme.accent else theme.border, RoundedCornerShape(12.dp))
                        .clickable { app.setTheme(t) }
                        .padding(vertical = 10.dp),
                )
            }
        }
        Text("حجم الخط", fontSize = 13.sp, color = theme.textSecondary)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((presetVal, label) in FONT_PRESETS) {
                val active = abs(activePreset - presetVal) < 0.01f
                Text(
                    label,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (active) theme.accentContrast else theme.textPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .weight(1f)
                        .clip(HUD_PILL_SHAPE)
                        .background(if (active) theme.accent else theme.surfaceRaised)
                        .clickable { app.setFontScale(presetVal) }
                        .padding(vertical = 8.dp),
                )
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("حجم خط المصحف", fontSize = 13.sp, color = theme.textSecondary, modifier = Modifier.weight(1f))
            Text("${(mushafScale * 100).roundToInt()}٪", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = theme.accent)
        }
        Slider(
            value = mushafScale,
            onValueChange = {
                val stepped = ((it * 20f).roundToInt().toFloat() / 20f).coerceIn(0.8f, 2.0f)
                mushafScale = stepped
                // IO dispatcher + gated widget refresh (HUD parity + audit 2026-11
                // write-storm: every tick re-scheduled exact alarms on main)
                scope.launch { withContext(Dispatchers.IO) { db.setSetting("mushaf_scale", JsonValue.Num(stepped.toDouble())) } }
            },
            valueRange = 0.8f..2.0f,
            steps = 23,
            colors = SliderDefaults.colors(thumbColor = theme.accent, activeTrackColor = theme.accent),
        )
        Text("طريقة الحساب", fontSize = 13.sp, color = theme.textSecondary)
        // 12 methods — compact chips
        for (chunk in CALC_METHOD_CHUNKS) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (m in chunk) {
                    Text(
                        m,
                        fontSize = 11.sp,
                        color = if (method == m) theme.accentContrast else theme.textPrimary,
                        modifier = Modifier
                            .clip(HUD_PILL_SHAPE)
                            .background(if (method == m) theme.accent else theme.surfaceRaised)
                            .clickable {
                                method = m
                                scope.launch {
                                    withContext(Dispatchers.IO) {
                                        db.setSetting("calc_method", JsonValue.Str(m))
                                    }
                                    opts = withContext(Dispatchers.IO) { db.engineOptions() }
                                }
                            }
                            .padding(horizontal = 8.dp, vertical = 5.dp),
                    )
                }
            }
        }
        Text("المذهب (العصر): ${if (opts.madhab == "hanafi") "الحنفي" else "الشافعي"} — بدّلها من ملف الإعدادات المتقدم", fontSize = 12.sp, color = theme.textSecondary)
        Text("تعديل الهجري: $hijriAdjust (±٣) — يُطبَّق على العرض فقط", fontSize = 12.sp, color = theme.textSecondary)
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(theme.surface)
                .border(1.dp, theme.border, RoundedCornerShape(12.dp))
                .clickable { showAbout = true }.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("عن التطبيق", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, modifier = Modifier.weight(1f))
            Text("عرض", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
        }
        Spacer(Modifier.height(96.dp))
    }
    if (showAbout) {
        AlertDialog(
            onDismissRequest = { showAbout = false },
            containerColor = theme.surface,
            title = { Text("عن التطبيق — صدقة جارية", color = theme.textPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("«صدقة جارية» — مصحف كامل وأذكار ومواقيت وختمة تعمل دون اتصال، وبياناتك تبقى على جهازك.", fontSize = 14.sp, color = theme.textPrimary, lineHeight = 22.sp)
                    Text(
                        "هذا المشروع صدقة جارية وليّةً لله تعالى، مُهداة عن المطوّر ixboss ووالديه وأحبته جميعاً — فمن انتفع به فليدعُ لهم بالثواب والأجر.",
                        fontSize = 13.sp, color = theme.textSecondary, lineHeight = 21.sp,
                    )
                }
            },
            confirmButton = {
                Button(onClick = { showAbout = false }, colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast)) {
                    Text("حسناً")
                }
            },
        )
    }
    if (showCityPicker) {
        CityPickerDialog(
            db = db,
            onSelected = { city ->
                opts = db.engineOptions()
                cityName = city.nameAr
                showCityPicker = false
            },
            onDismiss = { showCityPicker = false },
        )
    }
}

// Backup — .sadaqa export via SAF (CREATE_DOCUMENT) + import (OPEN_DOCUMENT)
// with Merge and Full Replace (web contract; SAF = the §3 platform hook).
@Composable
fun BackupScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val app = context.applicationContext as app.sadaqa.android.SadaqaApp
    var importMode by remember { mutableStateOf("merge") }
    var report by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var counts by remember { mutableStateOf(mapOf<String, Int>()) }

    suspend fun refreshCounts() {
        withContext(Dispatchers.IO) {
            val pairs: List<Pair<String, String>> = listOf(
                "bookmarks" to "SELECT COUNT(*) AS n FROM bookmarks WHERE deleted = 0",
                "highlights" to "SELECT COUNT(*) AS n FROM highlights WHERE deleted = 0",
                "notes" to "SELECT COUNT(*) AS n FROM notes WHERE deleted = 0",
                "khatmah_plans" to "SELECT COUNT(*) AS n FROM khatmah_plans WHERE deleted = 0",
                "tasbih_counters" to "SELECT COUNT(*) AS n FROM tasbih_counters WHERE deleted = 0",
                "tasbih_sessions" to "SELECT COUNT(*) AS n FROM tasbih_sessions",
                "adhkar_state" to "SELECT COUNT(*) AS n FROM adhkar_state",
                "streak_days" to "SELECT COUNT(*) AS n FROM streak_days",
            )
            val next = pairs.associate { (t, sql) -> t to (db.queryOne(sql)?.longs?.get("n")?.toInt() ?: 0) }
            withContext(Dispatchers.Main) { counts = next }
        }
    }

    LaunchedEffect(Unit) { refreshCounts() }

    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) {
            scope.launch {
                runCatching {
                    withContext(Dispatchers.IO) {
                        val now = System.currentTimeMillis()
                        val (manifest, payloadJson) = db.buildExportPayload(now)
                        val doc = CanonicalJson.serialize(JsonValue.Obj(mapOf("manifest" to manifest, "payload" to runCatching { CanonicalJson.parse(payloadJson) }.getOrDefault(JsonValue.Null))))
                        context.contentResolver.openOutputStream(uri)?.use { it.write(doc.toByteArray(Charsets.UTF_8)) }
                        val countsJson = CanonicalJson.serialize(manifest["entities"] ?: JsonValue.Obj(emptyMap()))
                        db.execute("INSERT INTO backup_log (direction, mode, format_version, counts_json, created_at) VALUES ('export', NULL, 1, ?, ?)", listOf(countsJson, now))
                    }
                }.onSuccess {
                    error = null
                    report = "تم التصدير"
                }.onFailure { e ->
                    error = e.message ?: "تعذر التصدير"
                }
            }
        }
    }
    var pendingReplaceUri by remember { mutableStateOf<android.net.Uri?>(null) }

    fun runImport(uri: android.net.Uri) {
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val maxBytes = 16L * 1024 * 1024
                    val size = context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
                    if (size > maxBytes) throw IllegalArgumentException("حجم ملف النسخة يتجاوز الحد المسموح (16 ميجابايت)")
                    val text = context.contentResolver.openInputStream(uri)?.use { stream ->
                        val limited = ByteArray(maxBytes.toInt() + 1)
                        var total = 0
                        while (total < limited.size) {
                            val n = stream.read(limited, total, limited.size - total)
                            if (n <= 0) break
                            total += n
                        }
                        if (total > maxBytes) throw IllegalArgumentException("حجم ملف النسخة يتجاوز الحد المسموح (16 ميجابايت)")
                        String(limited, 0, total, Charsets.UTF_8)
                    } ?: ""
                    db.importBackup(text, importMode)
                }
            }.onSuccess { r ->
                error = null
                report = "تم الاستيراد: أُضيف ${r.added}، حُدِّث ${r.updated}، تعارض ${r.conflicts}، تخطي ${r.skipped}"
                app.refreshPreferencesFromDb(db)
                WidgetNotifier.prayersChanged()
                refreshCounts()
            }.onFailure { e ->
                error = e.message ?: "تعذر الاستيراد"
            }
        }
    }

    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            if (importMode == "replace") {
                pendingReplaceUri = uri
            } else {
                runImport(uri)
            }
        }
    }

    pendingReplaceUri?.let { confirmUri ->
        AlertDialog(
            onDismissRequest = { pendingReplaceUri = null },
            title = { Text("تأكيد الاستبدال الكامل") },
            text = { Text("سيتم مسح جميع بيانات القراءة والأذكار والتسبيح والإعدادات المحلية واستبدالها بمحتوى هذا الملف. هل تريد المتابعة؟") },
            confirmButton = {
                TextButton(onClick = {
                    pendingReplaceUri = null
                    runImport(confirmUri)
                }) { Text("استبدال", color = Color(0xFFE5636F)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingReplaceUri = null }) { Text("إلغاء") }
            },
        )
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
            onClick = { exportLauncher.launch(String.format(Locale.US, "sadaqa-backup-%s.sadaqa", LocalDate.now())) },
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
        Spacer(Modifier.height(96.dp))
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

// Audio — pack catalog + per-surah downloads + starter playback (offline).
@Composable
fun AudioScreen(db: SadaqaDb, onBack: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val player = remember { PlayerChain() }
    DisposableEffect(player) {
        onDispose { player.stop() }
    }
    var surah by remember { mutableIntStateOf(1) }
    var playing by remember { mutableStateOf<String?>(null) }
    var audioNote by remember { mutableStateOf<String?>(null) }
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
                    val id = s("reciter_id").ifEmpty { s("id") }
                    val nameAr = s("name_ar").ifEmpty { s("nameAr") }
                    Reciter(id, nameAr, s("style"), s("audio_url_template").replace("{SSSAAA}", ""))
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
        audioNote?.let { Text(it, fontSize = 12.sp, color = theme.textSecondary) }
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
                            audioNote = null
                            playing = r.id
                            player.play(file) { playing = null }
                        } else {
                            audioNote = "التلاوة غير محمّلة محلياً (الحزمة المدمجة تغطي سورة الفاتحة — العفاسي)"
                        }
                    }.padding(8.dp),
                )
            }
        }
        Spacer(Modifier.height(96.dp))
    }
}

@Immutable
private data class SearchResultRow(val id: Long, val numberInSurah: Int, val surahName: String, val text: String)

// Search — universal FTS5 (vocalized input OK; index normalized at ingestion).
@Composable
fun SearchSheet(db: SadaqaDb, onClose: () -> Unit) {
    val theme = LocalSadaqaTheme.current
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(listOf<SearchResultRow>()) }

    LaunchedEffect(query) {
        val trimmed = query.trim()
        if (trimmed.length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(180L)
        results = withContext(Dispatchers.IO) {
            val term = SadaqaDb.ftsQuery(trimmed) ?: return@withContext emptyList()
            runCatching {
                db.query(
                    "SELECT a.ayah_number AS id, a.number_in_surah AS n, a.text_uthmani AS t, s.name_ar AS sn FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.ayah_number IN (SELECT rowid FROM fts_ayahs WHERE fts_ayahs MATCH ?) LIMIT 25",
                    listOf(term),
                ).map {
                    SearchResultRow(
                        id = it.longs["id"] ?: 0L,
                        numberInSurah = (it.longs["n"] ?: 0L).toInt(),
                        surahName = it.strings["sn"] ?: "",
                        text = it.strings["t"] ?: "",
                    )
                }
            }.getOrDefault(emptyList())
        }
    }

    Column(
        Modifier.fillMaxSize().background(theme.bg).safeDrawingPadding().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextField(value = query, onValueChange = { query = it }, label = { Text("ابحث في القرآن والأذكار") }, singleLine = true, modifier = Modifier.weight(1f))
            Text("إغلاق", fontSize = 13.sp, color = theme.textSecondary, modifier = Modifier.clickable { onClose() }.padding(8.dp))
        }
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(results, key = { it.id }) { row ->
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(theme.surface)
                        .border(1.dp, theme.border, RoundedCornerShape(12.dp)).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("${row.surahName} · الآية ${row.numberInSurah}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
                    Text(row.text, fontSize = 17.sp, color = theme.textPrimary, lineHeight = 26.sp)
                }
            }
        }
    }
}
