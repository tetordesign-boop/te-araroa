// Map styles. "explore": a topographic map in the spirit of Apple Maps' hiking maps (land cover, colour relief by
// altitude, shaded relief, contour lines, 3D terrain). The site draws it at night, "Mackenzie night": navy land,
// relief lit like by the moon, glacier lakes glowing turquoise; the light version stays for the Carnet.
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
  wood: string; woodOpacity: number; grass: string; ice: string; iceOpacity: number; iceLine: string; rock: string; sand: string; wetland: string;
  parkFill: string; parkLine: string; parkLabel: string;
  shadow: string; highlight: string; accent: string; hsExaggeration: number;
  contour: string; contourMajor: string; contourLabel: string;
  water: string; ocean: string; waterEdge: string; waterEdgeOpacity: number; waterway: string; waterLabel: string;
  road: string; roadCasing: string; roadMajor: string; roadMajorCasing: string; path: string; building: string;
  label: string; labelMinor: string; halo: string;
};

const LIGHT: Palette = {
  land: "#f2f1ec",
  relief: [[-50, "#f2f1ec"], [0, "#eef1e7"], [250, "#ebefe2"], [600, "#e7e9da"], [1000, "#e5e2d3"], [1500, "#e4ddd2"], [1900, "#e7e3de"], [2300, "#f0eff0"], [2800, "#fafbfc"], [3400, "#ffffff"]],
  reliefOpacity: 1,
  wood: "#c9e0b7", woodOpacity: 0.62, grass: "#e2ecd4", ice: "#fbfdff", iceOpacity: 0.92, iceLine: "#cfe1f0", rock: "#e4e1db", sand: "#f0e9d8", wetland: "#d3e6dc",
  parkFill: "rgba(96, 160, 72, 0.07)", parkLine: "rgba(76, 140, 56, 0.38)", parkLabel: "#3f7a2c",
  shadow: "#465567", highlight: "#ffffff", accent: "#55606c", hsExaggeration: 0.44,
  contour: "rgba(118, 98, 72, 0.2)", contourMajor: "rgba(118, 98, 72, 0.4)", contourLabel: "#8a7558",
  water: "#a8d0ee", ocean: "#a8d0ee", waterEdge: "#8fc0e6", waterEdgeOpacity: 0, waterway: "#95c4e8", waterLabel: "#3a73a3",
  road: "#ffffff", roadCasing: "#d6d4cc", roadMajor: "#fffdf7", roadMajorCasing: "#cdc6b4", path: "#9a8b76", building: "#e6e3dd",
  label: "#26292e", labelMinor: "#5b6168", halo: "rgba(255, 255, 255, 0.92)",
};

/** "Mackenzie night": the dark-sky reserve over Tekapo. Higher ground is lighter, like snow under the moon. */
const DARK: Palette = {
  land: "#0F1A2C",
  relief: [[-50, "#0E192A"], [0, "#0F1B2E"], [300, "#112136"], [700, "#15283F"], [1200, "#1B314C"], [1700, "#253C5A"], [2200, "#344D6D"], [2700, "#4A6586"], [3400, "#6F8AAD"]],
  reliefOpacity: 1,
  wood: "#0E2B2E", woodOpacity: 0.78, grass: "#13243A", ice: "#BCD3F0", iceOpacity: 0.5, iceLine: "#86ACD9", rock: "#1F2C40", sand: "#2A2E36", wetland: "#0F2830",
  parkFill: "rgba(70, 210, 170, 0.035)", parkLine: "rgba(80, 215, 175, 0.32)", parkLabel: "#6FD6B5",
  shadow: "#01040B", highlight: "#7E9FCC", accent: "#000000", hsExaggeration: 0.62,
  contour: "rgba(125, 165, 220, 0.12)", contourMajor: "rgba(125, 165, 220, 0.27)", contourLabel: "#7F96B8",
  // the glacier lakes (Tekapo, Pukaki, Ōhau, Wānaka...) glow; the sea stays the darkest thing on the map
  water: "#0D7487", ocean: "#060D19", waterEdge: "#5CD6E6", waterEdgeOpacity: 0.75, waterway: "#2AA9BE", waterLabel: "#83E0EC",
  road: "#22314B", roadCasing: "#0A1220", roadMajor: "#34486B", roadMajorCasing: "#0A1220", path: "#7489AC", building: "#1A263B",
  label: "#E9EFF8", labelMinor: "#9DADC6", halo: "rgba(6, 12, 24, 0.86)",
};

export const SKY_DAY = { sky: "#86b8ea", horizon: "#e7eef6", fog: "#edf1f5" };
export const SKY_NIGHT = { sky: "#040A17", horizon: "#1B3560", fog: "#0C1829" };
export function sky(s: { sky: string; horizon: string; fog: string }): SkySpecification {
  return {
    "sky-color": s.sky, "horizon-color": s.horizon, "fog-color": s.fog,
    "fog-ground-blend": 0.3, "horizon-fog-blend": 0.55, "sky-horizon-blend": 0.65,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.8, 9, 0],
  } as unknown as SkySpecification;
}

const z = (stops: [number, number][]) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()] as unknown as number;
const name = ["coalesce", ["get", "name:latin"], ["get", "name"]];

/**
 * Shading colours: the palette's, or the light of the hour when the relief follows the real sun
 * (warm slopes and violet shadows when the sun is low, blue at dusk).
 */
export function shadeColors(dark: boolean, satellite: boolean, sunAltitude: number | null) {
  const p = dark ? DARK : LIGHT;
  if (satellite) return { shadow: "rgba(0,0,0,0.6)", highlight: sunAltitude !== null && sunAltitude < 10 ? "rgba(255,214,160,0.22)" : "rgba(255,255,255,0.18)" };
  if (dark) {
    // the night map keeps its colours; only the light on the slopes changes with the hour
    if (sunAltitude === null || sunAltitude < -6) return { shadow: p.shadow, highlight: p.highlight };
    if (sunAltitude < 0) return { shadow: p.shadow, highlight: "#8E88C9" };
    if (sunAltitude < 10) return { shadow: p.shadow, highlight: "#E3A274" };
    return { shadow: p.shadow, highlight: "#A3BEE3" };
  }
  if (sunAltitude === null) return { shadow: p.shadow, highlight: p.highlight };
  if (sunAltitude < 0) return { shadow: "#2b3352", highlight: "#e4e9ff" };
  if (sunAltitude < 10) return { shadow: "#4d3f63", highlight: "#fff0d4" };
  return { shadow: p.shadow, highlight: p.highlight };
}

/** Where the light comes from: the real sun, kept a little above the horizon so slopes never vanish. */
export function sunLight(sun: { azimuth: number; altitude: number } | null | undefined) {
  return sun
    ? { anchor: "map" as const, direction: sun.azimuth, altitude: Math.max(18, Math.min(60, sun.altitude)) }
    : { anchor: "viewport" as const, direction: 315, altitude: 45 };
}

function hillshade(p: Palette, o: StyleOptions, satellite: boolean) {
  const light = sunLight(o.sun);
  const tint = shadeColors(o.dark, satellite, o.sun?.altitude ?? null);
  return {
    id: "hillshade", type: "hillshade", source: "dem-hs",
    paint: {
      "hillshade-method": "igor",
      "hillshade-illumination-anchor": light.anchor,
      "hillshade-illumination-direction": light.direction,
      "hillshade-illumination-altitude": light.altitude,
      "hillshade-exaggeration": satellite ? 0.32 : p.hsExaggeration,
      "hillshade-shadow-color": tint.shadow,
      "hillshade-highlight-color": tint.highlight,
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
    { id: "landcover-ice", type: "fill", source: "ofm", "source-layer": "landcover", filter: ["==", ["get", "class"], "ice"], paint: { "fill-color": p.ice, "fill-opacity": p.iceOpacity } },
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
    { id: "water", type: "fill", source: "ofm", "source-layer": "water", filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": ["match", ["get", "class"], "ocean", p.ocean, p.water] } },
    {
      id: "water-edge", type: "line", source: "ofm", "source-layer": "water", minzoom: 6,
      filter: ["all", ["!=", ["get", "brunnel"], "tunnel"], ["match", ["get", "class"], ["lake", "river"], true, false]],
      paint: { "line-color": p.waterEdge, "line-width": z([[6, 0.4], [10, 0.9], [14, 1.6]]), "line-opacity": p.waterEdgeOpacity, "line-blur": 0.4 },
    },
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
    { id: "background", type: "background", paint: { "background-color": o.dark ? "#0C1526" : "#dfe7ec" } },
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
      { id: "background", type: "background", paint: { "background-color": dark ? "#060D19" : "#a8d0ee" } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": dark ? "#0F1B2E" : "#eef1e7" } },
      { id: "land-edge", type: "line", source: "land", paint: { "line-color": dark ? "#5CD6E6" : "#ffffff", "line-width": 1, "line-opacity": dark ? 0.35 : 0.8 } },
    ],
    sky: sky(dark ? SKY_NIGHT : SKY_DAY),
  } as unknown as StyleSpecification;
}

export const OFFLINE_FONT = { regular: ["Noto Sans Regular"], bold: ["Noto Sans Medium"], italic: ["Noto Sans Italic"] };
