// ============================================================================
// Json.kt — untyped JSON tree + canonical serializer (keys sorted), the port
// of the web's CanonicalJSON behavior that the `.sadaqa` equal()/integrity
// digest depends on. Numbers: integral values print without a fraction (JS
// JSON.stringify parity); non-integral via Kotlin Double.toString (shortest
// round-trip, matches JS for the values backups use).
// ============================================================================

package app.sadaqa.android.backup

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

sealed interface JsonValue {
    data object Null : JsonValue
    data class Bool(val value: Boolean) : JsonValue
    data class Num(val value: Double) : JsonValue
    data class Str(val value: String) : JsonValue
    data class Arr(val items: List<JsonValue>) : JsonValue
    data class Obj(val fields: Map<String, JsonValue>) : JsonValue

    // Indexing never returns Kotlin-null: a missing key yields JSON Null —
    // matches the golden engines' "undefined property" semantics (x.k → undefined).
    operator fun get(key: String): JsonValue =
        (this as? Obj)?.fields?.get(key) ?: Null

    val str: String? get() = (this as? Str)?.value
    val dbl: Double? get() = (this as? Num)?.value
    val int: Int? get() = (this as? Num)?.value?.let { if (it == it.toLong().toDouble()) it.toInt() else null }
    val long: Long? get() = (this as? Num)?.value?.let { if (it == it.toLong().toDouble()) it.toLong() else null }
    val bool: Boolean? get() = (this as? Bool)?.value
    val arr: List<JsonValue>? get() = (this as? Arr)?.items
    val obj: Map<String, JsonValue>? get() = (this as? Obj)?.fields
}

object CanonicalJson {

    private val json = Json { ignoreUnknownKeys = true }

    fun parse(text: String): JsonValue = toJsonValue(json.parseToJsonElement(text))

    fun serialize(v: JsonValue): String = buildString { write(v, this) }

    private fun write(v: JsonValue, out: StringBuilder) {
        when (v) {
            is JsonValue.Null -> out.append("null")
            is JsonValue.Bool -> out.append(if (v.value) "true" else "false")
            is JsonValue.Num -> out.append(formatNumber(v.value))
            is JsonValue.Str -> out.append(escape(v.value))
            is JsonValue.Arr -> {
                out.append('[')
                v.items.forEachIndexed { i, item -> if (i > 0) out.append(','); write(item, out) }
                out.append(']')
            }
            is JsonValue.Obj -> {
                out.append('{')
                sortedKeys(v.fields).forEachIndexed { i, k ->
                    if (i > 0) out.append(',')
                    out.append(escape(k)).append(':')
                    write(v.fields[k]!!, out)
                }
                out.append('}')
            }
        }
    }

    /**
     * Keys sorted; the `.sadaqa` TOP-LEVEL groups keep the golden's fixed
     * payload order (reading, dhikr, prefs, meta — backup.js insertion order)
     * so payload bytes match the web exporter byte-for-byte.
     */
    fun sortedKeys(fields: Map<String, JsonValue>): List<String> {
        val priority = mapOf("reading" to 0, "dhikr" to 1, "prefs" to 2, "meta" to 3)
        return fields.keys.sortedWith { a, b ->
            val pa = priority[a] ?: 99
            val pb = priority[b] ?: 99
            if (pa != pb) pa - pb else a.compareTo(b)
        }
    }

    /** JS JSON.stringify number formatting for backup-range values. */
    fun formatNumber(d: Double): String =
        if (d == kotlin.math.floor(d) && !d.isInfinite() && kotlin.math.abs(d) < 1e15) {
            d.toLong().toString()
        } else {
            d.toString()
        }

    private fun escape(s: String): String {
        val out = StringBuilder("\"")
        for (c in s) {
            when (c) {
                '"' -> out.append("\\\"")
                '\\' -> out.append("\\\\")
                '\n' -> out.append("\\n")
                '\r' -> out.append("\\r")
                '\t' -> out.append("\\t")
                else ->
                    if (c.code < 0x20) out.append("\\u%04x".format(c.code))
                    else out.append(c)
            }
        }
        return out.append('"').toString()
    }

    // element ↔ JsonValue
    fun toJsonValue(e: JsonElement): JsonValue = when (e) {
        is JsonNull -> JsonValue.Null
        is JsonPrimitive -> when {
            e.isString -> JsonValue.Str(e.content)
            e.booleanOrNull != null -> JsonValue.Bool(e.booleanOrNull!!)
            else -> JsonValue.Num(e.double)
        }
        is JsonArray -> JsonValue.Arr(e.map { toJsonValue(it) })
        is JsonObject -> JsonValue.Obj(e.mapValues { toJsonValue(it.value) })
    }
}
