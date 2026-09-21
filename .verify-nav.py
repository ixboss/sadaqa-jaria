"""Assert nav geometry with the bar seated flush against the safe area.

Mirrors the CSS token math exactly:
  --nav-bottom         = nav-gap + inset + nav-drop
  --nav-clearance-safe = nav-h + nav-gap + nav-drop + 20px + inset

The bar occupies [nav-bottom, nav-bottom + nav-h] from the screen bottom.
Content must clear it, i.e. clearance-safe must exceed nav-bottom + nav-h.

The bar hugs the safe-area inset on every device bucket, so gap = drop = 0
and --nav-bottom is exactly the inset.
"""

GAP = 0
DROP = 0
# Total margin above the safe-area inset before this change (old gap + old drop)
PREVIOUS = {"default": 12, "short": 10, "landscape": 8}
# (label, inset, nav-h key, viewport h, viewport w)
DEVICES = [
    ("iPhone SE / no inset",        0,  "default",   667, 375),
    ("iPad",                       20,  "default",  1024, 768),
    ("Android gesture",            24,  "default",   892, 412),
    ("iPhone home bar",            34,  "default",   852, 393),
    ("Android 2-button",           36,  "default",   892, 412),
    ("Android 3-button",           48,  "default",   892, 412),
    ("Small phone (h=600)",         0,  "short",     600, 375),
    ("Landscape phone",             0,  "landscape", 390, 844),
    ("iPad landscape",             20,  "landscape", 768, 1024),
]

NAV_H = {"default": 70, "short": 58, "landscape": 54}


def gap_for(key, inset):
    return GAP


print(f"{'device':<26}{'inset':>6}{'gap':>5}{'drop':>6}{'bottom':>8}"
      f"{'bar top':>9}{'clears by':>11}  verdict")
print("-" * 84)

fails = []
for label, inset, key, vh, vw in DEVICES:
    # JS decides the gap bucket from viewport height/width, not the label.
    if vh <= 500 and vw > vh:
        js_key = "landscape"
    elif vh <= 620:
        js_key = "short"
    else:
        js_key = "default"

    gap   = gap_for(js_key, inset)
    drop  = DROP
    navh  = NAV_H[js_key]
    bottom = gap + inset + drop
    bartop = bottom + navh
    clear  = navh + gap + drop + 20 + inset
    margin = clear - bartop           # must be >= 20 (the 20px design margin)

    ok = margin >= 20 - 0.01
    if not ok:
        fails.append(label)
    print(f"{label:<26}{inset:>6}{gap:>5.0f}{drop:>6.0f}{bottom:>8.1f}"
          f"{bartop:>9.1f}{margin:>11.1f}  {'OK' if ok else 'OVERLAP'}")

print()
# Before/after: how far the bar moved down toward the safe-area inset
print("Bar bottom vs the safe-area inset (margin above the inset, before -> after):")
print(f"{'device':<26}{'before':>9}{'after':>9}{'moved':>9}")
print("-" * 53)
for label, inset, key, vh, vw in DEVICES:
    if vh <= 500 and vw > vh:
        js_key = "landscape"
    elif vh <= 620:
        js_key = "short"
    else:
        js_key = "default"
    before = PREVIOUS[js_key]
    after  = GAP + DROP
    print(f"{label:<26}{before:>9.0f}{after:>9.0f}{after-before:>9.0f}")

print()
print(f"FAILS: {len(fails)}" + (f" -> {fails}" if fails else ""))
