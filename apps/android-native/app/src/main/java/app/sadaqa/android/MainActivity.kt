// ============================================================================
// MainActivity.kt — Compose entry: floating glass pill nav (control layer
// only) + screens. RTL-first.
// ============================================================================

package app.sadaqa.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Spa
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
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
            val themeKey by app.themeKey.collectAsState()
            MaterialTheme(colorScheme = SadaqaTheme.colorScheme(themeKey)) {
                CompositionLocalRoot(db = app.db, themeKey = themeKey)
            }
        }
    }
}

@Composable
private fun CompositionLocalRoot(db: SadaqaDb, themeKey: String) {
    val colors = SadaqaTheme.colors(themeKey)
    CompositionLocalProvider(
        LocalSadaqaTheme provides colors,
        LocalLayoutDirection provides LayoutDirection.Rtl,
    ) {
        RootScaffold(db)
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

    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(shape)
                .background(glassBg, shape)
                .border(1.dp, glassBorder, shape)
                .padding(5.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            NavItem(Icons.Outlined.Today, "اليوم", "today", selected, isDark, Modifier.weight(1f), onSelect)
            NavItem(Icons.Outlined.MenuBook, "المصحف", "mushaf", selected, isDark, Modifier.weight(1f), onSelect)
            NavItem(Icons.Outlined.Spa, "الأذكار", "athkar", selected, isDark, Modifier.weight(1f), onSelect)
            NavItem(Icons.Outlined.GridView, "الأدوات", "tools", selected, isDark, Modifier.weight(1f), onSelect)
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
    val activeFill = if (isDark) Color(0x292DD4BF) else Color(0x240F766E)
    val activeStroke = if (isDark) Color(0x572DD4BF) else Color(0x4D0F766E)
    val pillShape = RoundedCornerShape(22.dp)

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = modifier
            .clip(pillShape)
            .background(if (active) activeFill else Color.Transparent, pillShape)
            .border(1.dp, if (active) activeStroke else Color.Transparent, pillShape)
            .clickable { onSelect(key) }
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
