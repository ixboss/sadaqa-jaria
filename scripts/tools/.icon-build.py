"""
Generate real PNG icons for the Islami PWA from the existing inline-SVG mushaf mark.

Why this exists: iOS Safari does not support SVG for apple-touch-icon, and the
manifest declared no image/png icons at all. Android install UI also prefers PNG.
This reproduces the SAME glyph as the inline data: SVG so nothing is redesigned,
just rasterised at the right sizes.

Glyph source (verbatim from index.html / manifest.json), viewBox 0 0 512 512:
  rect 512x512 rx=110            fill #0a1f28  (background)
  open-book path                 stroke #3ecf9e width 20
  centre spine line              stroke #3ecf9e width 20
  four tick marks                stroke #46c8d6 width 16
"""

from PIL import Image, ImageDraw
import os

BG      = (10, 31, 40)        # #0a1f28
GREEN   = (62, 207, 158)      # #3ecf9e
CYAN    = (70, 200, 214)      # #46c8d6

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")

# Cubic + line geometry, lifted from the SVG path data, normalised to 0..1
# then scaled to N. Kept as fractions so every size shares one definition.
BOOK = [
    # M256 400 C 256 400 186 427 106 373
    ("M", 256/512, 400/512),
    ("C", 256/512, 400/512, 186/512, 427/512, 106/512, 373/512),
    # L 106 160
    ("L", 106/512, 160/512),
    # C 186 213 256 186 256 186
    ("C", 186/512, 213/512, 256/512, 186/512, 256/512, 186/512),
    # C 256 186 326 213 406 160
    ("C", 256/512, 186/512, 326/512, 213/512, 406/512, 160/512),
    # L 406 373
    ("L", 406/512, 373/512),
    # C 326 427 256 400 256 400
    ("C", 326/512, 427/512, 256/512, 400/512, 256/512, 400/512),
    # Z  -> close back to start
    ("L", 256/512, 400/512),
]

SPINE = [("M", 256/512, 186/512), ("L", 256/512, 400/512)]

TICKS = [
    [("M", 160/512, 240/512), ("L", 213/512, 267/512)],
    [("M", 160/512, 293/512), ("L", 213/512, 320/512)],
    [("M", 352/512, 240/512), ("L", 299/512, 267/512)],
    [("M", 352/512, 293/512), ("L", 299/512, 320/512)],
]

SS = 8  # supersample factor -> draw big, downscale with LANCZOS for clean AA


def render(size, radius_ratio=110/512, ss=SS, bg=True):
    """Render the mark at `size` px, supersampled for antialiasing.

    bg=False omits the background AND the rounded corners, giving just the
    glyph on a transparent field -- used to compose the maskable icons.
    """
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if bg:
        # background rounded square
        r = int(radius_ratio * S)
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=BG)

    def pts(seg):
        """Flatten a single path command to absolute pixel coords."""
        op = seg[0]
        nums = seg[1:]
        if op in ("M", "L"):
            return [(nums[0] * S, nums[1] * S)]
        # cubic: three coordinate pairs
        return [
            (nums[0] * S, nums[1] * S),
            (nums[2] * S, nums[3] * S),
            (nums[4] * S, nums[5] * S),
        ]

    def draw_path(cmds, color, width_unscaled):
        """Draw a path by stepping the cubic/line commands into a polyline."""
        w = max(1, int(round(width_unscaled / 512 * S)))
        pts_all = []
        cur = None
        for seg in cmds:
            op = seg[0]
            if op in ("M", "L"):
                p = pts(seg)[0]
                pts_all.append(p)
                cur = p
            else:  # C
                c1, c2, end = pts(seg)
                steps = 48
                for i in range(1, steps + 1):
                    t = i / steps
                    mt = 1 - t
                    x = (mt**3) * cur[0] + 3 * (mt**2) * t * c1[0] + 3 * mt * (t**2) * c2[0] + (t**3) * end[0]
                    y = (mt**3) * cur[1] + 3 * (mt**2) * t * c1[1] + 3 * mt * (t**2) * c2[1] + (t**3) * end[1]
                    pts_all.append((x, y))
                cur = end

        if len(pts_all) < 2:
            return
        d.line(pts_all, fill=color, width=w, joint="curve")
        # round caps at both ends, matching stroke-linecap/linejoin="round"
        rad = w / 2
        for (px, py) in (pts_all[0], pts_all[-1]):
            d.ellipse([px - rad, py - rad, px + rad, py + rad], fill=color)

    draw_path(BOOK,  GREEN, 20)
    draw_path(SPINE, GREEN, 20)
    for t in TICKS:
        draw_path(t, CYAN, 16)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    made = []

    # Standard PWA icon set. 180 = apple-touch-icon (iOS rounds it itself).
    # NOTE: iOS applies its OWN mask to apple-touch-icon, so we ship it with a
    # full-bleed background (radius_ratio=0) -- otherwise iOS rounds an already
    # rounded square and you get dark slivers in the corners.
    for size in (120, 152, 167, 192, 512):
        img = render(size)
        name = f"icon-{size}.png"
        path = os.path.join(OUT_DIR, name)
        img.save(path, "PNG", optimize=True)
        made.append((name, size, os.path.getsize(path)))

    # apple-touch-icon: square, pre-rounded by iOS itself.
    img = render(180, radius_ratio=0)
    path = os.path.join(OUT_DIR, "apple-touch-icon-180.png")
    img.save(path, "PNG", optimize=True)
    made.append(("apple-touch-icon-180.png", 180, os.path.getsize(path)))

    # Maskable icons: the glyph must sit inside the safe zone (a circle of
    # diameter 80% of the frame, centred). Android crops to whatever shape the
    # launcher uses, so the background MUST bleed to all four edges and the
    # glyph must be small enough to survive the worst-case circular crop.
    for size in (192, 512):
        S = size * SS
        canvas = Image.new("RGBA", (S, S), BG)

        # Render the glyph alone on a transparent field, then scale it down.
        glyph_only = render(size, radius_ratio=0, bg=False)
        target = int(size * 0.62)  # 62% keeps it well inside the 80% safe circle
        g = glyph_only.resize((target * SS, target * SS), Image.LANCZOS)
        off = (S - g.width) // 2
        canvas.paste(g, (off, off), g)

        canvas = canvas.resize((size, size), Image.LANCZOS)
        name = f"maskable-{size}.png"
        path = os.path.join(OUT_DIR, name)
        canvas.save(path, "PNG", optimize=True)
        made.append((name, size, os.path.getsize(path)))

    print(f"{'file':<28}{'px':>6}{'bytes':>10}")
    print("-" * 44)
    for name, size, b in made:
        print(f"{name:<28}{size:>6}{b:>10}")
    print(f"\n{len(made)} files -> {OUT_DIR}")


if __name__ == "__main__":
    main()
