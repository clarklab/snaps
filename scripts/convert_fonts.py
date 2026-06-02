#!/usr/bin/env python3
"""
One-shot font compressor.

Takes every .ttf in public/fonts/, subsets it to the Latin glyphs we'll
ever render in this app, and emits a .woff2 alongside. Roughly an 80%
size reduction per face — a meaningful win on overseas connections.

Unicode ranges kept:
  U+0020-007E    Basic Latin (ASCII)
  U+00A0-00FF    Latin-1 Supplement (Western European)
  U+0100-017F    Latin Extended-A  (Polish, Czech, Turkish, etc.)
  U+2000-206F    General Punctuation (em-dashes, curly quotes, ellipsis)
  U+20A0-20BF    Currency symbols

If you ever localize to Cyrillic/Greek/CJK, widen the range and re-run.

Usage:  python3 scripts/convert_fonts.py
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

UNICODES = ",".join(
    [
        "U+0020-007E",
        "U+00A0-00FF",
        "U+0100-017F",
        "U+2000-206F",
        "U+20A0-20BF",
    ]
)

REPO = Path(__file__).resolve().parent.parent
FONTS_DIR = REPO / "public" / "fonts"


def convert(ttf: Path) -> Path:
    woff2 = ttf.with_suffix(".woff2")
    cmd = [
        "pyftsubset",
        str(ttf),
        f"--unicodes={UNICODES}",
        "--flavor=woff2",
        f"--output-file={woff2}",
        # Keep hinting — looks better at small sizes on Android, costs ~1-2 KB.
        # Drop name-table records we don't use; saves a little more.
        "--name-IDs=1,2,3,4,5,6",
        "--layout-features=*",
        "--no-recommended-glyphs",
        "--desubroutinize",
    ]
    subprocess.run(cmd, check=True)
    return woff2


def main() -> None:
    if not FONTS_DIR.is_dir():
        raise SystemExit(f"Fonts dir not found: {FONTS_DIR}")

    ttfs = sorted(FONTS_DIR.glob("*.ttf"))
    if not ttfs:
        raise SystemExit("No .ttf files to convert.")

    before = sum(t.stat().st_size for t in ttfs)
    woff2s = [convert(t) for t in ttfs]
    after = sum(w.stat().st_size for w in woff2s)

    print()
    for ttf, woff2 in zip(ttfs, woff2s):
        kb = ttf.stat().st_size / 1024
        kb2 = woff2.stat().st_size / 1024
        print(f"  {ttf.name}  {kb:5.1f} KB  →  {woff2.name}  {kb2:5.1f} KB")
    saved = (before - after) / 1024
    pct = 100 * (1 - after / before)
    print(f"\nTotal: {before/1024:.1f} KB  →  {after/1024:.1f} KB"
          f"   (saved {saved:.1f} KB / {pct:.0f}%)")
    print("\nNext: update src/index.css to point at the .woff2 files, then "
          "delete the .ttf files.")


if __name__ == "__main__":
    main()
