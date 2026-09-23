# Quran Layout — Single-Page Mushaf

## Overview

The reading view (both surah mode and khatmah mode) renders **one complete Mushaf
page at a time, fitted to the screen with no scrolling in either direction**,
styled to look like a page of a printed Madinah mushaf. This document records
the geometry, the auto-fit mechanism, and the trade-offs it makes.

---

## The reading canvas

**Measured on Al-Baqarah (surah 2), viewport 390×844, font scale 1.0:**

```
Header                 fixed, env(safe-area-inset-top)
#screen-surah-view     display:flex; flex-direction:column; height:100%
  .surah-header-card   flex row: [🔖] [name + meta, centered] [▶]   (one lane each — no overlap)
  #verses-container    flex:1; min-height:0
    .mushaf-page-label   "صفحة ٢ — الجزء ١"
    .mushaf-page-wrap    flex:1; min-height:0; overflow:hidden; centers the page
      .bismillah
      .mushaf-block      gold double frame, cream paper, corner ornaments
    .mushaf-nav          next/previous page buttons, always visible
```

The screen is a flex column and `.mushaf-page-wrap` owns `overflow: hidden`, so
anything that does not fit is re-scaled rather than scrolled. `#content` itself
gets `overflow-y: hidden` while a reader screen is active (`:has()` selector).
Each reader screen carries its own `--nav-clearance-safe` bottom padding (see
"Two traps" below), so the wrap is the full `#content` height minus the nav —
514 px for the surah reader and 502 px for the khatmah reader at 390×844.

---

## Auto-fit: `--mushaf-fit`

A full mushaf page (~15 lines) cannot fit a phone screen at the user's preferred
font size, so the page is scaled down until it does:

```
--mushaf-size: calc(var(--mushaf-base) * var(--mushaf-scale) * var(--mushaf-fit))
```

- `--mushaf-base: 34px` — the ideal font size.
- `--mushaf-scale` — **the font-size slider directly**: `slider/100` (0.8–2.0).
- `--mushaf-fit` — **computed by `fitMushafPage()`**: starts at 1 and steps down
  in 0.02 increments until `.mushaf-page-wrap` has no vertical overflow and no
  `.mushaf-block` has horizontal overflow.

The floor is not a fixed ratio — it is a fixed **rendered pixel size**:

```
floor = max(0.15, MUSHAF_MIN_PX / (--mushaf-base × --mushaf-scale))
      = max(0.15, 9.5px / (34px × slider/100))
```

so the smallest text ever drawn is ~9.5 px regardless of the slider: 0.35 at 80 %,
0.215 at 130 %, 0.14 at 200 %. A fixed floor (the old 0.24) combined with a scale
that tracks the slider made the minimum *grow* with the slider and overflow on
small viewports — iPhone SE page 604 overflowed 2 px at the default. The
`Amiri Quran` face is lazy-loaded, so the loop guard allows up to 80 steps.

Everything inside the wrap tracks `--mushaf-fit`, not just the text: block
padding, the inner frame inset, bismillah, and the in-wrap surah header bands.
This matters because a page can hold up to three short surahs (pages 600–604);
if the fixed chrome did not shrink with the fit, those pages could never fit.

`fitMushafPage()` runs on every page render, on `applyFontSize`, on a debounced
`resize`, when the `Amiri Quran` web font finishes loading (`document.fonts.load`
— the first fit is computed against a fallback face and re-converges), and once
more 650 ms later, because the nav safe-area and the khatmah control bar settle
after the first paint.

### Honest trade-off

On a page that fills the screen, the final font size is
`available height ÷ (lines × line-height)` — the `--mushaf-scale` multiplier is
cancelled by the fit factor. **So the slider resizes the text only while the page
has headroom; once the page saturates the canvas, the rendered font holds at the
largest size that still fits with zero scroll.** Measured on Al-Fatiha at
390×844: 27.2 px at slider 80 → 34 px at 130 → 34 px at 200 (`--mushaf-fit`
1 → 1 → 0.5). The slider wiring is exact (`--mushaf-scale` == `slider/100`), and
on very dense pages the rendered font can even shrink a few percent as the slider
rises, because a bigger target font wraps into more lines and the canvas is
fixed — `--mushaf-lh` is pinned at 1.75 (printed mushaf density) rather than
growing with the slider, since a looser line would only shrink the fitted text
further. The suite reports the fitted size per page instead of claiming
readability it did not measure.

### The canvas is bigger than it looks

`#content` carries `padding-bottom: var(--nav-clearance-safe) + 36px` so list
screens do not hide their last rows behind the fixed nav. But a percentage
height resolves against the *content box*, so a reader screen's `height: 100%`
was shrinking by the whole clearance — and `#screen-khatmah-read` then paid it a
*second* time in its own bottom padding, cutting the khatmah canvas from ~570 px
to 329 px at 390×844. While a reader screen is displayed, `#content` now drops
its bottom padding entirely and each reader screen carries its own clearance
instead. Khatmah page 604 went from overflowing at slider 200 to fitting at
14.96 px on the same viewport.

Fitted sizes at 390×844, slider 130 (measured):

| Page | Fitted font | `--mushaf-fit` |
|---|---|---|
| Surah 1 (Al-Fatiha) | ~31.8 px | 0.72 |
| Surah 2 p1 (Al-Baqarah) | ~28 px | 0.64 |
| Surah 36 (Yaseen) | ~20 px | 0.45 |
| Surah 67 (Al-Mulk) | ~20 px | 0.44 |
| Khatmah page 604 (3 surahs) | ~14 px | 0.42 |

Dense pages render small but complete; the floor is a rendered ~9.5 px, reached
only by the three-surah final pages on the smallest viewports at the largest
slider values.

**Two traps the canvas fix exposed** (both caught by the E2E suite):

1. *Each reader screen must carry its own clearance.* `#screen-surah-view` had a
   pre-existing `padding-bottom: 8px` rule on `.active/.slide-*` that outranked
   the new clearance rule (id+class beats id), so the surah page silently
   extended *under* the fixed nav by 16 px — the frame's bottom edge was hidden
   behind the bar. The fix folded the clearance into that same high-specificity
   rule (`calc(var(--nav-clearance-safe) + 8px)`), which is also why the surah
   canvas is 514 px, not the khatmah reader's 502 px.
2. *The nav measurement is taken mid-transition.* `applyFontSize()` calls
   `syncNavSafeArea()` from a rAF — right as the 260 ms font transition starts,
   while the tab labels may still be wrapped on two lines. The measured height
   (up to ~118 px at slider 200) was stored in `--nav-h-actual` and never
   corrected, so `--nav-clearance-safe` stayed 42 px too tall *after* the
   transition finished, shrinking the khatmah canvas on iPhone SE until page 604
   overflowed by 2 px. `syncNavSafeArea()` now re-measures 350 ms later (past
   the transition) via `measureSafeAreas()`, and if the value actually changed
   while a reader is on screen it re-runs `fitMushafPage()` — the page reclaims
   the recovered canvas instead of staying under-fitted.

---

## The font-size slider

The chrome popover is a real `<input type="range" min=80 max=200 step=5>` with a
live Arabic-numeral percentage label (the old five-button step grid is gone).
`applyFontSize()` is continuous — no step snapping — and writes both
`--font-scale` (app chrome) and `--mushaf-scale` (Quran text) as
`slider/100`, i.e. `fontSize = base × sliderValue / 100`.

- **Default is 130.** To keep the product's default *appearance* unchanged,
  `--font-base` is 14 px so that 14 × 1.30 = 18.2 px — the same calibrated size
  the app shipped before. Every `calc(var(--font-size) * n)` multiplier stays
  calibrated with no per-rule edits.
- Reader screens cap the chrome at `min(var(--font-scale), 1.35)`: at slider 200
  the enlarged header/nav/controls would otherwise eat the page and no fit could
  save it.
- `--nav-h` (the static nav-height estimate used before the safe-area is
  measured) is now `calc(var(--font-size) * 4.2)` so it tracks the slider; the
  late `syncNavSafeArea()` measurement became a rounding correction instead of a
  visible jump for every fixed element above the nav.

---

## Traditional mushaf styling

`.mushaf-block` is styled as a printed page: cream paper gradient (light in both
themes — a physical page is always light), a 2 px gold outer border, an inner
1 px frame via `::before`, and four gold corner dots via layered radial
gradients on `::after`. Text is centred, `dir: rtl`, ayah markers are gold
badges. Tokens: `--mushaf-paper`, `--mushaf-paper-edge`, `--mushaf-ink`,
`--mushaf-gold`, `--mushaf-gold-soft` (with `body.theme-light` variants).

Inside the reading wrap, a surah header collapses into a slim ornamental band
(like a mushaf's surah heading) and its meta line is hidden, so multi-surah
pages keep their structure without paying full chrome height per surah.

---

## Header card — no icon overlap

Previously the 🔖 and ▶ buttons were `position: absolute` over the centred
surah name and overlapped it by 26×26 px². The card is now a flex row with
dedicated lanes: `[🔖 slot] [name + meta, flex:1, centred] [▶ slot]`. Empty lanes
collapse, so khatmah header cards (no buttons) stay correct. `#surah-view-meta`
is now populated in `openSurah` with the ayah count and مكية/مدنية.

---

## Reciter selection before playback

The ▶ button no longer plays immediately. It opens `#reciter-sheet`, a bottom
sheet in the style of `#custom-dialog-overlay` listing `Settings.RECITERS`
(12 reciters: الحصري، السديس، الشريم، المعيقلي، جبريل، بصفر، الرفاعي،
العنبري، …) with the current one marked. Choosing one saves the preference and
starts `AudioPlayer.play` from the current page (or the selected ayah). No audio
starts while the user is choosing. The per-ayah action bar keeps immediate
playback with the active reciter.

---

## Bismillah exceptions

The bismillah div is **not rendered** for:
- **Surah 1 (Al-Fatiha)** — the bismillah is the first ayah itself.
- **Surah 9 (At-Tawbah)** — traditionally has no bismillah.

---

## E2E Coverage

`tests/e2e-mushaf.mjs` (57 assertions, all passing) covers:

- **(a)** Header card: bookmark/play/name/meta have zero pairwise overlap, both
  buttons inside the card, meta populated.
- **(b)** Zero scroll on surahs 1, 2, 36, 67, 78 and khatmah pages 30, 100, 604;
  RTL + centred text; ayah structure intact; fitted sizes reported per page.
- **(c)** Font scaling 1.0→1.6 re-fits the page (fit recalculated, no overflow),
  including a sweep of dense khatmah pages at the largest scale.
- **(d)** Real-tap on ▶ opens the reciter sheet (≥10 reciters, current marked),
  no audio while choosing, selection saves `localStorage.reciter`, closes the
  sheet, and starts playback with the chosen reciter (audio bar + media playing).
- **(f)** The slider: default value is 130, `--mushaf-scale` == `slider/100`
  exactly, the Quran font grows 80→130 and is then capped by the page canvas
  (130→200 does not grow past the canvas maximum), zero scroll at 80/130/200,
  **the page frame stays clear of the bottom nav at every slider value**, and
  the Adhkar page text scales with the same control.
- **(g)** Edge viewports: zero scroll on iPhone SE (375×667) and iPhone Pro Max
  (430×932), at slider 130 and 200 — including khatmah page 604, the hardest
  combination of dense page + small canvas + large text.
- **(e)** No uncaught page errors, RTL preserved, page label present.

`tests/e2e-quran-layout.mjs` still guards the header→first-ayah gap; its
threshold moved from 180 px to 200 px because the centred page layout now splits
the headroom above and below the page (the gap went 267 → 300.8 in the old
layout's final form, then 185.5 with the single-page layout).
