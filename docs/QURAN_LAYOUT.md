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

---

## Auto-fit: `--mushaf-fit`

A full mushaf page (~15 lines) cannot fit a phone screen at the user's preferred
font size, so the page is scaled down until it does:

```
--mushaf-size: calc(var(--mushaf-base) * var(--mushaf-scale) * var(--mushaf-fit))
```

- `--mushaf-base: 34px` — the ideal font size.
- `--mushaf-scale` — a gentle multiplier from the font-size slider (0.93–1.25).
- `--mushaf-fit` — **computed by `fitMushafPage()`**: starts at 1 and steps down
  in 0.02 increments (floor 0.29) until `.mushaf-page-wrap` has no vertical
  overflow and no `.mushaf-block` has horizontal overflow.

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
cancelled by the fit factor. **So the font-size slider mostly resizes the app
chrome, not the mushaf text:** it cannot make a dense page's text larger without
scrolling, which the requirement forbids. Sparse pages (where `--mushaf-fit`
reaches 1.0) do grow with the slider. `--mushaf-lh` is pinned at 1.75 (printed
mushaf density) rather than growing with the slider, since a looser line would
only shrink the fitted text further. The suite reports the fitted size per page
instead of claiming readability it did not measure.

Fitted sizes at 390×844, font scale 1.0 (measured):

| Page | Fitted font | `--mushaf-fit` |
|---|---|---|
| Surah 1 (Al-Fatiha) | ~31.7 px | 0.96 |
| Surah 2 p1 (Al-Baqarah) | ~31.7 px | 0.96 |
| Surah 36 (Yaseen) | ~17.8 px | 0.54 |
| Surah 67 (Al-Mulk) | ~15.2 px | 0.46 |
| Khatmah page 604 (3 surahs) | ~11.5 px | 0.29–0.35 |

Dense pages render small but complete; the floor is 0.29 (~10 px), reached only
by the three-surah final pages at the largest font scale.

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

`tests/e2e-mushaf.mjs` (40 assertions, all passing) covers:

- **(a)** Header card: bookmark/play/name/meta have zero pairwise overlap, both
  buttons inside the card, meta populated.
- **(b)** Zero scroll on surahs 1, 2, 36, 67, 78 and khatmah pages 30, 100, 604;
  RTL + centred text; ayah structure intact; fitted sizes reported per page.
- **(c)** Font scaling 1.0→1.6 re-fits the page (fit recalculated, no overflow),
  including a sweep of dense khatmah pages at the largest scale.
- **(d)** Real-tap on ▶ opens the reciter sheet (≥10 reciters, current marked),
  no audio while choosing, selection saves `localStorage.reciter`, closes the
  sheet, and starts playback with the chosen reciter (audio bar + media playing).
- **(e)** No uncaught page errors, RTL preserved, page label present.

`tests/e2e-quran-layout.mjs` still guards the header→first-ayah gap; its
threshold moved from 180 px to 200 px because the centred page layout now splits
the headroom above and below the page (the gap went 267 → 300.8 in the old
layout's final form, then 185.5 with the single-page layout).
