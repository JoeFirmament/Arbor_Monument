"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import type {
  LocationListResponse,
  LocationProposal,
  VerifiedLocation,
} from "./location-types";

type LocationTree = {
  uid: string;
  number: string;
  species: string;
  address: string;
  lat: number;
  lng: number;
};

type PositionReading = {
  latitude: number;
  longitude: number;
  accuracyM: number;
};

const captureLabels: Record<LocationProposal["captureMethod"], string> = {
  device_gps: "现场 GPS",
  manual_coordinates: "手动输入",
  map_pin: "地图选点",
};

const statusLabels: Record<LocationProposal["status"], string> = {
  pending: "等待确认",
  community_verified: "多人确认",
  accepted: "编辑核实",
  rejected: "未采用",
};

function readCurrentPosition(): Promise<PositionReading> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("当前设备不支持定位。"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      }),
      () => reject(new Error("没有取得当前位置，请检查浏览器定位权限。")),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    );
  });
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function LocationPicker({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number;
  longitude: number;
  onChange(latitude: number, longitude: number): void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let active = true;
    if (!elementRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      if (!active || !elementRef.current || mapRef.current) return;
      const map = L.map(elementRef.current, {
        center: [latitude, longitude],
        zoom: 18,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      const marker = L.marker([latitude, longitude], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        onChangeRef.current(point.lat, point.lng);
      });
      map.on("click", (event) => {
        marker.setLatLng(event.latlng);
        onChangeRef.current(event.latlng.lat, event.latlng.lng);
      });
      mapRef.current = map;
      markerRef.current = marker;
      window.setTimeout(() => map.invalidateSize(), 0);
    });

    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerRef.current?.setLatLng([latitude, longitude]);
    mapRef.current?.panTo([latitude, longitude], { animate: true });
  }, [latitude, longitude]);

  return <div className="location-picker-map" ref={elementRef} aria-label="拖动标记或点击地图选择古树位置" />;
}

export default function LocationLedger({
  tree,
  onVerifiedLocation,
}: {
  tree: LocationTree;
  onVerifiedLocation(location: VerifiedLocation): void;
}) {
  const [proposals, setProposals] = useState<LocationProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [name, setName] = useState("");
  const [latitudeText, setLatitudeText] = useState(formatCoordinate(tree.lat));
  const [longitudeText, setLongitudeText] = useState(formatCoordinate(tree.lng));
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [captureMethod, setCaptureMethod] = useState<LocationProposal["captureMethod"]>("map_pin");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  const validCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const bestProposal = proposals[0] ?? null;

  const verifiedProposal = useMemo(
    () => proposals.find(
      (proposal) => proposal.status === "accepted" || proposal.confirmationCount >= 3,
    ) ?? null,
    [proposals],
  );

  async function loadProposals() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/locations?treeId=${encodeURIComponent(tree.uid)}`, {
        cache: "no-store",
      });
      const body = await response.json() as LocationListResponse;
      if (!response.ok) throw new Error(body.error ?? "位置资料载入失败。\n");
      const next = body.proposals ?? [];
      setProposals(next);
      const verified = next.find(
        (proposal) => proposal.status === "accepted" || proposal.confirmationCount >= 3,
      );
      if (verified) onVerifiedLocation(verified);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message.trim() : "位置资料载入失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const savedName = window.localStorage.getItem("tree-explorer-display-name");
    if (savedName) setName(savedName);
    void loadProposals();
  }, [tree.uid]);

  useEffect(() => {
    const source = verifiedProposal ?? bestProposal;
    setLatitudeText(formatCoordinate(source?.latitude ?? tree.lat));
    setLongitudeText(formatCoordinate(source?.longitude ?? tree.lng));
    setAccuracyM(null);
    setCaptureMethod("map_pin");
    setDescription("");
    setEditorOpen(false);
    setMessage("");
  }, [tree.uid]);

  function rememberName(value: string) {
    setName(value);
    window.localStorage.setItem("tree-explorer-display-name", value.trim().slice(0, 30));
  }

  async function useDeviceLocation() {
    setMessage("正在读取手机定位…");
    try {
      const position = await readCurrentPosition();
      setLatitudeText(formatCoordinate(position.latitude));
      setLongitudeText(formatCoordinate(position.longitude));
      setAccuracyM(position.accuracyM);
      setCaptureMethod("device_gps");
      setMessage(`已取得当前位置，精度约 ±${Math.round(position.accuracyM)} 米。请在地图上核对。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取当前位置。");
    }
  }

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setMessage("请先填写探寻者署名。");
      return;
    }
    if (!validCoordinates) {
      setMessage("请输入有效的纬度和经度。");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treeId: tree.uid,
          contributorName: name,
          latitude,
          longitude,
          accuracyM,
          captureMethod,
          locationDescription: description,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "位置没有保存成功。");
      setEditorOpen(false);
      setMessage("位置提案已保存，等待其他探寻者确认。");
      await loadProposals();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "位置没有保存成功。");
    } finally {
      setSaving(false);
    }
  }

  async function toggleConfirmation(proposal: LocationProposal) {
    if (!name.trim()) {
      setMessage("请先填写你的署名，再确认位置。");
      return;
    }
    setSaving(true);
    setMessage("正在记录确认…");

    let position: PositionReading | null = null;
    try {
      position = await readCurrentPosition();
    } catch {
      // A remote confirmation is still useful, but is not marked as on-site.
    }

    try {
      const response = await fetch(`/api/locations/${encodeURIComponent(proposal.id)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verifierName: name,
          currentLatitude: position?.latitude,
          currentLongitude: position?.longitude,
          gpsAccuracyM: position?.accuracyM,
        }),
      });
      const body = await response.json() as { confirmed?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "确认没有保存成功。");
      setMessage(body.confirmed ? "已记录你的确认。" : "已取消你的确认。彼此独立的确认更有价值。");
      await loadProposals();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "确认没有保存成功。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="location-ledger" aria-labelledby="location-ledger-title">
      <div className="location-ledger-heading">
        <div>
          <span className="location-sequence">05</span>
          <div>
            <h3 id="location-ledger-title">位置核实</h3>
            <p>名录地址保留，现场坐标由探寻者共同确认。</p>
          </div>
        </div>
        <button type="button" className="location-edit-button" onClick={() => setEditorOpen((open) => !open)}>
          {editorOpen ? "收起" : "校正位置"}
        </button>
      </div>

      <div className="official-address-line">
        <span>名录记载</span>
        <strong>{tree.address}</strong>
        <small>原附件未提供精确经纬度</small>
      </div>

      {loadError && <p className="location-message is-error">{loadError}</p>}
      {loading && <p className="location-message">正在查阅位置履历…</p>}

      {!loading && !loadError && proposals.length === 0 && !editorOpen && (
        <div className="location-empty">
          <strong>尚无现场坐标</strong>
          <p>若你正在这株树旁，可以成为第一位留下位置的人。</p>
        </div>
      )}

      {!loading && proposals.length > 0 && (
        <div className="proposal-list">
          {proposals.slice(0, 4).map((proposal) => (
            <article className={`proposal-card ${proposal.status !== "pending" ? "is-verified" : ""}`} key={proposal.id}>
              <div className="proposal-status-row">
                <span className={`proposal-status status-${proposal.status}`}>{statusLabels[proposal.status]}</span>
                <time>{new Date(`${proposal.createdAt.replace(" ", "T")}Z`).toLocaleDateString("zh-CN")}</time>
              </div>
              <p className="proposal-coordinate">
                {formatCoordinate(proposal.latitude)}<i>，</i>{formatCoordinate(proposal.longitude)}
              </p>
              {proposal.locationDescription && <p className="proposal-description">{proposal.locationDescription}</p>}
              <div className="proposal-attribution">
                <span>由 <b>{proposal.contributorName}</b> 更新</span>
                <span>{captureLabels[proposal.captureMethod]}{proposal.accuracyM !== null ? ` · ±${Math.round(proposal.accuracyM)} 米` : ""}</span>
              </div>
              <div className="proposal-confirmation-row">
                <span title={proposal.confirmationNames.join("、")}>
                  {proposal.confirmationCount > 0
                    ? `${proposal.confirmationNames.slice(0, 2).join("、")}${proposal.confirmationCount > 2 ? ` 等 ${proposal.confirmationCount} 人` : ""}确认`
                    : "等待第一位确认者"}
                </span>
                <button
                  type="button"
                  className={proposal.viewerConfirmed ? "is-starred" : ""}
                  disabled={saving || proposal.viewerOwns}
                  onClick={() => void toggleConfirmation(proposal)}
                  title={proposal.viewerOwns ? "不能确认自己提交的位置" : "确认这个位置"}
                >
                  <b aria-hidden="true">{proposal.viewerConfirmed ? "★" : "☆"}</b>
                  {proposal.confirmationCount}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editorOpen && (
        <form className="location-editor" onSubmit={submitProposal}>
          <div className="location-editor-lead">
            <strong>{tree.species} · {tree.number}</strong>
            <span>坐标统一保存为 WGS 84</span>
          </div>
          <label className="location-name-field">
            <span>你的署名</span>
            <input value={name} onChange={(event) => rememberName(event.target.value)} maxLength={30} placeholder="例如：姑苏寻木者" required />
          </label>
          <button className="use-location-button" type="button" onClick={() => void useDeviceLocation()}>
            <span aria-hidden="true">◎</span>
            使用我现在的位置
          </button>
          <div className="coordinate-fields">
            <label>
              <span>纬度</span>
              <input
                inputMode="decimal"
                value={latitudeText}
                onChange={(event) => { setLatitudeText(event.target.value); setAccuracyM(null); setCaptureMethod("manual_coordinates"); }}
                required
              />
            </label>
            <label>
              <span>经度</span>
              <input
                inputMode="decimal"
                value={longitudeText}
                onChange={(event) => { setLongitudeText(event.target.value); setAccuracyM(null); setCaptureMethod("manual_coordinates"); }}
                required
              />
            </label>
          </div>
          {validCoordinates && (
            <LocationPicker
              latitude={latitude}
              longitude={longitude}
              onChange={(nextLatitude, nextLongitude) => {
                setLatitudeText(formatCoordinate(nextLatitude));
                setLongitudeText(formatCoordinate(nextLongitude));
                setAccuracyM(null);
                setCaptureMethod("map_pin");
              }}
            />
          )}
          <label className="location-description-field">
            <span>现场描述 <small>选填</small></span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={160} placeholder="例如：大成殿西侧，碑廊入口旁" />
          </label>
          <div className="location-editor-footer">
            <p>提交后不会覆盖名录；三位不同探寻者确认后，主地图采用此点。</p>
            <button type="submit" disabled={saving}>{saving ? "保存中…" : "提交位置提案"}</button>
          </div>
        </form>
      )}

      {!editorOpen && (
        <label className="location-inline-name">
          <span>确认时的署名</span>
          <input value={name} onChange={(event) => rememberName(event.target.value)} maxLength={30} placeholder="填写后可为位置打星" />
        </label>
      )}

      {message && <p className={`location-message ${message.includes("无法") || message.includes("请先") ? "is-error" : ""}`}>{message}</p>}
    </section>
  );
}
