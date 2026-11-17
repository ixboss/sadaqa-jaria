# Sadaqa Jaria — Android Native (Phase 5)

Kotlin + Jetpack Compose port of the verified Golden Reference
(`apps/web-desktop/`). Same `sadaqa.db` (byte-identical copy), same QPC1
fonts, same tokens, same `.sadaqa` format — one contract, four targets.

## Data layer decision (documented)

The app opens the **exact bundled sadaqa.db** through
`androidx.sqlite:sqlite-bundled` (bundled SQLite with **guaranteed FTS5** —
per ARCHITECTURE §3 the app never depends on the device's system SQLite).
This mirrors the golden reference's own hosting model (a raw SQLite file, as
on web/Electron). Room-over-prepackaged-db was evaluated and deliberately
rejected: the schema is not Room-authored, so opening it under Room requires
hand-annotating every FK/index/default of the full 31-table graph to pass
Room's identity validation — a large, untestable-locally surface for zero
user-visible gain. A Room migration path is straightforward once (and if) the
schema is Room-authored. All SQL is parameter-bound; no string-assembled
identifiers anywhere (the Full-Replace wipe statements are spelled-out
constants, matching the web golden).

## Layout

```
app/src/main/java/app/sadaqa/android/
  data/SadaqaDb.kt          bundled SQLite hosting + .sadaqa export/import (bound args)
  engine/PrayerEngine.kt    adhan 1.2.1 wrapper — bit-for-bit port of prayer.js
  engine/Calendars.kt       HijriEngine (java.time HijrahDate umalqura) + QiblaEngine
  engine/SmartCard.kt       §9 resolver — port of engines/smart-card.js
  backup/Json.kt            canonical JSONValue (sorted keys) + serializer
  backup/BackupCodec.kt     .sadaqa v1 validator + Smart Merge — engine ports
  backup/UUID7.kt           FNV-1a×4 synth ids — byte-identical with web
  platform/Platform.kt      haptics (tokens patterns), adhan exact-alarm + FGS, AudioStore
  widget/PrayerWidgets.kt   Glance: prayer countdown + daily dhikr (offline recompute)
  ui/                       Compose screens (Today/Mushaf/Athkar/Tasbih/Tools/Backup/Audio/Search)
app/src/test/java/.../ParityTests.kt   THE verification gates (pure JVM)
```

## Build

Requirements: JDK 17 + Android SDK (API 35) — or just JDK 17 to run the JVM
parity tests (`./gradlew test` needs no SDK for the unit-test source set…
AGP still requires an SDK for the project to configure, so install one).

```bash
# from the repo root — regenerates db/fonts/tokens/fixtures into this tree
npm run native:sync          # offline, deterministic; node ≥22

cd apps/android-native
./gradlew test               # pure-JVM parity suite (no device needed)
./gradlew assembleDebug      # APK (needs Android SDK)
```

## Verification (CI parity gates)

- **Prayer times: 0 ms drift** — 6 cities × DST months × 2 variants × every
  day × 6 prayers + previousIsha + sunnah windows + next() probes (≫4,000
  instants pinned) — `PrayerParityTest`.
- **§9 Smart Card** — 42 instants, all 6 kinds, precedence rules —
  `SmartCardParityTest`.
- **`.sadaqa` cross-OS** — a REAL web-exported file parses + validates,
  sha-256 integrity matches, Merge adds all entities, local-newer conflicts,
  Full Replace wipes + restores verbatim, Android re-export re-validates —
  `BackupCodecParityTest` + `DbRoundTripTest` (pure JVM on the bundled driver).
- **UUIDv7 synth ids byte-identical** with the web — `Uuid7ParityTest`.
- **Hijri** weekly round-trip + events + must-throw (JDK umalqura) —
  `HijriQiblaParityTest`.
- **Qibla** bearings/distances (9 points).
- **Schema contract** — bundled db vs `tableinfo.json` (31 tables) —
  `SchemaContractTest`.

## Platform notes

- Glass pill nav is an approximation (Android has no system glass material) —
  documented platform limit (ARCHITECTURE §3); control layer only.
- Adhan: `AlarmManager.setExactAndAllowWhileIdle` (inexact fallback when the
  platform withholds exact alarms) → `AdhanReceiver` → foreground service
  (`mediaPlayback` type) playing the bundled clip + MAX-priority notification.
- `.sadaqa`: SAF `CreateDocument`/`OpenDocument` export/import.
- Widgets read SharedPreferences published by the app and recompute with the
  same engine — no network, no db writes from widget processes.
- BSML basmala glyphs render LTR-isolated (visual-order calligraphy, Phase 3).

## What is verified where

| Gate | Local (Windows dev box) | CI (ubuntu-latest) |
| --- | --- | --- |
| Fixture generation from web engines | ✅ `npm run parity:gen` | ✅ (freshness diff) |
| Asset sync (db/fonts/ttf conversion) | ✅ `npm run native:sync` | ✅ before gradle |
| Kotlin compile + JVM parity tests | — (no JDK on dev box) | ✅ `gradlew test` |
| APK assembly (needs SDK) | — | ✅ `gradlew assembleDebug` |
