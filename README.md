<div align="center">

# 🕌 إسلامي · Islami

### **A Quran companion that keeps working when the world goes quiet.**

**صدقة جارية · Sadaqah Jariyah** — built as an ongoing charity, for the sake of Allah ﷻ

<br>

[![PWA](https://img.shields.io/badge/PWA-installable-3ecf9e?style=for-the-badge&logo=pwa&logoColor=white)](#-install-on-your-phone)
[![Offline First](https://img.shields.io/badge/offline-first-46c8d6?style=for-the-badge&logo=cloudflare&logoColor=white)](#-offline-behaviour)
[![No Build Step](https://img.shields.io/badge/build_step-none-8b5cf6?style=for-the-badge&logo=javascript&logoColor=white)](#-tech-stack)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-10b981?style=for-the-badge&logo=npm&logoColor=white)](#-dependencies)
[![License: MIT](https://img.shields.io/badge/license-MIT-64748b?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Language: Arabic](https://img.shields.io/badge/langue-العربية-d4a437?style=for-the-badge)](#-about-the-project)

<br>

**قرآن · أذكار · أدعية · سبحة · ختمة**

*Quran · Remembrances · Supplications · Digital Tasbih · Khatmah Tracker*

</div>

---

## 📖 About the Project

**إسلامي (Islami)** is a complete Islamic web application that runs entirely in the browser — no server, no account, no tracking, no cost. It was built with a single intention: to make a small, useful act of worship available to anyone with a phone, even without a reliable internet connection.

> ### ﴿ مَنْ ذَا الَّذِي يُقْرِضُ اللَّهَ قَرْضًا حَسَنًا فَيُضَاعِفَهُ لَهُ أَضْعَافًا كَثِيرَةً ﴾
> *"Who is it that would loan Allah a goodly loan so He may multiply it for him many times over?"*
> — Surah Al-Baqarah 2:245

The Prophet ﷺ said: **«إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ: صَدَقَةٍ جَارِيَةٍ، وَعِلْمٍ يُنْتَفَعُ بِهِ، وَوَلَدٍ صَالِحٍ يَدْعُو لَهُ»**

> *"When a person dies, their deeds come to an end except three: an ongoing charity, beneficial knowledge, and a righteous child who prays for them."*

This project is an attempt at the **first** of those three. The source is open so the benefit can outlive any one person, and so that others can carry it forward.

### Why it exists

Most Quran apps are either heavy, ad-supported, or require an account. This one is:

| | |
|---|---|
| 🕋 **Free, forever** | No ads, no premium tier, no upsell — ever |
| 🔒 **Private by design** | All your data (bookmarks, streaks, progress) stays **on your device** |
| 📴 **Genuinely offline** | The full Quran index and all adhkar work with no connection |
| 🪶 **Featherweight** | No framework, no bundler, no `node_modules` — plain files |
| ♿ **Accessible** | Full `prefers-reduced-motion` support, semantic markup, RTL-native |
| 🤲 **Built for worship** | Designed to be calm and unobtrusive, not to hold your attention |

---

## ✨ Key Features

<table>
<tr><td width="50%" valign="top">

### 📖 The Noble Quran
- All **114 surahs** with Uthmani script
- **604-page Mushaf mode** with continuous page reading
- Prefetching of the next page for uninterrupted flow
- **Five reciters**, streaming or downloadable audio
- Adjustable mushaf typography, independent of UI size
- Bismillah handling that respects how each surah begins

</td><td width="50%" valign="top">

### 📿 Worship Tools
- **Digital Tasbih** with haptic feedback and target presets (33 / 99 / 100 / 1000)
- **Khatmah tracker** — plan a full Quran completion, with missed-day recovery
- **Adhkar & supplications** — morning, evening, and occasion-based
- **Bookmarks** for surahs and individual ayahs
- **Reading stats** and daily streak tracking

</td></tr>
<tr><td width="50%" valign="top">

### 🌙 Experience
- **Dark & light themes** with an animated crossfade
- **Liquid-glass navigation** driven by a real spring physics engine
- **Deep links** — jump straight to any screen from a URL
- **Home-screen shortcuts** for Khatmah, Adhkar, Tasbih and Bookmarks
- Reminders for your daily wird
- Fully **RTL-native** — Arabic is the default, not an afterthought

</td><td width="50%" valign="top">

### ⚙️ Under the Hood
- **Installable PWA** — runs standalone, no browser chrome
- **Service Worker** with cache-first / network-first strategies
- **Offline surah index** bundled locally (no network needed to browse)
- **Local backup & restore** — export all your data to a single JSON file from **Settings**, and re-import it on a new device. Imported files are schema- and type-validated and never evaluated as code
- **Optional full-Quran download** — one tap in **Settings** stores the complete Uthmani text (6236 ayahs / 604 pages) in IndexedDB, so the whole Mushaf and the Khatmah reader work with no connection. Integrity-gated, cancellable, deletable
- **`AbortController` timeouts** so a slow network never hangs the UI
- **`prefers-reduced-motion` honoured in every animation path**
- **Zero dependencies** — nothing to audit, nothing to break

</td></tr>
</table>

---

## 📱 Install on Your Phone

This is a **Progressive Web App**. There is no App Store or Play Store listing — you install it straight from the browser, and it then behaves like a native app with its own icon.

### 🤖 Android (Chrome / Edge / Brave)

1. Open the app's URL in **Chrome**
2. Tap the **⋮** menu in the top-right corner
3. Tap **"Add to Home screen"** or **"Install app"**
4. Confirm by tapping **Install**

> 💡 On many Android builds Chrome shows an **"Install app"** banner or a small install icon in the address bar — you can tap that directly.

### 🍎 iPhone & iPad (Safari)

> ⚠️ **You must use Safari.** Chrome and Firefox on iOS cannot install PWAs — Apple restricts this to Safari only.

1. Open the app's URL in **Safari**
2. Tap the **Share** button — the square with an arrow pointing up — in the bottom toolbar
3. Scroll down the share sheet and tap **"Add to Home Screen"**
4. Give it a name and tap **Add**

> 💡 The icon now appears on your home screen and opens full-screen, exactly like a native app.

### 💻 Desktop (Chrome / Edge / Brave)

1. Open the app's URL
2. Click the **install icon** (⊕ or a monitor symbol) in the address bar
3. Click **Install**

You can also use **⋮ → Cast, save, and share → Install page as app**.

### ✅ Verifying the install worked

After installing you should see:

- An **app icon** on your home screen or desktop — not a bookmark
- **No address bar** when you open it
- The app **still opens with airplane mode on**

If instead you got a plain bookmark, the install didn't complete. Re-check that you're using Safari on iOS, and that the site is served over **HTTPS** — see the HTTPS note in [Troubleshooting](#-troubleshooting).

---

## 🚀 Getting Started (Developers)

### Requirements

**None.** That is not a simplification — it is the actual architecture.

There is no build step, no package manager, no compiler, no transpiler. The files in this repository are exactly the files that run in the browser.

To develop locally you need only:

| Tool | Version | Needed for |
|---|---|---|
| A **web browser** | Any modern one | Running the app |
| A **local static server** | Any | Correct Service Worker behaviour |
| **Python** *(optional)* | 3.7+ | The one-line server below |

### Run it locally

```bash
# 1. Clone
git clone https://github.com/ixboss/sadaqa-jaria.git
cd sadaqa-jaria

# 2. Serve the folder over HTTP (any one of these works)
python -m http.server 8080          # Python 3
npx serve .                         # Node
php -S localhost:8080               # PHP
```

Then open **http://localhost:8080**.

> ⚠️ **Do not just double-click `index.html`.**
> Opening the file with a `file://` URL will load the interface, but the **Service Worker will not register** — browsers block it on `file://` for security. Offline mode, caching, and installability will all be silently unavailable. Always use a local HTTP server.

### Deploying

Because there is no build step, deployment is "copy the files":

1. Upload everything to any **static host** — GitHub Pages, Netlify, Cloudflare Pages, Vercel, or plain Apache/Nginx
2. Serve over **HTTPS** — required for Service Workers and PWA install
3. If you're on **Apache**, a `.htaccess` is included for caching and security headers

> 📌 **Before going live:** several items must be updated for your own deployment — the canonical URL, `sitemap.xml`, `robots.txt`, and `security.txt` still reference placeholder values. See [`01-bugs.md`](01-bugs.md) for the full list.

---

## 📦 Dependencies

### Runtime dependencies: **zero**

No `package.json`, no `node_modules`, no CDN JavaScript. Everything is hand-written vanilla JS.

### External services

The app talks to two third-party endpoints at runtime. Both are free and require **no API key**:

| Service | Used for | Endpoint |
|---|---|---|
| **AlQuran Cloud API** | Surah lists and Uthmani text | `api.alquran.cloud` |
| **Islamic Network CDN** | Reciter audio (MP3) | `cdn.islamic.network` |

The app degrades gracefully without them: the **114-surah index is bundled locally** (`surah-meta.js`), so browsing works fully offline. Only ayah *text* and *audio* need the network.

> ⚠️ **Both must be allowed in your Content-Security-Policy.** The included `.htaccess` currently omits `cdn.islamic.network` from `connect-src`, which **breaks audio playback**. Details in [`01-bugs.md`](01-bugs.md) → B-17.

### Fonts

Loaded from **Google Fonts**: `Amiri` (UI) and `Amiri Quran` (Uthmani text).

> ⚠️ Fonts are **not** cached for offline use — the first load requires a connection. Tracked as B-15.

---

## 🧭 Usage

### Reading the Quran

| Action | How |
|---|---|
| Browse surahs | Open the **القرآن** tab |
| Open a surah | Tap any row in the list |
| Move to the next surah | Swipe left-to-right at the end of a surah |
| Bookmark an ayah | Tap the bookmark icon beside it |
| Resume where you left off | Tap the floating **متابعة القراءة** button |
| Change reciter | **Settings → القارئ** |
| Adjust text size | The **أ– / أ+** buttons in the reader |
| Change theme | The 🌙 / ☀️ button in the header |

### Using the Tasbih

1. Open the **السبحة** tab
2. Pick a target — **33**, **99**, **100** or **1000**
3. Tap the large circle to count; it vibrates on supported devices
4. Your progress is saved as you go — you can close the app and return

### Tracking a Khatmah

1. Open the **الختمة** tab and start a new plan
2. Choose a duration — the app calculates your daily portion
3. Mark each day as complete
4. Missed a day? The app offers a **recovery plan** to redistribute the backlog

### Keyboard shortcuts

| Key | Action |
|---|---|
| `←` / `→` | Previous / next ayah or page |
| `Esc` | Close the current overlay or reader |

> Note: arrow keys follow **RTL reading order** — `←` moves forward visually.

---

## 🗂 Project Structure

```
sadaqa-jaria/
│
├── index.html              # 🏠 The application — markup, styles and core JS
├── features.js             # ✨ Feature modules (Tasbih, Khatmah, Settings, Audio…)
├── surah-meta.js           # 📗 Offline 114-surah index (no network needed)
├── app.js                  # 🧰 Utility classes (partially legacy)
├── config.js               # ⚙️  Legacy configuration (currently unused)
├── sw.js                   # 🔄 Service Worker — caching & offline
├── manifest.json           # 📲 PWA manifest — icons, shortcuts, theme
├── .htaccess               # 🌐 Apache headers & caching rules
│
├── robots.txt              # 🤖 Search engine directives
├── sitemap.xml             # 🗺️  Sitemap
├── security.txt            # 🔐 Security contact (RFC 9116)
│
└── 📋 Review & documentation
    ├── README.md           # ← you are here
    ├── IMPROVEMENTS.md     # Status of planned improvements (honest markers)
    ├── 01-bugs.md          # 🐞 27 QA findings with file:line references
    ├── 02-uiux.md          # 🎨 Animation & layout review
    ├── 03-features.md      # 💡 16 proposed features, tiered
    └── 04-architecture.md  # 🏗️  Root-cause analysis & refactor plan
```

> 📖 **New contributor?** Start with [`01-bugs.md`](01-bugs.md) and [`04-architecture.md`](04-architecture.md). Between them they list every known defect with exact line references, and explain the architectural constraint that shapes most of the design decisions.

---

## 🛠 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Markup** | Semantic HTML5, RTL-native | Arabic is the default direction |
| **Styling** | CSS custom properties, no preprocessor | Design tokens change theme in one place |
| **Logic** | Vanilla ES6+ JavaScript | Zero dependencies, zero build, instant load |
| **Animation** | Web Animations API + `requestAnimationFrame` | Real spring physics, not easing curves |
| **Storage** | `localStorage` (hardened) + `IndexedDB` (Quran corpus) | Private, instant, no backend |
| **Offline** | Service Worker + Cache API | Cache-First for assets, Network-First for data |
| **Distribution** | PWA manifest | Home-screen install without an app store |

**Deliberately not used:** React, Vue, Tailwind, Webpack, Vite, Babel, npm.

Not out of dogma — but because every one of them would add a build step, a dependency tree, and a supply-chain surface to an app that needs none of it. The entire application is a handful of plain files.

---

## 📴 Offline Behaviour

Verified by `tests/e2e-offline-shell.mjs`: after the first online load the service worker precaches the entire app shell, and a cold reload with the network cut at the OS level still boots the app, renders all 114 surahs in the index, and opens Settings including backup export/import/clear.

| Works offline | Needs a connection |
|---|---|
| ✅ Full 114-surah index (bundled in `surah-meta.js`) | ❌ Audio recitation (streamed per-ayah MP3) |
| ✅ All adhkar & supplications | ❌ The Quran font on first load |
| ✅ Tasbih | ❌ Ayah text *until* the full Quran is downloaded (see below) |
| ✅ Khatmah tracker | |
| ✅ Bookmarks, stats, settings | |
| ✅ Backup export / import / clear | |
| ✅ Previously-read surahs (cached API responses) | |
| ✅ **The full Quran text** — once downloaded from Settings → «القرآن بدون إنترنت» | |

**Optional full-Quran download.** Settings → «القرآن بدون إنترنت» downloads the complete Uthmani text (all 6236 ayahs across the 604 printed pages, ≈ 1.4 MiB) from the same source the reader already uses online (`api.alquran.cloud`, `quran-uthmani` edition) and stores it locally in IndexedDB. Once stored, the Khatmah reader renders any of the 604 pages with no network at all. The download is opt-in, user-initiated, cancellable, and shows live progress; nothing is written until the payload passes an integrity gate (114 surahs, exactly 6236 ayahs, every page 1–604 non-empty, and per-surah ayah counts matching the bundled index). Deleting it from the same card restores the online-only behaviour. Verified by `tests/e2e-mushaf.mjs` (download → offline page render → structural parity with the online path) and `tests/unit-mushaf.mjs` (integrity gate, persistence, cancellation).

**Caching strategy** (as implemented in `sw.js`):

- **App shell** — precached on install (`PRECACHE_URLS`), then *Network-First* falling back to cache, so an offline reload still serves the last-known good shell
- **Static assets** (JS/CSS/icons/fonts already fetched) — *Network-First*, falling back to cache
- **API responses** (`api.alquran.cloud`) — *Cache-First* with a 5s timeout, plus a background `cache: no-store` refresh so a cached surah is served instantly and updated for next time
- **Cache versioning** — stale caches are purged automatically on activation, while the Quran-text cache is preserved across version bumps so offline readers don't re-download what they already have

---

## 🌐 Browser Support

| Browser | Support |
|---|---|
| Chrome / Edge (Android, Desktop) | ✅ Full — including install |
| Safari (iOS 16.4+, macOS) | ✅ Full — **required** for iOS install |
| Firefox (Desktop) | ✅ Full — install support varies |
| Firefox (Android) | ⚠️ Works; install support limited |
| Samsung Internet | ✅ Full |
| Chrome / Firefox (iOS) | ⚠️ Works, but **cannot install** — use Safari |

> **iOS note:** installation is only possible from **Safari**. This is an Apple platform restriction, not a limitation of this app.

---

## 🩺 Troubleshooting

<details>
<summary><b>The install option doesn't appear</b></summary>

- Confirm you're on **HTTPS** (or `localhost`). Service Workers require a secure context.
- On iOS you **must** use Safari.
- On Android, check that the site hasn't been blocked — clear site data and reload.
- Look for the install icon in the address bar; some browsers hide it behind a menu.

</details>

<details>
<summary><b>Audio won't play</b></summary>

This is almost always the **CSP `connect-src` directive** blocking `cdn.islamic.network`. If you deployed the included `.htaccess`, you need to add that origin. Tracked as **B-17** in [`01-bugs.md`](01-bugs.md).

Also check that your chosen reciter has audio available on the CDN.

</details>

<details>
<summary><b>Offline mode doesn't work</b></summary>

- Make sure you served the app over **HTTP(S)**, not `file://`
- Visit the app **once while online** so the Service Worker can install and precache
- Open DevTools → **Application → Service Workers** to confirm it's active
- Hard-reload (`Ctrl+Shift+R`) to clear a stale worker

</details>

<details>
<summary><b>My bookmarks or streak disappeared</b></summary>

All data is stored in **`localStorage`** on your device. It will be lost if you:

- Clear browsing data / site data
- Use **private/incognito mode** — data is discarded when the tab closes
- Switch browsers or devices — there is no sync

To protect against this, open **Settings → النسخ الاحتياطي** and **export a backup file** before clearing data or moving to a new device. Keep the file somewhere safe (it contains everything: khatmah, bookmarks, streak, tasbih, preferences) and **import** it on the other device. Everything except the backup file itself stays on your device — nothing is uploaded anywhere.

> **Private mode caveat:** in Safari Private Browsing the app may fail to persist data at all. This is a known limitation — see **B-6** and **B-7** in [`01-bugs.md`](01-bugs.md).

</details>

<details>
<summary><b>Text looks cramped or too large</b></summary>

Mushaf text and interface text scale **independently**, and that's intentional — shrinking the UI keeps Quran text comfortable. Adjust both in **Settings**: the font-size control affects the UI, while mushaf text uses its own settings.

</details>

---

## 🤝 Contributing

Contributions are welcome, and treated as a form of ongoing charity.

Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening a pull request, and note that all participation is governed by our **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)**.

### Quick start

```bash
git clone https://github.com/ixboss/sadaqa-jaria.git
cd sadaqa-jaria
python -m http.server 8080     # then open http://localhost:8080
```

### Good first contributions

- 🐞 **Fix a confirmed bug** — [`01-bugs.md`](01-bugs.md) lists 27 findings with exact `file:line` references, sorted by severity. The 🔴 items are the highest impact.
- 🎨 **Build a suggested animation** — [`02-uiux.md`](02-uiux.md) has proposals A-1 through A-7, including one that's a one-line change
- 💡 **Implement a feature** — [`03-features.md`](03-features.md) has 16 ideas in three tiers, with dependency chains
- 🌍 **Improve translation** — help make the app usable for non-Arabic speakers
- ♿ **Improve accessibility** — screen reader support, contrast, focus management

### Before you submit

- [ ] Tested in at least **two browsers** (and on mobile if your change is visual)
- [ ] Verified your change works with **`prefers-reduced-motion: reduce`** enabled
- [ ] Checked both **dark and light** themes
- [ ] Confirmed **RTL layout** isn't broken
- [ ] No new dependencies introduced (see [Dependencies](#-dependencies))
- [ ] No build step introduced

---

## 🗺 Roadmap

Priorities are drawn from the review documents in this repository.

**Now — correctness**
- [ ] Fix the 7 confirmed 🔴 bugs in [`01-bugs.md`](01-bugs.md)
- [ ] Repair the `.htaccess` cluster (audio + PWA install currently broken)
- [ ] Replace placeholder domain in SEO/security files
- [ ] Provide real PWA icons (current icons are inline SVG, which iOS rejects)

**Next — architecture**
- [ ] Split `index.html` into ES modules ([`04-architecture.md`](04-architecture.md))
- [ ] Remove ~80% dead code in `app.js` and `config.js`
- [ ] Consolidate the three competing sources of application state

**Later — growth**
- [ ] Translation support (English, Urdu, Indonesian…)
- [ ] Optimised mushaf font for offline use
- [ ] Optional local export/import of your data

---

## 📄 License

Released under the **[MIT License](LICENSE)** — free to use, modify, and distribute.

> **A note on sacred content:** the *code* is MIT-licensed, but the **Quran text, translations, and recitations** belong to their respective sources and carry their own terms — please respect them and never alter the sacred text. See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

| Source | Contribution |
|---|---|
| **AlQuran Cloud** | Quran text API |
| **Islamic Network** | Recitation audio CDN |
| **Google Fonts** | `Amiri` and `Amiri Quran` typefaces |
| **Every contributor** | Whose work continues after they stop |

And above all — **الحمد لله** — all praise and thanks belong to Allah ﷻ alone. Any good in this project is from Him; any error is from ourselves.

---

## 📬 Contact

- **Bug reports & feature requests** → [GitHub Issues](https://github.com/ixboss/sadaqa-jaria/issues)
- **Questions & ideas** → [GitHub Discussions](https://github.com/ixboss/sadaqa-jaria/discussions)

---

<div align="center">

### 🤲 A Final Word

This project was built for no other purpose than to be of benefit.

**If it helped you, please make du'a for whoever built it and whoever improved it.**
That du'a is the entire payment we hope for.

<br>

**﴿ وَمَا تُقَدِّمُوا لِأَنفُسِكُم مِّنْ خَيْرٍ تَجِدُوهُ عِندَ اللَّهِ ٤٥ ﴾**

*"And whatever good you send ahead for yourselves — you will find it with Allah."*

<br>

**صدقة جارية · Sadaqah Jariyah**

*Made with ❤️ and niyyah — for Allah alone*

<sub>لا تنسونا من صالح دعائكم · Please remember us in your du'a</sub>

</div>
