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
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.ui.AthkarScreen
import app.sadaqa.android.ui.LiquidGlassSurface
import app.sadaqa.android.ui.LocalSadaqaTheme
import app.sadaqa.android.ui.MushafScreen
import app.sadaqa.android.ui.SadaqaColors
import app.sadaqa.android.ui.SadaqaTheme
import app.sadaqa.android.ui.SearchSheet
import app.sadaqa.android.ui.TodayScreen
import app.sadaqa.android.ui.ToolsScreen
import app.sadaqa.android.ui.rememberGlassPalette
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as SadaqaApp
        setContent {
            val dbState by app.dbState.collectAsState()
            val themeKey by app.themeKey.collectAsState()
            val fontScale by app.fontScale.collectAsState()
            val colorScheme = remember(themeKey) { SadaqaTheme.colorScheme(themeKey) }
            val colors = remember(themeKey) { SadaqaTheme.colors(themeKey) }
            MaterialTheme(colorScheme = colorScheme) {
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
                    is SadaqaApp.DbState.Ready -> CompositionLocalRoot(db = state.db, colors = colors, fontScale = fontScale)
                }
            }
        }
    }
}

@Composable
private fun CompositionLocalRoot(db: SadaqaDb, colors: SadaqaColors, fontScale: Float) {
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

@Immutable
private data class NavTabSpec(val icon: ImageVector, val label: String, val key: String)

private val NAV_TABS = listOf(
    NavTabSpec(Icons.Outlined.Today, "اليوم", "today"),
    NavTabSpec(Icons.Outlined.MenuBook, "المصحف", "mushaf"),
    NavTabSpec(Icons.Outlined.Spa, "الأذكار", "athkar"),
    NavTabSpec(Icons.Outlined.GridView, "الأدوات", "tools"),
)

private val NAV_CAPSULE_SHAPE = RoundedCornerShape(30.dp)
private val NAV_PILL_SHAPE = RoundedCornerShape(24.dp)

@Composable
fun RootScaffold(db: SadaqaDb) {
    var tab by rememberSaveable { mutableStateOf("today") }
    var pendingTool by rememberSaveable { mutableStateOf<String?>(null) }
    var searchOpen by rememberSaveable { mutableStateOf(false) }

    val navigate: (String) -> Unit = remember {
        { target ->
            if (target.startsWith("tools-")) {
                pendingTool = target.removePrefix("tools-")
                tab = "tools"
            } else {
                if (target == "tools") pendingTool = null
                tab = target
            }
        }
    }
    val onOpenTools = remember(navigate) { { navigate("tools") } }
    val onOpenSearch = remember { { searchOpen = true } }
    val onClearInitial = remember { { pendingTool = null } }
    val onSelectTab: (String) -> Unit = remember {
        { selected ->
            pendingTool = null
            tab = selected
        }
    }

    Box(Modifier.fillMaxSize().background(LocalSadaqaTheme.current.bg).safeDrawingPadding()) {
        Box(Modifier.fillMaxSize()) {
            when (tab) {
                "today" -> TodayScreen(db, onOpenTool = onOpenTools, onNavigate = navigate)
                "mushaf" -> MushafScreen(db, onNavigateMain = navigate, onOpenSearch = onOpenSearch)
                "athkar" -> AthkarScreen(db)
                "tools" -> ToolsScreen(db, initialSub = pendingTool, onClearInitial = onClearInitial)
            }
        }
        GlassPillNav(
            selected = tab,
            onSelect = onSelectTab,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
    if (searchOpen) SearchSheet(db) { searchOpen = false }
}

/**
 * Floating Liquid Glass pill navigation — single translucent 4-tab capsule
 * floating above screen content with directional specular highlight border
 * and a spring-animated active glass lens.
 */
@Composable
fun GlassPillNav(
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val glass = rememberGlassPalette()
    val density = LocalDensity.current
    val selectedIndex = remember(selected) {
        NAV_TABS.indexOfFirst { it.key == selected }.coerceAtLeast(0)
    }
    val activeFillBrush = remember(glass) {
        Brush.verticalGradient(listOf(glass.activeFillTop, glass.activeFillBottom))
    }
    val activeBorderBrush = remember(glass) {
        Brush.linearGradient(
            colors = listOf(glass.activeBorderTop, glass.activeBorderBottom),
            start = Offset.Zero,
            end = Offset.Infinite,
        )
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        LiquidGlassSurface(
            shape = NAV_CAPSULE_SHAPE,
            elevation = 16.dp,
            glass = glass,
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 420.dp),
        ) {
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(5.dp),
            ) {
                val gap = 4.dp
                val slotW = ((maxWidth - gap * 3) / 4f).coerceAtLeast(1.dp)
                val targetOffsetPx = with(density) { ((slotW + gap) * selectedIndex).toPx() }
                val indicatorOffsetPx by animateFloatAsState(
                    targetValue = targetOffsetPx,
                    animationSpec = spring(dampingRatio = 0.84f, stiffness = Spring.StiffnessMediumLow),
                    label = "nav-indicator",
                )
                Box(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                    Box(
                        Modifier
                            .offset { IntOffset(x = indicatorOffsetPx.roundToInt(), y = 0) }
                            .width(slotW)
                            .fillMaxHeight()
                            .clip(NAV_PILL_SHAPE)
                            .background(activeFillBrush, NAV_PILL_SHAPE)
                            .border(1.dp, activeBorderBrush, NAV_PILL_SHAPE),
                    )
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(gap),
                    ) {
                        for (spec in NAV_TABS) {
                            NavItem(
                                icon = spec.icon,
                                label = spec.label,
                                key = spec.key,
                                active = selected == spec.key,
                                activeTint = glass.activeContent,
                                modifier = Modifier.weight(1f),
                                onSelect = onSelect,
                            )
                        }
                    }
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
    active: Boolean,
    activeTint: Color,
    modifier: Modifier = Modifier,
    onSelect: (String) -> Unit,
) {
    val theme = LocalSadaqaTheme.current
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = spring(dampingRatio = 0.82f, stiffness = Spring.StiffnessMedium),
        label = "nav-press",
    )
    val contentColor = if (active) activeTint else theme.textSecondary

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(NAV_PILL_SHAPE)
            .clickable(interactionSource = interactionSource, indication = null) { onSelect(key) }
            .padding(vertical = 8.dp),
    ) {
        Icon(icon, contentDescription = label, tint = contentColor, modifier = Modifier.size(20.dp))
        Text(
            label,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = contentColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
