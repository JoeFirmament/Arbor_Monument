import type { ReactElement } from "react";

export type IconName =
  | "ginkgo"
  | "conifer"
  | "broadleaf"
  | "camphor"
  | "elm"
  | "boxwood"
  | "maple"
  | "oak"
  | "holly"
  | "magnolia"
  | "osmanthus"
  | "flowering"
  | "fruit"
  | "vine";

// Bold single-colour botanical silhouettes on a 24×24 canvas.
// They inherit `currentColor`, so they sit inside the grade-coloured ring
// in the sidebar and stay monochrome (jade) like the existing 木 glyph.
const ICONS: Record<IconName, ReactElement> = {
  // 银杏 — the notched fan leaf, unmistakable identifier.
  ginkgo: (
    <>
      <path d="M12 3.4 5.1 6.9c-1.6.9-1.6 2.8 0 3.7l.8.4.9 2.6 2.5.5 2.7-.7 2.7.7 2.5-.5.9-2.6.8-.4c1.6-.9 1.6-2.8 0-3.7Z" />
      <rect x="11.25" y="14.4" width="1.5" height="7.6" rx=".75" />
    </>
  ),
  // 针叶类 — layered pine silhouette.
  conifer: (
    <path d="M12 2.2 15.7 7.9h-2.1l3.6 5.7h-2.4l4 6.2h-4.9v2.2H9.1v-2.2H4.2l4-6.2H5.8l3.6-5.7H7.3Z" />
  ),
  // 通用阔叶 — rounded crown on a trunk.
  broadleaf: (
    <>
      <circle cx="12" cy="8.6" r="5.4" />
      <path d="M10.6 13.6h2.8v3l.4 5a1 1 0 0 1-2 0l-.4-5Z" />
    </>
  ),
  // 樟/楠 — dense evergreen egg crown.
  camphor: (
    <>
      <path d="M12 2.6c3.7 1.2 6.1 4.6 6.1 8.5 0 3.7-2.6 6.8-6.1 8.5-3.5-1.7-6.1-4.8-6.1-8.5 0-3.9 2.4-7.3 6.1-8.5Z" />
      <path d="M10.4 19.2h3.2v2.4a1.6 1.6 0 0 1-3.2 0Z" />
    </>
  ),
  // 榉/榆/朴 — vase-shaped crown.
  elm: (
    <>
      <path d="M12 2.6C8 2.6 5 5 4.6 8.7c.7 2.9 2.2 4.4 4.2 5.4v1.7l-1.6 5.4h2.7c.9-2 1.5-3.4 2.1-4.3.6.9 1.2 2.3 2.1 4.3h2.7l-1.6-5.4v-1.7c2-1 3.5-2.5 4.2-5.4C19 5 16 2.6 12 2.6Z" />
    </>
  ),
  // 黄杨 — low dense mound shrub.
  boxwood: (
    <>
      <path d="M4.5 15.5a7.5 5.5 0 0 1 15 0Z" />
      <rect x="11.2" y="15" width="1.6" height="6" rx=".8" />
    </>
  ),
  // 枫/槭 — palmate (maple) leaf.
  maple: (
    <>
      <path d="M12 2 14 7l5-1-3.4 3.8L17 15l-5-2.6L7 15l1.4-5.2L5 6l5 1Z" />
      <rect x="11.2" y="13.4" width="1.6" height="7.6" rx=".8" />
    </>
  ),
  // 栎类 — lobed oak leaf.
  oak: (
    <>
      <path d="M12 2.8c-2.6 1.4-4.8 4-6.2 7.5-1.2 3 .2 5 1.8 5.6-.5 1.5-.9 2.8-1.1 4h2c.7-2.3 1.6-4.3 2.7-5.9.3 1.6.8 2.9 1.6 4.2.6-.7 1.1-1.5 1.4-2.4.7 1.3 1.6 2.5 2.7 3.6.5-1.5.8-3 .8-4.6 1.4 1.3 2.6 3 3.5 5.1h2c-.4-2.6-1-4.7-2-6.4 1.4-.3 2.4-1.3 2.6-2.9.2-1.8-.6-3.2-2.2-4.2-.6 1.4-1.5 2.4-2.9 3 .4-2.3.2-4.2-.5-5.6-1.3 1-2.3 2.2-2.9 3.5Z" />
    </>
  ),
  // 冬青/枸骨 — spiny holly leaf.
  holly: (
    <>
      <path d="M12 2.5c-1.4.6-3.6 2.6-4.9 5.3-.6 1.3-.3 2.3.4 3 .3.3.8.4 1.2.2-.3 1.4-.5 2.6-.5 3.8 1.2-.8 2.5-1.6 3.8-2.6.7 1.5 1.6 2.8 2.6 4.2.3-1.8.3-3.3.1-4.8 1.3 1 2.7 1.9 4 2.6-.2-2.3-.9-4.2-2-5.7.6-.3 1-.8 1.1-1.4.2-1.5-.6-2.8-2.2-3.7-.5 1.3-1.4 2.2-2.6 2.9Z" />
    </>
  ),
  // 玉兰 — large open cup flower.
  magnolia: (
    <>
      <path d="M12 3.4c1.8.6 4.4 2.4 5.4 4.5 1 2.1.6 4.1-.8 5.5.9 1.3 1.4 2.8 1.5 4.6-1.7-.3-3.2-1-4.5-2.1-.4 1.8-1 3.3-1.8 4.7-.8-1.4-1.4-2.9-1.8-4.7-1.3 1.1-2.8 1.8-4.5 2.1.1-1.8.6-3.3 1.5-4.6-1.4-1.4-1.8-3.4-.8-5.5 1-2.1 3.6-3.9 5.4-4.5Z" />
    </>
  ),
  // 桂花/木樨 — small four-petal flower cluster.
  osmanthus: (
    <>
      <path d="M8.4 7.2a2 2 0 1 0-2.8-2.8 2 2 0 0 0 2.8 2.8ZM17.2 7.2a2 2 0 1 0-2.8-2.8 2 2 0 0 0 2.8 2.8ZM8.4 13.2a2 2 0 1 0-2.8-2.8 2 2 0 0 0 2.8 2.8ZM17.2 13.2a2 2 0 1 0-2.8-2.8 2 2 0 0 0 2.8 2.8ZM12 11.2a2 2 0 1 0-2.8-2.8A2 2 0 0 0 12 11.2Z" />
      <path d="M12 10.2v8.4M11.2 18.6h1.6l-.8 2.9-.8-2.9Z" />
    </>
  ),
  // 花木 — five-petal blossom.
  flowering: (
    <path d="M12 3c1 1.8 2.8 2.6 4.6 3-1.4 1.6-2 3.3-2 5.2 1.9-.4 3.7-1.4 5.2-3-1.8 1-3.6 1.4-5.4 1.2.4 2 1.4 3.6 3 5-2.3.4-4.2-.2-5.4-1.7-.9 1.8-2.4 3.2-4.3 4.1.7-1.9 1-3.7.8-5.4-1.7.4-3.4.8-5 .2 1.8-1 3-2.3 3.7-3.9-.8-1.2-1.9-2.2-3.2-2.9 2.3-.3 4.2-1 5.7-2.4Z" />
  ),
  // 果木 — fruit with a leaf.
  fruit: (
    <>
      <path d="M12 4.6c2.4.6 4.9 2.5 6 5.3 1 2.5.3 4.8-1.4 6.2-.7 2-2.5 3.5-4.6 3.5s-3.9-1.5-4.6-3.5c-1.7-1.4-2.4-3.7-1.4-6.2 1.1-2.8 3.6-4.7 6-5.3Z" />
      <path d="M12 4.6c.2-1.3 1.5-2.2 3.4-2.8-.3 1.2-.9 2.1-1.8 2.7Z" />
    </>
  ),
  // 藤本 — trailing stem with leaves and a hanging raceme.
  vine: (
    <>
      <path d="M6.5 3.5C9 5 10 7.5 10 10.5c0 2-.5 3.5-1.5 4.7.4 2.4 1.6 4.3 3.5 5.9-1.4.6-2.8.5-4-.4 1-1.6 1.6-3.3 1.9-5.2-1-.9-1.6-2-1.6-3.4 0-2.3 1-4.8 3-6.8Z" />
      <path d="M10.5 11.2c2.6-1.4 5-1.9 7.3-1.5l-.7 1.4c-1.7-.1-3.4.4-5 1.4ZM11.6 14.2c2-.9 3.9-1.1 5.6-.7l-.5 1.5c-1.3-.2-2.7.1-4.1.9Z" />
    </>
  ),
};

export default function TreeIcon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-hidden="true"
      fill="currentColor"
    >
      {ICONS[name] ?? ICONS.broadleaf}
    </svg>
  );
}
