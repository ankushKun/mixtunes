#!/usr/bin/env python3
"""Rebuild final yTunes icons from the v6 EQ-Y 16px pixel master."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "v6-eq-y.png"


def main():
    base = Image.open(SRC).convert("RGBA")

    def nn(size: int) -> Image.Image:
        return base.resize((size, size), Image.Resampling.NEAREST)

    def padded(canvas: int, art: int) -> Image.Image:
        art = (art // 16) * 16
        tile = nn(art)
        out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        origin = (canvas - art) // 2
        out.paste(tile, (origin, origin), tile)
        return out

    icons = ROOT / "icons"
    store = ROOT / "store"
    docs = ROOT / "docs" / "assets"
    nn(16).save(icons / "icon-16.png")
    nn(32).save(icons / "icon-32.png")
    nn(48).save(icons / "icon-48.png")
    padded(128, 96).save(icons / "icon-128.png")
    padded(128, 96).save(store / "icon-128.png")
    padded(512, 384).save(store / "icon-512.png")
    nn(32).save(docs / "favicon.png")
    nn(32).save(docs / "icon.png")
    nn(64).save(docs / "icon-64.png")
    nn(180).save(docs / "icon-180.png")
    print("v6 eq-y icons written")


if __name__ == "__main__":
    main()
