#!/usr/bin/env python3
"""Download species images locally and build a media-schema-compliant catalog.

Reads data/species-images.json (100 species -> Commons image metadata).
Downloads each display image to public/images/species/ (resumable, with backoff).

Outputs:
  public/images/species/<slug>.<ext>   local display images (whatever succeeded)
  data/species-media.json              catalog aligned to data/media.schema.json
                                       (only assets whose file actually landed locally)
  data/species-images.json             frontend payload: ALWAYS all 100 species;
  public/data/species-images.json       thumbUrl = local path when downloaded,
                                       otherwise falls back to the remote Commons URL.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = ROOT / "public" / "images" / "species"
HEADERS = {"User-Agent": "SuzhouTreesBot/1.0 (contact: maintainer@example.invalid; species media download, low rate)"}

TODAY = datetime.date.today().isoformat()


def clean_sci(raw: str) -> str:
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", (raw or "").strip())
    out = [t for t in s.split() if t and not (t.endswith(".") and len(t) <= 6)]
    return " ".join(out)


def slugify(sci: str, used: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", clean_sci(sci).lower()).strip("_") or "species"
    cand = f"med_species_{base}"
    i = 2
    while cand in used:
        cand = f"med_species_{base}_{i}"
        i += 1
    used.add(cand)
    return cand


def license_code(lic: str) -> str:
    l = (lic or "").strip().lower()
    if "public domain" in l or l == "pd" or "pdm" in l:
        return "PDM-1.0"
    if "cc0" in l:
        return "CC0-1.0"
    m = re.search(r"cc[ -]?by[ -]?sa[ -]?(\d\.\d)", l)
    if m:
        return f"CC-BY-SA-{m.group(1)}"
    m = re.search(r"cc[ -]?by[ -]?(\d\.\d)", l)
    if m:
        return f"CC-BY-{m.group(1)}"
    return "UNKNOWN"


def license_url(code: str) -> str:
    if code == "CC0-1.0":
        return "https://creativecommons.org/publicdomain/zero/1.0/"
    if code == "PDM-1.0":
        return "https://creativecommons.org/publicdomain/mark/1.0/"
    m = re.match(r"CC-BY(-SA)?-(\d\.\d)", code)
    if m:
        sa = "-sa" if m.group(1) else ""
        return f"https://creativecommons.org/licenses/by{sa}/{m.group(2)}/"
    return ""


def classify_kind(title: str, categories: str) -> str:
    blob = f"{title} {categories}".lower()
    for kw in ("illustration", "plate", "drawing", "köhler", "kohler", "blanco",
               "redout", "engraving", "herbarium", "painting", "sylva", "botanical",
               "wellcome", "gartenflora", "naturalis"):
        if kw in blob:
            return "illustration"
    return "photograph"


def ext_for(url: str, ctype: str) -> str:
    path_ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if path_ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".tif", ".tiff"):
        return ".jpg" if path_ext == ".jpeg" else path_ext
    return {"image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
            "image/svg+xml": ".svg", "image/jpeg": ".jpg"}.get(ctype, ".jpg")


def download(url: str, dest: Path) -> tuple[int, str]:
    last_exc: Exception | None = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
                ctype = (resp.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
            dest.write_bytes(data)
            return len(data), ctype
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code == 429:
                ra = exc.headers.get("Retry-After")
                wait = float(ra) if ra and ra.isdigit() else 12 * (attempt + 1)
                print(f"    429 -> retry in {wait:.0f}s", flush=True)
                time.sleep(wait)
                continue
            raise
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            time.sleep(6 * (attempt + 1))
    raise last_exc  # type: ignore[misc]


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    final = json.loads((ROOT / "data" / "species-images.json").read_text(encoding="utf-8"))
    auto = json.loads((ROOT / "data" / "species-images.auto.json").read_text(encoding="utf-8"))

    used_ids: set[str] = set()
    assets: list[dict] = []
    updated: dict[str, dict] = {}
    total = len(final)

    for i, (species, rec) in enumerate(final.items(), 1):
        sci = clean_sci(rec.get("scientificName", ""))
        aid = slugify(rec.get("scientificName", ""), used_ids)
        categories = (auto.get(species) or {}).get("categories", "")
        kind = classify_kind(rec.get("title", ""), categories)
        code = license_code(rec.get("license", ""))
        artist = (rec.get("artist") or "").strip() or "Unknown author"
        license_short = (rec.get("license") or "").strip()
        credit = (rec.get("credit") or "").strip()
        remote = rec.get("thumbUrl", "")

        # Resolve a local file if already downloaded; otherwise download it.
        local_path: str | None = None
        existing = sorted(IMG_DIR.glob(f"{aid}.*"))
        if existing:
            local_path = f"/images/species/{existing[0].name}"
        else:
            ext = ext_for(remote, "image/jpeg")
            dest = IMG_DIR / f"{aid}{ext}"
            try:
                nbytes, ctype = download(remote, dest)
                ext = ext_for(remote, ctype)
                if dest.suffix != ext:
                    dest = dest.with_suffix(ext)
                local_path = f"/images/species/{dest.name}"
                print(f"    downloaded {dest.name} ({nbytes // 1024}KB)", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! {species}: download failed, keeping remote URL ({exc})",
                      file=sys.stderr, flush=True)

        # Frontend payload: always include the species; prefer local, fallback remote.
        updated[species] = {
            "species": species,
            "scientificName": rec.get("scientificName", ""),
            "title": rec.get("title", ""),
            "thumbUrl": local_path or remote,
            "remoteUrl": remote,
            "pageUrl": rec.get("pageUrl", ""),
            "license": license_short,
            "artist": artist,
            "credit": credit,
        }

        # Media catalog: only when a local file actually exists.
        if local_path:
            dest_path = ROOT / "public" / local_path.lstrip("/")
            sha = hashlib.sha256(dest_path.read_bytes()).hexdigest()
            nbytes = dest_path.stat().st_size
            assets.append({
                "id": aid,
                "kind": kind,
                "scope": "species-reference",
                "title": species,
                "caption": f"{species}（{sci}）的{('图版' if kind == 'illustration' else '照片')}",
                "altText": f"{species} {sci} {'图版' if kind == 'illustration' else '照片'}",
                "scientificName": rec.get("scientificName", ""),
                "links": [{
                    "entityType": "species",
                    "entityId": re.sub(r"[^a-z0-9]+", "_", sci.lower()).strip("_") or "species",
                    "role": "overview",
                    "certainty": "confirmed",
                }],
                "files": [{
                    "variant": "display",
                    "path": local_path,
                    "mimeType": "image/jpeg" if dest_path.suffix.lower() in (".jpg", ".jpeg")
                                else f"image/{dest_path.suffix.lstrip('.').lower()}",
                    "bytes": nbytes,
                    "sha256": sha,
                }],
                "source": {
                    "provider": "wikimedia-commons",
                    "pageUrl": rec.get("pageUrl", ""),
                    "originalUrl": remote,
                    "retrievedAt": TODAY,
                },
                "rights": {
                    "code": code,
                    "licenseUrl": license_url(code),
                    "creator": artist,
                    "creditLine": f"{artist} · Wikimedia Commons · {license_short}",
                    "attributionRequired": code not in ("CC0-1.0", "PDM-1.0"),
                    "commercialUse": True,
                    "derivatives": "share-alike" if "SA" in code else ("allowed" if code != "UNKNOWN" else "unknown"),
                    "verifiedAt": TODAY,
                },
                "people": {"identifiable": False, "consentStatus": "not-needed"},
                "workflow": {"status": "published", "sortOrder": i},
            })

        print(f"[{i}/{total}] {species}  {kind:12s}  "
              f"{'local' if local_path else 'remote'}  {aid}", flush=True)
        time.sleep(1.5)

    catalog = {"schemaVersion": "1.0.0", "assets": assets}
    (ROOT / "data" / "species-media.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    payload = json.dumps(updated, ensure_ascii=False, indent=2)
    (ROOT / "data" / "species-images.json").write_text(payload, encoding="utf-8")
    (ROOT / "public" / "data" / "species-images.json").write_text(payload, encoding="utf-8")
    print(f"\nDone: {len(assets)} local images, {len(updated)} species in frontend payload.")


if __name__ == "__main__":
    main()
