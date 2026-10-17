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
  /** a tap on the map that hit nothing (closes the open card, like in Maps) */
  onEmptyTap?: () => void;
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

/** What a place is drawn with on the map, and its colour (the badge, the ripple when touched). */
function kindLook(kind: string | undefined): { img: string; color: string } {
  if (!kind || kind === "town") return { img: "station", color: "#F3F6FB" };
  const k = kind as PoiKind;
  return { img: k === "peak" ? "poi-peak" : `poi-${k}`, color: KIND_COLOR[k]?.dark ?? "#5CD6E6" };
}

export class TrailMap {
  map: MLMap;
  private base: BaseStyle = "explore";
  /** the site is drawn at night, whatever the visitor's own setting */
  private dark = true;
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
  private poiFilter: Set<string> | null = null;
  private stopShowFn: (() => void) | null = null;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private styleGen = 0;
  replaying = false;

  constructor(container: HTMLElement, private cb: MapCallbacks, land?: GeoJSON.Feature,
    init: { base?: BaseStyle; contours?: boolean; sun?: boolean; groups?: Iterable<PoiGroup>; arrival?: boolean } = {}) {
    this.land = land;
    if (init.arrival && !reduceMotion()) {
      // the walked trail and Ewan wait for the arrival to draw them (see drawIn); never longer than this
      this.drawKm = 0;
      this.armArrivalFallback();
    }
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
      // MapLibre leaves the height of the map's centre frozen after a scripted flight over terrain (only a
      // gesture unfreezes it), so relief that arrives after the camera never lifts it and the place in the
      // middle drifts up the screen, by a lot for a hut at 1 500 m. Let the centre follow the ground again.
      const ml = this.map as unknown as { _elevationFreeze?: boolean };
      if (!this.gesturing && ml._elevationFreeze && !this.map.isEasing()) ml._elevationFreeze = false;
      if (this.gesturing) this.gesturing = false;
      if (this.pendingPadding) {
        // not from inside the event: a camera call there can tangle with the move that just ended
        requestAnimationFrame(() => {
          const p = this.pendingPadding;
          if (!p || this.gesturing || this.replaying || this.map.isEasing()) return;
          this.pendingPadding = null;
          this.paddingInPlace(p);
        });
      }
      this.updatePhotoMarkers();
    });
    this.map.on("click", (e) => this.handleClick(e.point));
    // with a mouse, the place under the pointer gets a ring before it is clicked
    let hoverRaf = 0;
    this.map.on("mousemove", (e) => {
      if (hoverRaf) return;
      const pt = e.point;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        const place = this.placeAt(pt, 14);
        const hit = place || this.map.queryRenderedFeatures([[pt.x - 6, pt.y - 6], [pt.x + 6, pt.y + 6]], { layers: ["day-ends", "days-hit"].filter((l) => this.map.getLayer(l)) }).length > 0;
        this.map.getCanvas().style.cursor = hit ? "pointer" : "";
        const c = place ? (place.geometry as GeoJSON.Point).coordinates as LngLat : null;
        const key = c ? c.join(",") : "";
        if (key === this.hoverKey) return;
        this.hoverKey = key;
        this.src("hover")?.setData(c ? { type: "Feature", properties: { c: kindLook(place!.layer.id.startsWith("station-") ? "town" : String(place!.properties?.t)).color }, geometry: { type: "Point", coordinates: c } } : empty);
      });
    });
    this.map.getCanvasContainer().addEventListener("mouseleave", () => { this.hoverKey = ""; this.src("hover")?.setData(empty); });
  }
  private hoverKey = "";
  /** someone (or something they asked for) has moved the camera: the arrival flight must not take it back */
  private cameraClaimed = false;
  claimCamera() { this.cameraClaimed = true; this.flightToken++; }
  /** whether the visitor (or something they asked for) has already moved the camera */
  get claimed() { return this.cameraClaimed; }
  /** going in from the presentation is asking for the arrival flight: earlier camera moves no longer count */
  unclaimCamera() { this.cameraClaimed = false; }

  private onRawInput = (e: Event) => {
    if (e.type === "pointerdown" && (e as PointerEvent).button > 0) return;
    this.cameraClaimed = true;
    this.flightToken++; // the map is theirs now: no re-centring behind their back
    this.stopShow();
    this.cb.onUserInput?.();
  };

  /** Everything the map set up outside itself, then the map. */
  destroy() {
    clearInterval(this.sunTimer);
    clearTimeout(this.arrivalTimer);
    this.drawGen++;
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
    this.hoverKey = "";
    const sat = this.base === "satellite" && !OFFLINE_MAP;
    const add = (id: string) => { if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty }); };
    ["route", "gaps", "walked", "transfer", "selected", "day-ends", "days-hit", "recent", "replay", "pois", "poi-selected", "stations", "hover", "pop", "comet-head"].forEach(add);
    if (!m.getSource("comet")) m.addSource("comet", { type: "geojson", data: empty, lineMetrics: true });
    if (!m.getSource("photos")) {
      m.addSource("photos", { type: "geojson", data: empty, cluster: true, clusterRadius: 70, clusterMaxZoom: 14 });
    }
    const dark = this.mapDark;
    // the trail still to walk: a pale line in the night; what Ewan walked: a lit tube of marker orange
    const routeColor = sat ? "#ffffff" : dark ? "#C3D2EA" : "#2c3640";
    const casing = sat ? "rgba(0,0,0,0.45)" : dark ? "rgba(3,8,18,0.7)" : "rgba(255,255,255,0.95)";
    const w = (a: number, b: number) => zi([[5, a], [12, b]]);
    // trail lines sit under the place names, like roads do
    const before = ["contour-label", "water-name"].find((l) => m.getLayer(l));
    const line = (spec: maplibregl.LayerSpecification) => m.addLayer(spec, before);
    const round = { "line-join": "round", "line-cap": "round" } as const;

    line({ id: "route-casing", type: "line", source: "route", layout: round, paint: { "line-color": casing, "line-width": w(3, 6.2) } });
    line({ id: "route", type: "line", source: "route", layout: round, paint: { "line-color": routeColor, "line-width": w(1.1, 2.6), "line-opacity": sat ? 0.9 : dark ? 0.62 : 0.8 } });
    line({ id: "gaps", type: "line", source: "gaps", layout: { "line-cap": "round" }, paint: { "line-color": routeColor, "line-width": w(1, 2), "line-opacity": 0.6, "line-dasharray": [0.1, 2.2] } });
    line({ id: "transfer", type: "line", source: "transfer", layout: { "line-cap": "round" }, paint: { "line-color": ORANGE, "line-width": w(1.5, 3), "line-dasharray": [0.1, 1.8] } });
    line({ id: "walked-glow", type: "line", source: "walked", layout: round, paint: { "line-color": ORANGE, "line-width": w(9, 20), "line-blur": w(6, 12), "line-opacity": sat ? 0.5 : dark ? 0.6 : 0.3 } });
    line({ id: "walked", type: "line", source: "walked", layout: round, paint: { "line-color": ORANGE, "line-width": w(2.6, 5) } });
    line({ id: "walked-core", type: "line", source: "walked", layout: round, paint: { "line-color": "#FFD9BD", "line-width": w(0.5, 1.3), "line-opacity": dark || sat ? 0.85 : 0 } });
    line({ id: "recent", type: "line", source: "recent", layout: round, paint: { "line-color": ORANGE, "line-width": w(1.5, 3), "line-opacity": 0.9, "line-dasharray": [0.6, 1.4] } });
    line({ id: "selected-halo", type: "line", source: "selected", layout: round, paint: { "line-color": dark || sat ? "#FFE9D9" : "#ffffff", "line-width": w(6.5, 11.5), "line-opacity": 0.9, "line-blur": dark ? 1.2 : 0 } });
    line({ id: "selected", type: "line", source: "selected", layout: round, paint: { "line-color": ORANGE, "line-width": w(3.4, 6.2) } });
    line({ id: "replay", type: "line", source: "replay", layout: round, paint: { "line-color": "#ffffff", "line-width": w(3, 5) } });
    // the presentation's light running along the trail (see introLoop): a fading tail, a hot head
    line({ id: "comet-glow", type: "line", source: "comet", layout: round, paint: { "line-width": w(12, 22), "line-blur": w(8, 14), "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,107,18,0)", 1, "rgba(255,107,18,0.6)"] } });
    line({ id: "comet", type: "line", source: "comet", layout: round, paint: { "line-width": w(2.6, 5), "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,107,18,0)", 0.75, "rgba(255,107,18,0.95)", 1, "#FFE6D2"] } });
    m.addLayer({ id: "comet-head-glow", type: "circle", source: "comet-head", paint: { "circle-radius": 18, "circle-color": ORANGE, "circle-opacity": 0.45, "circle-blur": 1, "circle-pitch-alignment": "viewport" } });
    m.addLayer({ id: "comet-head", type: "circle", source: "comet-head", paint: { "circle-radius": 4.5, "circle-color": "#FFF3EA", "circle-blur": 0.25, "circle-pitch-alignment": "viewport" } });
    m.addLayer({ id: "days-hit", type: "line", source: "days-hit", paint: { "line-color": "#000", "line-width": 22, "line-opacity": 0 } });
    m.addLayer({
      id: "day-ends", type: "circle", source: "day-ends",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"],
          5, ["case", ["boolean", ["get", "sel"], false], 6, 3],
          11, ["case", ["boolean", ["get", "sel"], false], 8, 5.5]],
        "circle-color": ["case", ["boolean", ["get", "sel"], false], ORANGE, dark ? "#0C1526" : "#ffffff"],
        "circle-stroke-color": ["case", ["boolean", ["get", "sel"], false], dark ? "#FFE9D9" : "#ffffff", ORANGE],
        "circle-stroke-width": ["case", ["boolean", ["get", "sel"], false], 3, 2.2],
        "circle-pitch-alignment": "viewport",
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 6.5, ["case", ["boolean", ["get", "sel"], false], 1, 0], 8, 1],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 6.5, ["case", ["boolean", ["get", "sel"], false], 1, 0], 8, 1],
      },
    });
    // invisible layer so photo clusters are computed (markers are HTML)
    m.addLayer({ id: "photos-probe", type: "circle", source: "photos", paint: { "circle-radius": 1, "circle-opacity": 0 } });

    // points of interest and the trail's own stations: icons need to exist before their layers
    await installIcons(m, dark || sat);
    if (gen !== this.styleGen || !m.getSource("pois")) return; // the style changed again meanwhile
    const halo = sat ? "rgba(0,0,0,0.7)" : dark ? "rgba(6,12,24,0.88)" : "rgba(255,255,255,0.95)";
    m.addLayer({ id: "poi-ring", type: "symbol", source: "poi-selected", layout: { "icon-image": "poi-ring", "icon-allow-overlap": true, "icon-ignore-placement": true } });
    // the place under the mouse
    m.addLayer({
      id: "poi-hover", type: "circle", source: "hover",
      paint: { "circle-radius": 16, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2, "circle-stroke-color": ["get", "c"], "circle-stroke-opacity": 0.85, "circle-pitch-alignment": "viewport" },
    });
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
          "text-color": isPeak ? (dark || sat ? "#DCE6F5" : "#3a3a3c") : color,
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
      paint: { "text-color": sat || dark ? "#F3F6FB" : "#16191d", "text-halo-color": halo, "text-halo-width": 1.6 },
    });
    stationLayer(3, 8.6);
    stationLayer(2, 6.8);
    stationLayer(1, 0);
    // the answer to a touch (see popAt()): a ring in the place's own colour
    m.addLayer({
      id: "pop-ripple", type: "circle", source: "pop",
      paint: { "circle-radius": 12, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2.5, "circle-stroke-color": ["get", "c"], "circle-stroke-opacity": 0, "circle-pitch-alignment": "viewport" },
    });
    m.addLayer({
      id: "pop-icon", type: "symbol", source: "pop",
      layout: { "icon-image": ["get", "img"], "icon-size": 1, "icon-allow-overlap": true, "icon-ignore-placement": true },
    });

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
    this.pushWalked();
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
    this.pushSelected();

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

  /** What Ewan walked, up to `drawKm` while the arrival animation draws it. */
  private pushWalked() {
    const d = this.data;
    if (!d || !this.src("walked")) return;
    const r = d.route, max = this.drawKm ?? Infinity;
    const upTo = (ranges: [number, number][]) => ranges.flatMap(([a, b]) => (a >= max ? [] : r.slice(a, Math.min(b, max))));
    this.src("walked")!.setData(multi(upTo(d.walked.hike)));
    this.src("transfer")!.setData(multi(upTo(d.walked.transfer)));
    this.src("recent")!.setData(this.drawKm === null && d.recent.length > 1 ? multi([d.recent]) : empty);
  }

  /** The open day's stretch of trail, drawn from its start while `selDraw` runs. */
  private pushSelected() {
    const d = this.data, sel = this.selected;
    if (!d || !this.src("selected")) return;
    if (!sel || sel.start_km === null || sel.end_km === null) { this.src("selected")!.setData(empty); return; }
    const k = this.selDraw ?? 1;
    const end = sel.start_km + (sel.end_km - sel.start_km) * k;
    this.src("selected")!.setData(multi(d.route.slice(sel.start_km, end)));
  }

  private drawKm: number | null = null;
  private drawGen = 0;
  private arrivalTimer: number | undefined;
  private arrivalHeld = false;

  /** The presentation is up: Ewan and his trail keep waiting for the arrival, however long it stays. */
  holdArrival(on: boolean) {
    this.arrivalHeld = on;
    clearTimeout(this.arrivalTimer);
    if (!on) this.armArrivalFallback();
  }

  /** Should the arrival never come (no news, a failing map), the trail and Ewan still show after a while. */
  private armArrivalFallback() {
    clearTimeout(this.arrivalTimer);
    this.arrivalTimer = window.setTimeout(() => { if (this.drawKm === 0 && !this.arrivalHeld) this.endArrival(); }, 12_000);
  }
  private selDraw: number | null = null;
  private selGen = 0;

  /**
   * The arrival: Ewan's walked trail draws itself from Ship Cove to where he is, then he lands with a ping.
   * The interface counts his kilometres up on the same clock: `t0` (performance.now()) and `duration`. If the
   * map is ready late, the drawing catches up with that clock; if it is ready after the end, he just lands.
   */
  drawIn(t0: number, duration: number): Promise<void> {
    const gen = ++this.drawGen;
    if (reduceMotion()) { this.endArrival(); return Promise.resolve(); }
    return this.whenReady().then(() => new Promise<void>((resolve) => {
      const frame = (now: number) => {
        if (gen !== this.drawGen) { resolve(); return; } // a newer one (or destroy) took over
        const d = this.data;
        const end = d ? Math.max(0, ...d.walked.hike.map(([, b]) => b), ...d.walked.transfer.map(([, b]) => b)) : 0;
        const t = Math.max(0, Math.min(1, (now - t0) / duration));
        if (t >= 1 || end <= 0.5) { this.endArrival(); resolve(); return; }
        this.drawKm = end * easeInOut(t);
        this.pushWalked();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }));
  }

  /** No arrival (a link straight to a day or a place): everything is drawn at once. */
  skipArrival() {
    this.drawGen++;
    if (this.drawKm === null) return;
    this.drawKm = null;
    this.pushWalked();
    this.liveMarker?.getElement().classList.remove("is-arriving");
  }

  private endArrival() {
    const was = this.drawKm !== null;
    this.drawKm = null;
    this.pushWalked();
    if (was || this.liveMarker?.getElement().classList.contains("is-arriving")) this.landMarker();
  }

  /** Ewan's marker appears where the drawn trail ends, with a ring going out from it. */
  private landMarker() {
    const el = this.liveMarker?.getElement();
    if (!el) return;
    el.classList.remove("is-arriving");
    el.classList.add("is-landing");
    const ping = document.createElement("span");
    ping.className = "live-pin__ping";
    el.appendChild(ping);
    window.setTimeout(() => { ping.remove(); el.classList.remove("is-landing"); }, 1400);
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
      if (this.drawKm !== null) el.classList.add("is-arriving");
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

  /** The place drawn closest to a point, within `r` px (a fingertip covers ~44 px). */
  private placeAt(point: maplibregl.Point, r: number): MapGeoJSONFeature | null {
    const layers = INTERACTIVE.filter((l) => this.map.getLayer(l));
    if (!layers.length) return null;
    const hits = this.map.queryRenderedFeatures([[point.x - r, point.y - r], [point.x + r, point.y + r]], { layers });
    let best: MapGeoJSONFeature | null = null, bestD = Infinity;
    for (const f of hits) {
      if (f.geometry.type !== "Point") continue;
      const q = this.map.project((f.geometry as GeoJSON.Point).coordinates as LngLat);
      const d = Math.hypot(q.x - point.x, q.y - point.y);
      if (d < bestD) { best = f; bestD = d; }
    }
    return best;
  }

  private handleClick(point: maplibregl.Point) {
    const best = this.placeAt(point, 22);
    if (best) {
      const p = best.properties ?? {};
      const station = best.layer.id.startsWith("station-");
      if (station) this.cb.onStation(Number(p.i));
      else if (p.id) this.cb.onPlace(String(p.id));
      const look = kindLook(station ? "town" : String(p.t));
      this.popAt((best.geometry as GeoJSON.Point).coordinates as LngLat, look.img, look.color);
      return;
    }
    const layers = ["day-ends", "days-hit"].filter((l) => this.map.getLayer(l));
    const f = this.map.queryRenderedFeatures([[point.x - 12, point.y - 12], [point.x + 12, point.y + 12]], { layers })[0];
    if (f?.properties?.n) { this.cb.onDay(Number(f.properties.n)); return; }
    this.cb.onEmptyTap?.();
  }

  /** A place answers: its badge pops above the others and a ring in its colour ripples out from it. */
  private popAt(c: LngLat, img: string, color: string) {
    const m = this.map;
    const src = this.src("pop");
    if (!src || !m.getLayer("pop-icon") || reduceMotion()) return;
    this.lastPop = performance.now();
    src.setData({ type: "Feature", properties: { img, c: color }, geometry: { type: "Point", coordinates: c } });
    const t0 = performance.now(), gen = ++this.popGen;
    const frame = (now: number) => {
      if (gen !== this.popGen || !m.getLayer("pop-icon")) return;
      const k = Math.min(1, (now - t0) / 560);
      // badge: up to 1.5x and back, with a small bounce; ring: grows and fades
      const size = 1 + 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.25)) * (1 - k * 0.4);
      m.setLayoutProperty("pop-icon", "icon-size", Math.max(1, size));
      m.setPaintProperty("pop-ripple", "circle-radius", 12 + 32 * k);
      m.setPaintProperty("pop-ripple", "circle-stroke-opacity", 0.95 * (1 - k));
      if (k < 1) requestAnimationFrame(frame);
      else src.setData(empty);
    };
    requestAnimationFrame(frame);
  }
  private lastPop = 0;
  private popGen = 0;

  // ------------------------------------------------------------- selection & camera
  /**
   * How much of the map the sheet or panel covers. Changing it never moves the picture (the sheet sliding
   * must not drag the map along, as in Apple Maps): only the next flight frames things in the free part.
   */
  setPadding(p: Partial<Padding>) {
    this.padding = { ...this.padding, ...p };
    if (this.replaying) return;
    // in someone's hand or on a flight: apply it, still in place, once the map is free again
    if (this.gesturing || this.map.isEasing()) { this.pendingPadding = this.padding; return; }
    this.paddingInPlace(this.padding);
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
    const fresh = !!day && day.id !== this.selected?.id;
    this.selected = day;
    if (fresh && !reduceMotion()) {
      // the day's stretch lights up from where he started that morning, while the camera flies there
      const gen = ++this.selGen;
      this.selDraw = 0;
      let t0 = 0;
      const frame = (now: number) => {
        if (gen !== this.selGen) return;
        if (!t0) t0 = now + 350;
        const t = Math.max(0, Math.min(1, (now - t0) / 1100));
        this.selDraw = t < 1 ? easeInOut(t) : null;
        this.pushSelected();
        if (t < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    } else if (!day) { this.selGen++; this.selDraw = null; }
    if (this.src("route")) this.pushData();
  }

  flyToDay(day: Day, route: Route) {
    this.cameraClaimed = true;
    this.flightToken++;
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
      padding: this.padding, duration: reduceMotion() ? 0 : 1700, curve: 1.2, essential: true,
    });
  }

  /** Frame a set of places (search results). */
  fitPlaces(cs: LngLat[]) {
    this.cameraClaimed = true;
    this.flightToken++;
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
    this.flyAndCentre({ center: c, zoom, pitch, padding: this.padding, duration: reduceMotion() ? 0 : 1500, curve: 1.2, essential: true }, c);
  }

  /** Close-up on a place, looking along the trail (peaks from a little further, to see the mountain). */
  flyToPlace(c: LngLat, route: Route, km: number | null, kind?: string) {
    this.cameraClaimed = true;
    const brg = km !== null ? route.bearingAt(km, 3) : this.map.getBearing();
    const zoom = kind === "peak" ? 12.4 : kind === "town" ? 12.6 : kind === "gap" ? 11.2 : kind === "pass" ? 13 : 13.4;
    const look = kindLook(kind);
    this.flyAndCentre({ center: c, zoom, pitch: kind === "peak" ? 64 : 58, bearing: brg, padding: this.padding, duration: reduceMotion() ? 0 : 1600, curve: 1.2, essential: true }, c,
      () => { if (performance.now() - this.lastPop > 2500) this.popAt(c, look.img, look.color); });
  }

  /** a newer flight, or the person's hand, makes a pending re-centring obsolete */
  private flightToken = 0;

  /**
   * Fly, then make sure the target really is in the middle. In 3D the relief at the destination often
   * arrives after the camera does; MapLibre then keeps the camera where it is and the place drifts up
   * the screen (by a lot for a hut at 1 500 m). Once the relief is there, a short glide puts it back.
   */
  private flyAndCentre(opts: maplibregl.FlyToOptions, target: LngLat, arrived?: () => void) {
    const m = this.map;
    const token = ++this.flightToken;
    const check = () => {
      if (token !== this.flightToken || this.gesturing || this.replaying || m.isMoving()) return;
      let p: maplibregl.Point;
      try { p = m.project(target); } catch (_) { return; }
      const el = m.getContainer(), pad = this.padding;
      const cx = (pad.left + el.clientWidth - pad.right) / 2, cy = (pad.top + el.clientHeight - pad.bottom) / 2;
      if (Math.hypot(p.x - cx, p.y - cy) > 24) m.easeTo({ center: target, padding: this.padding, duration: reduceMotion() ? 0 : 800, essential: true });
    };
    this.moveThen(() => m.flyTo(opts), () => {
      if (token !== this.flightToken) return;
      arrived?.();
      let done = false;
      const once = () => { if (!done) { done = true; check(); } };
      m.once("idle", once);
      window.setTimeout(once, 3000);
    });
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
    this.flightToken++;
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
   * "What Ewan sees": a drone just over his shoulder (a few hundred metres behind and above him), looking
   * down the trail towards the horizon, him in the lower part of the picture. Any lower and the near ground
   * fills the screen. First a normal approach, so the relief there is loaded, then the descent. Touching the
   * map on the way cancels the descent; once there, the view is the person's to look around.
   */
  eyeLevel(at: LngLat, brg: number, groundM: number | null): () => void {
    this.stopShow();
    this.cameraClaimed = true;
    this.flightToken++;
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
      // far and high enough that he stays in the frame above the panel, low enough to see the horizon
      const behind = destination(at, (brg + 180) % 360, 800);
      const ground = (p: LngLat) => {
        const g = m.queryTerrainElevation(p);
        return g !== null && g > 1 ? g : (groundM ?? 0) * ex;
      };
      // 250 m up and 800 m back: the line of sight to him is ~17° down, about 3° under the middle of the
      // picture, so he stays in frame even above the phone's panel, and the horizon is still in view
      const alt = Math.max(ground(behind), ground(at), ground(destination(at, brg, 400))) + 250;
      let cam: maplibregl.CameraOptions = { center: destination(at, brg, 900), zoom: 14.2, pitch: 76, bearing: brg };
      try {
        // keep only what the animation understands: an undefined `roll` would turn the matrices into NaN
        const c = m.calculateCameraOptionsFromCameraLngLatAltRotation(behind, alt, brg, 76);
        if (c.center && Number.isFinite(c.zoom)) cam = { center: c.center, zoom: c.zoom, pitch: 76, bearing: brg };
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
    this.flightToken++;
    const lines = route.parts.map((p) => Array.from(p.lng, (x, i) => [x, p.lat[i]] as LngLat));
    const b = route.bounds(lines)!;
    try {
      this.map.fitBounds(b, { padding: 30, pitch: 0, bearing: 0, duration: reduceMotion() ? 0 : 1600, maxZoom: 7.5 });
    } catch (_) {
      this.map.jumpTo({ center: [171.2, -43.9], zoom: 5.2, pitch: 0, bearing: 0 });
    }
  }

  /**
   * The presentation's backdrop: the whole island at night, the camera swaying slowly over it, and a light running
   * the trail from Ship Cove to Bluff, again and again. Returns the stop function.
   */
  introLoop(route: Route, pad: Padding): () => void {
    const m = this.map;
    const lines = route.parts.map((p) => Array.from(p.lng, (x, i) => [x, p.lat[i]] as LngLat));
    const b = route.bounds(lines);
    // The island as everyone knows it (north up), tilted a little so the Alps stand out. The whole trail must
    // fit the free part of the screen as it will really be drawn (tilted, on the relief): place it, measure
    // where it lands on screen, correct, twice.
    const el = m.getContainer();
    const pts: LngLat[] = [];
    for (let k = 0; k <= route.total; k += 12) pts.push(route.pointAt(k));
    pts.push(route.pointAt(route.total));
    let center: LngLat = [171.2, -43.85], zoom = 5.2;
    const PITCH = 38;
    try {
      m.jumpTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, bearing: 0, pitch: 0 });
      const mid = b ? m.cameraForBounds(b, { padding: 6 }) : undefined;
      const fit = b ? m.cameraForBounds(b, { padding: { top: pad.top + 10, bottom: pad.bottom + 10, left: pad.left + 10, right: pad.right + 10 } }) : undefined;
      if (mid?.center && fit && Number.isFinite(fit.zoom)) { center = maplibregl.LngLat.convert(mid.center).toArray() as LngLat; zoom = fit.zoom!; }
      const boxW = el.clientWidth - pad.left - pad.right, boxH = el.clientHeight - pad.top - pad.bottom;
      for (let i = 0; i < 3; i++) {
        m.jumpTo({ center, zoom, bearing: 0, pitch: PITCH, padding: pad });
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of pts) { const q = m.project(p); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        if (!Number.isFinite(x0) || x1 - x0 < 1 || y1 - y0 < 1) break;
        // the trail's middle on screen becomes the middle of the free part, at the zoom where it fits (with room for the sway)
        center = m.unproject([(x0 + x1) / 2, (y0 + y1) / 2]).toArray() as LngLat;
        zoom += Math.log2(Math.min(boxW / (x1 - x0), boxH / (y1 - y0)) * 0.9);
      }
    } catch (_) { /* keep the defaults */ }
    this.replaying = true; // no photo markers, no re-framing while it sways
    const view = (t: number) => ({
      center, padding: pad,
      bearing: 7 * Math.sin((2 * Math.PI * t) / 40),
      pitch: PITCH + 6 * Math.sin((2 * Math.PI * t) / 55 + 1.2),
      zoom: zoom + 0.08 * Math.sin((2 * Math.PI * t) / 47 + 0.4),
    });
    const clear = () => { this.src("comet")?.setData(empty); this.src("comet-head")?.setData(empty); };
    // The map's credits open by themselves until the map is first moved, which won't happen under the
    // presentation: keep them to their (i), unless someone taps it.
    const attrib = m.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
    let asked = false;
    const ask = () => { asked = true; };
    const fold = () => { if (!asked && attrib?.classList.contains("maplibregl-compact-show")) attrib.classList.remove("maplibregl-compact-show"); };
    attrib?.addEventListener("pointerdown", ask, true);
    const watch = attrib ? new MutationObserver(fold) : null;
    if (attrib) watch!.observe(attrib, { attributes: true, attributeFilter: ["class"] });
    fold();
    const done = () => {
      this.replaying = false;
      clear();
      watch?.disconnect();
      attrib?.removeEventListener("pointerdown", ask, true);
    };
    if (reduceMotion()) {
      m.jumpTo(view(0));
      return done;
    }
    const total = route.total, RUN = 9000, PAUSE = 1600, TAIL = 110;
    let raf = 0, stopped = false, t0 = 0;
    const frame = (now: number) => {
      if (stopped) return;
      if (!t0) t0 = now;
      const t = now - t0;
      m.jumpTo(view(t / 1000));
      const k = Math.min(1, (t % (RUN + PAUSE)) / RUN);
      if (k >= 1) clear();
      else {
        const km = total * easeInOut(k);
        this.src("comet")?.setData(multi(route.slice(Math.max(0, km - TAIL), km)));
        this.src("comet-head")?.setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: route.pointAt(km) } });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      done();
    };
  }

  /** The presentation is shown again: Ewan's trail and marker wait for the arrival once more. */
  resetArrival() {
    this.drawGen++;
    this.drawKm = 0;
    this.pushWalked();
    this.liveMarker?.getElement().classList.add("is-arriving");
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
    this.flightToken++;
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
