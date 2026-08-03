#!/usr/bin/env python3
"""Generate the raster brand assets that can't be SVG: the social card and the
icon PNGs.

    python3 scripts/generate-images.py

NOT part of `npm run build` — these are static assets that only change when the
brand or the headline figures change, and requiring Python in CI for that would
be a poor trade. Re-run it by hand after editing the logo or the copy below.

Geometry is transcribed from logo/crown-ridge-*.svg so the raster output stays
identical to the vector source. Palette: the logo's own gold/ink, on the site's
"Lime" tokens for everything else (see STYLE_GUIDE.md) — the logo is the mark,
lime remains the UI accent.
"""
from PIL import Image, ImageDraw, ImageFont

OUT_PUBLIC = "/Users/ohang404/Desktop/nbim-tracker/frontend/public"

# ── Brand ──────────────────────────────────────────────────────────────────
LOGO_TILE      = "#16181B"   # crown-ridge-mark tile
LOGO_TILE_DARK = "#0F1113"   # crown-ridge-dark tile (on near-black grounds)
LOGO_STROKE    = "#2B2F33"
LOGO_CROWN     = "#F7F6F2"
LOGO_GOLD      = "#C9A227"

# Lime tokens (site UI accent — unchanged by the logo)
BG     = "#08080A"
INK    = "#F6F6F2"
SUB    = "#A0A0A4"
SOFT   = "#74747A"
LINE   = "#24242A"
ACCENT = "#D6E134"

DISPLAY = "/System/Library/Fonts/SFNS.ttf"
MONO    = "/System/Library/Fonts/SFNSMono.ttf"

# Crown outlines in their native 48x48 viewBox, straight from the SVGs.
CROWN_MARK    = [(9, 32), (9, 16), (16.5, 24), (24, 14), (31.5, 24), (39, 16), (39, 32)]
BAR_MARK      = (9, 35, 39, 39)          # x0, y0, x1, y1
CROWN_FAVICON = [(7, 33), (7, 13), (15.5, 22), (24, 10), (32.5, 22), (41, 13), (41, 33)]
BAR_FAVICON   = (7, 37, 41, 42)


def font(path, size, weight):
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def draw_tracked(draw, xy, s, f, fill, tracking=0):
    """Pillow has no letter-spacing, so uppercase labels are drawn per glyph."""
    x, y = xy
    if not tracking:
        draw.text((x, y), s, font=f, fill=fill)
        return draw.textlength(s, font=f)
    for c in s:
        draw.text((x, y), c, font=f, fill=fill)
        x += draw.textlength(c, font=f) + tracking
    return x - xy[0]


def draw_mark(img, x, y, size, *, crown, bar, tile, stroke=None, ss=4):
    """Render the crown-ridge mark at `size` px, supersampled for clean edges."""
    s = size * ss
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    k = s / 48.0
    radius = int(5 * k)
    ld.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=tile,
                         outline=stroke, width=max(1, int(k)) if stroke else 0)
    ld.polygon([(px * k, py * k) for px, py in crown], fill=LOGO_CROWN)
    x0, y0, x1, y1 = bar
    ld.rectangle([x0 * k, y0 * k, x1 * k, y1 * k], fill=LOGO_GOLD)
    img.paste(layer.resize((size, size), Image.LANCZOS), (x, y),
              layer.resize((size, size), Image.LANCZOS))


# ── Icon PNGs ──────────────────────────────────────────────────────────────
# The favicon cut is bolder (larger crown, thicker bar) so it survives small sizes.
for px, name in ((180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")):
    icon = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    draw_mark(icon, 0, 0, px, crown=CROWN_FAVICON, bar=BAR_FAVICON, tile=LOGO_TILE)
    # apple-touch-icon must be opaque; iOS composites transparency onto black.
    if name == "apple-touch-icon.png":
        flat = Image.new("RGB", (px, px), LOGO_TILE)
        flat.paste(icon, (0, 0), icon)
        icon = flat
    icon.save(f"{OUT_PUBLIC}/{name}", "PNG", optimize=True)
    print("wrote", name, icon.size)

# favicon.ico — browsers hit /favicon.ico at the root whether or not the page
# declares a <link>, and Safari's support for SVG favicons is poor. Without this
# those contexts fall back to a blank icon. Multi-resolution so the OS picks the
# right one instead of downscaling 48px into a 16px tab.
_ico = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
draw_mark(_ico, 0, 0, 256, crown=CROWN_FAVICON, bar=BAR_FAVICON, tile=LOGO_TILE)
_ico.save(f"{OUT_PUBLIC}/favicon.ico", "ICO",
          sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote favicon.ico (16/32/48/64/128/256)")

# ── Social card ────────────────────────────────────────────────────────────
W, H, PAD = 1200, 630, 76
img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

TILE = 60
draw_mark(img, PAD, PAD, TILE, crown=CROWN_MARK, bar=BAR_MARK,
          tile=LOGO_TILE_DARK, stroke=LOGO_STROKE)

f_brand = font(DISPLAY, 33, "Semibold")
bx, by = PAD + TILE + 22, PAD + 4
d.text((bx, by), "Sovereign ", font=f_brand, fill=INK)
d.text((bx + d.textlength("Sovereign ", font=f_brand), by), "Insights", font=f_brand, fill=ACCENT)
draw_tracked(d, (bx + 2, by + 42), "NORWAY GPFG  ·  EQUITY HOLDINGS",
             font(MONO, 15, "Medium"), SOFT, tracking=1.6)

# Headline — the site's own h1, fitted to the column AND the band between the
# lockup and the footer rule, then centred so it can never collide with either.
lines = ["The world’s largest", "sovereign wealth fund,", "tracked equity by equity."]
maxw = W - PAD * 2
band_top, band_bottom = PAD + TILE + 62, H - PAD - 108
band_h = band_bottom - band_top
size = 80
while size > 40:
    f_h = font(DISPLAY, size, "Semibold")
    leading = int(size * 1.07)
    asc, desc = f_h.getmetrics()
    if (max(d.textlength(l, font=f_h) for l in lines) <= maxw
            and leading * (len(lines) - 1) + asc + desc <= band_h):
        break
    size -= 2
f_h = font(DISPLAY, size, "Semibold")
leading = int(size * 1.07)
asc, desc = f_h.getmetrics()
top = band_top + (band_h - (leading * (len(lines) - 1) + asc + desc)) / 2
for i, line in enumerate(lines):
    d.text((PAD, top + i * leading), line, font=f_h, fill=INK)

fy = H - PAD - 32
d.line([PAD, fy - 34, W - PAD, fy - 34], fill=LINE, width=1)
f_num, f_lab = font(MONO, 25, "Semibold"), font(MONO, 14, "Medium")
x = PAD
for numv, lab in (("1,430", "POSITIONS"), ("6", "MARKETS"), ("11", "SECTORS")):
    d.text((x, fy), numv, font=f_num, fill=ACCENT)
    nw = d.textlength(numv, font=f_num)
    x += nw + 10 + draw_tracked(d, (x + nw + 10, fy + 9), lab, f_lab, SUB, tracking=1.4) + 46

f_dom = font(MONO, 16, "Medium")
dom = "invest.learnbasecase.com"
dw = sum(d.textlength(c, font=f_dom) for c in dom) + 1.2 * (len(dom) - 1)
draw_tracked(d, (W - PAD - dw, fy + 6), dom, f_dom, SOFT, tracking=1.2)

img.save(f"{OUT_PUBLIC}/og-image.png", "PNG", optimize=True)
print("wrote og-image.png", img.size)
