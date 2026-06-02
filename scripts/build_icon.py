#!/usr/bin/env python3
"""Generate the Snaps app icons — an "iris" made of a ring of overlapping
colored dots, drawn from the app's chromatic palette (no black/white).

Why a ring of dots instead of a grid: adaptive icons on Android (and the
rounded/circle masks iOS and many launchers apply) crop the corners off a
square grid. A centered circular motif survives any mask, and the ring of
overlapping color dots reads as a little iris that's distinct from a plain
swatch grid.

Run:  python3 scripts/build_icon.py
Writes the full icon set into public/icons/.
"""
import math
import os

from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")

# The seven chromatic brand colors, rainbow order (pink wraps back to red).
# Black & white are intentionally omitted per the icon brief.
PALETTE = [
    (255, 59, 48),    # red
    (255, 149, 0),    # orange
    (255, 204, 0),    # yellow
    (52, 199, 89),    # green
    (0, 122, 255),    # blue
    (175, 82, 222),   # purple
    (232, 156, 154),  # pink (dusty rose)
]

# Dark canvas so the colored iris glows; matches the PWA theme/background.
BG = (12, 12, 14, 255)

# Each hue appears twice around the ring for a smooth, full spectrum.
DOT_COUNT = 14
# Ring radius as a fraction of the icon size (centers of the dots sit here).
RING_FRAC = 0.30
# Dot radius relative to the spacing between neighbours; >0.5 → they overlap.
OVERLAP = 1.18

SS = 4  # supersample factor for crisp anti-aliased edges


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def color_at(i):
    """Smoothly interpolate the palette so the ring is a continuous wheel."""
    pos = (i / DOT_COUNT) * len(PALETTE)
    lo = int(math.floor(pos)) % len(PALETTE)
    hi = (lo + 1) % len(PALETTE)
    return lerp(PALETTE[lo], PALETTE[hi], pos - math.floor(pos))


def render(size, transparent=False):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0) if transparent else BG)
    draw = ImageDraw.Draw(img)

    cx = cy = s / 2
    ring = s * RING_FRAC
    spacing = (2 * math.pi * ring) / DOT_COUNT
    dot_r = (spacing / 2) * OVERLAP

    for i in range(DOT_COUNT):
        # Start at the top and go clockwise.
        theta = -math.pi / 2 + (i / DOT_COUNT) * 2 * math.pi
        x = cx + ring * math.cos(theta)
        y = cy + ring * math.sin(theta)
        col = color_at(i) + (255,)
        draw.ellipse(
            [x - dot_r, y - dot_r, x + dot_r, y + dot_r],
            fill=col,
        )

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    targets = [
        # (filename, size, transparent background?)
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("maskable-512.png", 512, False),  # bg fills the maskable safe area
        ("apple-touch-icon.png", 180, False),  # iOS dislikes transparency
        ("favicon-64.png", 64, True),  # crisp on any browser chrome
    ]
    for name, size, transparent in targets:
        img = render(size, transparent=transparent)
        path = os.path.join(OUT_DIR, name)
        img.save(path)
        print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    main()
