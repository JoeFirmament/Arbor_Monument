"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type SpeciesImage = {
  species: string;
  scientificName: string;
  title: string;
  thumbUrl: string;
  pageUrl: string;
  license: string;
  artist: string;
  credit: string;
};

type SpeciesImages = Record<string, SpeciesImage>;

const gradeColors: Record<string, string> = {
  一级: "#c14b2a",
  二级: "#d6992f",
  三级: "#47785a",
  未标注: "#748178",
};

const gradeLabels: Record<string, string> = {
  一级: "500 年以上",
  二级: "300–499 年",
  三级: "100–299 年",
};

const formatNumber = new Intl.NumberFormat("zh-CN");

export default function TreeExplorer() {
  const [data, setData] = useState<TreeData | null>(null);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState("全部地区");
  const [grade, setGrade] = useState("全部级别");
  const [selected, setSelected] = useState<TreeRecord | null>(null);
  const [images, setImages] = useState<SpeciesImages>({});
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
    fetch("/data/species-images.json")
      .then((response) => {
        if (!response.ok) throw new Error("图版数据载入失败");
        return response.json() as Promise<SpeciesImages>;
      })
      .then(setImages)
      .catch(() => setImages({}));
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
        L.circleMarker([tree.lat, tree.lng], {
          renderer,
          radius: tree.grade === "一级" ? 5.5 : tree.grade === "二级" ? 4.2 : 3.2,
          color: "#fffdf5",
          weight: 0.7,
          fillColor: gradeColors[tree.grade],
          fillOpacity: tree.grade === "三级" ? 0.68 : 0.86,
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

  const oldest = useMemo(
    () => data?.records.reduce((a, b) => ((b.age ?? 0) > (a.age ?? 0) ? b : a)),
    [data],
  );

  const speciesCount = useMemo(
    () => new Set(data?.records.map((tree) => tree.species)).size,
    [data],
  );

  const wenmiaoTrees = useMemo(
    () =>
      data?.records
        .filter((tree) => tree.catalog === "姑苏区" && tree.address === "孔庙")
        .sort((a, b) => (b.age ?? 0) - (a.age ?? 0)) ?? [],
    [data],
  );

  const monumentTree = selected?.catalog === "姑苏区" && selected.address === "孔庙"
    ? selected
    : null;

  const botanicalNote = monumentTree?.species === "楸树"
    ? {
        label: "花与果实",
        text: "楸树原产中国，花大而带粉红斑纹，果实细长。哈佛阿诺德树木园的研究文章也记录了它作为用材树与中国传统栽培树种的历史。",
        source: "哈佛阿诺德树木园 · Arnoldia",
        href: "https://arboretum.harvard.edu/wp-content/uploads/2020/06/2010-68-2-Arnoldia.pdf",
      }
    : {
        label: "叶与树皮",
        text: "银杏以扇形叶、短枝和深裂的灰色树皮为辨识特征。它是银杏属现存的唯一物种，野生型种群的故乡在中国。",
        source: "哈佛阿诺德树木园 · Ginkgo",
        href: "https://arboretum.harvard.edu/plant-bios/ginkgo/",
      };

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
        <a className="brand" href="#top" aria-label="苏州古树志首页">
          <span className="brand-mark" aria-hidden="true">古</span>
          <span>
            <strong>苏州古树志</strong>
            <small>SUZHOU ANCIENT TREES</small>
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
        <h1>一城文脉，<em>千年树影</em></h1>
        <p>从官方名录出发，循着一棵树的年轮，阅读苏州的时间。</p>
        <div className="stat-row" aria-label="古树数据概览">
          <article><strong>{data ? formatNumber.format(data.meta.recordCount) : "—"}</strong><span>株古树名木</span></article>
          <i />
          <article><strong>{formatNumber.format(counts.一级)}</strong><span>一级古树</span></article>
          <i />
          <article><strong>{speciesCount || "—"}</strong><span>名录树种</span></article>
          <i />
          <article><strong>{oldest?.age ? `${formatNumber.format(oldest.age)} 年` : "—"}</strong><span>最高树龄</span></article>
        </div>
      </section>

      <section className="explorer" aria-label="古树地图与名录">
        <div className="map-wrap">
          <div ref={mapElementRef} className="map" aria-label="苏州古树分布示意地图" />
          <div className="map-label">
            <span className="pulse-dot" />
            当前显示 <strong>{formatNumber.format(filtered.length)}</strong> 株
          </div>
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
                <span className="tree-symbol" style={{ borderColor: gradeColors[tree.grade] }} aria-hidden="true">
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
            <button className="monument-close" onClick={() => setSelected(null)} aria-label="关闭以树为碑专题">×</button>
            <section className="tree-monument">
              <div className="monument-intro">
                <p className="section-number">第一篇 · 孔庙八木</p>
                <h2 id="monument-title">以树为碑</h2>
                <blockquote>碑记人事，树记风雨。</blockquote>
                <p className="monument-lead">
                  一株树不是建筑的注脚。根系进入土壤，年轮收存旱涝，树皮留下伤痕；它以仍在生长的身体，成为一方土地上没有文字的碑。
                </p>
                <div className="monument-context">
                  <span>生长坐标</span>
                  <strong>苏州孔庙</strong>
                  <p>官方名录在此记录 8 株古树：5 株银杏、3 株楸树。孔庙提供坐标，树木承担叙事。</p>
                </div>
              </div>

              <div className="monument-body">
                <div className="tree-stele" aria-live="polite">
                  <div className="ring-field" aria-hidden="true">
                    <i /><i /><i /><i /><i />
                    <span>{monumentTree.age ?? "—"}</span>
                  </div>
                  <div className="stele-copy">
                    <p>{monumentTree.grade}古树 · 名录编号 {monumentTree.number}</p>
                    <h3>{monumentTree.species}</h3>
                    <em>{monumentTree.scientificName}</em>
                    <div className="stele-measures">
                      <span><small>名录树龄</small><strong>{monumentTree.age ?? "—"}<b>年</b></strong></span>
                      <span><small>胸围</small><strong>{monumentTree.girthCm ?? "—"}<b>厘米</b></strong></span>
                      <span><small>树高</small><strong>{monumentTree.heightM ?? "—"}<b>米</b></strong></span>
                      <span><small>冠幅</small><strong>{monumentTree.canopyM ?? "—"}<b>米</b></strong></span>
                    </div>
                    <p className="measure-caption">这些数字不是传说，而是 2024 年官方资源普查留下的个体尺度。</p>
                  </div>
                </div>

                <div className="tree-index" aria-label="选择孔庙古树">
                  {wenmiaoTrees.map((tree, index) => (
                    <button
                      key={tree.uid}
                      className={tree.uid === monumentTree.uid ? "active" : ""}
                      onClick={() => setSelected(tree)}
                      aria-pressed={tree.uid === monumentTree.uid}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{tree.species}</strong>
                      <em>{tree.age} 年</em>
                      <small>{tree.number}</small>
                    </button>
                  ))}
                </div>

                <div className="reading-notes">
                  <article>
                    <span>读树 · {botanicalNote.label}</span>
                    <p>{botanicalNote.text}</p>
                    <a href={botanicalNote.href} target="_blank" rel="noreferrer">{botanicalNote.source} ↗</a>
                  </article>
                  <article>
                    <span>读地 · 只作旁注</span>
                    <p>苏州府学与文庙始建于 1035 年，与范仲淹有关。这里不据此推断任何一株现存古树的栽植者，也不声称它曾见过某位历史人物。</p>
                    <a href="https://dfzb.suzhou.gov.cn/dfzb/szdq/201901/57c24d8ceee54595850596099a7a5c26.shtml" target="_blank" rel="noreferrer">苏州市地方志办公室 ↗</a>
                  </article>
                  <article className="source-method">
                    <span>如何阅读</span>
                    <p><b>树的个体数据</b>来自苏州官方名录；<b>树种知识</b>来自大学植物资料；抒情文字是当代策展表达，不替代史实。</p>
                    <a href={monumentTree.sourceDocument} target="_blank" rel="noreferrer">查看这株树的原始名录 ↗</a>
                  </article>
                </div>
              </div>
            </section>
          </div>
        )}

        {selected && !monumentTree && (
          <article className="detail-card" aria-label={`${selected.species}详情`}>
            <button className="detail-close" onClick={() => setSelected(null)} aria-label="关闭详情">×</button>
            <div className="detail-kicker"><span style={{ background: gradeColors[selected.grade] }} />{selected.grade}古树 · {gradeLabels[selected.grade]}</div>
            <div className="detail-title"><h3>{selected.species}</h3><span>{selected.number}</span></div>
            <p className="latin">{selected.scientificName}</p>
            {images[selected.species] && (
              <figure className="detail-image">
                <img
                  src={images[selected.species].thumbUrl}
                  alt={`${selected.species} 图版（${images[selected.species].license}）`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <figcaption>
                  <span>{images[selected.species].credit}</span>
                  <a href={images[selected.species].pageUrl} target="_blank" rel="noreferrer">
                    {images[selected.species].artist} · {images[selected.species].license} · Wikimedia Commons ↗
                  </a>
                </figcaption>
              </figure>
            )}
            <dl>
              <div><dt>树龄</dt><dd>{selected.age ?? "—"}<small> 年</small></dd></div>
              <div><dt>树高</dt><dd>{selected.heightM ?? "—"}<small> m</small></dd></div>
              <div><dt>胸围</dt><dd>{selected.girthCm ?? "—"}<small> cm</small></dd></div>
              <div><dt>冠幅</dt><dd>{selected.canopyM ?? "—"}<small> m</small></dd></div>
            </dl>
            <div className="address"><span aria-hidden="true">⌖</span><p><small>具体生长位置</small>{selected.address}</p></div>
            <div className="detail-footer">
              <span>{selected.catalog}名录</span>
              <a href={selected.sourceDocument} target="_blank" rel="noreferrer">查看原始 Word ↗</a>
            </div>
          </article>
        )}
      </section>

      <footer>
        <span>数据来源：苏州市园林和绿化管理局</span>
        <span>共整理 11 份官方附件 · 更新于 2025 年 2 月</span>
      </footer>
    </main>
  );
}
