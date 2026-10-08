import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mediaUrl, OFFLINE_MAP } from "../config";
import type { Route, LngLat } from "../lib/geo";
import type { Day, Media } from "../types";
import { buildStyle, type BaseStyle } from "./style";

export const ORANGE = "#FF6B12";
const SOUTH_ISLAND: [LngLat, LngLat] = [[166.4, -47.3], [174.5, -40.45]];

/** Label tiers: 1 = always, 2 = regional zoom, 3 = close-up only. */
const TIER1 = new Set(["Ship Cove · Meretoto", "St Arnaud", "Arthur's Pass (Klondyke Corner)", "Lake Tekapo", "Queenstown", "Bluff · Stirling Point"]);
const TIER2 = new Set(["Havelock", "Boyle Village", "Lake Coleridge · Rakaia", "Twizel", "Wānaka", "Invercargill"]);

export interface MapData {
  route: Route;
  days: Day[];
  walked: { hike: [number, number][]; transfer: [number, number][] };
  photos: { m: Media; c: LngLat; day: Day }[];
  recent: LngLat[];
}

export interface LiveData { c: LngLat; stale: boolean; label: string }

export interface MapCallbacks {
  onDay: (dayNumber: number) => void;
  onPhoto: (dayNumber: number, mediaId: string) => void;
  onLive: () => void;
  onInteract?: () => void;
}

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const multi = (lines: LngLat[][]): GeoJSON.Feature => ({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } });

export class TrailMap {
  map: MLMap;
  private base: BaseStyle = "satellite";
  private dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  private linzKey: string | null = null;
  private land?: GeoJSON.Feature;
  private data: MapData | null = null;
  private live: LiveData | null = null;
  private photosKey = "";
  private selected: Day | null = null;
  private liveMarker: maplibregl.Marker | null = null;
  private placeMarkers: maplibregl.Marker[] = [];
  private photoMarkers = new Map<string, maplibregl.Marker>();
  private padding = { top: 80, right: 24, bottom: 220, left: 24 };
  private ready: Promise<void>;
  private resolveReady!: () => void;
  replaying = false;

  constructor(container: HTMLElement, private cb: MapCallbacks, land?: GeoJSON.Feature) {
    this.land = land;
    this.ready = new Promise((r) => (this.resolveReady = r));
    this.map = new maplibregl.Map({
      container,
      style: buildStyle(this.base, { dark: this.dark, land }),
      bounds: SOUTH_ISLAND,
      fitBoundsOptions: { padding: 40 },
      maxPitch: 78,
      attributionControl: false,
      fadeDuration: 180,
      renderWorldCopies: false,
      cooperativeGestures: false,
      canvasContextAttributes: { antialias: true },
    } as maplibregl.MapOptions);
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    this.map.on("style.load", () => this.installOverlays());
    this.map.once("load", () => this.resolveReady());
    for (const ev of ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const) {
      this.map.on(ev, (e: { originalEvent?: Event }) => { if (e.originalEvent) this.cb.onInteract?.(); });
    }
    this.map.on("moveend", () => this.updatePhotoMarkers());
    this.map.on("zoom", () => this.updatePlaceVisibility());
    this.map.on("click", (e) => this.handleClick(e.point));
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      this.dark = e.matches;
      this.applyStyle();
    });
  }

  whenReady() { return this.ready; }

  // ------------------------------------------------------------- style
  setBase(base: BaseStyle) {
    if (base === this.base) return;
    this.base = base;
    this.applyStyle();
  }
  get baseStyle() { return this.base; }

  setLinzKey(key: string | null) {
    const k = key?.trim() || null;
    if (k === this.linzKey) return;
    this.linzKey = k;
    this.applyStyle();
  }

  private applyStyle() {
    this.map.setStyle(buildStyle(this.base, { dark: this.dark, linzKey: this.linzKey, land: this.land }), { diff: false });
  }

  private installOverlays() {
    const m = this.map;
    this.photosKey = ""; // fresh sources after a style switch
    const sat = this.base === "satellite" && !OFFLINE_MAP;
    const add = (id: string) => { if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty }); };
    ["route", "gaps", "walked", "transfer", "selected", "day-ends", "days-hit", "recent", "replay"].forEach(add);
    if (!m.getSource("photos")) {
      m.addSource("photos", { type: "geojson", data: empty, cluster: true, clusterRadius: 70, clusterMaxZoom: 14 });
    }
    const routeColor = sat ? "#ffffff" : this.dark ? "#d7dde4" : "#3b4a57";
    const casing = sat ? "rgba(0,0,0,0.45)" : this.dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)";
    const w = (a: number, b: number) => ["interpolate", ["linear"], ["zoom"], 5, a, 12, b] as unknown as number;

    m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": casing, "line-width": w(2.6, 5.5) } });
    m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": routeColor, "line-width": w(1.1, 2.6), "line-opacity": sat ? 0.85 : 0.75 } });
    m.addLayer({ id: "gaps", type: "line", source: "gaps", layout: { "line-cap": "round" }, paint: { "line-color": routeColor, "line-width": w(1, 2), "line-opacity": 0.6, "line-dasharray": [0.1, 2.2] } });
    m.addLayer({ id: "transfer", type: "line", source: "transfer", layout: { "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(1.5, 3), "line-dasharray": [0.1, 1.8] } });
    m.addLayer({ id: "walked-glow", type: "line", source: "walked", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(7, 16), "line-blur": w(4, 9), "line-opacity": 0.45 } });
    m.addLayer({ id: "walked", type: "line", source: "walked", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(2.4, 5) } });
    m.addLayer({ id: "recent", type: "line", source: "recent", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(1.5, 3), "line-opacity": 0.9, "line-dasharray": [0.6, 1.4] } });
    m.addLayer({ id: "selected-halo", type: "line", source: "selected", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": w(7, 12), "line-opacity": 0.95 } });
    m.addLayer({ id: "selected", type: "line", source: "selected", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(3.5, 6.5) } });
    m.addLayer({ id: "replay", type: "line", source: "replay", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": w(3, 5) } });
    m.addLayer({
      id: "day-ends", type: "circle", source: "day-ends",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"],
          5, ["case", ["boolean", ["get", "sel"], false], 6, 3],
          11, ["case", ["boolean", ["get", "sel"], false], 8, 5.5]],
        "circle-color": "#ffffff",
        "circle-stroke-color": ORANGE,
        "circle-stroke-width": ["case", ["boolean", ["get", "sel"], false], 3.5, 2.2],
        "circle-pitch-alignment": "viewport",
      },
    });
    m.addLayer({ id: "days-hit", type: "line", source: "days-hit", paint: { "line-color": "#000", "line-width": 22, "line-opacity": 0 } });
    // invisible layer so photo clusters are computed (markers are HTML)
    m.addLayer({ id: "photos-probe", type: "circle", source: "photos", paint: { "circle-radius": 1, "circle-opacity": 0 } });

    this.pushData();
  }

  // ------------------------------------------------------------- data
  setData(data: MapData) {
    this.data = data;
    if (this.map.isStyleLoaded() && this.map.getSource("route")) this.pushData();
  }

  private src(id: string) { return this.map.getSource(id) as GeoJSONSource | undefined; }

  private pushData() {
    const d = this.data;
    if (!d || !this.src("route")) return;
    const r = d.route;
    const routeLines = r.parts.map((p) => Array.from(p.lng, (x, i) => [x, p.lat[i]] as LngLat));
    this.src("route")!.setData(multi(routeLines));
    const gapLines: LngLat[][] = [];
    for (let i = 0; i < routeLines.length - 1; i++) {
      gapLines.push([routeLines[i][routeLines[i].length - 1], routeLines[i + 1][0]]);
    }
    this.src("gaps")!.setData(multi(gapLines));
    this.src("walked")!.setData(multi(d.walked.hike.flatMap(([a, b]) => r.slice(a, b))));
    this.src("transfer")!.setData(multi(d.walked.transfer.flatMap(([a, b]) => r.slice(a, b))));
    this.src("recent")!.setData(d.recent.length > 1 ? multi([d.recent]) : empty);

    const ends: GeoJSON.Feature[] = [];
    const hits: GeoJSON.Feature[] = [];
    for (const day of d.days) {
      const c = day.end_lng !== null && day.end_lat !== null ? [day.end_lng, day.end_lat] : day.end_km !== null ? r.pointAt(day.end_km) : null;
      if (c) ends.push({ type: "Feature", properties: { n: day.day_number, sel: this.selected?.id === day.id }, geometry: { type: "Point", coordinates: c } });
      if (day.start_km !== null && day.end_km !== null && Math.abs(day.end_km - day.start_km) > 0.05) {
        hits.push({ type: "Feature", properties: { n: day.day_number }, geometry: { type: "MultiLineString", coordinates: r.slice(day.start_km, day.end_km) } });
      }
    }
    this.src("day-ends")!.setData({ type: "FeatureCollection", features: ends });
    this.src("days-hit")!.setData({ type: "FeatureCollection", features: hits });
    this.src("selected")!.setData(this.selected && this.selected.start_km !== null && this.selected.end_km !== null
      ? multi(r.slice(this.selected.start_km, this.selected.end_km)) : empty);

    const shown = d.photos.filter(({ day }) => !this.selected || day.id === this.selected.id);
    const key = shown.map(({ m, c }) => `${m.id}@${c[0].toFixed(5)},${c[1].toFixed(5)}`).join("|");
    if (key !== this.photosKey) {
      this.photosKey = key;
      for (const mk of this.photoMarkers.values()) mk.remove();
      this.photoMarkers.clear();
      this.src("photos")!.setData({
        type: "FeatureCollection",
        features: shown.map(({ m, c, day }) => ({
          type: "Feature", properties: { id: m.id, n: day.day_number, thumb: mediaUrl(m.thumb_path ?? m.path), video: m.kind !== "photo" },
          geometry: { type: "Point", coordinates: c },
        })),
      });
    }

    this.updateLive();
    this.updatePlaces();
    this.map.once("idle", () => this.updatePhotoMarkers());
  }

  setLive(live: LiveData | null) {
    this.live = live;
    this.updateLive();
  }

  private updateLive() {
    const live = this.live;
    if (!live) { this.liveMarker?.remove(); this.liveMarker = null; return; }
    if (!this.liveMarker) {
      const el = document.createElement("button");
      el.className = "live-pin";
      el.type = "button";
      el.innerHTML = '<span class="live-pin__halo"></span><span class="live-pin__dot"></span>';
      el.addEventListener("click", (e) => { e.stopPropagation(); this.cb.onLive(); });
      this.liveMarker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(live.c).addTo(this.map);
    }
    const el = this.liveMarker.getElement();
    el.classList.toggle("is-stale", live.stale);
    el.setAttribute("aria-label", live.label);
    this.liveMarker.setLngLat(live.c);
  }

  private updatePlaces() {
    if (this.placeMarkers.length || !this.data) return;
    for (const p of this.data.route.places()) {
      // MapLibre drives the marker's own opacity (terrain occlusion), so visibility lives on an inner element
      const el = document.createElement("div");
      el.className = `place tier-${TIER1.has(p.n) ? 1 : TIER2.has(p.n) ? 2 : 3}`;
      const inner = document.createElement("span");
      inner.className = "place-label";
      inner.textContent = p.n.replace(" (Klondyke Corner)", "").replace(" · Stirling Point", "").replace(" · Meretoto", "").replace("Lake Coleridge · Rakaia", "Rakaia").replace(" · Aparima", "");
      el.appendChild(inner);
      this.placeMarkers.push(new maplibregl.Marker({ element: el, anchor: "left", offset: [8, 0] }).setLngLat(p.c).addTo(this.map));
    }
    this.updatePlaceVisibility();
  }

  private updatePlaceVisibility() {
    const z = this.map.getZoom();
    const c = this.map.getContainer().classList;
    c.toggle("z-low", z < 7);
    c.toggle("z-mid", z >= 7 && z < 8.8);
  }

  private async updatePhotoMarkers() {
    const m = this.map;
    if (!m.getSource("photos") || this.replaying) return;
    const feats = m.querySourceFeatures("photos");
    const seen = new Set<string>();
    const src = this.src("photos")!;
    for (const f of feats as MapGeoJSONFeature[]) {
      const p = f.properties as Record<string, unknown>;
      const coords = (f.geometry as GeoJSON.Point).coordinates as LngLat;
      const key = p.cluster ? `c${p.cluster_id}` : `p${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.photoMarkers.has(key)) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "photo-pin";
      if (p.cluster) {
        const count = Number(p.point_count);
        el.innerHTML = `<span class="photo-pin__count">${count}</span>`;
        el.setAttribute("aria-label", `${count} photos`);
        try {
          const leaves = await src.getClusterLeaves(Number(p.cluster_id), 1, 0);
          const thumb = leaves[0]?.properties?.thumb;
          if (thumb) el.insertAdjacentHTML("afterbegin", `<img alt="" loading="lazy" decoding="async" src="${thumb}">`);
        } catch (_) { /* cluster vanished */ }
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          const zoom = await src.getClusterExpansionZoom(Number(p.cluster_id));
          m.easeTo({ center: coords, zoom: Math.min(zoom + 0.3, 16), duration: reduceMotion() ? 0 : 700 });
        });
      } else {
        el.innerHTML = `<img alt="" loading="lazy" decoding="async" src="${p.thumb}">${p.video ? '<span class="photo-pin__play" aria-hidden="true"></span>' : ""}`;
        el.setAttribute("aria-label", "Photo");
        el.addEventListener("click", (e) => { e.stopPropagation(); this.cb.onPhoto(Number(p.n), String(p.id)); });
      }
      this.photoMarkers.set(key, new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(coords).addTo(m));
    }
    for (const [key, mk] of this.photoMarkers) {
      if (!seen.has(key)) { mk.remove(); this.photoMarkers.delete(key); }
    }
  }

  private handleClick(point: maplibregl.Point) {
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [[point.x - 8, point.y - 8], [point.x + 8, point.y + 8]];
    const feats = this.map.queryRenderedFeatures(box, { layers: ["day-ends", "days-hit"].filter((l) => this.map.getLayer(l)) });
    const f = feats[0];
    if (f?.properties?.n) this.cb.onDay(Number(f.properties.n));
  }

  // ------------------------------------------------------------- selection & camera
  setPadding(p: Partial<typeof this.padding>, animate = true) {
    this.padding = { ...this.padding, ...p };
    if (this.replaying) return;
    this.map.easeTo({ padding: this.padding, duration: animate && !reduceMotion() ? 350 : 0 });
  }

  select(day: Day | null) {
    this.selected = day;
    if (this.src("route")) this.pushData();
  }

  flyToDay(day: Day, route: Route) {
    if (day.start_km === null || day.end_km === null) return;
    let lines = route.slice(day.start_km, day.end_km);
    if (!lines.length) {
      const c = day.end_lng !== null && day.end_lat !== null ? [day.end_lng, day.end_lat] as LngLat : route.pointAt(day.end_km);
      this.map.flyTo({ center: c, zoom: 12.5, pitch: 55, padding: this.padding, duration: reduceMotion() ? 0 : 1800, essential: true });
      return;
    }
    const b = route.bounds(lines)!;
    const a = route.pointAt(day.start_km), z = route.pointAt(day.end_km);
    const brg = bearingDeg(a, z);
    // the transform already carries the UI padding (sheet/panel); only add a small margin here
    let cam: maplibregl.CameraOptions | undefined;
    try { cam = this.map.cameraForBounds(b, { padding: 36, bearing: brg, maxZoom: 13.5 }); } catch (_) { cam = undefined; }
    lines = [];
    this.map.flyTo({
      center: cam?.center ?? z, zoom: Math.max(5, (cam?.zoom ?? 12) - 0.35), bearing: brg, pitch: 58,
      padding: this.padding, duration: reduceMotion() ? 0 : 2200, curve: 1.3, essential: true,
    });
  }

  flyTo(c: LngLat, zoom = 12.5) {
    this.map.flyTo({ center: c, zoom, pitch: 55, padding: this.padding, duration: reduceMotion() ? 0 : 2000, essential: true });
  }

  overview(route: Route) {
    const lines = route.parts.map((p) => Array.from(p.lng, (x, i) => [x, p.lat[i]] as LngLat));
    const b = route.bounds(lines)!;
    try {
      this.map.fitBounds(b, { padding: 30, pitch: 0, bearing: 0, duration: reduceMotion() ? 0 : 1600, maxZoom: 7.5 });
    } catch (_) {
      this.map.jumpTo({ center: [171.2, -43.9], zoom: 5.2, pitch: 0, bearing: 0 });
    }
  }

  /** First arrival: from the whole island down to where Ewan is. */
  async intro(target: LngLat | null, route: Route) {
    await this.whenReady();
    if (!target || reduceMotion()) {
      if (target) this.map.jumpTo({ center: target, zoom: 10.5, pitch: 50, padding: this.padding });
      else this.overview(route);
      return;
    }
    const brg = route.bearingAt(route.nearest(target).km, 8);
    this.map.flyTo({
      center: target, zoom: 10.6, pitch: 58, bearing: brg - 25,
      padding: this.padding, duration: 4200, curve: 1.6, essential: true,
    });
  }

  toggle3d(): boolean {
    const flat = this.map.getPitch() > 5;
    this.map.easeTo({ pitch: flat ? 0 : 58, bearing: flat ? 0 : this.map.getBearing(), duration: reduceMotion() ? 0 : 700 });
    return !flat;
  }

  is3d() { return this.map.getPitch() > 5; }

  resize() { this.map.resize(); }
}

function bearingDeg(a: LngLat, b: LngLat): number {
  const toR = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * toR) * Math.cos(b[1] * toR);
  const x = Math.cos(a[1] * toR) * Math.sin(b[1] * toR) - Math.sin(a[1] * toR) * Math.cos(b[1] * toR) * Math.cos((b[0] - a[0]) * toR);
  return ((Math.atan2(y, x) / toR) + 360) % 360;
}
