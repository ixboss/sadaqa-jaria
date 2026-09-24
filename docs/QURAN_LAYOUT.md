# Quran Layout — Printed-Page Mushaf with Scroll

## Overview

The reading view (surah mode and khatmah mode) renders the mushaf at its **printed
page size** — the text is never shrunk to fit one screen. The page area (between
the header card and the nav buttons) scrolls **vertically** when the text is taller
than the screen; the header and the prev/next buttons stay fixed. This document
records the geometry, the rendering model, and the E2E guarantees.

---

## The reading canvas

**Measured on Al-Baqarah (surah 2), viewport 390×844, font scale 1.0:**

```
Header                  fixed, env(safe-area-inset-top)
#screen-surah-view      display:flex; flex-direction:column; height:100%
  .surah-header-card    flex row: [🔖] [name + meta, centered] [▶]
  #verses-container     flex:1; min-height:0
    .mushaf-page-label   "صفحة ٢ — الجزء ١"
    .mushaf-page-wrap    flex:1; min-height:0; overflow-y:auto; centers the page
      .bismillah
      .mushaf-block     gold double frame, cream paper, corner ornaments
    .mushaf-nav          next/previous page buttons, always visible
```

`#content` carries `overflow-y: hidden` while a reader is on screen (`:has()`
selector), so `#content.scrollTop` (used by the reading-progress bar) remains
zero on reader screens. The `.mushaf-page-wrap` owns `overflow-y: auto`; it scrolls
while the chrome stays pinned. Each reader screen carries its own
`--nav-clearance-safe` bottom padding (surah: +8px extra), so the wrap height is
514 px for the surah reader and 502 px for the khatmah reader at 390×844.

---

## Font token chain

```
--font-base:    16px          natural browser default for UI text
--font-scale:   1.0           slider value / 100 (0.8 – 2.0)
--font-size:    calc(var(--font-base) * var(--font-scale))   — the live size

--mushaf-base:  34px          printed-page mushaf size (fixed)
--mushaf-scale: 1.0           mirrors --font-scale exactly (slider/100)
--mushaf-fit:   1             always 1 — no auto-shrinking
--mushaf-size:  clamp(20px, calc(var(--mushaf-base) * var(--mushaf-scale) * var(--mushaf-fit)), 80px)
                              clamp protects extremes only:
                              20px floor (readable on small screens)
                              80px cap  (slider 200% → 34×2 = 68px, well inside the cap)
--mushaf-lh:    1.75          fixed line-height matching printed mushaf density
```

`fitMushafPage()` is a no-op stub kept as a safe call target. The mushaf renders
at its natural printed-page size; the wrap scrolls vertically.

---

## Rendered sizes at 390×844 (measured)

| Page                     | @100% (34px)         | @200% (68px)         |
|--------------------------|----------------------|----------------------|
| Surah 1  (Al-Fatiha)     | 572/530 px scroll    | 1516/397 px scroll   |
| Surah 2  p1 (Al-Baqarah) | 609/481 px scroll    | 1780/335 px scroll   |
| Surah 36 (Yaseen)        | 936/481 px scroll    | 3446/335 px scroll   |
| Surah 67 (Al-Mulk)       | 1233/481 px scroll   | 5171/335 px scroll   |
| Khatmah p30              | 1447/556 px scroll   | 5955/469 px scroll   |
| Khatmah p604 (3 surahs)  | 1007/556 px scroll   | 2938/469 px scroll   |

All pages: zero horizontal overflow, zero text clipping, frame clear of the
bottom nav bar at every slider value. Al-Fatiha and Al-Baqarah do not scroll at
the default (100%): their content is taller than the wrap at 100%, so the wrap
itself shows the first portion with scroll capability available.

Header-to-first-ayah gap on Al-Baqarah: 61 px (down from 185 px under the old
auto-fit model). The page is no longer centred vertically — it sits at the top
with scroll headroom below.

---

## The font-size slider

The popover is a real `<input type="range" min=80 max=200 step=5>` with a live
Arabic-numeral percentage label. `applyFontSize()` writes both `--font-scale`
(UI chrome) and `--mushaf-scale` (Quran text) as `slider/100`. Both scale
together: at 100% both are 1.0, at 200% both are 2.0.

**Default is 100.** `--font-base` is 16 px, the natural browser default, so the
UI reads as a normal-sized page at the 100% default.

Reader chrome tracks the slider without a cap — at 200% the header, label, and
nav buttons grow too, but the page area scrolls so nothing overflows.

`--nav-h` (static nav-height estimate used before safe-area measurement) is
`calc(var(--font-size) * 4.2)` so it tracks the slider; the late
`measureSafeAreas()` call corrects the rounded estimate to the real pixel value.

---

## Two layout traps (documented in commits)

1. *Reader clears the nav.* `#content:has(#screen-surah-view.active)` drops
   `padding-bottom: 0` so the reader does not pay for the nav clearance twice.
   The reader screen itself carries `padding-bottom: calc(var(--nav-clearance-safe) + 8px)`
   (surah) — the extra 8px is the pre-existing gap to the fixed nav buttons.

2. *Nav measurement mid-font-transition.* `syncNavSafeArea()` ran from a rAF
   right as the 260 ms font transition started, storing `--nav-h-actual` while
   tab labels might still be on two lines. `measureSafeAreas()` now re-measures
   350 ms after the transition settles, and if the value changed while a reader
   is on screen it re-runs `fitMushafPage()` (kept as a no-op stub under the
   printed-page model, but called so the call site stays unchanged).

---

## Traditional mushaf styling

`.mushaf-block` is styled as a printed page: cream paper gradient, a 2 px gold
outer border, an inner 1 px frame via `::before`, and four gold corner dots via
layered radial gradients on `::after`. Text is centred, `dir: rtl`, ayah markers
are gold badges. Tokens: `--mushaf-paper`, `--mushaf-paper-edge`, `--mushaf-ink`,
`--mushaf-gold`, `--mushaf-gold-soft` (with `body.theme-light` variants).

The surah header collapses into a slim ornamental band inside the reading wrap;
multi-surah khatmah pages keep their structure without paying full chrome height
per surah.

---

## Header card — no icon overlap

The 🔖 and ▶ buttons are in dedicated flex lanes flanking the centred surah name
and meta. Empty lanes collapse, so khatmah header cards stay correct.

---

## Reciter selection before playback

The ▶ button opens `#reciter-sheet` (bottom sheet, 12 reciters) before playback.
No audio starts while choosing. Choosing saves the preference and calls
`AudioPlayer.play`. The per-ayah action bar keeps immediate playback.

---

## Bismillah exceptions

The bismillah div is **not rendered** for Surah 1 (Al-Fatiha, the bismillah is
the first ayah) and Surah 9 (At-Tawbah, traditionally omitted).

---

## E2E Coverage

`tests/e2e-mushaf.mjs` (63 assertions, all passing) covers:

- **(a)** Header card: bookmark/play/name/meta have zero pairwise overlap.
- **(b)** Printed-page size on surahs 1, 2, 36, 67, 78 and khatmah pages 30,
  100, 604: text renders at 34px at the default, no horizontal overflow.
- **(c)** Font scaling 1.0→1.6: text grows, page scrolls, no overflow.
- **(d)** ▶ opens reciter sheet (≥10 reciters), no audio while choosing,
  selection saves, sheet closes, playback starts.
- **(3)** Nav icons: every tab's icon stays fully inside the nav bar when
  active (active `translateY(-3px) scale(1.15)` no longer clips).
- **(f)** Clean boot: slider default 100, `--mushaf-scale` == `slider/100`,
  text grows 80→100→200 at the correct sizes (34px ± 1.5 at 100%),
  `horizontalFit` + `wrapClearOfNav` at every value, page scrolls at 200%.
  Adhkar text scales with the slider.
- **(g)** Edge viewports: iPhone SE (375×667) and iPhone Pro Max (430×932)
  at slider 100 and 200 — Al-Fatiha fits at 100%, Yaseen and khatmah 604
  scroll internally, all with `horizontalFit` and `wrapClearOfNav`.
- **(e)** No uncaught page errors, RTL preserved, page label present.

`tests/e2e-quran-layout.mjs` (4 assertions, all passing) guards:
- **(a)** Header→first-ayah gap on Al-Baqarah < 200 px (measured 61 px).
- **(b)** No bismillah on Surah 1 and Surah 9.
- **(c)** Khatmah inline margin-top ≤ 14 px.