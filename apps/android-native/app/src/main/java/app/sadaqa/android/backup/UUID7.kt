// ============================================================================
// UUID7.kt — port of apps/web-desktop/js/data/uuid7.js (golden).
// synthUuid7 must be BYTE-IDENTICAL across targets (Smart Merge dedupe):
// FNV-1a ×4 with seeds [811c9dc5, 0193dc47, 9e3779b9, 85ebca6b] over the key,
// shaped to UUIDv7 with the (pinned for parity) 48-bit ms timestamp. The
// natural keys in practice (`setting:<k>`, `adhkar:<item>:<day>`,
// `streak:<kind>:<day>`, `row:<uuid>`) are ASCII where JS UTF-16 code units
// == UTF-8 bytes (see uuid7.js).
// Parity vectors: Fixtures uuid7/synth.json (pinnedNow) — Uuid7ParityTest.
// ============================================================================

package app.sadaqa.android.backup

import java.security.SecureRandom

object UUID7 {

    private val rng = SecureRandom()

    fun uuid7(nowMs: Long = System.currentTimeMillis()): String {
        val bytes = ByteArray(10)
        rng.nextBytes(bytes)
        val h = bytes.joinToString("") { "%02x".format(it) }
        return shape(h, nowMs)
    }

    fun synthUuid7(key: String, nowMs: Long = System.currentTimeMillis()): String {
        val seeds = intArrayOf(0x811c9dc5.toInt(), 0x0193dc47.toInt(), 0x9e3779b9.toInt(), 0x85ebca6b.toInt())
        val hexes = seeds.map { seed ->
            var h = seed
            for (c in key) { // UTF-16 code units, JS charCodeAt parity
                h = (h xor c.code) * 0x01000193
            }
            "%08x".format(h)
        }
        return shape(hexes.joinToString(""), nowMs)
    }

    /** UUIDv7 shape with the 48-bit ms timestamp in the high bits. */
    internal fun shape(h: String, nowMs: Long): String {
        val ts = "%012x".format(nowMs).takeLast(12)
        val a = ts.substring(0, 8)
        val b = ts.substring(8, 12)
        return "$a-$b-7${h.substring(0, 3)}-b${h.substring(3, 6)}-${h.substring(6, 18)}"
    }

    private val V7 = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

    fun isV7Shape(s: String?): Boolean = s != null && V7.matches(s)
}
