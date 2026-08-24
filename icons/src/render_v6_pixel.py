#!/usr/bin/env python3
"""Rebuild final Mixtunes icons from the v6 EQ-Y 16px pixel master."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "v6-eq-y.png"

# Superellipse exponent; n≈5 matches Apple's icon squircle closely.
SQUIRCLE_N = 5.0


def squircle_mask(size: int, n: float = SQUIRCLE_N) -> Image.Image:
    """Antialiased Apple-like squircle alpha mask (size × size, 'L')."""
    # Render at 4× then downscale for smooth edges on every icon size.
    scale = 4
    big = size * scale
    mask = Image.new("L", (big, big), 0)
    px = mask.load()
    # Pixel-center coords in [-1, 1]; shape fills the canvas (touches mid-edges).
    for y in range(big):
        ny = abs((y + 0.5) / big * 2.0 - 1.0)
        for x in range(big):
            nx = abs((x + 0.5) / big * 2.0 - 1.0)
            if nx**n + ny**n <= 1.0:
                px[x, y] = 255
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def main():
    base = Image.open(SRC).convert("RGBA")
    # Drop transparent margin around the plate; keep the EQ-Y + plate intact.
    bbox = base.getbbox()
    if not bbox:
        raise SystemExit(f"no visible pixels in {SRC}")
    plate = base.crop(bbox)

    def nn(size: int) -> Image.Image:
        out = plate.resize((size, size), Image.Resampling.NEAREST)
        # 14→16 (and other non-multiples) can leave tiny transparent corners;
        # fill those with the plate so the canvas is fully covered before mask.
        px = out.load()
        plate_color = None
        for y in range(out.size[1]):
            for x in range(out.size[0]):
                c = px[x, y]
                if c[3] == 0:
                    continue
                if c[:3] == (10, 10, 12):
                    plate_color = c
                    break
            if plate_color:
                break
        if plate_color:
            for y in range(out.size[1]):
                for x in range(out.size[0]):
                    if px[x, y][3] == 0:
                        px[x, y] = plate_color
        # Apple-style squircle: transparent outside the continuous corner.
        out.putalpha(squircle_mask(size))
        return out

    icons = ROOT / "icons"
    store = ROOT / "store"
    docs = ROOT / "docs" / "assets"
    store.mkdir(parents=True, exist_ok=True)
    docs.mkdir(parents=True, exist_ok=True)

    nn(16).save(icons / "icon-16.png")
    nn(32).save(icons / "icon-32.png")
    nn(48).save(icons / "icon-48.png")
    nn(128).save(icons / "icon-128.png")
    nn(128).save(store / "icon-128.png")
    nn(512).save(store / "icon-512.png")
    nn(32).save(docs / "favicon.png")
    nn(32).save(docs / "icon.png")
    nn(64).save(docs / "icon-64.png")
    nn(180).save(docs / "icon-180.png")
    print(f"v6 eq-y squircle icons written (plate {plate.size[0]}×{plate.size[1]})")


if __name__ == "__main__":
    main()
