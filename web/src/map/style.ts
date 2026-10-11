// Map styles. "explore": a light topographic map in the spirit of Apple Maps' hiking maps (soft land cover,
// colour relief by altitude, shaded relief, contour lines, 3D terrain), with a night variant.
// "satellite": aerial imagery with the same relief and the place names on top.
import type { SkySpecification, StyleSpecification } from "maplibre-gl";
import { OFFLINE_MAP } from "../config";
import { demFor } from "./dem";

export type BaseStyle = "explore" | "satellite";

export interface StyleOptions {
  dark: boolean;
  linzKey?: string | null;
  land?: GeoJSON.Feature;
  contours?: boolean;
  /** relief lit from the actual sun (azimuth/altitude in degrees), or the classic north-west light */
  sun?: { azimuth: number; altitude: number } | null;
  sky?: { sky: string; horizon: string; fog: string } | null;
}

const OFM = "https://tiles.openfreemap.org/planet";
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const FONT = { regular: ["Noto Sans Regular"], bold: ["Noto Sans Bold"], italic: ["Noto Sans Italic"] };
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ESRI_ATTR = '<a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics';
const TA_ATTR = 'Tracé <a href="https://www.teararoa.org.nz/trail-maps/" target="_blank" rel="noopener">Te Araroa Trust</a> CC BY 4.0';
const OSM_ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const LINZ_ATTR = '<a href="https://www.linz.govt.nz/products-services/data/linz-basemaps/data-attribution" target="_blank" rel="noopener">© Toitū Te Whenua LINZ</a> CC BY 4.0';

type Palette = {
  land: string; relief: [number, string][]; reliefOpacity: number;
  wood: string; woodOpacity: number; grass: string; ice: string; iceLine: string; rock: string; sand: string; wetland: string;
  parkFill: string; parkLine: string; parkLabel: string;
  shadow: string; highlight: string; accent: string; hsExaggeration: number;
  contour: string; contourMajor: string; contourLabel: string;
  water: string; waterway: string; waterLabel: string;
  road: string; roadCasing: string; roadMajor: string; roadMajorCasing: string; path: string; building: string;
  label: string; labelMinor: string; halo: string;
};

const LIGHT: Palette = {
  land: "#f2f1ec",
  relief: [[-50, "#f2f1ec"], [0, "#eef1e7"], [250, "#ebefe2"], [600, "#e7e9da"], [1000, "#e5e2d3"], [1500, "#e4ddd2"], [1900, "#e7e3de"], [2300, "#f0eff0"], [2800, "#fafbfc"], [3400, "#ffffff"]],
  reliefOpacity: 1,
  wood: "#c9e0b7", woodOpacity: 0.62, grass: "#e2ecd4", ice: "#fbfdff", iceLine: "#cfe1f0", rock: "#e4e1db", sand: "#f0e9d8", wetland: "#d3e6dc",
  parkFill: "rgba(96, 160, 72, 0.07)", parkLine: "rgba(76, 140, 56, 0.38)", parkLabel: "#3f7a2c",
  shadow: "#465567", highlight: "#ffffff", accent: "#55606c", hsExaggeration: 0.44,
  contour: "rgba(118, 98, 72, 0.2)", contourMajor: "rgba(118, 98, 72, 0.4)", contourLabel: "#8a7558",
  water: "#a8d0ee", waterway: "#95c4e8", waterLabel: "#3a73a3",
  road: "#ffffff", roadCasing: "#d6d4cc", roadMajor: "#fffdf7", roadMajorCasing: "#cdc6b4", path: "#9a8b76", building: "#e6e3dd",
  label: "#26292e", labelMinor: "#5b6168", halo: "rgba(255, 255, 255, 0.92)",
};

const DARK: Palette = {
  land: "#1b1e22",
  relief: [[-50, "#1b1e22"], [0, "#1d2125"], [500, "#212528"], [1000, "#26292b"], [1500, "#2c2e30"], [2000, "#333538"], [2500, "#3d4043"], [3200, "#4b4f54"]],
  reliefOpacity: 1,
  wood: "#1d2b21", woodOpacity: 0.85, grass: "#1f2622", ice: "#3a4047", iceLine: "#4b5560", rock: "#28292a", sand: "#2d2a25", wetland: "#1d2927",
  parkFill: "rgba(90, 150, 80, 0.06)", parkLine: "rgba(120, 180, 100, 0.28)", parkLabel: "#8dbd79",
  shadow: "#000000", highlight: "#59636d", accent: "#000000", hsExaggeration: 0.6,
  contour: "rgba(210, 200, 180, 0.1)", contourMajor: "rgba(210, 200, 180, 0.22)", contourLabel: "#9b927f",
  water: "#0f2a3e", waterway: "#1c4767", waterLabel: "#6ea6cf",
  road: "#3a3f46", roadCasing: "#272b30", roadMajor: "#464b52", roadMajorCasing: "#2b2f35", path: "#7c7366", building: "#2a2d31",
  label: "#e2e6eb", labelMinor: "#a7aeb6", halo: "rgba(14, 16, 19, 0.88)",
};

export const SKY_DAY = { sky: "#86b8ea", horizon: "#e7eef6", fog: "#edf1f5" };
export const SKY_NIGHT = { sky: "#0b1322", horizon: "#22324a", fog: "#1a2433" };
export function sky(s: { sky: string; horizon: string; fog: string }): SkySpecification {
  return {
    "sky-color": s.sky, "horizon-color": s.horizon, "fog-color": s.fog,
    "fog-ground-blend": 0.3, "horizon-fog-blend": 0.55, "sky-horizon-blend": 0.65,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.8, 9, 0],
  } as unknown as SkySpecification;
}

const z = (stops: [number, number][]) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()] as unknown as number;
const name = ["coalesce", ["get", "name:latin"], ["get", "name"]];

function hillshade(p: Palette, o: StyleOptions, satellite: boolean) {
  const sun = o.sun;
  // the real sun, kept a little above the horizon so slopes never vanish in flat light
  const direction = sun ? sun.azimuth : 315;
  const altitude = sun ? Math.max(18, Math.min(60, sun.altitude)) : 45;
  return {
    id: "hillshade", type: "hillshade", source: "dem-hs",
    paint: {
      "hillshade-method": "igor",
      "hillshade-illumination-anchor": sun ? "map" : "viewport",
      "hillshade-illumination-direction": direction,
      "hillshade-illumination-altitude": altitude,
      "hillshade-exaggeration": satellite ? 0.32 : p.hsExaggeration,
      "hillshade-shadow-color": satellite ? "rgba(0,0,0,0.6)" : p.shadow,
      "hillshade-highlight-color": satellite ? "rgba(255,255,255,0.18)" : p.highlight,
      "hillshade-accent-color": p.accent,
    },
  };
}

function labelLayers(p: Palette, satellite: boolean) {
  const text = satellite ? "#ffffff" : p.label;
  const halo = satellite ? "rgba(0,0,0,0.65)" : p.halo;
  return [
    {
      id: "water-name", type: "symbol", source: "ofm", "source-layer": "water_name", minzoom: 8,
      filter: ["match", ["get", "class"], ["lake", "bay", "sea", "ocean", "strait", "lagoon", "reservoir"], true, false],
      layout: { "text-field": name, "text-font": FONT.italic, "text-size": z([[8, 11], [13, 14]]), "text-letter-spacing": 0.04, "text-max-width": 7, "symbol-sort-key": ["get", "rank"] },
      paint: { "text-color": satellite ? "#d8ecff" : p.waterLabel, "text-halo-color": halo, "text-halo-width": satellite ? 1.2 : 0.8 },
    },
    {
      id: "park-name", type: "symbol", source: "ofm", "source-layer": "park", minzoom: 8.5,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["match", ["get", "class"], ["national_park", "nature_reserve", "protected_area"], true, false]],
      layout: { "text-field": name, "text-font": FONT.bold, "text-size": z([[8.5, 11], [12, 13]]), "text-max-width": 8, "text-letter-spacing": 0.02 },
      paint: { "text-color": satellite ? "#e4f5d6" : p.parkLabel, "text-halo-color": halo, "text-halo-width": 1.2, "text-opacity": 0.95 },
    },
    {
      id: "place-minor", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 10.5,
      filter: ["match", ["get", "class"], ["hamlet", "locality", "isolated_dwelling", "suburb", "neighbourhood", "island"], true, false],
      layout: { "text-field": name, "text-font": FONT.regular, "text-size": z([[10.5, 11], [14, 13]]), "text-max-width": 8 },
      paint: { "text-color": satellite ? "#f1f3f5" : p.labelMinor, "text-halo-color": halo, "text-halo-width": 1.3 },
    },
    {
      id: "place-village", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 8.5,
      filter: ["==", ["get", "class"], "village"],
      layout: { "text-field": name, "text-font": FONT.bold, "text-size": z([[8.5, 11.5], [13, 14]]), "text-max-width": 8 },
      paint: { "text-color": text, "text-halo-color": halo, "text-halo-width": 1.4 },
    },
    {
      id: "place-town", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 6.5,
      filter: ["match", ["get", "class"], ["town", "city"], true, false],
      layout: { "text-field": name, "text-font": FONT.bold, "text-size": z([[6.5, 12], [10, 15], [13, 17]]), "text-max-width": 8, "symbol-sort-key": ["get", "rank"] },
      paint: { "text-color": text, "text-halo-color": halo, "text-halo-width": 1.6 },
    },
  ];
}

function exploreLayers(p: Palette, o: StyleOptions) {
  const L: unknown[] = [
    { id: "background", type: "background", paint: { "background-color": p.land } },
    {
      id: "color-relief", type: "color-relief", source: "dem-hs",
      paint: { "color-relief-opacity": p.reliefOpacity, "color-relief-color": ["interpolate", ["linear"], ["elevation"], ...p.relief.flat()] },
    },
    { id: "landcover-grass", type: "fill", source: "ofm", "source-layer": "landcover", filter: ["match", ["get", "class"], ["grass", "farmland"], true, false], paint: { "fill-color": p.grass, "fill-opacity": 0.45 } },
    { id: "landcover-wood", type: "fill", source: "ofm", "source-layer": "landcover", filter: ["==", ["get", "class"], "wood"], paint: { "fill-color": p.wood, "fill-opacity": z([[6, p.woodOpacity * 0.8], [12, p.woodOpacity]]) } },
    { id: "landcover-wetland", type: "fill", source: "ofm", "source-layer": "landcover", filter: ["==", ["get", "class"], "wetland"], paint: { "fill-color": p.wetland, "fill-opacity": 0.6 } },
    { id: "landcover-sand", type: "fill", source: "ofm", "source-layer": "landcover", filter: ["==", ["get", "class"], "sand"], paint: { "fill-color": p.sand, "fill-opacity": 0.7 } },
    { id: "landcover-rock", type: "fill", source: "ofm", "source-layer": "landcover", filter: ["==", ["get", "class"], "rock"], paint: { "fill-color": p.rock, "fill-opacity": 0.55 } },
    { id: "landcover-ice", type: "fill", source: "ofm", "source-layer": "landcover", filter: ["==", ["get", "class"], "ice"], paint: { "fill-color": p.ice, "fill-opacity": 0.92 } },
    { id: "park-fill", type: "fill", source: "ofm", "source-layer": "park", filter: ["match", ["get", "class"], ["national_park", "nature_reserve", "protected_area"], true, false], paint: { "fill-color": p.parkFill } },
    hillshade(p, o, false),
    { id: "ice-line", type: "line", source: "ofm", "source-layer": "landcover", minzoom: 9, filter: ["==", ["get", "class"], "ice"], paint: { "line-color": p.iceLine, "line-width": z([[9, 0.5], [14, 1.2]]) } },
    {
      id: "park-line", type: "line", source: "ofm", "source-layer": "park", minzoom: 7,
      filter: ["match", ["get", "class"], ["national_park"], true, false],
      paint: { "line-color": p.parkLine, "line-width": z([[7, 0.8], [12, 1.6]]), "line-dasharray": [3, 2] },
    },
  ];
  if (o.contours !== false) {
    L.push(
      { id: "contour", type: "line", source: "contours", "source-layer": "contours", minzoom: 11.5, filter: ["==", ["get", "level"], 0], paint: { "line-color": p.contour, "line-width": z([[11.5, 0.4], [14, 0.8]]), "line-opacity": z([[11.5, 0], [12.3, 1]]) } },
      { id: "contour-major", type: "line", source: "contours", "source-layer": "contours", minzoom: 10.5, filter: [">", ["get", "level"], 0], paint: { "line-color": p.contourMajor, "line-width": z([[10.5, 0.6], [14, 1.3]]), "line-opacity": z([[10.5, 0], [11.3, 1]]) } },
    );
  }
  L.push(
    { id: "water", type: "fill", source: "ofm", "source-layer": "water", filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": p.water } },
    {
      id: "waterway", type: "line", source: "ofm", "source-layer": "waterway", minzoom: 8,
      filter: ["match", ["get", "class"], ["river", "stream", "canal"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.waterway, "line-width": ["interpolate", ["linear"], ["zoom"], 8, ["match", ["get", "class"], "river", 0.9, 0.3], 14, ["match", ["get", "class"], "river", 3.5, 1.2]] },
    },
    { id: "building", type: "fill", source: "ofm", "source-layer": "building", minzoom: 14, paint: { "fill-color": p.building, "fill-opacity": 0.9 } },
    {
      id: "path", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 12,
      filter: ["match", ["get", "class"], ["path", "track"], true, false],
      layout: { "line-cap": "round" },
      paint: { "line-color": p.path, "line-width": z([[12, 0.7], [16, 1.6]]), "line-dasharray": [2.5, 1.6], "line-opacity": 0.75 },
    },
    {
      id: "road-casing", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 7,
      filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "class"], ["motorway", "trunk", "primary"], p.roadMajorCasing, p.roadCasing],
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 1.6, 0], 12, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 5, ["secondary", "tertiary"], 3.6, 2.2], 16, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 14, ["secondary", "tertiary"], 10, 6]],
      },
    },
    {
      id: "road", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 7,
      filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "class"], ["motorway", "trunk", "primary"], p.roadMajor, p.road],
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 0.8, 0], 12, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 3.4, ["secondary", "tertiary"], 2.2, 1.1], 16, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 11, ["secondary", "tertiary"], 8, 4.5]],
      },
    },
  );
  if (o.contours !== false) {
    L.push({
      id: "contour-label", type: "symbol", source: "contours", "source-layer": "contours", minzoom: 12,
      filter: [">", ["get", "level"], 0],
      layout: { "symbol-placement": "line", "text-field": ["concat", ["number-format", ["get", "ele"], {}], " m"], "text-font": FONT.regular, "text-size": 10, "symbol-spacing": 320, "text-padding": 4 },
      paint: { "text-color": p.contourLabel, "text-halo-color": p.halo, "text-halo-width": 1.2 },
    });
  }
  L.push(...labelLayers(p, false));
  return L;
}

function satelliteLayers(o: StyleOptions) {
  return [
    { id: "background", type: "background", paint: { "background-color": o.dark ? "#1b2128" : "#dfe7ec" } },
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-fade-duration": 250, "raster-saturation": -0.06, "raster-contrast": 0.05, "raster-brightness-max": 0.97 } },
    hillshade(LIGHT, o, true),
    ...labelLayers(o.dark ? DARK : LIGHT, true),
  ];
}

export function buildStyle(base: BaseStyle, opts: StyleOptions): StyleSpecification {
  if (OFFLINE_MAP) return offlineStyle(opts.land, opts.dark);
  const dem = demFor(opts.linzKey);
  const linz = opts.linzKey?.trim();
  const p = opts.dark ? DARK : LIGHT;
  const imagery = linz
    ? { tiles: [`https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.webp?api=${linz}`], maxzoom: 19, attribution: LINZ_ATTR }
    : { tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], maxzoom: 18, attribution: ESRI_ATTR };
  const demSource = { type: "raster-dem", tiles: [dem.tiles], tileSize: 256, maxzoom: dem.maxzoom, encoding: dem.encoding };
  return {
    version: 8,
    projection: { type: "globe" },
    glyphs: GLYPHS,
    sources: {
      ofm: { type: "vector", url: OFM, attribution: `${OSM_ATTR} · ${TA_ATTR}` },
      dem: { ...demSource, attribution: dem.attribution },
      "dem-hs": demSource,
      contours: { type: "vector", tiles: [dem.contours], maxzoom: 15 },
      ...(base === "satellite" ? { imagery: { type: "raster", tileSize: 256, ...imagery } } : {}),
    },
    layers: base === "satellite" ? satelliteLayers(opts) : exploreLayers(p, opts),
    terrain: { source: "dem", exaggeration: 1.3 },
    sky: sky(opts.sky ?? (opts.dark ? SKY_NIGHT : SKY_DAY)),
  } as unknown as StyleSpecification;
}

/** Vector-only style used in development when tile servers are unreachable. */
function offlineStyle(land: GeoJSON.Feature | undefined, dark: boolean): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    glyphs: "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/{fontstack}/{range}.pbf",
    sources: { land: { type: "geojson", data: land ?? { type: "FeatureCollection", features: [] } } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": dark ? "#0f2a3e" : "#a8d0ee" } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": dark ? "#1b1e22" : "#eef1e7" } },
      { id: "land-edge", type: "line", source: "land", paint: { "line-color": dark ? "#2a3440" : "#ffffff", "line-width": 1, "line-opacity": 0.8 } },
    ],
    sky: sky(dark ? SKY_NIGHT : SKY_DAY),
  } as unknown as StyleSpecification;
}

export const OFFLINE_FONT = { regular: ["Noto Sans Regular"], bold: ["Noto Sans Medium"], italic: ["Noto Sans Italic"] };
