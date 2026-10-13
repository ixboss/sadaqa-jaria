<div align="center">

# إسلامي · Islami

**A free Islamic web app for Quran reading, Tafsir, Khatmah tracking, and daily Adhkar — created as Sadaqah Jariyah.**

[Open the app](https://ixboss.github.io/sadaqa-jaria/) · [Report an issue](https://github.com/ixboss/sadaqa-jaria/issues)

</div>

---

## Sadaqah Jariyah

This project is offered as **صدقة جارية — sadaqah jariyah** (ongoing charity). The Prophet ﷺ said:

> «إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ: صَدَقَةٍ جَارِيَةٍ، وَعِلْمٍ يُنْتَفَعُ بِهِ، وَوَلَدٍ صَالِحٍ يَدْعُو لَهُ»
>
> *"When a person dies, their deeds come to an end except three: an ongoing charity, beneficial knowledge, and a righteous child who prays for them."*

This app is the author's attempt at the first of those three: a small, useful tool, free for everyone, whose benefit does not stop when development does. No reward is claimed or guaranteed — the intention is simply that it be of benefit.

## About

**Islami** is a Progressive Web App that runs entirely in the browser: no server, no account, no tracking, no cost. It is Arabic-first and fully right-to-left.

It exists because most Quran apps are heavy, ad-supported, or require an account — and because reading and remembrance should not depend on a reliable connection. Everything the app knows about you (bookmarks, khatmah progress, streaks, completed khatmahs) stays on your device.

## Features

### Quran & Tafsir

- All **114 surahs** in Uthmani script, searchable by name, number, or full verse text
- **604-page Mushaf mode** with a natural 3D page-turn animation that follows your finger — folded from the right spine, like a printed Arabic book (or continuous vertical scroll mode)
- **Two-page spread** in landscape orientation
- **Inline Tafsir Al-Muyassar (التفسير الميسّر)** — tap any ayah to view its explanation, cached locally for offline reading
- **Five reciters** (Alafasy, Abdul Basit Murattal, Husary, Minshawi, Maher Al-Muaiqly) with per-ayah streaming audio, **ayah repeat (1× / 3× / 5× / ∞) for memorization**, and **playback speed control (0.75× / 1× / 1.25×)**
- **Bookmarks** for surahs and ayahs, plus a resume button that returns you to where you stopped
- Mushaf text size and interface size adjust **independently** across 5 unified steps (`80%` to `200%`)

### Worship & Remembrance

- **Khatmah tracker** — plan a full Quran completion with a daily portion (by pages or days), set a **personal intention / dedication (نيّة الختمة)**, read **Du'a Khatm Al-Quran**, and track your **completed Khatmahs history**
- **Adhkar & Ruqyah** — morning and evening adhkar (with verbatim Hisn al-Muslim hadith sources), sleep/waking/prayer/travel adhkar, **Ruqyah Shar'iyyah (الرقية الشرعية)**, **distress supplications (أذكار الكرب والهم)**, and instant full-text search across all adhkar and duas
- **Smart digital tasbih** with authentic dhikr presets + virtues, target presets (33 / 99 / 100 / 1000), and haptic feedback
- **Share as Image Card (بطاقة مصورة)** — render any Quranic ayah, tafsir, dhikr, or dua into a high-resolution emerald & gold PNG card via HTML5 Canvas to share or download
- **Reading streaks** and daily stats

### App

- **Installable PWA** with home-screen shortcuts for Khatmah, Adhkar, Tasbih, and Bookmarks
- **Works offline** — the app shell, Google Fonts, and the 114-surah index are cached; adhkar, tasbih, khatmah, and bookmarks all work with no connection
- **Optional full-Quran download** — one tap in Settings (`⚙️`) stores the complete Uthmani text (6,236 ayahs / 604 pages) in IndexedDB, integrity-gated and cancellable, so the whole Mushaf reads offline
- **Deep links** — shareable URLs to any surah, ayah, or page (`#/surah/2`, `#/surah/2/255`, `#/page/120`)
- **Dark and light app themes**, plus three paper themes for the Mushaf page (Heritage, Floral, Night)
- **Backup & restore** — export all bookmarks, progress, completed khatmahs, and reader settings to a JSON file from Settings and import it on another device
- `prefers-reduced-motion` is honoured in every animation path

## Philosophy

- **Free, forever.** No ads, no premium tier, no upsell.
- **Private.** No accounts, no analytics, no tracking. Your data never leaves your device except through a backup you export yourself.
- **Calm.** A tool for worship and reading — not something designed to hold your attention.
- **Featherweight.** No framework, no bundler, no `node_modules`. The repository is exactly the files that run.

## Technology

| Layer | Choice |
|---|---|
| Markup & styling | Semantic HTML5 + CSS custom properties, RTL-native |
| Logic | Vanilla JavaScript (ES6+), classic scripts |
| Animation | CSS transitions + Spring Physics + `requestAnimationFrame` |
| Storage | `localStorage` (user state) + `IndexedDB` (offline Quran corpus) |
| Offline | Service Worker + Cache API (precache + font caching + API cache-first) |
| Quran & Tafsir | [AlQuran Cloud API](https://alquran.cloud) — free, no key required |
| Audio | [Islamic Network CDN](https://islamic.network) — per-ayah MP3, streamed |
| Fonts | Amiri and Amiri Quran, via Google Fonts (cached offline by SW) |

There is **no build step, no package manager, and no runtime dependency**.

## Running locally

Requirements: any modern browser and any static file server. There is nothing to install and nothing to build.

```bash
git clone https://github.com/ixboss/sadaqa-jaria.git
cd sadaqa-jaria
python -m http.server 8080
# then open http://localhost:8080
```

> Serve over HTTP(S). Opening `index.html` as a `file://` URL loads the interface, but browsers block Service Worker registration there — offline mode and installability will be unavailable.

### Project structure

```
sadaqa-jaria/
├── index.html            # App shell — markup, styles, core logic
├── features.js           # Settings, Stats, Audio, Tafsir, ShareCard, DeepLinks
├── mushaf.js             # Mushaf engine — 604-page index + offline corpus (IndexedDB)
├── pageflip.js           # Page-turn gesture and 3D animation engine
├── backup.js             # Validated local JSON backup & restore
├── app.js                # Storage, Bookmark, ReadingProgress, Accessibility, Animation managers
├── config.js             # Application configuration & feature flags
├── surah-meta.js         # Bundled 114-surah index for offline browsing
├── sw.js                 # Service worker — precaching + offline font & API caching
├── manifest.json         # PWA manifest — icons, shortcuts, theme
├── .htaccess             # Apache caching and security headers
├── .nojekyll             # Serves dot-directories (.well-known/) on GitHub Pages
├── robots.txt · sitemap.xml
├── .well-known/          # security.txt (RFC 9116)
├── icons/                # PNG app icons
├── assets/               # Social preview image
├── docs/                 # Design notes + archived historical reviews (docs/archive/)
├── tests/                # CDP end-to-end probes and unit tests
├── VERIFICATION.md       # Evidence-backed record of fixes and verification
├── CONTRIBUTING.md · CODE_OF_CONDUCT.md
└── LICENSE               # MIT
```

## Contributing

Contributions are welcome and treated as a form of ongoing charity. Bug reports and suggestions are equally valuable — you do not need to write code to help. Before opening a pull request, please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Two project rules to know up front: **no new dependencies** and **no build step**.

## License

Released under the [MIT License](LICENSE).

The MIT license covers the **code**. The Quran text, tafsir, and recitations come from their respective sources (AlQuran Cloud, Islamic Network) and carry their own terms — please respect them, and never alter the sacred text.

---

<div align="center">

### Dedication

This project was built with one intention: to be of benefit, and to keep being of benefit.

**If it helped you, please remember its maker and everyone who contributed in your du'a.**

**صدقة جارية · Sadaqah Jariyah**

<sub>لا تنسونا من صالح دعائكم · Please remember us in your du'a</sub>

</div>
