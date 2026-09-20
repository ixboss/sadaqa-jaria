# 02 — UI/UX & Animation Review

> **Part 2 of 4** in the *Islami / Sadaqah Jariyah PWA* code review.
> Sibling files: [`01-bugs.md`](01-bugs.md) · [`03-features.md`](03-features.md) · [`04-architecture.md`](04-architecture.md)

---

**Reviewer stance:** Senior Full-Stack Developer · UI/UX Expert
**Scope:** `index.html` (all CSS lives here — 645 lines in a single `<style>` block — plus the Motion engine)
**Mode:** Analysis only. **No code was written, rewritten, or modified.**

---

## ✅ First: what is genuinely excellent

This section is not filler. It matters because the recommendations below only make sense against a baseline that is already strong — and because whoever works on this next should know **which parts not to touch**.

### The nav indicator spring engine (`index.html:1377-1456`)

This is a **professional-grade implementation**, and it is the standout piece of engineering in the project:

- It is a real **Mass–Spring–Damper simulation**, not a CSS easing approximation.
  `k: 190, c: 19` (stiffness + damping) produce natural non-linear motion.
- It uses **sub-stepping** (`sub = 4, h = dt / sub`) to stay numerically stable with a high stiffness constant — this is the detail most implementations get wrong, causing spring explosions.
- It **clamps `dt`** to `1/30` to prevent blow-ups when returning to a backgrounded tab.
- It **carries velocity through drag-to-release**, so flicking the indicator respects the gesture's momentum.
- It derives **stretch/squash from speed** (`stretchX`, `squashY`), producing the "liquid glass" feel.
- It has a proper **settle condition** and triggers a specular sheen only when the indicator actually travelled (`s.traveled > 8`) — a subtle touch that avoids noisy feedback on tiny moves.

### Reduced-motion is honoured everywhere

`prefers-reduced-motion` is checked in **every** motion path — `Motion.staggerIn`, `flipAnimate`, `animateNumber`, `burst`, `confetti`, `floater`, `surgeRing`, `magnetic`, `themeCrossfade`, `headerFlash`, `bindHeaderParallax`, the nav spring, and via a CSS media query that collapses all animation durations. There is even a **live listener** for the media query changing mid-session, calling `snapNavIndicator()`.

Most production codebases fail this. This app does not.

### Other genuinely good decisions

- **`backwards` instead of `both`** on `.screen.active` (`index.html:476`), with an explicit comment explaining that `both` leaves a permanent `transform`, which creates a **containing block** and breaks `position: fixed` children. This is a subtle, real bug that was correctly diagnosed and documented.
- **`visibility` + `opacity` instead of `display`** for the resume FAB (`index.html:520`), because `display` is not animatable. Correct reasoning, correctly implemented.
- **A single reused `IntersectionObserver`** (`AnimationManager.initReveal`) rather than creating a new observer per render.
- **A `--reveal-delay` token system** with `nth-child` stagger fallbacks capped at 12 items, avoiding runaway delays on long lists.

**Bottom line:** do not refactor the Motion engine or the nav spring. They are assets.

---

## 🎬 Animation Proposals

These are described at the behavioural level. No code — the implementing model should choose the mechanism.

| # | Target | Proposal | Rationale |
|---|--------|----------|-----------|
| **A-1** | **Opening a surah** | A "curtain reveal": an emerald light sweeps across `mushaf-block` (right-to-left, matching RTL reading direction) using `clip-path`, combined with a rising `translateY` per ayah block. | Makes opening the Mushaf feel like turning a page rather than swapping a DOM subtree. Currently `openSurah` just replaces `innerHTML` after a skeleton — the transition is abrupt. |
| **A-2** | **Ayahs on load** | Apply genuine `stagger` to individual ayahs on load (~60ms each, capped at ~20 then batched into one group). | `mushaf-block` currently renders all ayahs at once as a single block. The Mushaf has a *rhythm* — reading order — and staggering reinforces it while giving a perceived-progress cue on long surahs. |
| **A-3** | **Bookmark list deletion** | **Wire up the FLIP animation that already exists.** | ⭐ See the dedicated note below. This is the highest-value, lowest-effort item in this entire document. |
| **A-4** | **Tasbih lap completion** | A circular cascade: beads illuminate in sequence around the ring via `transition-delay: calc(var(--i) * 18ms)`. | Currently a single `.flash` on one bead. A cascade visually communicates "the ring is completing" and makes the lap boundary feel like an event rather than a state change. |
| **A-5** | **Stats bars** | Animate bar heights from 0 on screen entry, staggered left-to-right. | The bars currently have a static inline `height` with no entrance. They appear fully formed, which reads as a static chart rather than a live record of the user's week. Small change, meaningful shift in perceived liveliness. |
| **A-6** | **Scroll-linked title** | Use scroll-driven animations (native in modern Chrome/Edge) to fade and translate the surah title on scroll. | `bindHeaderParallax` already mutates `boxShadow` on scroll via rAF. Extending this to the title creates continuity between header and content. **Must remain rAF/scroll-driven, not timer-driven**, and must no-op under reduced motion. |
| **A-7** | **Skeleton loading** | Add a slight staggered `animation-delay` per card. | `shimmerWave` currently runs in perfect lockstep across every card, which reads as mechanical. Desynchronising by ~120ms per card makes it feel organic. |

### ⭐ A-3 in detail — the one-line win

`Motion.flipAnimate` is **fully implemented** at `index.html:1113-1135`. It:

1. Captures `getBoundingClientRect()` for all children before the DOM change
2. Returns a closure that, after the change, computes deltas and applies compensating transforms
3. Cleans up after the duration

**But it is never called from `BookmarksView.removeSurah` or `removeVerse`** (`features.js:169-176`). Those functions call `removeSurahBookmark` and then immediately re-render:

```js
removeSurah(num) {
  try { window.BookmarkManager.removeSurahBookmark(num); } catch (e) {}
  this.render();
},
```

So deleting a bookmark makes the remaining items **snap** to their new positions instead of sliding. The fix is to capture before `this.render()` and play after — a small, contained change using code that already exists and is already tested by virtue of being used nowhere (i.e. it was written and then orphaned).

**This is the best value-per-effort fix in the entire review.** It requires no new animation code.

---

## 📐 Layout & Responsive Issues

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| **U-1** | 🔴 | `index.html:615` | `#tasbih-circle-wrap { width: 280px; height: 280px; }` — **hardcoded**. On a 320px-wide device (iPhone SE) this nearly touches both edges with no margin. On a tablet or desktop it floats in disproportionate whitespace. Needs `clamp()` or `min(280px, 70vw)` with the bead ring scaling proportionally (`tasbih-bead` positions are percentage-based, so they follow — but `#tasbih-tap-btn` uses `inset: 34px`, a hardcoded value that will not scale). |
| **U-2** | 🟠 | `index.html:473` vs `index.html:379` | **Two conflicting layout maxima.** `.screen { max-width: 680px }` but `#nav { max-width: 420px }`. On a wide display the bottom nav "floats" at a different width than the content it navigates, breaking visual alignment. `khatmah-controls` (line 553) uses 680px like `.screen`. Needs one unified layout container. |
| **U-3** | 🟠 | `index.html:479` | `min-height: calc(100vh - var(--header-h) - 100px)` — iOS Safari's `100vh` **includes the address bar**, so this overestimates visible height and causes a layout jump when the bar collapses on scroll. Use `100dvh`. There are **12 `100vh`-family references** in the file; audit them all. |
| **U-4** | 🟠 | whole file | **No `@media (min-width: ...)` exists anywhere.** The app is "mobile-first" in the sense that it works on mobile, but it has **zero desktop breakpoints**. On a 1440px monitor it renders a 680px column with a 420px nav bar floating over it. The README's "Mobile-First Design ✅" claim overstates this. |
| **U-5** | 🟡 | `index.html:199`, `index.html:643` | **Duplicate `:active` rules with identical selectors**, both using `!important`. Line 199 sets `transform: translateY(2px) scale(0.985)`; line 643 sets `transform: scale(0.97) !important` with a shorter `transition`. The later rule wins, so the earlier is dead — but it is a maintenance trap: editing one will appear to have no effect. |
| **U-6** | 🟡 | whole file | No `@media (prefers-color-scheme: light)`. Users with a light OS theme are shown the dark theme until they manually toggle. The README lists "High Contrast Mode ✅" and theme support, but system-preference detection is absent. |
| **U-7** | 🟡 | `index.html:683-684` | `.stats-bar-tip` and `.stats-bar-label` are hardcoded at **`11px`**. Every other text element in the app uses `calc(var(--font-size) * n)` to respond to the font-scale control. These two **ignore the accessibility font-size feature entirely**, making them the smallest text in the app and unreadable at the "small" setting. |
| **U-8** | 🟡 | `index.html:670` | `.surah-row:has(.bm-remove:hover) .surah-info { margin-left: 34px; }` — `:has()` requires Safari 15.4+ / Chrome 105+ / Firefox 121+. With no fallback, older browsers simply skip the rule (the remove button overlaps the text). Consider a class-based approach. |
| **U-9** | 🟡 | `index.html:328-329` | `user-select: none` is applied globally to `html, body`, with `user-select: text` re-enabled only for `.mushaf-block`. This is a **deliberate** copy-protection choice for Quranic text and is defensible — but it also blocks legitimate accessibility uses (manual text selection for translation, screen-reader copy). Worth revisiting whether the protection is worth the cost. |
| **U-10** | 🟡 | `index.html:707`, `index.html:89`, `index.html:324` | **Dead CSS.** A completely empty rule: `#header { }` with an orphaned comment. Plus custom properties that are **defined but never referenced**: `--color-shadow` (defined twice, lines 89 and 324), `--stagger-step`, `--bounce-step`, `--ease-in-out-quart`, `--motion-ease-slow`, `--motion-duration-slower`. These inflate the stylesheet and mislead readers into thinking a token system is more complete than it is. |

---

## 🎨 Design Consistency Observations

Beyond the itemised issues above, a few cross-cutting notes:

### Two competing animation vocabularies

The CSS defines **two parallel easing systems** that overlap in purpose:

- A "design token" set: `--ease-out-quart`, `--ease-out-expo`, `--ease-spring`, `--ease-spring-snap`
- A second set: `--motion-ease`, `--motion-ease-fast`, `--motion-ease-slow` with `--motion-duration-*`

Several tokens in the second set are unused (`--motion-ease-slow`, `--motion-duration-slower`). Meanwhile many rules use raw `cubic-bezier(...)` literals inline instead of either system. For example `.thikr-tap-btn` uses `cubic-bezier(0.34, 1.56, 0.64, 1)` — which is exactly what `--ease-spring` holds.

**Recommendation:** consolidate to one vocabulary and reference it consistently. This is a genuine readability win for a 645-line stylesheet.

### Inline styles vs. classes

Several components mix approaches. `renderOccasionPage` and `openCategory` emit inline `style="..."` attributes (e.g. `style="font-size:calc(var(--font-size) * 0.45);color:var(--text-dim)"`) where a class would be cleaner and would allow hover/pseudo-state styling. This also makes the stylesheet harder to reason about because rules are split between the `<style>` block and generated HTML.

### Brand colour consistency is good

The emerald/teal/night-blue/cream identity is applied consistently, and the light theme is a genuine re-mapping of the same semantic tokens (`--accent`, `--bg`, `--surface`) rather than a separate hardcoded palette. The semantic aliases (`--color-on-accent`, `--color-on-accent-soft`) show the right instinct. This is one of the better parts of the design system.

### The dark theme is the default, and it is the better one

Worth noting: the dark theme (`--bg: #0a1f28`) is more carefully tuned than the light theme — it has more supporting tokens and the glass effects are designed around it. The light theme is applied as an override of a subset. If light mode matters to users, it needs equal design attention rather than being derived.

---

## 📋 Prioritised UI/UX Fix List

Ordered by impact:

1. **A-3** — wire up `flipAnimate` in `BookmarksView` (existing code, one call site) ⭐
2. **U-3** — `100vh` → `100dvh` for iOS Safari correctness
3. **U-1** — make the tasbih ring responsive
4. **U-2 / U-4** — unify layout widths and add desktop breakpoints
5. **U-7** — make stats labels respond to the font-size control
6. **U-5** — remove the duplicate `:active` rules
7. **U-6** — honour `prefers-color-scheme` at first paint
8. **U-10** — delete the dead CSS
9. **A-2 / A-5** — ayah stagger and animated stat bars
10. **A-1 / A-4 / A-6 / A-7** — remaining polish

---

## Verified line-reference index

| Item | Reference |
|------|-----------|
| A-3 | `index.html:1113-1135` (`flipAnimate`), `features.js:169-176` (call site missing) |
| U-1 | `index.html:615` |
| U-2 | `index.html:473`, `index.html:379`, `index.html:553` |
| U-3 | `index.html:479` |
| U-5 | `index.html:199`, `index.html:643` |
| U-7 | `index.html:683-684` |
| U-8 | `index.html:670` |
| U-9 | `index.html:328-329` |
| U-10 | `index.html:707`, `index.html:89`, `index.html:324` |
| Spring engine | `index.html:1377-1456` |
| Reduced-motion coverage | `index.html:1095`, `index.html:117-121`, `index.html:2057-2061` |
| `backwards` vs `both` fix | `index.html:474-478` |

---

**Next:** [`03-features.md`](03-features.md) — Feature suggestions for the Sadaqah Jariyah mission
