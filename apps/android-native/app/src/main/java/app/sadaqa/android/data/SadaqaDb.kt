// ============================================================================
// SadaqaDb.kt — hosting of the EXACT sadaqa.db via androidx.sqlite:sqlite-bundled
// (bundled SQLite with FTS5 — per ARCHITECTURE §3 Android never depends on the
// device's system SQLite). Copies the asset on first run, opens WAL + FK ON.
// The `.sadaqa` export/import pipeline mirrors apps/web-desktop/js/data/
// backup.js statement-for-statement. SQL HYGIENE: every statement is ONE fixed
// string literal with ONLY `?` placeholders — all values (including the fixed
// device_id constant) are bound; no identifier interpolation, no concatenation.
// ============================================================================

package app.sadaqa.android.data

import androidx.sqlite.SQLiteConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.sqlite.SQLiteStatement
import app.sadaqa.android.backup.BackupCodec
import app.sadaqa.android.backup.CanonicalJson
import app.sadaqa.android.backup.JsonValue
import app.sadaqa.android.backup.JsonValue.Bool
import app.sadaqa.android.backup.JsonValue.Null
import app.sadaqa.android.backup.JsonValue.Num
import app.sadaqa.android.backup.JsonValue.Obj
import app.sadaqa.android.backup.JsonValue.Str
import app.sadaqa.android.backup.UUID7
import app.sadaqa.android.engine.EngineOptions
import java.io.File

class SadaqaDb private constructor(val connection: SQLiteConnection) {

    companion object {
        /**
         * Open (copying the bundled seed on first run). `seedBytes` supplies
         * assets/sadaqa.db on Android; JVM tests pass the file bytes directly.
         */
        fun open(dbFile: File, seedBytes: (() -> ByteArray)? = null): SadaqaDb {
            if (!dbFile.exists() || dbFile.length() == 0L) {
                if (dbFile.exists()) dbFile.delete()
                val bytes = seedBytes?.invoke()
                    ?: throw IllegalStateException("bundled sadaqa.db missing — run scripts/tools/sync-native-assets.mjs")
                dbFile.parentFile?.mkdirs()
                dbFile.writeBytes(bytes)
            }
            if (!dbFile.canWrite()) {
                dbFile.setWritable(true, true)
            }
            val conn = BundledSQLiteDriver().open(dbFile.absolutePath)
            conn.prepare("PRAGMA journal_mode = WAL").use { it.step() }
            conn.prepare("PRAGMA foreign_keys = ON").use { it.step() }
            return SadaqaDb(conn)
        }

        fun normalizeArabicForSearch(input: String): String {
            val nfc = java.text.Normalizer.normalize(input, java.text.Normalizer.Form.NFC)
            val sb = StringBuilder(nfc.length)
            var i = 0
            while (i < nfc.length) {
                val cp = nfc.codePointAt(i)
                val skip = cp == 0x0640 || cp == 0x0670 || cp in 0x0610..0x061A || cp in 0x064B..0x065F || cp in 0x06D6..0x06ED
                if (!skip) {
                    when (cp) {
                        'أ'.code, 'إ'.code, 'آ'.code, 'ٱ'.code -> sb.append('ا')
                        'ؤ'.code -> sb.append('و')
                        'ئ'.code -> sb.append('ي')
                        'ة'.code -> sb.append('ه')
                        'ى'.code -> sb.append('ي')
                        else -> sb.appendCodePoint(cp)
                    }
                }
                i += Character.charCount(cp)
            }
            val folded = StringBuilder(sb.length)
            for (idx in sb.indices) {
                val ch = sb[idx]
                if (ch == 'ء' && idx > 0 && !sb[idx - 1].isWhitespace()) continue
                if (ch in ".,;:!?«»\"'()-—–[]{}…•*/\\|+_=~<>،؛۔﴿﴾؟") folded.append(' ') else folded.append(ch)
            }
            return folded.toString().lowercase().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
        }

        fun ftsQuery(userInput: String): String? {
            val norm = normalizeArabicForSearch(userInput)
            if (norm.isEmpty()) return null
            val terms = norm.split(' ').filter { it.isNotEmpty() }
            if (terms.isEmpty()) return null
            return terms.mapIndexed { idx, t ->
                val q = "\"${t.replace("\"", "\"\"")}\""
                if (idx == terms.lastIndex) "$q*" else q
            }.joinToString(" ")
        }
    }

    // ------------------------------------------------------------------
    // tiny bound-query helpers over the androidx.sqlite driver API
    // ------------------------------------------------------------------
    class Row {
        val strings = mutableMapOf<String, String?>()
        val longs = mutableMapOf<String, Long?>()
        val doubles = mutableMapOf<String, Double?>()
        val isNull = mutableSetOf<String>()
    }

    fun query(sql: String, args: List<Any?> = emptyList()): List<Row> = synchronized(this) {
        val out = mutableListOf<Row>()
        connection.prepare(sql).use { stmt ->
            bindArgs(stmt, args)
            val cols = stmt.getColumnNames()
            while (stmt.step()) {
                val row = Row()
                for (i in cols.indices) {
                    val name = cols[i]
                    if (stmt.isNull(i)) {
                        row.isNull.add(name)
                        row.strings[name] = null
                    } else {
                        when (stmt.getColumnType(i)) {
                            1 -> row.longs[name] = stmt.getLong(i)      // SQLITE_INTEGER
                            2 -> row.doubles[name] = stmt.getDouble(i)  // SQLITE_FLOAT
                            3 -> row.strings[name] = stmt.getText(i)    // SQLITE_TEXT
                            else -> row.strings[name] = null
                        }
                    }
                }
                out.add(row)
            }
        }
        return out
    }

    fun queryOne(sql: String, args: List<Any?> = emptyList()): Row? = query(sql, args).firstOrNull()

    fun execute(sql: String, args: List<Any?> = emptyList()) = synchronized(this) {
        connection.prepare(sql).use { stmt ->
            bindArgs(stmt, args)
            stmt.step()
        }
    }

    /** Atomic multi-statement transaction (BEGIN IMMEDIATE … COMMIT/ROLLBACK). */
    fun <T> batch(body: (SadaqaDb) -> T): T = transaction(body)

    fun <T> transaction(body: (SadaqaDb) -> T): T = synchronized(this) {
        execute("BEGIN IMMEDIATE")
        try {
            val result = body(this)
            execute("COMMIT")
            return result
        } catch (e: Throwable) {
            runCatching { execute("ROLLBACK") }
            throw e
        }
    }

    // ------------------------------------------------------------------
    // Safe atomic UI write paths
    // ------------------------------------------------------------------
    fun incrementDhikrTap(
        itemId: String,
        categoryId: String,
        currentCount: Int,
        target: Int,
        dayKey: String,
        now: Long = System.currentTimeMillis(),
    ): Int {
        if (target > 0 && currentCount >= target) return currentCount
        val nextCount = currentCount + 1
        val isDone = target > 0 && nextCount >= target
        transaction {
            execute(
                "INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?) " +
                    "ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at, updated_at = excluded.updated_at",
                listOf<Any?>(itemId, dayKey, nextCount.toLong(), if (isDone) now else null, now),
            )
            if (isDone) {
                val solarWindow = queryOne(
                    "SELECT solar_window FROM athkar_categories WHERE category_id = ?",
                    listOf(categoryId),
                )?.strings?.get("solar_window")
                val kind = when (solarWindow) {
                    "fajr" -> "adhkar_morning"
                    "asr" -> "adhkar_evening"
                    else -> null
                }
                if (kind != null) {
                    execute(
                        "INSERT OR REPLACE INTO streak_days (kind, day_key, done_at) VALUES (?, ?, ?)",
                        listOf<Any?>(kind, dayKey, now),
                    )
                }
            }
        }
        return nextCount
    }

    fun ensureDefaultTasbihPresets(now: Long = System.currentTimeMillis()) {
        if (query("SELECT uuid FROM tasbih_counters WHERE deleted = 0").isEmpty()) {
            transaction {
                for ((i, preset) in listOf(Pair("سبحان الله", 33), Pair("الحمد لله", 33), Pair("الله أكبر", 34)).withIndex()) {
                    execute(
                        "INSERT OR IGNORE INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted) VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0)",
                        listOf(UUID7.uuid7(now), preset.first, preset.first, preset.second.toLong(), i.toLong(), now),
                    )
                }
            }
        }
    }

    fun recordTasbihTap(
        counterUuid: String,
        target: Int?,
        newCount: Int,
        dayKey: String,
        now: Long = System.currentTimeMillis(),
    ) {
        transaction {
            execute(
                "UPDATE tasbih_counters SET count = count + 1, total_lifetime = total_lifetime + 1, updated_at = ? WHERE uuid = ?",
                listOf(now, counterUuid),
            )
            execute(
                "INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, 1, ?)",
                listOf(UUID7.uuid7(now), counterUuid, now),
            )
            if (target != null && newCount == target) {
                execute(
                    "INSERT OR IGNORE INTO streak_days (kind, day_key, done_at) VALUES ('tasbih', ?, ?)",
                    listOf(dayKey, now),
                )
            }
        }
    }

    fun toggleBookmark(
        page: Int,
        lineNumber: Int = 1,
        ayahNumber: Int? = null,
        labelAr: String,
        now: Long = System.currentTimeMillis(),
    ): Boolean {
        var added = false
        transaction {
            val existing = if (ayahNumber != null) {
                queryOne("SELECT uuid, deleted FROM bookmarks WHERE ayah_number = ? LIMIT 1", listOf(ayahNumber.toLong()))
            } else {
                queryOne("SELECT uuid, deleted FROM bookmarks WHERE page = ? AND ayah_number IS NULL LIMIT 1", listOf(page.toLong()))
            }
            val existingUuid = existing?.strings?.get("uuid")
            if (existing != null && existingUuid != null) {
                val wasDeleted = (existing.longs["deleted"] ?: 0L) == 1L
                val nextDeleted = if (wasDeleted) 0L else 1L
                execute(
                    "UPDATE bookmarks SET deleted = ?, updated_at = ?, label_ar = ? WHERE uuid = ?",
                    listOf(nextDeleted, now, labelAr, existingUuid),
                )
                added = wasDeleted
            } else {
                execute(
                    "INSERT INTO bookmarks (uuid, page, line_number, ayah_number, label_ar, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
                    listOf<Any?>(UUID7.uuid7(now), page.toLong(), lineNumber.toLong(), ayahNumber?.toLong(), labelAr, now, now),
                )
                added = true
            }
        }
        return added
    }

    private fun bindArgs(stmt: SQLiteStatement, args: List<Any?>) {
        for ((i, a) in args.withIndex()) {
            when (a) {
                is Long -> stmt.bindLong(i + 1, a)
                is Int -> stmt.bindLong(i + 1, a.toLong())
                is Double -> stmt.bindDouble(i + 1, a)
                is String -> stmt.bindText(i + 1, a)
                is Boolean -> stmt.bindLong(i + 1, if (a) 1L else 0L)
                null -> stmt.bindNull(i + 1)
                else -> throw IllegalArgumentException("unsupported bind type: ${a::class.simpleName}")
            }
        }
    }

    // ------------------------------------------------------------------
    // settings (user_settings — JSON-encoded values, same keys as web)
    // ------------------------------------------------------------------
    fun setting(key: String): JsonValue? {
        val row = queryOne("SELECT value FROM user_settings WHERE key = ?", listOf(key)) ?: return null
        val raw = row.strings["value"] ?: return null
        return runCatching { CanonicalJson.parse(raw) }.getOrNull()
    }

    fun setSetting(key: String, value: JsonValue, now: Long = System.currentTimeMillis()) {
        execute("INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", listOf(key, CanonicalJson.serialize(value), now))
        WidgetNotifier.prayersChanged()
    }

    fun engineOptions(): EngineOptions {
        val defaults = EngineOptions(21.4225, 39.8262, "Asia/Riyadh")
        val loc = setting("location") ?: return defaults
        if (loc.obj == null) return defaults
        return EngineOptions(
            lat = loc["lat"].dbl ?: defaults.lat,
            lng = loc["lng"].dbl ?: defaults.lng,
            timeZone = loc["timeZone"].str ?: defaults.timeZone,
            method = setting("calc_method")?.str ?: "umm_al_qura",
            madhab = setting("madhab")?.str ?: "shafi",
            highLatitudeRule = setting("high_latitude_rule")?.str ?: "middle_of_the_night",
        )
    }

    fun hijriAdjust(): Int = setting("hijri_adjust")?.int ?: 0

    // ------------------------------------------------------------------
    // Cities & Arabic FTS normalization (mirrors packages/core-data/engines/search.js)
    // ------------------------------------------------------------------
    data class CityRow(
        val id: Int,
        val nameAr: String,
        val nameEn: String,
        val countryAr: String,
        val lat: Double,
        val lng: Double,
        val timeZone: String,
    )

    fun searchCities(query: String, limit: Int = 20): List<CityRow> {
        val trimmed = query.trim()
        if (trimmed.length < 2) {
            return query(
                "SELECT city_id, name_ar, name_en, country_ar, lat, lng, timezone FROM cities WHERE is_preseed = 1 ORDER BY COALESCE(population, 0) DESC LIMIT ?",
                listOf(limit.toLong()),
            ).map(::mapCity)
        }
        val out = mutableListOf<CityRow>()
        val seen = mutableSetOf<Int>()
        ftsQuery(trimmed)?.let { term ->
            val ftsRows = runCatching {
                query(
                    "SELECT c.city_id, c.name_ar, c.name_en, c.country_ar, c.lat, c.lng, c.timezone FROM cities c WHERE c.rowid IN (SELECT rowid FROM fts_cities WHERE fts_cities MATCH ?) ORDER BY COALESCE(c.population, 0) DESC LIMIT ?",
                    listOf(term, limit.toLong()),
                )
            }.getOrDefault(emptyList())
            for (r in ftsRows) {
                val c = mapCity(r)
                if (seen.add(c.id)) out.add(c)
            }
        }
        if (out.size < limit) {
            val likePat = "%$trimmed%"
            val normPat = "%${trimmed.replace('ة', 'ه').replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')}%"
            val likeRows = runCatching {
                query(
                    "SELECT city_id, name_ar, name_en, country_ar, lat, lng, timezone FROM cities " +
                        "WHERE name_ar LIKE ? OR name_en LIKE ? OR country_ar LIKE ? " +
                        "OR REPLACE(REPLACE(REPLACE(REPLACE(name_ar, 'ة', 'ه'), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا') LIKE ? " +
                        "ORDER BY COALESCE(population, 0) DESC LIMIT ?",
                    listOf(likePat, likePat, likePat, normPat, limit.toLong()),
                )
            }.getOrDefault(emptyList())
            for (r in likeRows) {
                val c = mapCity(r)
                if (seen.add(c.id)) {
                    out.add(c)
                    if (out.size >= limit) break
                }
            }
        }
        return out
    }

    fun findNearestCity(lat: Double, lng: Double): CityRow? {
        val cosLat = kotlin.math.cos(Math.toRadians(lat))
        var best: CityRow? = null
        var bestScore = Double.MAX_VALUE
        for (r in query("SELECT city_id, name_ar, name_en, country_ar, lat, lng, timezone FROM cities")) {
            val c = mapCity(r)
            val dLat = c.lat - lat
            val dLng = (c.lng - lng) * cosLat
            val score = dLat * dLat + dLng * dLng
            if (score < bestScore) {
                bestScore = score
                best = c
            }
        }
        return best
    }

    fun selectCity(city: CityRow, now: Long = System.currentTimeMillis()) {
        setSetting(
            "location",
            Obj(
                mapOf(
                    "lat" to Num(city.lat),
                    "lng" to Num(city.lng),
                    "timeZone" to Str(city.timeZone),
                    "cityId" to Num(city.id.toDouble()),
                    "name_ar" to Str(city.nameAr),
                    "name_en" to Str(city.nameEn),
                ),
            ),
            now,
        )
    }

    private fun mapCity(r: Row) = CityRow(
        id = r.longs["city_id"]?.toInt() ?: 0,
        nameAr = r.strings["name_ar"] ?: "",
        nameEn = r.strings["name_en"] ?: "",
        countryAr = r.strings["country_ar"] ?: "",
        lat = r.doubles["lat"] ?: 0.0,
        lng = r.doubles["lng"] ?: 0.0,
        timeZone = r.strings["timezone"] ?: "UTC",
    )

    fun close() {
        connection.close()
    }

    fun deviceId(): String {
        setting("device_id")?.str?.let { return it }
        val id = UUID7.uuid7()
        execute("INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)", listOf("device_id", CanonicalJson.serialize(Str(id)), System.currentTimeMillis()))
        return id
    }

    // ------------------------------------------------------------------
    // EXPORT — buildExportPayload port (9 queries → entities → groups → sha)
    // ------------------------------------------------------------------
    fun buildExportPayload(now: Long = System.currentTimeMillis()): Pair<JsonValue, String> {
        val remap = { uuid: String -> if (UUID7.isV7Shape(uuid)) uuid else UUID7.synthUuid7("row:$uuid", now) }

        val reading = mutableListOf<JsonValue>()
        val dhikr = mutableListOf<JsonValue>()
        val prefs = mutableListOf<JsonValue>()
        val meta = mutableListOf<JsonValue>()

        for (r in query("SELECT * FROM bookmarks")) reading.add(Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")),
            "type" to Str("bookmark"),
            "updatedAt" to jsonOf(r, "updated_at"),
            "deleted" to Bool(flag(r, "deleted")),
            "page" to jsonOf(r, "page"),
            "lineNumber" to jsonOf(r, "line_number"),
            "ayahNumber" to jsonOf(r, "ayah_number"),
            "labelAr" to jsonOf(r, "label_ar"),
            "createdAt" to jsonOf(r, "created_at"),
        )))
        for (r in query("SELECT * FROM highlights")) reading.add(Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")),
            "type" to Str("highlight"),
            "updatedAt" to jsonOf(r, "updated_at"),
            "deleted" to Bool(flag(r, "deleted")),
            "ayahNumber" to jsonOf(r, "ayah_number"),
            "wordStart" to jsonOf(r, "word_start"),
            "wordEnd" to jsonOf(r, "word_end"),
            "colorKey" to jsonOf(r, "color_key"),
        )))
        for (r in query("SELECT * FROM notes")) reading.add(Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")),
            "type" to Str("note"),
            "updatedAt" to jsonOf(r, "updated_at"),
            "deleted" to Bool(flag(r, "deleted")),
            "ayahNumber" to jsonOf(r, "ayah_number"),
            "body" to jsonOf(r, "body"),
            "createdAt" to jsonOf(r, "created_at"),
        )))
        for (r in query("SELECT * FROM khatmah_plans")) reading.add(Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")),
            "type" to Str("khatmahPlan"),
            "updatedAt" to jsonOf(r, "updated_at"),
            "deleted" to Bool(flag(r, "deleted")),
            "nameAr" to jsonOf(r, "name_ar"),
            "mode" to jsonOf(r, "mode"),
            "startDate" to jsonOf(r, "start_date"),
            "endDate" to jsonOf(r, "end_date"),
            "dailyPages" to jsonOf(r, "daily_pages"),
            "active" to Bool(flag(r, "active")),
            "createdAt" to jsonOf(r, "created_at"),
        )))
        for (r in query("SELECT * FROM adhkar_state")) {
            val itemId = r.strings["item_id"] ?: ""
            val dayKey = r.strings["day_key"] ?: ""
            dhikr.add(Obj(mapOf(
                "uuid" to Str(UUID7.synthUuid7("adhkar:$itemId:$dayKey", now)),
                "type" to Str("adhkarState"),
                "updatedAt" to jsonOf(r, "updated_at"),
                "itemId" to Str(itemId),
                "dayKey" to Str(dayKey),
                "count" to jsonOf(r, "count"),
                "completedAt" to jsonOf(r, "completed_at"),
            )))
        }
        for (r in query("SELECT * FROM tasbih_counters")) dhikr.add(Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")),
            "type" to Str("tasbihCounter"),
            "updatedAt" to jsonOf(r, "updated_at"),
            "deleted" to Bool(flag(r, "deleted")),
            "labelAr" to jsonOf(r, "label_ar"),
            "dhikrText" to jsonOf(r, "dhikr_text"),
            "target" to jsonOf(r, "target"),
            "count" to jsonOf(r, "count"),
            "totalLifetime" to jsonOf(r, "total_lifetime"),
            "sortOrder" to jsonOf(r, "sort_order"),
        )))
        for (r in query("SELECT * FROM tasbih_sessions")) dhikr.add(Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")),
            "type" to Str("tasbihSession"),
            "updatedAt" to jsonOf(r, "occurred_at"),
            "counterUuid" to jsonOf(r, "counter_uuid"),
            "countDelta" to jsonOf(r, "count_delta"),
            "occurredAt" to jsonOf(r, "occurred_at"),
        )))
        for (r in query("SELECT * FROM user_settings WHERE key <> ?", listOf("device_id"))) {
            val key = r.strings["key"] ?: ""
            // safeParse parity: unparseable stored values export as the raw STRING (web backup.js)
            val value = r.strings["value"]?.let { raw -> runCatching { CanonicalJson.parse(raw) }.getOrDefault(Str(raw)) } ?: Null
            prefs.add(Obj(mapOf(
                "uuid" to Str(UUID7.synthUuid7("setting:$key", now)),
                "type" to Str("setting"),
                "updatedAt" to jsonOf(r, "updated_at"),
                "key" to Str(key),
                "value" to value,
            )))
        }
        for (r in query("SELECT * FROM streak_days")) {
            val kind = r.strings["kind"] ?: ""
            val dayKey = r.strings["day_key"] ?: ""
            meta.add(Obj(mapOf(
                "uuid" to Str(UUID7.synthUuid7("streak:$kind:$dayKey", now)),
                "type" to Str("streakDay"),
                "updatedAt" to jsonOf(r, "done_at"),
                "kind" to Str(kind),
                "dayKey" to Str(dayKey),
            )))
        }

        fun mapOf(arr: List<JsonValue>): Map<String, JsonValue> =
            arr.mapNotNull { item -> item["uuid"].str?.let { it to item } }.toMap()

        val payload = BackupCodec.toPayloadGroups(mapOf(
            "reading" to mapOf(reading), "dhikr" to mapOf(dhikr),
            "prefs" to mapOf(prefs), "meta" to mapOf(meta),
        ))
        // payloadJson must be byte-stable — canonical serializer (keys sorted)
        val payloadJson = CanonicalJson.serialize(payload)
        val entities = payload.obj?.mapValues { (_, v) -> Num((v.arr?.size ?: 0).toDouble()) } ?: emptyMap()
        val manifest = Obj(mapOf(
            "format" to Str("sadaqa-backup"),
            "formatVersion" to Num(BackupCodec.SUPPORTED_FORMAT_VERSION.toDouble()),
            "createdAt" to Num(now.toDouble()),
            "deviceId" to Str(deviceId()),
            "entities" to Obj(entities),
            "integrity" to Str(Sha256.hex(payloadJson)),
        ))
        return manifest to payloadJson
    }

    // ------------------------------------------------------------------
    // IMPORT — validate → local snapshots → merge → atomic batch → audit row
    // ------------------------------------------------------------------
    fun importBackup(text: String, mode: String, now: Long = System.currentTimeMillis()): BackupCodec.Report {
        val (manifest, payload) = BackupCodec.parseFile(text)
        val verdict = BackupCodec.validateBackup(manifest, payload)
        require(verdict.ok) {
            "فشل التحقق: " + verdict.errors.take(3).joinToString(" · ")
        }
        val remap = { uuid: String -> if (UUID7.isV7Shape(uuid)) uuid else UUID7.synthUuid7("row:$uuid", now) }
        val local = mutableMapOf(
            "reading" to mutableMapOf<String, JsonValue>(), "dhikr" to mutableMapOf<String, JsonValue>(),
            "prefs" to mutableMapOf<String, JsonValue>(), "meta" to mutableMapOf<String, JsonValue>(),
        )

        fun put(group: String, uuidRaw: String?, e: JsonValue) {
            local.getOrPut(group) { mutableMapOf() }[remap(uuidRaw ?: "")] = e
        }
        for (r in query("SELECT * FROM bookmarks")) put("reading", r.strings["uuid"], Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")), "type" to Str("bookmark"),
            "updatedAt" to jsonOf(r, "updated_at"), "deleted" to Bool(flag(r, "deleted")),
            "page" to jsonOf(r, "page"), "lineNumber" to jsonOf(r, "line_number"),
            "ayahNumber" to jsonOf(r, "ayah_number"), "labelAr" to jsonOf(r, "label_ar"),
            "createdAt" to jsonOf(r, "created_at"),
        )))
        for (r in query("SELECT * FROM highlights")) put("reading", r.strings["uuid"], Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")), "type" to Str("highlight"),
            "updatedAt" to jsonOf(r, "updated_at"), "deleted" to Bool(flag(r, "deleted")),
            "ayahNumber" to jsonOf(r, "ayah_number"), "wordStart" to jsonOf(r, "word_start"),
            "wordEnd" to jsonOf(r, "word_end"), "colorKey" to jsonOf(r, "color_key"),
        )))
        for (r in query("SELECT * FROM notes")) put("reading", r.strings["uuid"], Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")), "type" to Str("note"),
            "updatedAt" to jsonOf(r, "updated_at"), "deleted" to Bool(flag(r, "deleted")),
            "ayahNumber" to jsonOf(r, "ayah_number"), "body" to jsonOf(r, "body"),
            "createdAt" to jsonOf(r, "created_at"),
        )))
        for (r in query("SELECT * FROM khatmah_plans")) put("reading", r.strings["uuid"], Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")), "type" to Str("khatmahPlan"),
            "updatedAt" to jsonOf(r, "updated_at"), "deleted" to Bool(flag(r, "deleted")),
            "nameAr" to jsonOf(r, "name_ar"), "mode" to jsonOf(r, "mode"),
            "startDate" to jsonOf(r, "start_date"), "endDate" to jsonOf(r, "end_date"),
            "dailyPages" to jsonOf(r, "daily_pages"), "active" to Bool(flag(r, "active")),
            "createdAt" to jsonOf(r, "created_at"),
        )))
        for (r in query("SELECT * FROM adhkar_state")) {
            val itemId = r.strings["item_id"] ?: ""
            val dayKey = r.strings["day_key"] ?: ""
            val synthUuid = UUID7.synthUuid7("adhkar:$itemId:$dayKey", now)
            val e = Obj(mapOf(
                "uuid" to Str(synthUuid),
                "type" to Str("adhkarState"), "updatedAt" to jsonOf(r, "updated_at"),
                "itemId" to Str(itemId), "dayKey" to Str(dayKey),
                "count" to jsonOf(r, "count"), "completedAt" to jsonOf(r, "completed_at"),
            ))
            local.getOrPut("dhikr") { mutableMapOf() }[synthUuid] = e
        }
        for (r in query("SELECT * FROM tasbih_counters")) put("dhikr", r.strings["uuid"], Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")), "type" to Str("tasbihCounter"),
            "updatedAt" to jsonOf(r, "updated_at"), "deleted" to Bool(flag(r, "deleted")),
            "labelAr" to jsonOf(r, "label_ar"), "dhikrText" to jsonOf(r, "dhikr_text"),
            "target" to jsonOf(r, "target"), "count" to jsonOf(r, "count"),
            "totalLifetime" to jsonOf(r, "total_lifetime"), "sortOrder" to jsonOf(r, "sort_order"),
        )))
        for (r in query("SELECT * FROM tasbih_sessions")) put("dhikr", r.strings["uuid"], Obj(mapOf(
            "uuid" to Str(remap(r.strings["uuid"] ?: "")), "type" to Str("tasbihSession"),
            "updatedAt" to jsonOf(r, "occurred_at"), "counterUuid" to jsonOf(r, "counter_uuid"),
            "countDelta" to jsonOf(r, "count_delta"), "occurredAt" to jsonOf(r, "occurred_at"),
        )))
        for (r in query("SELECT * FROM user_settings WHERE key <> ?", listOf("device_id"))) {
            val key = r.strings["key"] ?: ""
            val value = r.strings["value"]?.let { raw -> runCatching { CanonicalJson.parse(raw) }.getOrDefault(Str(raw)) } ?: Null
            val synthUuid = UUID7.synthUuid7("setting:$key", now)
            val e = Obj(mapOf(
                "uuid" to Str(synthUuid),
                "type" to Str("setting"), "updatedAt" to jsonOf(r, "updated_at"),
                "key" to Str(key), "value" to value,
            ))
            local.getOrPut("prefs") { mutableMapOf() }[synthUuid] = e
        }
        for (r in query("SELECT * FROM streak_days")) {
            val kind = r.strings["kind"] ?: ""
            val dayKey = r.strings["day_key"] ?: ""
            val synthUuid = UUID7.synthUuid7("streak:$kind:$dayKey", now)
            val e = Obj(mapOf(
                "uuid" to Str(synthUuid),
                "type" to Str("streakDay"), "updatedAt" to jsonOf(r, "done_at"),
                "kind" to Str(kind), "dayKey" to Str(dayKey),
            ))
            local.getOrPut("meta") { mutableMapOf() }[synthUuid] = e
        }

        val result = BackupCodec.mergePayload(local, payload, mode, now)

        transaction {
            if (mode == "replace") {
                // Full Replace — fixed, parameterless wipe of every backed-up
                // table (device-local backup_log survives by design). The
                // statements are spelled out constants, never built from input.
                execute("DELETE FROM bookmarks")
                execute("DELETE FROM highlights")
                execute("DELETE FROM notes")
                execute("DELETE FROM khatmah_plans")
                execute("DELETE FROM adhkar_state")
                execute("DELETE FROM tasbih_sessions")
                execute("DELETE FROM tasbih_counters")
                execute("DELETE FROM streak_days")
                execute("DELETE FROM user_settings WHERE key <> ?", listOf("device_id"))
            }
            for (m in result.mutations) apply(m.entity)
            val report = Obj(mapOf(
                "added" to Num(result.report.added.toDouble()), "updated" to Num(result.report.updated.toDouble()),
                "conflicts" to Num(result.report.conflicts.toDouble()), "skipped" to Num(result.report.skipped.toDouble()),
                "deleted" to Num(result.report.deleted.toDouble()),
            ))
            execute("INSERT INTO backup_log (direction, mode, format_version, counts_json, created_at) VALUES ('import', ?, ?, ?, ?)", listOf(mode, (manifest["formatVersion"]?.int ?: 1).toDouble(), CanonicalJson.serialize(report), now))
        }
        WidgetNotifier.prayersChanged()
        return result.report
    }

    /** One payload entity → bound upsert (entityStmts port, order preserved). */
    private fun apply(e: JsonValue) {
        val del = if (e["deleted"].bool == true) 1L else 0L
        val type = e["type"].str ?: ""
        val uuid = e["uuid"].str ?: ""
        val updatedAt = e["updatedAt"].long ?: 0L
        when (type) {
            "bookmark" -> execute("INSERT INTO bookmarks (uuid, page, line_number, ayah_number, label_ar, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET page = excluded.page, line_number = excluded.line_number, ayah_number = excluded.ayah_number, label_ar = excluded.label_ar, updated_at = excluded.updated_at, deleted = excluded.deleted", listOf<Any?>(uuid, (e["page"].int ?: 1).toLong(), (e["lineNumber"].int ?: 1).toLong(), e["ayahNumber"].long, e["labelAr"].str, e["createdAt"].long ?: updatedAt, updatedAt, del))
            "highlight" -> execute("INSERT INTO highlights (uuid, ayah_number, word_start, word_end, color_key, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET ayah_number = excluded.ayah_number, word_start = excluded.word_start, word_end = excluded.word_end, color_key = excluded.color_key, updated_at = excluded.updated_at, deleted = excluded.deleted", listOf<Any?>(uuid, e["ayahNumber"].long, e["wordStart"].long, e["wordEnd"].long, e["colorKey"].str, updatedAt, del))
            "note" -> execute("INSERT INTO notes (uuid, ayah_number, body, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET ayah_number = excluded.ayah_number, body = excluded.body, updated_at = excluded.updated_at, deleted = excluded.deleted", listOf<Any?>(uuid, e["ayahNumber"].long, e["body"].str ?: "", e["createdAt"].long ?: updatedAt, updatedAt, del))
            "khatmahPlan" -> execute("INSERT INTO khatmah_plans (uuid, name_ar, mode, start_date, end_date, daily_pages, active, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET name_ar = excluded.name_ar, mode = excluded.mode, start_date = excluded.start_date, end_date = excluded.end_date, daily_pages = excluded.daily_pages, active = excluded.active, updated_at = excluded.updated_at, deleted = excluded.deleted", listOf<Any?>(uuid, e["nameAr"].str ?: "ختمتي", e["mode"].str ?: "rate", e["startDate"].str, e["endDate"].str, e["dailyPages"].long, if (e["active"].bool == false) 0L else 1L, e["createdAt"].long ?: updatedAt, updatedAt, del))
            "tasbihCounter" -> execute("INSERT INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET label_ar = excluded.label_ar, dhikr_text = excluded.dhikr_text, target = excluded.target, count = excluded.count, total_lifetime = excluded.total_lifetime, sort_order = excluded.sort_order, updated_at = excluded.updated_at, deleted = excluded.deleted", listOf<Any?>(uuid, e["labelAr"].str ?: "ورد", e["dhikrText"].str ?: "", e["target"].long, (e["count"].int ?: 0).toLong(), (e["totalLifetime"].int ?: 0).toLong(), (e["sortOrder"].int ?: 0).toLong(), updatedAt, del))
            "tasbihSession" -> execute("INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET count_delta = excluded.count_delta, occurred_at = excluded.occurred_at", listOf<Any?>(uuid, e["counterUuid"].str ?: "", (e["countDelta"].int ?: 1).toLong(), e["occurredAt"].long ?: 0L))
            "adhkarState" -> execute("INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at, updated_at = excluded.updated_at", listOf<Any?>(e["itemId"].str ?: "", e["dayKey"].str ?: "", (e["count"].int ?: 0).toLong(), e["completedAt"].long, updatedAt))
            "streakDay" -> execute("INSERT OR REPLACE INTO streak_days (kind, day_key, done_at) VALUES (?, ?, ?)", listOf<Any?>(e["kind"].str ?: "", e["dayKey"].str ?: "", updatedAt))
            "setting" -> execute("INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", listOf<Any?>(e["key"].str ?: "", CanonicalJson.serialize(e["value"] ?: Null), updatedAt))
            else -> throw IllegalArgumentException("unsupported entity type: $type")
        }
    }

    // helpers
    private fun jsonOf(r: Row, col: String): JsonValue {
        if (r.isNull.contains(col)) return Null
        r.longs[col]?.let { return Num(it.toDouble()) }
        r.doubles[col]?.let { return Num(it) }
        r.strings[col]?.let { return Str(it) }
        return Null
    }

    private fun flag(r: Row, col: String): Boolean = r.longs[col] == 1L
}

object Sha256 {
    fun hex(text: String): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}

/** Widget refresh hook (Glance receivers recompute from SharedPreferences). */
object WidgetNotifier {
    var prayersChanged: () -> Unit = {}
}
