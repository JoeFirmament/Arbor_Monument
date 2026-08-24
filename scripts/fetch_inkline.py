#!/usr/bin/env python3
"""Re-pick each species' image preferring monochrome line drawings (墨线).

Strategy for the "墨线统一" direction:
  - strong monochrome line-drawing sources score highest (Blanco / Britton /
    Flora de Filipinas / Illustrated Flora / herbarium / plantarum)
  - generic drawing/plate/engraving/lithograph score medium
  - coloured sources (Redouté / Köhler / Curtis / Siebold / Michaux / pomological)
    are deprioritised because their hues clash
  - otherwise fall back to a reusable photo (CSS will later grey-tone it)

Outputs data/species-images.json in the same shape the finalize step produces.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_species_images as fsi

ROOT = Path(__file__).resolve().parents[1]

INK_STRONG = [
    "line drawing", "blanco", "britton", "flora de filipinas",
    "illustrated flora", "herbarium", "plantarum", "botanical drawing",
]
INK_WEAK = ["drawing", "illustration", "plate", "engraving", "lithograph", "etching", "botanical"]
COLORED = [
    "watercolour", "watercolor", "köhler", "kohler", "redout", "curtis",
    "pomological", "siebold", "kawahara", "keiga", "michaux", "chromolith",
    "hand-colour", "hand-color", "sylva",
]
LIC_OK = re.compile(r"^(pd|cc0|cc-by|cc-by-sa)", re.IGNORECASE)


def ink_score(c: dict) -> int:
    blob = f"{c.get('title', '')} {c.get('categories', '')}".lower()
    s = 0
    s += 3 * sum(1 for kw in INK_STRONG if kw in blob)
    s += 1 * sum(1 for kw in INK_WEAK if kw in blob)
    s -= 2 * sum(1 for kw in COLORED if kw in blob)
    return s


def lic_ok(c: dict) -> bool:
    l = (c.get("license") or "").lower()
    return bool(LIC_OK.match(l)) and "nc" not in l and "nd" not in l


def lic_bonus(c: dict) -> int:
    return 2 if (c.get("license") or "").lower() in ("pd", "cc0") else 1


def displayable(c: dict) -> bool:
    t = (c.get("title") or "").lower()
    u = (c.get("thumbUrl") or "").lower()
    return not (t.endswith(".pdf") or u.endswith(".pdf") or u.endswith(".svg"))


def key(c: dict) -> tuple:
    return (ink_score(c), lic_bonus(c))


def to_record(species: str, scientific: str, c: dict) -> dict:
    artist = (c.get("artist") or "").strip()
    if "unknown author" in artist.lower():
        artist = "Unknown author"
    return {
        "species": species,
        "scientificName": scientific,
        "title": c.get("title", ""),
        "thumbUrl": c.get("thumbUrl", ""),
        "pageUrl": c.get("pageUrl", ""),
        "license": c.get("licenseShort") or c.get("license") or "CC BY-SA",
        "artist": artist,
        "credit": (c.get("credit") or "").strip(),
    }


def main() -> None:
    raw = json.loads((ROOT / "data" / "species-images.raw.json").read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    ink = 0
    photo = 0
    new = 0

    for species, entry in raw.items():
        scientific = entry["scientificName"]
        cands = entry["candidates"]

        lines = [c for c in cands if lic_ok(c) and displayable(c) and ink_score(c) >= 1]
        if lines:
            out[species] = to_record(species, scientific, max(lines, key=key))
            ink += 1
            print(f"[line]  {species}  -> {out[species]['title'][:58]}", flush=True)
            continue

        # fresh search for a line drawing (Blanco / Britton / line drawing)
        sci = fsi.clean_scientific(scientific)
        genus = sci.split()[0] if sci else ""
        queries = []
        if sci and " " in sci:
            queries += [f"{sci} line drawing", f"{sci} Blanco", f"{sci} Britton"]
        if genus:
            queries += [f"{genus} line drawing", f"{genus} botanical drawing"]
        found: list[dict] = []
        seen: set[str] = set()
        for q in queries:
            try:
                for c in fsi.search(q):
                    if c["title"] not in seen:
                        seen.add(c["title"])
                        found.append(c)
            except Exception as exc:  # noqa: BLE001
                print(f"    ! search '{q}' failed: {exc}", file=sys.stderr, flush=True)
            time.sleep(0.5)

        found_lines = [c for c in found if lic_ok(c) and displayable(c) and ink_score(c) >= 1]
        if found_lines:
            out[species] = to_record(species, scientific, max(found_lines, key=key))
            new += 1
            print(f"[new]   {species}  -> {out[species]['title'][:58]}", flush=True)
            continue

        # fallback: any reusable photo
        photos = [c for c in cands if lic_ok(c) and displayable(c)]
        if photos:
            out[species] = to_record(species, scientific, max(photos, key=lic_bonus))
            photo += 1
            print(f"[photo] {species}  (无线描，保留照片)", flush=True)

    payload = json.dumps(out, ensure_ascii=False, indent=2)
    (ROOT / "data" / "species-images.json").write_text(payload, encoding="utf-8")
    (ROOT / "public" / "data" / "species-images.json").write_text(payload, encoding="utf-8")
    print(f"\nDone: {ink} line-drawing (raw), {new} line-drawing (search), "
          f"{photo} photo fallback. Total {len(out)}.")


if __name__ == "__main__":
    main()
