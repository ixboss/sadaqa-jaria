"""Validate the manifest + icon wiring after the PNG icon change."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
fails, warns = [], []


def ok(msg):   print(f"  PASS  {msg}")
def bad(msg):  fails.append(msg); print(f"  FAIL  {msg}")
def warn(msg): warns.append(msg); print(f"  WARN  {msg}")


print("== manifest.json ==")
try:
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        m = json.load(f)
    ok("valid JSON")
except Exception as e:
    bad(f"invalid JSON: {e}")
    sys.exit(1)

icons = m.get("icons", [])
if not icons:
    bad("no icons declared")
else:
    ok(f"{len(icons)} icons declared")

for i in icons:
    src = i.get("src", "")
    if src.startswith("data:"):
        warn(f"still a data: URI -> {i.get('sizes')}")
        continue
    p = os.path.join(ROOT, src.lstrip("./"))
    if not os.path.exists(p):
        bad(f"missing file: {src}")
    else:
        sz = os.path.getsize(p)
        ok(f"{src:<34} {i.get('sizes'):>9}  {i.get('purpose'):<14} {sz:>7} B")

# PNG magic-byte check: guarantee they are real PNGs, not HTML error pages
print("\n== PNG magic bytes ==")
PNG_SIG = b"\x89PNG\r\n\x1a\n"
for i in icons:
    src = i.get("src", "")
    if src.startswith("data:"):
        continue
    p = os.path.join(ROOT, src.lstrip("./"))
    if os.path.exists(p):
        with open(p, "rb") as f:
            head = f.read(8)
        if head == PNG_SIG:
            ok(f"{src} is a real PNG")
        else:
            bad(f"{src} is NOT a PNG (got {head!r})")

print("\n== maskable requirement ==")
mask = [i for i in icons if i.get("purpose") == "maskable"]
if not mask:
    bad("no maskable icon: Android will letterbox the icon inside a white circle")
elif not any(i["sizes"].startswith("512") for i in mask):
    warn("no 512 maskable (recommended)")
else:
    ok(f"{len(mask)} maskable icon(s), incl. 512")

print("\n== screenshots ==")
if "screenshots" in m:
    shot = m["screenshots"]
    blank = [s for s in shot if s.get("src", "").startswith("data:image/svg") and "<rect" in s["src"]]
    if blank:
        bad("blank screenshot placeholder still present -> Android install sheet shows an empty box")
    else:
        ok(f"{len(shot)} screenshots, none obviously blank")
else:
    ok("no screenshots key (correct: install UI falls back to the icon)")

print("\n== index.html icon links ==")
with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
    html = f.read()

for m_ in re.finditer(r'<link rel="apple-touch-icon"[^>]*>', html):
    tag = m_.group(0)
    href = re.search(r'href="([^"]+)"', tag)
    if not href:
        continue
    h = href.group(1)
    sizes = re.search(r'sizes="([^"]+)"', tag)
    if h.startswith("data:"):
        warn("apple-touch-icon still points at an SVG data URI (Safari ignores it)")
    else:
        p = os.path.join(ROOT, h.lstrip("./"))
        if os.path.exists(p):
            ok(f"apple-touch-icon {sizes.group(1) if sizes else '(no sizes)':<9} -> {h}")
        else:
            bad(f"apple-touch-icon target missing: {h}")

print("\n== sw.js ==")
with open(os.path.join(ROOT, "sw.js"), encoding="utf-8") as f:
    sw = f.read()
ver = re.search(r"CACHE_NAME\s*=\s*'([^']+)'", sw)
ok(f"cache name = {ver.group(1) if ver else '?'}")
for m_ in re.finditer(r"'\./(icons/[^']+)'", sw):
    p = os.path.join(ROOT, m_.group(1))
    if os.path.exists(p):
        ok(f"precached: {m_.group(1)}")
    else:
        bad(f"precache path missing: {m_.group(1)}")

print("\n" + "=" * 50)
print(f"FAILS: {len(fails)}   WARNS: {len(warns)}")
for x in fails:
    print(f"  ! {x}")
for x in warns:
    print(f"  ~ {x}")
sys.exit(1 if fails else 0)
