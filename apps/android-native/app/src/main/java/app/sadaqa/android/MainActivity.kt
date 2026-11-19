// ============================================================================
// MainActivity.kt — Compose entry: floating glass pill nav (control layer
// only) + screens. RTL-first.
// ============================================================================

package app.sadaqa.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Spa
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.core.content.ContextCompat
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.ui.LocalSadaqaTheme
import app.sadaqa.android.ui.SadaqaTheme
import app.sadaqa.android.ui.SearchSheet
import app.sadaqa.android.ui.TodayScreen
import app.sadaqa.android.ui.MushafScreen
import app.sadaqa.android.ui.AthkarScreen
import app.sadaqa.android.ui.ToolsScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as SadaqaApp
        setContent {
            val dbState by app.dbState.collectAsState()
            val themeKey by app.themeKey.collectAsState()
            val fontScale by app.fontScale.collectAsState()
            MaterialTheme(colorScheme = SadaqaTheme.colorScheme(themeKey)) {
                val colors = SadaqaTheme.colors(themeKey)
                when (val state = dbState) {
                    SadaqaApp.DbState.Loading -> Box(
                        Modifier.fillMaxSize().background(colors.bg).safeDrawingPadding(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            CircularProgressIndicator(color = colors.accent)
                            Text("جارٍ تهيئة المصحف والبيانات…", color = colors.textSecondary, fontSize = 14.sp)
                        }
                    }
                    is SadaqaApp.DbState.Failed -> Box(
                        Modifier.fillMaxSize().background(colors.bg).safeDrawingPadding().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text("تعذر فتح قاعدة البيانات", color = Color(0xFFE5636F), fontSize = 18.sp, fontWeight = FontWeight.Bold)
                            Text(
                                "قاعدة البيانات من إصدار أحدث أو غير متوافقة مع هذه النسخة. يرجى تحديث التطبيق.\n(${state.message})",
                                color = colors.textSecondary,
                                fontSize = 13.sp,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                    is SadaqaApp.DbState.Ready -> CompositionLocalRoot(db = state.db, themeKey = themeKey, fontScale = fontScale)
                }
            }
        }
    }
}

@Composable
private fun CompositionLocalRoot(db: SadaqaDb, themeKey: String, fontScale: Float) {
    val colors = SadaqaTheme.colors(themeKey)
    val baseDensity = LocalDensity.current
    val scaledDensity = remember(baseDensity, fontScale) {
        Density(density = baseDensity.density, fontScale = baseDensity.fontScale * fontScale)
    }
    RequestNotificationsPermission()
    CompositionLocalProvider(
        LocalSadaqaTheme provides colors,
        LocalLayoutDirection provides LayoutDirection.Rtl,
        LocalDensity provides scaledDensity,
    ) {
        RootScaffold(db)
    }
}

/** POST_NOTIFICATIONS runtime request (API 33+) — asked once at first run;
 *  adhan/alarm notifications fail silently without it (audit 2026-11). */
@Composable
private fun RequestNotificationsPermission() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("sadaqa-prefs", Context.MODE_PRIVATE) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !prefs.getBoolean("notif_permission_asked", false)
        ) {
            prefs.edit().putBoolean("notif_permission_asked", true).apply()
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

@Composable
fun RootScaffold(db: SadaqaDb) {
    var tab by rememberSaveable { mutableStateOf("today") }
    var pendingTool by rememberSaveable { mutableStateOf<String?>(null) }
    var searchOpen by rememberSaveable { mutableStateOf(false) }

    val navigate: (String) -> Unit = { target ->
        if (target.startsWith("tools-")) {
            pendingTool = target.removePrefix("tools-")
            tab = "tools"
        } else {
            if (target == "tools") pendingTool = null
            tab = target
        }
    }

    Column(Modifier.fillMaxSize().background(LocalSadaqaTheme.current.bg).safeDrawingPadding()) {
        Box(Modifier.weight(1f)) {
            when (tab) {
                "today" -> TodayScreen(db, onOpenTool = { navigate("tools") }, onNavigate = navigate)
                "mushaf" -> MushafScreen(db, onNavigateMain = navigate, onOpenSearch = { searchOpen = true })
                "athkar" -> AthkarScreen(db)
                "tools" -> ToolsScreen(db, initialSub = pendingTool, onClearInitial = { pendingTool = null })
            }
        }
        GlassPillNav(selected = tab, onSelect = { pendingTool = null; tab = it })
    }
    if (searchOpen) SearchSheet(db) { searchOpen = false }
}

/**
 * Floating glass pill navigation — single translucent 4-tab capsule.
 * Search lives in the screen headers / Mushaf HUD, not a separate orb.
 */
@Composable
fun GlassPillNav(selected: String, onSelect: (String) -> Unit) {
    val shape = RoundedCornerShape(28.dp)
    val isDark = LocalSadaqaTheme.current.bg.luminance() < 0.4f
    val glassBg = if (isDark) {
        Brush.verticalGradient(listOf(Color(0xCC122521), Color(0xB8091513)))
    } else {
        Brush.verticalGradient(listOf(Color(0xE6FAF7F0), Color(0xD8F1ECE1)))
    }
    val glassBorder = if (isDark) Color(0x28FFFFFF) else Color(0x22000000)

    val tabs = remember {
        listOf(
            Triple(Icons.Outlined.Today, "اليوم", "today"),
            Triple(Icons.Outlined.MenuBook, "المصحف", "mushaf"),
            Triple(Icons.Outlined.Spa, "الأذكار", "athkar"),
            Triple(Icons.Outlined.GridView, "الأدوات", "tools"),
        )
    }
    val selectedIndex = tabs.indexOfFirst { it.third == selected }.coerceAtLeast(0)
    val activeFill = if (isDark) Color(0x292DD4BF) else Color(0x240F766E)
    val activeStroke = if (isDark) Color(0x572DD4BF) else Color(0x4D0F766E)
    val pillShape = RoundedCornerShape(22.dp)

    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .clip(shape)
                .background(glassBg, shape)
                .border(1.dp, glassBorder, shape)
                .padding(5.dp),
        ) {
            val gap = 4.dp
            val slotW = ((maxWidth - gap * 3) / 4f).coerceAtLeast(1.dp)
            val indicatorOffset by animateDpAsState(
                targetValue = (slotW + gap) * selectedIndex,
                animationSpec = spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
                label = "nav-indicator",
            )
            Box(
                Modifier
                    .offset(x = indicatorOffset)
                    .width(slotW)
                    .height(48.dp)
                    .clip(pillShape)
                    .background(activeFill, pillShape)
                    .border(1.dp, activeStroke, pillShape),
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(gap),
            ) {
                for ((ico, label, key) in tabs) {
                    NavItem(ico, label, key, selected, isDark, Modifier.weight(1f), onSelect)
                }
            }
        }
    }
}

@Composable
private fun NavItem(
    icon: ImageVector,
    label: String,
    key: String,
    selected: String,
    isDark: Boolean,
    modifier: Modifier = Modifier,
    onSelect: (String) -> Unit,
) {
    val theme = LocalSadaqaTheme.current
    val active = selected == key
    val activeTint = if (isDark) Color(0xFF5EEAD4) else Color(0xFF0F766E)
    val pillShape = RoundedCornerShape(22.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = spring(dampingRatio = 0.82f, stiffness = Spring.StiffnessMedium),
        label = "nav-press",
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(pillShape)
            .clickable(interactionSource = interactionSource, indication = null) { onSelect(key) }
            .padding(vertical = 7.dp),
    ) {
        Icon(icon, contentDescription = label, tint = if (active) activeTint else theme.textSecondary, modifier = Modifier.size(20.dp))
        Text(
            label,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (active) activeTint else theme.textSecondary,
            maxLines = 1,
        )
    }
}
