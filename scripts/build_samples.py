#!/usr/bin/env python3
"""Build public/samples.json — a curated set of nine single-color photos per
color, sourced from Unsplash.

Run once (it caches API responses so re-runs don't spend your rate limit):

    UNSPLASH_ACCESS_KEY=xxxx python3 scripts/build_samples.py

Only the Access Key is needed, and it is read from the environment — never
written to disk. The manifest stores Unsplash CDN image URLs plus attribution;
the app fetches those at runtime into local storage.
"""
import os, io, json, time, colorsys
from datetime import datetime, timezone
import requests
from PIL import Image

KEY = os.environ.get("UNSPLASH_ACCESS_KEY")
if not KEY:
    raise SystemExit("Set UNSPLASH_ACCESS_KEY in the environment.")

HEAD = {"Authorization": f"Client-ID {KEY}", "Accept-Version": "v1"}
CACHE = "/tmp/unsplash_cache.json"
OUT = "public/samples.json"
UTM = "?utm_source=snaps_quest&utm_medium=referral"

# Map our colors to Unsplash's color filter (pink -> magenta).
COLOR_FILTER = {
    "red": "red", "orange": "orange", "yellow": "yellow", "green": "green",
    "blue": "blue", "purple": "purple", "pink": "magenta",
    "black": "black", "white": "white",
}

# Each query is (text, color_filter) where color_filter is an Unsplash color
# value or None. Unsplash's color= classifier is sparse for many object nouns
# (e.g. color=orange + "orange door" -> 0 results, color=magenta -> almost
# nothing), so colors where it failed fall back to filter-free text search and
# lean on the hue scorer below. Kept lean to respect the 50 req/hour demo limit.
QUERIES = {
    "red":    [("red flower", "red"), ("red bicycle", "red"),
               ("red door", None), ("red car", None)],
    "orange": [("orange flower", "orange"), ("orange door", None),
               ("orange wall", None), ("orange car", None)],
    "yellow": [("yellow flower", "yellow"), ("yellow door", None),
               ("yellow taxi", None)],
    "green":  [("green plant", "green"), ("green wall", "green"),
               ("green bicycle", "green")],
    "blue":   [("blue boat", "blue"), ("blue car", "blue"),
               ("blue door", None)],
    "purple": [("purple flower", "purple"), ("purple light", "purple"),
               ("purple door", "purple")],
    "pink":   [("pink flower", None), ("pink door", None),
               ("pink wall", None), ("pink blossom", None)],
    "black":  [("black car", "black"), ("black cat", "black")],
    "white":  [("white building", "white"), ("white flower", "white"),
               ("white wall", "white")],
}

HUE_BANDS = {
    "red": (-18, 18), "orange": (15, 48), "yellow": (45, 72),
    "green": (78, 168), "blue": (185, 252), "purple": (255, 300),
    "pink": (295, 358),
}
# Pastel colors live at lower saturation, so relax the vividness floor.
MIN_SAT = {"pink": 0.16, "purple": 0.20, "orange": 0.24}

cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
session = requests.Session()


def search(query, color_filter):
    ck = f"{color_filter or 'none'}:{query}"
    if ck in cache:
        return cache[ck]
    params = {"query": query, "per_page": 10, "orientation": "squarish",
              "content_filter": "high"}
    if color_filter:
        params["color"] = color_filter
    r = session.get(
        "https://api.unsplash.com/search/photos", headers=HEAD,
        params=params, timeout=30,
    )
    if r.status_code != 200:
        print(f"  ! API {r.status_code} for '{query}': {r.text[:100]}")
        cache[ck] = []
    else:
        cache[ck] = [{
            "id": d["id"],
            "raw": d["urls"]["raw"],
            "small": d["urls"]["small"],
            "alt": (d.get("alt_description") or query).strip(),
            "author": d["user"]["name"],
            "author_url": d["user"]["links"]["html"],
            "link": d["links"]["html"],
            "q": query,
        } for d in r.json().get("results", [])]
        json.dump(cache, open(CACHE, "w"))
    rem = r.headers.get("X-Ratelimit-Remaining")
    if rem is not None:
        print(f"  rate limit remaining: {rem}")
    time.sleep(0.25)
    return cache[ck]


def score(img, color):
    s = img.convert("RGB").resize((72, 72))
    px = list(s.getdata())
    n = len(px)
    if color == "black":
        return sum(1 for r, g, b in px if max(r, g, b) < 75) / n
    if color == "white":
        return sum(1 for r, g, b in px if min(r, g, b) > 188) / n
    lo, hi = HUE_BANDS[color]
    min_sat = MIN_SAT.get(color, 0.26)
    vivid = onhue = 0
    for r, g, b in px:
        h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if sat > min_sat and v > 0.18:
            vivid += 1
            hd = h * 360
            ok = (hd >= 360 + lo or hd <= hi) if lo < 0 else (lo <= hd <= hi)
            if ok:
                onhue += 1
    return onhue / vivid if vivid > 50 else 0.0


def pick(color):
    cands = {}
    for q, cf in QUERIES[color]:
        for it in search(q, cf):
            cands.setdefault(it["id"], it)
    scored = []
    for it in cands.values():
        try:
            resp = session.get(it["small"], timeout=25)
            img = Image.open(io.BytesIO(resp.content)); img.load()
            scored.append((score(img, color), it, img))
        except Exception:
            continue
    scored.sort(key=lambda x: x[0], reverse=True)
    thr = 0.5 if color in ("black", "white") else 0.42
    picked, seen_q = [], set()
    for sc, it, img in scored:           # one per query first, for variety
        if sc < thr or it["q"] in seen_q:
            continue
        seen_q.add(it["q"]); picked.append((sc, it, img))
        if len(picked) == 9:
            break
    # Backfill unconditionally to a full 9 — results are already color-filtered
    # by Unsplash, so the best remaining ones are still on-color.
    chosen = {p[1]["id"] for p in picked}
    for sc, it, img in scored:
        if len(picked) == 9:
            break
        if it["id"] not in chosen:
            picked.append((sc, it, img)); chosen.add(it["id"])
    print(f"{color:7s} picked {len(picked)} (top scores "
          f"{[round(s,2) for s,_,_ in picked[:4]]})")
    return picked


def main():
    colors_out, all_picks = {}, {}
    for color in COLOR_FILTER:
        picks = pick(color)
        all_picks[color] = picks
        colors_out[color] = [{
            "url": it["raw"] + "&q=80&w=1400&fm=jpg&fit=max",
            "alt": it["alt"],
            "author": it["author"],
            "authorUrl": it["author_url"] + UTM,
            "link": it["link"] + UTM,
        } for _, it, _ in picks[:9]]

    manifest = {
        "source": "unsplash",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "colors": colors_out,
    }
    os.makedirs("public", exist_ok=True)
    json.dump(manifest, open(OUT, "w"), indent=2)
    total = sum(len(v) for v in colors_out.values())
    print(f"\nwrote {OUT}: {total} photos across {len(colors_out)} colors")

    # Contact sheet for a visual sanity check.
    order = list(COLOR_FILTER)
    cell, gap = 150, 6
    W = len(order) * cell + (len(order) + 1) * gap  # 9 columns
    H = W
    sheet = Image.new("RGB", (W, H), (12, 12, 14))
    for row, color in enumerate(order):
        for col, (_, _, img) in enumerate(all_picks[color][:9]):
            im = img.convert("RGB")
            w, h = im.size; m = min(w, h)
            im = im.crop(((w - m) // 2, (h - m) // 2, (w - m) // 2 + m, (h - m) // 2 + m)).resize((cell, cell))
            sheet.paste(im, (gap + col * (cell + gap), gap + row * (cell + gap)))
    sheet.save("/tmp/samples-master.jpg", "JPEG", quality=88)
    print("contact sheet -> /tmp/samples-master.jpg")


if __name__ == "__main__":
    main()
