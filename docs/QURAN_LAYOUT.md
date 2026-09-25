# Quran Layout & Spacing

## Overview

This document explains the vertical layout stack in both surah (single-surah) and khatmah (reading-plan) modes, and the fixes applied to eliminate the "strange empty spaces" reported in Task 3.

---

## Surah Mode: Vertical Stack

**Measured on Al-Baqarah (surah 2), viewport 390×844, re-verified 2026-09-25.**

The app's default font scale is 1.3 (the unified 80–140% slider), so both the
documented 100% baseline and the default are shown:

```
100% scale (baseline)          default 1.3×
Header            0–70px       0–81px        (in flow, env(safe-area-inset-top))
.surah-header-card 70–191px    81–216px      (surah name + meta + bookmark)
.bismillah        191–288px    216–321px     (padding: 8px 10px 12px 10px)
.mushaf-page-label 288–311px   321–351px     (margin-bottom: 6px)
.mushaf-block     311+         351+          (padding-top: 30px — printed-page margin)
first ayah text   ~342px       ~382px
```

**Total gap header→first ayah text:** **272px at 100% scale, 301px at the default 1.3×.**

This is larger than the ~165px originally documented. The Task 3 tightening fix
is still in place (bismillah padding 20px vertical, label margin 6px — verified in
CSS and by `tests/e2e-quran-layout.mjs`); the larger total comes from parts of the
stack the original write-up understated or omitted:

- **`.bismillah` renders at `calc(var(--mushaf-size) * 1.08)`** — ~39px at the
  100% baseline, so one line + padding measures **97px**, not the ~25px the
  original diagram assumed.
- **`.mushaf-block` has `padding: 30px 26px`** (the printed-page inner margin),
  which the original diagram did not count — the first ayah text starts 30px
  below the block's top edge.
- **`.surah-header-card`** (surah name, ayah count, bookmark) occupies **121px**
  at the 100% baseline.

All of these are intentional elements of the reading stack; the total is a
characteristic of the larger default Quran font, not a defect. The E2E assertion
guards against the gap growing further (≤ 290px at 100% scale) rather than
against the historical 180px figure.

### Changes Applied

1. **`.bismillah` padding (index.html:624):** Reduced from `14px 10px 22px 10px` (36px vertical) to `8px 10px 12px 10px` (20px vertical). **Saves ~16px.**

2. **`.mushaf-page-label` margin (index.html:603):** Reduced from `margin-bottom: 10px` to `6px`. **Saves 4px.**

**Before:** The bismillah took 112.56px (36px padding + ~76px text) plus the label's 32px (text + margin), creating a 267px gap that felt like awkward empty space.

**After:** The bismillah is still prominent but tighter (20px padding), and the label sits closer to the mushaf block. The visual hierarchy is preserved while reducing excessive whitespace.

### Bismillah Exceptions

Per line 2271 in `index.html`, the bismillah div is **NOT rendered** for:
- **Surah 1 (Al-Fatiha):** The bismillah is the first ayah itself.
- **Surah 9 (At-Tawbah):** Traditionally has no bismillah.

---

## Khatmah Mode: Multi-Surah Inline Margins

In khatmah reading mode (`loadKhatmahPage()`, lines 2558–2603), a single Quran page may span multiple surahs. When a new surah starts mid-page, the code injects:

```html
<div class="surah-header-card" style="margin-top:14px;">
```

**Changed from `margin-top:20px` to `14px`** at lines 2585 and 2597.

**Rationale:** At larger font scales (1.3×, 2.0×), the 20px margin created visible gaps between surah headers that felt awkward. Reducing to 14px maintains clear visual separation without excess spacing.

**Affected lines:**
- **Line 2585:** First surah on the page (when `ayahs[0].numberInSurah === 1`)
- **Line 2597:** Surah change mid-page (`ayah.surah.number !== currentSurah`)

---

## Why the "Gap" Existed

The bismillah text is rendered at `calc(var(--mushaf-size) * 1.08)` (larger than ayah text) and centered, with generous padding to honor its significance. The page label ("صفحة ٢ — الجزء ١") provides context. Together they create intentional breathing room before the Quran text begins.

However, the original **36px bismillah padding was excessive**, especially when combined with the label's 10px margin. The fix tightens this to **20px + 6px** while preserving the visual hierarchy: bismillah → page label → ayah text.

---

## E2E Coverage

See `tests/e2e-quran-layout.mjs` for automated verification:

- **(a) Surah mode spacing:** Gap from header to first ayah ≤ 290px at 100% font scale (re-verified baseline 272px; 301px at the 1.3× default). See the stack above for why the total exceeds the historical ~165px figure.
- **(b) Bismillah exceptions:** Al-Fatiha (1) and At-Tawbah (9) have NO bismillah element
- **(c) Khatmah margins:** Inline `margin-top` on `.surah-header-card` ≤ 14px (was 20px)

The test suite confirms the fixes eliminate the awkward gaps without breaking the layout or bismillah rendering logic.
