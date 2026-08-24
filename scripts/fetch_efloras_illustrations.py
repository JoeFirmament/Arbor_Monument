#!/usr/bin/env python3
"""Match Suzhou catalogue species to Flora of China line illustrations.

Files are stored under data/source-images rather than public/ because Flora of
China illustrations are not advertised as open-license assets. The manifest
keeps the treatment/object/image URLs needed for identity and rights review.
"""

from __future__ import annotations

import hashlib
import html
import json
import mimetypes
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "source-images" / "efloras-foc"
CACHE_DIR = ROOT / "data" / "source-cache" / "efloras-foc"
MANIFEST_PATH = ROOT / "data" / "efloras-illustrations.json"
BASE = "http://www.efloras.org/"
USER_AGENT = "SuzhouAncientTreesResearch/1.0 (botanical illustration matching)"

# Current catalogue names that Flora of China treats under an older genus or
# a different rank. The value is used only as an additional search term; the
# returned treatment name and Chinese name are still recorded for review.
SEARCH_OVERRIDES = {
    "香樟": "Cinnamomum camphora",
    "龙柏": "Juniperus chinensis",
    "玉兰": "Magnolia denudata",
    "二乔玉兰": "Magnolia soulangeana",
    "龙爪槐": "Sophora japonica",
    "槐": "Sophora japonica",
    "杨梅": "Myrica rubra",
    "侧柏": "Thuja orientalis",
    "厚萼凌霄": "Campsis radicans",
    "牡丹": "Paeonia suffruticosa",
    "梅": "Armeniaca mume",
    "琼花": "Viburnum macrocephalum",
    "青冈": "Cyclobalanopsis glauca",
    "含笑": "Michelia figo",
    "白栎": "Quercus fabri",
    "麻栎": "Quercus acutissima",
    "木瓜": "Chaenomeles sinensis",
    "单体红山茶": "Camellia uraku",
    "二乔玉兰": "Magnolia soulangeana",
    "臭椿": "Ailanthus altissima",
}


def strip_tags(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip()


def binomial(value: str) -> str:
    value = re.sub(r"([a-z])([A-Z])", r"\1 \2", value or "")
    match = re.match(r"\s*([A-Z][a-z-]+)\s+([a-z][a-z-]+)", value)
    return f"{match.group(1)} {match.group(2)}" if match else ""


def slug(value: str) -> str:
    encoded = hashlib.sha1(value.encode("utf-8")).hexdigest()[:8]
    readable = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:48]
    return f"{readable or 'taxon'}-{encoded}"


def detected_image_extension(body: bytes) -> str | None:
    if body.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if body.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if body.startswith((b"II*\x00", b"MM\x00*")):
        return ".tif"
    return None


def fetch(url: str, binary: bool = False) -> bytes:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_path = CACHE_DIR / (key + (".bin" if binary else ".html"))
    if cache_path.exists():
        return cache_path.read_bytes()
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=18) as response:
                body = response.read()
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(body)
            return body
        except (OSError, socket.timeout) as error:
            last_error = error
            if isinstance(error, urllib.error.HTTPError) and error.code == 404:
                break
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"Could not fetch {url}: {last_error}")


def search_candidates(term: str) -> list[dict]:
    url = BASE + "browse.aspx?" + urllib.parse.urlencode({"flora_id": 2, "name_str": term})
    page = fetch(url).decode("utf-8", "replace")
    rows = re.findall(r"<TR class='underline'>(.*?)</TR>", page, flags=re.I | re.S)
    found = []
    for row in rows:
        link = re.search(
            r"HREF='florataxon\.aspx\?flora_id=2(?:&|&amp;)taxon_id=(\d+)'[^>]*>(.*?)</A>",
            row,
            flags=re.I | re.S,
        )
        if not link:
            continue
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.I | re.S)
        found.append({
            "taxonId": link.group(1),
            "name": strip_tags(link.group(2)),
            "rowText": " | ".join(strip_tags(cell) for cell in cells),
        })
    return found


def choose_candidate(species: str, scientific: str) -> tuple[dict | None, str]:
    terms = []
    for term in (SEARCH_OVERRIDES.get(species), binomial(scientific), species):
        if term and term not in terms:
            terms.append(term)
    expected = {binomial(scientific).lower(), (SEARCH_OVERRIDES.get(species) or "").lower()}
    fallback: dict | None = None
    for term in terms:
        candidates = search_candidates(term)
        for candidate in candidates:
            if candidate["name"].lower() in expected or species in candidate["rowText"]:
                return candidate, term
        if len(candidates) == 1 and fallback is None:
            fallback = candidates[0]
    return fallback, terms[-1] if terms else ""


def treatment_data(taxon_id: str) -> dict:
    url = BASE + f"florataxon.aspx?flora_id=2&taxon_id={taxon_id}"
    page = fetch(url).decode("utf-8", "replace")
    title = re.search(r"<title>(.*?)\s+in Flora of China", page, flags=re.I | re.S)
    object_ids = re.findall(
        r"HREF='object_page\.aspx\?object_id=(\d+)(?:&|&amp;)flora_id=2'[^>]*TITLE='Illustration'",
        page,
        flags=re.I | re.S,
    )
    return {
        "treatmentUrl": url,
        "treatmentName": strip_tags(title.group(1)) if title else "",
        "objectIds": list(dict.fromkeys(object_ids)),
    }


def illustration_data(object_id: str) -> dict | None:
    url = BASE + f"object_page.aspx?object_id={object_id}&flora_id=2"
    page = fetch(url).decode("utf-8", "replace")
    image = re.search(r'<img[^>]+id="imgInset"[^>]+src="([^"]+)"', page, flags=re.I | re.S)
    title = re.search(r"<title>Illustration:\s*(.*?)</title>", page, flags=re.I | re.S)
    if not image:
        return None
    return {
        "objectId": object_id,
        "objectUrl": url,
        "objectTaxonName": strip_tags(title.group(1)) if title else "",
        "imageUrl": html.unescape(image.group(1)),
    }


def save_manifest(records: list[dict]) -> None:
    payload = {
        "schemaVersion": "1.0.0",
        "source": "Flora of China @ eFloras",
        "sourceUrl": "http://www.efloras.org/flora_page.aspx?flora_id=2",
        "rightsStatus": "permission-needed-for-publication",
        "rightsNote": "Stored outside public/ for research and identity review; do not publish until reuse permission is confirmed.",
        "records": records,
    }
    MANIFEST_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    trees = json.loads((ROOT / "data" / "trees.json").read_text(encoding="utf-8"))
    unique: dict[str, str] = {}
    for tree in trees["records"]:
        unique.setdefault(tree["species"], tree["scientificName"])

    existing: dict[str, dict] = {}
    if MANIFEST_PATH.exists():
        previous = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        existing = {record["species"]: record for record in previous.get("records", [])}

    records: list[dict] = []
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for index, (species, scientific) in enumerate(unique.items(), 1):
        old = existing.get(species, {})
        old_files_valid = bool(old.get("illustrations")) and all(
            (ROOT / item["localPath"]).exists()
            and detected_image_extension((ROOT / item["localPath"]).read_bytes())
            for item in old.get("illustrations", [])
        )
        if old.get("status") == "no-illustration" or (old.get("status") == "downloaded" and old_files_valid):
            records.append(existing[species])
            print(f"[{index:03d}/{len(unique)}] {species}: cached {existing[species]['status']}", flush=True)
            continue
        record = {"species": species, "catalogScientificName": scientific}
        try:
            candidate, search_term = choose_candidate(species, scientific)
            record["searchTerm"] = search_term
            if not candidate:
                record["status"] = "taxon-not-found"
            else:
                record.update({"matchedTaxonId": candidate["taxonId"], "matchedName": candidate["name"]})
                treatment = treatment_data(candidate["taxonId"])
                record.update({k: v for k, v in treatment.items() if k != "objectIds"})
                illustrations = []
                image_errors = []
                for object_id in treatment["objectIds"]:
                    item = illustration_data(object_id)
                    if not item:
                        continue
                    try:
                        image_bytes = fetch(item["imageUrl"], binary=True)
                        detected_extension = detected_image_extension(image_bytes)
                        if not detected_extension:
                            raise RuntimeError("Source returned HTML or another non-image response")
                    except Exception as error:
                        image_errors.append({**item, "error": str(error)})
                        continue
                    extension = detected_extension
                    filename = f"{slug(species + '-' + item['objectId'])}{extension}"
                    destination = OUT_DIR / filename
                    destination.write_bytes(image_bytes)
                    illustrations.append({
                        **item,
                        "localPath": str(destination.relative_to(ROOT)),
                        "bytes": len(image_bytes),
                        "sha256": hashlib.sha256(image_bytes).hexdigest(),
                    })
                record["illustrations"] = illustrations
                if image_errors:
                    record["imageErrors"] = image_errors
                record["status"] = (
                    "downloaded" if illustrations
                    else "image-unavailable" if image_errors
                    else "no-illustration"
                )
        except Exception as error:  # keep the batch resumable on the old site
            record["status"] = "fetch-error"
            record["error"] = str(error)
        records.append(record)
        save_manifest(records + [old for name, old in existing.items() if name not in {r["species"] for r in records}])
        print(f"[{index:03d}/{len(unique)}] {species}: {record['status']}", flush=True)
        time.sleep(0.8)
    save_manifest(records)


if __name__ == "__main__":
    main()
