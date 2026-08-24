#!/usr/bin/env python3
"""Fetch openly-licensed species illustrations from Wikimedia Commons.

Builds a `species -> image` lookup for the Suzhou ancient-tree explorer.
Only files with a reusable license (public domain / CC0 / CC BY / CC BY-SA)
are kept, and every record carries its artist + credit so the UI can show
attribution. Writes two files for review:

  data/species-images.raw.json   every candidate with full metadata
  data/species-images.auto.json  the single best auto-picked image per species
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {
    "User-Agent": "SuzhouTreesBot/1.0 (data enrichment; contact via project repo)"
}

ALLOWED = re.compile(r"^(pd|cc0|cc-by|cc-by-sa)", re.IGNORECASE)


def clean_scientific(raw: str) -> str:
    """Best-effort removal of authority + de-glueing of run-together names."""
    s = (raw or "").strip()
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)  # split CamelCase / glued words
    tokens = [t for t in s.split() if t]
    out = []
    for t in tokens:
        if t.endswith(".") and len(t) <= 6:  # authority abbreviations (L., Pers., Thunb.)
            continue
        if re.fullmatch(r"[A-Z]", t):
            continue
        out.append(t)
    return " ".join(out)


def api_get(params: dict) -> dict:
    params = {**params, "format": "json", "origin": "*"}
    url = API + "?" + urllib.parse.urlencode(params)
    last_exc: Exception | None = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code == 429:
                retry_after = exc.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** (attempt + 1)
                time.sleep(wait)
                continue
            raise
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            time.sleep(2 ** (attempt + 1))
    raise last_exc  # type: ignore[misc]


def search(query: str, limit: int = 10) -> list[dict]:
    data = api_get(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": "6",
            "gsrlimit": str(limit),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": "640",
        }
    )
    pages = (data.get("query") or {}).get("pages") or {}
    results = []
    for page in pages.values():
        ii = (page.get("imageinfo") or [{}])[0]
        if not ii:
            continue
        em = ii.get("extmetadata") or {}
        results.append(
            {
                "title": page.get("title", ""),
                "thumbUrl": (ii.get("thumburl") or ii.get("url") or "").split("?")[0],
                "pageUrl": ii.get("descriptionurl", ""),
                "license": (em.get("License") or {}).get("value", ""),
                "licenseShort": (em.get("LicenseShortName") or {}).get("value", ""),
                "artist": re.sub(r"<[^>]+>", "", (em.get("Artist") or {}).get("value", "")).strip(),
                "credit": re.sub(r"<[^>]+>", "", (em.get("Credit") or {}).get("value", "")).strip(),
                "categories": (em.get("Categories") or {}).get("value", ""),
            }
        )
    return results


def score(candidate: dict, genus: str = "", epithet: str = "") -> int:
    lic = (candidate.get("license") or "").lower()
    if not ALLOWED.match(lic) or "nc" in lic or "nd" in lic:
        return -10
    s = 3 if lic in ("pd", "cc0") else (2 if lic.startswith("cc-by") and "sa" not in lic else 1)
    blob = f"{candidate['title']} {candidate['categories']}".lower()
    g = genus.lower()
    e = epithet.lower()
    if g and g in blob:
        s += 4
    if e and e in blob:
        s += 2
    for kw in ("illustration", "plate", "botanical", "flora", "köhler", "kohler", "engraving"):
        if kw in blob:
            s += 2
    return s


def main() -> None:
    payload = json.loads((ROOT / "data" / "trees.json").read_text(encoding="utf-8"))
    species_map: dict[str, str] = {}
    for record in payload["records"]:
        species_map.setdefault(record["species"], record["scientificName"])

    raw: dict[str, dict] = {}
    auto: dict[str, dict] = {}
    total = len(species_map)
    for i, (species, scientific) in enumerate(species_map.items(), 1):
        sci = clean_scientific(scientific)
        parts = sci.split()
        genus = parts[0] if parts else ""
        epithet = parts[1] if len(parts) > 1 else ""
        queries = []
        if sci and " " in sci:
            queries.append(sci)
        if genus:
            queries.append(genus)
        queries.append(species)

        candidates: list[dict] = []
        for q in queries:
            if any(score(c, genus, epithet) >= 7 for c in candidates):
                break
            try:
                found = search(q)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! {species}: search failed ({exc})", file=sys.stderr)
                found = []
            seen = {c["title"] for c in candidates}
            for c in found:
                if c["title"] not in seen and c["thumbUrl"]:
                    seen.add(c["title"])
                    candidates.append(c)
            time.sleep(0.6)

        best = max(candidates, key=lambda c: score(c, genus, epithet), default=None)
        raw[species] = {
            "scientificName": scientific,
            "candidates": sorted(candidates, key=lambda c: score(c, genus, epithet), reverse=True),
        }
        if best and score(best, genus, epithet) >= 0:
            auto[species] = {**best, "species": species, "scientificName": scientific}
        print(f"[{i}/{total}] {species}  {len(candidates)} candidates  "
              f"{('-> ' + best['title']) if best and score(best) >= 0 else '-> (none)'}")

    (ROOT / "data" / "species-images.raw.json").write_text(
        json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (ROOT / "data" / "species-images.auto.json").write_text(
        json.dumps(auto, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nDone: {len(auto)}/{total} species have a usable image.")


if __name__ == "__main__":
    main()
