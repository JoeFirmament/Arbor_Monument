#!/usr/bin/env python3
"""Fetch public-domain botanical plates from the Biodiversity Heritage Library.

Requires a BHL API key (https://www.biodiversitylibrary.org/getapikey.aspx).
Provide it via the BHL_API_KEY environment variable or a project-local `.env`
file (gitignored). Only plates with a safely reusable rights status are kept
(public domain / no-known-copyright / CC0 / CC BY / CC BY-SA); in-copyright,
-NC and -ND material is skipped because the site publishes publicly.

Output: data/species-plates.bhl.json  (species -> candidate plates)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://www.biodiversitylibrary.org/api3"
HEADERS = {"User-Agent": "SuzhouTreesBot/1.0 (botanical plate enrichment)"}

DELAY = 0.3
MAX_PARTS = 4


def load_key() -> str:
    key = os.environ.get("BHL_API_KEY", "").strip()
    if key:
        return key
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("BHL_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("Set BHL_API_KEY env var or add BHL_API_KEY=... to .env")


def api_get(params: dict) -> dict:
    params = {**params, "apikey": KEY, "format": "json"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.load(resp)


def is_reusable(rights: str, license_url: str) -> bool:
    r = (rights or "").lower()
    l = (license_url or "").lower()
    if "public domain" in r or "no known copyright" in r or "not in copyright" in r:
        return True
    if l:
        if "publicdomain" in l or "cc0" in l:
            return True
        if "nc" in l or "nd" in l:
            return False
        if "licenses/by" in l or "/by/" in l or "by-sa" in l:
            return True
    return False


def clean_scientific(raw: str) -> str:
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", (raw or "").strip())
    out = [t for t in s.split() if t and not (t.endswith(".") and len(t) <= 6)]
    return " ".join(out)


def find_plates(scientific: str, chinese: str) -> list[dict]:
    plates: list[dict] = []
    queries = [scientific]
    if scientific and " " in scientific:
        queries.append(scientific.split()[0])
    for q in queries:
        try:
            pub = api_get({"op": "PublicationSearch", "searchterm": q, "searchtype": "C"})
        except Exception as exc:  # noqa: BLE001
            print(f"    ! search '{q}' failed: {exc}", file=sys.stderr)
            continue
        results = pub.get("Result") or []
        # Prefer dedicated articles ("FoundIn: Metadata") over generic full-text hits.
        parts = [r for r in results if r.get("BHLType") == "Part"]
        parts.sort(key=lambda r: 0 if r.get("FoundIn") == "Metadata" else 1)
        for part in parts[:MAX_PARTS]:
            pid = part.get("PartID")
            if not pid:
                continue
            try:
                meta = api_get({"op": "GetPartMetadata", "id": pid})
            except Exception as exc:  # noqa: BLE001
                print(f"    ! part {pid} failed: {exc}", file=sys.stderr)
                continue
            rows = meta.get("Result") or []
            if not rows:
                continue
            m = rows[0]
            if not is_reusable(m.get("RightsStatus", ""), m.get("LicenseUrl", "")):
                continue
            start_page = m.get("StartPageID")
            if not start_page:
                continue
            try:
                page = api_get({"op": "GetPageMetadata", "pageid": start_page, "ocr": "f", "names": "f"})
            except Exception as exc:  # noqa: BLE001
                continue
            prows = page.get("Result") or []
            if not prows:
                continue
            p = prows[0]
            types = [t.get("PageTypeName") for t in p.get("PageTypes", [])]
            if "Illustration" not in types:
                continue
            plates.append(
                {
                    "title": m.get("Title") or part.get("Title") or chinese,
                    "container": m.get("ContainerTitle", ""),
                    "year": m.get("Date", "") or p.get("Year", ""),
                    "thumbUrl": p.get("ThumbnailUrl", ""),
                    "fullUrl": p.get("FullSizeImageUrl", ""),
                    "pageUrl": p.get("PageUrl", ""),
                    "license": "Public domain" if "public domain" in (m.get("RightsStatus") or "").lower()
                               else (m.get("LicenseUrl") or "").rsplit("/", 1)[-1].replace("-", " ").upper(),
                    "rights": m.get("RightsStatus", ""),
                }
            )
            break  # first reusable illustration is enough for this part
            time.sleep(DELAY)
        if plates:
            break
        time.sleep(DELAY)
    return plates


def main() -> None:
    payload = json.loads((ROOT / "data" / "trees.json").read_text(encoding="utf-8"))
    species_map: dict[str, str] = {}
    for record in payload["records"]:
        species_map.setdefault(record["species"], record["scientificName"])

    out: dict[str, list[dict]] = {}
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(species_map)
    items = list(species_map.items())[:limit]
    total = len(items)
    for i, (species, scientific) in enumerate(items, 1):
        sci = clean_scientific(scientific)
        plates = find_plates(sci, species)
        if plates:
            out[species] = plates
        print(f"[{i}/{total}] {species}  {len(plates)} plate(s)"
              f"{('  -> ' + plates[0]['title'][:40]) if plates else ''}", flush=True)
        time.sleep(DELAY)

    (ROOT / "data" / "species-plates.bhl.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nDone: {len(out)}/{total} species have a reusable BHL plate.")


if __name__ == "__main__":
    KEY = load_key()
    main()
