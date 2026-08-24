#!/usr/bin/env python3
"""Re-pick each species' image preferring hand-drawn botanical illustrations.

Uses the already-fetched candidates in data/species-images.raw.json where an
illustration exists (70/100), and only runs a fresh targeted Commons search for
the remaining species. Outputs data/species-images.json (same shape as the
finalize step), so build_species_media.py can re-download and rebuild.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_species_images as fsi  # reuse search()/clean_scientific()/api_get()

ROOT = Path(__file__).resolve().parents[1]

ILL = [
    "köhler", "kohler", "redout", "blanco", "britton", "curtis", "siebold",
    "kawahara", "keiga", "michaux", "lemaire", "loudon", "van houtte",
    "pomological", "watercolour", "watercolor", "lithograph", "engraving",
    "chromolith", "etching", "botanical illustration", "illustration", "plate",
    "drawing", "herbarium", "naturalis", "gartenflora", "wellcome", "sylva",
    "flora japonica", "flore des serres", "arboretum et fruticetum",
    "north american sylva", "flora de filipinas",
]
LIC_OK = re.compile(r"^(pd|cc0|cc-by|cc-by-sa)", re.IGNORECASE)


def ill_score(c: dict) -> int:
    blob = f"{c.get('title', '')} {c.get('categories', '')}".lower()
    return sum(1 for kw in ILL if kw in blob)


def lic_ok(c: dict) -> bool:
    l = (c.get("license") or "").lower()
    return bool(LIC_OK.match(l)) and "nc" not in l and "nd" not in l


def lic_bonus(c: dict) -> int:
    l = (c.get("license") or "").lower()
    return 2 if l in ("pd", "cc0") else 1


def is_displayable(c: dict) -> bool:
    t = (c.get("title") or "").lower()
    u = (c.get("thumbUrl") or "").lower()
    return not (t.endswith(".pdf") or u.endswith(".pdf") or u.endswith(".svg"))


def key(c: dict) -> tuple:
    return (ill_score(c) * 3 + lic_bonus(c), lic_bonus(c))


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
    from_raw = 0
    from_search = 0
    fallback_photo = 0

    for species, entry in raw.items():
        scientific = entry["scientificName"]
        cands = entry["candidates"]

        ill = [c for c in cands if ill_score(c) >= 1 and lic_ok(c) and is_displayable(c)]
        if ill:
            out[species] = to_record(species, scientific, max(ill, key=key))
            from_raw += 1
            print(f"[raw]   {species}  -> {out[species]['title'][:60]}", flush=True)
            continue

        # targeted fresh search for a hand-drawn plate
        sci = fsi.clean_scientific(scientific)
        genus = sci.split()[0] if sci else ""
        queries = []
        if sci and " " in sci:
            queries += [f"{sci} illustration", f"{sci} botanical", f"{sci} plate"]
        if genus:
            queries += [f"{genus} botanical illustration", f"{genus} plate", f"{genus} köhler"]
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

        ill2 = [c for c in found if ill_score(c) >= 1 and lic_ok(c) and is_displayable(c)]
        if ill2:
            out[species] = to_record(species, scientific, max(ill2, key=key))
            from_search += 1
            print(f"[new]   {species}  -> {out[species]['title'][:60]}", flush=True)
            continue

        # fallback: best reusable non-illustration (photo) already in raw
        photos = [c for c in cands if lic_ok(c) and is_displayable(c)]
        if photos:
            out[species] = to_record(species, scientific, max(photos, key=lic_bonus))
            fallback_photo += 1
            print(f"[photo] {species}  (无手绘，保留照片)", flush=True)

    payload = json.dumps(out, ensure_ascii=False, indent=2)
    (ROOT / "data" / "species-images.json").write_text(payload, encoding="utf-8")
    (ROOT / "public" / "data" / "species-images.json").write_text(payload, encoding="utf-8")
    print(f"\nDone: {from_raw} from raw, {from_search} new search, "
          f"{fallback_photo} photo fallback. Total {len(out)}.")


if __name__ == "__main__":
    main()
