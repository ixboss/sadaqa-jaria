"""
.social-preview-build.py — social preview / OG image (1280x640) for Islami.

Same visual language as .icon-build.py: the open-mushaf mark on the deep-night
background (#0a1f28) with the brand green (#3ecf9e) and cyan (#46c8d6).
Output: assets/social-preview.png — wired into index.html as og:image /
twitter:image, and suitable for GitHub Settings -> Social preview (which,
unlike repo metadata, has no API — it must be uploaded once by hand).

Run:  python .social-preview-build.py

Arabic text is shaped through three tiers, in order:
  1. Pillow's bundled RAQM engine (full OpenType shaping + bidi);
  2. optional `arabic-reshaper` + `python-bidi` packages (pure Python, using
     the Arabic Presentation Forms the system fonts carry);
  3. a clean Latin-only layout.
It never renders unshaped, disconnected Arabic. Tiers 2-3 need nothing beyond
Pillow, so contributors can always rebuild the card.
"""

from PIL import Image, ImageDraw, ImageFont, features
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "assets")
OUT = os.path.join(OUT_DIR, "social-preview.png")

# Brand tokens (same values as index.html :root)
BG    = (10, 31, 40)      # #0a1f28
GREEN = (62, 207, 158)    # #3ecf9e
CYAN  = (70, 200, 214)    # #46c8d6
CREAM = (243, 240, 231)   # #f3f0e7
DIM   = (159, 184, 182)   # #9fb8b6

W, H = 1280, 640
SS = 2                    # supersample: draw at 2560x1280, LANCZOS down

# ---------------------------------------------------------------------------
# Fonts: prefer Segoe UI (Windows), then Tahoma/Arial — all carry Arabic.
# ---------------------------------------------------------------------------
AR_CANDIDATES = [
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/tahoma.ttf",
    "C:/Windows/Fonts/arial.ttf",
]
LAT_REGULAR_CANDIDATES = AR_CANDIDATES
LAT_BOLD_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/tahomabd.ttf",
]


def first_existing(paths):
    for p in paths:
        if os.path.isfile(p):
            return p
    return None


def font_has_arabic(font):
    """True if the font actually contains Arabic glyphs (not .notdef tofu)."""
    try:
        seen = font.getbbox("\u0633")     # seen — a basic Arabic letter
        missing = font.getbbox("\u2FFB")  # an ideographic description char no
                                          # system UI font ships
        return seen != missing
    except Exception:
        return False


RAQM = features.check("raqm")
AR_FONT_PATH = first_existing(AR_CANDIDATES)
LAT_PATH = first_existing(LAT_REGULAR_CANDIDATES)
LAT_BOLD_PATH = first_existing(LAT_BOLD_CANDIDATES) or LAT_PATH


def load(path, px):
    kwargs = {}
    if RAQM:
        kwargs["layout_engine"] = ImageFont.Layout.RAQM
    return ImageFont.truetype(path, px, **kwargs)


# Arabic shaping is only attempted when the engine AND the glyphs both exist.
ARABIC_OK = bool(AR_FONT_PATH)
SHAPER = None
if RAQM and ARABIC_OK:
    SHAPER = "raqm"
else:
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        if ARABIC_OK and font_has_arabic(load(AR_FONT_PATH, 32)):
            SHAPER = "reshaper"
    except ImportError:
        pass
ARABIC_OK = SHAPER is not None


def shape(text):
    """Return (draw_text, direction) for a possibly-Arabic string.

    direction is None unless RAQM is loaded — PIL rejects the kwarg outright
    when libraqm is missing, even for "ltr" (None is its accepted default).
    """
    if SHAPER == "reshaper":
        return get_display(arabic_reshaper.reshape(text)), None
    return text, "rtl" if RAQM else None


print(f"raqm engine: {RAQM} · arabic font: {AR_FONT_PATH} · shaper: {SHAPER}")


# ---------------------------------------------------------------------------
# Load the mushaf mark from .icon-build.py (single source of the glyph).
# ---------------------------------------------------------------------------
spec = importlib.util.spec_from_file_location("iconbuild", os.path.join(HERE, ".icon-build.py"))
iconbuild = importlib.util.module_from_spec(spec)
spec.loader.exec_module(iconbuild)


def glyph_ink(target_h_phys):
    """The mark on a transparent field, cropped to its ink, scaled to height."""
    img = iconbuild.render(1024, radius_ratio=0, bg=False)
    img = img.crop(img.getbbox())
    w = round(img.width * target_h_phys / img.height)
    return img.resize((w, target_h_phys), Image.LANCZOS)


# ---------------------------------------------------------------------------
# Card
# ---------------------------------------------------------------------------
img = Image.new("RGB", (W * SS, H * SS), BG)
d = ImageDraw.Draw(img)


def draw_mixed(cx, cy, parts, gap_phys):
    """Center a mixed Arabic/Latin line at (cx, cy).

    parts: list of (text, font, is_arabic, fill). Each segment is shaped and
    measured separately, then drawn left-to-right in the order given — mixing
    scripts inside one draw.text call lets the bidi resolver reorder runs, and
    per-segment fills keep the tagline green.
    """
    measured = []
    for t, f, ar, fill in parts:
        text, direction = shape(t) if ar else (t, None)
        w = d.textlength(text, font=f, direction=direction)
        measured.append((text, f, fill, w, direction))
    sep = d.textlength("\u00B7", font=parts[0][1])
    total = sum(m[3] for m in measured) + (len(parts) - 1) * (sep + 2 * gap_phys)
    x = cx - total / 2
    for i, (text, f, fill, w, direction) in enumerate(measured):
        d.text((x, cy), text, font=f, fill=fill, anchor="lm", direction=direction)
        x += w + gap_phys
        if i < len(parts) - 1:
            d.text((x, cy), "\u00B7", font=parts[0][1], fill=DIM, anchor="lm")
            x += sep + gap_phys


# Glyph — centred, upper area
mark = glyph_ink(190 * SS)
img.paste(mark, (W * SS // 2 - mark.width // 2, 80 * SS), mark)

# Title — إسلامي · Islami   (Arabic first, matching the README header)
if ARABIC_OK:
    parts = [
        ("إسلامي", load(AR_FONT_PATH, 84 * SS), True, CREAM),
        ("Islami", load(LAT_BOLD_PATH, 72 * SS), False, CREAM),
    ]
else:
    parts = [("Islami", load(LAT_BOLD_PATH, 84 * SS), False, CREAM)]
draw_mixed(W * SS // 2, 400 * SS, parts, 26 * SS)

# Subtitle — what the app provides
d.text((W * SS // 2, 505 * SS), "Quran \u00B7 Khatmah \u00B7 Adhkar \u00B7 Tasbih",
       font=load(LAT_PATH, 34 * SS), fill=DIM, anchor="mm")

# Tagline — the sadaqah jariyah identity, in brand green
if ARABIC_OK:
    parts = [
        ("صدقة جارية", load(AR_FONT_PATH, 44 * SS), True, GREEN),
        ("Sadaqah Jariyah", load(LAT_BOLD_PATH, 38 * SS), False, GREEN),
    ]
else:
    parts = [("Sadaqah Jariyah", load(LAT_BOLD_PATH, 40 * SS), False, GREEN)]
draw_mixed(W * SS // 2, 585 * SS, parts, 22 * SS)


os.makedirs(OUT_DIR, exist_ok=True)
img = img.resize((W, H), Image.LANCZOS)
img.save(OUT, "PNG", optimize=True)
print(f"wrote {OUT} ({W}x{H}, {os.path.getsize(OUT)} bytes)")

# ---------------------------------------------------------------------------
# Programmatic sanity report (this host verifies by pixels, not by eye)
# ---------------------------------------------------------------------------
def region_ink(box):
    """Count pixels in `box` that are clearly neither background nor near it."""
    b = img.crop(box).tobytes()
    return sum(1 for i in range(0, len(b), 3)
               if abs(b[i] - BG[0]) + abs(b[i + 1] - BG[1]) + abs(b[i + 2] - BG[2]) > 120)


report = {
    "glyph": region_ink((W // 2 - 160, 60, W // 2 + 160, 290)),
    "title": region_ink((200, 320, W - 200, 400)),
    "subtitle": region_ink((200, 480, W - 200, 530)),
    "tagline": region_ink((200, 560, W - 200, 610)),
    "corners_bg": all(img.getpixel(p) == BG for p in
                      [(2, 2), (W - 3, 2), (2, H - 3), (W - 3, H - 3)]),
}
for k, v in report.items():
    print(f"{k:>10}: {v}")
if not ARABIC_OK:
    print("NOTE: rendered Latin-only fallback (no raqm / no reshaper / no Arabic font).")
