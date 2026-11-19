// ============================================================================
// BackupCodec.kt — `.sadaqa` v1 validator + Smart Merge (ports of
// packages/core-data/engines/backup-validate.js + backup-merge.js — golden).
// Entity field names are the camelCase payload contract. CI replays the
// web-generated fixture tables (validate-cases / merge-cases / sample-export).
// ============================================================================

package app.sadaqa.android.backup

object BackupCodec {

    const val SUPPORTED_FORMAT_VERSION = 1
    val BACKUP_GROUPS = listOf("reading", "dhikr", "prefs", "meta")

    /** Which entity types may appear under each group (ARCHITECTURE §8.2). */
    val GROUP_ENTITY_TYPES = mapOf(
        "reading" to listOf("khatmahPlan", "khatmahPageLog", "bookmark", "highlight", "note"),
        "dhikr" to listOf("adhkarState", "tasbihCounter", "tasbihSession"),
        "prefs" to listOf("setting"),
        "meta" to listOf("streakDay"),
    )

    private val HIGHLIGHT_COLORS = listOf("gold", "emerald", "rose", "sky", "none")
    private val STREAK_KINDS = listOf("adhkar_morning", "adhkar_evening", "tasbih", "khatmah")
    private val DAY_KEY = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private val DANGEROUS_KEYS = setOf("__proto__", "constructor", "prototype")

    /** Imported text length caps (backup-validate.js TEXT_LIMITS, audit 2026-11). */
    private const val BOOKMARK_LABEL_MAX = 200
    private const val COUNTER_LABEL_MAX = 120
    private const val PLAN_NAME_MAX = 120
    private const val NOTE_BODY_MAX = 10_000
    private const val SETTING_KEY_MAX = 64
    // سقف إجمالي الكيانات — مطابق لـ backup-validate.js (review 2026-11)
    private const val MAX_ENTITIES = 50_000

    class Verdict(val ok: Boolean, val errors: List<String>, val counts: Map<String, Int>)

    data class Report(
        var added: Int = 0, var updated: Int = 0,
        var conflicts: Int = 0, var skipped: Int = 0, var deleted: Int = 0,
    )

    data class Mutation(val group: String, val uuid: String, val entity: JsonValue, val action: String)

    data class MergeResult(val report: Report, val mutations: List<Mutation>, val replaceMarkerAt: Long?)

    // ------------------------------------------------------------------
    // validateBackup — refuses with reasons, never partially imports
    // ------------------------------------------------------------------
    fun validateBackup(manifest: JsonValue?, payload: JsonValue?, now: Long = System.currentTimeMillis()): Verdict {
        val errors = mutableListOf<String>()
        val m = manifest ?: return Verdict(false, listOf("manifest: must be an object"), emptyMap())
        if (m.obj == null) return Verdict(false, listOf("manifest: must be an object"), emptyMap())

        if (m["format"].str != "sadaqa-backup") errors.add("manifest.format: must be \"sadaqa-backup\"")
        val fv = m["formatVersion"]
        val fvInt = fv.int
        if (fvInt != null) {
            if (fvInt > SUPPORTED_FORMAT_VERSION) {
                errors.add("manifest.formatVersion $fvInt is newer than supported $SUPPORTED_FORMAT_VERSION — upgrade the app, then re-import")
            } else if (fvInt < 1) {
                errors.add("manifest.formatVersion: must be >= 1")
            }
        } else errors.add("manifest.formatVersion: must be an integer")
        if (!isEpochMs(m["createdAt"])) errors.add("manifest.createdAt: must be epoch ms")
        if ((m["deviceId"].str?.length ?: 0) < 8) errors.add("manifest.deviceId: must be a string (>= 8 chars)")
        if ((m["integrity"].str?.length ?: 0) != 64) errors.add("manifest.integrity: must be a sha-256 hex digest of payload.json")

        val groups = payload?.obj
            ?: return Verdict(false, errors + "payload: must be an object", emptyMap())

        val counts = mutableMapOf<String, Int>()
        // خُطة الملف نفسها: سجل صفحة بلا أب داخل الملف كان يمرّ على الويب
        // وينفجر FK على الأهداف الأصلية — تُرفض هنا لتطابق السلوك (review 2026-11)
        val planUuids = (groups["reading"]?.arr ?: emptyList())
            .filter { it["type"].str == "khatmahPlan" && it["uuid"].str != null }
            .map { it["uuid"].str!! }.toSet()
        var totalEntities = 0
        for ((group, groupValue) in groups) {
            val entities = groupValue.arr
            if (entities == null) { errors.add("payload.$group: must be an array"); continue }
            totalEntities += entities.size
            if (group !in BACKUP_GROUPS) {
                errors.add("payload.$group: unknown group (allowed: ${BACKUP_GROUPS.joinToString(", ")})")
                continue
            }
            val allowed = GROUP_ENTITY_TYPES[group].orEmpty()
            for (e in entities) {
                if (e.obj == null) { errors.add("payload.$group: entity must be an object"); continue }
                val obj = e // JsonValue.Obj — index via JsonValue.get (missing key → JSON Null)
                val uuid = obj["uuid"].str ?: "?"
                if (!UUID7.isV7Shape(obj["uuid"].str)) {
                    errors.add("payload.$group[$uuid].uuid: must be a UUIDv7")
                    continue
                }
                val type = obj["type"].str ?: ""
                if (type !in allowed) {
                    errors.add("payload.$group[$uuid].type: must be one of ${allowed.joinToString(", ")}")
                    continue
                }
                if (!isEpochMs(obj["updatedAt"])) {
                    errors.add("payload.$group[$uuid].updatedAt: must be epoch ms")
                    continue
                }
                // future stamp: a 1e308 updatedAt would beat every local row in
                // the merge and resurrect data arbitrarily (audit 2026-11)
                if (obj["updatedAt"].dbl!! > now + 2 * 86_400_000.0) {
                    errors.add("payload.$group[$uuid].updatedAt: too far in the future")
                    continue
                }
                val deleted = obj.obj?.get("deleted")
                if (deleted != null && deleted !is JsonValue.Bool) {
                    errors.add("payload.$group[$uuid].deleted: must be boolean when present")
                    continue
                }
                counts[group] = (counts[group] ?: 0) + 1
                validateEntityBody(group, type, obj, planUuids)?.let { errors.add("payload.$group[$uuid]: $it") }
            }
        }
        if (totalEntities > MAX_ENTITIES) errors.add("payload: $totalEntities entities exceeds the $MAX_ENTITIES cap")
        return Verdict(errors.isEmpty(), errors, counts)
    }

    private fun isEpochMs(v: JsonValue?): Boolean {
        val n = v?.dbl ?: return false
        return n > 0 && n.isFinite()
    }

    private fun isInt(v: JsonValue?): Boolean {
        val n = v?.dbl ?: return false
        return n == kotlin.math.floor(n) && kotlin.math.abs(n) < 2e53
    }

    /** Type-specific required payload fields (validateEntityBody port). */
    private fun validateEntityBody(group: String, type: String, e: JsonValue, planUuids: Set<String> = emptySet()): String? = when ("$group/$type") {
        "reading/bookmark" -> {
            val page = e["page"]
            val label = e["labelAr"].str
            when {
                !isInt(page) || page.int !in 1..604 -> "page must be 1..604"
                e["labelAr"] !is JsonValue.Null && (label == null || label.length > BOOKMARK_LABEL_MAX) ->
                    "labelAr must be a string <= $BOOKMARK_LABEL_MAX chars"
                else -> null
            }
        }
        "reading/highlight" -> {
            val ws = e["wordStart"].int
            val we = e["wordEnd"].int
            when {
                !isInt(e["ayahNumber"]) || e["ayahNumber"].int !in 1..6236 -> "ayahNumber must be 1..6236"
                !isInt(e["wordStart"]) || ws == null || ws < 1 -> "wordStart must be >= 1"
                !isInt(e["wordEnd"]) || we == null || we < ws -> "wordEnd must be >= wordStart"
                e["colorKey"].str !in HIGHLIGHT_COLORS -> "colorKey must be a token color key"
                else -> null
            }
        }
        "reading/khatmahPlan" -> {
            val dp = e["dailyPages"].int
            val name = e["nameAr"].str
            when {
                e["nameAr"] !is JsonValue.Null && (name == null || name.length > PLAN_NAME_MAX) ->
                    "nameAr must be a string <= $PLAN_NAME_MAX chars"
                e["mode"].str != "deadline" && e["mode"].str != "rate" -> "mode must be deadline|rate"
                e["mode"].str == "deadline" && !DAY_KEY.matches(e["endDate"].str ?: "") -> "deadline mode requires endDate YYYY-MM-DD"
                e["mode"].str == "rate" && (!isInt(e["dailyPages"]) || dp == null || dp !in 1..604) -> "rate mode requires dailyPages 1..604"
                !DAY_KEY.matches(e["startDate"].str ?: "") -> "startDate must be YYYY-MM-DD"
                else -> null
            }
        }
        // ختمة progress log — natural key (plan_uuid, page), deterministic synth uuid
        "reading/khatmahPageLog" -> when {
            (e["planUuid"].str?.length ?: 0) < 8 -> "planUuid required"
            e["planUuid"].str !in planUuids -> "planUuid must reference a khatmahPlan in this backup"
            !isInt(e["page"]) || e["page"].int !in 1..604 -> "page must be 1..604"
            !isInt(e["completedAt"]) || (e["completedAt"].long ?: 0L) <= 0L -> "completedAt must be epoch ms"
            else -> null
        }
        "dhikr/tasbihCounter" -> {
            val tgt = e["target"].int
            val label = e["labelAr"].str
            when {
                e["dhikrText"].str.isNullOrEmpty() -> "dhikrText required"
                e["labelAr"] !is JsonValue.Null && (label == null || label.length > COUNTER_LABEL_MAX) ->
                    "labelAr must be a string <= $COUNTER_LABEL_MAX chars"
                e["target"] != JsonValue.Null &&
                    (!isInt(e["target"]) || tgt == null || tgt < 1) -> "target must be >= 1 or null"
                else -> null
            }
        }
        "dhikr/adhkarState" -> {
            val cnt = e["count"].int
            when {
                e["itemId"].str.isNullOrEmpty() -> "itemId required"
                !DAY_KEY.matches(e["dayKey"].str ?: "") -> "dayKey must be YYYY-MM-DD"
                !isInt(e["count"]) || cnt == null || cnt < 0 -> "count must be >= 0"
                else -> null
            }
        }
        "prefs/setting" -> {
            val key = e["key"].str
            when {
                key.isNullOrEmpty() -> "key required"
                key.length > SETTING_KEY_MAX -> "key must be <= $SETTING_KEY_MAX chars"
                key in DANGEROUS_KEYS -> "key must not be a dangerous object-literal key"
                "value" !in (e.obj ?: emptyMap()) -> "value required (may be null)"
                else -> null
            }
        }
        "meta/streakDay" -> when {
            e["kind"].str !in STREAK_KINDS -> "kind must be a streak kind"
            !DAY_KEY.matches(e["dayKey"].str ?: "") -> "dayKey must be YYYY-MM-DD"
            else -> null
        }
        "dhikr/tasbihSession" -> {
            val delta = e["countDelta"].int
            when {
                (e["counterUuid"].str?.length ?: 0) < 8 -> "counterUuid required"
                !isInt(e["countDelta"]) || delta == null || delta <= 0 || delta > 1_000_000 -> "countDelta must be 1..1000000"
                !isEpochMs(e["occurredAt"]) -> "occurredAt must be epoch ms"
                else -> null
            }
        }
        "reading/note" -> when {
            e["body"].str == null -> "body must be a string"
            (e["body"].str?.length ?: 0) > NOTE_BODY_MAX -> "body must be <= $NOTE_BODY_MAX chars"
            else -> null
        }
        else -> null
    }

    // ------------------------------------------------------------------
    // mergePayload — Smart Merge (§8.3); local = Maps keyed by payload uuid
    // ------------------------------------------------------------------
    fun mergePayload(
        local: Map<String, Map<String, JsonValue>>,
        payload: JsonValue?,
        mode: String,
        now: Long,
    ): MergeResult {
        require(mode == "merge" || mode == "replace") { "unknown merge mode: $mode" }

        if (mode == "replace") {
            val report = Report()
            val mutations = mutableListOf<Mutation>()
            for ((group, groupValue) in payload?.obj ?: emptyMap()) {
                for (e in groupValue.arr ?: emptyList()) {
                    mutations.add(Mutation(group, e["uuid"].str ?: "", e, "insert"))
                    report.added++
                }
            }
            return MergeResult(report, mutations, now)
        }

        val report = Report()
        val mutations = mutableListOf<Mutation>()
        for ((group, groupValue) in payload?.obj ?: emptyMap()) {
            val entities = groupValue.arr
                ?: throw IllegalArgumentException("payload.$group: must be an array (run backup-validate first)")
            val localMap = local[group]
            for (e in entities) {
                val uuid = e["uuid"].str ?: ""
                val existing = localMap?.get(uuid) // JsonValue? — local entities keyed by uuid
                if (existing == null) {
                    mutations.add(Mutation(group, uuid, e, "insert"))
                    report.added++
                    continue
                }
                if (CanonicalJson.serialize(existing) == CanonicalJson.serialize(e)) {
                    report.skipped++
                    continue
                }
                val localTime = existing["updatedAt"].long ?: 0L
                val incomingTime = e["updatedAt"].long ?: 0L
                if (incomingTime > localTime) {
                    val resurrection = existing["deleted"].bool == true && e["deleted"].bool != true
                    mutations.add(Mutation(group, uuid, e, if (resurrection) "restore" else "apply"))
                    report.updated++
                } else if (localTime > incomingTime) {
                    if (existing["deleted"].bool == true) report.skipped++ // tombstone wins
                    else report.conflicts++ // local newer & alive — keep local
                } else {
                    report.conflicts++ // same updatedAt, different content → deterministic tie-break
                }
            }
        }
        return MergeResult(report, mutations, null)
    }

    /** Stable payload grouping (keys sorted by the canonical serializer). */
    fun toPayloadGroups(mapByGroup: Map<String, Map<String, JsonValue>>): JsonValue =
        JsonValue.Obj(mapByGroup.mapValues { (_, map) -> JsonValue.Arr(map.keys.sorted().mapNotNull { map[it] }) })

    /** Parse a `.sadaqa` file text into (manifest, payload). */
    fun parseFile(text: String): Pair<JsonValue, JsonValue> {
        val file = runCatching { CanonicalJson.parse(text) }.getOrNull()
            ?: throw IllegalArgumentException("ملف غير صالح — ليس JSON")
        val manifest = file["manifest"] ?: throw IllegalArgumentException("manifest missing")
        val payload = file["payload"] ?: throw IllegalArgumentException("payload missing")
        return manifest to payload
    }
}
