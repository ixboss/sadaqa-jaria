// ============================================================================
// MainActivity.kt — Compose entry: floating glass pill nav (control layer
// only) + trailing Search pill + screens. RTL-first.
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.FloatingActionButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.platform.LocalLayoutDirection
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
                "mushaf" -> MushafScreen(db)
                "athkar" -> AthkarScreen(db)
                "tools" -> ToolsScreen(db, initialSub = pendingTool, onClearInitial = { pendingTool = null })
            }
        }
        GlassPillNav(selected = tab, onSelect = { pendingTool = null; tab = it }, onSearch = { searchOpen = true })
    }
    if (searchOpen) SearchSheet(db) { searchOpen = false }
}

/**
 * Floating glass pill navigation — translucent rounded bar + separated
 * circular Search pill. Approximation of iOS 26 Liquid Glass (Android has no
 * system glass material — documented platform limit, ARCHITECTURE §3).
 */
@Composable
fun GlassPillNav(selected: String, onSelect: (String) -> Unit, onSearch: () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    val theme = LocalSadaqaTheme.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .background(Brush.verticalGradient(listOf(Color(0x1AFFFFFF), Color(0x0DFFFFFF))), shape)
                .border(1.dp, Color(0x38FFFFFF), shape)
                .padding(6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            NavItem(Icons.Filled.Today, "اليوم", "today", selected, onSelect)
            NavItem(Icons.Filled.MenuBook, "المصحف", "mushaf", selected, onSelect)
            NavItem(Icons.Filled.Spa, "الأذكار", "athkar", selected, onSelect)
            NavItem(Icons.Filled.Settings, "الأدوات", "tools", selected, onSelect)
        }
        FloatingActionButton(
            onClick = onSearch,
            modifier = Modifier.padding(start = 10.dp).size(48.dp),
            shape = RoundedCornerShape(50),
            containerColor = Color(0x2EFFFFFF),
            contentColor = theme.textPrimary,
        ) {
            Icon(Icons.Default.Search, contentDescription = "بحث")
        }
    }
}

@Composable
private fun NavItem(
    icon: ImageVector,
    label: String,
    key: String,
    selected: String,
    onSelect: (String) -> Unit,
) {
    val theme = LocalSadaqaTheme.current
    val active = selected == key
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(18.dp))
            .clickable { onSelect(key) }
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Icon(icon, contentDescription = label, tint = if (active) theme.accent else theme.textSecondary)
        Text(label, fontSize = 11.sp, color = if (active) theme.accent else theme.textSecondary)
    }
}
