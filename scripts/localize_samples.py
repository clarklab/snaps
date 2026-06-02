#!/usr/bin/env python3
"""Post-process public/samples.json: download each curated photo, convert to a
small WebP (< 50 KB) bundled under public/samples/, and rewrite the manifest to
same-origin paths. This makes the sample set load fast (no Unsplash round-trip /
CDN latency) and work offline, while keeping attribution.

    python3 scripts/localize_samples.py

No API key needed — it only reads URLs already in samples.json.
"""
import io, json, os, urllib.request

OUT = "public/samples.json"
IMG_DIR = "public/samples"
TARGET_BYTES = 50_000

from PIL import Image

manifest = json.load(open(OUT))
session_headers = {"User-Agent": "snaps-quest-build/1.0"}


def encode_under_limit(img):
    """Return WebP bytes <= TARGET_BYTES, shrinking dimension/quality as needed."""
    img = img.convert("RGB")
    for max_dim in (640, 560, 480, 400):
        w, h = img.size
        scale = min(1.0, max_dim / max(w, h))
        resized = img.resize((max(1, round(w * scale)), max(1, round(h * scale))))
        for q in (78, 70, 62, 54, 46, 40):
            buf = io.BytesIO()
            resized.save(buf, "WEBP", quality=q, method=6)
            data = buf.getvalue()
            if len(data) <= TARGET_BYTES:
                return data, resized.size
    return data, resized.size  # smallest attempt, even if slightly over


total, worst = 0, 0
for color, entries in manifest["colors"].items():
    os.makedirs(f"{IMG_DIR}/{color}", exist_ok=True)
    for i, e in enumerate(entries):
        src = e["url"]
        # If already localized, re-derive from a stored source if present.
        req = urllib.request.Request(src, headers=session_headers)
        raw = urllib.request.urlopen(req, timeout=40).read()
        img = Image.open(io.BytesIO(raw))
        img.load()
        data, size = encode_under_limit(img)
        path = f"{IMG_DIR}/{color}/{i}.webp"
        open(path, "wb").write(data)
        e["url"] = f"/samples/{color}/{i}.webp"
        total += 1
        worst = max(worst, len(data))
        print(f"  {color}/{i}.webp  {len(data)//1024} KB  {size[0]}x{size[1]}")

json.dump(manifest, open(OUT, "w"), indent=2)
print(f"\nlocalized {total} images; largest = {worst//1024} KB "
      f"({'all under 50 KB' if worst <= TARGET_BYTES else 'NOTE: one over 50 KB'})")
