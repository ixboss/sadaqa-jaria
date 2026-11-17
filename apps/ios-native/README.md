# Sadaqa Jaria — iOS Native (Phase 5)

SwiftUI port of the verified Golden Reference (`apps/web-desktop/`). Same
`sadaqa.db` (byte-identical copy), same QPC1 fonts, same tokens, same `.sadaqa`
format — one contract, four targets.

## Layout

```
project.yml            XcodeGen definition (app + WidgetKit extension + tests)
Core/                  parity-critical logic (ports of the golden engines)
  PrayerEngine.swift     adhan-swift wrapper — bit-for-bit port of prayer.js
  HijriEngine.swift      islamicUmmAlQura calendar — port of hijri.js
  QiblaEngine.swift      great-circle math — port of qibla.js
  SmartCard.swift        §9 resolver — port of engines/smart-card.js
  BackupCodec.swift      .sadaqa v1 validator + Smart Merge — engine ports
  UUIDv7.swift           FNV-1a×4 synth ids — byte-identical with web
  JSONValue.swift        untyped JSON tree + canonical serializer (sorted keys)
  Database.swift         GRDB hosting + export/import pipeline (bound args)
App/                   SwiftUI screens (Today/Mushaf/Athkar/Tasbih/Tools/Backup/Audio)
Widgets/               WidgetKit: prayer countdown (home+lock) + daily dhikr
Tests/ParityTests.swift  THE verification gates (replays web-generated fixtures)
Resources/             GENERATED — sadaqa.db, fonts (ttf), tokens, audio, catalog
Fixtures/              GENERATED — web-generated parity fixture corpus
```

## Build

Requirements: macOS with Xcode 16+ (iOS 18 SDK). XcodeGen + SwiftPM resolve
dependencies at first build (GRDB.swift 7.9, Adhan-Swift 1.3.1).

```bash
# from the repo root — regenerates db/fonts/tokens/fixtures into this tree
npm run native:sync          # offline, deterministic; node ≥22

brew install xcodegen
cd apps/ios-native && xcodegen generate
open SadaqaJaria.xcodeproj   # run the SadaqaJaria scheme
```

## Verification (CI parity gates)

```bash
xcodebuild test -scheme SadaqaJaria -destination 'platform=iOS Simulator,name=iPhone 16'
```

The suite asserts, against the fixture corpus generated from the **web engines**:

- **Prayer times: 0 ms drift** — 6 cities × DST months × 2 method/madhab/HLR
  variants × every day × 6 prayers + previousIsha + sunnah windows + next() probes
  (≫4,000 instants pinned).
- **§9 Smart Card** — 42 instants through the shared resolver (all 6 kinds,
  precedence rules included).
- **`.sadaqa` cross-OS** — a REAL web-exported file parses + validates on iOS,
  its sha-256 integrity digest matches, Merge adds all entities, local-newer
  conflicts resolve, Full Replace wipes + restores verbatim, iOS re-export
  re-validates (round-trip closure).
- **UUIDv7 synth ids byte-identical** with the web (Smart Merge dedupe contract).
- **Hijri** weekly round-trip vectors + events + must-throw cases (ICU umalqura).
- **Qibla** bearings/distances (9 points).
- **Schema contract** — the bundled db matches `tableinfo.json` (31 tables).

## Platform notes

- Liquid Glass: iOS 26 `tabBarMinimizeBehavior` + `searchToolbarBehavior(.minimize)`
  behind `#available` guards; glass stays on the control layer only (tokens.glassPolicy).
- Basmala (BSML) glyphs are visual-order ASCII-mapped → rendered with
  `layoutDirection: .leftToRight` isolation (Phase 3 finding, carried over).
- Adhan scheduling: `UNCalendarNotificationTrigger` on the next prayer instant.
- `.sadaqa`: ShareSheet export (iCloud Drive = the iCloud hook), fileImporter import.
- Widgets read `widget-state.json` from the shared App Group and recompute with
  the same engine — no db access from extension processes.

## What is verified where

| Gate | Local (Windows dev box) | CI (macos-latest) |
| --- | --- | --- |
| Fixture generation from web engines | ✅ `npm run parity:gen` | ✅ (freshness diff) |
| Asset sync (db/fonts/ttf conversion) | ✅ `npm run native:sync` | ✅ before xcodegen |
| Swift compile + parity tests | — (no Swift toolchain) | ✅ xcodebuild test |
