#!/usr/bin/env python3
"""Merge auto-picked species images with hand-curated overrides.

Produces the final UI payload consumed by TreeExplorer.tsx:
  public/data/species-images.json  (and a copy under data/)

Each entry carries the licence + artist + credit so the detail card can show
proper attribution. Overrides fix cases where the automated search matched the
wrong species (e.g. Phoebe the moon of Saturn instead of Phoebe the tree).
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# species -> exact Commons File: title (chosen from data/species-images.raw.json)
OVERRIDES: dict[str, str] = {
    "木樨": "File:Osmanthus fragrans kz2.jpg",
    "榉树": "File:Zelkova serrata 10zz.jpg",
    "广玉兰": "File:Magnolia grandiflora - flower 1.jpg",
    "荷花玉兰": "File:Magnolia grandiflora - flower 1.jpg",
    "玉兰": "File:Magnolia denudata - Orto botanico di Pisa - fiore - feb 2025 (03).jpg",
    "枫香": "File:Liquidambar formosana 01.jpg",
    "紫楠": "File:Phoebe formosana.JPG",
    "浙江楠": "File:Phoebe formosana.JPG",
    "雪松": "File:Cedrus deodara Aurea 1zz.jpg",
    "凌霄": "File:CampsisGrandiflora.jpg",
    "蚊母树": "File:Distylium racemosum1.jpg",
    "茶": "File:Camellia sinensis (2).jpg",
}

# Never republish an automatic result after it fails manual review. These
# species stay image-less until an exact, licensed replacement is curated.
EXCLUDED_SPECIES = {"银杏", "瓶兰花", "香圆", "牛鼻栓"}


def to_record(species: str, scientific: str, cand: dict) -> dict:
    artist = (cand.get("artist") or "").strip()
    if "unknown author" in artist.lower():
        artist = "Unknown author"
    return {
        "species": species,
        "scientificName": scientific,
        "title": cand.get("title", ""),
        "thumbUrl": cand.get("thumbUrl", ""),
        "pageUrl": cand.get("pageUrl", ""),
        "license": cand.get("licenseShort") or cand.get("license") or "CC BY-SA",
        "artist": artist,
        "credit": (cand.get("credit") or "").strip(),
    }


def main() -> None:
    raw = json.loads((ROOT / "data" / "species-images.raw.json").read_text(encoding="utf-8"))
    auto = json.loads((ROOT / "data" / "species-images.auto.json").read_text(encoding="utf-8"))

    out: dict[str, dict] = {}
    for species, entry in raw.items():
        if species in EXCLUDED_SPECIES:
            continue
        scientific = entry["scientificName"]
        cand = None
        if species in OVERRIDES:
            title = OVERRIDES[species]
            cand = next((c for c in entry["candidates"] if c["title"] == title), None)
        if cand is None:
            cand = auto.get(species)
        if cand:
            out[species] = to_record(species, scientific, cand)

    payload = json.dumps(out, ensure_ascii=False, indent=2)
    (ROOT / "public" / "data" / "species-images.json").write_text(payload, encoding="utf-8")
    (ROOT / "data" / "species-images.json").write_text(payload, encoding="utf-8")
    print(f"Wrote {len(out)} species images (of {len(raw)} species).")


if __name__ == "__main__":
    main()
