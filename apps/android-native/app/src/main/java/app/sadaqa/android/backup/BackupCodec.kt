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
        "reading" to listOf("khatmahPlan", "bookmark", "highlight", "note"),
        "dhikr" to listOf("adhkarState", "tasbihCounter", "tasbihSession"),
        "prefs" to listOf("setting"),
        "meta" to listOf("streakDay"),
    )

    private val HIGHLIGHT_COLORS = listOf("gold", "emerald", "rose", "sky", "none")
    private val STREAK_KINDS = listOf("adhkar_morning", "adhkar_evening", "tasbih", "khatmah")
    private val DAY_KEY = Regex("^\\d{4}-\\d{2}-\\d{2}$")

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
    fun validateBackup(manifest: JsonValue?, payload: JsonValue?): Verdict {
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
        for ((group, groupValue) in groups) {
            val entities = groupValue.arr
            if (entities == null) { errors.add("payload.$group: must be an array"); continue }
            if (group !in BACKUP_GROUPS) {
                errors.add("payload.$group: unknown group (allowed: ${BACKUP_GROUPS.joinToString(", ")})")
                continue
            }
            val allowed = GROUP_ENTITY_TYPES[group]!!
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
                val deleted = obj["deleted"]
                if (deleted != null && deleted !is JsonValue.Bool) {
                    errors.add("payload.$group[$uuid].deleted: must be boolean when present")
                    continue
                }
                counts[group] = (counts[group] ?: 0) + 1
                validateEntityBody(group, type, obj)?.let { errors.add("payload.$group[$uuid]: $it") }
            }
        }
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
    private fun validateEntityBody(group: String, type: String, e: JsonValue): String? = when ("$group/$type") {
        "reading/bookmark" -> {
            val page = e["page"]
            if (!isInt(page) || page.int !in 1..604) "page must be 1..604" else null
        }
        "reading/highlight" -> when {
            !isInt(e["ayahNumber"]) || e["ayahNumber"].int !in 1..6236 -> "ayahNumber must be 1..6236"
            !isInt(e["wordStart"]) || e["wordStart"].int!! < 1 -> "wordStart must be >= 1"
            !isInt(e["wordEnd"]) || e["wordEnd"].int!! < e["wordStart"].int!! -> "wordEnd must be >= wordStart"
            e["colorKey"].str !in HIGHLIGHT_COLORS -> "colorKey must be a token color key"
            else -> null
        }
        "reading/khatmahPlan" -> when {
            e["mode"].str != "deadline" && e["mode"].str != "rate" -> "mode must be deadline|rate"
            e["mode"].str == "deadline" && !DAY_KEY.matches(e["endDate"].str ?: "") -> "deadline mode requires endDate YYYY-MM-DD"
            e["mode"].str == "rate" && (!isInt(e["dailyPages"]) || e["dailyPages"].int!! !in 1..604) -> "rate mode requires dailyPages 1..604"
            !DAY_KEY.matches(e["startDate"].str ?: "") -> "startDate must be YYYY-MM-DD"
            else -> null
        }
        "dhikr/tasbihCounter" -> when {
            e["dhikrText"].str.isNullOrEmpty() -> "dhikrText required"
            e["target"] != null && e["target"] !is JsonValue.Null &&
                (!isInt(e["target"]) || e["target"].int!! < 1) -> "target must be >= 1 or null"
            else -> null
        }
        "dhikr/adhkarState" -> when {
            !DAY_KEY.matches(e["dayKey"].str ?: "") -> "dayKey must be YYYY-MM-DD"
            !isInt(e["count"]) || e["count"].int!! < 0 -> "count must be >= 0"
            else -> null
        }
        "prefs/setting" -> when {
            e["key"].str.isNullOrEmpty() -> "key required"
            "value" !in (e.obj ?: emptyMap()) -> "value required (may be null)"
            else -> null
        }
        "meta/streakDay" -> when {
            e["kind"].str !in STREAK_KINDS -> "kind must be a streak kind"
            !DAY_KEY.matches(e["dayKey"].str ?: "") -> "dayKey must be YYYY-MM-DD"
            else -> null
        }
        "dhikr/tasbihSession" -> when {
            !isInt(e["countDelta"]) || e["countDelta"].int!! <= 0 -> "countDelta must be > 0"
            !isEpochMs(e["occurredAt"]) -> "occurredAt must be epoch ms"
            else -> null
        }
        "reading/note" -> if (e["body"]?.str == null) "body must be a string" else null
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
        JsonValue.Obj(mapByGroup.mapValues { (_, map) -> JsonValue.Arr(map.keys.sorted().map { map[it]!! }) })

    /** Parse a `.sadaqa` file text into (manifest, payload). */
    fun parseFile(text: String): Pair<JsonValue, JsonValue> {
        val file = runCatching { CanonicalJson.parse(text) }.getOrNull()
            ?: throw IllegalArgumentException("ملف غير صالح — ليس JSON")
        val manifest = file["manifest"] ?: throw IllegalArgumentException("manifest missing")
        val payload = file["payload"] ?: throw IllegalArgumentException("payload missing")
        return manifest to payload
    }
}
