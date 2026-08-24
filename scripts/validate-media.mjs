import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "data/media.json");
const treePath = resolve(root, "data/trees.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const trees = JSON.parse(readFileSync(treePath, "utf8"));
const treeIds = new Set(trees.records.map((tree) => tree.uid));
const ids = new Set();
const errors = [];

if (catalog.schemaVersion !== "1.0.0" || !Array.isArray(catalog.assets)) {
  errors.push("媒体目录必须包含 schemaVersion=1.0.0 和 assets 数组");
}

for (const asset of catalog.assets ?? []) {
  if (!/^med_[a-z0-9][a-z0-9_-]*$/.test(asset.id ?? "")) {
    errors.push(`${asset.id ?? "<无 id>"}: id 格式不正确`);
  }
  if (ids.has(asset.id)) errors.push(`${asset.id}: id 重复`);
  ids.add(asset.id);

  if (!asset.title || !asset.altText) {
    errors.push(`${asset.id}: title 和 altText 不能为空`);
  }
  if (!Array.isArray(asset.links) || asset.links.length === 0) {
    errors.push(`${asset.id}: 至少需要一个关联对象`);
  }
  for (const link of asset.links ?? []) {
    if (link.entityType === "tree" && !treeIds.has(link.entityId)) {
      errors.push(`${asset.id}: 未找到古树 ${link.entityId}`);
    }
    if (asset.scope === "individual-tree" && link.entityType === "tree" && link.certainty === "contextual") {
      errors.push(`${asset.id}: 个体照片不能只以 contextual 方式关联古树`);
    }
  }

  if (!Array.isArray(asset.files) || asset.files.length === 0) {
    errors.push(`${asset.id}: 至少需要一个文件`);
  }
  for (const file of asset.files ?? []) {
    if (file.path?.startsWith("/")) {
      const publicFile = resolve(root, "public", file.path.slice(1));
      if (!existsSync(publicFile)) errors.push(`${asset.id}: 文件不存在 ${file.path}`);
    }
  }

  if (!asset.rights?.code || !asset.rights?.verifiedAt) {
    errors.push(`${asset.id}: 缺少许可代码或核验日期`);
  }
  if (asset.rights?.attributionRequired && !asset.rights?.creditLine) {
    errors.push(`${asset.id}: 需要署名但 creditLine 为空`);
  }
  if (asset.people?.identifiable && ["unknown", "restricted"].includes(asset.people.consentStatus)) {
    if (asset.workflow?.status === "published") {
      errors.push(`${asset.id}: 可识别人物的同意状态不允许直接发布`);
    }
  }
}

if (errors.length) {
  console.error(`媒体目录校验失败（${errors.length} 项）`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`媒体目录校验通过：${catalog.assets.length} 个素材，${treeIds.size} 株古树可关联`);
