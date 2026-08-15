import type { IconName } from "./TreeIcon";

// Maps each Chinese catalogue species name to a stylised icon group.
// Grouped by recognisable botanical form rather than exact species, so the
// long tail (many 1–2 tree species) still falls into a meaningful glyph.
export const speciesIcon: Record<string, IconName> = {
  银杏: "ginkgo",

  圆柏: "conifer",
  龙柏: "conifer",
  罗汉松: "conifer",
  白皮松: "conifer",
  马尾松: "conifer",
  柳杉: "conifer",
  日本五针松: "conifer",
  柏木: "conifer",
  黑松: "conifer",
  刺柏: "conifer",
  金钱松: "conifer",
  雪松: "conifer",
  侧柏: "conifer",
  落羽杉: "conifer",

  香樟: "camphor",
  紫楠: "camphor",
  浙江楠: "camphor",

  木樨: "osmanthus",

  枫香: "maple",
  鸡爪槭: "maple",
  三角槭: "maple",
  三角枫: "maple",

  广玉兰: "magnolia",
  荷花玉兰: "magnolia",
  玉兰: "magnolia",
  二乔玉兰: "magnolia",

  黄杨: "boxwood",
  瓜子黄杨: "boxwood",

  冬青: "holly",
  枸骨: "holly",

  栓皮栎: "oak",
  麻栎: "oak",
  青冈: "oak",
  苦槠: "oak",
  白栎: "oak",

  板栗: "fruit",
  石榴: "fruit",
  柿: "fruit",
  柿子树: "fruit",
  枣: "fruit",
  杨梅: "fruit",
  香圆: "fruit",
  瓶兰花: "fruit",
  枸杞: "fruit",
  枳椇: "fruit",
  木瓜: "fruit",
  胡颓子: "fruit",

  紫藤: "vine",
  木香花: "vine",
  凌霄: "vine",
  厚萼凌霄: "vine",
  薜荔: "vine",
  单瓣黄木香: "vine",

  蜡梅: "flowering",
  腊梅: "flowering",
  紫薇: "flowering",
  银薇: "flowering",
  南紫薇: "flowering",
  山茶: "flowering",
  单体红山茶: "flowering",
  含笑: "flowering",
  含笑花: "flowering",
  牡丹: "flowering",
  琼花: "flowering",
  楸树: "flowering",
  梓树: "flowering",
  梅: "flowering",
  茶: "flowering",

  大叶榉树: "elm",
  榉树: "elm",
  朴树: "elm",
  榔榆: "elm",
  榆: "elm",
  榆树: "elm",
  糙叶树: "elm",

  // Everything else → generic broadleaf.
  枫杨: "broadleaf",
  红豆树: "broadleaf",
  龙爪槐: "broadleaf",
  槐: "broadleaf",
  黄檀: "broadleaf",
  皂荚: "broadleaf",
  二球悬铃木: "broadleaf",
  黄连木: "broadleaf",
  女贞: "broadleaf",
  雀梅藤: "broadleaf",
  乌桕: "broadleaf",
  石楠: "broadleaf",
  南京椴: "broadleaf",
  南天竹: "broadleaf",
  佘山羊奶子: "broadleaf",
  红茴香: "broadleaf",
  牛鼻栓: "broadleaf",
  刺楸: "broadleaf",
  蚊母树: "broadleaf",
  重阳木: "broadleaf",
  刺槐: "broadleaf",
  厚壳树: "broadleaf",
  臭椿: "broadleaf",
  柘树: "broadleaf",
};

export function iconForSpecies(species: string): IconName {
  return speciesIcon[species] ?? "broadleaf";
}
