# Quran Layout & Spacing

## Overview

This document explains the vertical layout stack in both surah (single-surah) and khatmah (reading-plan) modes, and the fixes applied to eliminate the "strange empty spaces" reported in Task 3.

---

## Surah Mode: Vertical Stack

**Measured on Al-Baqarah (surah 2), viewport 390×844, font scale 1.0:**

```
Header                 0–70px         (fixed, env(safe-area-inset-top))
#screen-surah-view     padding-top: 16px
  .surah-header-card   86–176px       (90px height + 16px margin-bottom)
#verses-container      starts at 192px
  .bismillah           192–~217px     (padding: 8px 10px 12px 10px = 20px vertical)
  .mushaf-page-label   ~217–~229px    (text ~12px + margin-bottom: 6px)
  .mushaf-block        starts at ~235px (first ayah text)
```

**Total gap from header to first ayah text:** ~165px (down from ~267px before the fix).

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

- **(a) Surah mode spacing:** Gap from header to first ayah < 180px (was 267px)
- **(b) Bismillah exceptions:** Al-Fatiha (1) and At-Tawbah (9) have NO bismillah element
- **(c) Khatmah margins:** Inline `margin-top` on `.surah-header-card` ≤ 14px (was 20px)

The test suite confirms the fixes eliminate the awkward gaps without breaking the layout or bismillah rendering logic.
