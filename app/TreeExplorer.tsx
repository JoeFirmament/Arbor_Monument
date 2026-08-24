"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import TreeIcon from "./TreeIcon";
import { iconForSpecies } from "./speciesIcons";

type TreeRecord = {
  uid: string;
  catalog: string;
  number: string;
  species: string;
  scientificName: string;
  age: number | null;
  heightM: number | null;
  girthCm: number | null;
  canopyM: number | null;
  address: string;
  grade: "一级" | "二级" | "三级" | "未标注";
  lat: number;
  lng: number;
  coordinateQuality: string;
  sourcePage: string;
  sourceDocument: string;
};

type TreeData = {
  meta: {
    title: string;
    recordCount: number;
    catalogCount: number;
    surveyYear: number;
    sourcePublished: string;
    coordinateNote: string;
    sourceIndex: string;
  };
  records: TreeRecord[];
};

const gradeColors: Record<string, string> = {
  一级: "hsl(18 34% 31%)",
  二级: "hsl(40 28% 39%)",
  三级: "hsl(92 17% 42%)",
  未标注: "hsl(75 8% 55%)",
};

const gradeLabels: Record<string, string> = {
  一级: "500 年以上",
  二级: "300–499 年",
  三级: "100–299 年",
};

const formatNumber = new Intl.NumberFormat("zh-CN");

type TreeVisualStyle = CSSProperties & {
  "--tree-accent": string;
  "--tree-stroke": string;
  "--tree-ring-scale": string;
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function treePresence(tree: TreeRecord) {
  const girth = clamp((tree.girthCm ?? 160) / 650);
  const canopy = clamp((tree.canopyM ?? 7) / 20);
  return girth * 0.62 + canopy * 0.38;
}

function treeTone(tree: TreeRecord) {
  const time = clamp(((tree.age ?? 100) - 100) / 900);
  const hue = Math.round(96 - time * 80);
  const saturation = Math.round(18 + time * 20);
  const lightness = Math.round(42 - time * 10);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function treeVisualStyle(tree: TreeRecord): TreeVisualStyle {
  const presence = treePresence(tree);
  return {
    "--tree-accent": treeTone(tree),
    "--tree-stroke": `${(0.8 + presence * 1.7).toFixed(2)}px`,
    "--tree-ring-scale": (0.94 + presence * 0.08).toFixed(3),
  };
}

function sameSpeciesRank(value: number | null, values: Array<number | null>) {
  if (value === null) return null;
  const valid = values.filter((item): item is number => typeof item === "number");
  if (!valid.length) return null;
  const higher = valid.filter((item) => item > value).length;
  const lower = valid.filter((item) => item < value).length;
  const equal = valid.filter((item) => item === value).length;
  return {
    rank: higher + 1,
    total: valid.length,
    position: valid.length >= 5
      ? Math.round(((lower + equal * 0.5) / valid.length) * 100)
      : null,
  };
}

export default function TreeExplorer() {
  const [data, setData] = useState<TreeData | null>(null);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState("全部地区");
  const [grade, setGrade] = useState("全部级别");
  const [selected, setSelected] = useState<TreeRecord | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const pointsRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    fetch("/data/trees.json")
      .then((response) => {
        if (!response.ok) throw new Error("古树数据载入失败");
        return response.json() as Promise<TreeData>;
      })
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    let active = true;
    if (!mapElementRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      if (!active || !mapElementRef.current || mapRef.current) return;
      const map = L.map(mapElementRef.current, {
        center: [31.43, 120.72],
        zoom: 9,
        zoomControl: false,
        preferCanvas: true,
      });
      L.control.zoom({ position: "bottomleft" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      mapRef.current = map;
      pointsRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
    });

    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
      pointsRef.current = null;
    };
  }, []);

  const catalogs = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    data.records.forEach((tree) =>
      counts.set(tree.catalog, (counts.get(tree.catalog) ?? 0) + 1),
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return data.records
      .filter((tree) => catalog === "全部地区" || tree.catalog === catalog)
      .filter((tree) => grade === "全部级别" || tree.grade === grade)
      .filter(
        (tree) =>
          !needle ||
          `${tree.species} ${tree.scientificName} ${tree.address} ${tree.number}`
            .toLocaleLowerCase("zh-CN")
            .includes(needle),
      )
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  }, [catalog, data, grade, query]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !pointsRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || !pointsRef.current) return;
      pointsRef.current.clearLayers();
      const renderer = L.canvas({ padding: 0.5 });
      filtered.forEach((tree) => {
        const presence = treePresence(tree);
        L.circleMarker([tree.lat, tree.lng], {
          renderer,
          radius: 3.1 + presence * 3.1,
          color: "#fffdf5",
          weight: 0.7,
          fillColor: treeTone(tree),
          fillOpacity: 0.72 + clamp(((tree.age ?? 100) - 100) / 900) * 0.18,
        })
          .bindTooltip(
            `<strong>${tree.species} · ${tree.age ?? "树龄未详"}${tree.age ? " 年" : ""}</strong><br>${tree.catalog} · ${tree.number}`,
            { direction: "top", offset: [0, -4] },
          )
          .on("click", () => setSelected(tree))
          .addTo(pointsRef.current!);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [filtered, mapReady]);

  const counts = useMemo(() => {
    const result = { 一级: 0, 二级: 0, 三级: 0 };
    data?.records.forEach((tree) => {
      if (tree.grade in result) result[tree.grade as keyof typeof result] += 1;
    });
    return result;
  }, [data]);

  const speciesCount = useMemo(
    () => new Set(data?.records.map((tree) => tree.species)).size,
    [data],
  );

  const monumentTree = selected;
  const isWenmiao = monumentTree?.address === "孔庙";

  const measureVisuals = useMemo(() => {
    if (!data || !monumentTree) return [];
    const sameSpecies = data.records.filter(
      (tree) => tree.species === monumentTree.species,
    );
    return [
      {
        key: "girth",
        label: "胸围",
        value: monumentTree.girthCm,
        unit: "厘米",
        ranking: sameSpeciesRank(
          monumentTree.girthCm,
          sameSpecies.map((tree) => tree.girthCm),
        ),
      },
      {
        key: "height",
        label: "树高",
        value: monumentTree.heightM,
        unit: "米",
        ranking: sameSpeciesRank(
          monumentTree.heightM,
          sameSpecies.map((tree) => tree.heightM),
        ),
      },
      {
        key: "canopy",
        label: "冠幅",
        value: monumentTree.canopyM,
        unit: "米",
        ranking: sameSpeciesRank(
          monumentTree.canopyM,
          sameSpecies.map((tree) => tree.canopyM),
        ),
      },
    ];
  }, [data, monumentTree]);

  const botanicalNote = monumentTree?.species === "楸树"
    ? {
        label: "花与果实",
        text: "楸树原产中国，花大而带粉红斑纹，果实细长。哈佛阿诺德树木园的研究文章也记录了它作为用材树与中国传统栽培树种的历史。",
        source: "哈佛阿诺德树木园 · Arnoldia",
        href: "https://arboretum.harvard.edu/wp-content/uploads/2020/06/2010-68-2-Arnoldia.pdf",
      }
    : monumentTree?.species === "银杏" ? {
        label: "叶与树皮",
        text: "银杏以扇形叶、短枝和深裂的灰色树皮为辨识特征。它是银杏属现存的唯一物种，野生型种群的故乡在中国。",
        source: "哈佛阿诺德树木园 · Ginkgo",
        href: "https://arboretum.harvard.edu/plant-bios/ginkgo/",
      } : null;

  useEffect(() => {
    if (!monumentTree) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [monumentTree]);

  function focusTree(tree: TreeRecord) {
    setSelected(tree);
    mapRef.current?.flyTo([tree.lat, tree.lng], 13, { duration: 0.8 });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="以树为碑首页">
          <span className="brand-mark" aria-hidden="true">树</span>
          <span>
            <strong>以树为碑</strong>
            <small>TREES AS MONUMENTS</small>
          </span>
        </a>
        <nav className="top-actions" aria-label="资料操作">
          <a className="text-link source-link" href={data?.meta.sourceIndex} target="_blank" rel="noreferrer">
            官方来源 <span aria-hidden="true">↗</span>
          </a>
          <a className="download-button" href="/data/trees.csv" download>
            下载整理数据 <span aria-hidden="true">↓</span>
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> 2024 年苏州市古树名木资源普查</div>
        <h1>选择一棵树，<em>阅读它的时间</em></h1>
        <p>从官方名录出发，循着一棵树的年轮，阅读苏州的时间。</p>
        <div className="stat-row" aria-label="古树数据概览">
          <article><strong>{data ? formatNumber.format(data.meta.recordCount) : "—"}</strong><span>株古树名木</span></article>
          <i />
          <article><strong>{formatNumber.format(counts.一级)}</strong><span>一级古树</span></article>
          <i />
          <article><strong>{speciesCount || "—"}</strong><span>名录树种</span></article>
        </div>
      </section>

      <section className="explorer" aria-label="古树地图与名录">
        <div className="map-wrap">
          <div ref={mapElementRef} className="map" aria-label="苏州古树分布示意地图" />
          <div className="map-note">
            <span aria-hidden="true">◎</span>
            <div><strong>点位说明</strong><p>官方附件未含经纬度，地图点位为地区级分布示意；精确位置请查看地址。</p></div>
          </div>
          <div className="legend" aria-label="古树级别图例">
            {(["一级", "二级", "三级"] as const).map((item) => (
              <span key={item}><i style={{ background: gradeColors[item] }} />{item}</span>
            ))}
          </div>
        </div>

        <aside className="catalog-panel">
          <div className="panel-heading">
            <div><span>名录检索</span><h2>寻一棵古树</h2></div>
            <b>{formatNumber.format(filtered.length)}</b>
          </div>

          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索树种、编号或地址"
              aria-label="搜索树种、编号或地址"
            />
            {query && <button onClick={() => setQuery("")} aria-label="清空搜索">×</button>}
          </label>

          <div className="filters">
            <label>
              <span>地区</span>
              <select value={catalog} onChange={(event) => setCatalog(event.target.value)}>
                <option>全部地区</option>
                {catalogs.map(([name, count]) => <option key={name} value={name}>{name} · {count}</option>)}
              </select>
            </label>
            <div className="grade-filter" aria-label="按级别筛选">
              {(["全部级别", "一级", "二级", "三级"] as const).map((item) => (
                <button
                  key={item}
                  className={grade === item ? "active" : ""}
                  onClick={() => setGrade(item)}
                >
                  {item === "全部级别" ? "全部" : item}
                </button>
              ))}
            </div>
          </div>

          <div className="tree-list" aria-live="polite">
            {!data && <div className="loading-state"><span />正在展开名录…</div>}
            {data && filtered.slice(0, 80).map((tree) => (
              <button
                className={`tree-row ${selected?.uid === tree.uid ? "selected" : ""}`}
                key={tree.uid}
                onClick={() => focusTree(tree)}
              >
                <span className="tree-symbol" style={{ borderColor: treeTone(tree), color: treeTone(tree) }} aria-hidden="true">
                  <TreeIcon name={iconForSpecies(tree.species)} className="tree-symbol-icon" />
                </span>
                <span className="tree-summary">
                  <span><strong>{tree.species}</strong><em>{tree.age ? `${tree.age} 年` : "树龄未详"}</em></span>
                  <small>{tree.catalog} · {tree.address}</small>
                </span>
                <span className="row-arrow" aria-hidden="true">›</span>
              </button>
            ))}
            {data && filtered.length > 80 && (
              <p className="list-limit">已显示树龄最高的 80 株；继续缩小筛选范围可查看其余记录。</p>
            )}
            {data && filtered.length === 0 && (
              <div className="empty-state">没有找到符合条件的古树<br /><button onClick={() => { setQuery(""); setCatalog("全部地区"); setGrade("全部级别"); }}>重置筛选</button></div>
            )}
          </div>
        </aside>

        {monumentTree && (
          <div className="monument-overlay" role="dialog" aria-modal="true" aria-labelledby="monument-title">
            <section className="tree-monument" style={treeVisualStyle(monumentTree)}>
              <button className="monument-close" onClick={() => setSelected(null)} aria-label="关闭古树沉浸页">×</button>
              <div className="monument-intro">
                <p className="section-number">{monumentTree.number} · {monumentTree.grade}古树</p>
                <h2 id="monument-title">{monumentTree.species}</h2>
                <p className="monument-latin">{monumentTree.scientificName}</p>
                <div className="monument-context">
                  <span>生长地点</span>
                  <strong>{monumentTree.address}</strong>
                  <p>{monumentTree.catalog}名录 · {gradeLabels[monumentTree.grade] ?? "树龄等级未标注"}</p>
                </div>
                <div className="reading-notes">
                  {botanicalNote && (
                    <article>
                      <span>读这棵树 · {botanicalNote.label}</span>
                      <p>{botanicalNote.text}</p>
                      <a href={botanicalNote.href} target="_blank" rel="noreferrer">{botanicalNote.source} ↗</a>
                    </article>
                  )}
                  <article>
                    <span>它生长的地方</span>
                    {monumentTree.address === "孔庙" ? (
                      <>
                        <p>这株树生长在苏州孔庙。苏州府学与文庙始建于 1035 年；地点历史只作为个体背景，不据此推断栽植者，也不声称它见过某位历史人物。</p>
                        <a href="https://dfzb.suzhou.gov.cn/dfzb/szdq/201901/57c24d8ceee54595850596099a7a5c26.shtml" target="_blank" rel="noreferrer">苏州市地方志办公室 ↗</a>
                      </>
                    ) : (
                      <p>官方名录将这株树的位置记为“{monumentTree.address}”。附件没有提供精确经纬度，因此地图点位只表达地区分布。</p>
                    )}
                  </article>
                  <article className="source-method">
                    <span>这株树的依据</span>
                    <p><b>编号与个体尺度</b>来自苏州官方名录；<b>树种知识</b>来自大学植物资料。名录树龄通常为调查估测值，策展文字不替代史实。</p>
                    <a href={monumentTree.sourceDocument} target="_blank" rel="noreferrer">查看这株树的原始名录 ↗</a>
                  </article>
                </div>
              </div>

              <div className="monument-body">
                <div className="tree-stele" aria-live="polite">
                  <div className="ring-field" aria-hidden="true">
                    <i /><i /><i /><i /><i />
                    <span>{monumentTree.age ?? "—"}</span>
                  </div>
                  <div className="stele-copy">
                    <div className="measure-heading">
                      <p className="measure-title">个体尺度</p>
                      <span>同树种排名</span>
                    </div>
                    <div className="stele-measures">
                      {measureVisuals.map((measure) => (
                        <div className="measure-row" key={measure.key}>
                          <div className="measure-value">
                            <small>{measure.label}</small>
                            <strong>{measure.value ?? "—"}<b>{measure.value === null ? "" : measure.unit}</b></strong>
                          </div>
                          <div
                            className={`measure-line ${measure.ranking?.position === null || !measure.ranking ? "is-empty" : ""}`}
                            role="progressbar"
                            aria-label={`${measure.label}在同树种记录中的相对位置`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={measure.ranking?.position ?? undefined}
                          >
                            <i style={{ width: `${measure.ranking?.position ?? 0}%` }} />
                            {measure.ranking?.position !== null && measure.ranking && (
                              <em style={{ left: `${measure.ranking.position}%` }} />
                            )}
                          </div>
                          <span className="measure-rank">
                            {measure.value === null
                              ? "未记录"
                              : !measure.ranking
                                ? "无法比较"
                                : measure.ranking.total === 1
                                  ? "名录中唯一记录"
                                  : measure.ranking.total < 5
                                    ? `同树种仅 ${measure.ranking.total} 株`
                                    : `${measure.ranking.total}株${monumentTree.species}中第${measure.ranking.rank}`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="measure-caption">线由小到大表示该项数值在同树种有效记录中的位置；并列数值同名次，少于 5 株不显示排名。</p>
                  </div>
                </div>

                {isWenmiao && (
                  <div className="story-constellation" aria-label="这株树周围的人与记忆">
                    <article className="story-block story-photos">
                      <div className="story-heading"><span>01</span><p>周围影像</p></div>
                      <figure>
                        <img src="/images/wenmiao/panchi.jpg" alt="2021 年拍摄的苏州文庙泮池与周围建筑" />
                        <figcaption>
                          <strong>泮池，2021</strong>
                          <a href="https://commons.wikimedia.org/wiki/File:%E8%8B%8F%E5%B7%9E%E6%96%87%E5%BA%99%E6%B3%AE%E6%B1%A02021.jpg" target="_blank" rel="noreferrer">ScareCriterion12 · CC BY-SA 4.0 ↗</a>
                        </figcaption>
                      </figure>
                    </article>

                    <article className="story-block story-person">
                      <div className="story-heading"><span>02</span><p>相关人物</p></div>
                      <div className="person-portrait">
                        <span className="person-monogram" aria-hidden="true">范</span>
                        <div><small>989—1052</small><h4>范仲淹</h4><p>1035 年任苏州知州时创立苏州府学，并将官学与祭孔庙堂结合。人物属于地点史，不据此推断他与这株现存古树有直接联系。</p></div>
                      </div>
                      <a href="https://dfzb.suzhou.gov.cn/dfzb/szdq/201901/57c24d8ceee54595850596099a7a5c26.shtml" target="_blank" rel="noreferrer">苏州地方志资料 ↗</a>
                    </article>

                    <article className="story-block story-anecdote">
                      <div className="story-heading"><span>03</span><p>历史典故</p></div>
                      <div className="anecdote-mark" aria-hidden="true">图</div>
                      <h4>一块碑，保存一座城</h4>
                      <p>1229 年刻成的《平江图》现藏于苏州碑刻博物馆。它把城墙、河道、街巷与桥梁刻入石面；古树则用另一种方式，以活着的身体保存城市时间。</p>
                      <a href="https://dfzb.suzhou.gov.cn/dfzb/szdq/202508/ee44bcc0dcd7425398d0b5ed6a49c848.shtml" target="_blank" rel="noreferrer">苏州地方志《兵火催生〈平江图〉》↗</a>
                    </article>

                    <article className="story-block story-oral">
                      <div className="story-heading"><span>04</span><p>口述历史</p></div>
                      <div className="oral-player" aria-label="口述历史音频播放器，录音尚待采集">
                        <button type="button" disabled aria-label="录音尚待采集，暂不可播放"><i /></button>
                        <div className="oral-audio-body">
                          <div className="oral-audio-meta"><strong>采访录音</strong><span>待采集</span><time>00:00 / --:--</time></div>
                          <div className="oral-progress" role="progressbar" aria-label="播放进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><i /></div>
                        </div>
                      </div>
                      <blockquote>“你第一次注意到这棵树，是什么时候？”</blockquote>
                      <p>计划向园林养护人员、碑刻博物馆志愿者和附近居民采集记忆。正式展示时记录讲述者、采访日期与授权范围；在采访完成前，不生成任何人物引语。</p>
                      <small>建议线索：落叶时节 · 树木养护 · 院落变化 · 游人与树</small>
                    </article>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </section>

      <footer>
        <span>数据来源：苏州市园林和绿化管理局</span>
        <span>共整理 11 份官方附件 · 更新于 2025 年 2 月</span>
      </footer>
    </main>
  );
}
