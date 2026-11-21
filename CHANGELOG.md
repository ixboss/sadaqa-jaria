# Changelog

All published releases, newest first. For install instructions see the [README](README.md) (English) or [README.ar.md](README.ar.md) (العربية).

<!-- Maintainers: each release gets a "## vX.Y.Z" section below. The release
workflow extracts that section verbatim as the GitHub Release body, then
appends a "Downloads" list built from the files actually uploaded (including
the one-tap SideInstaller link for the iOS .ipa). Keep the section
human-written; don't put download links in it — the workflow writes those
from the real asset names. -->

## [Unreleased]

Nothing yet.

## v1.0.0 — 2026-11-21

First public release of **إسلامي · Islami (Sadaqa Jaria)** — a free, open-source, fully offline Islamic companion offered as sadaqah jariyah.

### Highlights

- **604-page Uthmani Mushaf** as a page-turn reader: swipe or tap to turn pages, zoom, bookmarks, and resume-where-you-left. Tap any ayah to open the offline **Tafsir Al-Muyassar**.
- **Prayer times & sunnah windows** computed fully offline and consistent across Web, Android, iOS, and desktop, with the JS, Swift, and Kotlin engines verified against each other by byte-level parity fixtures.
- **Worship tools:** the full Hisn al-Muslim adhkar & Ruqyah collection with search, a tasbih counter, a khatmah planner, and a daily wird card.
- **Private by construction:** no accounts, no ads, no analytics — everything runs locally after the first load.
- **Shareable ayah cards** in gold or emerald.

### Hardening

A full logic & security audit pass over the prayer-time, Quran-fetch, and backup engines: fixed numeric and extreme-latitude edge cases in the prayer-time engine, added an integrity digest on backup import, and hardened remote fetches with timeouts and automatic retry.

### Platforms

- **Web (PWA)** — the static site archive, also served live from GitHub Pages.
- **Android** — debug-signed `.apk` that installs directly.
- **iOS** — unsigned `.ipa` for sideloading (see the README's iOS guide for the no-PC SideInstaller route).
- **Desktop (Electron)** — Windows `.exe`, macOS Apple-Silicon `.dmg`, Linux `.AppImage` / `.deb`.

### Known limitations

- The iOS build is **unsigned** and must be signed with your own Apple ID when sideloading.
- The macOS build is **Apple Silicon only** — there is no Intel Mac build in this release.
- The Windows and macOS builds are **not code-signed** (no developer certificate), so SmartScreen / Gatekeeper warn on first launch.
