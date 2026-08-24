#!/usr/bin/env python3
"""Locate Flora of China line-drawing (墨线图) URLs on eFloras for each species.

PRIVATE RESEARCH USE ONLY — do not republish. The illustrations are
© Science Press & Missouri Botanical Garden Press, via eFloras.org.

Pipeline per species: search FOC (flora_id=2) -> taxon page -> "Illustration"
object page -> image URL on images.mobot.org.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = {"User-Agent": "Mozilla/5.0 (private research; SuzhouTrees)"}


def get(url: str, tries: int = 3) -> str:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", "ignore")
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(4 * (attempt + 1))
    raise last  # type: ignore[misc]


def clean_sci(raw: str) -> str:
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", (raw or "").strip())
    out = [t for t in s.split() if t and not (t.endswith(".") and len(t) <= 6)]
    return " ".join(out)


def search_taxon(name: str) -> str | None:
    url = "http://www.efloras.org/browse.aspx?flora_id=2&name_str=" + urllib.parse.quote(name)
    html = get(url)
    ids = re.findall(r"florataxon\.aspx\?flora_id=2&taxon_id=(\d+)", html)
    return ids[0] if ids else None


def lineart_for(taxon_id: str) -> tuple[str, str] | None:
    taxon_url = f"http://www.efloras.org/florataxon.aspx?flora_id=2&taxon_id={taxon_id}"
    html = get(taxon_url)
    obj_ids = re.findall(r"object_page\.aspx\?object_id=(\d+)&flora_id=2", html)
    if not obj_ids:
        return None
    obj_url = f"http://www.efloras.org/object_page.aspx?object_id={obj_ids[0]}&flora_id=2"
    obj_html = get(obj_url)
    imgs = re.findall(r"https://images\.mobot\.org/[^\"'\s]+\.(?:gif|jpg|jpeg|png)", obj_html)
    return (obj_url, imgs[0]) if imgs else None


def main() -> None:
    payload = json.loads((ROOT / "data" / "trees.json").read_text(encoding="utf-8"))
    species_map: dict[str, str] = {}
    for r in payload["records"]:
        species_map.setdefault(r["species"], r["scientificName"])

    out: dict[str, dict] = {}
    missing: list[str] = []
    total = len(species_map)

    for i, (sp, sci) in enumerate(species_map.items(), 1):
        name = clean_sci(sci)
        genus = name.split()[0] if name else ""
        rec = {"scientificName": sci}
        try:
            tid = search_taxon(name)
            if not tid and genus:
                tid = search_taxon(genus)
            if tid:
                found = lineart_for(tid)
                if found:
                    obj_url, img = found
                    rec.update({"focTaxonId": tid, "taxonUrl": f"http://www.efloras.org/florataxon.aspx?flora_id=2&taxon_id={tid}", "illustrationUrl": obj_url, "imageUrl": img})
                    out[sp] = rec
                    print(f"[{i}/{total}] {sp}  ✓ {img.split('/')[-1]}", flush=True)
                else:
                    missing.append(sp)
                    print(f"[{i}/{total}] {sp}  ✗ (taxon 无 Illustration)", flush=True)
            else:
                missing.append(sp)
                print(f"[{i}/{total}] {sp}  ✗ (FOC 无匹配，学名: {name})", flush=True)
        except Exception as exc:  # noqa: BLE001
            missing.append(sp)
            print(f"[{i}/{total}] {sp}  ! 失败 ({exc})", flush=True)
        time.sleep(1.0)

    (ROOT / "data" / "foc-lineart.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone: {len(out)}/{total} 有墨线图；缺失 {len(missing)} 个：")
    print("  " + "、".join(missing))


if __name__ == "__main__":
    main()
