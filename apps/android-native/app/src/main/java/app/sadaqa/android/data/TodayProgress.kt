package app.sadaqa.android.data

// ============================================================================
// TodayProgress.kt — ورد اليوم daily progress aggregation (Today screen).
// Pure port of packages/core-data/engines/today-progress.js (shared golden):
// athkar window (الصباح/المساء/النوم) completion counts. No DB access, no UI.
// ============================================================================

object TodayProgress {
    data class Category(val id: String, val solarWindow: String?)
    data class Item(val id: String, val categoryId: String, val target: Int)
    data class StateRow(val itemId: String, val count: Int)
    data class WindowProgress(val titleAr: String, val completed: Int, val total: Int)

    // Sleep athkar are tagged `night` in the DB (schema CHECK list — 'isha'
    // is forbidden there and could never render; audit 2026-11-21).
    private val WINDOWS = listOf("fajr" to "الصباح", "asr" to "المساء", "night" to "النوم")

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
        return WINDOWS.mapNotNull { (key, titleAr) ->
            val windowItems = items.filter { windowOf[it.categoryId] == key }
            if (windowItems.isEmpty()) return@mapNotNull null // never show an empty window row
            WindowProgress(titleAr, windowItems.count { it.id in done }, windowItems.size)
        }
    }
}