package app.sadaqa.android.data

import app.sadaqa.android.engine.PrayerName

// ============================================================================
// TodayProgress.kt — ورد اليوم daily progress aggregation (Today screen).
// Pure port of packages/core-data/engines/today-progress.js (shared golden):
// athkar window (الصباح/المساء/النوم) completion counts. No DB access, no UI.
// Sleep Adhkar categories use solar_window = 'night' (and legacy 'isha').
// ============================================================================

object TodayProgress {
    data class Category(val id: String, val solarWindow: String?)
    data class Item(val id: String, val categoryId: String, val target: Int)
    data class StateRow(val itemId: String, val count: Int)
    data class WindowProgress(val titleAr: String, val completed: Int, val total: Int)

    private data class WindowSpec(val keys: Set<String>, val titleAr: String)

    private val WINDOWS = listOf(
        WindowSpec(setOf(PrayerName.FAJR.key), "الصباح"),
        WindowSpec(setOf(PrayerName.ASR.key), "المساء"),
        WindowSpec(setOf("night", PrayerName.ISHA.key), "النوم"),
    )

    fun compute(categories: List<Category>, items: List<Item>, states: List<StateRow>): List<WindowProgress> {
        val windowOf = HashMap<String, String>()
        for (c in categories) c.solarWindow?.let { windowOf[c.id] = it }
        val done = HashSet<String>()
        for (s in states) {
            val item = items.firstOrNull { it.id == s.itemId } ?: continue
            // Completion rule mirrors AthkarReaderScreen: count >= target (or any tap when target is 0)
            val complete = if (item.target > 0) s.count >= item.target else s.count > 0
            if (complete) done.add(s.itemId)
        }
        return WINDOWS.mapNotNull { spec ->
            val windowItems = items.filter { windowOf[it.categoryId] in spec.keys }
            if (windowItems.isEmpty()) return@mapNotNull null // never show an empty window row
            WindowProgress(spec.titleAr, windowItems.count { it.id in done }, windowItems.size)
        }
    }
}