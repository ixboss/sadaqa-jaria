// ============================================================================
// Screens.kt — Today Hub (hero countdown + §9 Smart Card + schedule), Athkar
// reader (tap-to-increment + ring + streaks), Tasbih (sync-first increment —
// the rapid-tap contract). All engine/db calls go through the Core ports.
// ============================================================================

package app.sadaqa.android.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.Adjust
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.NightsStay
import androidx.compose.material.icons.outlined.Spa
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.outlined.WbTwilight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.sadaqa.android.backup.JsonValue
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.data.TodayProgress
import app.sadaqa.android.engine.*
import app.sadaqa.android.platform.Haptics
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import java.util.UUID
import java.time.ZoneId
import java.time.Instant
import java.time.format.DateTimeFormatter

// ---------------------------------------------------------------------------
// formatters (same shapes as the web screens)
// ---------------------------------------------------------------------------

fun isoOf(ms: Long, tz: String): String {
    val zone = runCatching { ZoneId.of(tz) }.getOrElse { ZoneId.of("Asia/Riyadh") }
    return DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(zone).format(Instant.ofEpochMilli(ms))
}

fun clockOf(ms: Long, tz: String): String {
    val zone = runCatching { ZoneId.of(tz) }.getOrElse { ZoneId.of("Asia/Riyadh") }
    val zdt = Instant.ofEpochMilli(ms).atZone(zone)
    return "%02d:%02d".format(zdt.hour, zdt.minute)
}

fun hmsOf(msLeft: Long): String {
    val s = maxOf(0, (msLeft / 1000).toInt())
    return "%02d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
}

fun dayKeyOf(ms: Long, tz: String): String = isoOf(ms, tz)

fun Modifier.tactilePress(onClick: () -> Unit): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMedium),
        label = "tactile-press",
    )
    this
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
}

// ---------------------------------------------------------------------------
// Today Hub
// ---------------------------------------------------------------------------

// Today header rotating dhikr pill (same texts as web today.js / iOS TodayView)
private val DHIKR_PILL_TEXTS = listOf(
    "لا إله إلا الله", "سبحان الله وبحمده", "الحمد لله", "أستغفر الله", "اللهم صلِّ على نبينا محمد",
)

@Composable
private fun DhikrPill() {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    var dhikrIdx by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(25_000)
            dhikrIdx = (dhikrIdx + 1) % DHIKR_PILL_TEXTS.size
        }
    }
    AnimatedContent(
        targetState = dhikrIdx,
        transitionSpec = {
            (fadeIn(tween(350)) + slideInVertically(tween(350)) { it / 6 })
                .togetherWith(fadeOut(tween(350)) + slideOutVertically(tween(350)) { -it / 6 })
        },
        label = "dhikr",
    ) { idx ->
        Text(
            DHIKR_PILL_TEXTS[idx % DHIKR_PILL_TEXTS.size],
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = theme.accent,
            maxLines = 1,
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(theme.surface)
                .border(1.dp, theme.border, RoundedCornerShape(50))
                .clickable {
                    dhikrIdx = (dhikrIdx + 1) % DHIKR_PILL_TEXTS.size
                    Haptics.tick(context)
                }
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

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
    var dailyWindows by remember { mutableStateOf(listOf<TodayProgress.WindowProgress>()) }

    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(1000)
            now = System.currentTimeMillis() // format-only; engine values stay fixed
        }
    }

    // ورد اليوم — athkar-window completion for today (reload on tab entry)
    LaunchedEffect(Unit) {
        val loaded = withContext(Dispatchers.IO) {
            val day = dayKeyOf(System.currentTimeMillis(), ZoneId.systemDefault().id)
            val cats = db.query("SELECT category_id, solar_window FROM athkar_categories").map {
                TodayProgress.Category(it.strings["category_id"] ?: "", it.strings["solar_window"])
            }
            val items = db.query("SELECT item_id, category_id, count_target FROM athkar_items").map {
                TodayProgress.Item(it.strings["item_id"] ?: "", it.strings["category_id"] ?: "", it.longs["count_target"]?.toInt() ?: 1)
            }
            val states = db.query("SELECT item_id, count FROM adhkar_state WHERE day_key = ?", listOf(day)).map {
                TodayProgress.StateRow(it.strings["item_id"] ?: "", it.longs["count"]?.toInt() ?: 0)
            }
            TodayProgress.compute(cats, items, states)
        }
        dailyWindows = loaded
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        val hijri = HijriEngine.withAdjust(isoOf(now, opts.timeZone), db.hijriAdjust())
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text("اليوم", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                Text("${hijri.d} ${HijriEngine.monthNameAr(hijri.m)} ${hijri.y} هـ · ${isoOf(now, opts.timeZone)}", fontSize = 12.sp, color = theme.textSecondary)
            }
            DhikrPill()
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(theme.surface)
                    .border(1.dp, theme.border, RoundedCornerShape(50))
                    .clickable { showCityPicker = true }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Icon(Icons.Outlined.LocationOn, contentDescription = null, tint = theme.accent, modifier = Modifier.size(14.dp))
                Text(cityName, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
            }
        }

        // hero — next prayer (recomputes cleanly at each prayer boundary so countdown never freezes at 00:00:00)
        val todayIso = isoOf(now, opts.timeZone)
        var nextEpoch by remember(opts, todayIso) { mutableIntStateOf(0) }
        val next = remember(opts, todayIso, nextEpoch) { runCatching { engine.next(now) }.getOrNull() }
        val nextExpired = next != null && now >= next.at
        LaunchedEffect(nextExpired) {
            if (nextExpired) nextEpoch += 1
        }
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                .background(Brush.verticalGradient(listOf(theme.accent.copy(alpha = 0.12f), theme.surface)))
                .border(1.dp, theme.accent.copy(alpha = 0.30f), RoundedCornerShape(18.dp))
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("الصلاة القادمة", fontSize = 12.sp, color = theme.textSecondary)
            if (next != null) {
                val isTomorrow = isoOf(next.at, opts.timeZone) != todayIso
                Text(next.name.labelAr, fontSize = 32.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(
                        hmsOf(next.at - now),
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = theme.textPrimary,
                        style = TextStyle(fontFeatureSettings = "tnum"),
                    )
                }
                Text(
                    "الأذان ${clockOf(next.at, opts.timeZone)}${if (isTomorrow) " (غداً)" else ""}",
                    fontSize = 13.sp,
                    color = theme.textSecondary,
                    style = TextStyle(fontFeatureSettings = "tnum"),
                )
            }
        }

        // Smart Context-Aware Card — the shared §9 resolver's verdict, with a
        // time-of-day contextual card when the resolver only has the countdown
        // duplicate to offer (same windows as the web Today screen)
        val card = remember(now / 60000, opts) { contextualCard(SmartCardResolver.resolve(now, engine), now, opts.timeZone, db.hijriAdjust()) }
        val cardIcon = when (card.kind) {
            SmartCardKind.KAHF -> Icons.Outlined.MenuBook
            SmartCardKind.AFTER_PRAYER -> Icons.Outlined.Adjust
            SmartCardKind.QIYAM -> Icons.Outlined.NightsStay
            SmartCardKind.MORNING -> Icons.Outlined.WbTwilight
            SmartCardKind.EVENING -> Icons.Outlined.WbSunny
            SmartCardKind.NEXT_PRAYER -> Icons.Outlined.AccountBalance
        }
        CardBox {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(theme.accent.copy(alpha = 0.14f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(cardIcon, contentDescription = null, tint = theme.accent, modifier = Modifier.size(18.dp))
                    }
                    Spacer(Modifier.weight(1f))
                    Text(
                        card.badge,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = theme.accent,
                        modifier = Modifier.border(1.dp, theme.accent.copy(alpha = 0.36f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 3.dp),
                    )
                }
                Text(card.title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                Text(card.sub, fontSize = 13.sp, color = theme.textSecondary, lineHeight = 20.sp)
                Button(colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast), onClick = {
                    when (card.actionScreen) {
                        "mushaf-page" -> onNavigate("mushaf")
                        "tools-qiyam", "tools-hijri" -> onNavigate(card.actionScreen)
                        "adhkar-sleep" -> scope.launch { AthkarNav.openCategory(db, "sleep"); onNavigate("athkar") }
                        else -> scope.launch { AthkarNav.openCategory(db, card.kind.key); onNavigate("athkar") }
                    }
                }) { Text(card.actionLabel) }
            }
        }

        // 6-prayer 3-column grid, next highlighted + month schedule trigger
        val sched = remember(opts, todayIso) { runCatching { engine.daySchedule(todayIso) }.getOrNull() }
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
                        PrayerName.FAJR to Icons.Outlined.WbTwilight,
                        PrayerName.SUNRISE to Icons.Outlined.WbSunny,
                        PrayerName.DHUHR to Icons.Outlined.WbSunny,
                        PrayerName.ASR to Icons.Outlined.WbTwilight,
                        PrayerName.MAGHRIB to Icons.Outlined.NightsStay,
                        PrayerName.ISHA to Icons.Outlined.NightsStay,
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
                                    Icon(icons[name] ?: Icons.Outlined.AccountBalance, contentDescription = null, tint = if (isNext) theme.accent else theme.textSecondary, modifier = Modifier.size(16.dp))
                                    Text(name.labelAr, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = if (isNext) theme.accent else theme.textSecondary)
                                    Text(
                                        clockOf(sched.prayers.getValue(name), opts.timeZone),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isNext) theme.accent else theme.textPrimary,
                                        style = TextStyle(fontFeatureSettings = "tnum"),
                                    )
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
                        Triple(Icons.Outlined.Adjust, "السبحة", "tools-tasbih"),
                        Triple(Icons.Outlined.Spa, "الأذكار", "athkar"),
                        Triple(Icons.Outlined.MenuBook, "المصحف", "mushaf"),
                        Triple(Icons.Outlined.Explore, "القبلة", "tools-qibla"),
                    )) {
                        Column(
                            Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(theme.surfaceRaised)
                                .tactilePress { onNavigate(targetTab) }.padding(vertical = 12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(ico, contentDescription = null, tint = theme.accent, modifier = Modifier.size(20.dp))
                            Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary)
                        }
                    }
                }
            }
        }

        // Qiyam windows (the night whose Fajr has not passed yet)
        val qiyamIso = if (sched != null && now < sched.prayers.getValue(PrayerName.FAJR)) {
            isoOf(now - 86_400_000, opts.timeZone)
        } else todayIso
        val wsNight = remember(opts, qiyamIso) { runCatching { engine.sunnahWindows(qiyamIso) }.getOrNull() }
        if (wsNight != null) {
            CardBox {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("قيام الليل", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                    Text("منتصف الليل: ${clockOf(wsNight.midnight, opts.timeZone)}", fontSize = 13.sp, color = theme.textSecondary)
                    Text("الثلث الأخير: ${clockOf(wsNight.lastThird, opts.timeZone)} — حتى الفجر ${clockOf(wsNight.nextFajr, opts.timeZone)}", fontSize = 13.sp, color = theme.textSecondary)
                }
            }
        }

        // ورد اليوم — compact daily progress (athkar windows + khatmah position)
        if (dailyWindows.isNotEmpty()) {
            val doneCount = dailyWindows.count { it.completed >= it.total }
            CardBox {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("ورد اليوم", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, modifier = Modifier.weight(1f))
                        Text("$doneCount / ${dailyWindows.size} أوراد", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = theme.accent)
                    }
                    for (w in dailyWindows) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(w.titleAr, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary, modifier = Modifier.width(52.dp))
                            Box(
                                Modifier
                                    .weight(1f)
                                    .height(6.dp)
                                    .clip(RoundedCornerShape(50))
                                    .background(theme.surfaceRaised)
                            ) {
                                Box(
                                    Modifier
                                        .fillMaxHeight()
                                        .fillMaxWidth(if (w.total > 0) (w.completed.toFloat() / w.total).coerceIn(0f, 1f) else 0f)
                                        .clip(RoundedCornerShape(50))
                                        .background(theme.accent)
                                )
                            }
                            Text("${w.completed}/${w.total}", fontSize = 12.sp, color = theme.textSecondary, modifier = Modifier.width(40.dp))
                        }
                    }
                    Text("الختمة: ${((currentPage / 604.0) * 100).toInt()}٪ (صفحة $currentPage)", fontSize = 12.sp, color = theme.textSecondary)
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
        Spacer(Modifier.height(36.dp))
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

    if (showMonthSchedule) {
        // P3: the 30-row table is pure engine output for (civil day, options) —
        // computed once per open instead of 30 daySchedule calls on every 1s tick.
        val scheduleTodayIso = isoOf(now, opts.timeZone)
        val monthScheduleRows = remember(scheduleTodayIso, opts) {
            List(30) { offset ->
                val iso = PrayerEngine.shiftCivilIso(scheduleTodayIso, offset.toLong())
                iso to runCatching { engine.daySchedule(iso) }.getOrNull()
            }
        }
        AlertDialog(
            onDismissRequest = { showMonthSchedule = false },
            containerColor = theme.surface,
            title = { Text("جدول ٣٠ يوماً", color = theme.textPrimary) },
            text = {
                Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for ((iso, s) in monthScheduleRows) {
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
            "sleep" -> db.firstCategoryByWindow("night")
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
            if (route.startsWith("athkar-reader/")) {
                openReader = route.substringAfter("athkar-reader/")
                Navigator.current = null
            }
        }
    }

    openReader?.let { catId ->
        AthkarReaderScreen(db, catId) { openReader = null }
        return
    }

    fun iconForWindow(w: String): ImageVector = when (w) {
        "fajr" -> Icons.Outlined.WbTwilight
        "asr" -> Icons.Outlined.WbSunny
        "night" -> Icons.Outlined.NightsStay
        "duha" -> Icons.Outlined.WbSunny
        "after_prayer" -> Icons.Outlined.AccountBalance
        else -> Icons.Outlined.Spa
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
            morning?.let { listOf(it.id, Icons.Outlined.WbTwilight, "أذكار الصباح", "${it.count} ذكراً") },
            evening?.let { listOf(it.id, Icons.Outlined.WbSunny, "أذكار المساء", "${it.count} ذكراً") },
            afterPrayer?.let { listOf(it.id, Icons.Outlined.AccountBalance, "أذكار بعد الصلاة", "${it.count} ذكراً") },
            sleep?.let { listOf(it.id, Icons.Outlined.NightsStay, "أذكار النوم", "${it.count} ذكراً") },
        )
        for (pair in featured.chunked(2)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (item in pair) {
                    val id = item[0] as String
                    val ico = item[1] as ImageVector
                    val title = item[2] as String
                    val sub = item[3] as String
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(theme.surface)
                            .border(1.dp, theme.border, RoundedCornerShape(16.dp))
                            .tactilePress { openReader = id }.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(
                            Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(theme.accent.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(ico, contentDescription = null, tint = theme.accent, modifier = Modifier.size(18.dp))
                        }
                        Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                        Text(sub, fontSize = 11.sp, color = theme.textSecondary, style = TextStyle(fontFeatureSettings = "tnum"))
                    }
                }
            }
        }

        TextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("بحث في الأذكار") },
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
                    .tactilePress { openReader = c.id }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(iconForWindow(c.window), contentDescription = null, tint = theme.accent, modifier = Modifier.size(17.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text(c.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = theme.textPrimary, lineHeight = 22.sp)
                    Text("${c.count} ${if (c.count == 1) "ذكر" else "أذكار"}", fontSize = 11.sp, color = theme.textSecondary, style = TextStyle(fontFeatureSettings = "tnum"))
                }
                Icon(Icons.Outlined.ChevronLeft, contentDescription = null, tint = theme.textSecondary, modifier = Modifier.size(16.dp))
            }
        }
        Spacer(Modifier.height(36.dp))
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
        val day = dayKeyOf(System.currentTimeMillis(), ZoneId.systemDefault().id)
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
    val animTotalProgress by animateFloatAsState(
        targetValue = if (items.isEmpty()) 0f else doneTotal.toFloat() / items.size,
        animationSpec = spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
        label = "athkar-total",
    )

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Outlined.ArrowForward, contentDescription = "رجوع", tint = theme.textSecondary, modifier = Modifier.clickable { onBack() }.padding(6.dp).size(20.dp))
            Text(categoryName, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, modifier = Modifier.weight(1f))
            Text("$doneTotal / ${items.size}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = theme.accent, style = TextStyle(fontFeatureSettings = "tnum"))
        }
        LinearProgressIndicator(
            progress = { animTotalProgress },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)),
            color = theme.accent,
            trackColor = theme.surfaceRaised,
        )
        for (item in items) {
            val count = counts[item.id] ?: 0
            val done = if (item.target > 0) count >= item.target else count > 0
            val targetProgress = if (item.target > 0) (count.toFloat() / item.target).coerceIn(0f, 1f) else if (done) 1f else 0f
            val animProgress by animateFloatAsState(
                targetValue = targetProgress,
                animationSpec = spring(dampingRatio = 0.84f, stiffness = Spring.StiffnessMediumLow),
                label = "dhikr-ring",
            )
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
                        val day = dayKeyOf(now, ZoneId.systemDefault().id)
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
                    Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("$count", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = theme.accent)
                        Text("من ${item.target}", fontSize = 13.sp, color = theme.textSecondary)
                        if (done) {
                            Text(
                                "✓ اكتمل",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = theme.accent,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(theme.accent.copy(alpha = 0.16f))
                                    .padding(horizontal = 9.dp, vertical = 3.dp),
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        Box(Modifier.size(46.dp), contentAlignment = Alignment.Center) {
                            Canvas(Modifier.fillMaxSize()) {
                                val stroke = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round)
                                drawArc(color = theme.surfaceRaised, startAngle = 0f, sweepAngle = 360f, useCenter = false, style = stroke)
                                drawArc(color = theme.accent, startAngle = -90f, sweepAngle = 360f * animProgress, useCenter = false, style = stroke)
                            }
                            Text("${minOf(count, item.target)}/${item.target}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary, style = TextStyle(fontFeatureSettings = "tnum"))
                        }
                    }
                }
                if (!item.source.isNullOrEmpty()) {
                    Text("التحقق: ${item.source}", fontSize = 12.sp, color = theme.textSecondary, lineHeight = 18.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
        Spacer(Modifier.height(36.dp))
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
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Outlined.ArrowForward, contentDescription = "رجوع", tint = theme.textSecondary, modifier = Modifier.clickable { onClose() }.padding(6.dp).size(20.dp))
            Text("السبحة", fontSize = 22.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary)
        }
        val counter = counters.getOrNull(selected)
        if (counter != null) {
            val target = counter.target ?: 100
            val done = counter.target != null && counter.count >= counter.target
            val targetProgress = if (counter.target != null) (counter.count.toFloat() / maxOf(target, 1)).coerceIn(0f, 1f)
                else ((counter.count % 100).toFloat()) / 100f
            val animProgress by animateFloatAsState(
                targetValue = targetProgress,
                animationSpec = spring(dampingRatio = 0.82f, stiffness = Spring.StiffnessMedium),
                label = "tasbih-ring",
            )
            Box(
                Modifier.fillMaxWidth().padding(top = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(280.dp).clip(CircleShape).background(theme.surface)
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
                                val day = dayKeyOf(now, ZoneId.systemDefault().id)
                                scope.launch {
                                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                                        db.recordTasbihTap(cUuid, targetVal, newCount, day, now)
                                    }
                                }
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(Modifier.fillMaxSize().padding(10.dp)) {
                        val stroke = Stroke(width = 14.dp.toPx(), cap = StrokeCap.Round)
                        drawArc(color = theme.surfaceRaised, startAngle = 0f, sweepAngle = 360f, useCenter = false, style = stroke)
                        drawArc(color = theme.accent, startAngle = -90f, sweepAngle = 360f * animProgress, useCenter = false, style = stroke)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${counter.count}", fontSize = 52.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = theme.textPrimary, style = TextStyle(fontFeatureSettings = "tnum"))
                        Text(counter.dhikr, fontSize = 14.sp, color = theme.textSecondary)
                        if (counter.target != null) {
                            if (done) {
                                Text(
                                    "✓ اكتمل",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = theme.accent,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(50))
                                        .background(theme.accent.copy(alpha = 0.16f))
                                        .padding(horizontal = 10.dp, vertical = 3.dp),
                                )
                            } else {
                                Text("من ${counter.target}", fontSize = 12.sp, color = theme.textSecondary, style = TextStyle(fontFeatureSettings = "tnum"))
                            }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
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
        Spacer(Modifier.height(36.dp))
    }
}

/** Minimal in-app navigation bridge (reader deep-links from the smart card). */
object Navigator {
    var current: String? = null
    fun open(route: String) { current = route }
}

fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

@Suppress("MissingPermission")
fun lastKnownLocationOrNull(context: Context): Location? {
    if (!hasLocationPermission(context)) return null
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    var best: Location? = null
    for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)) {
        val loc = runCatching { lm.getLastKnownLocation(p) }.getOrNull() ?: continue
        if (best == null || loc.time > best.time) best = loc
    }
    return best
}

/** Requests a fresh one-shot fix, falling back to the best cached fix on timeout. */
@Suppress("MissingPermission")
suspend fun freshLocationOrNull(context: Context, timeoutMs: Long = 12_000L): Location? {
    if (!hasLocationPermission(context)) return null
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val provider = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        .firstOrNull { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
        ?: return lastKnownLocationOrNull(context)
    val cached = lastKnownLocationOrNull(context)
    var listener: LocationListener? = null
    val fresh = withTimeoutOrNull(timeoutMs) {
        suspendCancellableCoroutine { cont ->
            val l = LocationListener { loc -> if (cont.isActive) cont.resume(loc) }
            listener = l
            runCatching { lm.requestLocationUpdates(provider, 0L, 0f, l) }
                .onFailure { if (cont.isActive) cont.resume(null) }
            cont.invokeOnCancellation { runCatching { lm.removeUpdates(l) } }
        }
    }
    listener?.let { runCatching { lm.removeUpdates(it) } }
    return fresh ?: cached
}

/** When the shared resolver can only offer the countdown duplicate, swap in a
 *  time-of-day contextual card (reuses existing SmartCardKind cases — parity-safe). */
private fun contextualCard(resolved: SmartCard, nowMs: Long, tz: String, hijriAdjust: Int): SmartCard {
    if (resolved.kind != SmartCardKind.NEXT_PRAYER) return resolved
    val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone(tz))
    cal.timeInMillis = nowMs
    return when (cal.get(java.util.Calendar.HOUR_OF_DAY)) {
        in 4..10 -> SmartCard(
            SmartCardKind.MORNING, "🌅", "الوقت الحالي", "أذكار الصباح",
            "ورد الصباح من حصن المسلم — اقرأها قبل أن تنشغل",
            "افتح أذكار الصباح", "adhkar-cat",
        )
        in 11..15 -> {
            val h = runCatching { HijriEngine.withAdjust(isoOf(nowMs, tz), hijriAdjust) }.getOrNull()
            SmartCard(
                SmartCardKind.NEXT_PRAYER, "📅", "التاريخ الهجري", "التقويم الهجري",
                "اليوم ${h?.d ?: ""} ${HijriEngine.monthNameAr(h?.m ?: 1)} ${h?.y ?: ""} هـ",
                "افتح الأدوات", "tools-hijri",
            )
        }
        in 16..19 -> SmartCard(
            SmartCardKind.EVENING, "🌇", "الوقت الحالي", "أذكار المساء",
            "ورد المساء من حصن المسلم — قبل غروب الشمس",
            "افتح أذكار المساء", "adhkar-cat",
        )
        else -> SmartCard(
            SmartCardKind.QIYAM, "🌙", "وقت النوم", "أذكار النوم",
            "تسبيح ما قبل النوم يكفيك حاسدك الليلة",
            "افتح الأذكار", "adhkar-sleep",
        )
    }
}

@Composable
fun CityPickerDialog(
    db: SadaqaDb,
    onSelected: (SadaqaDb.CityRow) -> Unit,
    onDismiss: () -> Unit,
) {
    val theme = LocalSadaqaTheme.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    var cities by remember { mutableStateOf(listOf<SadaqaDb.CityRow>()) }
    var gpsStatus by remember { mutableStateOf<String?>(null) }

    fun applyGps() {
        gpsStatus = "جارٍ تحديد موقعك…"
        scope.launch {
            val loc = freshLocationOrNull(context)
            if (loc == null) {
                gpsStatus = "تعذر الحصول على الإحداثيات الحالية — فعّل GPS أو ابحث بالاسم."
                return@launch
            }
            val city = withContext(Dispatchers.IO) {
                db.findNearestCity(loc.latitude, loc.longitude)?.also { db.selectCity(it, gpsLat = loc.latitude, gpsLng = loc.longitude) }
            }
            if (city != null) onSelected(city)
            else gpsStatus = "لم يتم العثور على مدينة قريبة."
        }
    }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants[Manifest.permission.ACCESS_FINE_LOCATION] == true || grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true) {
            applyGps()
        } else {
            gpsStatus = "يلزم السماح بالموقع لتحديد مدينتك تلقائياً."
        }
    }

    LaunchedEffect(q) {
        cities = withContext(Dispatchers.IO) { db.searchCities(q, 20) }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.surface,
        title = { Text("تحديد المدينة", color = theme.textPrimary) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        if (hasLocationPermission(context)) applyGps()
                        else permLauncher.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = theme.accent, contentColor = theme.accentContrast),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Outlined.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("تحديد الموقع تلقائياً (GPS)")
                }
                gpsStatus?.let { Text(it, fontSize = 11.sp, color = Color(0xFFE5636F)) }
                TextField(
                    value = q,
                    onValueChange = { q = it },
                    placeholder = { Text("ابحث باسم المدينة (مثلاً: الزقازيق، القاهرة)…") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Column(Modifier.heightIn(max = 260.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (c in cities) {
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(theme.surfaceRaised)
                                .clickable {
                                    scope.launch {
                                        withContext(Dispatchers.IO) { db.selectCity(c) }
                                        onSelected(c)
                                    }
                                }.padding(10.dp),
                        ) {
                            Text(c.nameAr, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = theme.textPrimary)
                            Text("${c.countryAr} · ${c.timeZone}", fontSize = 11.sp, color = theme.textSecondary)
                        }
                    }
                }
            }
        },
        confirmButton = { Button(onClick = onDismiss) { Text("إغلاق") } },
    )
}
