#!/usr/bin/env python3
"""Build a strict, private-research gallery from the reviewed eFloras manifest."""

from __future__ import annotations

import hashlib
import html
import json
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "efloras-illustrations.json"
PUBLIC_DIR = ROOT / "public" / "images" / "species" / "lineart"
BACKUP_DIR = ROOT / "data" / "rejected" / "lineart-gallery-legacy-2026-08-16"
REVIEW_PATH = ROOT / "data" / "efloras-lineart.review.json"

# A species-level plate cannot prove a named cultivar or infraspecific form.
# Keep these available for comparison, but out of the approved gallery.
PARENT_TAXON_ONLY = {
    "龙柏": "名录为栽培品种 ‘Kaizuka’，eFloras 图版只到 Juniperus chinensis 物种级。",
    "龙爪槐": "名录为垂枝栽培品种 ‘Pendula’，eFloras 图版只到 Sophora japonica 物种级。",
    "琼花": "名录名称与图版处理层级不同，当前图版为 Viburnum macrocephalum，需人工确认变种/异名关系。",
    "银薇": "名录为白花变型 f. alba，eFloras 图版只到 Lagerstroemia indica 物种级。",
}


def valid_image(path: Path, expected_hash: str) -> bool:
    if not path.exists():
        return False
    body = path.read_bytes()
    magic_ok = body.startswith((b"GIF87a", b"GIF89a", b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"II*\x00", b"MM\x00*"))
    return magic_ok and hashlib.sha256(body).hexdigest() == expected_hash


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    approved: list[dict] = []
    rejected: list[dict] = []

    for record in data["records"]:
        if record["species"] in PARENT_TAXON_ONLY:
            rejected.append({
                "species": record["species"],
                "status": "parent-taxon-only",
                "reason": PARENT_TAXON_ONLY[record["species"]],
                "matchedName": record.get("matchedName"),
                "treatmentUrl": record.get("treatmentUrl"),
            })
            continue
        if record["status"] != "downloaded":
            rejected.append({
                "species": record["species"],
                "status": record["status"],
                "reason": "eFloras 未提供可核验的物种级 Illustration。",
                "matchedName": record.get("matchedName"),
                "treatmentUrl": record.get("treatmentUrl"),
            })
            continue
        for illustration in record.get("illustrations", []):
            source = ROOT / illustration["localPath"]
            if not valid_image(source, illustration["sha256"]):
                rejected.append({
                    "species": record["species"],
                    "status": "invalid-file",
                    "reason": "下载内容不是有效图像，或文件哈希与清单不一致。",
                    "objectUrl": illustration["objectUrl"],
                })
                continue
            approved.append({"record": record, "illustration": illustration, "source": source})

    # Preserve the user's previous downloads instead of deleting them.
    if PUBLIC_DIR.exists() and not BACKUP_DIR.exists():
        BACKUP_DIR.parent.mkdir(parents=True, exist_ok=True)
        PUBLIC_DIR.rename(BACKUP_DIR)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for item in approved:
        illustration = item["illustration"]
        key = (illustration["sha256"], item["record"]["treatmentName"])
        grouped[key].append(item)

    cards = []
    copied = set()
    for index, items in enumerate(sorted(grouped.values(), key=lambda group: group[0]["record"]["species"]), 1):
        first = items[0]
        illustration = first["illustration"]
        source = first["source"]
        filename = f"{illustration['objectId']}-{illustration['sha256'][:10]}{source.suffix.lower()}"
        if filename not in copied:
            shutil.copy2(source, PUBLIC_DIR / filename)
            copied.add(filename)
        names = list(dict.fromkeys(item["record"]["species"] for item in items))
        catalog_names = " / ".join(names)
        matched = first["record"]["treatmentName"]
        cards.append(
            f'<figure class="card"><a href="{esc(illustration["objectUrl"])}" target="_blank" rel="noreferrer">'
            f'<img src="{esc(filename)}" loading="lazy" alt="{esc(catalog_names + "，" + matched + " 墨线图")}"></a>'
            f'<figcaption><strong>{esc(catalog_names)}</strong><em>{esc(matched)}</em>'
            f'<span>物种页与图版对象页一致</span><small>Object {esc(illustration["objectId"])} · 仅限私人研究</small>'
            f'</figcaption></figure>'
        )

    review = {
        "schemaVersion": "1.0.0",
        "approvedSpeciesCount": len({item["record"]["species"] for item in approved}),
        "approvedIllustrationCount": len(grouped),
        "excluded": rejected,
    }
    REVIEW_PATH.write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")

    gallery = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flora of China 墨线图 · 严格核验</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#f3efe6;color:#27352f;font:14px/1.55 "PingFang SC","Microsoft YaHei",sans-serif}}header,.note,.summary{{max-width:1180px;margin-left:auto;margin-right:auto}}header{{padding:32px 28px 10px}}h1{{margin:0;font:600 27px "Songti SC",serif;letter-spacing:.06em}}header p{{margin:7px 0 0;color:#68736d}}.note{{padding:11px 14px;background:#e8dfcf;border-left:3px solid #9d6e37;color:#6d5234}}.summary{{padding:14px 28px 0;color:#59665f}}.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;max-width:1180px;margin:0 auto;padding:16px 28px 60px}}.card{{margin:0;background:#fffdf8;border:1px solid #d9d3c8;display:flex;flex-direction:column}}.card img{{width:100%;height:260px;object-fit:contain;background:#fff}}.card figcaption{{padding:10px 12px 12px;display:flex;flex-direction:column;gap:2px}}.card strong{{font:600 15px "Songti SC",serif}}.card em{{font:italic 12px Georgia,serif;color:#5f6c65}}.card span{{font-size:11px;color:#63776d}}.card small{{font-size:10px;color:#8a8e89}}@media(max-width:560px){{.grid{{grid-template-columns:1fr 1fr;padding:14px}}.card img{{height:200px}}header{{padding:24px 16px 10px}}.note{{margin:0 16px}}}}
</style></head><body><header><h1>Flora of China 墨线图</h1><p>严格核验版：名录学名 → FOC 物种页 → Illustration 对象页 → 图像文件</p></header><div class="note">私人研究使用。未把“同属近似种”或“栽培品种的基准种”冒充为精确图版；版权归 Science Press 与 Missouri Botanical Garden Press。</div><div class="summary">{review["approvedSpeciesCount"]} 个名录树种 · {review["approvedIllustrationCount"]} 张去重图版 · {len(rejected)} 项未展示或待复核</div><main class="grid">{''.join(cards)}</main></body></html>'''
    (PUBLIC_DIR / "gallery.html").write_text(gallery, encoding="utf-8")
    print(f"Built {len(cards)} reviewed cards; excluded {len(rejected)} records")


if __name__ == "__main__":
    main()
