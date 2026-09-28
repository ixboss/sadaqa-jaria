<div align="center">

# إسلامي · Islami

**A free Islamic web app for Quran reading, Khatmah tracking, and daily adhkar — created as Sadaqah Jariyah.**

[Open the app](https://ixboss.github.io/sadaqa-jaria/) · [Report an issue](https://github.com/ixboss/sadaqa-jaria/issues)

</div>

---

## Sadaqah Jariyah

This project is offered as **صدقة جارية — sadaqah jariyah** (ongoing charity). The Prophet ﷺ said:

> «إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَتَةٍ: صَدَقَةٍ جَارِيَةٍ، وَعِلْمٍ يُنْتَفَعُ بِهِ، وَوَلَدٍ صَالِحٍ يَدْعُو لَهُ»
>
> *"When a person dies, their deeds come to an end except three: an ongoing charity, beneficial knowledge, and a righteous child who prays for them."*

This app is the author's attempt at the first of those three: a small, useful tool, free for everyone, whose benefit does not stop when development does. No reward is claimed or guaranteed — the intention is simply that it be of benefit.

## About

**Islami** is a Progressive Web App that runs entirely in the browser: no server, no account, no tracking, no cost. It is Arabic-first and fully right-to-left.

It exists because most Quran apps are heavy, ad-supported, or require an account — and because reading and remembrance should not depend on a reliable connection. Everything the app knows about you (bookmarks, khatmah progress, streaks) stays on your device.

## Features

### Quran

- All **114 surahs** in Uthmani script, searchable by name or number
- **604-page Mushaf mode** with a natural page-turn animation that follows your finger — folded from the right spine, like a printed Arabic book
- **Two-page spread** in landscape orientation
- **Five reciters** (Alafasy, Abdul Basit Murattal, Husary, Minshawi, Maher Al-Muaiqly) with per-ayah streaming audio
- **Bookmarks** for surahs and ayahs, plus a resume button that returns you to where you stopped
- Mushaf text size and interface size adjust **independently**

### Worship

- **Khatmah tracker** — plan a full Quran completion with a daily portion; if you miss days, the plan continues from where you stopped
- **Adhkar** — morning and evening adhkar (from Hisn al-Muslim) plus occasion-based collections
- **Digital tasbih** with target presets (33 / 99 / 100 / 1000) and haptic feedback
- **Reading streaks** and daily stats

### App

- **Installable PWA** with home-screen shortcuts for Khatmah, Adhkar, Tasbih, and Bookmarks
- **Works offline** — the app shell and the 114-surah index are precached; adhkar, tasbih, khatmah, and bookmarks all work with no connection
- **Optional full-Quran download** — one tap in Settings stores the complete Uthmani text (6,236 ayahs / 604 pages) in IndexedDB, integrity-gated and cancellable, so the whole Mushaf reads offline
- **Deep links** — shareable URLs to any surah, ayah, or page (`#/surah/2`, `#/surah/2/255`, `#/page/120`)
- **Dark and light app themes**, plus paper themes for the Mushaf page
- **Backup & restore** — export everything to a JSON file from Settings and import it on another device
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
| Animation | CSS transitions + Web Animations API + `requestAnimationFrame` |
| Storage | `localStorage` (user state) + `IndexedDB` (offline Quran corpus) |
| Offline | Service Worker + Cache API (precache + cache-first / network-first) |
| Quran text | [AlQuran Cloud API](https://alquran.cloud) — free, no key required |
| Audio | [Islamic Network CDN](https://islamic.network) — per-ayah MP3, streamed |
| Fonts | Amiri and Amiri Quran, via Google Fonts |

There is **no build step, no package manager, and no runtime dependency**. The two external services are free and keyless, and the app degrades gracefully without them: the surah index is bundled locally in `surah-meta.js`, so only ayah *text* and *audio* need the network.

## Running locally

Requirements: any modern browser and any static file server. There is nothing to install and nothing to build.

```bash
git clone https://github.com/ixboss/sadaqa-jaria.git
cd sadaqa-jaria
python -m http.server 8080
# then open http://localhost:8080
```

> Serve over HTTP(S). Opening `index.html` as a `file://` URL loads the interface, but browsers block Service Worker registration there — offline mode and installability will be unavailable.

For contributors: `node --check <file>.js` validates syntax; `tests/` contains standalone CDP-based end-to-end probes (see any file's header for usage; they drive Edge over the DevTools protocol); `.verify-nav.py` and `.verify-icons.py` validate navigation geometry and PWA icon wiring.

### Project structure

```
sadaqa-jaria/
├── index.html            # App shell — markup, styles, core logic
├── features.js           # Settings, Tasbih, Khatmah, Audio, Adhkar modules
├── mushaf.js             # Mushaf engine — 604-page index + offline corpus (IndexedDB)
├── pageflip.js           # Page-turn gesture and animation engine
├── app.js                # Utilities — storage manager, shortcuts (partially legacy)
├── config.js             # Legacy configuration (still loaded by index.html)
├── surah-meta.js         # Bundled 114-surah index for offline browsing
├── sw.js                 # Service worker — precaching + runtime caching strategies
├── manifest.json         # PWA manifest — icons, shortcuts, theme
├── .htaccess             # Apache caching and security headers
├── .nojekyll             # Serves dot-directories (.well-known/) on GitHub Pages
├── robots.txt · sitemap.xml
├── .well-known/          # security.txt (RFC 9116)
├── icons/                # PNG app icons (generated by .icon-build.py)
├── assets/               # Social preview image
├── docs/                 # Design notes (adhkar, Quran layout, e2e adhkar)
├── tests/                # CDP end-to-end probes and unit tests
├── VERIFICATION.md       # Evidence-backed record of fixes and open items
├── 01-bugs.md · 02-uiux.md · 03-features.md · 04-architecture.md   # Historical review snapshots
├── IMPROVEMENTS.md
├── CONTRIBUTING.md · CODE_OF_CONDUCT.md
└── LICENSE               # MIT
```

> The four numbered review files are dated snapshots of earlier audits — their line references predate later fixes. See `VERIFICATION.md` for the current, evidence-backed status.

## Contributing

Contributions are welcome and treated as a form of ongoing charity. Bug reports and suggestions are equally valuable — you do not need to write code to help. Before opening a pull request, please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Two project rules to know up front: **no new dependencies** and **no build step**. The reasoning and conventions are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Released under the [MIT License](LICENSE).

The MIT license covers the **code**. The Quran text and recitations come from their respective sources (AlQuran Cloud, Islamic Network) and carry their own terms — please respect them, and never alter the sacred text.

---

<div align="center">

### Dedication

This project was built with one intention: to be of benefit, and to keep being of benefit.

**If it helped you, please remember its maker and everyone who contributed in your du'a.**

**صدقة جارية · Sadaqah Jariyah**

<sub>لا تنسونا من صالح دعائكم · Please remember us in your du'a</sub>

</div>
