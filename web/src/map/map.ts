import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mediaUrl, OFFLINE_MAP } from "../config";
import { destination, haversine, type LngLat, type Route } from "../lib/geo";
import type { Day, Media } from "../types";
import { installIcons } from "./icons";
import { fold, GROUP_OF, KIND_COLOR, PRIORITY, type Poi, type PoiGroup, type PoiKind } from "./pois";
import { flyAlong } from "./replay";
import { buildStyle, FONT, OFFLINE_FONT, shadeColors, sky, SKY_DAY, SKY_NIGHT, sunLight, type BaseStyle } from "./style";
import { skyFor, sunPosition } from "./sun";

export const ORANGE = "#FF6B12";
const SOUTH_ISLAND: [LngLat, LngLat] = [[166.4, -47.3], [174.5, -40.45]];
const F = OFFLINE_MAP ? OFFLINE_FONT : FONT;

/** Label tiers for the trail's own stations: 1 = always, 2 = regional zoom, 3 = close-up only. */
const TIER1 = new Set(["Ship Cove · Meretoto", "St Arnaud", "Arthur's Pass (Klondyke Corner)", "Lake Tekapo", "Queenstown", "Bluff · Stirling Point"]);
const TIER2 = new Set(["Havelock", "Boyle Village", "Lake Coleridge · Rakaia", "Twizel", "Wānaka", "Invercargill"]);
const stationName = (n: string) => n.replace(" (Klondyke Corner)", "").replace(" · Stirling Point", "").replace(" · Meretoto", "").replace("Lake Coleridge · Rakaia", "Rakaia").replace(" · Aparima", "");

export interface MapData {
  route: Route;
  days: Day[];
  walked: { hike: [number, number][]; transfer: [number, number][] };
  photos: { m: Media; c: LngLat; day: Day }[];
  recent: LngLat[];
}

export interface LiveData { c: LngLat; stale: boolean; label: string; name: string }

export interface MapCallbacks {
  onDay: (dayNumber: number) => void;
  onPhoto: (dayNumber: number, mediaId: string) => void;
  onLive: () => void;
  onPlace: (id: string) => void;
  onStation: (index: number) => void;
  /** the person moved the map themselves */
  onInteract?: () => void;
  /** the person touched, clicked or scrolled the map (camera shows give way) */
  onUserInput?: () => void;
}

type Padding = { top: number; right: number; bottom: number; left: number };
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const multi = (lines: LngLat[][]): GeoJSON.Feature => ({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } });
const zi = (stops: [number, number][]) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()] as unknown as number;

const POI_LAYERS: { id: string; kind: PoiKind; minzoom: number; filter?: unknown[] }[] = [
  { id: "poi-view", kind: "view", minzoom: 12 },
  { id: "poi-fall", kind: "fall", minzoom: 11.5 },
  { id: "poi-peak-minor", kind: "peak", minzoom: 12, filter: ["<", ["coalesce", ["get", "e"], 0], 1600] },
  { id: "poi-peak", kind: "peak", minzoom: 10.2, filter: ["all", [">=", ["coalesce", ["get", "e"], 0], 1600], ["<", ["coalesce", ["get", "e"], 0], 2400]] },
  { id: "poi-peak-major", kind: "peak", minzoom: 8.4, filter: [">=", ["coalesce", ["get", "e"], 0], 2400] },
  { id: "poi-camp", kind: "camp", minzoom: 10.5 },
  { id: "poi-pass", kind: "pass", minzoom: 9.8 },
  { id: "poi-hut", kind: "hut", minzoom: 9.2 },
  { id: "poi-gap", kind: "gap", minzoom: 6.5 },
];
const INTERACTIVE = [...POI_LAYERS.map((l) => l.id), "station-1", "station-2", "station-3"];

export class TrailMap {
  map: MLMap;
  private base: BaseStyle = "explore";
  private dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  private linzKey: string | null = null;
  private land?: GeoJSON.Feature;
  private contours = true;
  private sunOn = false;
  private sunTimer: number | undefined;
  private data: MapData | null = null;
  private live: LiveData | null = null;
  private pois: Poi[] = [];
  private groups = new Set<PoiGroup>(["huts", "camps", "summits", "sights"]);
  private selectedAt: LngLat | null = null;
  private photosKey = "";
  private selected: Day | null = null;
  private liveMarker: maplibregl.Marker | null = null;
  private photoMarkers = new Map<string, maplibregl.Marker>();
  private photoGen = 0;
  private padding: Padding = { top: 80, right: 24, bottom: 220, left: 24 };
  /** a finger or the mouse is moving the map: camera changes wait until it lets go */
  private gesturing = false;
  private pendingPadding: Padding | null = null;
  private paddingAfterFlight = false;
  private poiFilter: Set<string> | null = null;
  private stopShowFn: (() => void) | null = null;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private styleGen = 0;
  replaying = false;

  constructor(container: HTMLElement, private cb: MapCallbacks, land?: GeoJSON.Feature,
    init: { base?: BaseStyle; contours?: boolean; sun?: boolean; groups?: Iterable<PoiGroup> } = {}) {
    this.land = land;
    if (init.base) this.base = init.base;
    if (init.contours !== undefined) this.contours = init.contours;
    if (init.groups) this.groups = new Set(init.groups);
    if (init.sun) {
      this.sunOn = true;
      this.sunTimer = window.setInterval(() => this.applySun(), 5 * 60_000);
    }
    this.ready = new Promise((r) => (this.resolveReady = r));
    this.map = new maplibregl.Map({
      container,
      style: buildStyle(this.base, this.styleOpts()),
      bounds: SOUTH_ISLAND,
      fitBoundsOptions: { padding: 40 },
      maxPitch: 85,
      attributionControl: false,
      fadeDuration: 180,
      renderWorldCopies: false,
      cooperativeGestures: false,
      canvasContextAttributes: { antialias: true },
    } as maplibregl.MapOptions);
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    this.map.on("style.load", () => { void this.installOverlays(); });
    this.map.once("load", () => this.resolveReady());
    for (const ev of ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const) {
      this.map.on(ev, (e: { originalEvent?: Event }) => {
        if (!e.originalEvent) return;
        this.gesturing = true;
        this.stopShow(); // a camera show never fights the person's hand
        if (ev === "dragstart") this.cb.onInteract?.();
      });
    }
    // Camera shows move the map every frame, which resets MapLibre's gesture handlers: a finger would never
    // become a "drag". So the first touch, click or wheel on the map itself is what makes a show give way.
    const cc = this.map.getCanvasContainer();
    cc.addEventListener("pointerdown", this.onRawInput, { capture: true, passive: true });
    cc.addEventListener("wheel", this.onRawInput, { capture: true, passive: true });
    this.map.on("moveend", () => {
      if (this.gesturing) {
        this.gesturing = false;
        if (this.pendingPadding) {
          const p = this.pendingPadding;
          this.pendingPadding = null;
          // not from inside the event: a camera call there can tangle with the move that just ended
          requestAnimationFrame(() => { if (!this.gesturing && !this.map.isEasing()) this.paddingInPlace(p); });
        }
      }
      this.updatePhotoMarkers();
    });
    this.map.on("click", (e) => this.handleClick(e.point));
    this.map.on("mousemove", (e) => {
      const layers = [...INTERACTIVE, "day-ends", "days-hit"].filter((l) => this.map.getLayer(l));
      const hit = this.map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers }).length > 0;
      this.map.getCanvas().style.cursor = hit ? "pointer" : "";
    });
    this.schemeQuery.addEventListener("change", this.onScheme);
  }

  private schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  private onScheme = (e: MediaQueryListEvent) => {
    this.dark = e.matches;
    this.applyStyle();
  };
  /** someone (or something they asked for) has moved the camera: the arrival flight must not take it back */
  private cameraClaimed = false;
  claimCamera() { this.cameraClaimed = true; }

  private onRawInput = (e: Event) => {
    if (e.type === "pointerdown" && (e as PointerEvent).button > 0) return;
    this.cameraClaimed = true;
    this.stopShow();
    this.cb.onUserInput?.();
  };

  /** Everything the map set up outside itself, then the map. */
  destroy() {
    clearInterval(this.sunTimer);
    this.schemeQuery.removeEventListener("change", this.onScheme);
    const cc = this.map.getCanvasContainer();
    cc.removeEventListener("pointerdown", this.onRawInput, { capture: true });
    cc.removeEventListener("wheel", this.onRawInput, { capture: true });
    this.stopShow();
    this.map.remove();
  }

  whenReady() { return this.ready; }

  /**
   * Start a camera move and run `then` once that very move has ended, even when it ends at once
   * (reduced motion makes moves instant, and their "moveend" comes before a listener added afterwards).
   */
  private moveThen(start: () => void, then: () => void) {
    const m = this.map;
    m.stop(); // whatever was moving ends now, so its "moveend" isn't taken for this one's
    m.once("moveend", then);
    start();
  }

  // ------------------------------------------------------------- style
  /**
   * With "light right now" on, the map follows the hour in New Zealand: sunlit relief by day, dark at
   * night (like Apple Maps does at night), whatever the visitor's own clock says.
   */
  private sunState(): { sun: { azimuth: number; altitude: number } | null; night: boolean } {
    if (!this.sunOn) return { sun: null, night: false };
    const s = this.sunNow();
    return s.altitude < -6 ? { sun: null, night: true } : { sun: s, night: false };
  }
  /** what the map is drawn in right now (the overlays follow it) */
  private mapDark = this.dark;
  private sunNight = false;

  private styleOpts() {
    const { sun, night } = this.sunState();
    this.sunNight = night;
    this.mapDark = this.dark || night;
    return {
      dark: this.mapDark, linzKey: this.linzKey, land: this.land, contours: this.contours,
      sun, sky: night ? SKY_NIGHT : sun ? skyFor(sun.altitude, this.mapDark) : null,
    };
  }

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

  setContours(on: boolean) {
    if (on === this.contours) return;
    this.contours = on;
    if (this.base === "explore") this.applyStyle();
  }
  get contoursOn() { return this.contours; }

  /** Relief lit by the sun as it is right now where Ewan is (refreshed every few minutes). */
  setSunLight(on: boolean) {
    this.sunOn = on;
    clearInterval(this.sunTimer);
    if (on) this.sunTimer = window.setInterval(() => this.applySun(), 5 * 60_000);
    this.applySun();
  }
  get sunLightOn() { return this.sunOn; }

  private sunNow() {
    const c = this.live?.c ?? (this.map ? (this.map.getCenter().toArray() as LngLat) : [172.5, -43.5]);
    return sunPosition(new Date(), c[1], c[0]);
  }

  private applySun() {
    const m = this.map;
    const { sun, night } = this.sunState();
    // night falls (or day breaks) in New Zealand: the map changes palette
    if (night !== this.sunNight) { this.applyStyle(); return; }
    if (!m.getLayer("hillshade")) return;
    const light = sunLight(sun);
    const tint = shadeColors(this.mapDark, this.base === "satellite" && !OFFLINE_MAP, sun?.altitude ?? null);
    m.setPaintProperty("hillshade", "hillshade-illumination-anchor", light.anchor);
    m.setPaintProperty("hillshade", "hillshade-illumination-direction", light.direction);
    m.setPaintProperty("hillshade", "hillshade-illumination-altitude", light.altitude);
    m.setPaintProperty("hillshade", "hillshade-shadow-color", tint.shadow);
    m.setPaintProperty("hillshade", "hillshade-highlight-color", tint.highlight);
    m.setSky(sky(sun ? skyFor(sun.altitude, this.mapDark) : this.mapDark ? SKY_NIGHT : SKY_DAY));
  }

  private applyStyle() {
    this.map.setStyle(buildStyle(this.base, this.styleOpts()), { diff: false });
  }

  private async installOverlays() {
    const m = this.map;
    const gen = ++this.styleGen;
    this.photosKey = ""; // fresh sources after a style switch
    const sat = this.base === "satellite" && !OFFLINE_MAP;
    const add = (id: string) => { if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty }); };
    ["route", "gaps", "walked", "transfer", "selected", "day-ends", "days-hit", "recent", "replay", "pois", "poi-selected", "stations"].forEach(add);
    if (!m.getSource("photos")) {
      m.addSource("photos", { type: "geojson", data: empty, cluster: true, clusterRadius: 70, clusterMaxZoom: 14 });
    }
    const dark = this.mapDark;
    const routeColor = sat ? "#ffffff" : dark ? "#e3e7ec" : "#2c3640";
    const casing = sat ? "rgba(0,0,0,0.45)" : dark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.95)";
    const w = (a: number, b: number) => zi([[5, a], [12, b]]);
    // trail lines sit under the place names, like roads do
    const before = ["contour-label", "water-name"].find((l) => m.getLayer(l));
    const line = (spec: maplibregl.LayerSpecification) => m.addLayer(spec, before);

    line({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": casing, "line-width": w(3, 6.5) } });
    line({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": routeColor, "line-width": w(1.2, 2.8), "line-opacity": sat ? 0.9 : 0.8 } });
    line({ id: "gaps", type: "line", source: "gaps", layout: { "line-cap": "round" }, paint: { "line-color": routeColor, "line-width": w(1, 2), "line-opacity": 0.6, "line-dasharray": [0.1, 2.2] } });
    line({ id: "transfer", type: "line", source: "transfer", layout: { "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(1.5, 3), "line-dasharray": [0.1, 1.8] } });
    line({ id: "walked-glow", type: "line", source: "walked", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(7, 16), "line-blur": w(4, 9), "line-opacity": sat ? 0.45 : 0.3 } });
    line({ id: "walked", type: "line", source: "walked", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(2.6, 5.2) } });
    line({ id: "recent", type: "line", source: "recent", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(1.5, 3), "line-opacity": 0.9, "line-dasharray": [0.6, 1.4] } });
    line({ id: "selected-halo", type: "line", source: "selected", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": w(7, 12), "line-opacity": 0.95 } });
    line({ id: "selected", type: "line", source: "selected", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(3.5, 6.5) } });
    line({ id: "replay", type: "line", source: "replay", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": w(3, 5) } });
    m.addLayer({ id: "days-hit", type: "line", source: "days-hit", paint: { "line-color": "#000", "line-width": 22, "line-opacity": 0 } });
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
    // invisible layer so photo clusters are computed (markers are HTML)
    m.addLayer({ id: "photos-probe", type: "circle", source: "photos", paint: { "circle-radius": 1, "circle-opacity": 0 } });

    // points of interest and the trail's own stations: icons need to exist before their layers
    await installIcons(m, dark || sat);
    if (gen !== this.styleGen || !m.getSource("pois")) return; // the style changed again meanwhile
    const halo = sat ? "rgba(0,0,0,0.7)" : dark ? "rgba(14,16,19,0.9)" : "rgba(255,255,255,0.95)";
    m.addLayer({ id: "poi-ring", type: "symbol", source: "poi-selected", layout: { "icon-image": "poi-ring", "icon-allow-overlap": true, "icon-ignore-placement": true } });
    for (const L of POI_LAYERS) {
      const color = KIND_COLOR[L.kind][dark || sat ? "dark" : "light"];
      const isPeak = L.kind === "peak";
      const label: unknown = isPeak
        ? ["case", ["has", "e"], ["format", ["get", "n"], {}, "\n", {}, ["concat", ["number-format", ["get", "e"], { locale: "fr-FR" }], " m"], { "font-scale": 0.86, "text-font": ["literal", F.regular] }], ["get", "n"]]
        : ["get", "n"];
      m.addLayer({
        id: L.id, type: "symbol", source: "pois", minzoom: this.poiFilter ? 0 : L.minzoom,
        filter: this.layerFilter(L),
        layout: {
          "icon-image": isPeak ? "poi-peak" : `poi-${L.kind}`,
          "icon-size": isPeak ? 1 : zi([[L.minzoom, 0.82], [13, 1]]),
          "icon-padding": 1,
          "text-field": isPeak || L.kind === "gap" ? label : ["step", ["zoom"], "", Math.max(11, L.minzoom + 1), label],
          "text-font": F.bold,
          "text-size": isPeak ? 11 : 11.5,
          "text-anchor": "top",
          "text-offset": isPeak ? [0, 0.55] : [0, 1.05],
          "text-max-width": 8,
          "text-optional": true,
          "symbol-sort-key": ["get", "p"],
          visibility: this.poiFilter || this.visibleKind(L.kind) ? "visible" : "none",
        } as maplibregl.SymbolLayerSpecification["layout"],
        paint: {
          "text-color": isPeak ? (dark || sat ? "#f2f2f7" : "#3a3a3c") : color,
          "text-halo-color": halo, "text-halo-width": 1.4,
        },
      } as maplibregl.LayerSpecification);
    }
    const stationLayer = (tier: number, minzoom: number) => m.addLayer({
      id: `station-${tier}`, type: "symbol", source: "stations", minzoom,
      filter: ["==", ["get", "tier"], tier],
      layout: {
        "icon-image": "station", "icon-size": zi([[5, 0.75], [10, 1]]), "icon-allow-overlap": tier === 1,
        "text-field": ["get", "n"], "text-font": F.bold, "text-size": zi([[5, 12], [10, 13.5]]),
        "text-anchor": "left", "text-offset": [0.8, 0], "text-optional": tier !== 1, "text-max-width": 9,
      },
      paint: { "text-color": sat || dark ? "#ffffff" : "#16191d", "text-halo-color": halo, "text-halo-width": 1.6 },
    });
    stationLayer(3, 8.6);
    stationLayer(2, 6.8);
    stationLayer(1, 0);

    this.pushData();
    this.pushPois();
    if (this.sunOn) this.applySun();
  }

  // ------------------------------------------------------------- data
  setData(data: MapData) {
    this.data = data;
    // (not isStyleLoaded(): that stays false while tiles load, and the data would be dropped)
    if (this.src("route")) this.pushData();
  }

  setPois(list: Poi[]) {
    this.pois = list;
    this.pushPois();
  }

  /** Which groups of places are shown (chips in the explore panel). */
  setPoiGroups(groups: Iterable<PoiGroup>) {
    this.groups = new Set(groups);
    this.refreshPoiLayers();
  }

  /** Show only these places, at every zoom (search results), or everything again (null). */
  setPoiFilter(ids: string[] | null) {
    const next = ids ? new Set(ids) : null;
    if (!next && !this.poiFilter) return;
    this.poiFilter = next;
    this.refreshPoiLayers();
  }

  private layerFilter(L: (typeof POI_LAYERS)[number]): maplibregl.FilterSpecification {
    const parts: unknown[] = [["==", ["get", "t"], L.kind]];
    if (L.filter && !this.poiFilter) parts.push(L.filter);
    if (this.poiFilter) parts.push(["in", ["get", "id"], ["literal", [...this.poiFilter]]]);
    return ["all", ...parts] as maplibregl.FilterSpecification;
  }

  private refreshPoiLayers() {
    const m = this.map;
    for (const L of POI_LAYERS) {
      if (!m.getLayer(L.id)) continue;
      m.setLayoutProperty(L.id, "visibility", this.poiFilter || this.visibleKind(L.kind) ? "visible" : "none");
      m.setFilter(L.id, this.layerFilter(L));
      m.setLayerZoomRange(L.id, this.poiFilter ? 0 : L.minzoom, 24);
    }
  }

  private visibleKind(k: PoiKind) {
    const g = GROUP_OF[k];
    return g === null || this.groups.has(g);
  }

  /** The ring around the place whose card is open (or none). */
  selectAt(c: LngLat | null) {
    this.selectedAt = c;
    this.src("poi-selected")?.setData(c ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } } : empty);
  }

  private pushPois() {
    const s = this.src("pois");
    if (!s) return;
    s.setData({
      type: "FeatureCollection",
      features: this.pois.map((p) => ({
        type: "Feature",
        properties: { id: p.id, t: p.t, n: p.n, p: PRIORITY[p.t] * 10000 - (p.e ?? 0) / 10, ...(p.e !== null ? { e: p.e } : {}) },
        geometry: { type: "Point", coordinates: p.c },
      })),
    });
    if (this.selectedAt) this.selectAt(this.selectedAt);
    this.pushStations();
  }

  private src(id: string) { return this.map.getSource(id) as GeoJSONSource | undefined; }

  /** The trail's own stops, except those the places already show under the same name (Waiau Pass). */
  private pushStations() {
    const d = this.data;
    const s = this.src("stations");
    if (!d || !s) return;
    const names = new Map<string, LngLat[]>();
    for (const p of this.pois) { const k = fold(p.n); names.set(k, [...(names.get(k) ?? []), p.c]); }
    s.setData({
      type: "FeatureCollection",
      features: d.route.places().flatMap((p, i) => {
        const n = stationName(p.n);
        if ((names.get(fold(n)) ?? []).some((c) => haversine(c, p.c) < 1500)) return [];
        return [{
          type: "Feature" as const, properties: { i, n, tier: TIER1.has(p.n) ? 1 : TIER2.has(p.n) ? 2 : 3 },
          geometry: { type: "Point" as const, coordinates: p.c },
        }];
      }),
    });
  }

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
    this.pushStations();

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
      this.photoGen++; // any marker pass still running belongs to the old photos
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
      el.innerHTML = '<span class="live-pin__halo"></span><span class="live-pin__dot"></span><span class="live-pin__label"></span>';
      el.addEventListener("click", (e) => { e.stopPropagation(); this.cb.onLive(); });
      this.liveMarker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(live.c).addTo(this.map);
    }
    const el = this.liveMarker.getElement();
    el.classList.toggle("is-stale", live.stale);
    el.setAttribute("aria-label", live.label);
    const tag = el.querySelector(".live-pin__label");
    if (tag && tag.textContent !== live.name) tag.textContent = live.name;
    this.liveMarker.setLngLat(live.c);
  }

  private async updatePhotoMarkers() {
    const m = this.map;
    if (!m.getSource("photos") || this.replaying) return;
    // passes can overlap (moveend + idle) and await below: only the latest one may add or remove markers
    const gen = ++this.photoGen;
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
        if (gen !== this.photoGen) return;
        if (this.photoMarkers.has(key)) continue;
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
    if (gen !== this.photoGen) return;
    for (const [key, mk] of this.photoMarkers) {
      if (!seen.has(key)) { mk.remove(); this.photoMarkers.delete(key); }
    }
  }

  private handleClick(point: maplibregl.Point) {
    const box = (r: number): [maplibregl.PointLike, maplibregl.PointLike] => [[point.x - r, point.y - r], [point.x + r, point.y + r]];
    const layers = (ids: string[]) => ids.filter((l) => this.map.getLayer(l));
    const place = this.map.queryRenderedFeatures(box(10), { layers: layers(INTERACTIVE) })[0];
    if (place) {
      const p = place.properties ?? {};
      if (place.layer.id.startsWith("station-")) this.cb.onStation(Number(p.i));
      else if (p.id) this.cb.onPlace(String(p.id));
      return;
    }
    const f = this.map.queryRenderedFeatures(box(8), { layers: layers(["day-ends", "days-hit"]) })[0];
    if (f?.properties?.n) this.cb.onDay(Number(f.properties.n));
  }

  // ------------------------------------------------------------- selection & camera
  setPadding(p: Partial<Padding>, animate = true) {
    this.padding = { ...this.padding, ...p };
    if (this.replaying) return;
    // while the map is in someone's hand, don't move it: change the padding without moving the view once they let go
    if (this.gesturing) { this.pendingPadding = this.padding; return; }
    // a flight is on its way: don't cut it short, settle into the new padding when it lands
    if (this.map.isEasing()) {
      if (!this.paddingAfterFlight) {
        this.paddingAfterFlight = true;
        // never start an ease from inside "moveend": when that event comes from a new flight stopping the old
        // one, two animations end up running at once and the map stops drawing
        this.map.once("moveend", () => requestAnimationFrame(() => {
          this.paddingAfterFlight = false;
          if (!this.gesturing && !this.replaying && !this.map.isEasing()) this.map.easeTo({ padding: this.padding, duration: reduceMotion() ? 0 : 350 });
        }));
      }
      return;
    }
    this.map.easeTo({ padding: this.padding, duration: animate && !reduceMotion() ? 350 : 0 });
  }
  get viewPadding() { return this.padding; }

  /** New padding, same picture: the point at the new padded centre becomes the centre. */
  private paddingInPlace(p: Padding) {
    const m = this.map;
    const el = m.getContainer();
    const x = (p.left + el.clientWidth - p.right) / 2, y = (p.top + el.clientHeight - p.bottom) / 2;
    try { m.jumpTo({ center: m.unproject([x, y]), padding: p }); } catch (_) { m.jumpTo({ padding: p }); }
  }

  select(day: Day | null) {
    this.selected = day;
    if (this.src("route")) this.pushData();
  }

  flyToDay(day: Day, route: Route) {
    this.cameraClaimed = true;
    if (day.start_km === null || day.end_km === null) return;
    const lines = route.slice(day.start_km, day.end_km);
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
    this.map.flyTo({
      center: cam?.center ?? z, zoom: Math.max(5, (cam?.zoom ?? 12) - 0.35), bearing: brg, pitch: 58,
      padding: this.padding, duration: reduceMotion() ? 0 : 2200, curve: 1.3, essential: true,
    });
  }

  /** Frame a set of places (search results). */
  fitPlaces(cs: LngLat[]) {
    this.cameraClaimed = true;
    if (!cs.length) return;
    if (cs.length === 1) { this.flyTo(cs[0], 12.4, 50); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of cs) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    try {
      this.map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 50, maxZoom: 12.5, pitch: 40, duration: reduceMotion() ? 0 : 1400 });
    } catch (_) { /* degenerate bounds */ }
  }

  flyTo(c: LngLat, zoom = 12.5, pitch = 55) {
    this.cameraClaimed = true;
    this.map.flyTo({ center: c, zoom, pitch, padding: this.padding, duration: reduceMotion() ? 0 : 2000, essential: true });
  }

  /** Close-up on a place, looking along the trail (peaks from a little further, to see the mountain). */
  flyToPlace(c: LngLat, route: Route, km: number | null, kind?: string) {
    this.cameraClaimed = true;
    const brg = km !== null ? route.bearingAt(km, 3) : this.map.getBearing();
    const zoom = kind === "peak" ? 12.4 : kind === "town" ? 12.6 : kind === "gap" ? 11.2 : kind === "pass" ? 13 : 13.4;
    this.map.flyTo({ center: c, zoom, pitch: kind === "peak" ? 64 : 58, bearing: brg, padding: this.padding, duration: reduceMotion() ? 0 : 2200, curve: 1.4, essential: true });
  }

  /** Stop the orbit or the eye-level view, if one is running. */
  stopShow() {
    const f = this.stopShowFn;
    this.stopShowFn = null;
    f?.();
  }

  /**
   * Slowly circle a place in 3D, until stopped or the person touches the map. Returns the stop function,
   * or null when nothing turns (reduced motion: the camera just takes a 3D view of the place).
   */
  orbit(c: LngLat, onEnd: () => void, opts: { zoom?: number; pitch?: number; period?: number } = {}): (() => void) | null {
    this.stopShow();
    this.cameraClaimed = true;
    const m = this.map;
    const view = { center: c, zoom: opts.zoom ?? Math.max(12, Math.min(13.4, m.getZoom())), pitch: opts.pitch ?? 66, padding: this.padding };
    if (reduceMotion()) { m.jumpTo(view); return null; }
    let raf = 0, stopped = false, t0 = 0, b0 = m.getBearing();
    const period = opts.period ?? 40_000;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      if (this.replaying) {
        this.replaying = false;
        // settle into the padding the sheet may have asked for meanwhile (not while a finger is down)
        requestAnimationFrame(() => { if (!this.gesturing && !this.map.isEasing()) this.paddingInPlace(this.padding); });
      }
      if (this.stopShowFn === stop) this.stopShowFn = null;
      onEnd();
    };
    this.stopShowFn = stop;
    const frame = (now: number) => {
      if (stopped) return;
      if (!t0) t0 = now;
      m.jumpTo({ bearing: b0 + ((now - t0) / period) * 360 });
      raf = requestAnimationFrame(frame);
    };
    const begin = () => {
      if (stopped) return;
      b0 = m.getBearing();
      this.replaying = true; // no photo marker passes while the camera turns
      raf = requestAnimationFrame(frame);
    };
    this.moveThen(() => m.flyTo({ ...view, duration: 1600, essential: true }), begin);
    return stop;
  }

  /**
   * "What Ewan sees": a camera a few dozen metres above the ground just behind him, looking down the trail.
   * First a normal approach, so the relief there is loaded, then down to eye level. Touching the map on the
   * way cancels the descent; once there, the view is the person's to look around.
   */
  eyeLevel(at: LngLat, brg: number, groundM: number | null): () => void {
    this.stopShow();
    this.cameraClaimed = true;
    const m = this.map;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      if (this.stopShowFn === cancel) this.stopShowFn = null;
    };
    this.stopShowFn = cancel;
    const instant = reduceMotion();
    const descend = () => {
      if (cancelled) return;
      const ex = m.getTerrain()?.exaggeration ?? 1;
      const behind = destination(at, (brg + 180) % 360, 260);
      const ground = (p: LngLat) => {
        const g = m.queryTerrainElevation(p);
        return g !== null && g > 1 ? g : (groundM ?? 0) * ex;
      };
      const alt = Math.max(ground(behind), ground(at), ground(destination(at, brg, 300))) + 60;
      let cam: maplibregl.CameraOptions = { center: destination(at, brg, 900), zoom: 15, pitch: 80, bearing: brg };
      try {
        // keep only what the animation understands: an undefined `roll` would turn the matrices into NaN
        const c = m.calculateCameraOptionsFromCameraLngLatAltRotation(behind, alt, brg, 80);
        if (c.center && Number.isFinite(c.zoom)) cam = { center: c.center, zoom: c.zoom, pitch: 80, bearing: brg };
      } catch (_) { /* keep the fallback */ }
      this.moveThen(() => m.easeTo({ ...cam, padding: this.padding, duration: instant ? 0 : 3200, easing: easeInOut, essential: true }), cancel);
    };
    this.moveThen(
      () => m.flyTo({ center: at, zoom: 13.4, pitch: 62, bearing: brg, padding: this.padding, duration: instant ? 0 : 2600, curve: 1.3, essential: true }),
      // a moment for the relief tiles there to arrive (they set the ground height)
      () => { if (!cancelled) window.setTimeout(descend, instant ? 600 : 250); },
    );
    return cancel;
  }

  /** Put the camera over a km of the trail (used while scrubbing the profile). */
  follow(route: Route, km: number, animate = false) {
    const c = route.pointAt(km);
    const brg = route.bearingAt(km, 4);
    const opts = { center: c, zoom: 11.6, pitch: 62, bearing: brg, padding: this.padding };
    if (animate) this.map.easeTo({ ...opts, duration: 650 });
    else this.map.jumpTo(opts);
  }

  /** Fly along the whole trail (or part of it); returns a stop function. */
  flyover(route: Route, k0: number, k1: number, onProgress: (f: number, km: number) => void, onEnd: () => void) {
    const km = Math.abs(k1 - k0);
    return flyAlong(this, route, k0, k1, { duration: Math.min(90_000, Math.max(20_000, km * 45)), zoom: 11.2, pitch: 64, onProgress, onEnd });
  }

  overview(route: Route) {
    this.cameraClaimed = true;
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
    if (this.cameraClaimed) return; // the visitor was quicker than the map: their view wins
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
    this.cameraClaimed = true;
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
