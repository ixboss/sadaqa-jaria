<div align="center">

<img src="icons/icon-192.png" width="96" height="96" alt="إسلامي · Islami (Sadaqa Jaria)" />

# إسلامي · Islami (Sadaqa Jaria)

**The free, open-source, 100% offline-first Islamic companion — Quran Mushaf, Tafsir, Prayer Times, Adhkar & Khatmah across Web, Desktop, iOS & Android.**

<br />

<img src="assets/preview-hero.png" alt="Sadaqa Jaria v2 — Dual-page Uthmani Mushaf in Liquid Glass dark mode" width="900" />

<br /><br />

<!-- launch-readiness:start:badges -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI & Release](https://github.com/ixboss/sadaqa-jaria/actions/workflows/ci.yml/badge.svg)](https://github.com/ixboss/sadaqa-jaria/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/ixboss/sadaqa-jaria)](https://github.com/ixboss/sadaqa-jaria/releases/latest)
<!-- launch-readiness:end:badges -->

<br />

[**🌐 Open Web App**](https://ixboss.github.io/sadaqa-jaria/) · [**📦 Download v2 Releases**](https://github.com/ixboss/sadaqa-jaria/releases/latest) · [**🐛 Report an Issue**](https://github.com/ixboss/sadaqa-jaria/issues)

</div>

---

## Sadaqah Jariyah

This project is offered as **صدقة جارية — sadaqah jariyah** (ongoing charity). The Prophet ﷺ said:

> «إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ: صَدَقَةٍ جَارِيَةٍ، وَعِلْمٍ يُنْتَفَعُ بِهِ، وَوَلَدٍ صَالِحٍ يَدْعُو لَهُ»
>
> *"When a person dies, their deeds come to an end except three: an ongoing charity, beneficial knowledge, and a righteous child who prays for them."*

This app is offered freely for everyone with one intention: to be of ongoing benefit. No reward is claimed or guaranteed — only that it remains calm, accurate, private, and useful.

---

## Highlights

- **100% Offline & Private:** Zero accounts, zero ads, zero tracking — Quran, Tafsir, Adhkar & Prayer Times run locally on your device.
- **604-Page Uthmani Mushaf:** Authentic RTL page-turn reader with zoom, bookmarks, resume state, and offline **Tafsir Al-Muyassar** on ayah tap.
- **Accurate Prayer Times & Sunnah Windows:** Offline mathematical parity across JS, Swift, and Kotlin engines.
- **Worship Suite:** Khatmah planner, full Hisn al-Muslim Adhkar & Ruqyah with search, smart Tasbih, and shareable gold/emerald ayah cards.
- **Cross-Platform v2 Engine:** Shared core powering Web PWA, Electron (macOS / Windows / Linux), native SwiftUI (iOS), and native Kotlin/Compose (Android).

---

## Download & Install

| Platform | How to Install |
|---|---|
| **Web App (PWA)** | Open [ixboss.github.io/sadaqa-jaria](https://ixboss.github.io/sadaqa-jaria/) and install via your browser (*"Add to Home Screen"* / *"Install App"*). |
| **Android** | Download the `.apk` from [GitHub Releases](https://github.com/ixboss/sadaqa-jaria/releases/latest) and install directly. |
| **iOS** | Download the unsigned `.ipa` from [GitHub Releases](https://github.com/ixboss/sadaqa-jaria/releases/latest) and sideload via **AltStore**, **SideStore**, or **Sideloadly**. |
| **Windows / macOS / Linux** | Download the Electron installer for your OS (`.exe`, `.dmg`/`.zip`, `.AppImage`/`.deb`) from [GitHub Releases](https://github.com/ixboss/sadaqa-jaria/releases/latest). |

> **macOS note (unsigned builds):** If macOS Gatekeeper blocks the app on first launch, run:
> ```bash
> xattr -dr com.apple.quarantine "/Applications/Sadaqa Jaria.app"
> ```

---

## v2 Architecture

| Layer | Implementation |
|---|---|
| **Shared Core & Parity** | [`packages/core-data`](packages/core-data) — pure deterministic engines (prayer times, Hijri, Qibla, FTS5 search, `.sadaqa` backup codec) verified across all targets by byte-level parity fixtures |
| **Local Storage** | 53-table **SQLite** database (`SQLite-WASM + OPFS` on Web, `better-sqlite3` on Electron, `GRDB` on iOS, `androidx.sqlite` bundled on Android) |
| **Design System** | [`packages/design-tokens`](packages/design-tokens) — shared Liquid Glass & RTL tokens |
| **Web & PWA** | [`apps/web-desktop`](apps/web-desktop) & root PWA (`index.html`, `sw.js`) |
| **Desktop Shell** | [`apps/electron`](apps/electron) — zero-server Electron wrapper with system tray countdown & native Adhan notifications |
| **iOS & Android** | [`apps/ios-native`](apps/ios-native) (SwiftUI + WidgetKit) & [`apps/android-native`](apps/android-native) (Jetpack Compose + Glance) |

For local setup, asset generation, and build-from-source commands, see [`CONTRIBUTING.md`](CONTRIBUTING.md#development-commands-v2-workspace).

---

## License

Released under the [MIT License](LICENSE).

The MIT license covers the **code**. The Quran text, tafsir, and recitations come from their respective sources (AlQuran Cloud, Quran.com / QUL, EveryAyah) and carry their own terms — please respect them, and never alter the sacred text.

---

<div align="center">

### Dedication

This project was built with one intention: to be of benefit, and to keep being of benefit.

**If it helped you, please remember its maker and everyone who contributed in your du'a.**

**صدقة جارية · Sadaqah Jariyah**

<sub>لا تنسونا من صالح دعائكم · Please remember us in your du'a</sub>

</div>
