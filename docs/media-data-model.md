# “以树为碑”媒体数据设计

## 目标

媒体文件与古树名录分开管理。古树仍以 `trees.json` 中的 `uid` 为稳定编号；照片、插画、音频和地图各自拥有稳定的 `media id`，再通过关联记录连接。

这样可以支持：

- 一株树有多张照片；
- 一张合影里有多株树；
- 同一张物种图版供多株同种古树使用；
- 区分“具体个体”“同种参考”“地点环境”，避免误导；
- 保存作者、许可、修改记录、人物同意和审核状态；
- 先用静态 JSON，未来迁移到 SQLite/D1 与对象存储时不重做数据。

机器可读规范见 `data/media.schema.json`，当前目录见 `data/media.json`。

## 自己拍摄一张照片时要填写什么

最少填写以下内容：

1. `id`：永久不变，例如 `med_cang501_20261128_trunk_01`；
2. `scope`：如果确实拍到编号古树，使用 `individual-tree`；
3. `links`：关联 `tree`，`entityId` 填现有古树 `uid`，例如 `姑苏区-沧501`；
4. `role`：全景、树干、树皮、叶、花、果、根、损伤或季相；
5. `certainty`：看清树牌或现场核验后才填 `confirmed`；
6. `capture`：日期、摄影者、季节、方向和位置精度；
7. `files`：原图、展示图和缩略图的路径；
8. `rights`：自己的照片使用 `COPYRIGHT-HOLDER`，并写明权利人；
9. `people`：出现可识别人物时记录是否取得同意；
10. `workflow.status`：先保存为 `draft`，核验后再改为 `published`。

示例：

```json
{
  "id": "med_cang501_20261128_trunk_01",
  "kind": "photograph",
  "scope": "individual-tree",
  "title": "沧501西侧树干",
  "caption": "冬季落叶后，从西侧记录主干与雷击痕迹。",
  "altText": "文庙沧501银杏落叶后的主干及纵向裂痕",
  "scientificName": "Ginkgo biloba L.",
  "links": [
    {
      "entityType": "tree",
      "entityId": "姑苏区-沧501",
      "role": "trunk",
      "certainty": "confirmed"
    }
  ],
  "capture": {
    "takenAt": "2026-11-28T15:42:00+08:00",
    "datePrecision": "exact",
    "season": "autumn",
    "photographer": "你的名字",
    "direction": "east",
    "latitude": 31.287722,
    "longitude": 120.603324,
    "locationPrecision": "exact",
    "note": "现场树牌核对编号"
  },
  "files": [
    {
      "variant": "original",
      "path": "media/med_cang501_20261128_trunk_01/original.jpg",
      "mimeType": "image/jpeg",
      "width": 6048,
      "height": 4024,
      "sha256": "填写原图的64位sha256"
    },
    {
      "variant": "display",
      "path": "/media/med_cang501_20261128_trunk_01/display.webp",
      "mimeType": "image/webp",
      "width": 1920,
      "height": 1280
    }
  ],
  "source": {
    "provider": "self"
  },
  "rights": {
    "code": "COPYRIGHT-HOLDER",
    "creator": "你的名字",
    "copyrightHolder": "你的名字",
    "creditLine": "摄影：你的名字",
    "attributionRequired": true,
    "commercialUse": false,
    "derivatives": "allowed",
    "verifiedAt": "2026-11-28"
  },
  "edits": ["cropped", "resized", "color-adjusted"],
  "people": {
    "identifiable": false,
    "consentStatus": "not-needed"
  },
  "workflow": {
    "status": "draft",
    "featured": false,
    "sortOrder": 20
  }
}
```

## 文件目录

静态阶段建议使用：

```text
media-originals/                         不公开的原始文件与授权证明
  med_cang501_20261128_trunk_01/
    original.jpg
    consent.pdf

public/media/                            网页可访问的派生文件
  med_cang501_20261128_trunk_01/
    display.webp
    thumbnail.webp
```

不要把原始照片直接当网页图片。展示图可以压缩和去除 EXIF；原图保留完整信息用于档案核验。精确坐标是否公开，由 `locationPrecision` 控制。

## 未来数据库

当需要网页上传时：

- 图片和音频文件存对象存储；
- SQLite/D1 只存元数据与文件键；
- 上传操作先产生 `draft`；
- 审核后才进入公开页面；
- 原文件默认不公开，只公开 display/thumbnail 派生文件。

建议四张核心表：

```sql
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT,
  alt_text TEXT NOT NULL,
  description TEXT,
  scientific_name TEXT,
  source_provider TEXT NOT NULL,
  source_page_url TEXT,
  source_original_url TEXT,
  source_accession_number TEXT,
  source_retrieved_at TEXT,
  rights_code TEXT NOT NULL,
  rights_license_url TEXT,
  rights_creator TEXT NOT NULL,
  rights_holder TEXT,
  rights_credit_line TEXT NOT NULL,
  rights_attribution_required INTEGER NOT NULL DEFAULT 1,
  rights_commercial_use INTEGER NOT NULL DEFAULT 0,
  rights_derivatives TEXT NOT NULL DEFAULT 'unknown',
  rights_permission_document_key TEXT,
  rights_verified_at TEXT NOT NULL,
  taken_at TEXT,
  date_precision TEXT,
  season TEXT,
  photographer TEXT,
  direction TEXT,
  latitude REAL,
  longitude REAL,
  location_precision TEXT,
  people_identifiable INTEGER NOT NULL DEFAULT 0,
  people_consent_status TEXT NOT NULL DEFAULT 'not-needed',
  people_consent_document_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes INTEGER,
  sha256 TEXT,
  UNIQUE(media_id, variant)
);

CREATE TABLE media_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL,
  certainty TEXT NOT NULL,
  UNIQUE(media_id, entity_type, entity_id, role)
);

CREATE TABLE media_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  edit_type TEXT NOT NULL,
  note TEXT
);

CREATE INDEX media_links_entity_idx
  ON media_links(entity_type, entity_id, role);

CREATE INDEX media_assets_status_idx
  ON media_assets(status, featured, sort_order);
```

`media_links` 是整个设计的关键。页面查询某棵树时，以其 `uid` 查询关联媒体；查询树种科普时，以学名对应的 species id 查询，不需要在古树记录里不断增加 `photo1`、`photo2` 字段。

## 迁移顺序

1. 当前：人工将展示文件放入 `public/media`，登记到 `data/media.json`；
2. 素材增多后：增加一个仅本地使用的录入表单和校验工具；
3. 需要多人维护时：启用 SQLite/D1 保存元数据；
4. 需要网页上传时：启用对象存储、登录和审核队列；
5. 最后才考虑公开投稿，届时必须加入授权确认与人物隐私同意。
