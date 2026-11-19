// ============================================================================
// ParityTests.kt — Phase 5 verification gates (PURE JVM — no Robolectric):
// every fixture is generated from the WEB golden engines and shipped into
// app/src/test/resources/fixtures by scripts/tools/sync-native-assets.mjs.
// ============================================================================

package app.sadaqa.android

import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import app.sadaqa.android.backup.BackupCodec
import app.sadaqa.android.backup.CanonicalJson
import app.sadaqa.android.backup.JsonValue
import app.sadaqa.android.backup.JsonValue.Arr
import app.sadaqa.android.backup.JsonValue.Bool
import app.sadaqa.android.backup.JsonValue.Num
import app.sadaqa.android.backup.JsonValue.Obj
import app.sadaqa.android.backup.JsonValue.Str
import app.sadaqa.android.backup.UUID7
import app.sadaqa.android.data.SadaqaDb
import app.sadaqa.android.data.TodayProgress
import app.sadaqa.android.engine.EngineOptions
import app.sadaqa.android.engine.HijriEngine
import app.sadaqa.android.engine.PrayerEngine
import app.sadaqa.android.engine.PrayerName
import app.sadaqa.android.engine.QiblaEngine
import app.sadaqa.android.engine.SmartCardResolver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// ---------------------------------------------------------------------------
// fixture loader — mirrors the iOS FixtureLoader (folder "fixtures" in
// test resources; a packaging step copies the synced corpus here).
// ---------------------------------------------------------------------------

object Fixtures {
    private val dir: File by lazy {
        sequenceOf(
            File("src/test/resources/fixtures"),
            File("app/src/test/resources/fixtures"),
            // Gradle test working dir is the module dir; the sync script also
            // copies individual files to resources root for flat loading
            File("app/src/test/resources"),
        ).firstOrNull { it.isDirectory } ?: File("src/test/resources/fixtures")
    }

    fun read(rel: String): JsonValue {
        val f = File(dir, rel)
        require(f.exists()) { "missing fixture: ${f.absolutePath}" }
        return CanonicalJson.parse(f.readText())
    }
}

// ---------------------------------------------------------------------------
// 1. Prayer parity — 0 ms drift across the full fixture grids.
// ---------------------------------------------------------------------------

class PrayerParityTest {

    @Test
    fun prayerTimesZeroMsDriftAcrossMonthGrids() {
        val manifest = Fixtures.read("manifest.json")
        val prayerFiles = manifest["files"]!!.arr!!
            .mapNotNull { it["path"]?.str }
            .filter { it.contains("/prayer/") }
            .map { it.substringAfterLast('/') }
        assertTrue("expected ≥24 prayer fixture grids", prayerFiles.size >= 24)

        var checked = 0
        for (file in prayerFiles) {
            val fx = Fixtures.read("prayer/$file")
            val meta = fx["meta"]!!
            val opts = EngineOptions(
                lat = meta["lat"]!!.dbl!!,
                lng = meta["lng"]!!.dbl!!,
                timeZone = meta["timeZone"]!!.str!!,
                method = meta["method"]!!.str!!,
                madhab = meta["madhab"]!!.str!!,
                highLatitudeRule = meta["highLatitudeRule"]!!.str!!,
            )
            for (day in fx["days"]!!.arr!!) {
                val date = day["date"]!!.str!!
                val got = PrayerEngine.computeForDate(date, opts)
                for (name in PrayerName.entries) {
                    val want = day["prayers"]!![name.key]!!.long!!
                    assertEquals("$file $date ${name.key}", want, got[name])
                    checked++
                }
                val sched = PrayerEngine.daySchedule(date, opts)
                assertEquals("$file $date previousIsha", day["previousIsha"]!!.long!!, sched.previousIsha)
                val sun = day["sunnah"]!!
                val windows = PrayerEngine.sunnahWindows(date, opts)
                assertEquals("$file duha", sun["duha"]!!.long!!, windows.duha)
                assertEquals("$file duhaEnd", sun["duhaEnd"]!!.long!!, windows.duhaEnd)
                assertEquals("$file midnight", sun["midnight"]!!.long!!, windows.midnight)
                assertEquals("$file lastThird", sun["lastThird"]!!.long!!, windows.lastThird)
            }
            for (probe in fx["nextProbes"]!!.arr!!) {
                val got = PrayerEngine.next(probe["now"]!!.long!!, opts)
                val want = probe["expected"]!!
                assertEquals("$file nextProbes name", want["name"]!!.str!!, got.name.key)
                assertEquals("$file nextProbes at", want["at"]!!.long!!, got.at)
                assertEquals("$file nextProbes previous", want["previous"]!!["name"]!!.str!!, got.previousName?.key)
                assertEquals("$file nextProbes previousAt", want["previous"]!!["at"]!!.long!!, got.previousAt)
            }
        }
        assertTrue("prayer parity checked instants", checked > 4000)
    }
}

// ---------------------------------------------------------------------------
// 2. Smart card parity — §9 resolver matrix (6 kinds × 6 cities).
// ---------------------------------------------------------------------------

class SmartCardParityTest {

    @Test
    fun smartCardKindsMatchWebResolver() {
        val fx = Fixtures.read("smart-card/cases.json")
        val cases = fx["cases"]!!.arr!!
        assertEquals(42, cases.size)
        val kinds = mutableSetOf<String>()
        for (c in cases) {
            val cityKey = c["name"]!!.str!!.substringBefore(':')
            val opts = optsFor(cityKey)
            val engine = PrayerEngine.bind(opts)
            val card = SmartCardResolver.resolve(c["now"]!!.long!!, engine)
            val want = c["expectedKind"]!!.str!!
            kinds.add(card.kind.key)
            assertEquals(c["name"]!!.str!!, want, card.kind.key)
        }
        for (expected in listOf("kahf", "after_prayer", "qiyam", morningKey(), "evening", "next_prayer")) {
            assertTrue("kind missing from matrix: $expected", expected in kinds)
        }
    }

    private fun morningKey() = "morning"

    private fun optsFor(cityKey: String): EngineOptions = when (cityKey) {
        "makkah" -> EngineOptions(21.4225, 39.8262, "Asia/Riyadh")
        "london" -> EngineOptions(51.5074, -0.1278, "Europe/London")
        "anchorage" -> EngineOptions(61.2181, -149.9003, "America/Anchorage")
        "auckland" -> EngineOptions(-36.8485, 174.7633, "Pacific/Auckland")
        "losangeles" -> EngineOptions(34.0522, -118.2437, "America/Los_Angeles")
        "tokyo" -> EngineOptions(35.6762, 139.6503, "Asia/Tokyo")
        else -> throw AssertionError("unknown fixture city $cityKey")
    }
}

// ---------------------------------------------------------------------------
// 3. Backup codec parity — validator verdicts, merge table, real .sadaqa file.
// ---------------------------------------------------------------------------

class BackupCodecParityTest {

    @Test
    fun validatorVerdicts() {
        val fx = Fixtures.read("backup/validate-cases.json")
        val cases = fx["cases"]!!.arr!!
        assertTrue(cases.size >= 29)
        for (c in cases) {
            val verdict = BackupCodec.validateBackup(c["manifest"], c["payload"])
            assertEquals("case ${c["name"]!!.str} ok", c["expectOk"]!!.bool!!, verdict.ok)
            assertEquals("case ${c["name"]!!.str} error count", c["expectErrorCount"]!!.int!!, verdict.errors.size)
            // only ok-cases carry counts
            if (verdict.ok && c["payload"]["reading"]?.arr?.isNotEmpty() == true) {
                assertTrue(verdict.counts.isNotEmpty())
            }
        }
    }

    @Test
    fun mergeTable() {
        val fx = Fixtures.read("backup/merge-cases.json")
        val cases = fx["cases"]!!.arr!!
        assertTrue(cases.size >= 15)
        for (c in cases) {
            val local = mutableMapOf<String, Map<String, JsonValue>>()
            for ((group, groupValue) in c["local"]!!.obj ?: emptyMap()) {
                local[group] = groupValue.arr!!.associate { it["uuid"]!!.str!! to it }
            }
            val result = BackupCodec.mergePayload(local, c["payload"], c["mode"]!!.str!!, c["now"]!!.long!!)
            val want = c["expected"]!!
            assertEquals("report.added", want["report"]!!["added"]!!.int!!, result.report.added)
            assertEquals("report.updated", want["report"]!!["updated"]!!.int!!, result.report.updated)
            assertEquals("report.conflicts", want["report"]!!["conflicts"]!!.int!!, result.report.conflicts)
            assertEquals("report.skipped", want["report"]!!["skipped"]!!.int!!, result.report.skipped)
            assertEquals("report.deleted", want["report"]!!["deleted"]!!.int!!, result.report.deleted)
            val wantMutations = want["mutations"]!!.arr!!
            assertEquals("mutations size", wantMutations.size, result.mutations.size)
            for ((got, w) in result.mutations.zip(wantMutations)) {
                assertEquals("mutation group", w["group"]!!.str, got.group)
                assertEquals("mutation uuid", w["uuid"]!!.str, got.uuid)
                assertEquals("mutation action", w["action"]!!.str, got.action)
                assertEquals("mutation entity bytes", CanonicalJson.serialize(w["entity"]!!), CanonicalJson.serialize(got.entity))
            }
        }
    }

    /** The cross-OS contract: a REAL web-exported `.sadaqa` file validates here. */
    @Test
    fun webExportedFileImportableOnAndroid() {
        val fx = Fixtures.read("backup/sample-export.json")
        val manifest = fx["manifest"]!!
        val payloadJson = fx["payloadJson"]!!.str!!
        assertEquals("integrity digest over payload bytes", app.sadaqa.android.data.Sha256.hex(payloadJson), manifest["integrity"]!!.str)
        val verdict = BackupCodec.validateBackup(manifest, CanonicalJson.parse(payloadJson))
        assertTrue("validator refuses web export: ${verdict.errors.take(3)}", verdict.ok)
        assertEquals(7, verdict.counts["reading"]) // 2026-11: +2 khatmahPageLog in golden fixture
        assertEquals(7, verdict.counts["dhikr"])
        assertEquals(2, verdict.counts["prefs"])
        assertEquals(2, verdict.counts["meta"])
    }
}

// ---------------------------------------------------------------------------
// 4. UUIDv7 byte-parity (pinned clock — the Smart Merge dedupe contract).
// ---------------------------------------------------------------------------

class Uuid7ParityTest {

    @Test
    fun synthUuid7ByteIdenticalWithWeb() {
        val fx = Fixtures.read("uuid7/synth.json")
        val pinned = (fx["meta"]!!["pinnedNow"]!!.dbl!!).toLong()
        for (v in fx["synth"]!!.arr!!) {
            assertEquals(
                "synth uuid for ${v["key"]!!.str}",
                v["uuid"]!!.str,
                UUID7.synthUuid7(v["key"]!!.str!!, pinned),
            )
        }
    }

    @Test
    fun uuid7ShapeAndOrdering() {
        val base = 1_764_300_000_000L
        val a = UUID7.uuid7(base)
        val b = UUID7.uuid7(base + 1)
        assertTrue(UUID7.isV7Shape(a))
        assertTrue(UUID7.isV7Shape(b))
        assertTrue("timestamp prefix monotonic", a.substring(0, 13) < b.substring(0, 13))
    }
}

// ---------------------------------------------------------------------------
// 5. Hijri + Qibla parity.
// ---------------------------------------------------------------------------

class HijriQiblaParityTest {

    @Test
    fun hijriRoundTripVectors() {
        val fx = Fixtures.read("hijri/roundtrip.json")
        for (w in fx["weekly"]!!.arr!!) {
            val iso = w["gregorian"]!!.str!!
            val got = HijriEngine.toHijri(iso)
            assertEquals("$iso y", w["hijri"]!!["y"]!!.int!!, got.y)
            assertEquals("$iso m", w["hijri"]!!["m"]!!.int!!, got.m)
            assertEquals("$iso d", w["hijri"]!!["d"]!!.int!!, got.d)
        }
        for (p in fx["probes"]!!.arr!!) {
            val got = HijriEngine.fromHijri(HijriEngine.HijriDate(p["hijri"]!!["y"]!!.int!!, p["hijri"]!!["m"]!!.int!!, p["hijri"]!!["d"]!!.int!!))
            assertEquals("fromHijri ${p["hijri"]}", p["gotGregorian"]!!.str, got)
        }
        for (t in fx["mustThrow"]!!.arr!!) {
            try {
                HijriEngine.fromHijri(HijriEngine.HijriDate(t["hijri"]!!["y"]!!.int!!, t["hijri"]!!["m"]!!.int!!, t["hijri"]!!["d"]!!.int!!))
                org.junit.Assert.fail("${t["hijri"]} must throw")
            } catch (expected: IllegalArgumentException) {
                // expected — the web engine throws on nonexistent Hijri dates
            }
        }
        for (a in fx["adjusts"]!!.arr!!) { // fixture shape: [{adjust, "2026-11-17": {y,m,d}}]
            val adjust = a["adjust"]!!.int!!
            val got = HijriEngine.withAdjust("2026-11-17", adjust)
            assertEquals(
                "adjust $adjust",
                HijriEngine.HijriDate(a["2026-11-17"]!!["y"]!!.int!!, a["2026-11-17"]!!["m"]!!.int!!, a["2026-11-17"]!!["d"]!!.int!!),
                got,
            )
        }
    }

    @Test
    fun islamicEvents2026() {
        val fx = Fixtures.read("hijri/events.json")
        val got = HijriEngine.events(2026)
        val want = fx["events2026"]!!.arr!!
        assertEquals(want.size, got.size)
        for ((g, w) in got.zip(want)) {
            assertEquals(w["key"]!!.str, g.key)
            assertEquals(w["gregorian"]!!.str, g.gregorian)
        }
    }

    @Test
    fun qiblaBearings() {
        val fx = Fixtures.read("qibla/bearings.json")
        for (p in fx["points"]!!.arr!!) {
            assertEquals(
                p["name"]!!.str + " bearing",
                p["bearing"]!!.dbl!!,
                QiblaEngine.qiblaBearing(p["lat"]!!.dbl!!, p["lng"]!!.dbl!!),
                1e-9,
            )
            assertEquals(
                p["name"]!!.str + " distance",
                p["distanceKm"]!!.dbl!!,
                QiblaEngine.distanceKm(p["lat"]!!.dbl!!, p["lng"]!!.dbl!!),
                1e-9,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// 6. Schema contract — the shipped db matches tableinfo.json exactly.
// ---------------------------------------------------------------------------

class SchemaContractTest {

    @Test
    fun bundledDatabaseMatchesSchemaContract() {
        val contract = Fixtures.read("schema/tableinfo.json")
        val tables = contract["tables"]!!.obj!!
        val dbFile = File("build/tmp-p5/schema-${System.nanoTime()}.db").also { f ->
            f.parentFile?.mkdirs()
            f.writeBytes(seedBytes())
        }
        val db = SadaqaDb.open(dbFile, ::seedBytes)
        try {
            for ((name, spec) in tables) {
                val columns = db.query("PRAGMA table_info($name)")
                val want = spec["columns"]!!.arr!!
                assertEquals("table $name column count", want.size, columns.size)
                for ((c, w) in columns.zip(want)) {
                    val col = w["name"]!!.str!!
                    assertEquals("table $name col $col name", col, c.strings["name"])
                    assertEquals("table $name col $col type", (w["type"]!!.str ?: "").uppercase(), (c.strings["type"] ?: "").uppercase())
                    assertEquals("table $name col $col notnull", if (w["notnull"]!!.bool!!) 1L else 0L, c.longs["notnull"])
                    assertEquals("table $name col $col pk", if ((w["pk"]!!.int!!) > 0) 1L else 0L, if ((c.longs["pk"] ?: 0L) > 0) 1L else 0L)
                    // defaults: compare normalized (both sides null OR equal text)
                    val wantDflt = w["dflt"]?.str
                    val gotDflt = c.strings["dflt_value"]
                    if (wantDflt != null || gotDflt != null) {
                        assertEquals("table $name col $col default", wantDflt, gotDflt)
                    }
                }
            }
        } finally {
            db.close()
        }
    }

    /** Seed db resolved from the synced asset tree (Gradle test CWD is app/). */
    private fun seedBytes(): ByteArray = sequenceOf(
        File("src/main/assets/sadaqa.db"),
        File("app/src/main/assets/sadaqa.db"),
        File("../../../packages/core-data/build/sadaqa.db"),
        File("../../packages/core-data/build/sadaqa.db"),
    ).firstOrNull { it.exists() }?.readBytes()
        ?: throw IllegalStateException("sadaqa.db not found — run npm run native:sync")
}

// ---------------------------------------------------------------------------
// 7. Cross-platform round-trip: web export fixture → import (Merge/Replace)
//    into the REAL bundled db via the Android pipeline — the Phase 5
//    checklist item executed on Android.
// ---------------------------------------------------------------------------

class DbRoundTripTest {

    private fun makeDb(): SadaqaDb {
        val f = File("build/tmp-p5/roundtrip-${System.nanoTime()}.db")
        f.parentFile?.mkdirs()
        return SadaqaDb.open(f, ::seedBytesOf)
    }

    private fun seedBytesOf(): ByteArray = sequenceOf(
        File("src/main/assets/sadaqa.db"),
        File("app/src/main/assets/sadaqa.db"),
        File("../../../packages/core-data/build/sadaqa.db"),
        File("../../packages/core-data/build/sadaqa.db"),
        File("../../ios-native/Resources/sadaqa.db"),
        File("packages/core-data/build/sadaqa.db"),
    ).firstOrNull { it.exists() }?.readBytes() ?: throw IllegalStateException("seed db missing — run npm run native:sync")

    @Test
    fun importWebExportMergeThenReplace() {
        val fx = Fixtures.read("backup/sample-export.json")
        val text = CanonicalJson.serialize(
            Obj(mapOf(
                "manifest" to fx["manifest"]!!,
                "payload" to CanonicalJson.parse(fx["payloadJson"]!!.str!!),
            )),
        )
        val db = makeDb()
        db.deviceId()
        try {
            // 1. Merge into the empty seed → all inserts
            val merge = db.importBackup(text, "merge")
            assertEquals(18, merge.added) // 7 + 7 + 2 + 2 fixture entities (2026-11: +2 khatmahPageLog)
            assertEquals(2L, db.queryOne("SELECT COUNT(*) AS n FROM bookmarks")!!.longs["n"])
            assertEquals(3L, db.queryOne("SELECT COUNT(*) AS n FROM tasbih_sessions")!!.longs["n"])
            assertEquals(2L, db.queryOne("SELECT COUNT(*) AS n FROM khatmah_page_log")!!.longs["n"])
            val theme = db.queryOne("SELECT value FROM user_settings WHERE key = ?", listOf("theme"))
            assertEquals("\"dark\"", theme!!.strings["value"])

            // 2. Local edit (newer bookmark) then re-merge → conflict (local alive & newer)
            val newer = 1_800_000_000_000L
            db.execute("UPDATE bookmarks SET page = 9, updated_at = ? WHERE page = 2", listOf(newer))
            val merge2 = db.importBackup(text, "merge")
            assertEquals(1, merge2.conflicts)

            // 3. Full Replace wipes and restores exactly the payload
            val replace = db.importBackup(text, "replace")
            assertEquals(18, replace.added)
            assertEquals(2L, db.queryOne("SELECT COUNT(*) AS n FROM bookmarks")!!.longs["n"])
            val page = db.queryOne("SELECT page FROM bookmarks WHERE label_ar = ?", listOf("الفاتحة"))
            assertEquals(2L, page!!.longs["page"])
            assertEquals(1L, db.queryOne("SELECT COUNT(*) AS n FROM user_settings WHERE key = ?", listOf("device_id"))!!.longs["n"])
            val audit = db.queryOne("SELECT direction FROM backup_log ORDER BY id DESC LIMIT 1")
            assertEquals("import", audit!!.strings["direction"])

            // 4. Android export → same validator → integrity holds (round-trip closure)
            val (manifest, payloadJson) = db.buildExportPayload(1_764_300_000_000)
            assertEquals("Android export integrity", manifest["integrity"]!!.str, app.sadaqa.android.data.Sha256.hex(payloadJson))
            val verdict = BackupCodec.validateBackup(manifest, CanonicalJson.parse(payloadJson))
            assertTrue("Android export validates: ${verdict.errors.take(3)}", verdict.ok)
        } finally {
            db.close()
        }
    }

    private fun Sha256Hex(s: String) = app.sadaqa.android.data.Sha256.hex(s)

    @Test
    fun tamperedImportRefusedAndRollsBack() {
        // integrity recompute (2026-11 finding): a structurally-valid payload
        // whose bytes were altered after export must be refused BEFORE any
        // write — the db stays byte-identical (rollback/cleanliness proof).
        val fx = Fixtures.read("backup/sample-export.json")
        val manifest = fx["manifest"]!!
        val parsed = CanonicalJson.parse(fx["payloadJson"]!!.str!!)
        val tampered = CanonicalJson.parse(fx["payloadJson"]!!.str!!.replace("\"page\":303", "\"page\":304"))
        val text = CanonicalJson.serialize(Obj(mapOf("manifest" to manifest, "payload" to tampered)))
        val db = makeDb()
        db.deviceId()
        try {
            val before = db.queryOne("SELECT COUNT(*) AS n FROM bookmarks")!!.longs["n"]
            val err = runCatching { db.importBackup(text, "merge") }.exceptionOrNull()
            assertTrue(
                "tampered import refused with integrity error, got: $err",
                err is IllegalArgumentException && err.message?.contains("integrity") == true,
            )
            assertEquals("no row written before refusal", before, db.queryOne("SELECT COUNT(*) AS n FROM bookmarks")!!.longs["n"])

            // missing digest field is refused too
            val noDigest = CanonicalJson.serialize(Obj(mapOf(
                "manifest" to Obj(manifest.obj!!.filterKeys { it != "integrity" }),
                "payload" to parsed,
            )))
            val err2 = runCatching { db.importBackup(noDigest, "merge") }.exceptionOrNull()
            assertTrue("missing digest refused: $err2", err2 != null && err2.message?.contains("integrity") == true)

            // the clean golden export still imports — digest over canonical
            // bytes equals the web golden's (cross-target byte parity)
            val clean = db.importBackup(CanonicalJson.serialize(Obj(mapOf("manifest" to manifest, "payload" to parsed))), "merge")
            assertEquals(18, clean.added)
        } finally {
            db.close()
        }
    }

    @Test
    fun uuid7GroupOrderMatchesWebPayloadBytes() {
        // top-level groups must serialize in the golden's fixed order
        val payload = BackupCodec.toPayloadGroups(mapOf(
            "meta" to emptyMap(), "prefs" to emptyMap(), "dhikr" to emptyMap(), "reading" to emptyMap(),
        ))
        assertTrue("group order reading,dhikr,prefs,meta",
            CanonicalJson.serialize(payload).startsWith("{\"reading\":"))
    }
}

// ---------------------------------------------------------------------------
// 8. Write-path regression tests — adhkar tap, tasbih tap, bookmarks,
//    and 0-byte database file self-healing.
// ---------------------------------------------------------------------------

class DatabaseWritePathTest {

    private fun seedBytesOf(): ByteArray = sequenceOf(
        File("src/main/assets/sadaqa.db"),
        File("app/src/main/assets/sadaqa.db"),
        File("../../../packages/core-data/build/sadaqa.db"),
        File("../../packages/core-data/build/sadaqa.db"),
        File("packages/core-data/build/sadaqa.db"),
    ).firstOrNull { it.exists() }?.readBytes() ?: throw IllegalStateException("seed db missing")

    @Test
    fun zeroByteDbFileRecoversFromSeedAndHandlesWritePaths() {
        val f = File("build/tmp-p5/writepath-${System.nanoTime()}.db")
        f.parentFile?.mkdirs()
        f.writeBytes(ByteArray(0)) // simulate corrupt 0-byte copy

        val db = SadaqaDb.open(f, ::seedBytesOf)
        try {
            assertTrue("0-byte db must be replaced with full seed", f.length() > 1000)
            val now = 1_794_988_800_000L
            val day = "2026-11-18"

            val item = db.queryOne("SELECT item_id, category_id, count_target FROM athkar_items WHERE count_target > 0 LIMIT 1")!!
            val itemId = item.strings["item_id"]!!
            val catId = item.strings["category_id"]!!
            val target = item.longs["count_target"]!!.toInt()

            var cur = 0
            for (step in 0 until target) {
                cur = db.incrementDhikrTap(itemId, catId, cur, target, day, now + step * 100L)
                assertEquals(step + 1, cur)
            }
            val stored = db.queryOne("SELECT count FROM adhkar_state WHERE item_id = ? AND day_key = ?", listOf(itemId, day))
            assertEquals(target.toLong(), stored?.longs?.get("count"))

            db.ensureDefaultTasbihPresets(now)
            val counterUuid = db.queryOne("SELECT uuid FROM tasbih_counters WHERE deleted = 0 ORDER BY sort_order LIMIT 1")!!.strings["uuid"]!!
            db.recordTasbihTap(counterUuid, 33, 33, day, now + 10L)
            assertEquals(1L, db.queryOne("SELECT count FROM tasbih_counters WHERE uuid = ?", listOf(counterUuid))?.longs?.get("count"))
            assertEquals(1L, db.queryOne("SELECT COUNT(*) AS n FROM streak_days WHERE kind = 'tasbih' AND day_key = ?", listOf(day))?.longs?.get("n"))

            assertTrue(db.toggleBookmark(1, 1, null, "الفاتحة", now + 20L))
            assertTrue(!db.toggleBookmark(1, 1, null, "الفاتحة", now + 30L))
        } finally {
            db.close()
        }
    }

    @Test
    fun selectCityZagazigAndComputePrayers() {
        val f = File("build/tmp-p5/city-${System.nanoTime()}.db")
        f.parentFile?.mkdirs()
        val db = SadaqaDb.open(f, ::seedBytesOf)
        try {
            val matches = db.searchCities("الزقازيق")
            val zagazig = matches.firstOrNull {
                it.nameAr.contains("الزقازيق") || it.nameEn.contains("zagazig", ignoreCase = true)
            } ?: throw AssertionError("expected الزقازيق in cities search")
            assertEquals("Africa/Cairo", zagazig.timeZone)

            db.selectCity(zagazig, now = 1_794_988_800_000L)
            val opts = db.engineOptions()
            assertEquals("Africa/Cairo", opts.timeZone)
            assertEquals(zagazig.lat, opts.lat, 1e-4)
            assertEquals(zagazig.lng, opts.lng, 1e-4)

            val sched = PrayerEngine.daySchedule("2026-11-18", opts)
            assertTrue(sched.prayers.getValue(PrayerName.FAJR) < sched.prayers.getValue(PrayerName.DHUHR))
            assertTrue(sched.prayers.getValue(PrayerName.DHUHR) < sched.prayers.getValue(PrayerName.ISHA))

            val next = PrayerEngine.next(sched.prayers.getValue(PrayerName.ISHA) + 60_000L, opts)
            assertEquals(PrayerName.FAJR, next.name)

            val card = SmartCardResolver.resolve(
                sched.prayers.getValue(PrayerName.DHUHR) + 2 * 60 * 60_000L,
                PrayerEngine.bind(opts),
            )
            if (card.kind == app.sadaqa.android.engine.SmartCardKind.NEXT_PRAYER) {
                assertEquals("التقويم الهجري", card.actionLabel)
                assertEquals("tools-hijri", card.actionScreen)
            }
            assertEquals("\"الصلاه\"*", SadaqaDb.ftsQuery("الصلاة"))
        } finally {
            db.close()
        }
    }

    @Test
    fun widgetLocationParsesCommaLocalesAndOptions() {
        val parsed = app.sadaqa.android.widget.WidgetData.parseLocation(
            "21,422500;39,826200;Asia/Riyadh;egyptian;hanafi;seventh_of_night",
        )
        requireNotNull(parsed)
        assertEquals(21.4225, parsed.lat, 1e-6)
        assertEquals(39.8262, parsed.lng, 1e-6)
        assertEquals("Asia/Riyadh", parsed.timeZone)
        assertEquals("egyptian", parsed.method)
        assertEquals("hanafi", parsed.madhab)
        assertEquals("seventh_of_night", parsed.highLatitudeRule)
    }

    @Test
    fun schemaDowngradeThrowsInsteadOfContinuing() {
        val f = File("build/tmp-p5/downgrade-${System.nanoTime()}.db")
        f.parentFile?.mkdirs()
        val db = SadaqaDb.open(f, ::seedBytesOf)
        db.execute("UPDATE meta SET value = '999' WHERE key = 'schema_version'")
        db.close()

        val err = runCatching { SadaqaDb.open(f, ::seedBytesOf) }.exceptionOrNull()
        assertTrue("expected IllegalStateException on schema downgrade, got: $err", err is IllegalStateException)
    }

    @Test
    fun importPreservesDeviceIdAndOrdersTasbihSessionAfterCounter() {
        val f = File("build/tmp-p5/fk-dev-${System.nanoTime()}.db")
        f.parentFile?.mkdirs()
        val db = SadaqaDb.open(f, ::seedBytesOf)
        try {
            val localDeviceId = db.deviceId()
            val now = 1_764_300_000_000L
            val counterUuid = "01933c9e-1111-7000-8000-000000000001"
            val sessionUuid = "01933c9e-2222-7000-8000-000000000002"
            val settingUuid = "01933c9e-3333-7000-8000-000000000003"
            val payload = Obj(mapOf(
                "reading" to Arr(emptyList()),
                "dhikr" to Arr(listOf(
                    Obj(mapOf(
                        "uuid" to Str(sessionUuid), "type" to Str("tasbihSession"), "updatedAt" to Num(now.toDouble()),
                        "counterUuid" to Str(counterUuid), "countDelta" to Num(3.0), "occurredAt" to Num(now.toDouble()),
                    )),
                    Obj(mapOf(
                        "uuid" to Str(counterUuid), "type" to Str("tasbihCounter"), "updatedAt" to Num(now.toDouble()),
                        "deleted" to Bool(false), "labelAr" to Str("سبحان الله"), "dhikrText" to Str("سبحان الله"),
                        "target" to Num(33.0), "count" to Num(3.0), "totalLifetime" to Num(3.0), "sortOrder" to Num(0.0),
                    )),
                )),
                "prefs" to Arr(listOf(
                    Obj(mapOf(
                        "uuid" to Str(settingUuid), "type" to Str("setting"), "updatedAt" to Num((now + 10_000).toDouble()),
                        "key" to Str("device_id"), "value" to Str("attacker-device-id"),
                    )),
                )),
                "meta" to Arr(emptyList()),
            ))
            val integrity = app.sadaqa.android.data.Sha256.hex(CanonicalJson.serialize(payload))
            val manifest = Obj(mapOf(
                "format" to Str("sadaqa-backup"),
                "formatVersion" to Num(1.0),
                "createdAt" to Num(now.toDouble()),
                "deviceId" to Str("other-device-0001"),
                "integrity" to Str(integrity),
                "entities" to Obj(mapOf("reading" to Num(0.0), "dhikr" to Num(2.0), "prefs" to Num(1.0), "meta" to Num(0.0))),
            ))
            val doc = CanonicalJson.serialize(Obj(mapOf("manifest" to manifest, "payload" to payload)))
            db.importBackup(doc, "merge")
            assertEquals(localDeviceId, db.deviceId())
            assertEquals(1L, db.queryOne("SELECT COUNT(*) AS n FROM tasbih_sessions WHERE uuid = ?", listOf(sessionUuid))!!.longs["n"])
        } finally {
            db.close()
        }
    }

    @Test
    fun hijriIsTodayAdjustmentMatchesEngine() {
        val adjusted = HijriEngine.withAdjust("2026-11-18", 1)
        val unadjusted = HijriEngine.withAdjust("2026-11-18", 0)
        assertTrue("adjust=+1 must shift the Hijri day forward", adjusted != unadjusted)
    }
}

// ---------------------------------------------------------------------------
// Today ورد اليوم — athkar-window progress aggregation (pure port of
// packages/core-data/engines/today-progress.js)
// ---------------------------------------------------------------------------

class TodayProgressTests {
    private fun cat(id: String, window: String?) = TodayProgress.Category(id, window)
    private fun item(id: String, categoryId: String, target: Int) = TodayProgress.Item(id, categoryId, target)
    private fun st(itemId: String, count: Int) = TodayProgress.StateRow(itemId, count)

    @Test
    fun windowsAggregateCompletedCountsInFixedOrder() {
        val categories = listOf(cat("c1", "fajr"), cat("c2", "asr"), cat("c3", "isha"))
        val items = listOf(item("i10", "c1", 10), item("i11", "c1", 7), item("i20", "c2", 5), item("i30", "c3", 4))
        val states = listOf(st("i10", 10), st("i11", 3), st("i20", 5))
        val windows = TodayProgress.compute(categories, items, states)

        assertEquals(3, windows.size)
        assertEquals(listOf("الصباح", "المساء", "النوم"), windows.map { it.titleAr })
        assertEquals("i10 done (count==target), i11 3/7 not", 1 to 2, windows[0].completed to windows[0].total)
        assertEquals(1 to 1, windows[1].completed to windows[1].total)
        assertEquals("i30 has no state row yet", 0 to 1, windows[2].completed to windows[2].total)
    }

    @Test
    fun unknownWindowsDroppedAndTargetZeroCompletesOnAnyTap() {
        val categories = listOf(cat("c1", "isha"), cat("c9", "noon"))
        val items = listOf(item("i10", "c1", 0), item("i90", "c9", 2))
        val states = listOf(st("i10", 2), st("i90", 2))
        val windows = TodayProgress.compute(categories, items, states)

        assertEquals("only fajr/asr/isha windows with items are shown", 1, windows.size)
        assertEquals("count_target 0 -> any tap completes", 1, windows[0].completed)
        assertEquals(1, windows[0].total)
    }
}
